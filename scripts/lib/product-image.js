// Writing a product photo to public/images/products/<slug>/ (main.webp and thumb.webp), shared by
// add-product-image.js (by hand) and refresh.js (new launches). Resizing and WebP conversion only:
// `trim` crops away empty background around the product (never into it), `pad` centers it on a 3:4
// canvas in the photo's own background color (for dark backgrounds a light tile would show as a box).
const fs = require('fs');
const path = require('path');
/** sharp, loaded on first use so scripts that never touch a photo run without it installed. */
const sharp = (/** @type {any} */ input) => /** @type {any} */ (require('sharp'))(input);

const IMAGES_DIR = path.join(__dirname, '..', '..', 'public', 'images', 'products');

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

/** True when the photo's background is dark enough that it should be padded rather than trimmed. @param {Buffer} input */
async function hasDarkBackground(input) {
  const { r, g, b } = await cornerColor(input);
  return 0.299 * r + 0.587 * g + 0.114 * b < 80;
}

/**
 * Writes main.webp (800px wide at most) and thumb.webp (300px wide at most) for `slug`.
 * @param {string} slug
 * @param {Buffer} input
 * @param {{trim?: boolean, pad?: boolean}} [opts]
 * @returns {Promise<{src: string, thumb: string, bytes: number}>}
 */
async function writeProductImage(slug, input, { trim = false, pad = false } = {}) {
  const dir = path.join(IMAGES_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  let source = input;
  if (trim) {
    // Crop empty margins, then leave 6% breathing room so the product never touches the tile edge.
    const trimmed = await sharp(input).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
    const gap = Math.round(Math.max(trimmed.info.width, trimmed.info.height) * 0.06);
    const meta = await sharp(input).metadata();
    const edge = meta.hasAlpha ? { r: 255, g: 255, b: 255, alpha: 0 } : await cornerColor(input);
    source = await sharp(trimmed.data)
      .extend({ top: gap, bottom: gap, left: gap, right: gap, background: edge })
      .toBuffer();
  }
  const canvas = pad ? await cornerColor(input) : null;
  for (const [name, width] of /** @type {const} */ ([
    ['main', 800],
    ['thumb', 300],
  ])) {
    const img = sharp(source);
    if (canvas) img.resize({ width, height: Math.round((width * 4) / 3), fit: 'contain', background: canvas });
    else img.resize({ width, withoutEnlargement: true });
    await img.webp({ quality: 82 }).toFile(path.join(dir, `${name}.webp`));
  }
  return {
    src: `/images/products/${slug}/main.webp`,
    thumb: `/images/products/${slug}/thumb.webp`,
    bytes: fs.statSync(path.join(dir, 'main.webp')).size,
  };
}

/** Removes a product's photo folder (a product dropped again after its photo was written). @param {string} slug */
function removeProductImage(slug) {
  if (!/^[a-z0-9-]+$/.test(slug)) return;
  fs.rmSync(path.join(IMAGES_DIR, slug), { recursive: true, force: true });
}

module.exports = { IMAGES_DIR, cornerColor, hasDarkBackground, writeProductImage, removeProductImage };
