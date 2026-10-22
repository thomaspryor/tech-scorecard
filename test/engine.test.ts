import { describe, expect, it } from 'vitest';
import { computeCriticScore, computeProduct, type ScoredReview } from '@/lib/engine';
import { GOLD_MIN, MIXED_MIN, RECOMMENDED_MIN, WORTH_IT_MIN, getTierKey } from '@/config/score-buckets';
import { MIN_REVIEWS_FOR_SCORE, TIER_WEIGHTS } from '@/config/scoring';
import type { Outlet, Product, Review } from '@/lib/data-types';
import { outlet, product, review } from './fixtures';

const scored = (score: number, tier: Outlet['tier']): ScoredReview => ({
  ...review({ score }),
  outlet: outlet({ tier }),
  weight: TIER_WEIGHTS[tier],
});

describe('tier weights', () => {
  it('match the published method', () => {
    expect(TIER_WEIGHTS).toEqual({ 1: 1.0, 2: 0.75, 3: 0.4, 4: 0.2 });
  });
});

describe('computeCriticScore', () => {
  it(`is null below ${MIN_REVIEWS_FOR_SCORE} reviews`, () => {
    const four = Array.from({ length: MIN_REVIEWS_FOR_SCORE - 1 }, () => scored(90, 1));
    expect(computeCriticScore(four)).toBeNull();
    expect(computeCriticScore([])).toBeNull();
  });

  it('is the plain mean when every outlet has the same tier', () => {
    expect(computeCriticScore([80, 85, 90, 95, 100].map((s) => scored(s, 2)))).toBe(90);
  });

  it('weights each review by its outlet tier', () => {
    const reviews = [scored(100, 1), scored(100, 1), scored(60, 4), scored(60, 4), scored(60, 3)];
    // (100*1 + 100*1 + 60*0.2 + 60*0.2 + 60*0.4) / (1 + 1 + 0.2 + 0.2 + 0.4)
    const expected = (200 + 12 + 12 + 24) / 2.8;
    expect(computeCriticScore(reviews)).toBeCloseTo(expected, 10);
    expect(computeCriticScore(reviews)!).toBeGreaterThan(80); // the plain mean would be 76
  });

  it('returns the unrounded value (rounding happens once, for display)', () => {
    const s = computeCriticScore([90, 90, 90, 91, 91].map((x) => scored(x, 1)));
    expect(s).toBeCloseTo(90.4, 10);
  });
});

describe('getTierKey boundaries', () => {
  it.each([
    [100, 'gold'],
    [GOLD_MIN, 'gold'],
    [GOLD_MIN - 0.5, 'gold'], // rounds up to 85: the badge shows 85, so the label must agree
    [GOLD_MIN - 0.51, 'recommended'],
    [GOLD_MIN - 1, 'recommended'],
    [RECOMMENDED_MIN, 'recommended'],
    [RECOMMENDED_MIN - 1, 'worthIt'],
    [WORTH_IT_MIN, 'worthIt'],
    [WORTH_IT_MIN - 1, 'mixed'],
    [MIXED_MIN, 'mixed'],
    [MIXED_MIN - 1, 'miss'],
    [0, 'miss'],
  ])('%d -> %s', (score, key) => {
    expect(getTierKey(score)).toBe(key);
  });

  it('uses the thresholds documented on the methodology page', () => {
    expect([GOLD_MIN, RECOMMENDED_MIN, WORTH_IT_MIN, MIXED_MIN]).toEqual([85, 75, 65, 55]);
  });
});

describe('computeProduct', () => {
  const outlets: Record<string, Outlet> = {
    a: outlet({ id: 'a', tier: 1 }),
    b: outlet({ id: 'b', tier: 2 }),
    c: outlet({ id: 'c', tier: 3 }),
    d: outlet({ id: 'd', tier: 4 }),
    e: outlet({ id: 'e', tier: 1 }),
  };
  const p: Product = product({ id: 'p1' });
  const reviews: Review[] = [
    review({ productId: 'p1', outletId: 'a', score: 88, date: '2026-09-01' }),
    review({ productId: 'p1', outletId: 'b', score: 92, date: '2026-09-20', rating: null, scoreSource: 'text' }),
    review({ productId: 'p1', outletId: 'c', score: 70, date: '2026-09-03' }),
    review({ productId: 'p1', outletId: 'd', score: 50, date: '2026-08-30', rating: null, scoreSource: 'text' }),
    review({ productId: 'p1', outletId: 'e', score: 88, date: '2026-09-02' }),
    review({ productId: 'other', outletId: 'a', score: 10, date: '2026-10-01' }),
  ];

  it('only uses the product\'s own reviews and attaches outlet and weight', () => {
    const cp = computeProduct(p, reviews, outlets);
    expect(cp.reviewCount).toBe(5);
    expect(cp.reviews.every((r) => r.productId === 'p1')).toBe(true);
    expect(cp.reviews.find((r) => r.outletId === 'b')?.weight).toBe(0.75);
  });

  it('sorts by score, then by outlet tier', () => {
    const cp = computeProduct(p, reviews, outlets);
    expect(cp.reviews.map((r) => r.outletId)).toEqual(['b', 'a', 'e', 'c', 'd']);
  });

  it('counts the breakdown, rated reviews and the latest date', () => {
    const cp = computeProduct(p, reviews, outlets);
    expect(cp.breakdown).toEqual({ gold: 3, recommended: 0, worthIt: 1, mixed: 0, miss: 1 });
    expect(cp.ratedCount).toBe(3);
    expect(cp.latestReviewDate).toBe('2026-09-20');
    expect(cp.criticScore).toBeCloseTo((88 + 92 * 0.75 + 70 * 0.4 + 50 * 0.2 + 88) / (1 + 0.75 + 0.4 + 0.2 + 1), 10);
  });

  it('has no score and no latest date without reviews', () => {
    const cp = computeProduct(product({ id: 'empty' }), reviews, outlets);
    expect(cp.criticScore).toBeNull();
    expect(cp.latestReviewDate).toBeNull();
  });

  it('fails loudly on a review from an unknown outlet', () => {
    expect(() => computeProduct(p, [review({ productId: 'p1', outletId: 'nope' })], outlets)).toThrow(/Unknown outlet "nope"/);
  });
});
