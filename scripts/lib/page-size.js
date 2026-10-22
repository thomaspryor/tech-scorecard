// Exported-page size budget. Googlebot reads only the first 2MB of an HTML file,
// so links and JSON-LD past that point are never seen (Broadway Scorecard hit this
// in 2026-10 with 7MB list pages, BRO-5968). Sizes are uncompressed bytes.
const fs = require('fs');
const path = require('path');

const PAGE_FAIL_BYTES = 1_800_000;
const PAGE_WARN_BYTES = 1_000_000;

/** Every .html file under dir, as paths relative to dir. */
function listHtml(dir, rel = '') {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) return listHtml(dir, r);
    return e.name.endsWith('.html') ? [r] : [];
  });
}

/** [{file, bytes}] -> {over: [...], near: [...]} sorted largest first. */
function checkPageSizes(pages, fail = PAGE_FAIL_BYTES, warn = PAGE_WARN_BYTES) {
  const sorted = [...pages].sort((a, b) => b.bytes - a.bytes);
  return {
    over: sorted.filter((p) => p.bytes > fail),
    near: sorted.filter((p) => p.bytes > warn && p.bytes <= fail),
  };
}

module.exports = { PAGE_FAIL_BYTES, PAGE_WARN_BYTES, listHtml, checkPageSizes };
