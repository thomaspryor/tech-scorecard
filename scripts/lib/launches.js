// Rules for new launches found by the weekly refresh, kept free of I/O so they can be tested.

/** A product the refresh adds is kept only with at least this many verified reviews. */
const MIN_REVIEWS_NEW_PRODUCT = 6;
/** Launches older than this are not "new"; the search prompt asks for the same window. */
const LAUNCH_WINDOW_DAYS = 45;
/**
 * A candidate is a product we already have under another name when at least half of its reviews (and at
 * least 2) are pages already on the site. A sibling reviewed in a few combined articles
 * (Buds4 and Buds4 Pro share 2 pages) stays a new product.
 * @param {number} shared review URLs already on the site
 * @param {number} total review URLs the candidate collected
 */
const isRenamedDuplicate = (shared, total) => shared >= Math.max(2, Math.ceil(total / 2));

/** Lowercase letters and digits only, with "+" spelled out so "Galaxy S26+" stays apart from "Galaxy S26". */
const norm = (/** @type {string} */ s) =>
  s
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]/g, '');

/** The name without a leading brand: "Samsung Galaxy S26 Ultra" -> "galaxys26ultra". */
function bareName(/** @type {string} */ name, /** @type {string} */ brand) {
  const n = norm(name);
  const b = norm(brand);
  return b && n.startsWith(b) && n.length > b.length ? n.slice(b.length) : n;
}

/**
 * The existing product a launch candidate duplicates, or undefined. Brandless names are compared
 * only within the same brand, so "OnePlus 15" never matches another brand's "15".
 * @param {{name: string, brand: string, id: string}} candidate
 * @param {{name: string, brand: string, id: string, slug?: string}[]} products
 */
function knownProduct(candidate, products) {
  const full = norm(candidate.name);
  const bare = bareName(candidate.name, candidate.brand);
  const brand = norm(candidate.brand);
  return products.find(
    (p) =>
      p.id === candidate.id ||
      p.slug === candidate.id ||
      norm(p.name) === full ||
      (norm(p.brand) === brand && bareName(p.name, p.brand) === bare),
  );
}

/** Review URLs compared without scheme, "www.", query, hash or trailing slash. */
function urlKey(/** @type {string} */ u) {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return u;
  }
}

/**
 * How many of `urls` are already reviews on the site.
 * @param {string[]} urls
 * @param {{url: string}[]} reviews
 */
function sharedReviewUrls(urls, reviews) {
  const have = new Set(reviews.map((r) => urlKey(r.url)));
  return urls.filter((u) => have.has(urlKey(u))).length;
}

module.exports = {
  MIN_REVIEWS_NEW_PRODUCT,
  LAUNCH_WINDOW_DAYS,
  isRenamedDuplicate,
  knownProduct,
  sharedReviewUrls,
};
