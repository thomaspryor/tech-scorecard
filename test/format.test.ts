import { describe, expect, it } from 'vitest';
import { CATEGORY_LABEL, CATEGORY_ORDER, CATEGORY_PLURAL, formatDate, formatMonth, formatPrice } from '@/lib/format';

describe('format', () => {
  it('formats ISO dates without timezone drift', () => {
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatDate('2026-12-31')).toBe('Dec 31, 2026');
    expect(formatMonth('2026-09-19')).toBe('Sep 2026');
  });

  it('formats prices in US dollars', () => {
    expect(formatPrice(1299)).toBe('$1,299');
    expect(formatPrice(null)).toBeNull();
  });

  // categories.json is plain JSON, so the compiler cannot check it against the Category type.
  it('has labels for every category in categories.json', () => {
    for (const c of CATEGORY_ORDER) {
      expect(CATEGORY_LABEL[c], c).toBeTruthy();
      expect(CATEGORY_PLURAL[c], c).toBeTruthy();
    }
  });
});
