// Reading and writing data/*.json. The directory is a parameter so tests can
// point the pipeline at a temporary copy instead of the real data.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
/** @typedef {import('../../src/lib/data-types').Product} Product */
/** @typedef {import('../../src/lib/data-types').Review} Review */
/** @typedef {import('../../src/lib/data-types').Outlet} Outlet */
/** @typedef {{products: Product[], reviews: Review[], outlets: Outlet[]}} DataSet */

const DATA_FILES = { products: 'products.json', reviews: 'reviews.json', outlets: 'outlets.json' };

function loadCategories() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'config', 'categories.json'), 'utf8'));
}

/** @returns {DataSet} */
function loadData(dir = DATA_DIR) {
  const out = {};
  for (const [key, file] of Object.entries(DATA_FILES)) out[key] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  return out;
}

/**
 * Same layout as the committed files (2-space JSON, trailing newline) so diffs stay minimal.
 * @param {string} dir
 * @param {Partial<DataSet>} data
 */
function writeData(dir, data) {
  for (const [key, file] of Object.entries(DATA_FILES)) {
    if (data[key]) fs.writeFileSync(path.join(dir, file), JSON.stringify(data[key], null, 2) + '\n');
  }
}

module.exports = { DATA_DIR, DATA_FILES, loadData, writeData, loadCategories };
