// Merge logic for scripts/import-product.js, kept free of I/O so it can be tested.
const { ratingToBand } = require('./rating-band');
const { validateData } = require('./validate');

/** @typedef {import('./data-files').DataSet} DataSet */
/**
 * @typedef {object} ImportFile
 * @property {import('./data-files').Product} [product]
 * @property {string} [productId]
 * @property {import('./data-files').Review[]} reviews
 * @property {import('./data-files').Outlet[]} [newOutlets]
 */

const bare = (d) => d.replace(/^www\./, '');
const normName = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Register newOutlets, reusing an existing outlet when it is the same one under another id.
 * Mutates `outlets` and the outletIds of `incoming`.
 */
function mergeOutlets(outlets, newOutlets, incoming, label) {
  for (const o of newOutlets) {
    // Same id, or the same outlet under another id (same name and site). Two outlets can share
    // a site (Digital Foundry and Eurogamer both on eurogamer.net), so a site alone is not a match.
    const clash = outlets.find(
      (x) => x.id === o.id || (bare(x.domain) === bare(o.domain) && normName(x.name) === normName(o.name)),
    );
    if (!clash) {
      outlets.push({ id: o.id, name: o.name, tier: o.tier, domain: o.domain });
    } else if (clash.id === o.id) {
      if (bare(clash.domain) === bare(o.domain)) continue;
      // Same outlet publishing on another site: record the extra host.
      // A different name under the same id is a mistake, not a second site.
      if (normName(clash.name) !== normName(o.name)) {
        throw new Error(
          `${label}: outlet id "${o.id}" is "${clash.name}" (${clash.domain}), not "${o.name}" (${o.domain})`,
        );
      }
      clash.altDomains = [...new Set([...(clash.altDomains || []), bare(o.domain)])];
    } else {
      // The same outlet already exists under another id: point the reviews at it.
      for (const r of incoming) if (r.outletId === o.id) r.outletId = clash.id;
    }
  }
}

/**
 * Provisional score for a rated review: clamp into the rating's band (or take the band's
 * midpoint) until score-reviews.js places it by reading the review.
 */
function provisionalScore(review) {
  const band = review.rating ? ratingToBand(review.rating) : null;
  if (!band) return review.score;
  return Number.isFinite(review.score)
    ? Math.min(band.ceiling, Math.max(band.floor, review.score))
    : Math.round((band.floor + band.ceiling) / 2);
}

/**
 * Apply one import file to the data set and return the new data set. Input is not mutated.
 *
 * Two shapes:
 * - `{product, reviews, newOutlets?}` replaces the product and all its reviews.
 * - `{productId, reviews, newOutlets?}` appends reviews to an existing product, skipping
 *   outlets that already reviewed it.
 *
 * @param {DataSet} data
 * @param {ImportFile} file
 * @param {string} [label] file name for error messages
 * @returns {{data: DataSet, message: string}}
 */
function applyImport(data, file, label = 'import') {
  const products = structuredClone(data.products);
  const outlets = structuredClone(data.outlets);
  let reviews = structuredClone(data.reviews);
  const incoming = structuredClone(file.reviews);

  const appendOnly = !file.product && !!file.productId;
  const product = file.product ? structuredClone(file.product) : products.find((p) => p.id === file.productId);
  if (!product || !product.id || !Array.isArray(incoming))
    throw new Error(`${label}: needs product.id (or an existing productId) and reviews[]`);

  mergeOutlets(outlets, file.newOutlets || [], incoming, label);
  for (const r of incoming) {
    const score = provisionalScore(r);
    if (score !== undefined) r.score = score;
  }
  const tagged = incoming.map((r) => ({ ...r, productId: product.id }));

  if (appendOnly) {
    const have = new Set(reviews.filter((r) => r.productId === product.id).map((r) => r.outletId));
    const added = tagged.filter((r) => !have.has(r.outletId));
    return {
      data: { products, outlets, reviews: reviews.concat(added) },
      message: `${product.id}: +${added.length} reviews (${incoming.length - added.length} already present)`,
    };
  }

  // Replace mode drops every existing review of the product, including ones added later by
  // append files. Name them so a re-import never loses reviews silently.
  const keep = new Set(tagged.map((r) => r.outletId));
  const dropped = reviews.filter((r) => r.productId === product.id && !keep.has(r.outletId)).map((r) => r.outletId);
  reviews = reviews.filter((r) => r.productId !== product.id).concat(tagged);
  const droppedNote = dropped.length
    ? `; REMOVED ${dropped.length} existing reviews not in the file: ${dropped.join(', ')}`
    : '';
  return {
    data: { products: products.filter((p) => p.id !== product.id).concat(product), outlets, reviews },
    message: `${product.id}: ${incoming.length} reviews${droppedNote} (now run: node scripts/score-reviews.js --only=${product.id})`,
  };
}

/**
 * Apply every file, then validate the result. Returns errors instead of data when the
 * combined result is invalid, so the caller never writes a bad data set.
 * @param {DataSet} data
 * @param {{label: string, content: ImportFile}[]} files
 * @param {{categories: string[], artKinds: string[]}} categories
 * @returns {{data?: DataSet, errors: string[], messages: string[]}}
 */
function importAll(data, files, categories) {
  let next = data;
  const messages = [];
  for (const { label, content } of files) {
    const res = applyImport(next, content, label);
    next = res.data;
    messages.push(res.message);
  }
  const errors = validateData({ ...next, categories });
  return errors.length ? { errors, messages } : { data: next, errors, messages };
}

module.exports = { applyImport, importAll, mergeOutlets, provisionalScore };
