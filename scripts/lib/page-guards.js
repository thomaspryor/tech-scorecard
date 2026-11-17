// Checks that a fetched page is the review it was meant to be, before a model reads it. Ported from Broadway Scorecard
// (verifyFetchedUrl in scripts/lib/scraper.js, scripts/lib/soft-404-body.js) with the same tolerance: each check rejects only on
// positive evidence (a different canonical article, a not-found template, a named sibling model), and a page that gives no
// evidence passes to the model and the quote check. A wrong rejection costs a review; a wrong acceptance would publish a
// wrong score, so none of this replaces the verbatim quote check, it comes before it.
const { matchProduct, mentionsSibling } = require('./feeds');
const { pageText } = require('./page');

/** @param {string} s */
const stripInvisible = (s) => s.normalize('NFC').replace(/[​-‏‪-‮⁠-⁤﻿]/g, '');

// A not-found template is short and wrapped in site navigation (Broadway BRO-3116, BRO-7171, BRO-7147).
const SOFT_404_MAX_LENGTH = 2500;
const WEAK_MAX_LENGTH = 1200;
const STRONG_404 = [
  /\bdocument not found\b/i,
  /\bthe page you (?:are|were) looking for (?:does not exist|could not be found|(?:can(?:no|['’])t|couldn['’]t) be found|is no longer available)\b/i,
  /\bwe are unable to locate the page you requested\b/i,
  /\bpage not found \(404\)/i,
  /\bthe page you requested is not available\b/i,
  /\bthe link you['’]re trying to access is either broken or no longer exists\b/i,
  /\bwe couldn['’]t find the page you were looking for\b/i,
  /\boops!? that page can['’]t be found\b/i,
];
const NOT_FOUND_OPENING = /^(?:error\s*)?(?:404\s*)?page not found\s*(?:\(404\)\s*)?(?:[|–—:]|&#8211;|-\s)/i;
const WEAK_404 = [/\bpage not found\b/i, /\b404\s*(?:-|:)?\s*(?:error|not found)\b/i];
const NAV_WORDS = [
  /\bhome\b/i,
  /\bsearch\b/i,
  /\bmenu\b/i,
  /\bsubscribe\b/i,
  /\bsign in\b/i,
  /\bcontact\b/i,
  /\bprivacy\b/i,
];
const NOT_FOUND_TITLE_SEGMENT =
  /^(?:(?:error\s*)?404\s*(?:error|page|not found|page not found)|error 404|page not found!?|nothing (?:was )?found|oops!? that page can(?:no|')t be found\.?|the page you requested (?:was|could) not (?:be )?found\.?)$/i;
const NOT_FOUND_BODY =
  /\b(?:page not found|(?:can(?:no|')t|could not|couldn't) be found|does(?:n't| not) exist|no longer (?:exists|available)|nothing (?:was )?found)\b/i;

/** The document <title>, entities decoded. @param {string} html */
function htmlTitle(html) {
  const head = (html.match(/<head[\s>][\s\S]*?<\/head>/i) || [html.split(/<body[\s>]/i)[0]])[0];
  const m = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m
    ? m[1]
        .replace(/&(?:#8217|#039|rsquo|apos);/gi, "'")
        .replace(/&(?:#8211|#8212|ndash|mdash);/gi, '-')
        .replace(/&(?:#124|vert);/gi, '|')
        .replace(/&[a-z0-9#]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}

/**
 * True when the page is a site's "not found" template served with HTTP 200.
 * @param {string} html
 * @param {string} [text] pageText(html), when the caller has it
 */
function isSoft404(html, text = pageText(html)) {
  const body = text.trim();
  if (body.length <= SOFT_404_MAX_LENGTH) {
    if (STRONG_404.some((re) => re.test(body)) || NOT_FOUND_OPENING.test(body)) return true;
    if (
      body.length <= WEAK_MAX_LENGTH &&
      WEAK_404.some((re) => re.test(body)) &&
      NAV_WORDS.filter((re) => re.test(body)).length >= 2
    )
      return true;
  }
  // Unlockers hand back the template with full theme chrome, so the title is judged too: one whole segment must be a
  // not-found phrase, and a bare "404" segment counts only when the page also says it was not found.
  const segs = htmlTitle(html)
    .split(/\s[-|:–—»·]\s|\s*\|\s*/)
    .map((x) => x.trim());
  if (segs.some((x) => NOT_FOUND_TITLE_SEGMENT.test(x))) return true;
  return segs.includes('404') && NOT_FOUND_BODY.test(body.replace(/&rsquo;|&#8217;/g, "'"));
}

/** host + path of a URL for comparison: no scheme, query, hash, trailing slash or percent-encoding differences. @param {string} u @param {string} base */
function hostPath(u, base) {
  const cleaned = stripInvisible(u.trim());
  try {
    // Only a root-relative canonical is resolved against the page; anything else vacuous must not inherit its path.
    const parsed = new URL(cleaned, /^\/[^/]/.test(cleaned) ? base : undefined);
    let path = parsed.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      /* malformed escape: keep it raw */
    }
    return { host: parsed.hostname.toLowerCase().replace(/^www\./, ''), path: path.replace(/\/$/, '') };
  } catch {
    return null;
  }
}

/**
 * Whether the page's canonical (or og:url) address is the article that was requested. No canonical tag passes, and so do a
 * subdomain, another domain of the same outlet, and a longer slug that extends the requested one at a word boundary
 * (a CMS resolving a short slug to the full one). A different slug, or a bare homepage, is a different page.
 * @param {string} html
 * @param {string} url the requested URL
 * @param {(a: string, b: string) => boolean} [sameOutlet] true when two URLs belong to one outlet
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
function checkCanonical(html, url, sameOutlet = () => false) {
  const link =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i) ||
    html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i);
  if (!link) return { ok: true };
  const want = hostPath(url, url);
  const got = hostPath(link[1].replace(/&amp;/g, '&'), url);
  if (!want || !got) return { ok: true };
  if (got.path === '' && want.path !== '')
    return { ok: false, reason: 'wrong page: canonical address is the home page' };
  if (want.host !== got.host) {
    if (got.host.endsWith(`.${want.host}`) || want.host.endsWith(`.${got.host}`) || sameOutlet(url, link[1]))
      return { ok: true };
    return { ok: false, reason: `wrong page: canonical address is on ${got.host}` };
  }
  if (want.path === got.path) return { ok: true };
  const a = want.path.split('/');
  const b = got.path.split('/');
  const last = a.pop() || '';
  const lastGot = b.pop() || '';
  if (
    a.join('/') === b.join('/') &&
    last &&
    lastGot.startsWith(last) &&
    /^[-_.]?$/.test(lastGot.charAt(last.length) || '')
  )
    return { ok: true };
  return { ok: false, reason: 'wrong page: canonical address is a different article' };
}

/**
 * A subscribe or sign-in wall at the start of the article text: the page is a teaser, not the review.
 * @param {string} text
 */
const hasPaywall = (text) =>
  /(?:subscribe|sign in|log in|register) (?:now )?(?:to|and) (?:continue reading|read (?:the )?(?:full|rest|more)|unlock|access)|this (?:article|content) is (?:for|available to) (?:subscribers|members)|already a subscriber\?/i.test(
    text.slice(0, 1500),
  );

/**
 * Whether the page is about this product: its title, first heading and address are checked together. Rejects only when
 * none of them names the product and the title names a sibling of it ("Pixel 10a" for the Pixel 10, "Galaxy S26 Ultra") or
 * another product on the site; a page that names no product at all (a roundup) is left to the model.
 * @param {string} html
 * @param {string} url
 * @param {{id: string, name: string, brand: string}} product
 * @param {{id: string, name: string, brand: string}[]} all every product on the site
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
function checkIdentity(html, url, product, all) {
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => m[1].replace(/<[^>]+>/g, ' '));
  let slug = '';
  try {
    slug = decodeURIComponent(new URL(url).pathname).replace(/[-_/.]+/g, ' ');
  } catch {
    /* unparseable: no slug */
  }
  const fields = [htmlTitle(html), ...h1.slice(0, 2), slug].map((x) => x.trim()).filter(Boolean);
  if (fields.some((f) => matchProduct(f, [product]))) return { ok: true };
  const title = fields[0] || '';
  if (title && fields.some((f) => mentionsSibling(f, product)))
    return { ok: false, reason: 'different model: the page names a sibling of this product' };
  const other = matchProduct(
    title,
    all.filter((p) => p.id !== product.id),
  );
  if (title && other) return { ok: false, reason: `different model: the page is about ${other.name}` };
  return { ok: true };
}

/**
 * Every guard above, in the order they should run. Returns the reason to skip the page, or null.
 * @param {{html: string, text: string, url: string, product: {id: string, name: string, brand: string}, products: {id: string, name: string, brand: string}[], sameOutlet?: (a: string, b: string) => boolean}} o
 * @returns {string | null}
 */
function pageProblem({ html, text, url, product, products, sameOutlet }) {
  if (isSoft404(html, text)) return 'not found: the page is the outlet’s error template';
  const canonical = checkCanonical(html, url, sameOutlet);
  if (!canonical.ok) return canonical.reason;
  if (hasPaywall(text)) return 'paywall: the page is a teaser';
  const who = checkIdentity(html, url, product, products);
  return who.ok ? null : who.reason;
}

module.exports = { isSoft404, checkCanonical, checkIdentity, hasPaywall, pageProblem, htmlTitle };
