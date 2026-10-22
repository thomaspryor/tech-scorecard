// Small builders for test data. Defaults form a valid record; tests override only what they check.
import type { Outlet, Product, Review } from '@/lib/data-types';
import categoriesJson from '@/config/categories.json';

export function outlet(over: Partial<Outlet> = {}): Outlet {
  return { id: 'the-verge', name: 'The Verge', tier: 1, domain: 'theverge.com', ...over };
}

export function product(over: Partial<Product> = {}): Product {
  return {
    id: 'test-phone',
    slug: 'test-phone',
    name: 'Test Phone',
    brand: 'Acme',
    category: 'phone',
    releaseDate: '2026-09-19',
    launchPrice: 999,
    officialUrl: null,
    criticsTake: 'Critics liked it.',
    loved: ['Battery'],
    gripes: ['Price'],
    specs: [{ label: 'Display', value: '6.3 in' }],
    art: { kind: 'phone', body: '#111111', accent: '#222222', backdrop: ['#333333', '#444444'] },
    ...over,
  };
}

export function review(over: Partial<Review> = {}): Review {
  return {
    productId: 'test-phone',
    outletId: 'the-verge',
    critic: 'A Critic',
    url: 'https://www.theverge.com/review/test-phone',
    date: '2026-09-20',
    rating: '9/10',
    score: 93,
    scoreSource: 'rating',
    excerpt: 'The best phone of the year.',
    ...over,
  };
}

export { categoriesJson as categories };

/** A minimal data set that passes validation. */
export function validData() {
  return {
    products: [product()],
    outlets: [outlet(), outlet({ id: 'cnet', name: 'CNET', domain: 'cnet.com' })],
    reviews: [review(), review({ outletId: 'cnet', url: 'https://www.cnet.com/reviews/test-phone/', rating: null, scoreSource: 'text', score: 80 })],
  };
}
