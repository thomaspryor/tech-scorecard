import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NOTE, SYNCED, syncClaude, withNote } from '../scripts/lib/claude-sync';

/** A fake source .claude/ with every synced path present. */
function fakeSource(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-src-'));
  for (const rel of SYNCED) {
    const p = path.join(root, rel);
    if (rel.includes('.')) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, `body of ${rel}\n`);
    } else {
      fs.mkdirSync(path.join(p, 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(p, 'SKILL.md'), 'skill\n');
      fs.writeFileSync(path.join(p, 'scripts', 'run.py'), 'print(1)\n');
    }
  }
  return root;
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'claude-dest-'));

describe('withNote', () => {
  it('puts the note at the top of a plain file', () => {
    expect(withNote('# Title\n')).toBe(`${NOTE}\n\n# Title\n`);
  });

  it('puts the note after front matter', () => {
    expect(withNote('---\nname: x\n---\nBody\n')).toBe(`---\nname: x\n---\n\n${NOTE}\nBody\n`);
  });
});

describe('syncClaude', () => {
  it('copies everything, adds the note to commands only, and is then a no-op', () => {
    const src = fakeSource();
    const dest = tmp();
    const changed = syncClaude(src, dest);
    expect(changed).toContain('commands/plan-review.md');
    expect(changed).toContain(path.join('skills/last30days', 'scripts', 'run.py'));
    expect(fs.readFileSync(path.join(dest, 'commands/plan-review.md'), 'utf8')).toContain(NOTE);
    expect(fs.readFileSync(path.join(dest, 'agents/repo-sweeper.md'), 'utf8')).toBe('body of agents/repo-sweeper.md\n');
    expect(syncClaude(src, dest)).toEqual([]);
  });

  it('picks up an upstream edit and a file deleted upstream', () => {
    const src = fakeSource();
    const dest = tmp();
    syncClaude(src, dest);
    fs.writeFileSync(path.join(src, 'commands/second-opinion.md'), 'new version\n');
    fs.rmSync(path.join(src, 'skills/last30days/scripts/run.py'));
    const stale = path.join('skills/last30days', 'scripts', 'run.py');
    expect(syncClaude(src, dest, { dryRun: true })).toEqual(['commands/second-opinion.md', stale]);
    expect(fs.existsSync(path.join(dest, stale))).toBe(true);
    syncClaude(src, dest);
    expect(fs.existsSync(path.join(dest, stale))).toBe(false);
    expect(fs.readFileSync(path.join(dest, 'commands/second-opinion.md'), 'utf8')).toBe(withNote('new version\n'));
  });

  it('leaves this repo’s own commands alone', () => {
    const src = fakeSource();
    const dest = tmp();
    fs.mkdirSync(path.join(dest, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(dest, 'commands/wrap-up.md'), 'ours\n');
    syncClaude(src, dest);
    expect(fs.readFileSync(path.join(dest, 'commands/wrap-up.md'), 'utf8')).toBe('ours\n');
  });

  it('refuses when the source is missing a synced path', () => {
    const src = fakeSource();
    fs.rmSync(path.join(src, 'commands/plan-tasks.md'));
    expect(() => syncClaude(src, tmp())).toThrow(/missing in source: .claude\/commands\/plan-tasks.md/);
  });
});
