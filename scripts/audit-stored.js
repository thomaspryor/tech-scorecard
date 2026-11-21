#!/usr/bin/env node
// Weekly re-read of every published review's page, with a plain request only (no paid service): a page that is gone (404/410) or
// a full page that no longer carries the quote is listed for the caretaker (docs/CARETAKER.md, "Reviews whose page changed").
// A page that refuses a plain request is counted, not listed: the daily pipeline reads those through the fetch services. Writes
// .cache/health/audit.md (empty when nothing was found) for scripts/alert-issue.sh. Changes no data.
// Usage: node scripts/audit-stored.js [--limit=N]
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { UA, pageText, containsQuote, reviewPages } = require('./lib/page');
const { looksBlocked } = require('./lib/fetch-ladder');
const { loadData } = require('./lib/data-files');
const { storedVerdict, issueBody } = require('./lib/health');

const OUT = path.join(__dirname, '..', '.cache', 'health');
const CONCURRENCY = 8;
/** Listed in the issue at most; the rest are counted. */
const MAX_LISTED = 40;
/** A multi-page review (GSMArena splits into up to 9 pages, verdict last) is read this many pages past the first. */
const MAX_EXTRA_PAGES = 8;
const limit = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || Infinity);

/** A plain request: status and body, never throws. @param {string} url @returns {Promise<{status: number, html: string}>} */
const plain = (url) =>
  new Promise((resolve) =>
    execFile(
      'curl',
      ['-sL', '-m', '20', '-A', UA, '-w', '\n%{http_code}', url],
      { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      (err, out) => {
        if (err && !out) return resolve({ status: 0, html: '' });
        const cut = String(out).lastIndexOf('\n');
        resolve({ status: Number(String(out).slice(cut + 1)) || 0, html: String(out).slice(0, cut) });
      },
    ),
  );

/** @param {{url: string, excerpt: string}} r */
async function check(r) {
  const first = await plain(r.url);
  const blocked = looksBlocked(first.html);
  let text = pageText(first.html);
  let quoteFound = containsQuote(text, r.excerpt);
  // Reviews split over several pages (GSMArena): the quote may be on a later one.
  for (const extra of quoteFound || blocked ? [] : reviewPages(r.url).slice(1, 1 + MAX_EXTRA_PAGES)) {
    const next = await plain(extra);
    if (next.status !== 200) break;
    const t = pageText(next.html);
    text += ` ${t}`;
    if (containsQuote(t, r.excerpt)) {
      quoteFound = true;
      break;
    }
  }
  return storedVerdict({ status: first.status, blocked, textLength: text.length, quoteFound });
}

async function main() {
  const { reviews } = loadData();
  const todo = reviews.slice(0, limit);
  /** @type {Record<string, typeof todo>} */
  const by = { gone: [], 'quote-missing': [], unknown: [], ok: [] };
  // A pool of workers, so one slow page holds up only its own worker, not a whole batch.
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const r = todo[next++];
      by[await check(r)].push(r);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(
    `audit: ${todo.length} reviews read: ${by.ok.length} fine, ${by.gone.length} gone, ${by['quote-missing'].length} quote no longer on the page, ${by.unknown.length} could not be read with a plain request`,
  );
  const listed = [
    ...by.gone.map((r) => `${r.productId} / ${r.outletId}: the page is gone (404). ${r.url}`),
    ...by['quote-missing'].map((r) => `${r.productId} / ${r.outletId}: the quote is no longer on the page. ${r.url}`),
  ];
  for (const line of listed) console.log(`  ${line}`);
  /** @type {import('./lib/health').Finding[]} */
  const findings = listed.slice(0, MAX_LISTED).map((text) => ({ level: 'action', text }));
  if (listed.length > MAX_LISTED)
    findings.push({ level: 'note', text: `${listed.length - MAX_LISTED} more are in the run log.` });
  if (by.unknown.length)
    findings.push({ level: 'note', text: `${by.unknown.length} pages refused a plain request and were not checked.` });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(
    path.join(OUT, 'audit.md'),
    issueBody(
      `The weekly re-read of every published review on ${new Date().toISOString().slice(0, 10)} found pages that changed. Nothing for the owner to do.`,
      findings,
    ),
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
