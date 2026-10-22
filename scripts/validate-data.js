#!/usr/bin/env node
// Validates data/*.json before build (npm prebuild). Exits 1 on any error.
// The rules live in scripts/lib/validate.js.
const { loadData, loadCategories } = require('./lib/data-files');
const { validateData } = require('./lib/validate');

const data = loadData();
const errors = validateData({
  ...data,
  categories: loadCategories(),
  publicDir: require('path').join(__dirname, '..', 'public'),
});

for (const p of data.products) {
  const n = data.reviews.filter((r) => r.productId === p.id).length;
  console.log(`${p.id}: ${n} reviews`);
}
if (errors.length) {
  console.error(`\n${errors.length} error(s):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log('data OK');
