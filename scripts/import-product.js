#!/usr/bin/env node
// Merge a researched product file into data/*.json.
// Usage: node scripts/import-product.js <file.json> [...more]
// File shape: { product, reviews, newOutlets? }. Replaces any existing
// product/reviews with the same id, adds new outlets, then runs validate-data.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ratingToBand } = require('./lib/rating-band');

const DATA = path.join(__dirname, '..', 'data');
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const save = (f, v) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 2) + '\n');

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: import-product.js <file.json> [...]'); process.exit(2); }

let products = load('products.json');
let reviews = load('reviews.json');
const outlets = load('outlets.json');

for (const f of files) {
  const parsed = JSON.parse(fs.readFileSync(f, 'utf8'));
  const { reviews: incoming, newOutlets = [] } = parsed;
  // Add-reviews mode: {productId, reviews} appends to an existing product and keeps what is there.
  const appendOnly = !parsed.product && parsed.productId;
  const product = parsed.product || products.find((p) => p.id === parsed.productId);
  if (!product || !product.id || !Array.isArray(incoming)) throw new Error(`${f}: needs product.id (or an existing productId) and reviews[]`);
  for (const o of newOutlets) {
    const bare = (d) => d.replace(/^www\./, '');
    // Same id, or the same outlet under another id (same name and site). Two outlets can share
    // a site (Digital Foundry and Eurogamer both on eurogamer.net), so a site alone is not a match.
    const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
    const clash = outlets.find((x) => x.id === o.id || (bare(x.domain) === bare(o.domain) && norm(x.name) === norm(o.name)));
    if (clash && clash.id === o.id && bare(clash.domain) !== bare(o.domain)) {
      // Same outlet publishing on another site (Digital Foundry on eurogamer.net): record the extra host.
      // A different name under the same id is a mistake, not a second site.
      if (norm(clash.name) !== norm(o.name)) throw new Error(`${f}: outlet id "${o.id}" is "${clash.name}" (${clash.domain}), not "${o.name}" (${o.domain})`);
      clash.altDomains = [...new Set([...(clash.altDomains || []), bare(o.domain)])];
    }
    if (!clash) outlets.push({ id: o.id, name: o.name, tier: o.tier, domain: o.domain });
    else if (clash.id !== o.id) {
      // Same domain under another id: point the reviews at the existing outlet.
      for (const r of incoming) if (r.outletId === o.id) r.outletId = clash.id;
    }
  }
  // Provisional score: clamp into the rating's band until score-reviews.js places it by reading the review.
  for (const r of incoming) {
    const band = r.rating ? ratingToBand(r.rating) : null;
    if (band) r.score = Number.isFinite(r.score) ? Math.min(band.ceiling, Math.max(band.floor, r.score)) : Math.round((band.floor + band.ceiling) / 2);
  }
  if (appendOnly) {
    const have = new Set(reviews.filter((r) => r.productId === product.id).map((r) => r.outletId));
    const added = incoming.filter((r) => !have.has(r.outletId));
    reviews = reviews.concat(added.map((r) => ({ ...r, productId: product.id })));
    console.log(`${product.id}: +${added.length} reviews (${incoming.length - added.length} already present)`);
    continue;
  }
  products = products.filter((p) => p.id !== product.id).concat(product);
  reviews = reviews.filter((r) => r.productId !== product.id).concat(incoming.map((r) => ({ ...r, productId: product.id })));
  console.log(`${product.id}: ${incoming.length} reviews (now run: node scripts/score-reviews.js --only=${product.id})`);
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
