import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchLadder, looksBlocked } from '../scripts/lib/fetch-ladder';

const ARTICLE = `<html><body><article>${'The tablet has a big bright screen and lasts all day. '.repeat(60)}</article></body></html>`;
const KEYS = ['SCRAPINGDOG_API_KEY', 'SCRAPINGBEE_API_KEY', 'BRIGHTDATA_TOKEN', 'BRIGHTDATA_ZONE', 'PAID_FETCH_CAP'];
let dir = '';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ladder-'));
  process.env.FETCH_LADDER_DIR = join(dir, 'ladder');
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) delete process.env[k];
  delete process.env.FETCH_LADDER_DIR;
  rmSync(dir, { recursive: true, force: true });
});

/** A fetch that answers by host and records every request's host. */
function network(answers: Record<string, string | number>) {
  const hosts: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const host = new URL(url).hostname;
      hosts.push(host);
      const a = answers[host];
      if (typeof a === 'number' || a === undefined) return new Response('no', { status: a ?? 500 });
      return new Response(a, { status: 200 });
    }),
  );
  return hosts;
}

describe('looksBlocked', () => {
  it('flags bot walls and empty shells, not articles', () => {
    expect(looksBlocked('')).toBe(true);
    expect(looksBlocked('<html><title>Just a moment...</title></html>')).toBe(true);
    expect(looksBlocked('<html><body>Enable JavaScript and cookies to continue</body></html>')).toBe(true);
    expect(looksBlocked('<html><body><div id="app"></div></body></html>')).toBe(true);
    expect(looksBlocked('<html><head><title>Pardon Our Interruption</title></head></html>')).toBe(true);
    expect(looksBlocked(`<html><body>Access to this page has been denied ${'x '.repeat(900)}</body></html>`)).toBe(
      true,
    );
    expect(looksBlocked(ARTICLE)).toBe(false);
  });
});

describe('fetchLadder', () => {
  it('uses only the services that have a key, in order, and stops at the first real page', async () => {
    process.env.SCRAPINGBEE_API_KEY = 'k';
    process.env.SCRAPINGDOG_API_KEY = 'k';
    const hosts = network({ 'api.scrapingdog.com': 403, 'app.scrapingbee.com': ARTICLE });
    const got = await fetchLadder('https://outlet.example/review');
    expect(got.source).toBe('scrapingbee');
    expect(hosts).toEqual(['api.scrapingdog.com', 'app.scrapingbee.com']);
  });

  it('skips a service whose page is a block page', async () => {
    process.env.SCRAPINGDOG_API_KEY = 'k';
    process.env.BRIGHTDATA_TOKEN = 't';
    process.env.BRIGHTDATA_ZONE = 'z';
    network({ 'api.scrapingdog.com': '<html><title>Just a moment...</title></html>', 'api.brightdata.com': ARTICLE });
    expect((await fetchLadder('https://outlet.example/review')).source).toBe('brightdata');
  });

  it('falls back to the newest saved copy in the Internet Archive with no keys at all', async () => {
    const hosts = network({
      'archive.org': JSON.stringify({
        archived_snapshots: { closest: { available: true, status: '200', timestamp: '20260101000000' } },
      }),
      'web.archive.org': ARTICLE,
    });
    const got = await fetchLadder('https://outlet.example/review');
    expect(got.source).toBe('archive');
    expect(hosts).toEqual(['archive.org', 'web.archive.org']);
  });

  it('stops paying after the cap and says why when nothing can read the page', async () => {
    process.env.SCRAPINGDOG_API_KEY = 'k';
    process.env.PAID_FETCH_CAP = '1';
    network({ 'api.scrapingdog.com': 403, 'archive.org': JSON.stringify({}) });
    await expect(fetchLadder('https://outlet.example/a')).rejects.toThrow(/ScrapingDog: HTTP 403/);
    await expect(fetchLadder('https://outlet.example/b')).rejects.toThrow(/paid cap reached/);
    expect(
      readFileSync(join(dir, 'ladder', 'usage.log'), 'utf8')
        .split('\n')
        .filter((l) => l === 'p'),
    ).toHaveLength(1);
  });

  it('stops asking paid services once one says the page does not exist, but still tries the free archive', async () => {
    process.env.SCRAPINGDOG_API_KEY = 'k';
    process.env.SCRAPINGBEE_API_KEY = 'k';
    const hosts = network({ 'api.scrapingdog.com': 404, 'archive.org': JSON.stringify({}) });
    await expect(fetchLadder('https://outlet.example/gone')).rejects.toThrow(/HTTP 404/);
    expect(hosts).toEqual(['api.scrapingdog.com', 'archive.org']);
  });

  it('pays for a page once per run: a second read comes from the cache, and so does a failure', async () => {
    process.env.SCRAPINGDOG_API_KEY = 'k';
    const hosts = network({ 'api.scrapingdog.com': ARTICLE });
    expect((await fetchLadder('https://outlet.example/a')).source).toBe('scrapingdog');
    expect((await fetchLadder('https://outlet.example/a')).source).toBe('cache');
    expect(hosts).toHaveLength(1);
    const bad = network({ 'api.scrapingdog.com': 403, 'archive.org': JSON.stringify({}) });
    await expect(fetchLadder('https://outlet.example/b')).rejects.toThrow(/no service could read/);
    const before = bad.length;
    await expect(fetchLadder('https://outlet.example/b')).rejects.toThrow(/already tried in this run/);
    expect(bad).toHaveLength(before);
  });

  it('stops paying once the run has spent its time allowance', async () => {
    process.env.SCRAPINGDOG_API_KEY = 'k';
    process.env.LADDER_TIME_CAP_S = '0';
    const hosts = network({ 'api.scrapingdog.com': ARTICLE, 'archive.org': JSON.stringify({}) });
    await expect(fetchLadder('https://outlet.example/slow')).rejects.toThrow(/paid cap reached/);
    expect(hosts).not.toContain('api.scrapingdog.com');
    delete process.env.LADDER_TIME_CAP_S;
  });

  it('counts concurrent requests without losing any', async () => {
    process.env.SCRAPINGDOG_API_KEY = 'k';
    network({ 'api.scrapingdog.com': ARTICLE });
    await Promise.all(Array.from({ length: 20 }, (_, i) => fetchLadder(`https://outlet.example/${i}`)));
    expect(
      readFileSync(join(dir, 'ladder', 'usage.log'), 'utf8')
        .split('\n')
        .filter((l) => l === 'p'),
    ).toHaveLength(20);
  });

  it('never puts an API key in an error message', async () => {
    process.env.SCRAPINGDOG_API_KEY = 'secret-key-123';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('fetch failed'))),
    );
    await expect(fetchLadder('https://outlet.example/a')).rejects.not.toThrow(/secret-key-123/);
  });
});
