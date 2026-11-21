// Finding review URLs by searching each outlet for the product, instead of asking a model to remember them. Gemini with Google
// Search grounding returns many URLs that do not exist (about half of the backfill's candidate pages were "page missing"), so the
// primary source is a Google query per outlet, `site:<domain> "<product>" review`, through ScrapingDog's Google endpoint (the key the
// fetch ladder already uses, SCRAPINGDOG_API_KEY). Every result still goes through the same page checks and the word-for-word quote
// check as any other candidate: the search only FINDS pages. Without a key, or when searches keep failing, the caller falls back to Gemini.
//
// Cost control: every search is counted in the fetch ladder's usage log (shared by every script of the run) against a per-product
// and a per-run limit, and its time against SERP_TIME_CAP_S (kept apart from the ladder's time for paid page reads); answers are
// cached for the run, so asking the same question twice costs nothing.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dir, takeSerpRequest, recordSerpTime, readUsage } = require('./fetch-ladder');
const { MODEL_WORD, matchProduct, mentionsSibling } = require('./feeds');
const { outletFor } = require('./outlets');

const SEARCH_TIMEOUT_MS = 30_000;
/** Results kept per outlet, best first: one is usually the review, a second covers a joint or follow-up piece. */
const PER_OUTLET = 2;
/** After this many failed searches in a row the search is treated as down for the rest of the process. */
const MAX_FAILURES = 3;
let failures = 0;

/** True when a search can be tried: a key is set and the search has not failed repeatedly. */
const available = () => !!process.env.SCRAPINGDOG_API_KEY && failures < MAX_FAILURES;

/**
 * The name as a search phrase: brackets opened, years and storage sizes dropped, "+" spelled out.
 * "MacBook Air (M5, 2026)" -> "MacBook Air M5", "Galaxy S26+" -> "Galaxy S26 Plus".
 * @param {string} name
 */
function searchName(name) {
  return name
    .replace(/\(([^)]*)\)/g, (_, /** @type {string} */ inner) =>
      inner
        .split(/,\s*/)
        .filter((x) => !/^(20\d\d|\d+\s?(gb|tb)|\d+(\.\d+)?[- ]?inch)$/i.test(x.trim()))
        .join(' '),
    )
    .replace(/\+/g, ' Plus')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param {string} query */
const cacheFile = (query) => path.join(dir(), 'serp', `${crypto.createHash('md5').update(query).digest('hex')}.json`);

/** Google's own redirect links (google.com/url?...&url=<opaque token>) cannot be followed without a browser, so they are dropped. @param {string} u */
const isGoogleWrapper = (u) => /^https?:\/\/(www\.)?google\.[a-z.]+\/(url|goto)\b/i.test(u);

/**
 * Google results for a query: [{link, title}], or null when the search could not be made (no key, cap spent, or an error).
 * The search service sometimes ignores the site: operator and answers with other sites (YouTube, Facebook). Such an answer is
 * returned but not cached, so asking again can get a real one.
 * @param {string} query
 * @param {number} limit searches allowed in this run (see takeSerpRequest)
 * @param {(link: string) => boolean} [onSite] true for a result on the site searched; an answer with none is not cached
 * @returns {Promise<{link: string, title: string}[] | null>}
 */
async function serpSearch(query, limit, onSite = () => true) {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(query), 'utf8'));
  } catch {
    /* not cached */
  }
  if (!available() || !takeSerpRequest(limit)) return null;
  const started = Date.now();
  try {
    const res = await fetch(
      `https://api.scrapingdog.com/google?${new URLSearchParams({ api_key: process.env.SCRAPINGDOG_API_KEY || '', query, results: '10' })}`,
      { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (body?.success === false) throw new Error('search refused');
    /** @type {{link?: unknown, title?: unknown}[]} */
    const organic = Array.isArray(body?.organic_results) ? body.organic_results : [];
    const found = organic
      .filter((r) => typeof r.link === 'string' && !isGoogleWrapper(String(r.link)))
      .map((r) => ({ link: String(r.link), title: typeof r.title === 'string' ? r.title : '' }));
    failures = 0;
    if (found.some((r) => onSite(r.link))) {
      fs.mkdirSync(path.dirname(cacheFile(query)), { recursive: true });
      fs.writeFileSync(cacheFile(query), JSON.stringify(found));
    }
    return found;
  } catch {
    failures++; // the message is dropped on purpose: the request URL carries the API key
    return null;
  } finally {
    recordSerpTime(Date.now() - started);
  }
}

/** Index, tag, author and search pages are lists, never the review. @param {string} u */
function isListingUrl(u) {
  try {
    const { pathname } = new URL(u);
    return (
      pathname.replace(/\/+$/, '') === '' ||
      /\/(tag|tags|category|categories|topic|topics|author|authors|search|page|archive|forums?|threads)\//i.test(
        pathname + '/',
      )
    );
  } catch {
    return true;
  }
}

/**
 * The results worth reading for one product on one outlet, best first. A result whose title (or address) names a sibling of the
 * product ("Pixel 10a" for the Pixel 10) is dropped before it costs a page fetch; one that names the product and says "review"
 * ranks first. A title that names no product at all is kept, below those, for the page checks to judge.
 * @param {{link: string, title: string}[]} results
 * @param {{id: string, name: string, brand: string}} product
 * @param {{id: string}} outlet the outlet searched
 * @param {{id: string, domain: string, altDomains?: string[]}[]} outlets
 * @param {{id: string, name: string, brand: string}[]} [others] other products on the site: a result about one of them is dropped
 * @param {{requireNamed?: boolean}} [opts] keep only results whose title or address names the product (for a loose search,
 *   whose other results are anything the outlet ever wrote with those words)
 */
function pickResults(results, product, outlet, outlets, others = [], { requireNamed = false } = {}) {
  const rest = others.filter((p) => p.id !== product.id);
  // The product with its last model word dropped ("Galaxy S26" for the Galaxy S26 Ultra): a result naming that, and not the
  // product, is about the smaller sibling even when the site does not carry it.
  const words = product.name.trim().split(/\s+/);
  const last = (words[words.length - 1] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const shorter =
    words.length > 2 && MODEL_WORD.test(last) && !/^\d+$/.test(last)
      ? [{ id: `${product.id}~base`, name: words.slice(0, -1).join(' '), brand: product.brand }]
      : [];
  const seen = new Set();
  return results
    .map((r) => {
      const slug = (() => {
        try {
          return decodeURIComponent(new URL(r.link).pathname).replace(/[-_/.]+/g, ' ');
        } catch {
          return '';
        }
      })();
      const fields = [r.title, slug].filter(Boolean);
      const sibling =
        fields.some((f) => mentionsSibling(f, product)) && !fields.some((f) => matchProduct(f, [product]));
      const named = fields.some((f) => matchProduct(f, [product]));
      // "Galaxy S26 review" for the Galaxy S26 Ultra: the result is about another product the site has.
      const another = !named && fields.some((f) => matchProduct(f, rest) || matchProduct(f, shorter));
      const score = (named ? 2 : 0) + (/review/i.test(`${r.title} ${slug}`) ? 1 : 0) - (sibling || another ? 10 : 0);
      return { link: r.link, score: requireNamed && !named ? -1 : score };
    })
    .filter((r) => r.score >= 0 && outletFor(r.link, outlets)?.id === outlet.id && !isListingUrl(r.link))
    .filter((r) => (seen.has(r.link) ? false : (seen.add(r.link), true)))
    .sort((a, b) => b.score - a.score)
    .slice(0, PER_OUTLET)
    .map((r) => r.link);
}

/**
 * Review URLs for a product, searching outlets in `rank` order (the caller puts the ones that review this kind of product most
 * often first) until `maxQueries` searches have been made for it. One outlet takes 1 to 3 searches (see below); answers from the
 * cache are free and not counted.
 * @param {{id: string, name: string, brand: string}} product
 * @param {{id: string, name: string, tier: number, domain: string, altDomains?: string[]}[]} outlets every known outlet
 * @param {object} o
 * @param {Set<string>} o.skip outlet ids that already have a review of the product
 * @param {number} o.maxTier only outlets of this tier or better are searched (2 = the major outlets)
 * @param {number} o.maxQueries searches for this product
 * @param {number} o.runLimit searches allowed in the whole run
 * @param {(o: {id: string, tier: number}) => number} [o.rank] lower first; defaults to the tier
 * @param {{id: string, name: string, brand: string}[]} [o.others] every product on the site (see pickResults)
 * @returns {Promise<{urls: string[], searchedIds: string[], failed: number}>}
 */
async function findByOutletSearch(
  product,
  outlets,
  { skip, maxTier, maxQueries, runLimit, rank = (o) => o.tier, others = [] },
) {
  const phrase = searchName(product.name);
  const todo = outlets.filter((o) => !skip.has(o.id) && o.tier <= maxTier).sort((a, b) => rank(a) - rank(b));
  const startedAt = readUsage().serp;
  const spent = () => readUsage().serp - startedAt;
  /** @type {string[]} */
  const urls = [];
  /** @type {string[]} */
  const searchedIds = [];
  let failed = 0;
  for (const outlet of todo) {
    if (!available() || spent() >= maxQueries) break;
    const onSite = (/** @type {string} */ u) => outletFor(u, outlets)?.id === outlet.id;
    // Titles with "review" in them first: that puts the outlet's review above its news, deals and how-to pages. The service
    // sometimes ignores site: (an answer with nothing from the outlet), so that question is asked once more. When it still gives
    // nothing usable (the outlet names the product differently), one looser search without the exact phrase.
    const strict = `site:${outlet.domain} "${phrase}" intitle:review`;
    /** One search, unless this product has had its share (a cached answer is free, so it is always looked up). @param {string} q */
    const ask = (q) => serpSearch(q, spent() >= maxQueries ? 0 : runLimit, onSite);
    let results = await ask(strict);
    if (results && !results.some((r) => onSite(r.link))) results = await ask(strict);
    let picks = results ? pickResults(results, product, outlet, outlets, others) : [];
    // An outlet counts as searched only when every search it needed was made: one cut short by a cap is tried again by a
    // later, wider pass.
    let complete = !!results;
    if (results && !picks.length) {
      const loose = await ask(`site:${outlet.domain} ${phrase} review`);
      if (loose) picks = pickResults(loose, product, outlet, outlets, others, { requireNamed: true });
      else complete = false;
    }
    if (!results) failed++;
    if (complete) searchedIds.push(outlet.id);
    urls.push(...picks);
  }
  return { urls, searchedIds, failed };
}

module.exports = { findByOutletSearch, pickResults, searchName, serpSearch, isListingUrl, isGoogleWrapper, available };
