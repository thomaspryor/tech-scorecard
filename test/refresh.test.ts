import { afterEach, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

// One product is checked (Gemini call 1), then the launch search runs (calls 2 and 3, it retries once).
// A single failed step is reported in problems.txt and the rest of the run goes on; only when every
// step fails does the run stop with nothing applied.
it.each([
  ['product', 0, 'product searches failed'],
  ['launch', 0, 'search for new launches failed'],
  ['all', 1, null],
  ['none', 0, null],
] as const)('handles a %s search failure', (failure, status, problem) => {
  const dir = mkdtempSync(join(tmpdir(), 'refresh-test-'));
  dirs.push(dir);
  cpSync('scripts', join(dir, 'scripts'), { recursive: true });
  cpSync('data', join(dir, 'data'), { recursive: true });
  mkdirSync(join(dir, 'src/config'), { recursive: true });
  cpSync('src/config/categories.json', join(dir, 'src/config/categories.json'));
  writeFileSync(join(dir, 'data/refresh-state.json'), '{}\n');
  const before = readFileSync(join(dir, 'data/reviews.json'), 'utf8');
  const fails = { product: 'calls===1', launch: 'calls>=2', all: 'true', none: 'false' }[failure];
  writeFileSync(
    join(dir, 'mock.cjs'),
    `let calls=0; global.fetch=async()=>{calls++; const fail=${fails}; return new Response(JSON.stringify(fail?{error:{message:'API key not valid'}}:{candidates:[{content:{parts:[{text:'[]'}]}}]}),{status:fail?400:200});};`,
  );
  const run = spawnSync(
    process.execPath,
    ['--require', join(dir, 'mock.cjs'), join(dir, 'scripts/refresh.js'), '--max-products=1', '--no-feeds'],
    { cwd: dir, encoding: 'utf8', timeout: 10000 },
  );
  expect(run.status, run.stderr).toBe(status);
  const state = JSON.parse(readFileSync(join(dir, 'data/refresh-state.json'), 'utf8'));
  // A product whose search failed is not marked as checked, so it is first in line next week.
  expect(Object.keys(state).length).toBe(failure === 'product' || failure === 'all' ? 0 : 1);
  if (failure === 'all') expect(run.stderr).toContain('Refresh incomplete');
  const problemsFile = join(dir, '.cache/refresh/problems.txt');
  if (problem) expect(readFileSync(problemsFile, 'utf8')).toContain(problem);
  else expect(existsSync(problemsFile)).toBe(false);
  expect(readFileSync(join(dir, 'data/reviews.json'), 'utf8')).toBe(before);
});

// The backfill step runs after the refresh and must never cost it anything: a failed or empty search leaves the data
// alone, exits 0, and a failure is reported in problems.txt next to the refresh's own.
it.each([
  ['an empty search', 'false', 0, null],
  ['a failed search', 'true', 0, 'backfill search for tablet failed'],
  ['an unknown category', 'false', 0, 'The backfill failed'],
] as const)('backfill-only handles %s without touching the data', (name, fail, status, problem) => {
  const dir = mkdtempSync(join(tmpdir(), 'backfill-test-'));
  dirs.push(dir);
  cpSync('scripts', join(dir, 'scripts'), { recursive: true });
  cpSync('data', join(dir, 'data'), { recursive: true });
  mkdirSync(join(dir, 'src/config'), { recursive: true });
  cpSync('src/config/categories.json', join(dir, 'src/config/categories.json'));
  rmSync(join(dir, 'data/backfill-state.json'), { force: true });
  mkdirSync(join(dir, '.cache/refresh'), { recursive: true });
  writeFileSync(join(dir, '.cache/refresh/touched.txt'), 'earlier-product');
  const before = ['products', 'reviews', 'outlets'].map((f) => readFileSync(join(dir, `data/${f}.json`), 'utf8'));
  writeFileSync(
    join(dir, 'mock.cjs'),
    `global.fetch=async()=>{const fail=${fail}; return new Response(JSON.stringify(fail?{error:{message:'API key not valid'}}:{candidates:[{content:{parts:[{text:'[]'}]}}]}),{status:fail?400:200});};`,
  );
  const category = name === 'an unknown category' ? 'toaster' : 'tablet';
  const run = spawnSync(
    process.execPath,
    ['--require', join(dir, 'mock.cjs'), join(dir, 'scripts/refresh.js'), '--backfill-only', `--category=${category}`],
    { cwd: dir, encoding: 'utf8', timeout: 20000 },
  );
  expect(run.status, run.stderr).toBe(status);
  expect(['products', 'reviews', 'outlets'].map((f) => readFileSync(join(dir, `data/${f}.json`), 'utf8'))).toEqual(
    before,
  );
  // What the refresh before it wrote is still there for the checks that follow.
  expect(readFileSync(join(dir, '.cache/refresh/touched.txt'), 'utf8')).toBe('earlier-product');
  const problemsFile = join(dir, '.cache/refresh/problems.txt');
  if (problem) expect(readFileSync(problemsFile, 'utf8')).toContain(problem);
  else expect(existsSync(problemsFile)).toBe(false);
  if (name === 'an empty search') {
    // A search that worked and found nothing counts as an empty run for that category.
    const state = JSON.parse(readFileSync(join(dir, 'data/backfill-state.json'), 'utf8'));
    expect(state.categories.tablet.misses).toBe(1);
  }
});
