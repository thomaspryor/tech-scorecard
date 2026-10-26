import { describe, expect, it } from 'vitest';
import { fitTitle, titleCandidates } from '@/lib/seo';
import { bestYear, bestYearFrom, getAllProducts, BEST_YEAR_MIN_REVIEWS } from '@/lib/data';
import { CATEGORY_PLURAL } from '@/lib/format';
import { MAX_TITLE_LENGTH, TITLE_SUFFIX } from '@/config/seo';

/** The <title> Next renders for a fitTitle result. */
const rendered = (t: ReturnType<typeof fitTitle>) => (typeof t === 'string' ? t + TITLE_SUFFIX : t.absolute);

describe('fitTitle', () => {
  it('keeps the first candidate that fits with the suffix', () => {
    expect(fitTitle(['A very long title that will not fit at all with the suffix on it', 'Short'], 40)).toBe('Short');
  });

  it('drops the suffix when no candidate fits with it', () => {
    expect(fitTitle(['x'.repeat(30), 'y'.repeat(20)], 30)).toEqual({ absolute: 'x'.repeat(30) });
  });

  it('falls back to the last candidate when nothing fits', () => {
    expect(fitTitle(['x'.repeat(50), 'y'.repeat(40)], 30)).toEqual({ absolute: 'y'.repeat(40) });
  });

  // The pages' own candidates over the real data, so new products are covered as they arrive.
  it('fits every product title, keeping the score whenever the name allows', () => {
    for (const p of getAllProducts()) {
      const score = p.criticScore != null ? Math.round(p.criticScore) : null;
      const t = rendered(fitTitle(titleCandidates.product(p.name, score)));
      // Only a name too long for even "<name> reviews" may go over.
      if (`${p.name} reviews`.length <= MAX_TITLE_LENGTH) expect(t.length, t).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
      if (score != null && `${p.name} reviews: ${score}/100`.length <= MAX_TITLE_LENGTH)
        expect(t, t).toContain(`${score}/100`);
    }
  });

  it('fits every category and the best page, keeping "critic score"', () => {
    const year = bestYear();
    const titles = [
      ...Object.values(CATEGORY_PLURAL).map((plural) => rendered(fitTitle(titleCandidates.category(plural, year)))),
      rendered(fitTitle(titleCandidates.best(year))),
    ];
    for (const t of titles) {
      expect(t.length, t).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
      expect(t, t).toContain('critic score');
    }
  });
});

describe('bestYearFrom', () => {
  const dates = (n: number, year: number) =>
    Array.from({ length: n }, (_, i) => `${year}-01-${String(i + 1).padStart(2, '0')}`);

  it('stays on the old year until enough reviews are in the new one', () => {
    expect(bestYearFrom([...dates(30, 2026), ...dates(BEST_YEAR_MIN_REVIEWS - 1, 2027)])).toBe(2026);
    expect(bestYearFrom([...dates(30, 2026), ...dates(BEST_YEAR_MIN_REVIEWS, 2027)])).toBe(2027);
  });

  it('uses the oldest date when there are only a few', () => {
    expect(bestYearFrom(['2025-12-01', '2026-01-02'])).toBe(2025);
  });
});
