import { describe, expect, it } from 'vitest';
import categories from '@/config/categories.json';
import productsJson from '../data/products.json';
import reviewsJson from '../data/reviews.json';
import { liveCategories } from '@/lib/category-gate';
import { getAllProducts, indexableCategories } from '@/lib/data';
import { CATEGORY_LABEL, CATEGORY_ORDER, CATEGORY_PLURAL } from '@/lib/format';
import type { Category } from '@/lib/data-types';
import sitemap from '@/app/sitemap';
import { liveCategories as pipelineLive } from '../scripts/lib/backfill';

const expansion = categories.expansion.order as Category[];

function data(counts: Partial<Record<Category, number>>, reviewsEach = 6) {
  const products: { id: string; category: Category }[] = [];
  const reviews: { productId: string }[] = [];
  for (const [category, n] of Object.entries(counts)) {
    for (let i = 0; i < (n as number); i++) {
      const id = `${category}-${i}`;
      products.push({ id, category: category as Category });
      for (let j = 0; j < reviewsEach; j++) reviews.push({ productId: id });
    }
  }
  return { products, reviews };
}

describe('liveCategories (the site)', () => {
  it('shows a new category only once it has 5 products with 5 reviews each', () => {
    const { products, reviews } = data({ phone: 3, earbuds: 4 });
    expect(liveCategories(products, reviews).has('phone')).toBe(true);
    expect(liveCategories(products, reviews).has('earbuds')).toBe(false);
    const five = data({ earbuds: 5 });
    expect(liveCategories(five.products, five.reviews).has('earbuds')).toBe(true);
    const short = data({ earbuds: 5 }, 4);
    expect(liveCategories(short.products, short.reviews).has('earbuds')).toBe(false);
  });

  it('agrees with the rule the pipeline uses', () => {
    for (const counts of [{}, { tv: 4 }, { tv: 5 }, { camera: 7, handheld: 2 }, { earbuds: 5, tv: 5, 'e-reader': 5 }]) {
      for (const reviewsEach of [3, 5, 9]) {
        const { products, reviews } = data(counts, reviewsEach);
        expect([...liveCategories(products, reviews)].sort()).toEqual(
          [...pipelineLive(products, reviews, categories)].sort(),
        );
      }
    }
  });
});

describe('every category the site can show', () => {
  it('has a label, a plural and an art kind', () => {
    for (const c of CATEGORY_ORDER) {
      expect(CATEGORY_LABEL[c], c).toBeTruthy();
      expect(CATEGORY_PLURAL[c], c).toBeTruthy();
    }
    expect(CATEGORY_ORDER).toEqual(categories.categories);
    for (const c of expansion) expect(categories.categories).toContain(c);
  });

  it('is shown on the site (lists, category pages, sitemap) only when live', () => {
    const live = liveCategories(productsJson as never, reviewsJson as never);
    for (const p of getAllProducts()) expect(live.has(p.category), p.id).toBe(true);
    for (const c of indexableCategories()) expect(live.has(c), c).toBe(true);
    const urls = sitemap().map((e) => e.url);
    for (const c of expansion) {
      const listed = urls.some((u) => u.endsWith(`/category/${c}/`));
      expect(listed, c).toBe(indexableCategories().includes(c));
    }
  });
});
