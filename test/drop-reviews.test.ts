import { describe, expect, it } from 'vitest';
import { dropReviews } from '../scripts/drop-reviews';
import { review } from './fixtures';

describe('dropReviews', () => {
  const a = review({ productId: 'p1', outletId: 'the-verge' });
  const b = review({ productId: 'p1', outletId: 'cnet' });
  const c = review({ productId: 'p2', outletId: 'the-verge' });

  it('removes exactly the productId/outletId pairs given, in order', () => {
    expect(dropReviews([a, b, c], ['p1/the-verge'])).toEqual([b, c]);
    expect(dropReviews([a, b, c], ['p1/cnet', 'p2/the-verge'])).toEqual([a]);
  });

  it('ignores ids that match nothing', () => {
    expect(dropReviews([a, b], ['p9/x', 'p1'])).toEqual([a, b]);
  });
});
