#!/usr/bin/env node
// Finds each outlet's RSS/Atom feed and saves it as `feeds` in data/outlets.json, so the daily refresh
// can read what outlets just published. Only outlets without a `feeds` entry are looked up (new ones);
// --retry-empty also tries those saved with `feeds: []` again, --all every outlet. An outlet with no
// readable feed gets `feeds: []` and is found by search alone. Two outlets on one domain share a feed,
// and only the first keeps it.
// Usage: node scripts/find-feeds.js [--all | --retry-empty]
const { DATA_DIR, loadData, writeData } = require('./lib/data-files');
const { fetchPageAsync } = require('./lib/page');
const { FEED_GUESSES, feedLinks, parseFeed } = require('./lib/feeds');

/** @typedef {import('../src/lib/data-types').Outlet} Outlet */

/** Feeds kept per outlet: the main one plus a reviews feed, when the homepage links both. */
const MAX_FEEDS = 2;
const PARALLEL = 16;

/** Up to MAX_FEEDS feed URLs for the outlet that parse and list items. @param {Outlet} o */
async function findFeeds(o) {
  const home = `https://${o.domain}/`;
  const html = await fetchPageAsync(home, 20);
  // https only (validation requires it); no site-search, video, podcast, web-story, contest or news-only feeds.
  const advertised = (html ? feedLinks(html, home) : []).filter(
    (u) => u.startsWith('https://') && !/[?&]s=|video|podcast|episodes|web-stories|contest|category\/news/i.test(u),
  );
  // Prefer a feed about reviews when the homepage offers one.
  advertised.sort((a, b) => Number(/review/i.test(b)) - Number(/review/i.test(a)));
  /** @type {string[]} */
  const found = [];
  for (const url of [...advertised, ...FEED_GUESSES.map((g) => new URL(g, home).href)]) {
    if (found.length >= MAX_FEEDS || (found.length && !advertised.includes(url))) break;
    if (found.includes(url)) continue;
    const xml = await fetchPageAsync(url, 20);
    if (xml && parseFeed(xml).length) found.push(url);
  }
  return found;
}

async function main() {
  const all = process.argv.includes('--all');
  const retryEmpty = process.argv.includes('--retry-empty');
  const data = loadData(DATA_DIR);
  const todo = data.outlets.filter((o) => all || !o.feeds || (retryEmpty && !o.feeds.length));
  for (let i = 0; i < todo.length; i += PARALLEL) {
    await Promise.all(
      todo.slice(i, i + PARALLEL).map(async (o) => {
        o.feeds = await findFeeds(o);
        console.log(`${o.id}: ${o.feeds.join(' ') || 'no feed'}`);
      }),
    );
  }
  // A feed already read for an earlier outlet (same domain) would only bring the same items twice.
  const taken = new Set();
  for (const o of data.outlets) {
    o.feeds = (o.feeds || []).filter((f) => !taken.has(f));
    o.feeds.forEach((f) => taken.add(f));
  }
  if (todo.length) writeData(DATA_DIR, { outlets: data.outlets });
  console.log(`${todo.filter((o) => o.feeds?.length).length} of ${todo.length} outlet(s) have a feed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
