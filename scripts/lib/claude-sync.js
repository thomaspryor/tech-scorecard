// Copies the Claude commands, agents and skills this repo borrows from Broadway Scorecard.
// Cloud sessions only see a repo's own .claude/, so these have to live here as copies;
// .github/workflows/sync-claude-skills.yml runs this daily so they never drift.
// ship-check, what-else and wrap-up are this repo's own versions and are not synced.
const fs = require('fs');
const path = require('path');

/** Paths under .claude/, the same in both repos. Directories are mirrored whole. */
const SYNCED = [
  'commands/did-it-work.md',
  'commands/plan-review.md',
  'commands/plan-tasks.md',
  'commands/right-problem.md',
  'commands/second-opinion.md',
  'agents/repo-sweeper.md',
  'agents/review-panelist.md',
  'skills/last30days',
];

const NOTE =
  '> Copied from Broadway Scorecard. In this repo, skip any step that calls a script this repo does not have (`scripts/lib/review-gate.mjs`, `scripts/linear-brain.js`, `scripts/codex/`, `scripts/scoring-delta.js`, `npm run db:build`). Use `npm run check`, `npm run validate` and `npm run build` instead.';

/**
 * A command file with the note added: after the front matter if it has one, else at the top.
 * @param {string} text
 */
function withNote(text) {
  const fm = text.match(/^---\n[\s\S]*?\n---\n/);
  if (fm) return `${fm[0]}\n${NOTE}\n${text.slice(fm[0].length)}`;
  return `${NOTE}\n\n${text}`;
}

/**
 * Every file under `dir`, relative to it, sorted. Skips Python caches.
 * @param {string} dir
 * @returns {string[]}
 */
function listFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__pycache__') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full).map((f) => path.join(e.name, f)));
    else out.push(e.name);
  }
  return out.sort();
}

/**
 * The files the synced copy should hold, as relative path -> contents.
 * @param {string} srcClaude the source repo's .claude directory
 * @returns {Map<string, Buffer>}
 */
function expectedFiles(srcClaude) {
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  for (const rel of SYNCED) {
    const src = path.join(srcClaude, rel);
    if (!fs.existsSync(src)) throw new Error(`missing in source: .claude/${rel}`);
    if (fs.statSync(src).isDirectory()) {
      for (const f of listFiles(src)) files.set(path.join(rel, f), fs.readFileSync(path.join(src, f)));
    } else if (rel.startsWith('commands/')) {
      files.set(rel, Buffer.from(withNote(fs.readFileSync(src, 'utf8'))));
    } else {
      files.set(rel, fs.readFileSync(src));
    }
  }
  return files;
}

/**
 * Brings `destClaude` in line with `srcClaude`. Returns the paths that changed (added,
 * updated or removed); with `dryRun` it only reports them.
 * @param {string} srcClaude
 * @param {string} destClaude
 * @param {{ dryRun?: boolean }} [opts]
 */
function syncClaude(srcClaude, destClaude, opts = {}) {
  const want = expectedFiles(srcClaude);
  /** @type {string[]} */
  const changed = [];
  for (const [rel, body] of want) {
    const dest = path.join(destClaude, rel);
    if (fs.existsSync(dest) && fs.readFileSync(dest).equals(body)) continue;
    changed.push(rel);
    if (!opts.dryRun) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, body);
    }
  }
  // Files the source deleted from a mirrored directory.
  for (const rel of SYNCED) {
    const dir = path.join(destClaude, rel);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    for (const f of listFiles(dir)) {
      const key = path.join(rel, f);
      if (want.has(key)) continue;
      changed.push(key);
      if (!opts.dryRun) fs.rmSync(path.join(dir, f));
    }
  }
  return changed.sort();
}

module.exports = { SYNCED, NOTE, withNote, syncClaude };
