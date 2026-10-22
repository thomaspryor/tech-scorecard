import type { Category } from './data-types';
import categories from '@/config/categories.json';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-21" -> "Oct 21, 2026". Parsed by hand so the build machine's timezone cannot shift the day. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "2026-10-21" -> "Oct 2026". */
export function formatMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function formatPrice(usd: number | null): string | null {
  return usd == null ? null : `$${usd.toLocaleString('en-US')}`;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  phone: 'Phone', foldable: 'Foldable', tablet: 'Tablet', laptop: 'Laptop',
  headphones: 'Headphones', watch: 'Watch', console: 'Console', wearable: 'Wearable',
};
export const CATEGORY_PLURAL: Record<Category, string> = {
  phone: 'Phones', foldable: 'Foldables', tablet: 'Tablets', laptop: 'Laptops',
  headphones: 'Headphones', watch: 'Watches', console: 'Consoles', wearable: 'Wearables',
};
/** Display order for filters; the same list validate-data.js checks against. */
export const CATEGORY_ORDER = categories.categories as Category[];

export function isCategory(s: string): s is Category {
  return (CATEGORY_ORDER as string[]).includes(s);
}

/** Release-date line. Tense-neutral on purpose: the site is a static build. */
export function releaseLabel(iso: string): string {
  return `Release date ${formatDate(iso)}`;
}
