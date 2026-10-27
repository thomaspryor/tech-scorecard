// Outlet RSS/Atom feeds: a cheap daily look at what each outlet just published. refresh.js matches
// review headlines to products on the site and hands the pages to the same checks as search results;
// headlines that match no product become leads for the new-launch search. Pure, so tests need no network.
const { decodeEntities } = require('./page');
const { urlKey } = require('./launches');

/** Common feed addresses, tried when a homepage does not link its feed (Ars Technica, for one). */
const FEED_GUESSES = ['/feed/', '/rss/', '/rss.xml', '/feed.xml', '/index.xml', '/atom.xml', '/feeds/all.rss'];
/** Feed items older than this are not new. */
const FEED_MAX_AGE_DAYS = 14;

/**
 * Feed URLs a page advertises in <link rel="alternate">, comment feeds left out.
 * @param {string} html
 * @param {string} base the page's URL, for relative links
 */
function feedLinks(html, base) {
  /** @type {string[]} */
  const out = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/application\/(rss|atom)\+xml/i.test(tag) || !/rel=["']?alternate/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href || /comment/i.test(href)) continue;
    try {
      out.push(new URL(decodeEntities(href), base).href);
    } catch {
      /* bad href */
    }
  }
  return [...new Set(out)];
}

/** A numeric entity as text; an invalid code point becomes nothing instead of throwing. @param {number} n */
const codePoint = (n) => (Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');

/** Feed text as plain text: CDATA unwrapped, tags dropped, entities (numeric ones too) decoded. @param {string} s */
const clean = (s) =>
  decodeEntities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ''))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => codePoint(Number(d)))
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/**
 * A feed link as the review URL to publish: https (validation requires it, and outlets serve it), without
 * tracking parameters (utm_*, a WSJ share token). Null when it is not a web link.
 * @param {string} u
 */
function cleanUrl(u) {
  try {
    const x = new URL(u.replace(/^http:\/\//i, 'https://'));
    if (x.protocol !== 'https:') return null;
    for (const k of [...x.searchParams.keys()]) if (/^utm_|^st$/i.test(k)) x.searchParams.delete(k);
    return x.href;
  } catch {
    return null;
  }
}

/**
 * Dated items of an RSS or Atom feed. An item without a title, a link or a date is skipped.
 * @param {string} xml
 * @returns {{title: string, url: string, date: string}[]}
 */
function parseFeed(xml) {
  /** @type {{title: string, url: string, date: string}[]} */
  const out = [];
  for (const [, body] of xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)) {
    const pick = (/** @type {string} */ tag) =>
      body.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1];
    const title = clean(pick('title') || '');
    // Atom: <link href="..."/>, the one without a rel or with rel="alternate".
    const atomLink = [...body.matchAll(/<link\b[^>]*>/gi)]
      .map(([tag]) => tag)
      .filter((tag) => !/rel=/i.test(tag) || /rel=["']?alternate\b/i.test(tag))
      .map((tag) => tag.match(/href=["']([^"']+)["']/i)?.[1])
      .find(Boolean);
    const url = cleanUrl(clean(pick('link') || atomLink || ''));
    const t = Date.parse(clean(pick('pubDate') || pick('published') || pick('updated') || pick('dc:date') || ''));
    if (title && url && Number.isFinite(t)) out.push({ title, url, date: new Date(t).toISOString().slice(0, 10) });
  }
  return out;
}

/**
 * A headline that announces a review of a gadget: not a hands-on, roundup, comparison, podcast episode,
 * weekly recap or accessory review.
 * @param {string} title
 */
const isReviewTitle = (title) =>
  /\breview\b/i.test(title) &&
  !/round-?up|hands[- ]on|first look|\bvs\.?\b|reviews? (are|is) in|episode|podcast|week in review|\bcases?\b|screen protector|charger|\bstand\b|\bdock\b|\bstrap\b|\bdeals?\b/i.test(
    title,
  );

/** Lowercase words separated by single spaces and padded with one, "+" spelled out. @param {string} s */
const words = (s) =>
  ` ${s
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;

/** A word after the name that makes it another model: "Pixel 11 Pro", "Steam Frame 2", "Galaxy S26 Ultra". */
const MODEL_WORD =
  /^(\d+|pro|max|ultra|plus|mini|lite|fe|edge|fold|flip|air|power|neo|se|xl|slim|go|gen|\d+(st|nd|rd|th))$/;

/**
 * Ways a headline names the product: with and without the brand, and with only the year, storage or
 * screen size dropped from a bracket ("Valve Steam Frame (256GB)", "MacBook Air (M5, 2026)" as "MacBook Air M5").
 * @param {{name: string, brand: string}} p
 */
function nameForms(p) {
  const shortName = p.name
    .replace(/\(([^)]*)\)/g, (_, /** @type {string} */ inner) =>
      inner
        .split(/,\s*/)
        .filter((x) => !/^(20\d\d|\d+\s?(gb|tb)|\d+(\.\d+)?[- ]?inch)$/i.test(x.trim()))
        .join(' '),
    )
    .replace(/\s+/g, ' ');
  const forms = new Set();
  for (const name of [p.name, shortName]) {
    const w = words(name);
    const brand = words(p.brand);
    const bare = w.startsWith(brand) ? ` ${w.slice(brand.length)}` : w;
    forms.add(`${brand.trimEnd()}${bare}`);
    // Without the brand only when that still names a model: "Steam Frame" yes, a lone "360" no.
    if (/[a-z]/.test(bare) && bare.trim().split(' ').length >= 2) forms.add(bare);
    else if (/[a-z]/.test(bare) && /\d/.test(bare)) forms.add(bare);
  }
  return [...forms].filter((f) => f.trim());
}

/**
 * The product a review headline is about: one of its name forms as whole words, not followed by a word
 * that makes it another model ("Pixel 11a" and "Pixel 11 Pro" are not the Pixel 11). The most specific
 * match wins, so "iPhone 17 Pro review" goes to the 17 Pro rather than the iPhone 17.
 * @template {{id: string, name: string, brand: string}} P
 * @param {string} title
 * @param {P[]} products
 * @returns {P | undefined}
 */
function matchProduct(title, products) {
  const t = words(title);
  /** @type {P | undefined} */
  let best;
  let bestLen = 0;
  for (const p of products) {
    const forms = nameForms(p);
    // Ranked by the longest form (brand included), so a brandless "Headphone (1) Pro" is compared fairly.
    const len = Math.max(...forms.map((f) => f.length));
    const hit = forms.some((f) => {
      for (let at = t.indexOf(f); at >= 0; at = t.indexOf(f, at + 1)) {
        const next = t.slice(at + f.length).split(' ')[0];
        if (!MODEL_WORD.test(next)) return true;
      }
      return false;
    });
    if (hit && len > bestLen) {
      best = p;
      bestLen = len;
    }
  }
  return best;
}

/**
 * Sorts recent review headlines into pages for products on the site and leads for the launch search.
 * @template {{id: string, name: string, brand: string}} P
 * @param {{title: string, url: string, date: string}[]} items
 * @param {P[]} products
 * @param {(url: string) => boolean} knownOutlet true when the URL is on an outlet in data/outlets.json
 * @param {string} today YYYY-MM-DD
 */
function sortFeedItems(items, products, knownOutlet, today) {
  const oldest = new Date(Date.parse(today) - FEED_MAX_AGE_DAYS * 864e5).toISOString().slice(0, 10);
  /** @type {Map<string, string[]>} */
  const byProduct = new Map();
  /** @type {{title: string, url: string, date: string}[]} */
  const leads = [];
  const seen = new Set();
  for (const it of items) {
    if (!isReviewTitle(it.title) || !knownOutlet(it.url) || it.date < oldest || it.date > today) continue;
    const key = urlKey(it.url);
    if (seen.has(key)) continue;
    seen.add(key);
    const p = matchProduct(it.title, products);
    if (!p) leads.push(it);
    else byProduct.set(p.id, [...(byProduct.get(p.id) || []), it.url]);
  }
  return { byProduct, leads };
}

module.exports = {
  FEED_GUESSES,
  FEED_MAX_AGE_DAYS,
  feedLinks,
  cleanUrl,
  parseFeed,
  isReviewTitle,
  matchProduct,
  sortFeedItems,
};
