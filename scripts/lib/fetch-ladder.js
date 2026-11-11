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
// Cost and time: every paid request and every millisecond spent here is appended to .cache/fetch-ladder/usage.log (an
// append-only log, so scripts running at once cannot lose a count). Past PAID_FETCH_CAP (default 250) requests or
// LADDER_TIME_CAP_S (default 2400) seconds in a run, the paid steps are skipped and only the free archive is left. Every
// page read (or failed) is cached in .cache/fetch-ladder/pages, so each URL is paid for at most once per run however many
// scripts read it. The CLI scripts/fetch-page.js is how Python (verify-quotes.py) and the synchronous fetchPage() in
// page.js reach it. refresh-pipeline.sh clears the folder at the start of every run.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** Where the usage log and the page cache live; the tests point it elsewhere. */
const dir = () => process.env.FETCH_LADDER_DIR || path.join(__dirname, '..', '..', '.cache', 'fetch-ladder');
const usageFile = () => path.join(dir(), 'usage.log');
const DEFAULT_CAP = 250;
const DEFAULT_TIME_CAP_S = 2400;
const TIMEOUT_MS = 30_000;

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
  if (
    /<title[^>]*>\s*(?:Just a moment(?:\.\.\.|…)|Attention Required!|Access denied|Verifying Device|Pardon Our Interruption|Request unsuccessful)/i.test(
      content,
    )
  )
    return true;
  if (content.includes('cf_chl_opt') && content.includes('challenge-platform')) return true;
  if (content.length < 15_000 && /Access to this page has been denied|px-captcha|Incapsula incident/i.test(content))
    return true;
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

/** What this run has spent so far: paid requests, and milliseconds inside the ladder. @returns {{count: number, ms: number}} */
function readUsage() {
  let count = 0;
  let ms = 0;
  try {
    for (const line of fs.readFileSync(usageFile(), 'utf8').split('\n')) {
      if (line === 'p') count++;
      else if (line.startsWith('t')) ms += Number(line.slice(1)) || 0;
    }
  } catch {
    /* no log yet: nothing spent */
  }
  return { count, ms };
}

/** @param {string} line */
function record(line) {
  fs.mkdirSync(dir(), { recursive: true });
  fs.appendFileSync(usageFile(), `${line}\n`);
}

/** Counts one paid request; false when this run's request or time cap is spent. */
function takePaidRequest() {
  const cap = Number(process.env.PAID_FETCH_CAP || DEFAULT_CAP);
  const timeCapMs = Number(process.env.LADDER_TIME_CAP_S || DEFAULT_TIME_CAP_S) * 1000;
  const usage = readUsage();
  if (usage.count >= cap || usage.ms >= timeCapMs) return false;
  record('p');
  return true;
}

/** The cache file for a URL. @param {string} url @param {string} ext */
const cacheFile = (url, ext) =>
  path.join(dir(), 'pages', `${crypto.createHash('md5').update(url).digest('hex')}.${ext}`);

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
  if (!res.ok) throw Object.assign(new Error(`${label}: HTTP ${res.status}`), { status: res.status });
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
 * The page's HTML through the first service that returns a real page. A page already read (or already failed) in this
 * run comes from the cache, so it is never paid for twice.
 * @param {string} url
 * @param {{log?: (msg: string) => void, tiers?: string[]}} [opts]
 * @returns {Promise<{content: string, source: string}>}
 */
async function fetchLadder(url, { log = () => {}, tiers = ORDER } = {}) {
  try {
    return { content: fs.readFileSync(cacheFile(url, 'html'), 'utf8'), source: 'cache' };
  } catch {
    /* not cached */
  }
  /** @type {string | null} */
  let failedBefore = null;
  try {
    failedBefore = fs.readFileSync(cacheFile(url, 'fail'), 'utf8');
  } catch {
    /* no earlier failure */
  }
  if (failedBefore) throw new Error(`${failedBefore} (already tried in this run)`);

  const started = Date.now();
  /** @type {string[]} */
  const why = [];
  let gone = false;
  try {
    for (const name of tiers) {
      const tier = TIERS[name];
      if (!tier || !tier.key()) continue;
      // A paid service that says the page does not exist is right: asking the others would only cost more.
      if (tier.paid && gone) continue;
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
        fs.mkdirSync(path.dirname(cacheFile(url, 'html')), { recursive: true });
        fs.writeFileSync(cacheFile(url, 'html'), content);
        log(`  read through ${name}`);
        return { content, source: name };
      } catch (e) {
        why.push(String(/** @type {Error} */ (e).message));
        const status = /** @type {{status?: number}} */ (e).status;
        if (tier.paid && (status === 404 || status === 410)) gone = true;
      }
    }
    const message = `no service could read the page (${why.join('; ') || 'no service configured'})`;
    // Remember the failure for the rest of the run, unless it was only a spent cap (a later page might not hit it).
    if (why.length && !why.some((w) => /paid cap reached/.test(w))) {
      fs.mkdirSync(path.dirname(cacheFile(url, 'fail')), { recursive: true });
      fs.writeFileSync(cacheFile(url, 'fail'), message);
    }
    throw new Error(message);
  } finally {
    record(`t${Date.now() - started}`);
  }
}

module.exports = { fetchLadder, looksBlocked, TIERS, ORDER, MIN_PAGE_CHARS };
