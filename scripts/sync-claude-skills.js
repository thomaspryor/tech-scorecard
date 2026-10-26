#!/usr/bin/env node
// Refreshes the Claude commands, agents and skills copied from Broadway Scorecard.
// Usage: node scripts/sync-claude-skills.js --from=<Broadwayscore checkout> [--check]
// --check changes nothing and exits 1 if the copies are out of date.
const path = require('path');
const { execFileSync } = require('child_process');
const { SYNCED, syncClaude } = require('./lib/claude-sync');

const arg = (/** @type {string} */ name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const from = arg('from');
if (!from) {
  console.error('usage: node scripts/sync-claude-skills.js --from=<Broadwayscore checkout> [--check]');
  process.exit(2);
}
const check = process.argv.includes('--check');
const root = path.join(__dirname, '..');
const changed = syncClaude(path.join(from, '.claude'), path.join(root, '.claude'), { dryRun: check });

// A synced file that .gitignore matches would be copied but never committed (this happened to
// last30days' vendored node_modules), so refuse rather than let it drop out silently.
const ignored = execFileSync(
  'git',
  ['ls-files', '--others', '--ignored', '--exclude-standard', ...SYNCED.map((p) => `.claude/${p}`)],
  {
    cwd: root,
    encoding: 'utf8',
  },
).trim();
if (ignored) {
  console.error(`These synced files are git-ignored and would never be committed; fix .gitignore:\n${ignored}`);
  process.exit(1);
}

if (!changed.length) console.log('Claude skills: up to date.');
else {
  console.log(`Claude skills: ${changed.length} file(s) ${check ? 'out of date' : 'updated'}:`);
  for (const f of changed) console.log(`- .claude/${f}`);
  if (check) process.exit(1);
}
