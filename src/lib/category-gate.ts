import categories from '@/config/categories.json';
import type { Category, Product, Review } from './data-types';

/**
 * The categories the site shows. The original categories are always live. A category the daily backfill is
 * opening (categories.json "expansion") goes live only once `minProducts` of its products each have at least
 * `minReviews` reviews; until then its products sit in data/ and appear nowhere (no list, page or sitemap entry).
 * scripts/lib/backfill.js has the same rule for the pipeline; test/category-gate.test.ts keeps the two equal.
 */
export function liveCategories(
  products: Pick<Product, 'id' | 'category'>[],
  reviews: Pick<Review, 'productId'>[],
): Set<Category> {
  const { order, minProducts, minReviews } = categories.expansion;
  const reviewCount = new Map<string, number>();
  for (const r of reviews) reviewCount.set(r.productId, (reviewCount.get(r.productId) ?? 0) + 1);
  const live = new Set(categories.categories as Category[]);
  for (const c of order) {
    const ready = products.filter((p) => p.category === c && (reviewCount.get(p.id) ?? 0) >= minReviews).length;
    if (ready < minProducts) live.delete(c as Category);
  }
  return live;
}
