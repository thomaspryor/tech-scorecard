import { describe, expect, it } from 'vitest';
import { ratingToBand, PERCENT_BAND_HALF_WIDTH } from '../scripts/lib/rating-band';

describe('ratingToBand', () => {
  it.each([
    ['10/10', 91, 100],
    ['9/10', 91, 100],
    ['4.5/5', 91, 100], // exactly 90% of scale is the top band
    ['8.9/10', 71, 90],
    ['4/5', 71, 90],
    ['3.5/5', 71, 90], // exactly 70%
    ['3/5', 51, 70],
    ['2.5/5', 51, 70], // exactly 50%
    ['2/5', 31, 50],
    ['1.5/5', 31, 50], // exactly 30%
    ['1/5', 0, 30],
    ['0/10', 0, 30],
  ])('%s -> %i-%i', (rating, floor, ceiling) => {
    expect(ratingToBand(rating)).toEqual({ floor, ceiling });
  });

  it('accepts the common ways outlets print a rating', () => {
    const top = { floor: 91, ceiling: 100 };
    expect(ratingToBand('9 out of 10')).toEqual(top);
    expect(ratingToBand('4.5 / 5')).toEqual(top);
    expect(ratingToBand('4.5/5 stars')).toEqual(top);
    expect(ratingToBand('5 stars')).toEqual(top);
    expect(ratingToBand('4 Stars')).toEqual({ floor: 71, ceiling: 90 });
    expect(ratingToBand('  8/10  ')).toEqual({ floor: 71, ceiling: 90 });
  });

  it('treats a printed percentage as a score with a narrow band', () => {
    expect(PERCENT_BAND_HALF_WIDTH).toBe(5);
    expect(ratingToBand('88%')).toEqual({ floor: 83, ceiling: 93 });
    expect(ratingToBand('87.6%')).toEqual({ floor: 83, ceiling: 93 });
    expect(ratingToBand('98%')).toEqual({ floor: 93, ceiling: 100 });
    expect(ratingToBand('2%')).toEqual({ floor: 0, ceiling: 7 });
  });

  it.each([null, undefined, '', 'A+', 'Editors Choice', '6/5', '6 stars', '4/0', '-1/5', '4.5'])('rejects %s', (rating) => {
    expect(ratingToBand(rating as string)).toBeNull();
  });
});
