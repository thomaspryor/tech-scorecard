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

/** Newest review date (YYYY-MM-DD) across `products`. */
export function latestReviewDate(products: ComputedProduct[] = getAllProducts()): string | undefined {
  return products.reduce<string | undefined>(
    (max, p) => (p.latestReviewDate && (!max || p.latestReviewDate > max) ? p.latestReviewDate : max),
    undefined,
  );
}

/** A new year needs this many reviews before "best to buy in" titles move to it, so one early review cannot flip them. */
export const BEST_YEAR_MIN_REVIEWS = 10;

/** The year in "Best ... to buy in YEAR": the year of the BEST_YEAR_MIN_REVIEWS-th newest review date. */
export function bestYearFrom(dates: string[]): number {
  const newest = [...dates].sort().reverse();
  const pick = newest[BEST_YEAR_MIN_REVIEWS - 1] ?? newest[newest.length - 1];
  return pick ? Number(pick.slice(0, 4)) : new Date().getUTCFullYear();
}

export function bestYear(): number {
  return bestYearFrom(getAllProducts().flatMap((p) => p.reviews.map((r) => r.date)));
}

/** Categories whose page is indexed and linked: at least MIN_PRODUCTS_FOR_CATEGORY_PAGE scored products. One rule for sitemap, links and noindex. */
export function indexableCategories(): Category[] {
  const scored = getScoredProducts();
  return CATEGORY_ORDER.filter((c) => scored.filter((p) => p.category === c).length >= MIN_PRODUCTS_FOR_CATEGORY_PAGE);
}

export interface LatestReview {
  product: ComputedProduct;
  review: ComputedProduct['reviews'][number];
}

/** The newest review of each product, newest first (ties: bigger outlet, then higher score). One per product keeps the list varied. */
export function getLatestReviews(limit: number): LatestReview[] {
  return getAllProducts()
    .flatMap((product) => {
      const review = [...product.reviews].sort(
        (a, b) => b.date.localeCompare(a.date) || a.outlet.tier - b.outlet.tier || b.score - a.score,
      )[0];
      return review ? [{ product, review }] : [];
    })
    .sort(
      (a, b) =>
        b.review.date.localeCompare(a.review.date) ||
        a.review.outlet.tier - b.review.outlet.tier ||
        b.review.score - a.review.score,
    )
    .slice(0, limit);
}
