#!/usr/bin/env node
// Adds an official press photo to a product (docs/IMAGES.md has the per-brand terms).
//   node scripts/add-product-image.js <slug> <image URL or file> --credit="Samsung" --source=<brand page URL> [--alt="..."]
// Resizing and WebP conversion only: no crop, no edits. Writes
// public/images/products/<slug>/main.webp (800px wide at most) and thumb.webp (300px wide at most),
// then sets `image` on the product in data/products.json.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { DATA_DIR, loadData, writeData } = require('./lib/data-files');

const ROOT = path.join(__dirname, '..');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

/** @param {string[]} argv */
function parseArgs(argv) {
  const pos = [];
  /** @type {Record<string,string>} */
  const opts = {};
  for (const a of argv) {
    const m = /^--([a-z]+)=(.*)$/.exec(a);
    if (m) opts[m[1]] = m[2];
    else pos.push(a);
  }
  return { pos, opts };
}

/** @param {string} from */
async function readSource(from) {
  if (!/^https:\/\//.test(from)) return fs.readFileSync(from);
  const res = await fetch(from, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`download failed: ${res.status} ${from}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const { pos, opts } = parseArgs(process.argv.slice(2));
  const [slug, from] = pos;
  if (!slug || !from || !opts.credit || !opts.source) {
    console.error(
      'usage: add-product-image.js <slug> <url|file> --credit=<Brand> --source=<brand page URL> [--alt=<text>]',
    );
    process.exit(2);
  }
  const data = loadData();
  const product = data.products.find((p) => p.slug === slug);
  if (!product) throw new Error(`unknown product slug: ${slug}`);

  const input = await readSource(from);
  const dir = path.join(ROOT, 'public', 'images', 'products', slug);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, width] of /** @type {const} */ ([
    ['main', 800],
    ['thumb', 300],
  ])) {
    await sharp(input)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(path.join(dir, `${name}.webp`));
  }
  product.image = {
    src: `/images/products/${slug}/main.webp`,
    thumb: `/images/products/${slug}/thumb.webp`,
    alt: opts.alt || `${product.name}, official ${opts.credit} press photo`,
    credit: opts.credit,
    sourceUrl: opts.source,
  };
  writeData(DATA_DIR, { products: data.products });
  console.log(`${slug}: image added (${fs.statSync(path.join(dir, 'main.webp')).size} bytes)`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
