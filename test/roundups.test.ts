import { describe, expect, it } from 'vitest';
import { buildRoundups, getRoundups, roundupsFor, MIN_PRODUCTS_FOR_ROUNDUP } from '@/lib/roundups';
import { bestYear, type ScoredProduct } from '@/lib/data';
import { fitTitle, titleCandidates } from '@/lib/seo';
import { MAX_TITLE_LENGTH, TITLE_SUFFIX } from '@/config/seo';
import type { Category } from '@/lib/data-types';
import { product } from './fixtures';

let n = 0;
function p(over: { brand?: string; category?: Category; launchPrice?: number | null }): ScoredProduct {
  n += 1;
  return {
    ...product({ id: `p${n}`, slug: `p${n}`, brand: `Brand${n}`, ...over }),
    criticScore: 80,
  } as unknown as ScoredProduct;
}
const many = (count: number, over: Parameters<typeof p>[0]) => Array.from({ length: count }, () => p(over));

describe('buildRoundups', () => {
  it('makes a brand page only with enough products', () => {
    const list = [
      ...many(MIN_PRODUCTS_FOR_ROUNDUP, { brand: 'Acme' }),
      ...many(MIN_PRODUCTS_FOR_ROUNDUP - 1, { brand: 'Zed' }),
    ];
    const slugs = buildRoundups(list).map((r) => r.slug);
    expect(slugs).toContain('acme');
    expect(slugs).not.toContain('zed');
  });

  it('keeps price pages strict: launch price below the cap', () => {
    const list = [
      ...many(4, { launchPrice: 199 }),
      ...many(4, { launchPrice: 200 }),
      ...many(4, { launchPrice: 2500 }),
    ];
    const r = buildRoundups(list).find((x) => x.slug === 'under-200');
    expect(r?.products).toHaveLength(4);
    expect(r?.products.every((x) => (x.launchPrice ?? 0) < 200)).toBe(true);
  });

  it('skips a price page that is nearly the whole list', () => {
    const list = [...many(6, { launchPrice: 150 }), ...many(1, { launchPrice: 900 })];
    expect(buildRoundups(list).some((r) => r.slug === 'under-200')).toBe(false);
  });

  it('skips a cap that adds almost nothing over the previous one', () => {
    const list = [...many(5, { launchPrice: 150 }), ...many(1, { launchPrice: 250 }), ...many(6, { launchPrice: 900 })];
    const slugs = buildRoundups(list).map((r) => r.slug);
    expect(slugs).toContain('under-200');
    expect(slugs).not.toContain('under-300');
  });

  it('builds category price pages, leaving out products without a price', () => {
    const list = [
      ...many(4, { category: 'phone', launchPrice: 450 }),
      ...many(3, { category: 'phone', launchPrice: 1200 }),
      ...many(2, { category: 'phone', launchPrice: null }),
      ...many(3, { category: 'tablet', launchPrice: 300 }),
    ];
    const r = buildRoundups(list).find((x) => x.slug === 'phones-under-500');
    expect(r?.category).toBe('phone');
    expect(r?.products).toHaveLength(4);
  });

  it('never emits two pages with the same products', () => {
    const list = [
      ...many(5, { category: 'phone', launchPrice: 100 }),
      ...many(4, { category: 'tablet', launchPrice: 900 }),
    ];
    const keys = buildRoundups(list).map((r) =>
      r.products
        .map((x) => x.id)
        .sort()
        .join(),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('roundups over the real data', () => {
  const all = getRoundups();

  it('has unique slugs, enough products each, ranked best first', () => {
    expect(new Set(all.map((r) => r.slug)).size).toBe(all.length);
    for (const r of all) {
      expect(r.products.length, r.slug).toBeGreaterThanOrEqual(MIN_PRODUCTS_FOR_ROUNDUP);
      const scores = r.products.map((x) => x.criticScore);
      expect(scores, r.slug).toEqual([...scores].sort((a, b) => b - a));
    }
  });

  it('fits every title, keeping the year and "critic score"', () => {
    for (const r of all) {
      const t = fitTitle(titleCandidates.roundup(r.subject, bestYear()));
      const rendered = typeof t === 'string' ? t + TITLE_SUFFIX : t.absolute;
      expect(rendered.length, rendered).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
      expect(rendered, rendered).toContain(String(bestYear()));
      expect(rendered, rendered).toContain('critic score');
    }
  });

  it('links a product only to lists it is on', () => {
    for (const r of all) {
      for (const x of r.products) {
        for (const l of roundupsFor(x)) {
          if (l.kind === 'brand') expect(l.brand).toBe(x.brand);
          else expect(x.launchPrice ?? Infinity).toBeLessThan(l.cap ?? 0);
        }
      }
    }
  });
});
