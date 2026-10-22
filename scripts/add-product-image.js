#!/usr/bin/env node
// Adds an official press photo to a product (docs/IMAGES.md has the per-brand terms).
//   node scripts/add-product-image.js <slug> <image URL or file> --credit="Samsung" --source=<brand page URL> [--alt="..."] [--trim] [--pad]
// Resizing and WebP conversion only: no edits to the product. --trim crops away empty background around the
// product (never into it); --pad centers it on a 3:4 canvas in the photo's own background color (for dark
// backgrounds that a light tile would show as a box). A background-removed file is a separate step, noted in
// docs/IMAGES.md. Writes
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
    const flag = /^--([a-z]+)$/.exec(a);
    if (m) opts[m[1]] = m[2];
    else if (flag) opts[flag[1]] = '1';
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

/** The photo's background color: the median of its top-left corner pixels. @param {Buffer} input */
async function cornerColor(input) {
  const { data } = await sharp(input)
    .flatten({ background: '#fff' })
    .extract({ left: 0, top: 0, width: 8, height: 8 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const med = (/** @type {number} */ c) => {
    const v = [];
    for (let i = c; i < data.length; i += 3) v.push(data[i]);
    return v.sort((a, b) => a - b)[v.length >> 1];
  };
  return { r: med(0), g: med(1), b: med(2), alpha: 1 };
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
  let source = input;
  if (opts.trim) {
    // Crop empty margins, then leave 6% breathing room so the product never touches the tile edge.
    const trimmed = await sharp(input).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
    const gap = Math.round(Math.max(trimmed.info.width, trimmed.info.height) * 0.06);
    const meta = await sharp(input).metadata();
    const edge = meta.hasAlpha ? { r: 255, g: 255, b: 255, alpha: 0 } : await cornerColor(input);
    source = await sharp(trimmed.data)
      .extend({ top: gap, bottom: gap, left: gap, right: gap, background: edge })
      .toBuffer();
  }
  const canvas = opts.pad ? await cornerColor(input) : null;
  for (const [name, width] of /** @type {const} */ ([
    ['main', 800],
    ['thumb', 300],
  ])) {
    const img = sharp(source);
    if (canvas) img.resize({ width, height: Math.round((width * 4) / 3), fit: 'contain', background: canvas });
    else img.resize({ width, withoutEnlargement: true });
    await img.webp({ quality: 82 }).toFile(path.join(dir, `${name}.webp`));
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
