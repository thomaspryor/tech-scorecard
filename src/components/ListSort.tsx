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
 * Keeps the home list's DOM order in step with the chosen sort. CSS `order` alone re-sorts
 * the cards visually, but keyboard and screen-reader order would stay by score (WCAG 2.4.3).
 * The cards are moved, not re-rendered, so the HTML still ships one copy of each. Without
 * JavaScript the CSS `order` fallback still sorts visually.
 */
export function ListSort({ listId, dateRadioId }: { listId: string; dateRadioId: string }) {
  useEffect(() => {
    const list = document.getElementById(listId);
    const dateRadio = document.getElementById(dateRadioId) as HTMLInputElement | null;
    if (!list || !dateRadio) return;
    const radios = [...document.querySelectorAll<HTMLInputElement>(`input[name="${dateRadio.name}"]`)];
    const apply = () => {
      const items = [...list.children] as HTMLElement[];
      list.append(...sortByRank(items, dateRadio.checked ? 'date' : 'score'));
    };
    radios.forEach((r) => r.addEventListener('change', apply));
    apply(); // the browser may restore "Newest" on back/forward navigation
    return () => radios.forEach((r) => r.removeEventListener('change', apply));
  }, [listId, dateRadioId]);
  return null;
}
