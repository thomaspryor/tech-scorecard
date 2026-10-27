#!/usr/bin/env node
// Daily refresh: find new reviews for products already on the site, and new launches.
// Candidate review URLs come from the outlets' own RSS feeds (headlines naming a product on the site)
// and from Gemini with Google Search grounding, which only FINDS URLs. Everything
// that reaches data/ is read from the outlet's own page: rating, critic and date come from
// the page's JSON-LD, and the quote must appear word for word in the page text.
// refresh-pipeline.sh then runs verify-quotes.py and score-reviews.js. Each import file is applied
// on its own, so one bad file is rejected without losing the rest of the run; anything that went
// wrong is listed in .cache/refresh/problems.txt and the workflow alerts on it after committing.
//
// Usage: node scripts/refresh.js [--max-products=15] [--max-new=2] [--only=id,id] [--no-launches] [--no-feeds] [--dry-run]
// Needs GEMINI_API_KEY (search + excerpt picking) and OPENAI_API_KEY (copy for new products).
// Writes files in .cache/refresh/ in the import-product.js shapes and imports them unless --dry-run.
const fs = require('fs');
const path = require('path');
const { DATA_DIR, loadData, loadCategories, writeData } = require('./lib/data-files');
const { importEach } = require('./lib/import');
const { productCopyViolations } = require('./lib/copy-voice');
const {
  MIN_REVIEWS_NEW_PRODUCT,
  LAUNCH_WINDOW_DAYS,
  isRenamedDuplicate,
  knownProduct,
  sharedReviewUrls,
} = require('./lib/launches');
const { UA, curl, fetchPage, fetchPageAsync, pageText, containsQuote, jsonLd, hostOf } = require('./lib/page');
const { parseFeed, sortFeedItems, matchProduct } = require('./lib/feeds');
const { openaiText, geminiText, parseJsonReply } = require('./lib/models');

/** @typedef {import('../src/lib/data-types').Product} Product */
/** @typedef {import('../src/lib/data-types').Review} Review */
/** @typedef {import('../src/lib/data-types').Category} Category */
/** The fields of a product (or a launch candidate) a review search needs. */
/** @typedef {Pick<Product, 'id' | 'name' | 'brand' | 'releaseDate'>} ProductRef */
/** @typedef {{review: Review, skip?: undefined} | {skip: string, review?: undefined}} BuildResult */

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '.cache', 'refresh');
const STATE_FILE = path.join(DATA_DIR, 'refresh-state.json');
const TODAY = new Date().toISOString().slice(0, 10);
/** More failed product searches than this share of the queue is reported as a problem, not just a warning. */
const MAX_FAILED_SHARE = 1 / 3;
/** Feed headlines that name no product on the site, passed to the launch search as leads. */
const MAX_LEADS = 60;
/** Gemini answers (search grounding above all) can take minutes. */
const GEMINI_TIMEOUT_MS = 600_000;

/** @type {Record<string, string | true>} */
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const MAX_PRODUCTS = Number(args['max-products'] || 15);
const MAX_NEW = Number(args['max-new'] ?? 2);
const only = args.only ? new Set(String(args.only).split(',')) : null;

const CATEGORIES = /** @type {{categories: Category[], artKinds: string[]}} */ (loadCategories());
const { products, reviews, outlets } = loadData();
/** Product id -> date it was last checked (YYYY-MM-DD). @type {Record<string, string>} */
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};

/** Reviews usually publish a week or two before the on-sale date. @param {string} iso @param {number} n */
const daysBefore = (iso, n) => new Date(Date.parse(iso) - n * 864e5).toISOString().slice(0, 10);

/** @param {string} u */
const outletForUrl = (u) =>
  outlets.find((o) => [o.domain, ...(o.altDomains || [])].some((d) => hostOf(u) === d || hostOf(u).endsWith(`.${d}`)));

/**
 * Every outlet feed's recent review headlines: URLs for products on the site, and leads for new launches.
 * A feed that cannot be read is skipped; search still covers that outlet.
 */
async function readFeeds() {
  const urls = outlets.flatMap((o) => o.feeds || []);
  /** @type {{title: string, url: string, date: string}[]} */
  const items = [];
  for (let i = 0; i < urls.length; i += 16) {
    const xmls = await Promise.all(urls.slice(i, i + 16).map((u) => fetchPageAsync(u, 30)));
    for (const xml of xmls) if (xml) items.push(...parseFeed(xml));
  }
  const res = sortFeedItems(items, products, (u) => !!outletForUrl(u), TODAY);
  const tier = (/** @type {string} */ u) => outletForUrl(u)?.tier ?? 9;
  res.leads.sort((a, b) => tier(a.url) - tier(b.url) || b.date.localeCompare(a.date));
  const hits = [...res.byProduct.values()].flat().length;
  console.log(
    `feeds: ${items.length} items, ${hits} review(s) naming a product on the site, ${res.leads.length} other review(s)`,
  );
  return res;
}

/**
 * Ask Gemini (with Google Search) for review URLs for one product on outlets we know.
 * @param {ProductRef} product
 * @param {Set<string>} skipOutletIds
 * @returns {Promise<string[]>}
 */
async function findReviewUrls(product, skipOutletIds) {
  const list = outlets
    .filter((o) => !skipOutletIds.has(o.id))
    .map((o) => `${o.name} (${o.domain})`)
    .join(', ');
  const text = await geminiText(
    `Find professional written reviews of the ${product.name} (${product.brand}, on sale ${product.releaseDate}) on these outlets: ${list}.
Only full reviews with a verdict. Skip hands-on, first-look, news, comparison, video-only and roundup pages, and reviews of other models.
Search for them and return only URLs you actually saw in search results. Reply with a JSON array only: [{"url":"https://..."}]`,
    { search: true, timeoutMs: GEMINI_TIMEOUT_MS },
  );
  /** @type {{url?: unknown}[]} */
  const found = parseJsonReply(text, '[') || [];
  return found
    .map((x) => resolveRedirect(x.url))
    .filter(/** @returns {u is string} */ (u) => typeof u === 'string' && /^https:\/\//.test(u));
}

/**
 * Search grounding sometimes answers with vertexaisearch redirect links: follow them to the real page.
 * @param {unknown} u
 */
function resolveRedirect(u) {
  if (typeof u !== 'string' || !u.includes('grounding-api-redirect')) return u;
  try {
    return curl(['-o', '/dev/null', '-A', UA, '-w', '%{url_effective}', u], { timeout: 30 });
  } catch {
    return null;
  }
}

/**
 * Turn one candidate URL into a review object, or a reason to skip it.
 * @param {ProductRef} product
 * @param {string} url
 * @returns {Promise<BuildResult>}
 */
async function buildReview(product, url) {
  const outlet = outletForUrl(url);
  if (!outlet) return { skip: 'outlet not in data/outlets.json' };
  let html;
  try {
    html = fetchPage(url);
  } catch {
    return { skip: 'page not readable (blocked or missing)' };
  }
  const text = pageText(html);
  if (text.length < 1500) return { skip: 'page too short' };
  const ld = jsonLd(html);
  if (!ld.date || ld.date > TODAY || ld.date < daysBefore(product.releaseDate, 21))
    return { skip: `date ${ld.date || 'missing'} outside launch..today` };
  const answer = parseJsonReply(
    await geminiText(
      `You help a review aggregator. Product: ${product.name} (${product.brand}).
Decide whether the ARTICLE below is a full professional review of exactly this product with a final verdict (not hands-on, first impressions, news, a comparison or a review of a sibling model).
If it is, copy ONE complete sentence from the article that best sums up the reviewer's verdict, character for character (max 40 words, no ellipses, no edits).
Reply JSON only: {"fullReview": true|false, "excerpt": "<verbatim sentence or empty>"}

ARTICLE:
${text.slice(0, 30000)}`,
      { timeoutMs: GEMINI_TIMEOUT_MS },
    ),
  );
  if (!answer || !answer.fullReview) return { skip: 'not a full review of this product' };
  const excerpt = String(answer.excerpt || '').trim();
  const words = excerpt.split(/\s+/).length;
  if (!excerpt || words > 40 || words < 5) return { skip: 'no usable excerpt' };
  if (!containsQuote(text, excerpt)) return { skip: 'excerpt not found word for word' };
  return {
    review: {
      productId: product.id,
      outletId: outlet.id,
      critic: ld.critic || null,
      url,
      date: ld.date,
      rating: ld.rating || null,
      score: 70,
      scoreSource: ld.rating ? 'rating' : 'text',
      excerpt,
    },
  };
}

/**
 * New, verified reviews of `product` from outlets it has no review from yet.
 * @param {ProductRef} product
 * @param {Review[]} existing
 * @param {string[]} [feedUrls] pages from outlet feeds whose headline names the product
 * @param {boolean} [search] also ask Gemini to search for reviews
 */
async function collectReviews(product, existing, feedUrls = [], search = true) {
  const have = new Set(existing.map((r) => r.outletId));
  // Feed pages first: they are this product's reviews by headline, so they need no search to find.
  const urls = [...feedUrls, ...(search ? await findReviewUrls(product, have) : [])];
  /** @type {Review[]} */
  const out = [];
  for (const url of [...new Set(urls)]) {
    const outlet = outletForUrl(url);
    if (!outlet || have.has(outlet.id)) continue;
    const res = await buildReview(product, url);
    if (res.review) {
      out.push(res.review);
      have.add(outlet.id);
      console.log(`  + ${outlet.id} ${res.review.rating || 'unrated'}`);
    } else console.log(`  - ${url.slice(0, 90)}: ${res.skip}`);
  }
  return out;
}

/** The placeholder art a new launch gets, by category. @type {Record<Category, Product['art']['kind']>} */
const ART_KIND = {
  phone: 'phone',
  foldable: 'foldable',
  tablet: 'tablet',
  laptop: 'laptop',
  headphones: 'headphones',
  watch: 'watch',
  console: 'console',
  wearable: 'glasses',
};

/** @param {string} s */
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * geminiText, tried a second time when the first call fails (a search call occasionally times out on a busy runner).
 * @param {string} prompt
 * @param {{search?: boolean, timeoutMs?: number}} opts
 */
async function geminiTextRetry(prompt, opts) {
  try {
    return await geminiText(prompt, opts);
  } catch (e) {
    console.error(`  Gemini call failed (${e instanceof Error ? e.message.slice(0, 80) : e}), trying once more`);
    return geminiText(prompt, opts);
  }
}

/**
 * New launches: find them, collect reviews, and only keep products that reach the review minimum.
 * @param {{title: string, url: string}[]} leads recent review headlines from outlet feeds that name no product on the site
 * @returns {Promise<{product: Product, reviews: Review[], newOutlets: []}[]>}
 */
async function newLaunches(leads) {
  // Products already on the site are filtered out in code below, so the prompt stays short and the search fast.
  const headlines = leads
    .slice(0, MAX_LEADS)
    .map((l) => `- ${l.title} (${hostOf(l.url)})`)
    .join('\n');
  const text = await geminiTextRetry(
    `Today is ${TODAY}. Using search, list up to 6 consumer gadgets that went on sale in the US within the last ${LAUNCH_WINDOW_DAYS} days and already have several professional reviews from major tech outlets.
Categories allowed: ${CATEGORIES.categories.join(', ')}.${
      headlines
        ? `\nLeads: these review headlines appeared this fortnight on outlets we follow. A gadget several of them review is a strong candidate; confirm its facts with search. Ignore games, films, books and other products outside the categories.\n${headlines}`
        : ''
    }
Reply with a JSON array only: [{"name":"","brand":"","category":"","releaseDate":"YYYY-MM-DD","launchPrice":<USD number>,"officialUrl":"https://..."}]. Use only facts you saw in search results.`,
    { search: true, timeoutMs: GEMINI_TIMEOUT_MS },
  );
  /** @type {{name: string, brand: string, category: Category, releaseDate: string, launchPrice: number, officialUrl: string}[]} */
  const candidates = parseJsonReply(text, '[') || [];
  const found = candidates.filter(
    (c) =>
      c.name &&
      CATEGORIES.categories.includes(c.category) &&
      /^\d{4}-\d{2}-\d{2}$/.test(c.releaseDate) &&
      c.releaseDate <= TODAY &&
      c.releaseDate >= daysBefore(TODAY, LAUNCH_WINDOW_DAYS) &&
      Number.isFinite(c.launchPrice) &&
      /^https:\/\//.test(c.officialUrl || ''),
  );
  /** @type {{product: Product, reviews: Review[], newOutlets: []}[]} */
  const made = [];
  for (const c of found) {
    if (made.length >= MAX_NEW) break;
    const id = slug(c.name);
    const dup = knownProduct({ ...c, id }, [...products, ...made.map((m) => m.product)]);
    if (dup) {
      console.log(`launch candidate ${c.name}: already on the site as ${dup.id}`);
      continue;
    }
    console.log(`new launch candidate: ${c.name}`);
    try {
      curl(['-f', '-o', '/dev/null', '-A', UA, c.officialUrl]);
    } catch {
      console.log('  official page not readable, skipped');
      continue;
    }
    const probe = { ...c, id };
    const fromFeeds = leads.filter((l) => matchProduct(l.title, [probe])).map((l) => l.url);
    const revs = await collectReviews(probe, [], fromFeeds);
    // Name matching misses renames ("MacBook Air M5" vs "MacBook Air (M5, 2026)"); the same review pages do not.
    const shared = sharedReviewUrls(
      revs.map((r) => r.url),
      reviews,
    );
    if (isRenamedDuplicate(shared, revs.length)) {
      console.log('  its reviews are already on the site under another product, skipped');
      continue;
    }
    if (revs.length < MIN_REVIEWS_NEW_PRODUCT) {
      console.log(`  only ${revs.length} verified reviews, need ${MIN_REVIEWS_NEW_PRODUCT}`);
      continue;
    }
    const texts = revs
      .slice(0, 8)
      .map((r) => {
        try {
          return `SOURCE ${r.outletId}: ${pageText(fetchPage(r.url)).slice(0, 6000)}`;
        } catch {
          return ''; // the review itself was already verified; the card just has one source fewer
        }
      })
      .filter(Boolean)
      .join('\n\n');
    const copy = await writeCard(c, texts);
    if (!copy) {
      console.log('  could not write the card, skipped');
      continue;
    }
    /** @type {Product} */
    const product = {
      id,
      slug: id,
      name: c.name,
      brand: c.brand,
      category: c.category,
      releaseDate: c.releaseDate,
      launchPrice: c.launchPrice,
      officialUrl: c.officialUrl,
      criticsTake: copy.criticsTake,
      loved: copy.loved,
      gripes: copy.gripes,
      specs: copy.specs,
      art: { kind: ART_KIND[c.category], body: '#3a3d46', accent: '#8aa4d8', backdrop: ['#f4f6fb', '#e3e8f3'] },
      autoAdded: TODAY,
    };
    made.push({ product, reviews: revs, newOutlets: [] });
  }
  return made;
}

/**
 * The launch card, written by OpenAI from the review texts only. Asked a second time, with the problem
 * named, when the first answer breaks the copy rules (scripts/lib/copy-voice.js), which validation enforces.
 * @param {{name: string, brand: string, launchPrice: number}} c
 * @param {string} texts
 * @returns {Promise<Pick<Product, 'criticsTake' | 'loved' | 'gripes' | 'specs'> | null>}
 */
async function writeCard(c, texts) {
  let fix = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const copy = parseJsonReply(
      await openaiText(`Write the summary card for ${c.name} (${c.brand}) using ONLY facts stated in the review texts below. Never add a spec, price or claim that is not in the texts. No em dashes. No "not X but Y" phrasing, no hype words. Never use: truly, genuinely, delve, robust, leverage, unlock, tapestry, realm, deep dive, moreover, furthermore, additionally, serves as, worth noting, "it's not just".${fix}
Return JSON: {"criticsTake": "2-3 plain sentences on the critical consensus", "loved": [3-4 short strings], "gripes": [3-5 short strings], "specs": [{"label":"","value":""} 7-9 items a buyer of this category cares about, each stated in the texts, plus {"label":"Price","value":"From $${c.launchPrice}"}]}

${texts}`),
    );
    const strings = (/** @type {unknown} */ a) =>
      Array.isArray(a) && a.length > 0 && a.every((x) => typeof x === 'string' && x.trim());
    if (
      !copy ||
      typeof copy.criticsTake !== 'string' ||
      !copy.criticsTake.trim() ||
      !strings(copy.loved) ||
      !strings(copy.gripes) ||
      !Array.isArray(copy.specs) ||
      copy.specs.length < 5 ||
      !copy.specs.every(
        (/** @type {{label?: unknown, value?: unknown} | null} */ s) =>
          s && typeof s.label === 'string' && typeof s.value === 'string',
      )
    )
      return null;
    const broken = productCopyViolations([{ id: 'card', ...copy }]);
    if (!broken.length) return copy;
    fix = ` Your last answer broke these rules, fix them: ${broken.join('; ')}.`;
    console.log(`  card broke the copy rules (${broken.join('; ')})${attempt ? '' : ', asking again'}`);
  }
  return null;
}

/** @param {unknown} e */
const errText = (e) => String(/** @type {Error} */ (e).message).slice(0, 160);

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  /** @type {string[]} */
  const files = [];
  /** Things the workflow should alert on once the good part of the run is committed. @type {string[]} */
  const problems = [];
  let failedProducts = 0;
  let launchFailed = false;
  // 0. Outlet feeds: what was published in the last two weeks.
  const feeds = args['no-feeds']
    ? { byProduct: /** @type {Map<string, string[]>} */ (new Map()), leads: [] }
    : await readFeeds();
  // 1. New reviews for existing products. Search covers products launched in the last LAUNCH_WINDOW_DAYS
  // first (that is when reviews arrive), then the least recently checked; newer first among equals.
  // A product outside the search queue whose review turned up in a feed gets that page checked too.
  /** @param {Product} p */
  const recent = (p) =>
    TODAY.localeCompare(p.releaseDate) < 0
      ? 0
      : Math.max(0, 1 - (Date.parse(TODAY) - Date.parse(p.releaseDate)) / (365 * 864e5));
  /** @param {Product} p */
  const launching = (p) => (p.releaseDate >= daysBefore(TODAY, LAUNCH_WINDOW_DAYS) ? 0 : 1);
  const queue = products
    .filter((p) => !only || only.has(p.id))
    .sort(
      (a, b) =>
        launching(a) - launching(b) || (state[a.id] || '').localeCompare(state[b.id] || '') || recent(b) - recent(a),
    )
    .slice(0, MAX_PRODUCTS);
  const feedOnly = products.filter((p) => feeds.byProduct.has(p.id) && !queue.includes(p) && (!only || only.has(p.id)));
  for (const p of [...queue, ...feedOnly]) {
    const search = queue.includes(p);
    console.log(`checking ${p.id}${search ? '' : ' (feed only)'}`);
    /** @type {Review[]} */
    let revs = [];
    try {
      revs = await collectReviews(
        p,
        reviews.filter((r) => r.productId === p.id),
        feeds.byProduct.get(p.id),
        search,
      );
    } catch (e) {
      failedProducts++;
      console.error(`  failed: ${errText(e)}`);
      continue;
    }
    if (search) state[p.id] = TODAY;
    if (revs.length) {
      const f = path.join(OUT, `append-${p.id}.json`);
      fs.writeFileSync(f, JSON.stringify({ productId: p.id, reviews: revs }, null, 2));
      files.push(f);
    }
  }
  // 2. New launches.
  if (!args['no-launches'] && !only) {
    try {
      for (const m of await newLaunches(feeds.leads)) {
        const f = path.join(OUT, `new-${m.product.id}.json`);
        fs.writeFileSync(f, JSON.stringify(m, null, 2));
        files.push(f);
      }
    } catch (e) {
      launchFailed = true;
      console.error(`launch search failed: ${errText(e)}`);
      problems.push(`The search for new launches failed: ${errText(e)}`);
    }
  }
  const steps = queue.length + feedOnly.length + (args['no-launches'] || only ? 0 : 1);
  const failures = failedProducts + Number(launchFailed);
  // Nothing worked (a revoked key or an API outage): fail now, there is nothing to commit.
  if (steps && failures === steps)
    throw new Error(`Refresh incomplete: all ${failures} search step(s) failed; no imports applied.`);
  const checked = queue.length + feedOnly.length;
  if (failedProducts > checked * MAX_FAILED_SHARE)
    problems.push(`${failedProducts} of ${checked} product searches failed (see the run log).`);
  else if (failedProducts) console.log(`::warning::${failedProducts} product search(es) failed; retried next run`);

  console.log(`\n${files.length} import file(s)`);
  const writeOut = () => {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
    if (problems.length) fs.writeFileSync(path.join(OUT, 'problems.txt'), problems.join('\n') + '\n');
  };
  if (args['dry-run']) return;
  if (!files.length) return writeOut();
  /** @type {{productId?: string, product?: Product, reviews: Review[]}[]} */
  const contents = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const res = importEach(
    loadData(DATA_DIR),
    files.map((f, i) => ({ label: path.basename(f), content: contents[i] })),
    CATEGORIES,
  );
  for (const m of res.messages) console.log(m);
  for (const r of res.rejected) {
    console.error(`rejected ${r.label}:\n- ${r.errors.join('\n- ')}`);
    problems.push(`An import was rejected by the data checks (${r.label}): ${r.errors.slice(0, 3).join('; ')}`);
    // A rejected product is checked again next run rather than skipped for a full cycle.
    const id = contents[files.findIndex((f) => path.basename(f) === r.label)].productId;
    if (id) delete state[id];
  }
  if (res.applied.length) writeData(DATA_DIR, res.data);
  writeOut();
  // What the later steps should check and score: product ids, and the exact reviews added.
  const parsed = contents.filter((_, i) => res.applied.includes(path.basename(files[i])));
  /** @param {(typeof parsed)[number]} m */
  const idOf = (m) => m.productId || m.product?.id;
  fs.writeFileSync(path.join(OUT, 'touched.txt'), [...new Set(parsed.map(idOf))].join(','));
  fs.writeFileSync(
    path.join(OUT, 'added.txt'),
    parsed.flatMap((m) => m.reviews.map((r) => `${idOf(m)}/${r.outletId}`)).join('\n') + '\n',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
