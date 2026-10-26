'use client';

import { useEffect } from 'react';

/** Rank attribute each sort reads, e.g. data-o-date="3". */
export const SORT_KEYS = { score: 'oScore', date: 'oDate' } as const;
export type SortKey = keyof typeof SORT_KEYS;

/** Elements ordered by their data-o-<key> rank. Pure, so it can be tested without a DOM. */
export function sortByRank<T extends { dataset: DOMStringMap }>(items: T[], key: SortKey): T[] {
  const attr = SORT_KEYS[key];
  return [...items].sort((a, b) => Number(a.dataset[attr]) - Number(b.dataset[attr]));
}

/**
 * Keeps a list's DOM order in step with the chosen sort. CSS `order` alone re-sorts items
 * visually, but keyboard and screen-reader order would not follow (WCAG 2.4.3).
 * Items are moved, not re-rendered, so the HTML still ships one copy of each.
 * With `restId`, the first `visible` items stay in the list and the others move to the rest
 * container (the product page's "Show more reviews" fold), so the fold always holds the tail
 * of the chosen order. The home list also has a CSS `order` fallback for visitors without JavaScript.
 */
export function ListSort({
  listId,
  dateRadioId,
  restId,
  visible = Infinity,
}: {
  listId: string;
  dateRadioId: string;
  restId?: string;
  visible?: number;
}) {
  useEffect(() => {
    const list = document.getElementById(listId);
    const rest = restId ? document.getElementById(restId) : null;
    const dateRadio = document.getElementById(dateRadioId) as HTMLInputElement | null;
    if (!list || !dateRadio) return;
    const radios = [...document.querySelectorAll<HTMLInputElement>(`input[name="${dateRadio.name}"]`)];
    const apply = () => {
      const items = [...list.children, ...(rest?.children ?? [])] as HTMLElement[];
      const sorted = sortByRank(items, dateRadio.checked ? 'date' : 'score');
      list.append(...(rest ? sorted.slice(0, visible) : sorted));
      rest?.append(...sorted.slice(visible));
    };
    radios.forEach((r) => r.addEventListener('change', apply));
    apply(); // the browser may restore the other sort on back/forward navigation
    return () => radios.forEach((r) => r.removeEventListener('change', apply));
  }, [listId, dateRadioId, restId, visible]);
  return null;
}
