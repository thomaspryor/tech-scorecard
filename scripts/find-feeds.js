#!/usr/bin/env node
// Finds each outlet's RSS/Atom feed and saves it as `feeds` in data/outlets.json, so the daily refresh
// can read what outlets just published. Only outlets without a `feeds` entry are looked up (new ones),
// unless --all. An outlet with no readable feed gets `feeds: []` and is found by search alone.
// Usage: node scripts/find-feeds.js [--all]
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
  // https only (validation requires it), and no site-search feeds ("?s=...").
  const advertised = (html ? feedLinks(html, home) : []).filter((u) => u.startsWith('https://') && !/[?&]s=/.test(u));
  // Prefer a feed about reviews when the homepage offers one.
  advertised.sort((a, b) => Number(/review/i.test(b)) - Number(/review/i.test(a)));
  /** @type {string[]} */
  const found = [];
  for (const url of [...advertised, ...FEED_GUESSES.map((g) => new URL(g, home).href)]) {
    if (found.length >= MAX_FEEDS || (found.length && !advertised.includes(url))) break;
    const xml = await fetchPageAsync(url, 20);
    if (xml && parseFeed(xml).length) found.push(url);
  }
  return found;
}

async function main() {
  const all = process.argv.includes('--all');
  const data = loadData(DATA_DIR);
  const todo = data.outlets.filter((o) => all || !o.feeds);
  for (let i = 0; i < todo.length; i += PARALLEL) {
    await Promise.all(
      todo.slice(i, i + PARALLEL).map(async (o) => {
        o.feeds = await findFeeds(o);
        console.log(`${o.id}: ${o.feeds.join(' ') || 'no feed'}`);
      }),
    );
  }
  if (todo.length) writeData(DATA_DIR, { outlets: data.outlets });
  console.log(`${todo.filter((o) => o.feeds?.length).length} of ${todo.length} outlet(s) have a feed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
