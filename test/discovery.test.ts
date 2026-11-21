import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findByOutletSearch, isGoogleWrapper, isListingUrl, pickResults, searchName } from '../scripts/lib/discovery';
import { readUsage } from '../scripts/lib/fetch-ladder';

const outlets = [
  { id: 'the-verge', name: 'The Verge', tier: 1, domain: 'theverge.com' },
  { id: 'cnet', name: 'CNET', tier: 1, domain: 'cnet.com' },
  { id: 'gsmarena', name: 'GSMArena', tier: 3, domain: 'gsmarena.com' },
];
const pixel10 = { id: 'pixel-10', name: 'Google Pixel 10', brand: 'Google' };
let dir = '';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'serp-'));
  process.env.FETCH_LADDER_DIR = join(dir, 'ladder');
  process.env.SCRAPINGDOG_API_KEY = 'test-key';
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SCRAPINGDOG_API_KEY;
  delete process.env.FETCH_LADDER_DIR;
  rmSync(dir, { recursive: true, force: true });
});

/** A search that answers each site: query with the given results. */
function google(bySite: Record<string, { link: string; title: string }[]>) {
  const queries: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const q = new URL(url).searchParams.get('query') || '';
      queries.push(q);
      const site = q.match(/^site:(\S+)/)?.[1] || '';
      return new Response(JSON.stringify({ organic_results: bySite[site] || [] }), { status: 200 });
    }),
  );
  return queries;
}

describe('searchName', () => {
  it('opens brackets, drops years and sizes, and spells out +', () => {
    expect(searchName('Apple MacBook Air (M5, 2026)')).toBe('Apple MacBook Air M5');
    expect(searchName('Samsung Galaxy S26+')).toBe('Samsung Galaxy S26 Plus');
    expect(searchName('Valve Steam Frame (256GB)')).toBe('Valve Steam Frame');
  });
});

describe('isListingUrl', () => {
  it('flags home, tag, author and search pages', () => {
    expect(isListingUrl('https://www.theverge.com/')).toBe(true);
    expect(isListingUrl('https://www.theverge.com/tag/pixel/')).toBe(true);
    expect(isListingUrl('https://www.cnet.com/author/jane/')).toBe(true);
    expect(isListingUrl('https://www.theverge.com/reviews/123/pixel-10-review')).toBe(false);
  });
});

describe('pickResults', () => {
  it('drops siblings, listings and other sites, and ranks the named review first', () => {
    const results = [
      {
        link: 'https://www.theverge.com/tech/1/pixel-10a-hands-on',
        title: 'The Pixel 10A is a little too much like last year',
      },
      { link: 'https://www.theverge.com/tag/google-pixel', title: 'Google Pixel' },
      { link: 'https://www.cnet.com/reviews/pixel-10', title: 'Pixel 10 review' },
      { link: 'https://www.theverge.com/news/2/google-event', title: 'Everything Google announced' },
      { link: 'https://www.theverge.com/reviews/3/google-pixel-10-review', title: 'Google Pixel 10 review: steady' },
    ];
    expect(pickResults(results, pixel10, outlets[0], outlets)).toEqual([
      'https://www.theverge.com/reviews/3/google-pixel-10-review',
      'https://www.theverge.com/news/2/google-event',
    ]);
  });

  it('drops a result about another product on the site', () => {
    const pro = { id: 'pixel-10-pro-fold', name: 'Google Pixel 10 Pro Fold', brand: 'Google' };
    const s26 = { id: 'galaxy-s26', name: 'Samsung Galaxy S26', brand: 'Samsung' };
    const ultra = { id: 'galaxy-s26-ultra', name: 'Samsung Galaxy S26 Ultra', brand: 'Samsung' };
    const results = [
      { link: 'https://www.theverge.com/reviews/galaxy-s26-review', title: 'Samsung Galaxy S26 review' },
      { link: 'https://www.theverge.com/reviews/galaxy-s26-ultra-review', title: 'Samsung Galaxy S26 Ultra review' },
    ];
    expect(pickResults(results, ultra, outlets[0], outlets, [s26, ultra, pro])).toEqual([
      'https://www.theverge.com/reviews/galaxy-s26-ultra-review',
    ]);
  });

  it('drops a result about the smaller sibling even when the site does not carry it', () => {
    const ultra = { id: 'galaxy-s26-ultra', name: 'Samsung Galaxy S26 Ultra', brand: 'Samsung' };
    const results = [
      { link: 'https://www.theverge.com/reviews/galaxy-s26-review', title: 'Samsung Galaxy S26 review' },
      { link: 'https://www.theverge.com/reviews/galaxy-s26-ultra-review', title: 'Samsung Galaxy S26 Ultra review' },
    ];
    expect(pickResults(results, ultra, outlets[0], outlets, [ultra])).toEqual([
      'https://www.theverge.com/reviews/galaxy-s26-ultra-review',
    ]);
  });

  it('keeps only results naming the product when asked (a loose search)', () => {
    const results = [
      { link: 'https://www.theverge.com/reviews/1/old-tablet-review', title: 'Some old tablet review' },
      { link: 'https://www.theverge.com/reviews/3/google-pixel-10-review', title: 'Google Pixel 10 review' },
    ];
    expect(pickResults(results, pixel10, outlets[0], outlets, [], { requireNamed: true })).toEqual([
      'https://www.theverge.com/reviews/3/google-pixel-10-review',
    ]);
  });

  it('drops Google redirect links it cannot follow', () => {
    expect(isGoogleWrapper('https://www.google.com/url?opi=1&sa=U&url=CAES')).toBe(true);
    expect(isGoogleWrapper('https://www.theverge.com/url-shorteners-review')).toBe(false);
  });
});

describe('findByOutletSearch', () => {
  const opts = { skip: new Set<string>(), maxTier: 4, maxQueries: 10, runLimit: 100 };

  it('searches each outlet once, in rank order, and returns the picked pages', async () => {
    const queries = google({
      'theverge.com': [
        { link: 'https://www.theverge.com/reviews/3/google-pixel-10-review', title: 'Google Pixel 10 review' },
      ],
      'gsmarena.com': [
        { link: 'https://www.gsmarena.com/google_pixel_10-review-2900.php', title: 'Google Pixel 10 review' },
      ],
    });
    const res = await findByOutletSearch(pixel10, outlets, {
      ...opts,
      rank: (o) => (o.id === 'gsmarena' ? 0 : o.tier),
    });
    expect(queries[0]).toBe('site:gsmarena.com "Google Pixel 10" intitle:review');
    expect(res.searchedIds).toEqual(['gsmarena', 'the-verge', 'cnet']);
    expect(res.urls).toEqual([
      'https://www.gsmarena.com/google_pixel_10-review-2900.php',
      'https://www.theverge.com/reviews/3/google-pixel-10-review',
    ]);
    // CNET answered with nothing of its own: asked once more, then once without the exact phrase.
    expect(queries.slice(2)).toEqual([
      'site:cnet.com "Google Pixel 10" intitle:review',
      'site:cnet.com "Google Pixel 10" intitle:review',
      'site:cnet.com Google Pixel 10 review',
    ]);
    expect(readUsage().serp).toBe(5);
  });

  it('skips outlets that already have a review and those above maxTier, and stops at the run limit', async () => {
    const queries = google({});
    await findByOutletSearch(pixel10, outlets, { ...opts, skip: new Set(['the-verge']), maxTier: 2 });
    expect(queries.every((q) => q.startsWith('site:cnet.com'))).toBe(true);
    expect(readUsage().serp).toBe(3);
    const more = google({});
    await findByOutletSearch({ ...pixel10, id: 'x', name: 'Google Pixel 11' }, outlets, { ...opts, runLimit: 4 });
    expect(more).toHaveLength(1); // three searches were already used in this run, so only one more fits under 4
  });

  it('answers a repeated question from the cache, for free', async () => {
    const queries = google({
      'theverge.com': [
        { link: 'https://www.theverge.com/reviews/3/google-pixel-10-review', title: 'Google Pixel 10 review' },
      ],
    });
    await findByOutletSearch(pixel10, [outlets[0]], { ...opts, maxQueries: 1 });
    await findByOutletSearch(pixel10, [outlets[0]], { ...opts, maxQueries: 1 });
    expect(queries).toHaveLength(1);
    expect(readUsage().serp).toBe(1);
  });

  it('counts searches, not outlets, against the per-product limit, and leaves a cut-short outlet unsearched', async () => {
    const queries = google({}); // nothing from any outlet: each one would take 3 searches
    const res = await findByOutletSearch(pixel10, outlets, { ...opts, maxQueries: 4 });
    expect(queries).toHaveLength(4);
    // The first outlet took all 3 of its searches; the second got 1 of 3 before the limit, so a later pass may try it again.
    expect(res.searchedIds).toEqual(['the-verge']);
  });

  it('stops searching once the run has spent its search time, without touching the time paid page reads need', async () => {
    google({});
    process.env.SERP_TIME_CAP_S = '0';
    try {
      const res = await findByOutletSearch(pixel10, outlets, opts);
      expect(res.searchedIds).toEqual([]);
      expect(readUsage().serp).toBe(0);
    } finally {
      delete process.env.SERP_TIME_CAP_S;
    }
  });

  it('stops after repeated failures, so the caller falls back to Gemini', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    );
    const res = await findByOutletSearch(pixel10, outlets, opts);
    expect(res.urls).toEqual([]);
    expect(res.failed).toBe(3);
  });
});
