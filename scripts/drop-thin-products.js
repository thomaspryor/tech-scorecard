#!/usr/bin/env node
// Daily refresh: a product the refresh added (autoAdded) needs MIN_REVIEWS_NEW_PRODUCT reviews left
// after the quote and scoring checks, or it is removed again with its reviews. A product the backfill added
// needs MIN_REVIEWS_BACKFILL (5), and one removed here is recorded in data/refresh-rejected.json so the
// backfill does not pay to build it again every day.
// Usage: node scripts/drop-thin-products.js
const { DATA_DIR, loadData, writeData } = require('./lib/data-files');
const fs = require('fs');
const path = require('path');
const { MIN_REVIEWS_NEW_PRODUCT } = require('./lib/launches');
const { MIN_REVIEWS_BACKFILL, rejectKey } = require('./lib/backfill');
const { removeProductImage } = require('./lib/product-image');

/**
 * Ids of auto-added products with fewer reviews than they need: `min` for a new launch, MIN_REVIEWS_BACKFILL for a backfilled product.
 * @param {import('./lib/data-files').DataSet} data
 * @param {number} [min]
 */
function thinProducts({ products, reviews }, min = MIN_REVIEWS_NEW_PRODUCT) {
  return products
    .filter(
      (p) =>
        p.autoAdded && reviews.filter((r) => r.productId === p.id).length < (p.backfilled ? MIN_REVIEWS_BACKFILL : min),
    )
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
    // Its photo goes too (written when the launch was added).
    for (const id of thin) removeProductImage(data.products.find((p) => p.id === id)?.slug || id);
    const file = path.join(DATA_DIR, 'refresh-rejected.json');
    const rejected = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const today = new Date().toISOString().slice(0, 10);
    for (const p of data.products) if (thin.includes(p.id) && p.backfilled) rejected[rejectKey(p.id)] = today;
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(rejected).sort()), null, 2) + '\n');
  }
}

module.exports = { thinProducts };
