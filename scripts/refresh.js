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
// With --backfill-only it instead fills catalogue gaps (scripts/lib/backfill.js has the rules): up to 3 older
// well-reviewed products a day, found by search and built exactly like a new launch (at least 5 reviews from
// known outlets, an official photo, a card). It runs after the normal refresh in refresh-pipeline.sh, adds its
// products to the same .cache/refresh/touched.txt and added.txt, and so goes through the same quote check,
// scoring, thin-product and build steps. A failed backfill is reported in problems.txt; it never fails the run.
//
// Usage: node scripts/refresh.js [--max-products=15] [--max-new=2] [--only=id,id] [--no-launches] [--no-feeds] [--dry-run]
//        node scripts/refresh.js --backfill-only [--category=tablet] [--max-backfill=3] [--dry-run]
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
  siteBrand,
  siteName,
} = require('./lib/launches');
const { UA, curl, fetchPage, fetchPageAsync, pageText, containsQuote, jsonLd, hostOf } = require('./lib/page');
const { urlKey } = require('./lib/launches');
const { parseFeed, sortFeedItems, matchProduct } = require('./lib/feeds');
const { outletFor } = require('./lib/outlets');
const { pageProblem } = require('./lib/page-guards');
const { openaiText, geminiText, geminiImageText, parseJsonReply } = require('./lib/models');
const { findLaunchPhoto, siteOf } = require('./lib/launch-photo');
const backfill = require('./lib/backfill');
const { hasDarkBackground, writeProductImage, removeProductImage } = require('./lib/product-image');

/** @typedef {import('../src/lib/data-types').Product} Product */
/** @typedef {import('../src/lib/data-types').Review} Review */
/** @typedef {import('../src/lib/data-types').Category} Category */
/** The fields of a product (or a launch candidate) a review search needs. */
/** @typedef {Pick<Product, 'id' | 'name' | 'brand' | 'releaseDate'>} ProductRef */
/** @typedef {{review: Review, skip?: undefined} | {skip: string, review?: undefined}} BuildResult */
/** A new product ready to import, with the reviews it was built from. @typedef {{product: Product, reviews: Review[], newOutlets: []}} Made */

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '.cache', 'refresh');
const STATE_FILE = path.join(DATA_DIR, 'refresh-state.json');
const REJECTED_FILE = path.join(DATA_DIR, 'refresh-rejected.json');
const BACKFILL_FILE = path.join(DATA_DIR, 'backfill-state.json');
/** A page judged not to be a review of the product is not sent to the model again for this long. */
const REJECTED_DAYS = 30;
const TODAY = new Date().toISOString().slice(0, 10);
/** More failed product searches than this share of the queue is reported as a problem, not just a warning. */
const MAX_FAILED_SHARE = 1 / 3;
/** Feed headlines that name no product on the site, passed to the launch search as leads (newest first). */
const MAX_LEADS = 150;
/** Share of the search queue kept for products launched in the last LAUNCH_WINDOW_DAYS; the rest rotates. */
const LAUNCH_SHARE = 2 / 3;
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
const BACKFILL_ONLY = !!args['backfill-only'];
/** How many verified reviews the last buildNewProduct found when it ended for lack of them (-1 when it ended for another reason). */
let shortfall = -1;

const CATEGORIES =
  /** @type {{categories: Category[], artKinds: string[], expansion: import('./lib/backfill').Config['expansion']}} */ (
    loadCategories()
  );
const { products, reviews, outlets } = loadData();
/** Product id -> date it was last checked (YYYY-MM-DD). @type {Record<string, string>} */
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
/** Page (urlKey) -> date it was judged not to be a review of the product. @type {Record<string, string>} */
const rejected = fs.existsSync(REJECTED_FILE) ? JSON.parse(fs.readFileSync(REJECTED_FILE, 'utf8')) : {};
/** Pages already on the site, under any product or outlet. */
const onSite = new Set(reviews.map((r) => urlKey(r.url)));

/** Reviews usually publish a week or two before the on-sale date. @param {string} iso @param {number} n */
const daysBefore = (iso, n) => new Date(Date.parse(iso) - n * 864e5).toISOString().slice(0, 10);

/** The outlet a URL belongs to (scripts/lib/outlets.js). @param {string} u */
const outletForUrl = (u) => outletFor(u, outlets);

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
    for (const xml of xmls) {
      try {
        if (xml) items.push(...parseFeed(xml));
      } catch (e) {
        console.log(`  a feed could not be parsed: ${errText(e)}`);
      }
    }
  }
  const res = sortFeedItems(items, products, (u) => !!outletForUrl(u), TODAY);
  res.leads.sort((a, b) => b.date.localeCompare(a.date));
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
 * @param {boolean} [majorOnly] ask only about the tier 1 and 2 outlets (a second pass after a thin first one)
 * @returns {Promise<string[]>}
 */
async function findReviewUrls(product, skipOutletIds, majorOnly = false) {
  const list = outlets
    .filter((o) => !skipOutletIds.has(o.id) && (!majorOnly || o.tier <= 2))
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
    .map((x) => resolveRedirect(x?.url))
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

const NOT_A_REVIEW = 'not a full review of this product';
/** Skip reasons for a page that could not be read: gone for good, or only refusing us (the fetch services may read it another day). */
const SKIP_MISSING = 'page missing (404/410)';
const SKIP_BLOCKED = 'page blocked (no fetch service could read it)';
/** How often each skip reason came up in this run, printed at the end so a change to the pipeline can be measured. @type {Map<string, number>} */
const skipCounts = new Map();
/** @param {string} reason */
function countSkip(reason) {
  const key = reason.replace(/^date .*/, 'date outside launch..today').replace(/\s*[(:].*$/, '');
  skipCounts.set(key, (skipCounts.get(key) || 0) + 1);
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
  } catch (e) {
    // A page that does not exist is not looked for again for a while; one that is only blocked may be read another day.
    if (/HTTP (404|410)/.test(String(/** @type {Error} */ (e).message))) {
      rejected[urlKey(url)] = TODAY;
      return { skip: SKIP_MISSING };
    }
    return { skip: SKIP_BLOCKED };
  }
  const text = pageText(html);
  if (text.length < 1500) return { skip: 'page too short' };
  const problem = pageProblem({
    html,
    text,
    url,
    product: { id: product.id, name: product.name, brand: product.brand },
    products,
    sameOutlet: (a, b) => !!outletForUrl(a) && outletForUrl(a) === outletForUrl(b),
  });
  if (problem) return { skip: problem };
  const ld = jsonLd(html);
  if (ld.ambiguous) return { skip: 'several ratings on the page (a roundup, or another product\u2019s review)' };
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
  if (!answer || !answer.fullReview) return { skip: NOT_A_REVIEW };
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
 * @param {boolean} [majorOnly] search only the tier 1 and 2 outlets
 */
async function collectReviews(product, existing, feedUrls = [], search = true, majorOnly = false) {
  const have = new Set(existing.map((r) => r.outletId));
  // Feed pages first: they are this product's reviews by headline, so they need no search to find.
  const urls = [...feedUrls, ...(search ? await findReviewUrls(product, have, majorOnly) : [])];
  /** @type {Review[]} */
  const out = [];
  for (const url of [...new Set(urls)]) {
    const outlet = outletForUrl(url);
    // A page already on the site (under any product or outlet) or recently judged not a review is skipped.
    if (!outlet || have.has(outlet.id) || onSite.has(urlKey(url)) || rejected[urlKey(url)]) continue;
    const res = await buildReview(product, url);
    // A page that will not change is not looked at again for REJECTED_DAYS. Not-found and canonical skips are left out: the
    // real review can appear at the same address later.
    if (res.skip === NOT_A_REVIEW || /^(date |different model|several ratings)/.test(res.skip || ''))
      rejected[urlKey(url)] = TODAY;
    if (res.review) {
      out.push(res.review);
      have.add(outlet.id);
      console.log(`  + ${outlet.id} ${res.review.rating || 'unrated'}`);
    } else {
      console.log(`  - ${url.slice(0, 90)}: ${res.skip}`);
      countSkip(res.skip || 'unknown');
    }
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
  earbuds: 'earbuds',
  tv: 'tv',
  camera: 'camera',
  'e-reader': 'ereader',
  handheld: 'handheld',
};

/** Photos of new launches (product id -> image file), written to public/ only for launches being imported. @type {Map<string, Buffer>} */
const launchPhotos = new Map();

/** An image file from a brand site. @param {string} url */
async function downloadImage(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

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
 * @returns {Promise<Made[]>}
 */
async function newLaunches(leads) {
  // Products already on the site are filtered out in code below, so the prompt stays short and the search fast.
  const headlines = leads
    .slice(0, MAX_LEADS)
    .map((l) => `- ${l.title} (${hostOf(l.url)})`)
    .join('\n');
  // A category the backfill is still opening is not live yet; its products come in through the backfill, in order.
  const liveCategories = backfill.liveCategories(products, reviews, CATEGORIES);
  const text = await geminiTextRetry(
    `Today is ${TODAY}. Using search, list up to 6 consumer gadgets that went on sale in the US within the last ${LAUNCH_WINDOW_DAYS} days and already have several professional reviews from major tech outlets.
Categories allowed: ${[...liveCategories].join(', ')}.${
      headlines
        ? `\nLeads: these review headlines appeared this fortnight on outlets we follow. A gadget several of them review is a strong candidate; confirm its facts with search. Ignore games, films, books and other products outside the categories.\n${headlines}`
        : ''
    }
Reply with a JSON array only: [{"name":"","brand":"","category":"","releaseDate":"YYYY-MM-DD","launchPrice":<USD number>,"officialUrl":"https://..."}]. "name" is the model name reviewers use, without the brand (for example "iPad mini (A20 Pro)", not "iPad mini (8th gen)"). "officialUrl" is this product's own page on the brand's site, never the home page or a category page. Use only facts you saw in search results.`,
    { search: true, timeoutMs: GEMINI_TIMEOUT_MS },
  );
  /** @type {{name: string, brand: string, category: Category, releaseDate: string, launchPrice: number, officialUrl: string}[]} */
  const candidates = parseJsonReply(text, '[') || [];
  const found = candidates.filter(
    (c) =>
      c.name &&
      liveCategories.has(c.category) &&
      /^\d{4}-\d{2}-\d{2}$/.test(c.releaseDate) &&
      c.releaseDate <= TODAY &&
      c.releaseDate >= daysBefore(TODAY, LAUNCH_WINDOW_DAYS) &&
      Number.isFinite(c.launchPrice) &&
      /^https:\/\//.test(c.officialUrl || ''),
  );
  /** @type {Made[]} */
  const made = [];
  for (const raw of found) {
    if (made.length >= MAX_NEW) break;
    const { c, id, dup } = siteCandidate(raw, [...products, ...made.map((m) => m.product)]);
    if (dup) {
      console.log(`launch candidate ${c.name}: already on the site as ${dup.id}`);
      continue;
    }
    console.log(`new launch candidate: ${c.name}`);
    const m = await buildNewProduct(c, id, leads, { minReviews: MIN_REVIEWS_NEW_PRODUCT });
    if (m) made.push(m);
  }
  return made;
}

/**
 * A candidate the way the site writes it: the brand as the site spells it and in front of the name (the slug
 * keeps the brand too, so a number-only model like "OnePlus 16" never becomes a bare "/product/16/"), its id,
 * and the product already on the site it duplicates, if any.
 * @template {{name: string, brand: string}} C
 * @param {C} raw
 * @param {{id: string, slug?: string, name: string, brand: string}[]} others products to compare with
 */
function siteCandidate(raw, others) {
  const brand = siteBrand(raw.brand || '', products, raw.name);
  const c = { ...raw, brand, name: siteName(raw.name, brand) };
  const id = slug(c.name);
  return { c, id, dup: knownProduct({ ...c, id }, others) };
}

/**
 * The `image` record of a product whose photo files are in public/images/products/<id>/.
 * @param {{name: string, brand: string}} c
 * @param {string} id
 * @param {string} sourceUrl the brand page the photo came from
 * @returns {NonNullable<Product['image']>}
 */
const photoRecord = (c, id, sourceUrl) => ({
  src: `/images/products/${id}/main.webp`,
  thumb: `/images/products/${id}/thumb.webp`,
  alt: `${c.name}, official ${c.brand} photo`,
  credit: c.brand,
  sourceUrl,
});

/** How often a product still without a photo is looked at again, in days, and how many per run. */
const PHOTO_RETRY_DAYS = 3;
const PHOTO_RETRIES_PER_RUN = 3;

/**
 * Official photos for products that went live without one. Each is tried every PHOTO_RETRY_DAYS days, a few per run,
 * the same way a new product's photo is found (its official page, then the brand's press pages) and judged by the same
 * image check. Writes the photo and sets `image` on the product; touches nothing else.
 * @param {import('./lib/backfill').State} bstate
 * @param {string[]} problems
 * @returns {Promise<import('./lib/backfill').State>}
 */
async function fillMissingPhotos(bstate, problems) {
  const tries = { ...(bstate.photoTries || {}) };
  /** Saves the retry dates at once, so a lookup that fails still waits its turn tomorrow. */
  const save = () => {
    if (!args['dry-run'])
      fs.writeFileSync(BACKFILL_FILE, JSON.stringify({ ...bstate, photoTries: tries }, null, 2) + '\n');
  };
  const due = loadData(DATA_DIR)
    .products.filter(
      (p) =>
        !p.image &&
        p.officialUrl &&
        // A product added earlier in this run was just looked at, and has not passed the quote check yet.
        p.autoAdded !== TODAY &&
        (tries[p.id] || '') <= backfill.addDays(TODAY, -PHOTO_RETRY_DAYS),
    )
    .slice(0, PHOTO_RETRIES_PER_RUN);
  for (const p of due) {
    console.log(`photo: looking again for ${p.name}`);
    tries[p.id] = TODAY;
    save();
    try {
      const photo = await findLaunchPhoto(
        { name: p.name, brand: p.brand, officialUrl: /** @type {string} */ (p.officialUrl) },
        {
          fetchPage,
          download: downloadImage,
          judge: geminiImageText,
          parse: (t) => parseJsonReply(t),
          pressPages: findPressPages,
          log: (m) => console.log(m),
        },
      );
      if (!photo || args['dry-run']) continue;
      try {
        await writeProductImage(
          p.slug,
          photo.buffer,
          (await hasDarkBackground(photo.buffer)) ? { pad: true } : { trim: true },
        );
      } catch (e) {
        removeProductImage(p.slug); // never leave half a photo folder behind
        throw e;
      }
      const data = loadData(DATA_DIR);
      const target = data.products.find((x) => x.id === p.id);
      if (target) target.image = photoRecord(p, p.slug, photo.page);
      writeData(DATA_DIR, { products: data.products });
      console.log(`photo: found one for ${p.name}`);
    } catch (e) {
      // One product's photo failing must not cost the others, or the product search that follows.
      reportBackfillFault(problems, `The photo search for ${p.name} failed: ${errText(e)}`, e);
    }
  }
  return { ...bstate, photoTries: tries };
}

/**
 * The brand's own press or newsroom pages for a product, found by search (the caller keeps only pages on the
 * brand's own site). Their share images are judged like the official page's.
 * @param {{name: string, brand: string, officialUrl: string}} c
 * @returns {Promise<string[]>}
 */
async function findPressPages(c) {
  const text = await geminiTextRetry(
    `Find the ${c.brand}'s own press release or newsroom page(s) about the ${c.name} (the brand's website only, not retailers or review sites). Return only URLs you actually saw in search results. Reply with a JSON array only: [{"url":"https://..."}]`,
    { search: true, timeoutMs: GEMINI_TIMEOUT_MS },
  );
  /** @type {{url?: unknown}[]} */
  const found = parseJsonReply(text, '[') || [];
  return found
    .map((x) => resolveRedirect(x?.url))
    .filter(/** @returns {u is string} */ (u) => typeof u === 'string' && /^https:\/\//.test(u));
}

/**
 * The facts a backfill candidate must get right, from a search about that one product: when it went on sale, its US
 * launch price, and its own page on the brand's site. A list of eight products gets sloppy dates and guessed
 * links, and the review date check trusts the date. Null (with the reason printed) when it went on sale outside the
 * backfill's window or no brand page can be read. A fact the search does not give keeps the candidate's own.
 * @param {{name: string, brand: string, releaseDate: string, launchPrice: number, officialUrl: string}} c
 * @returns {Promise<{releaseDate: string, launchPrice: number, officialUrl: string} | null>}
 */
async function confirmFacts(c) {
  const text = await geminiTextRetry(
    `Using search: on what date did the ${c.brand} ${c.name} first go on sale in the US (retail availability, not the announcement), what was its US launch price in USD for the base model, and what is its own product page on ${c.brand}'s website (not the home page, a category page or a retailer)? Reply JSON only: {"onSale":"YYYY-MM-DD","launchPrice":<number>,"officialUrl":"https://..."}`,
    { search: true, timeoutMs: GEMINI_TIMEOUT_MS },
  );
  const got = parseJsonReply(text);
  const releaseDate = /^\d{4}-\d{2}-\d{2}$/.test(got?.onSale) ? got.onSale : c.releaseDate;
  const launchPrice = Number.isFinite(got?.launchPrice) && got.launchPrice > 0 ? got.launchPrice : c.launchPrice;
  if (releaseDate !== c.releaseDate) console.log(`  on sale ${releaseDate}, not ${c.releaseDate} as first listed`);
  if (releaseDate > TODAY || releaseDate < backfill.monthsBefore(TODAY, backfill.WINDOW_MONTHS)) {
    console.log(`  on sale ${releaseDate}, outside the last ${backfill.WINDOW_MONTHS} months, skipped`);
    return null;
  }
  // The page this search named for this one product beats the list's guess; either must be on the brand's own site.
  const brand = c.brand.toLowerCase().replace(/[^a-z0-9]/g, '');
  const onBrandSite = (/** @type {string} */ u) => {
    const label = siteOf(u).split('.')[0];
    return !!label && (brand.includes(label) || label.includes(brand));
  };
  const pages = [got?.officialUrl, c.officialUrl].filter(
    (u) => typeof u === 'string' && /^https:\/\//.test(u) && onBrandSite(u),
  );
  for (const officialUrl of new Set(pages)) {
    try {
      fetchPage(officialUrl); // brand sites that refuse a plain request are read through the fetch services too
      return { releaseDate, launchPrice, officialUrl };
    } catch {
      /* try the other page */
    }
  }
  console.log('  official page not readable, skipped');
  return null;
}

/**
 * Everything a new product needs beyond its facts: reviews from outlets we know (at least `minReviews`, each
 * read from the outlet's own page), an official photo, and a card written from the review texts. Null, with the
 * reason printed, when any is missing. Used for new launches and for the backfill alike.
 * @param {{name: string, brand: string, category: Category, releaseDate: string, launchPrice: number, officialUrl: string}} c
 * @param {string} id
 * @param {{title: string, url: string}[]} leads feed headlines that may point at this product's reviews
 * @param {{minReviews: number, backfilled?: boolean}} opts
 * @returns {Promise<Made | null>}
 */
async function buildNewProduct(c, id, leads, { minReviews, backfilled = false }) {
  shortfall = -1;
  try {
    fetchPage(c.officialUrl);
  } catch {
    console.log('  official page not readable, skipped');
    return null;
  }
  const probe = { ...c, id };
  const fromFeeds = leads.filter((l) => matchProduct(l.title, [probe])).map((l) => l.url);
  // An older product's reviews are spread over search results, and a question about all 170 outlets at once gets
  // guessed URLs. The backfill asks about the major outlets first, and once more about the rest when that leaves
  // it short but promising. The same checks apply to every page either search finds.
  const revs = await collectReviews(probe, [], fromFeeds, true, backfilled);
  if (backfilled && revs.length >= 2 && revs.length < minReviews) {
    console.log(`  ${revs.length} verified reviews so far, searching the other outlets too`);
    revs.push(...(await collectReviews(probe, revs, [], true, false)));
  }
  // Name matching misses renames ("MacBook Air M5" vs "MacBook Air (M5, 2026)"); the same review pages do not.
  const shared = sharedReviewUrls(
    revs.map((r) => r.url),
    reviews,
  );
  if (isRenamedDuplicate(shared, revs.length)) {
    console.log('  its reviews are already on the site under another product, skipped');
    return null;
  }
  if (revs.length < minReviews) {
    console.log(`  only ${revs.length} verified reviews, need ${minReviews}`);
    shortfall = revs.length;
    return null;
  }
  // Official photo: the product's own page first, then the brand's press pages (backfill only).
  const photo = await findLaunchPhoto(c, {
    fetchPage,
    download: downloadImage,
    judge: geminiImageText,
    parse: (t) => parseJsonReply(t),
    // Only the backfill falls back to the brand's press pages: many brand pages offer no share image of the product.
    pressPages: backfilled ? findPressPages : undefined,
    log: (m) => console.log(m),
  });
  // No photo is no reason to hold the reviews back: the product goes live with a brand tile, and fillMissingPhotos keeps looking.
  if (!photo) console.log('  no usable official photo yet: adding it without one, the photo is retried on later runs');
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
    return null;
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
    ...(backfilled ? { backfilled: TODAY } : {}),
  };
  if (photo) {
    // The files are written in main() just before the import, so a dry run or a failed run leaves none behind.
    launchPhotos.set(id, photo.buffer);
    product.image = photoRecord(c, id, photo.page);
  }
  return { product, reviews: revs, newOutlets: [] };
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
  if (BACKFILL_ONLY) return mainBackfill();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  /** @type {string[]} */
  const files = [];
  /** Things the workflow should alert on once the good part of the run is committed. @type {string[]} */
  const problems = [];
  let failedProducts = 0;
  let failedFeedChecks = 0;
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
  const launching = (p) => p.releaseDate >= daysBefore(TODAY, LAUNCH_WINDOW_DAYS);
  const byAge = (/** @type {Product} */ a, /** @type {Product} */ b) =>
    (state[a.id] || '').localeCompare(state[b.id] || '') || recent(b) - recent(a);
  const candidates = products.filter((p) => !only || only.has(p.id));
  // Launches get up to LAUNCH_SHARE of the slots, so older products keep rotating however many launch at once.
  const fresh = candidates
    .filter(launching)
    .sort(byAge)
    .slice(0, Math.ceil(MAX_PRODUCTS * LAUNCH_SHARE));
  const queue = [...fresh, ...candidates.filter((p) => !fresh.includes(p)).sort(byAge)].slice(0, MAX_PRODUCTS);
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
      if (search) failedProducts++;
      else failedFeedChecks++;
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
  // Feed-only checks are left out of these counts: they say nothing about whether search works.
  const steps = queue.length + (args['no-launches'] || only ? 0 : 1);
  const failures = failedProducts + Number(launchFailed);
  // Nothing worked (a revoked key or an API outage): fail now, there is nothing to commit.
  if (steps && failures === steps)
    throw new Error(`Refresh incomplete: all ${failures} search step(s) failed; no imports applied.`);
  if (failedProducts > queue.length * MAX_FAILED_SHARE)
    problems.push(`${failedProducts} of ${queue.length} product searches failed (see the run log).`);
  else if (failedProducts) console.log(`::warning::${failedProducts} product search(es) failed; retried next run`);
  if (failedFeedChecks) console.log(`::warning::${failedFeedChecks} feed-only check(s) failed; retried next run`);

  console.log(`\n${files.length} import file(s)`);
  if (args['dry-run']) return;
  await importFiles(files, problems, false);
  writeOut(problems);
}

/** Writes what a run learned: when each product was last checked, the pages and candidates rejected, and any problems. @param {string[]} problems @param {boolean} [appendProblems] */
function writeOut(problems, appendProblems = false) {
  if (skipCounts.size)
    console.log(`candidate pages skipped, by reason: ${[...skipCounts].map(([k, n]) => `${k} ${n}`).join(', ')}`);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
  fs.writeFileSync(
    REJECTED_FILE,
    JSON.stringify(backfill.keepRejected(rejected, TODAY, REJECTED_DAYS), null, 2) + '\n',
  );
  if (problems.length) {
    const file = path.join(OUT, 'problems.txt');
    const text = problems.join('\n') + '\n';
    if (appendProblems) fs.appendFileSync(file, text);
    else fs.writeFileSync(file, text);
  }
}

/**
 * Writes the photos of new products, then applies every import file, each on its own. Files the data checks
 * reject are reported in `problems` and leave nothing behind. Returns the files that were applied, or null when there were none.
 * @param {string[]} files
 * @param {string[]} problems
 * @param {boolean} append add to what an earlier step wrote in touched.txt and added.txt instead of replacing it
 */
async function importFiles(files, problems, append) {
  for (const [id, buffer] of launchPhotos)
    if (files.some((f) => path.basename(f) === `new-${id}.json`))
      await writeProductImage(id, buffer, (await hasDarkBackground(buffer)) ? { pad: true } : { trim: true });
  if (!files.length) return null;
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
    const content = contents[files.findIndex((f) => path.basename(f) === r.label)];
    const id = content.productId;
    if (id) delete state[id];
    // A rejected new launch leaves no photo folder behind; a rejected backfill product is not tried again for a while.
    if (content.product) removeProductImage(content.product.id);
    if (content.product?.backfilled) rejected[backfill.rejectKey(content.product.id)] = TODAY;
  }
  if (res.applied.length) writeData(DATA_DIR, res.data);
  const applied = contents.filter((_, i) => res.applied.includes(path.basename(files[i])));
  // Written at once, before anything else can fail: a product in data/ that is not listed here would skip the checks.
  if (applied.length) recordTouched(applied, append);
  return applied;
}

/**
 * What the later steps of refresh-pipeline.sh should check and score: product ids (touched.txt), and the
 * exact reviews added (added.txt). The backfill runs after the refresh and adds to what the refresh wrote.
 * @param {{productId?: string, product?: Product, reviews: Review[]}[]} parsed
 * @param {boolean} append
 */
function recordTouched(parsed, append) {
  /** @param {(typeof parsed)[number]} m */
  const idOf = (m) => m.productId || m.product?.id;
  const touchedFile = path.join(OUT, 'touched.txt');
  const addedFile = path.join(OUT, 'added.txt');
  const before = append && fs.existsSync(touchedFile) ? fs.readFileSync(touchedFile, 'utf8').split(',') : [];
  const ids = [...new Set([...before, ...parsed.map(idOf)].filter(Boolean))];
  fs.writeFileSync(touchedFile, ids.join(','));
  const lines = parsed.flatMap((m) => m.reviews.map((r) => `${idOf(m)}/${r.outletId}`)).join('\n') + '\n';
  if (append) fs.appendFileSync(addedFile, lines);
  else fs.writeFileSync(addedFile, lines);
}

/**
 * The backfill: up to MAX_PER_RUN older, well-reviewed products that are missing from the site, built like new
 * launches. Categories are worked in the order scripts/lib/backfill.js gives; each is searched once. Candidates
 * that fail (too few reviews from known outlets, a card that breaks the copy rules) are
 * recorded in data/refresh-rejected.json so the next runs do not pay for them again.
 * Returns what to import; `problems` gets a line when the search itself failed.
 * @param {string[]} problems
 * @returns {Promise<{made: Made[], state: import('./lib/backfill').State}>}
 */
async function findBackfill(problems) {
  const forced = args.category ? String(args.category) : null;
  if (forced && !CATEGORIES.categories.includes(/** @type {Category} */ (forced)))
    throw new Error(`--category=${forced} is not a category (${CATEGORIES.categories.join(', ')})`);
  const maxAdd = Math.min(backfill.MAX_PER_RUN, Number(args['max-backfill'] ?? backfill.MAX_PER_RUN));
  let bstate = /** @type {import('./lib/backfill').State} */ (
    fs.existsSync(BACKFILL_FILE) ? JSON.parse(fs.readFileSync(BACKFILL_FILE, 'utf8')) : backfill.initialState(TODAY)
  );
  const started = Date.now();
  const inBudget = () => Date.now() - started < backfill.BUDGET_MS;
  /** @type {Made[]} */
  const made = [];
  /** Categories already searched in this run. @type {Set<string>} */
  const worked = new Set();
  let attempts = 0;
  let checked = 0;
  while (
    made.length < maxAdd &&
    attempts < backfill.MAX_ATTEMPTS &&
    worked.size < backfill.MAX_SEARCHES &&
    checked < backfill.MAX_CHECKED &&
    inBudget()
  ) {
    const now = () => ({
      products: [...products, ...made.map((m) => m.product)],
      reviews: [...reviews, ...made.flatMap((m) => m.reviews)],
    });
    const pick = forced
      ? worked.has(forced)
        ? null
        : { category: forced, why: 'asked for' }
      : backfill.pickCategory({ ...now(), config: CATEGORIES, state: bstate, today: TODAY, skip: worked });
    if (!pick) {
      if (!worked.size) console.log('backfill: nothing to fill (every category has enough products, or is resting)');
      break;
    }
    const category = /** @type {Category} */ (pick.category);
    worked.add(category);
    console.log(
      `backfill: ${category} (${pick.why}), ${now().products.filter((p) => p.category === category).length} products`,
    );
    /** @type {ReturnType<typeof backfill.usableCandidates>} */
    let found;
    try {
      const text = await geminiTextRetry(
        backfill.candidatePrompt({
          today: TODAY,
          category,
          // Earbuds filed under Headphones and handhelds under Consoles are still "already on the site".
          known: products
            .filter((p) => p.category === category || p.art.kind === ART_KIND[category])
            .map((p) => p.name),
          rejected: backfill.rejectedIds(rejected).slice(-30),
        }),
        { search: true, timeoutMs: GEMINI_TIMEOUT_MS },
      );
      found = backfill.usableCandidates(parseJsonReply(text, '['), category, TODAY);
    } catch (e) {
      // An outage says nothing about the category, and the other categories would fail the same way.
      reportBackfillFault(problems, `The backfill search for ${category} failed: ${errText(e)}`, e);
      break;
    }
    let added = 0;
    let examined = 0;
    let stopped = false;
    for (const raw of found) {
      if (made.length >= maxAdd || attempts >= backfill.MAX_ATTEMPTS || checked >= backfill.MAX_CHECKED || !inBudget())
        break;
      const { c, id, dup } = siteCandidate(raw, now().products);
      if (dup) {
        console.log(`backfill candidate ${c.name}: already on the site as ${dup.id}`);
        continue;
      }
      if (backfill.rejectedIds(rejected).includes(id)) {
        console.log(`backfill candidate ${c.name}: rejected before, skipped`);
        continue;
      }
      console.log(`backfill candidate: ${c.name} (${c.releaseDate})`);
      checked++;
      examined++;
      /** @type {Made | null} */
      let m = null;
      shortfall = -1;
      try {
        const facts = await confirmFacts(c);
        if (facts) {
          attempts++;
          m = await buildNewProduct({ ...c, ...facts }, id, [], {
            minReviews: backfill.MIN_REVIEWS_BACKFILL,
            backfilled: true,
          });
        }
      } catch (e) {
        // A model outage: keep what is already built, report it, and stop (the next candidates would fail the same way).
        reportBackfillFault(problems, `The backfill stopped at ${c.name}: ${errText(e)}`, e);
        stopped = true;
        break;
      }
      if (m) {
        made.push(m);
        added++;
      } else rejected[backfill.rejectKey(id)] = backfill.rejectedOn(TODAY, shortfall);
      // Once this category has what it needs the next one is up; its candidates come from its own search.
      const others = new Set([...worked].filter((w) => w !== category));
      const still = backfill.pickCategory({ ...now(), config: CATEGORIES, state: bstate, today: TODAY, skip: others });
      if (!forced && still?.category !== category) break;
    }
    if (stopped) break;
    // A category the caps cut off before any candidate was looked at says nothing about it.
    if (examined > 0 || found.length === 0) bstate = backfill.noteCategory(bstate, category, added, TODAY);
  }
  console.log(`backfill: ${made.length} product(s) added, ${attempts} built, ${checked} checked`);
  return { made, state: bstate };
}

/**
 * A backfill fault: an alert for the owner when the API answered with an error, only a warning in the run log when the
 * connection dropped or timed out (the next day tries again, and the caretaker's 7-day check catches a backfill that never works).
 * @param {string[]} problems
 * @param {string} message
 * @param {unknown} e
 */
function reportBackfillFault(problems, message, e) {
  if (backfill.isNetworkError(String(/** @type {Error} */ (e).message))) console.log(`::warning::${message}`);
  else problems.push(message);
  console.error(message);
}

/** The backfill step of refresh-pipeline.sh: find, import, and hand the new products to the checks that follow. */
async function mainBackfill() {
  fs.mkdirSync(OUT, { recursive: true });
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const files = [];
  let bstate = null;
  try {
    // Products added without a photo get another look first (one search each, a few per run).
    const start = fs.existsSync(BACKFILL_FILE)
      ? JSON.parse(fs.readFileSync(BACKFILL_FILE, 'utf8'))
      : backfill.initialState(TODAY);
    await fillMissingPhotos(start, problems);
    const res = await findBackfill(problems);
    bstate = res.state;
    for (const m of res.made) {
      const f = path.join(OUT, `new-${m.product.id}.json`);
      fs.writeFileSync(f, JSON.stringify(m, null, 2));
      files.push(f);
    }
  } catch (e) {
    // The refresh that ran just before is not lost to a backfill fault: report it and carry on.
    console.error(e);
    problems.push(`The backfill failed: ${errText(e)}`);
  }
  console.log(`\n${files.length} import file(s)`);
  if (args['dry-run']) return;
  await importFiles(files, problems, true);
  if (bstate) fs.writeFileSync(BACKFILL_FILE, JSON.stringify(bstate, null, 2) + '\n');
  writeOut(problems, true);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
