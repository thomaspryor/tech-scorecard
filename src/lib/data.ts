import productsJson from '../../data/products.json';
import reviewsJson from '../../data/reviews.json';
import outletsJson from '../../data/outlets.json';
import { computeProduct, type ComputedProduct } from './engine';
import type { Category, Outlet, Product, Review } from './data-types';
import { CATEGORY_ORDER } from './format';
import { MIN_PRODUCTS_FOR_CATEGORY_PAGE } from '@/config/seo';

// JSON imports type literal unions as string and tuples as arrays, so the data is cast to the
// hand-written types. That is safe because `npm run build` runs scripts/validate-data.js first
// (prebuild), which rejects any record that does not fit them.
const outlets: Record<string, Outlet> = Object.fromEntries((outletsJson as Outlet[]).map((o) => [o.id, o]));

let cache: ComputedProduct[] | null = null;

/** A product with enough reviews to have a score. */
export type ScoredProduct = ComputedProduct & { criticScore: number };

export function isScored(p: ComputedProduct): p is ScoredProduct {
  return p.criticScore != null;
}

export function getAllProducts(): ComputedProduct[] {
  if (!cache) {
    cache = (productsJson as unknown as Product[])
      .map((p) => computeProduct(p, reviewsJson as unknown as Review[], outlets))
      .sort((a, b) => (b.criticScore ?? -1) - (a.criticScore ?? -1));
  }
  return cache;
}

export function getProduct(slug: string): ComputedProduct | undefined {
  return getAllProducts().find((p) => p.slug === slug);
}

export function getTotals() {
  const products = getAllProducts();
  return {
    products: products.length,
    reviews: products.reduce((n, p) => n + p.reviewCount, 0),
    outlets: new Set(products.flatMap((p) => p.reviews.map((r) => r.outletId))).size,
  };
}

/** Products with a score, best first. */
export function getScoredProducts(): ScoredProduct[] {
  return getAllProducts().filter(isScored);
}

/** Categories whose page is indexed and linked: at least MIN_PRODUCTS_FOR_CATEGORY_PAGE scored products. One rule for sitemap, links and noindex. */
export function indexableCategories(): Category[] {
  const scored = getScoredProducts();
  return CATEGORY_ORDER.filter((c) => scored.filter((p) => p.category === c).length >= MIN_PRODUCTS_FOR_CATEGORY_PAGE);
}
