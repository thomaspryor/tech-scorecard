#!/usr/bin/env node
// Prints a page's HTML read through the paid fetch services and the Internet Archive (scripts/lib/fetch-ladder.js).
// Used by verify-quotes.py and, through fetchPage() in scripts/lib/page.js, by every script that reads a review page
// a plain request could not. Exits 1 (printing a reason on stderr) when no service could read it.
// Usage: node scripts/fetch-page.js <url>
const { fetchLadder } = require('./lib/fetch-ladder');

const url = process.argv[2];
if (!/^https?:\/\//.test(url || '')) {
  console.error('usage: node scripts/fetch-page.js <url>');
  process.exit(2);
}
fetchLadder(url, { log: (m) => console.error(m) }).then(
  ({ content }) => process.stdout.write(content),
  (e) => {
    console.error(e.message);
    process.exit(1);
  },
);
