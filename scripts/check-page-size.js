#!/usr/bin/env node
// Fails the build when an exported page is too big for crawlers (npm postbuild).
// The budget lives in scripts/lib/page-size.js.
const fs = require('fs');
const path = require('path');
const { PAGE_FAIL_BYTES, PAGE_WARN_BYTES, listHtml, checkPageSizes } = require('./lib/page-size');

const OUT = path.join(__dirname, '..', 'out');
const pages = listHtml(OUT).map((file) => ({ file, bytes: fs.statSync(path.join(OUT, file)).size }));
const { over, near } = checkPageSizes(pages);
const kb = (/** @type {number} */ b) => `${Math.round(b / 1000)}kB`;

const largest = [...pages].sort((a, b) => b.bytes - a.bytes)[0];
console.log(`page size: ${pages.length} pages, largest ${largest.file} at ${kb(largest.bytes)}`);
for (const p of near) console.warn(`warning: ${p.file} is ${kb(p.bytes)} (warn above ${kb(PAGE_WARN_BYTES)})`);
if (over.length) {
  console.error(`\n${over.length} page(s) over ${kb(PAGE_FAIL_BYTES)}; Googlebot reads only the first 2MB:`);
  for (const p of over) console.error(`- ${p.file}: ${kb(p.bytes)}`);
  process.exit(1);
}
