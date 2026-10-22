#!/usr/bin/env node
// Merge researched product files into data/*.json.
// Usage: node scripts/import-product.js <file.json> [...more]
// File shape: {product, reviews, newOutlets?} replaces a product and its reviews;
// {productId, reviews, newOutlets?} appends reviews to an existing product.
// The merged data is validated in memory first, so a bad file never reaches data/.
const fs = require('fs');
const { DATA_DIR, loadData, writeData, loadCategories } = require('./lib/data-files');
const { importAll } = require('./lib/import');

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error('usage: import-product.js <file.json> [...]');
  process.exit(2);
}

const files = paths.map((f) => ({ label: f, content: JSON.parse(fs.readFileSync(f, 'utf8')) }));
const { data, errors, messages } = importAll(loadData(DATA_DIR), files, loadCategories());
for (const m of messages) console.log(m);
if (errors.length) {
  console.error(`\n${errors.length} error(s), data/ left unchanged:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
writeData(DATA_DIR, data);
console.log('data OK');
