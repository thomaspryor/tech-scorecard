import { describe, expect, it } from 'vitest';
import { checkPageSizes, PAGE_FAIL_BYTES, PAGE_WARN_BYTES } from '../scripts/lib/page-size';

describe('checkPageSizes', () => {
  it('stays under the 2MB Googlebot fetch limit', () => {
    expect(PAGE_FAIL_BYTES).toBeLessThan(2_000_000);
    expect(PAGE_WARN_BYTES).toBeLessThan(PAGE_FAIL_BYTES);
  });

  it('splits pages into over the limit and near it, largest first', () => {
    const { over, near } = checkPageSizes(
      [
        { file: 'a.html', bytes: 1_200 },
        { file: 'b.html', bytes: 1_900 },
        { file: 'c.html', bytes: 2_500 },
        { file: 'd.html', bytes: 1_000 },
      ],
      2_000,
      1_000,
    );
    expect(over.map((p) => p.file)).toEqual(['c.html']);
    expect(near.map((p) => p.file)).toEqual(['b.html', 'a.html']);
  });

  it('counts a page exactly at a threshold as under it', () => {
    const { over, near } = checkPageSizes([{ file: 'x.html', bytes: 2_000 }], 2_000, 2_000);
    expect(over).toEqual([]);
    expect(near).toEqual([]);
  });
});
