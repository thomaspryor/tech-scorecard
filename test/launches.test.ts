import { describe, expect, it } from 'vitest';
import { isRenamedDuplicate, knownProduct, sharedReviewUrls } from '../scripts/lib/launches';
import { thinProducts } from '../scripts/drop-thin-products';
import { unscored } from '../scripts/drop-unscored';
import { product, review } from './fixtures';

const onSite = [
  { id: 'galaxy-s26', slug: 'galaxy-s26', name: 'Galaxy S26', brand: 'Samsung' },
  { id: 'galaxy-s26-ultra', slug: 'galaxy-s26-ultra', name: 'Galaxy S26 Ultra', brand: 'Samsung' },
  { id: 'oneplus-15', slug: 'oneplus-15', name: 'OnePlus 15', brand: 'OnePlus' },
];
const candidate = (name: string, brand = 'Samsung') => ({
  name,
  brand,
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
});

describe('knownProduct', () => {
  it('matches the same product with the brand in front', () => {
    expect(knownProduct(candidate('Samsung Galaxy S26 Ultra'), onSite)?.id).toBe('galaxy-s26-ultra');
  });

  it('matches on punctuation and case differences', () => {
    expect(knownProduct(candidate('galaxy s26'), onSite)?.id).toBe('galaxy-s26');
  });

  it('keeps "plus" models apart from the base model', () => {
    expect(knownProduct(candidate('Galaxy S26+'), onSite)).toBeUndefined();
    expect(knownProduct(candidate('Samsung Galaxy S26 FE'), onSite)).toBeUndefined();
  });

  it('compares names without the brand only within the same brand', () => {
    expect(knownProduct(candidate('Acme 15', 'Acme'), [{ id: 'x', name: 'Other 15', brand: 'Other' }])).toBeUndefined();
    expect(knownProduct(candidate('OnePlus 15', 'OnePlus'), onSite)?.id).toBe('oneplus-15');
  });
});

describe('sharedReviewUrls', () => {
  it('counts URLs already on the site, ignoring www, query and trailing slash', () => {
    const reviews = [{ url: 'https://www.theverge.com/review/x' }, { url: 'https://wired.com/review/x/' }];
    expect(
      sharedReviewUrls(
        ['https://theverge.com/review/x/?utm=1', 'http://www.wired.com/review/x', 'https://cnet.com/x'],
        reviews,
      ),
    ).toBe(2);
  });
});

describe('isRenamedDuplicate', () => {
  it('needs at least half of the reviews, and at least 2, to be pages already on the site', () => {
    expect(isRenamedDuplicate(5, 9)).toBe(true);
    expect(isRenamedDuplicate(2, 3)).toBe(true);
    expect(isRenamedDuplicate(2, 9)).toBe(false); // a sibling reviewed in two combined articles
    expect(isRenamedDuplicate(1, 1)).toBe(false);
  });
});

describe('thinProducts', () => {
  it('lists only auto-added products under the minimum', () => {
    const products = [product(), product({ id: 'new', slug: 'new', autoAdded: '2026-10-26' })];
    const reviews = [review(), review({ productId: 'new' })];
    expect(thinProducts({ products, reviews, outlets: [] })).toEqual(['new']);
    expect(thinProducts({ products, reviews, outlets: [] }, 1)).toEqual([]);
  });
});

describe('unscored', () => {
  it('drops new reviews without two model scores and reports older ones', () => {
    const reviews = [
      review({ outletId: 'a', modelScores: { openai: 90, gemini: 91 } }),
      review({ outletId: 'b' }),
      review({ outletId: 'c' }),
    ];
    expect(unscored(reviews, new Set(['test-phone/b']))).toEqual({ drop: ['test-phone/b'], old: ['test-phone/c'] });
  });
});
