#!/usr/bin/env node
// Remove reviews from data/reviews.json, e.g. after a failed quote check.
// Usage: node scripts/drop-reviews.js productId/outletId [...]
// The remaining data is validated before anything is written.
const path = require('path');
const { DATA_DIR, loadData, writeData, loadCategories } = require('./lib/data-files');
const { validateData } = require('./lib/validate');

/**
 * The reviews whose "productId/outletId" is not in `ids`.
 * @param {import('./lib/data-files').Review[]} reviews
 * @param {Iterable<string>} ids
 */
function dropReviews(reviews, ids) {
  const drop = new Set(ids);
  return reviews.filter((r) => !drop.has(`${r.productId}/${r.outletId}`));
}

if (require.main === module) {
  const data = loadData(DATA_DIR);
  const kept = dropReviews(data.reviews, process.argv.slice(2));
  const errors = validateData({
    ...data,
    reviews: kept,
    categories: loadCategories(),
    publicDir: path.join(__dirname, '..', 'public'),
  });
  if (errors.length) {
    console.error(`${errors.length} error(s), data/ left unchanged:\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`dropped ${data.reviews.length - kept.length}`);
  writeData(DATA_DIR, { reviews: kept });
}

module.exports = { dropReviews };
