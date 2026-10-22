#!/usr/bin/env node
// Merge a researched product file into data/*.json.
// Usage: node scripts/import-product.js <file.json> [...more]
// File shape: { product, reviews, newOutlets? }. Replaces any existing
// product/reviews with the same id, adds new outlets, then runs validate-data.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DATA = path.join(__dirname, '..', 'data');
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const save = (f, v) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 2) + '\n');

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: import-product.js <file.json> [...]'); process.exit(2); }

let products = load('products.json');
let reviews = load('reviews.json');
const outlets = load('outlets.json');

for (const f of files) {
  const { product, reviews: incoming, newOutlets = [] } = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!product || !product.id || !Array.isArray(incoming)) throw new Error(`${f}: needs product.id and reviews[]`);
  for (const o of newOutlets) {
    const bare = (d) => d.replace(/^www\./, '');
    const clash = outlets.find((x) => x.id === o.id || bare(x.domain) === bare(o.domain));
    if (clash && clash.id === o.id && bare(clash.domain) !== bare(o.domain)) {
      throw new Error(`${f}: outlet id "${o.id}" already exists with domain ${clash.domain}, not ${o.domain}`);
    }
    if (!clash) outlets.push({ id: o.id, name: o.name, tier: o.tier, domain: o.domain });
    else if (clash.id !== o.id) {
      // Same domain under another id: point the reviews at the existing outlet.
      for (const r of incoming) if (r.outletId === o.id) r.outletId = clash.id;
    }
  }
  products = products.filter((p) => p.id !== product.id).concat(product);
  reviews = reviews.filter((r) => r.productId !== product.id).concat(incoming.map((r) => ({ ...r, productId: product.id })));
  console.log(`${product.id}: ${incoming.length} reviews`);
}

// Write, validate, and roll back on failure so bad data never stays on disk.
const backup = Object.fromEntries(['products.json', 'reviews.json', 'outlets.json'].map((f) => [f, fs.readFileSync(path.join(DATA, f), 'utf8')]));
save('products.json', products);
save('reviews.json', reviews);
save('outlets.json', outlets);
try {
  execFileSync('node', [path.join(__dirname, 'validate-data.js')], { stdio: 'inherit' });
} catch {
  for (const [f, text] of Object.entries(backup)) fs.writeFileSync(path.join(DATA, f), text);
  console.error('Validation failed: data/ restored to its previous state.');
  process.exit(1);
}
