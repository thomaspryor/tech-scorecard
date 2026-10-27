#!/usr/bin/env node
// Daily refresh: a review is published only once both models have scored it (modelScores).
// New reviews still missing a model after the retry are dropped, so one flaky API answer does not
// cost the whole run. Their products are marked unchecked in refresh-state.json so the next run
// looks again, and when most new reviews are dropped (a model is down) problems.txt gets a line so
// the workflow alerts. An older review without two scores means the data itself is wrong: fail.
// Usage: node scripts/drop-unscored.js <added.txt>   (one productId/outletId per line; problems.txt sits next to it)
const fs = require('fs');
const path = require('path');
const { DATA_DIR, loadData, writeData } = require('./lib/data-files');

/**
 * @param {import('./lib/data-files').Review[]} reviews
 * @param {Set<string>} added "productId/outletId" of this run's new reviews
 */
function unscored(reviews, added) {
  const missing = reviews.filter((r) => !r.modelScores).map((r) => `${r.productId}/${r.outletId}`);
  return { drop: missing.filter((k) => added.has(k)), old: missing.filter((k) => !added.has(k)) };
}

if (require.main === module) {
  const added = new Set(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean));
  const data = loadData(DATA_DIR);
  const { drop, old } = unscored(data.reviews, added);
  if (old.length) {
    console.error(`reviews without two model scores: ${old.join(', ')}`);
    process.exit(1);
  }
  if (drop.length) {
    console.log(
      `::warning::dropping new reviews only one model scored (looked for again next run): ${drop.join(', ')}`,
    );
    writeData(DATA_DIR, { reviews: data.reviews.filter((r) => !drop.includes(`${r.productId}/${r.outletId}`)) });
    const stateFile = path.join(DATA_DIR, 'refresh-state.json');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    for (const k of drop) delete state[k.split('/')[0]];
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
    if (drop.length * 2 > added.size)
      fs.appendFileSync(
        path.join(path.dirname(process.argv[2]), 'problems.txt'),
        `Scoring failed for ${drop.length} of ${added.size} new reviews, so they were left out (is a model API down?).\n`,
      );
  }
}

module.exports = { unscored };
