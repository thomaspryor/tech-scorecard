// Reading a page an outlet will not hand to a plain request (403, a bot wall, an empty shell). A lean version of Broadway
// Scorecard's fetch chain (scripts/lib/scraper.js there): the same services in the same order, without its ledgers and
// per-service breakers. Each service is used only when its key is in the environment, so a missing key just skips that step:
//   1. ScrapingDog  (SCRAPINGDOG_API_KEY)               plain request, about 1 credit
//   2. Bright Data  (BRIGHTDATA_TOKEN, BRIGHTDATA_ZONE) Web Unlocker
//   3. ScrapingBee  (SCRAPINGBEE_API_KEY)               plain request
//   4. Internet Archive: the newest saved copy of the page (free, no key)
// The caller has already tried a plain request. Everything read this way goes through the same checks as any page:
// the quote must appear word for word in the text, and the rating, critic and date come from the page's own JSON-LD.
//
// Cost: every paid request is counted in .cache/fetch-ladder.json; past PAID_FETCH_CAP (default 250 a run) the paid steps
// are skipped and only the free archive is left. The CLI scripts/fetch-page.js is how Python (verify-quotes.py) and the
// synchronous fetchPage() in page.js reach it.
const fs = require('fs');
const path = require('path');

/** Where paid requests are counted; the tests point it elsewhere. */
const usageFile = () =>
  process.env.FETCH_LADDER_USAGE_FILE || path.join(__dirname, '..', '..', '.cache', 'fetch-ladder.json');
const DEFAULT_CAP = 250;
const TIMEOUT_MS = 45_000;

/** Pages shorter than this are a block page or a redirect, never an article. */
const MIN_PAGE_CHARS = 1500;

/**
 * True for a page that is a bot wall or an empty shell, not the article. Same markers as Broadway's
 * _isChallengeOrGarbage: Cloudflare and similar challenge pages, and an HTML page with almost no text.
 * @param {string} content
 */
function looksBlocked(content) {
  if (!content || !content.trim()) return true;
  if (/^(?:\(�\/�|\x1f�)/.test(content)) return true; // compressed bytes read as text
  if (/<title[^>]*>\s*(?:Just a moment(?:\.\.\.|…)|Attention Required!|Access denied|Verifying Device)/i.test(content))
    return true;
  if (content.includes('cf_chl_opt') && content.includes('challenge-platform')) return true;
  const text = content
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (
    content.length < 10_000 &&
    /Enable JavaScript and cookies to continue|Protected by Anubis|anubis_challenge|Please verify you are a human/i.test(
      content,
    )
  )
    return true;
  return text.length < 200 && content.length < 5000 && /<html/i.test(content);
}

/** Paid requests made so far (a file, because each fetch may run in its own process). @returns {{count: number}} */
function readUsage() {
  try {
    return JSON.parse(fs.readFileSync(usageFile(), 'utf8'));
  } catch {
    return { count: 0 };
  }
}

/** Counts one paid request; false when the cap is spent. */
function takePaidRequest() {
  const cap = Number(process.env.PAID_FETCH_CAP || DEFAULT_CAP);
  const usage = readUsage();
  if (usage.count >= cap) return false;
  fs.mkdirSync(path.dirname(usageFile()), { recursive: true });
  fs.writeFileSync(usageFile(), JSON.stringify({ count: usage.count + 1 }));
  return true;
}

/**
 * GET or POST that throws a message without the URL (it carries an API key).
 * @param {string} label
 * @param {string} url
 * @param {RequestInit} [init]
 */
async function request(label, url, init = {}) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new Error(`${label}: ${/** @type {Error} */ (e).name === 'TimeoutError' ? 'timeout' : 'network error'}`);
  }
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  return res.text();
}

/** @type {Record<string, {key: () => boolean, paid: boolean, get: (url: string) => Promise<string>}>} */
const TIERS = {
  scrapingdog: {
    paid: true,
    key: () => !!process.env.SCRAPINGDOG_API_KEY,
    get: (url) =>
      request(
        'ScrapingDog',
        `https://api.scrapingdog.com/scrape?${new URLSearchParams({ api_key: process.env.SCRAPINGDOG_API_KEY || '', url, dynamic: 'false' })}`,
      ),
  },
  brightdata: {
    paid: true,
    key: () => !!process.env.BRIGHTDATA_TOKEN && !!process.env.BRIGHTDATA_ZONE,
    get: (url) =>
      request('Bright Data', 'https://api.brightdata.com/request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.BRIGHTDATA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone: process.env.BRIGHTDATA_ZONE, url, format: 'raw' }),
      }),
  },
  scrapingbee: {
    paid: true,
    key: () => !!process.env.SCRAPINGBEE_API_KEY,
    get: (url) =>
      request(
        'ScrapingBee',
        `https://app.scrapingbee.com/api/v1/?api_key=${process.env.SCRAPINGBEE_API_KEY}&url=${encodeURIComponent(url)}&render_js=false`,
      ),
  },
  archive: {
    paid: false,
    key: () => true,
    get: async (url) => {
      const found = JSON.parse(
        await request('Internet Archive', `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`),
      );
      const closest = found?.archived_snapshots?.closest;
      if (!closest?.available || String(closest.status) !== '200' || !/^\d{14}$/.test(String(closest.timestamp)))
        throw new Error('Internet Archive: no saved copy');
      // The id_ form serves the stored bytes without the archive's own toolbar.
      return request('Internet Archive', `https://web.archive.org/web/${closest.timestamp}id_/${url}`);
    },
  },
};

const ORDER = ['scrapingdog', 'brightdata', 'scrapingbee', 'archive'];

/**
 * The page's HTML through the first service that returns a real page.
 * @param {string} url
 * @param {{log?: (msg: string) => void, tiers?: string[]}} [opts]
 * @returns {Promise<{content: string, source: string}>}
 */
async function fetchLadder(url, { log = () => {}, tiers = ORDER } = {}) {
  /** @type {string[]} */
  const why = [];
  for (const name of tiers) {
    const tier = TIERS[name];
    if (!tier || !tier.key()) continue;
    if (tier.paid && !takePaidRequest()) {
      why.push(`${name}: paid cap reached`);
      continue;
    }
    try {
      const content = await tier.get(url);
      if (looksBlocked(content) || content.length < MIN_PAGE_CHARS / 3) {
        why.push(`${name}: a block page`);
        continue;
      }
      log(`  read through ${name}`);
      return { content, source: name };
    } catch (e) {
      why.push(String(/** @type {Error} */ (e).message));
    }
  }
  throw new Error(`no service could read the page (${why.join('; ') || 'no service configured'})`);
}

module.exports = { fetchLadder, looksBlocked, TIERS, ORDER, MIN_PAGE_CHARS };
