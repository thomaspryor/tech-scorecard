import productsJson from '../../data/products.json';
import reviewsJson from '../../data/reviews.json';
import outletsJson from '../../data/outlets.json';
import { computeProduct, type ComputedProduct } from './engine';
import type { Category, Outlet, Product, Review } from './data-types';
import categoriesJson from '@/config/categories.json';
import { MIN_PRODUCTS_FOR_CATEGORY_PAGE } from '@/config/seo';

const outlets: Record<string, Outlet> = Object.fromEntries((outletsJson as Outlet[]).map((o) => [o.id, o]));

let cache: ComputedProduct[] | null = null;

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

/** Categories whose page is indexed and linked: at least MIN_PRODUCTS_FOR_CATEGORY_PAGE scored products. One rule for sitemap, links and noindex. */
export function indexableCategories(): Category[] {
  const products = getAllProducts();
  return (categoriesJson.categories as Category[]).filter(
    (c) => products.filter((p) => p.category === c && p.criticScore != null).length >= MIN_PRODUCTS_FOR_CATEGORY_PAGE,
  );
}
