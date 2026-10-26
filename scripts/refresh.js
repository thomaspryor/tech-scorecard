#!/usr/bin/env node
// Weekly refresh: find new reviews for products already on the site, and new launches.
// Uses Gemini with Google Search grounding to FIND candidate review URLs only. Everything
// that reaches data/ is read from the outlet's own page: rating, critic and date come from
// the page's JSON-LD, and the quote must appear word for word in the page text.
// A separate workflow step then runs verify-quotes.py and score-reviews.js, and only commits
// when those pass (see .github/workflows/weekly-refresh.yml).
//
// Usage: node scripts/refresh.js [--max-products=15] [--max-new=2] [--only=id,id] [--no-launches] [--dry-run]
// Needs GEMINI_API_KEY (search + excerpt picking) and OPENAI_API_KEY (copy for new products).
// Writes files in .cache/refresh/ in the import-product.js shapes and imports them unless --dry-run.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { DATA_DIR, loadData, loadCategories } = require('./lib/data-files');
const { UA, curl, fetchPage, pageText, containsQuote, jsonLd, hostOf } = require('./lib/page');
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
const MIN_REVIEWS_NEW_PRODUCT = 6;
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

const CATEGORIES = /** @type {{categories: Category[]}} */ (loadCategories());
const { products, reviews, outlets } = loadData();
/** Product id -> date it was last checked (YYYY-MM-DD). @type {Record<string, string>} */
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};

/** Reviews usually publish a week or two before the on-sale date. @param {string} iso @param {number} n */
const daysBefore = (iso, n) => new Date(Date.parse(iso) - n * 864e5).toISOString().slice(0, 10);

/** @param {string} u */
const outletForUrl = (u) =>
  outlets.find((o) => [o.domain, ...(o.altDomains || [])].some((d) => hostOf(u) === d || hostOf(u).endsWith(`.${d}`)));

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
 */
async function collectReviews(product, existing) {
  const have = new Set(existing.map((r) => r.outletId));
  const urls = await findReviewUrls(product, have);
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
 * @returns {Promise<{product: Product, reviews: Review[], newOutlets: []}[]>}
 */
async function newLaunches() {
  // Products already on the site are filtered out in code below, so the prompt stays short and the search fast.
  const text = await geminiTextRetry(
    `Today is ${TODAY}. Using search, list up to 6 consumer gadgets that went on sale in the US within the last 45 days and already have several professional reviews from major tech outlets.
Categories allowed: ${CATEGORIES.categories.join(', ')}.
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
      Number.isFinite(c.launchPrice) &&
      /^https:\/\//.test(c.officialUrl || ''),
  );
  /** @type {{product: Product, reviews: Review[], newOutlets: []}[]} */
  const made = [];
  for (const c of found) {
    if (made.length >= MAX_NEW) break;
    const id = slug(c.name);
    if (products.some((p) => p.id === id || p.name.toLowerCase() === c.name.toLowerCase())) continue;
    console.log(`new launch candidate: ${c.name}`);
    try {
      curl(['-f', '-o', '/dev/null', '-A', UA, c.officialUrl]);
    } catch {
      console.log('  official page not readable, skipped');
      continue;
    }
    const probe = { ...c, id };
    const revs = await collectReviews(probe, []);
    if (revs.length < MIN_REVIEWS_NEW_PRODUCT) {
      console.log(`  only ${revs.length} verified reviews, need ${MIN_REVIEWS_NEW_PRODUCT}`);
      continue;
    }
    const texts = revs
      .slice(0, 8)
      .map((r) => `SOURCE ${r.outletId}: ${pageText(fetchPage(r.url)).slice(0, 6000)}`)
      .join('\n\n');
    const copy = parseJsonReply(
      await openaiText(`Write the summary card for ${c.name} (${c.brand}) using ONLY facts stated in the review texts below. Never add a spec, price or claim that is not in the texts. No em dashes. No "not X but Y" phrasing, no hype words.
Return JSON: {"criticsTake": "2-3 plain sentences on the critical consensus", "loved": [3-4 short strings], "gripes": [3-5 short strings], "specs": [{"label":"","value":""} 7-9 items a buyer of this category cares about, each stated in the texts, plus {"label":"Price","value":"From $${c.launchPrice}"}]}

${texts}`),
    );
    if (!copy || !copy.criticsTake || !Array.isArray(copy.specs) || copy.specs.length < 5) {
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

/** @param {unknown} e */
const errText = (e) => String(/** @type {Error} */ (e).message).slice(0, 160);

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  /** @type {string[]} */
  const files = [];
  let failures = 0;
  // 1. New reviews for existing products: newest and least recently checked first.
  /** @param {Product} p */
  const recent = (p) =>
    TODAY.localeCompare(p.releaseDate) < 0
      ? 0
      : Math.max(0, 1 - (Date.parse(TODAY) - Date.parse(p.releaseDate)) / (365 * 864e5));
  const queue = products
    .filter((p) => !only || only.has(p.id))
    .sort((a, b) => (state[a.id] || '').localeCompare(state[b.id] || '') || recent(b) - recent(a))
    .slice(0, MAX_PRODUCTS);
  for (const p of queue) {
    console.log(`checking ${p.id}`);
    /** @type {Review[]} */
    let revs = [];
    try {
      revs = await collectReviews(
        p,
        reviews.filter((r) => r.productId === p.id),
      );
    } catch (e) {
      failures++;
      console.error(`  failed: ${errText(e)}`);
      continue;
    }
    state[p.id] = TODAY;
    if (revs.length) {
      const f = path.join(OUT, `append-${p.id}.json`);
      fs.writeFileSync(f, JSON.stringify({ productId: p.id, reviews: revs }, null, 2));
      files.push(f);
    }
  }
  // 2. New launches.
  if (!args['no-launches'] && !only) {
    try {
      for (const m of await newLaunches()) {
        const f = path.join(OUT, `new-${m.product.id}.json`);
        fs.writeFileSync(f, JSON.stringify(m, null, 2));
        files.push(f);
      }
    } catch (e) {
      failures++;
      console.error(`launch search failed: ${errText(e)}`);
    }
  }
  if (failures) throw new Error(`Refresh incomplete: ${failures} search step(s) failed; no imports applied.`);
  console.log(`\n${files.length} import file(s)`);
  if (args['dry-run'] || !files.length) {
    if (!args['dry-run']) fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
    return;
  }
  execFileSync('node', [path.join(__dirname, 'import-product.js'), ...files], { stdio: 'inherit' });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
  // What the later steps should check and score: product ids, and the exact reviews added.
  /** @type {{productId?: string, product?: Product, reviews: Review[]}[]} */
  const parsed = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
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
