// Outlet RSS/Atom feeds: a cheap daily look at what each outlet just published. refresh.js matches
// review headlines to products on the site and hands the pages to the same checks as search results;
// headlines that match no product become leads for the new-launch search. Pure, so tests need no network.
const { decodeEntities } = require('./page');
const { norm, bareName, urlKey } = require('./launches');

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

/** Feed text as plain text: CDATA unwrapped, tags dropped, entities (numeric ones too) decoded. @param {string} s */
const clean = (s) =>
  decodeEntities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ''))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Items of an RSS or Atom feed. An item without a title or link is skipped; a missing date stays empty.
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
      .filter((tag) => !/rel=/i.test(tag) || /rel=["']alternate["']/i.test(tag))
      .map((tag) => tag.match(/href=["']([^"']+)["']/i)?.[1])
      .find(Boolean);
    const url = clean(pick('link') || atomLink || '');
    const raw = clean(pick('pubDate') || pick('published') || pick('updated') || pick('dc:date') || '');
    const t = Date.parse(raw);
    if (title && /^https?:\/\//.test(url))
      out.push({ title, url, date: Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '' });
  }
  return out;
}

/** A headline that announces a review, not a hands-on, a roundup or a comparison. @param {string} title */
const isReviewTitle = (title) =>
  /\breview\b/i.test(title) && !/round-?up|hands[- ]on|first look|\bvs\.?\b|reviews? (are|is) in/i.test(title);

/**
 * The product a review headline is about: its full name, or brand and bare name both, in the headline.
 * The most specific match wins, so "iPhone 17 Pro review" goes to the 17 Pro rather than the iPhone 17.
 * @template {{id: string, name: string, brand: string}} P
 * @param {string} title
 * @param {P[]} products
 * @returns {P | undefined}
 */
function matchProduct(title, products) {
  const t = norm(title);
  /** @type {P | undefined} */
  let best;
  let bestLen = 0;
  for (const p of products) {
    // "Nothing Phone (4a) Pro" keeps its brackets' text in headlines; "Valve Steam Frame (256GB)" drops it.
    for (const name of new Set([p.name, p.name.replace(/\s*\([^)]*\)/g, '')])) {
      const full = norm(name);
      const bare = bareName(name, p.brand);
      const hit =
        (full.length >= 4 && t.includes(full)) || (bare.length >= 3 && t.includes(norm(p.brand)) && t.includes(bare));
      // Ranked by brand plus name, so a brandless "Headphone (1) Pro" outranks "Nothing Headphone".
      const len = norm(p.brand).length + bare.length;
      if (hit && len > bestLen) {
        best = p;
        bestLen = len;
      }
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
    if (!isReviewTitle(it.title) || !knownOutlet(it.url) || (it.date && (it.date < oldest || it.date > today)))
      continue;
    const key = urlKey(it.url);
    if (seen.has(key)) continue;
    seen.add(key);
    const p = matchProduct(it.title, products);
    if (!p) leads.push(it);
    else byProduct.set(p.id, [...(byProduct.get(p.id) || []), it.url]);
  }
  return { byProduct, leads };
}

module.exports = { FEED_GUESSES, FEED_MAX_AGE_DAYS, feedLinks, parseFeed, isReviewTitle, matchProduct, sortFeedItems };
