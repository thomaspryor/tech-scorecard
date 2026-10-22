const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-21" -> "Oct 21, 2026" without timezone drift. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function formatMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function formatPrice(usd: number | null): string | null {
  return usd == null ? null : `$${usd.toLocaleString('en-US')}`;
}

import type { Category } from './data-types';

export const CATEGORY_LABEL: Record<Category, string> = {
  phone: 'Phone', foldable: 'Foldable', tablet: 'Tablet', laptop: 'Laptop',
  headphones: 'Headphones', watch: 'Watch', console: 'Console', wearable: 'Wearable',
};
export const CATEGORY_PLURAL: Record<Category, string> = {
  phone: 'Phones', foldable: 'Foldables', tablet: 'Tablets', laptop: 'Laptops',
  headphones: 'Headphones', watch: 'Watches', console: 'Consoles', wearable: 'Wearables',
};
/** Display order for filters. */
export const CATEGORY_ORDER: Category[] = ['phone', 'foldable', 'tablet', 'laptop', 'headphones', 'watch', 'console', 'wearable'];


/** Release-date line. Tense-neutral on purpose: the site is a static build. */
export function releaseLabel(iso: string): string {
  return `Release date ${formatDate(iso)}`;
}
