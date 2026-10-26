// Data rules for data/*.json, as a pure function so the CLI (validate-data.js),
// the importer and the tests all run exactly the same checks.
// Guards the rules that keep scores honest: every review links to its source,
// published ratings convert exactly, and excerpts stay short quotes.
const fs = require('fs');
const path = require('path');
const { ratingToBand } = require('./rating-band');
const { productCopyViolations } = require('./copy-voice');

const MAX_EXCERPT_WORDS = 45;
/** Fewer real words than this is not a quote ("..." would otherwise match any page). */
const MIN_EXCERPT_WORDS = 3;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Real calendar dates only: "2026-13-40" fails even though it matches the pattern. */
/** @param {unknown} s @returns {s is string} */
function isIsoDate(s) {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const bareHost = (/** @type {string} */ d) => d.replace(/^www\./, '');

/** True for a parseable https URL with no whitespace ("https://x.com:99999" is not parseable). */
/** @param {unknown} s @returns {s is string} */
function isHttpsUrl(s) {
  if (typeof s !== 'string' || /\s/.test(s)) return false;
  try {
    return new URL(s).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The optional press photo (docs/IMAGES.md): credit and source page are required,
 * and when `publicDir` is given both files must exist on disk.
 * @param {import('./data-files').DataSet['products'][number]} p
 * @param {string[]} errors
 * @param {string | undefined} publicDir
 */
function validateImage(p, errors, publicDir) {
  const img = /** @type {Partial<import('../../src/lib/data-types').ProductPhoto>} */ (p.image);
  for (const k of /** @type {const} */ (['src', 'thumb', 'alt', 'credit', 'sourceUrl']))
    if (!img[k] || typeof img[k] !== 'string') errors.push(`product ${p.id}: image.${k} is required`);
  if (img.sourceUrl && !isHttpsUrl(img.sourceUrl)) errors.push(`product ${p.id}: image.sourceUrl must be https`);
  for (const k of /** @type {const} */ (['src', 'thumb'])) {
    const f = img[k];
    if (!f) continue;
    // Exactly the layout add-product-image.js writes; also rules out "../" escaping public/.
    if (!new RegExp(`^/images/products/${p.slug}/[a-z0-9-]+\\.webp$`).test(f))
      errors.push(`product ${p.id}: image.${k} must be a .webp under /images/products/${p.slug}/`);
    else if (publicDir && !fs.existsSync(path.join(publicDir, f)))
      errors.push(`product ${p.id}: image.${k} file not found (${f})`);
  }
}

/**
 * @param {import('./data-files').DataSet & {categories: {categories: string[], artKinds: string[]}, publicDir?: string}} data
 * @param {{today?: string}} [opts] `today` (YYYY-MM-DD) bounds review dates; defaults to the current UTC date
 * @returns {string[]} human-readable errors; empty when the data is valid
 */
function validateData(
  { products, reviews, outlets, categories, publicDir },
  { today = new Date().toISOString().slice(0, 10) } = {},
) {
  const errors = [];
  const outletsById = new Map(outlets.map((o) => [o.id, o]));
  const productIds = new Set(products.map((p) => p.id));

  /** @type {[string, string[]][]} */
  const idLists = [
    ['product id', products.map((p) => p.id)],
    ['product slug', products.map((p) => p.slug)],
    ['outlet id', outlets.map((o) => o.id)],
  ];
  for (const [label, ids] of idLists) {
    const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
    if (dupes.length) errors.push(`duplicate ${label}: ${[...new Set(dupes)].join(', ')}`);
  }

  for (const o of outlets) {
    if (![1, 2, 3, 4].includes(o.tier)) errors.push(`outlet ${o.id}: tier must be 1-4`);
  }

  for (const p of products) {
    if (!isIsoDate(p.releaseDate)) errors.push(`product ${p.id}: bad releaseDate`);
    for (const k of /** @type {const} */ (['name', 'brand', 'criticsTake', 'art']))
      if (!p[k]) errors.push(`product ${p.id}: missing ${k}`);
    for (const k of /** @type {const} */ (['loved', 'gripes', 'specs']))
      if (!Array.isArray(p[k]) || p[k].length === 0) errors.push(`product ${p.id}: ${k} must be a non-empty list`);
    if (!SLUG_RE.test(p.slug || '')) errors.push(`product ${p.id}: slug must be lowercase words joined by hyphens`);
    if (p.officialUrl != null && !isHttpsUrl(p.officialUrl)) errors.push(`product ${p.id}: officialUrl must be https`);
    if (!categories.categories.includes(p.category)) errors.push(`product ${p.id}: unknown category "${p.category}"`);
    if (p.art && !categories.artKinds.includes(p.art.kind))
      errors.push(`product ${p.id}: unknown art.kind "${p.art.kind}"`);
    if (p.image) validateImage(p, errors, publicDir);
  }
  // The owner's voice rules for written copy (no em dashes, no stock AI phrases). Checked here, not only
  // in the tests, because the weekly refresh writes launch cards and its commits do not run CI.
  for (const v of productCopyViolations(products)) errors.push(`copy rule: ${v}`);

  const seen = new Set();
  reviews.forEach((r, i) => {
    const at = `review #${i} (${r.productId}/${r.outletId})`;
    const outlet = outletsById.get(r.outletId);
    if (!productIds.has(r.productId)) errors.push(`${at}: unknown product`);
    if (!outlet) errors.push(`${at}: unknown outlet`);

    const key = `${r.productId}|${r.outletId}`;
    if (seen.has(key)) errors.push(`${at}: duplicate outlet for product`);
    seen.add(key);

    if (!isHttpsUrl(r.url)) errors.push(`${at}: url must be a valid https URL`);
    else if (outlet) {
      // The link must go to the outlet the review is credited to (catches a swapped or pasted-wrong URL).
      const host = bareHost(new URL(r.url).hostname);
      const domains = [outlet.domain, ...(outlet.altDomains || [])].map(bareHost);
      if (!domains.some((d) => host === d || host.endsWith(`.${d}`)))
        errors.push(`${at}: url host ${host} is not ${domains.join(' or ')}`);
    }

    if (!isIsoDate(r.date)) errors.push(`${at}: bad date`);
    else if (r.date > today) errors.push(`${at}: date ${r.date} is in the future`);
    if (!(Number.isInteger(r.score) && r.score >= 0 && r.score <= 100))
      errors.push(`${at}: score must be an integer 0-100`);
    if (!['rating', 'text'].includes(r.scoreSource)) errors.push(`${at}: scoreSource must be rating|text`);

    if (r.scoreSource === 'rating') {
      // A published rating is a band; the score must sit inside it.
      const band = r.rating ? ratingToBand(r.rating) : null;
      if (!r.rating) errors.push(`${at}: scoreSource "rating" needs a rating`);
      else if (!band) errors.push(`${at}: cannot parse rating "${r.rating}"`);
      else if (r.score < band.floor || r.score > band.ceiling)
        errors.push(`${at}: score ${r.score} is outside the ${r.rating} band ${band.floor}-${band.ceiling}`);
      else if (r.scoreBand && (r.scoreBand[0] !== band.floor || r.scoreBand[1] !== band.ceiling)) {
        errors.push(
          `${at}: stored scoreBand ${r.scoreBand} does not match the ${r.rating} band; run score-reviews.js --only=${r.productId}`,
        );
      }
    }
    if (r.scoreSource === 'text' && r.rating) errors.push(`${at}: text-scored review must not carry a rating`);

    if (r.adjudicatedScore != null) {
      // A person's placement replaces the models' average, under the same band rule.
      const band = r.rating ? ratingToBand(r.rating) : { floor: 0, ceiling: 100 };
      const a = r.adjudicatedScore;
      if (!band || !Number.isInteger(a) || a < band.floor || a > band.ceiling)
        errors.push(
          `${at}: adjudicatedScore ${a} must be an integer inside the band${band ? ` ${band.floor}-${band.ceiling}` : ''}`,
        );
      else if (r.score !== a) errors.push(`${at}: score ${r.score} must equal adjudicatedScore ${a}`);
      if (!r.adjudicationReason || !String(r.adjudicationReason).trim())
        errors.push(`${at}: adjudicatedScore needs an adjudicationReason`);
    }

    const text = (r.excerpt || '').trim();
    const words = text.split(/\s+/).filter(Boolean).length;
    const realWords = (text.match(/[\p{L}\p{N}]+/gu) || []).length;
    if (realWords < MIN_EXCERPT_WORDS || words > MAX_EXCERPT_WORDS)
      errors.push(`${at}: excerpt must be ${MIN_EXCERPT_WORDS}-${MAX_EXCERPT_WORDS} words (has ${words})`);
  });

  return errors;
}

module.exports = { validateData, isIsoDate, isHttpsUrl, MAX_EXCERPT_WORDS, MIN_EXCERPT_WORDS };
