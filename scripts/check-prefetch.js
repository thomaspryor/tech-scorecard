#!/usr/bin/env node
// Fails the build when prefetched page data would preload images (npm postbuild).
// Why it matters: scripts/lib/prefetch-hints.js.
const fs = require('fs');
const path = require('path');
const { listPayloads, imageHints } = require('./lib/prefetch-hints');

const OUT = path.join(__dirname, '..', 'out');
const hits = listPayloads(OUT).flatMap((file) =>
  imageHints(fs.readFileSync(path.join(OUT, file), 'utf8')).map((img) => `${file}: ${img}`),
);
if (hits.length) {
  console.error(
    `${hits.length} image preload hint(s) in prefetched page data; every link in view would download them:`,
  );
  for (const h of hits.slice(0, 10)) console.error(`- ${h}`);
  console.error('Keep eager <img> elements out of React preloading (wrap in <picture>, see ProductImage).');
  process.exit(1);
}
console.log('prefetch: no image preload hints');
