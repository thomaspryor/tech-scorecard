import type { Category, Product } from './data-types';
import { getScoredProducts, type ScoredProduct } from './data';
import { CATEGORY_ORDER, CATEGORY_PLURAL, formatPrice } from './format';

/** A roundup needs this many scored products, or it is a thin page. */
export const MIN_PRODUCTS_FOR_ROUNDUP = 4;
/** A price page is skipped when it would list (nearly) the whole parent list, so the two pages would be near-duplicates. */
const MIN_LEFT_OUT = 2;
/** Within one list, the next price cap must add at least this many products over the previous page. */
const MIN_ADDED_PER_STEP = 3;
const OVERALL_CAPS = [200, 300, 500, 1000];
const CATEGORY_CAPS = [200, 300, 500, 800, 1000, 1500];

export interface Roundup {
  /** URL segment under /best/. */
  slug: string;
  kind: 'brand' | 'price';
  /** What the list is of, lower case after "Best": "Apple products", "tech under $500", "phones under $800". */
  subject: string;
  /** Set on price roundups limited to one category. */
  category?: Category;
  brand?: string;
  /** Launch-price ceiling in USD, exclusive. Set on price roundups. */
  cap?: number;
  /** Scored products, best first. */
  products: ScoredProduct[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Narrow "best of" pages built only from the data: one per brand with enough products, plus launch-price
 * ladders ("tech under $500", "phones under $800"). `products` must be sorted best first (getScoredProducts is).
 * Pure so tests can feed it small lists.
 */
export function buildRoundups(products: ScoredProduct[]): Roundup[] {
  const out: Roundup[] = [];
  const seenSets = new Set<string>();
  const slugs = new Set<string>();
  const add = (r: Roundup) => {
    const key = r.products
      .map((p) => p.id)
      .sort()
      .join('|');
    if (r.products.length < MIN_PRODUCTS_FOR_ROUNDUP || seenSets.has(key) || slugs.has(r.slug)) return false;
    seenSets.add(key);
    slugs.add(r.slug);
    out.push(r);
    return true;
  };
  const under = (list: ScoredProduct[], cap: number) =>
    list.filter((p) => p.launchPrice != null && p.launchPrice < cap);

  const brands = [...new Set(products.map((p) => p.brand))];
  for (const brand of brands) {
    add({
      slug: slugify(brand),
      kind: 'brand',
      subject: `${brand} products`,
      brand,
      products: products.filter((p) => p.brand === brand),
    });
  }

  let previous = 0;
  for (const cap of OVERALL_CAPS) {
    const list = under(products, cap);
    if (list.length > products.length - MIN_LEFT_OUT || list.length - previous < MIN_ADDED_PER_STEP) continue;
    if (add({ slug: `under-${cap}`, kind: 'price', subject: `tech under ${formatPrice(cap)}`, cap, products: list }))
      previous = list.length;
  }

  for (const category of CATEGORY_ORDER) {
    const inCategory = products.filter((p) => p.category === category);
    const plural = CATEGORY_PLURAL[category].toLowerCase();
    previous = 0;
    for (const cap of CATEGORY_CAPS) {
      const list = under(inCategory, cap);
      if (list.length > inCategory.length - MIN_LEFT_OUT || list.length - previous < MIN_ADDED_PER_STEP) continue;
      if (
        add({
          slug: `${plural}-under-${cap}`,
          kind: 'price',
          subject: `${plural} under ${formatPrice(cap)}`,
          category,
          cap,
          products: list,
        })
      )
        previous = list.length;
    }
  }
  return out;
}

let cache: Roundup[] | null = null;

export function getRoundups(): Roundup[] {
  return (cache ??= buildRoundups(getScoredProducts()));
}

export function getRoundup(slug: string): Roundup | undefined {
  return getRoundups().find((r) => r.slug === slug);
}

/** The roundups worth linking from a product page: its brand page, then the tightest price page it is on. */
export function roundupsFor(product: Pick<Product, 'brand' | 'category' | 'launchPrice'>): Roundup[] {
  const all = getRoundups();
  const brand = all.find((r) => r.kind === 'brand' && r.brand === product.brand);
  const price = all
    .filter(
      (r) =>
        r.kind === 'price' &&
        (r.category == null || r.category === product.category) &&
        product.launchPrice != null &&
        product.launchPrice < (r.cap ?? 0),
    )
    // Same-category pages first, then the lowest ceiling: "phones under $800" says more than "tech under $1,000".
    .sort((a, b) => Number(b.category != null) - Number(a.category != null) || (a.cap ?? 0) - (b.cap ?? 0))[0];
  return [brand, price].filter((r): r is Roundup => r != null);
}
