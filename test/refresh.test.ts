import { afterEach, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

it.each(['product', 'launch', 'none'])('reports %s search failure without importing or advancing state', (failure) => {
  const dir = mkdtempSync(join(tmpdir(), 'refresh-test-'));
  dirs.push(dir);
  cpSync('scripts', join(dir, 'scripts'), { recursive: true });
  cpSync('data', join(dir, 'data'), { recursive: true });
  mkdirSync(join(dir, 'src/config'), { recursive: true });
  cpSync('src/config/categories.json', join(dir, 'src/config/categories.json'));
  writeFileSync(join(dir, 'data/refresh-state.json'), '{}\n');
  const before = readFileSync(join(dir, 'data/reviews.json'), 'utf8');
  writeFileSync(
    join(dir, 'mock.cjs'),
    `let calls=0; global.fetch=async()=>{calls++; const fail=${JSON.stringify(failure)}==='product'?calls===1:${JSON.stringify(failure)}==='launch'?calls>=2:false; return new Response(JSON.stringify(fail?{error:{message:'API key not valid'}}:{candidates:[{content:{parts:[{text:'[]'}]}}]}),{status:fail?400:200});};`,
  );
  const run = spawnSync(
    process.execPath,
    ['--require', join(dir, 'mock.cjs'), join(dir, 'scripts/refresh.js'), '--max-products=1'],
    { cwd: dir, encoding: 'utf8', timeout: 10000 },
  );
  expect(run.status).toBe(failure === 'none' ? 0 : 1);
  if (failure !== 'none') {
    expect(run.stderr).toContain('Refresh incomplete');
    expect(readFileSync(join(dir, 'data/refresh-state.json'), 'utf8')).toBe('{}\n');
  }
  expect(readFileSync(join(dir, 'data/reviews.json'), 'utf8')).toBe(before);
});
