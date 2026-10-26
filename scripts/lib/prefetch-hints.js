// Next prefetches the page data (.txt RSC payloads) of every link in view. An image preload hint
// (:HL[...,"image"]) in that data makes the browser download the image for each link scrolled past:
// on the home page that was 77-84 full-size product photos per scroll (fixed 2026-10-26 by wrapping
// the eager product hero in <picture>, which React does not hint). This guard catches it coming back.
const fs = require('fs');
const path = require('path');

/**
 * Every .txt file under dir, as paths relative to dir.
 * @param {string} dir
 * @param {string} [rel]
 * @returns {string[]}
 */
function listPayloads(dir, rel = '') {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) return listPayloads(dir, r);
    return e.name.endsWith('.txt') ? [r] : [];
  });
}

/**
 * The image URLs a payload asks the browser to preload.
 * @param {string} text
 * @returns {string[]}
 */
function imageHints(text) {
  return [...text.matchAll(/:HL\["([^"]+)","image"/g)].map((m) => m[1]);
}

module.exports = { listPayloads, imageHints };
