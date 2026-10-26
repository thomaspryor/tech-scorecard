#!/usr/bin/env node
// Weekly refresh: a product the refresh added (autoAdded) needs MIN_REVIEWS_NEW_PRODUCT reviews left
// after the quote and scoring checks, or it is removed again with its reviews.
// Usage: node scripts/drop-thin-products.js
const { DATA_DIR, loadData, writeData } = require('./lib/data-files');
const { MIN_REVIEWS_NEW_PRODUCT } = require('./lib/launches');

/**
 * Ids of auto-added products with fewer than `min` reviews.
 * @param {import('./lib/data-files').DataSet} data
 * @param {number} [min]
 */
function thinProducts({ products, reviews }, min = MIN_REVIEWS_NEW_PRODUCT) {
  return products
    .filter((p) => p.autoAdded && reviews.filter((r) => r.productId === p.id).length < min)
    .map((p) => p.id);
}

if (require.main === module) {
  const data = loadData(DATA_DIR);
  const thin = thinProducts(data);
  if (thin.length) {
    console.log(`removing thin new products: ${thin.join(', ')}`);
    writeData(DATA_DIR, {
      products: data.products.filter((p) => !thin.includes(p.id)),
      reviews: data.reviews.filter((r) => !thin.includes(r.productId)),
    });
  }
}

module.exports = { thinProducts };
