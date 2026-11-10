// Rules for the daily backfill (scripts/refresh.js --backfill-only): which category to fill next, how many
// products a run may add, when a category goes live, and how a stalled backfill is noticed. Free of I/O so the
// tests can cover it; refresh.js does the searching and the importing.
//
// Order of work, every run:
//   1. A live category under THIN_BELOW products: tablet first, console second, then the rest, fewest first.
//   2. The first category of categories.json "expansion" that is not live yet (earbuds, TV, camera, e-reader,
//      handheld, one at a time). It goes live once it has minProducts products with minReviews reviews each.
//   3. A live category under FULL_AT products, fewest first.
// When none is left, every category has FULL_AT products and the backfill does nothing.

/** Products added per run, at most (the daily API cost: each one is a review search, page reads, a photo and a card). */
const MAX_PER_RUN = 3;
/** Candidates built per run (review search, page reads, photo, card), added or not: a rejected one costs nearly as much as an added one. */
const MAX_ATTEMPTS = 6;
/** Candidates given the cheap check (one search for the on-sale date and brand page) per run, built or not. */
const MAX_CHECKED = 12;
/** Candidate searches per run (one per category worked on). */
const MAX_SEARCHES = 3;
/** No new candidate is started after this long, so a slow day cannot eat the workflow's time limit. */
const BUDGET_MS = 40 * 60 * 1000;
/** Products must have launched within this many months. */
const WINDOW_MONTHS = 18;
/** A backfilled product is kept only with this many verified reviews (from outlets already in data/outlets.json). */
const MIN_REVIEWS_BACKFILL = 5;
/** A live category under this many products is "thin" and filled first. */
const THIN_BELOW = 12;
/** The backfill stops once every category has this many products. */
const FULL_AT = 15;
/** Candidates the backfill rejected are not tried again for this long (days). */
const REJECT_DAYS = 90;
/** A category the backfill worked on this many runs in a row without adding anything is left alone for PAUSE_DAYS. */
const PAUSE_AFTER_MISSES = 3;
const PAUSE_DAYS = 14;
/** docs/CARETAKER.md: no product added for this many days while work remains is a stalled backfill. */
const STALL_DAYS = 7;
/** Keys in data/refresh-rejected.json: "backfill:<product id>" (page keys are urlKey()s). */
const REJECT_PREFIX = 'backfill:';
/** Thin categories that go first, in this order. */
const FIRST = ['tablet', 'console'];

/** What each category holds, for the candidate search. @type {Record<string, string>} */
const CATEGORY_HINT = {
  phone: 'smartphones',
  foldable: 'foldable phones (book-style folds and flip phones)',
  tablet: 'tablets',
  laptop: 'laptops',
  headphones: 'over-ear and on-ear headphones',
  watch: 'smartwatches and fitness watches',
  console: 'game consoles',
  wearable: 'smart glasses, VR and AR headsets, smart rings and other wearables',
  earbuds: 'true wireless in-ear earbuds',
  tv: 'televisions',
  camera: 'digital cameras (mirrorless, compact and action cameras, not lenses or accessories)',
  'e-reader': 'e-readers (dedicated e-ink book readers)',
  handheld: 'handheld gaming consoles and handheld gaming PCs',
};

/** @typedef {import('../../src/lib/data-types').Product} Product */
/** @typedef {import('../../src/lib/data-types').Review} Review */
/** @typedef {import('../../src/lib/data-types').Category} Category */
/**
 * @typedef {object} Config src/config/categories.json
 * @property {string[]} categories
 * @property {{order: string[], minProducts: number, minReviews: number}} expansion
 */
/**
 * @typedef {object} State data/backfill-state.json
 * @property {string} since the day the backfill first ran
 * @property {string | null} lastRun the last day a category search worked (an outage does not count)
 * @property {Record<string, {misses: number, pausedUntil?: string | null}>} categories
 */

/** @param {string} iso @param {number} n */
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
/** Whole days from a to b (both YYYY-MM-DD). @param {string} a @param {string} b */
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/** The date `n` calendar months before `iso`. @param {string} iso @param {number} n */
function monthsBefore(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * The categories the site shows: the original ones always, an expansion category once it has
 * minProducts products with minReviews reviews each. Same rule as src/lib/category-gate.ts.
 * @param {Pick<Product, 'id' | 'category'>[]} products
 * @param {Pick<Review, 'productId'>[]} reviews
 * @param {Config} config
 * @returns {Set<string>}
 */
function liveCategories(products, reviews, config) {
  const { order, minProducts, minReviews } = config.expansion;
  /** @type {Map<string, number>} */
  const reviewCount = new Map();
  for (const r of reviews) reviewCount.set(r.productId, (reviewCount.get(r.productId) ?? 0) + 1);
  const live = new Set(config.categories);
  for (const c of order) {
    const ready = products.filter((p) => p.category === c && (reviewCount.get(p.id) ?? 0) >= minReviews).length;
    if (ready < minProducts) live.delete(c);
  }
  return live;
}

/** @param {string} today @returns {State} */
const initialState = (today) => ({ since: today, lastRun: null, categories: {} });

/** True while a category is resting after repeated empty runs. @param {State} state @param {string} category @param {string} today */
const isPaused = (state, category, today) => (state.categories[category]?.pausedUntil ?? '') > today;

/**
 * The category to fill next, or null when there is nothing left to do.
 * @param {object} o
 * @param {Pick<Product, 'id' | 'category'>[]} o.products products on the site, plus any added earlier in this run
 * @param {Pick<Review, 'productId'>[]} o.reviews
 * @param {Config} o.config
 * @param {State} o.state
 * @param {string} o.today
 * @param {Set<string>} [o.skip] categories already worked on in this run
 * @param {boolean} [o.ignorePauses] for the status report: a resting category still has work to do
 * @returns {{category: string, why: 'thin' | 'new' | 'top-up'} | null}
 */
function pickCategory({ products, reviews, config, state, today, skip = new Set(), ignorePauses = false }) {
  const live = liveCategories(products, reviews, config);
  const count = (/** @type {string} */ c) => products.filter((p) => p.category === c).length;
  const open = (/** @type {string} */ c) => !skip.has(c) && (ignorePauses || !isPaused(state, c, today));
  const order = (/** @type {string} */ c) => config.categories.indexOf(c);
  const first = (/** @type {string} */ c) => (FIRST.includes(c) ? FIRST.indexOf(c) : FIRST.length);

  const thin = config.categories
    .filter((c) => live.has(c) && count(c) < THIN_BELOW && open(c))
    .sort((a, b) => first(a) - first(b) || count(a) - count(b) || order(a) - order(b));
  if (thin.length) return { category: thin[0], why: 'thin' };

  const next = config.expansion.order.find((c) => !live.has(c) && open(c));
  if (next) return { category: next, why: 'new' };

  const topUp = config.categories
    .filter((c) => live.has(c) && count(c) < FULL_AT && open(c))
    .sort((a, b) => count(a) - count(b) || order(a) - order(b));
  return topUp.length ? { category: topUp[0], why: 'top-up' } : null;
}

/**
 * The state after a run worked on `category`. Only call it when the search itself worked: an API outage
 * says nothing about the category. A category that comes up empty three runs in a row rests for two weeks, so
 * one with no more good candidates cannot hold up the ones behind it.
 * @param {State} state
 * @param {string} category
 * @param {number} added products kept from this category
 * @param {string} today
 * @returns {State}
 */
function noteCategory(state, category, added, today) {
  const next = structuredClone(state);
  next.lastRun = today;
  if (added > 0) {
    next.categories[category] = { misses: 0, pausedUntil: null };
    return next;
  }
  const misses = (next.categories[category]?.misses ?? 0) + 1;
  next.categories[category] =
    misses >= PAUSE_AFTER_MISSES
      ? { misses: 0, pausedUntil: addDays(today, PAUSE_DAYS) }
      : { misses, pausedUntil: null };
  return next;
}

/**
 * The prompt that asks for candidates. The site's own products in the category and earlier rejects are named
 * so the answer is mostly new; the pipeline still checks every candidate against the site by name.
 * @param {object} o
 * @param {string} o.today
 * @param {string} o.category
 * @param {string[]} o.known names already on the site in this category
 * @param {string[]} o.rejected ids of products the backfill rejected before
 */
function candidatePrompt({ today, category, known, rejected }) {
  const since = monthsBefore(today, WINDOW_MONTHS);
  const kind = CATEGORY_HINT[category] || category;
  return `Today is ${today}. Using search, list up to 8 ${kind} that went on sale in the US between ${since} and ${today} and were reviewed by many professional tech outlets, best reviewed first. Each must have at least 5 published written reviews with a verdict from outlets such as The Verge, CNET, Engadget, Wired, PCMag, TechRadar, Tom's Guide, ZDNET, Digital Trends or Trusted Reviews.${
    known.length ? `\nAlready on our site, leave these out: ${known.join('; ')}.` : ''
  }${rejected.length ? `\nChecked before and not usable, leave these out: ${rejected.join('; ')}.` : ''}
Reply with a JSON array only: [{"name":"","brand":"","releaseDate":"YYYY-MM-DD","launchPrice":<US launch price, USD number>,"officialUrl":"https://..."}]. "releaseDate" is the day it first went on sale in the US (not the announcement day; the first reviews are normally dated in the weeks before it), taken from the maker's own announcement or the reviews. "name" is the model name reviewers use, without the brand. "officialUrl" is this product's own page on the brand's site, never the home page or a category page. Use only facts you saw in search results.`;
}

/**
 * The candidates that can be examined: named, launched inside the window, priced, with a brand page.
 * The category is the one asked for, whatever the model says.
 * @param {unknown} raw parsed model answer
 * @param {Category} category
 * @param {string} today
 * @returns {{name: string, brand: string, category: Category, releaseDate: string, launchPrice: number, officialUrl: string}[]}
 */
function usableCandidates(raw, category, today) {
  const since = monthsBefore(today, WINDOW_MONTHS);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (c) =>
        c &&
        typeof c.name === 'string' &&
        c.name.trim() &&
        typeof c.brand === 'string' &&
        c.brand.trim() &&
        /^\d{4}-\d{2}-\d{2}$/.test(c.releaseDate) &&
        c.releaseDate <= today &&
        c.releaseDate >= since &&
        Number.isFinite(c.launchPrice) &&
        /^https:\/\//.test(c.officialUrl || ''),
    )
    .map((c) => ({ ...c, category }));
}

/** The data/refresh-rejected.json key for a rejected product. @param {string} id */
const rejectKey = (id) => `${REJECT_PREFIX}${id}`;

/** Product ids the backfill rejected and has not yet forgotten. @param {Record<string, string>} rejected */
const rejectedIds = (rejected) =>
  Object.keys(rejected)
    .filter((k) => k.startsWith(REJECT_PREFIX))
    .map((k) => k.slice(REJECT_PREFIX.length));

/**
 * The entries of data/refresh-rejected.json still in force: pages for `pageDays`, backfill candidates for REJECT_DAYS.
 * @param {Record<string, string>} rejected
 * @param {string} today
 * @param {number} pageDays
 */
function keepRejected(rejected, today, pageDays) {
  return Object.fromEntries(
    Object.entries(rejected)
      .filter(([k, d]) => d >= addDays(today, -(k.startsWith(REJECT_PREFIX) ? REJECT_DAYS : pageDays)))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

/**
 * Where the backfill stands, for docs/CARETAKER.md. "stalled" means work remains and no product has
 * been added for STALL_DAYS days (or since the backfill first ran, when none ever was).
 * @param {object} o
 * @param {Pick<Product, 'id' | 'category' | 'backfilled'>[]} o.products
 * @param {Pick<Review, 'productId'>[]} o.reviews
 * @param {Config} o.config
 * @param {State} o.state
 * @param {string} o.today
 */
function backfillStatus({ products, reviews, config, state, today }) {
  const live = liveCategories(products, reviews, config);
  const rows = config.categories.map((c) => ({
    category: c,
    products: products.filter((p) => p.category === c).length,
    live: live.has(c),
    pausedUntil: isPaused(state, c, today) ? (state.categories[c]?.pausedUntil ?? null) : null,
  }));
  const next = pickCategory({ products, reviews, config, state, today, ignorePauses: true });
  // The products themselves say when the backfill last added one: a product dropped again does not count.
  const lastAdded = products.reduce((max, p) => (p.backfilled && p.backfilled > max ? p.backfilled : max), '') || null;
  const quietDays = daysBetween(lastAdded ?? state.since, today);
  const verdict = !next ? 'complete' : quietDays >= STALL_DAYS ? 'stalled' : 'ok';
  return { verdict, next, quietDays, lastAdded, lastRun: state.lastRun, since: state.since, rows };
}

module.exports = {
  MAX_PER_RUN,
  MAX_ATTEMPTS,
  MAX_CHECKED,
  MAX_SEARCHES,
  BUDGET_MS,
  WINDOW_MONTHS,
  MIN_REVIEWS_BACKFILL,
  THIN_BELOW,
  FULL_AT,
  REJECT_DAYS,
  PAUSE_AFTER_MISSES,
  PAUSE_DAYS,
  STALL_DAYS,
  REJECT_PREFIX,
  addDays,
  daysBetween,
  monthsBefore,
  liveCategories,
  initialState,
  isPaused,
  pickCategory,
  noteCategory,
  candidatePrompt,
  usableCandidates,
  rejectKey,
  rejectedIds,
  keepRejected,
  backfillStatus,
};
