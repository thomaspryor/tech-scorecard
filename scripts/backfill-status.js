#!/usr/bin/env node
// Where the daily backfill stands (docs/CARETAKER.md, section 5): products per category, what it works on next,
// and whether it has stalled. Exits 1 when it has: work remains and no product was added for 7 days.
// Usage: node scripts/backfill-status.js
const fs = require('fs');
const path = require('path');
const { DATA_DIR, loadData, loadCategories } = require('./lib/data-files');
const { backfillStatus, initialState, FULL_AT, THIN_BELOW } = require('./lib/backfill');

/** @param {string} file */
const stateFile = (file) => path.join(DATA_DIR, file);

if (require.main === module) {
  const today = new Date().toISOString().slice(0, 10);
  const { products, reviews } = loadData(DATA_DIR);
  const file = stateFile('backfill-state.json');
  const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : initialState(today);
  const s = backfillStatus({ products, reviews, config: loadCategories(), state, today });
  for (const r of s.rows)
    console.log(
      `${r.category.padEnd(11)} ${String(r.products).padStart(2)} products${r.live ? '' : '  (not live yet)'}${
        r.pausedUntil ? `  (resting until ${r.pausedUntil})` : ''
      }`,
    );
  console.log(`\nthin below ${THIN_BELOW}, done at ${FULL_AT} per category`);
  console.log(
    `last product added: ${s.lastAdded ?? 'never'}; last search run: ${s.lastRun ?? 'never'}; since ${s.since}`,
  );
  console.log(`products waiting for a photo: ${s.waitingForPhoto.length ? s.waitingForPhoto.join(', ') : 'none'}`);
  console.log(s.next ? `next: ${s.next.category} (${s.next.why})` : 'next: nothing, every category is full');
  console.log(`backfill: ${s.verdict} (${s.quietDays} days since the last product, or since the start)`);
  process.exit(s.verdict === 'stalled' ? 1 : 0);
}
