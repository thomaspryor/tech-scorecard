#!/usr/bin/env node
// Validates data/*.json before build. Exit 1 on any error.
// Guards the rules that keep scores honest: every review links to its source,
// published ratings convert exactly, and excerpts stay short quotes.
const fs = require('fs');
const path = require('path');

const errors = [];
const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));
const products = read('products.json');
const reviews = read('reviews.json');
const outlets = read('outlets.json');

const outletIds = new Set(outlets.map((o) => o.id));
const productIds = new Set(products.map((p) => p.id));
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
// Real calendar dates only (2026-13-40 fails).
const ISO = { test: (s) => ISO_RE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s };

for (const [label, ids] of [['product id', products.map((p) => p.id)], ['product slug', products.map((p) => p.slug)], ['outlet id', outlets.map((o) => o.id)]]) {
  const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dupes.length) errors.push(`duplicate ${label}: ${[...new Set(dupes)].join(', ')}`);
}

for (const o of outlets) {
  if (![1, 2, 3, 4].includes(o.tier)) errors.push(`outlet ${o.id}: tier must be 1-4`);
}
for (const p of products) {
  if (!ISO.test(p.releaseDate)) errors.push(`product ${p.id}: bad releaseDate`);
  for (const k of ['criticsTake', 'loved', 'gripes', 'specs', 'art']) if (!p[k]) errors.push(`product ${p.id}: missing ${k}`);
  // The home filter and DeviceArt only know these values; add a new one there first.
  if (!['phone', 'foldable', 'tablet', 'laptop', 'headphones', 'watch', 'console', 'wearable'].includes(p.category)) errors.push(`product ${p.id}: unknown category "${p.category}"`);
  if (p.art && !['phone', 'foldable', 'flip', 'tablet', 'laptop', 'headphones', 'earbuds', 'watch', 'console', 'glasses', 'headset'].includes(p.art.kind)) errors.push(`product ${p.id}: unknown art.kind "${p.art.kind}"`);
}

const { ratingToBand } = require('./lib/rating-band');

const seen = new Set();
reviews.forEach((r, i) => {
  const at = `review #${i} (${r.productId}/${r.outletId})`;
  if (!productIds.has(r.productId)) errors.push(`${at}: unknown product`);
  if (!outletIds.has(r.outletId)) errors.push(`${at}: unknown outlet`);
  const key = `${r.productId}|${r.outletId}`;
  if (seen.has(key)) errors.push(`${at}: duplicate outlet for product`);
  seen.add(key);
  if (!/^https:\/\/[^\s]+$/.test(r.url || '')) errors.push(`${at}: url must be https`);
  else if (outletIds.has(r.outletId)) {
    // The link must go to the outlet the review is credited to (catches a swapped or pasted-wrong URL).
    const host = new URL(r.url).hostname.replace(/^www\./, '');
    const outlet = outlets.find((o) => o.id === r.outletId);
    const domains = [outlet.domain, ...(outlet.altDomains || [])];
    if (!domains.some((d) => host === d || host.endsWith(`.${d}`))) errors.push(`${at}: url host ${host} is not ${domains.join(' or ')}`);
  }
  if (!ISO.test(r.date || '')) errors.push(`${at}: bad date`);
  if (!(Number.isInteger(r.score) && r.score >= 0 && r.score <= 100)) errors.push(`${at}: score must be an integer 0-100`);
  if (!['rating', 'text'].includes(r.scoreSource)) errors.push(`${at}: scoreSource must be rating|text`);
  if (r.scoreSource === 'rating') {
    // A published rating is a band (Broadway Scorecard rule); the score must sit inside it.
    const band = r.rating ? ratingToBand(r.rating) : null;
    if (!r.rating) errors.push(`${at}: scoreSource "rating" needs a rating`);
    else if (!band) errors.push(`${at}: cannot parse rating "${r.rating}"`);
    else if (r.score < band.floor || r.score > band.ceiling) errors.push(`${at}: score ${r.score} is outside the ${r.rating} band ${band.floor}-${band.ceiling}`);
    else if (r.scoreBand && (r.scoreBand[0] !== band.floor || r.scoreBand[1] !== band.ceiling)) errors.push(`${at}: stored scoreBand ${r.scoreBand} does not match the ${r.rating} band; re-run score-reviews.js`);
  }
  if (r.scoreSource === 'text' && r.rating) errors.push(`${at}: text-scored review must not carry a rating`);
  const words = (r.excerpt || '').trim().split(/\s+/).filter(Boolean).length;
  if (words === 0 || words > 45) errors.push(`${at}: excerpt must be 1-45 words (has ${words})`);
});

for (const p of products) {
  const n = reviews.filter((r) => r.productId === p.id).length;
  console.log(`${p.id}: ${n} reviews`);
}
if (errors.length) {
  console.error(`\n${errors.length} error(s):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log('data OK');
