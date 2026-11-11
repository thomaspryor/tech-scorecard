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
  process.env.FETCH_LADDER_USAGE_FILE = join(dir, 'usage.json');
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) delete process.env[k];
  delete process.env.FETCH_LADDER_USAGE_FILE;
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
    expect(JSON.parse(readFileSync(process.env.FETCH_LADDER_USAGE_FILE as string, 'utf8')).count).toBe(1);
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
