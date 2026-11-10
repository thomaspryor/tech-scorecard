// The photo for a new launch: an image the brand's own product page offers (its share image or its
// structured-data product image), checked by a model that looks at it, so a logo, a banner or another
// product is never published. No usable photo means the launch waits for a later run (docs/IMAGES.md).
/** sharp, loaded on first use so scripts that never touch a photo run without it installed. */
const sharp = (/** @type {any} */ input) => /** @type {any} */ (require('sharp'))(input);
const { decodeEntities } = require('./page');

/** Image URLs that are site furniture, never a product photo. */
const NOT_A_PHOTO = /(^|[^a-z])(logos?|icons?|favicon|sprite|placeholder|badges?|flags?)([^a-z]|$)/i;
/** Smaller than this (in either direction) makes a blurry tile. */
const MIN_SIZE = 500;
/** How many candidates are downloaded and shown to the model at most. */
const MAX_CANDIDATES = 4;

/**
 * Candidate photo URLs on a brand page, best first: Open Graph and Twitter share images, then the
 * image of a JSON-LD Product. Relative URLs are resolved; only https is kept.
 * @param {string} html
 * @param {string} pageUrl
 * @returns {string[]}
 */
function photoCandidates(html, pageUrl) {
  /** @type {string[]} */
  const found = [];
  const meta = /<meta\b[^>]*>/gi;
  for (const tag of html.match(meta) || []) {
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const value = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (value && (key === 'og:image' || key === 'og:image:secure_url' || key === 'twitter:image')) found.push(value);
  }
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      /** @param {any} n */
      const walk = (n) => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (!n || typeof n !== 'object') return;
        const types = /** @type {unknown[]} */ ([]).concat(n['@type'] || []);
        if (types.includes('Product') && n.image) {
          for (const i of [].concat(n.image)) {
            const u = typeof i === 'string' ? i : /** @type {any} */ (i)?.url;
            if (typeof u === 'string') found.push(u);
          }
        }
        Object.values(n).forEach(walk);
      };
      walk(JSON.parse(m[1]));
    } catch {
      // A broken JSON-LD block just offers no candidates.
    }
  }
  /** @type {string[]} */
  const out = [];
  for (const raw of found) {
    let u;
    try {
      u = new URL(decodeEntities(raw.trim()).replace(/^\/\//, 'https://'), pageUrl);
    } catch {
      continue;
    }
    if (u.protocol === 'http:') u.protocol = 'https:';
    const href = u.toString();
    if (u.protocol !== 'https:' || NOT_A_PHOTO.test(u.pathname.split('/').pop() || '') || out.includes(href)) continue;
    out.push(href);
  }
  return out;
}

/** The site a URL belongs to ("news.samsung.com" -> "samsung.com"), or "" when it does not parse. @param {string} url */
function siteOf(url) {
  try {
    const labels = new URL(url).hostname.split('.');
    // "bbc.co.uk" keeps three labels; a two-letter country code under co/com/org/net is a second-level domain.
    const keep =
      ['co', 'com', 'org', 'net'].includes(labels[labels.length - 2]) && labels[labels.length - 1].length === 2 ? 3 : 2;
    return labels.slice(-keep).join('.');
  } catch {
    return '';
  }
}

/** How many press pages found by the fallback search are read. */
const MAX_PRESS_PAGES = 3;

/**
 * The first candidate that downloads, is big enough, and the judge accepts. The product's official page comes
 * first; when it offers no usable photo and `io.pressPages` is given, the brand's own press or newsroom pages for the
 * product (found by search, and only kept when they are on the same site as the official page) are tried the same way.
 * @param {{name: string, brand: string, officialUrl: string}} c
 * @param {{
 *   fetchPage: (url: string) => string,
 *   download: (url: string) => Promise<Buffer>,
 *   judge: (prompt: string, jpeg: Buffer) => Promise<string>,
 *   parse: (text: string) => any,
 *   pressPages?: (c: {name: string, brand: string, officialUrl: string}) => Promise<string[]>,
 *   log?: (msg: string) => void,
 * }} io
 * @returns {Promise<{buffer: Buffer, url: string} | null>}
 */
async function findLaunchPhoto(c, io) {
  const log = io.log || (() => {});
  /** Images already judged, so two pages sharing a share image are not paid for twice. @type {Set<string>} */
  const judged = new Set();
  /** @param {string} pageUrl */
  const fromPage = async (pageUrl) => {
    let html;
    try {
      html = io.fetchPage(pageUrl);
    } catch {
      log('  brand page not readable for a photo');
      return null;
    }
    for (const url of photoCandidates(html, pageUrl).slice(0, MAX_CANDIDATES)) {
      if (judged.has(url)) continue;
      judged.add(url);
      let buffer;
      let jpeg;
      try {
        buffer = await io.download(url);
        const { width = 0, height = 0 } = await sharp(buffer).metadata();
        if (width < MIN_SIZE || height < MIN_SIZE / 2) {
          log(`  photo too small (${width}x${height}): ${url}`);
          continue;
        }
        jpeg = await sharp(buffer)
          .flatten({ background: '#fff' })
          .resize({ width: 768, withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
      } catch (e) {
        log(`  photo not usable (${e instanceof Error ? e.message.slice(0, 80) : e}): ${url}`);
        continue;
      }
      // A failing model call throws: an outage must reach the run's alert, not read as "no photo".
      const verdict = io.parse(
        await io.judge(
          `This image is from the official web page of the ${c.brand} product "${c.name}". Could it be used as the product's photo on a review site?
Answer yes only if it clearly shows that product itself, large and recognizable. Answer no for a logo, a wordmark, a banner that is mostly text, a photo of a different or older product, a lineup of several different products, an abstract graphic, or a scene where the product is small or hidden.
Reply JSON only: {"ok": true or false, "reason": "a few words"}`,
          jpeg,
        ),
      );
      if (verdict?.ok === true) return { buffer, url };
      log(`  photo rejected (${verdict?.reason || 'no answer'}): ${url}`);
    }
    return null;
  };

  const official = await fromPage(c.officialUrl);
  if (official || !io.pressPages) return official;
  log('  no photo on the official page, trying the brand press pages');
  const site = siteOf(c.officialUrl);
  const pages = (await io.pressPages(c)).filter((u) => u !== c.officialUrl && site && siteOf(u) === site);
  for (const pageUrl of pages.slice(0, MAX_PRESS_PAGES)) {
    const found = await fromPage(pageUrl);
    if (found) return found;
  }
  return null;
}

module.exports = { photoCandidates, findLaunchPhoto, siteOf };
