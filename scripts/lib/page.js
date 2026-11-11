// Fetching review pages and turning their HTML into text. Shared by score-reviews.js and
// refresh.js; scripts/verify-quotes.py applies the same quote normalization in Python.
// Everything except `curl` is pure, so the tests cover it without the network.
const { execFile, execFileSync } = require('child_process');
const path = require('path');
const { looksBlocked } = require('./fetch-ladder');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/**
 * Run curl and return stdout. Page fetches only: model calls go through scripts/lib/models.js.
 * A failure reports only curl's exit code, never the command line.
 * @param {string[]} argv
 * @param {{input?: string, timeout?: number}} [opts] timeout in seconds
 */
function curl(argv, { input, timeout = 90 } = {}) {
  try {
    return execFileSync('curl', ['-sL', '-m', String(timeout), ...argv], {
      input,
      maxBuffer: 64 * 1024 * 1024,
      encoding: 'utf8',
    });
  } catch (e) {
    throw new Error(`curl exit ${/** @type {{status?: number}} */ (e).status}`);
  }
}

/** Plain request status codes that mean "the page is not there", which no paid service can fix. */
const GONE = new Set([400, 404, 410]);

/**
 * The HTML page at `url`. A plain request first; when the outlet refuses it (403, 429, a bot wall, an empty
 * shell) the page is read through the paid fetch services and the Internet Archive (scripts/lib/fetch-ladder.js,
 * run as scripts/fetch-page.js so this stays synchronous). Throws when nothing can read it, and straight away
 * for a page that does not exist. Set NO_FETCH_LADDER=1 to skip the fallback.
 * @param {string} url
 */
function fetchPage(url) {
  let html = '';
  let code = 0;
  try {
    const out = curl(['-A', UA, '-w', '\n%{http_code}', url], { timeout: 40 });
    const cut = out.lastIndexOf('\n');
    html = out.slice(0, cut);
    code = Number(out.slice(cut + 1));
  } catch {
    /* curl could not connect or timed out: the fallback may still read it */
  }
  if (code >= 200 && code < 300 && !looksBlocked(html)) return html;
  if (GONE.has(code)) throw new Error(`HTTP ${code}`);
  if (process.env.NO_FETCH_LADDER) throw new Error(`HTTP ${code || 'error'}`);
  try {
    return execFileSync(process.execPath, [path.join(__dirname, '..', 'fetch-page.js'), url], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 150_000,
    });
  } catch {
    throw new Error(`page not readable (HTTP ${code || 'error'}, and no fetch service could read it)`);
  }
}

/**
 * fetchPage without blocking, for fetching many feeds at once. Resolves to null when the page cannot be read.
 * @param {string} url
 * @param {number} [timeout] seconds
 * @returns {Promise<string | null>}
 */
const fetchPageAsync = (url, timeout = 30) =>
  new Promise((resolve) =>
    execFile(
      'curl',
      ['-sfL', '-m', String(timeout), '-A', UA, url],
      { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      (err, out) => resolve(err ? null : out),
    ),
  );

/** The common entities review pages use; dashes become hyphens, curly quotes straight ones. @param {string} s */
function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;|&#x27;|&#39;/g, "'")
    .replace(/&quot;|&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&#8212;|&mdash;/g, '-');
}

/**
 * Body text for quote checking, like verify-quotes.py: scripts and styles dropped, inline tags
 * removed (Pixel</a>'s stays one word), block tags turned into spaces.
 * @param {string} html
 */
function pageText(html) {
  const body = html
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(p|div|br|li|h[1-6]|section|article|blockquote|figure|figcaption|td|tr)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(body).replace(/\s+/g, ' ').trim();
}

/**
 * The article's paragraphs, for a model to read: navigation, footers and asides dropped, and
 * paragraphs of 40 characters or less (bylines, captions) skipped.
 * @param {string} html
 * @returns {string[]}
 */
function articleParagraphs(html) {
  const main = html.replace(/<(script|style|noscript|nav|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  return [...main.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) =>
      decodeEntities(m[1].replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((p) => p.length > 40);
}

/** Every page of a review: GSMArena splits reviews over ...p2.php to p9.php. @param {string} url */
function reviewPages(url) {
  const pages = [url];
  if (/gsmarena\.com/.test(url) && !/p\d+\.php$/.test(url))
    for (let n = 2; n <= 9; n++) pages.push(url.replace('.php', `p${n}.php`));
  return pages;
}

// Same normalization as scripts/verify-quotes.py, so a quote that passes here passes there.
/** @type {Record<string, string>} */
const QUOTES = { '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-' };
/** @param {string} s */
function normQuote(s) {
  let t = String(s).normalize('NFKC');
  for (const [a, b] of Object.entries(QUOTES)) t = t.split(a).join(b);
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** True when `excerpt` appears word for word in `text` (final punctuation aside). @param {string} text @param {string} excerpt */
const containsQuote = (text, excerpt) => normQuote(text).includes(normQuote(excerpt).replace(/[.!?…]+$/, ''));

/**
 * A page's published date as YYYY-MM-DD. ISO dates are cut to the day; a written date such as GSMArena's
 * "17 July 2026" is read as UTC. Anything else is returned as it came, so the date check rejects it.
 * @param {string} s
 */
function isoDate(s) {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const ms = Date.parse(/Z|GMT|UTC|[+-]\d{2}:?\d{2}$/.test(t) ? t : `${t} UTC`);
  return Number.isNaN(ms) ? t.slice(0, 10) : new Date(ms).toISOString().slice(0, 10);
}

/**
 * Rating, critic and date from the page's own JSON-LD. Never guessed: a field the page does not
 * state is left out.
 * @param {string} html
 * @returns {{rating?: string, critic?: string, date?: string}}
 */
function jsonLd(html) {
  /** @type {{rating?: string, critic?: string, date?: string}} */
  const found = {};
  /** @param {any} n */
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const rr = n.reviewRating || (n['@type'] === 'Rating' ? n : null);
    if (rr && rr.ratingValue != null && !found.rating) {
      const v = parseFloat(rr.ratingValue);
      const best = parseFloat(rr.bestRating ?? 5);
      if (Number.isFinite(v) && best > 0 && v <= best) found.rating = `${v}/${best}`;
    }
    const author = n.author;
    if (author && !found.critic) {
      const a = Array.isArray(author) ? author[0] : author;
      const name = typeof a === 'string' ? a : a?.name;
      if (name && name.length < 60) found.critic = name;
    }
    if (n.datePublished && !found.date) found.date = isoDate(String(n.datePublished));
    Object.values(n).forEach(walk);
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()));
    } catch {
      /* malformed block */
    }
  }
  return found;
}

/** Hostname without "www.", or "" for an unparseable URL. @param {string} u */
function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

module.exports = {
  UA,
  curl,
  fetchPage,
  fetchPageAsync,
  decodeEntities,
  pageText,
  articleParagraphs,
  reviewPages,
  normQuote,
  containsQuote,
  jsonLd,
  isoDate,
  hostOf,
};
