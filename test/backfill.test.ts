import { describe, expect, it } from 'vitest';
import {
  FULL_AT,
  MAX_ATTEMPTS,
  MAX_CHECKED,
  MAX_PER_RUN,
  PAUSE_AFTER_MISSES,
  THIN_BELOW,
  addDays,
  backfillStatus,
  candidatePrompt,
  initialState,
  keepRejected,
  liveCategories,
  monthsBefore,
  noteCategory,
  pickCategory,
  rejectKey,
  rejectedIds,
  usableCandidates,
} from '../scripts/lib/backfill';
import categories from '@/config/categories.json';
import type { Category } from '@/lib/data-types';

const today = '2026-11-10';
const config = categories;
const established = categories.categories.filter((c) => !categories.expansion.order.includes(c));

type P = { id: string; category: Category; backfilled?: string };
type R = { productId: string };

/** n products in a category, each with `reviews` reviews. */
function fill(category: Category, n: number, reviewCount = 8) {
  const products: P[] = [];
  const reviews: R[] = [];
  for (let i = 0; i < n; i++) {
    const id = `${category}-${i}`;
    products.push({ id, category });
    for (let j = 0; j < reviewCount; j++) reviews.push({ productId: id });
  }
  return { products, reviews };
}

/** A site where every established category has `n` products and the given categories have their own counts. */
function site(n: number, over: Partial<Record<Category, number>> = {}, reviewCount = 8) {
  const counts: Record<string, number> = {};
  for (const c of established) counts[c] = n;
  Object.assign(counts, over);
  const parts = Object.entries(counts).map(([c, k]) => fill(c as Category, k, reviewCount));
  return { products: parts.flatMap((x) => x.products), reviews: parts.flatMap((x) => x.reviews) };
}

const pick = (s: ReturnType<typeof site>, extra = {}) =>
  pickCategory({ ...s, config, state: initialState(today), today, ...extra });

describe('caps', () => {
  it('adds at most 3 products and examines at most 6 candidates a run', () => {
    expect(MAX_PER_RUN).toBe(3);
    expect(MAX_ATTEMPTS).toBeLessThanOrEqual(6);
    expect(MAX_CHECKED).toBeLessThanOrEqual(12);
    expect(THIN_BELOW).toBe(12);
    expect(FULL_AT).toBe(15);
  });
});

describe('liveCategories', () => {
  it('keeps the original categories live and holds back a new one until 5 products have 5 reviews each', () => {
    expect(liveCategories(site(10).products, site(10).reviews, config).has('earbuds')).toBe(false);
    for (const c of established) expect(liveCategories([], [], config).has(c)).toBe(true);
    const four = site(10, { earbuds: 4 });
    expect(liveCategories(four.products, four.reviews, config).has('earbuds')).toBe(false);
    const five = site(10, { earbuds: 5 });
    expect(liveCategories(five.products, five.reviews, config).has('earbuds')).toBe(true);
  });

  it('counts only products with at least 5 reviews', () => {
    const thin = site(10, { earbuds: 5 }, 4);
    expect(liveCategories(thin.products, thin.reviews, config).has('earbuds')).toBe(false);
    const s = site(10, { earbuds: 5 });
    // Drop one review from one earbuds product: it falls to 4 reviews and the category goes dark again.
    const i = s.reviews.findIndex((r) => r.productId === 'earbuds-0');
    s.reviews.splice(i, 1);
    s.reviews.splice(i, 1);
    s.reviews.splice(i, 1);
    s.reviews.splice(i, 1);
    expect(liveCategories(s.products, s.reviews, config).has('earbuds')).toBe(false);
  });
});

describe('pickCategory', () => {
  it('fills tablet first, then console, then other thin categories fewest first', () => {
    expect(pick(site(10, { tablet: 5, console: 6, foldable: 9, wearable: 11 }))?.category).toBe('tablet');
    expect(pick(site(10, { tablet: 12, console: 6, foldable: 9, wearable: 11 }))?.category).toBe('console');
    expect(pick(site(10, { tablet: 12, console: 12, foldable: 9, wearable: 11 }))?.category).toBe('foldable');
    expect(pick(site(12, { wearable: 11, foldable: 9 }))).toEqual({ category: 'foldable', why: 'thin' });
  });

  it('moves on to the new categories, one at a time and in order, once nothing is thin', () => {
    expect(pick(site(12))).toEqual({ category: 'earbuds', why: 'new' });
    // Earbuds has 3 products but is not live yet: still the one being opened.
    expect(pick(site(12, { earbuds: 3 }))).toEqual({ category: 'earbuds', why: 'new' });
    // Earbuds live with 5 is thin (under 12), so it fills before TV starts.
    expect(pick(site(12, { earbuds: 5 }))).toEqual({ category: 'earbuds', why: 'thin' });
    expect(pick(site(12, { earbuds: 12 }))).toEqual({ category: 'tv', why: 'new' });
    expect(pick(site(12, { earbuds: 12, tv: 12 }))).toEqual({ category: 'camera', why: 'new' });
    expect(pick(site(12, { earbuds: 12, tv: 12, camera: 12 }))).toEqual({ category: 'e-reader', why: 'new' });
    expect(pick(site(12, { earbuds: 12, tv: 12, camera: 12, 'e-reader': 12 }))).toEqual({
      category: 'handheld',
      why: 'new',
    });
  });

  it('tops categories up to 15 after every category is live, then stops', () => {
    const all = { earbuds: 12, tv: 12, camera: 12, 'e-reader': 12, handheld: 12 };
    expect(pick(site(12, all))).toEqual({ category: 'phone', why: 'top-up' });
    const nearly = site(15, { ...all, earbuds: 15, tv: 15, camera: 15, 'e-reader': 15, handheld: 14 });
    expect(pick(nearly)).toEqual({ category: 'handheld', why: 'top-up' });
    expect(pick(site(15, { earbuds: 15, tv: 15, camera: 15, 'e-reader': 15, handheld: 15 }))).toBeNull();
  });

  it('skips categories worked on already this run', () => {
    const s = site(10, { tablet: 5, console: 6 });
    expect(pick(s, { skip: new Set(['tablet']) })?.category).toBe('console');
  });

  it('leaves a resting category out, but a paused one is still work for the status report', () => {
    const s = site(12, { tablet: 5 });
    const state = { ...initialState(today), categories: { tablet: { misses: 0, pausedUntil: addDays(today, 3) } } };
    expect(pick(s, { state })?.category).toBe('earbuds');
    expect(pick(s, { state, ignorePauses: true })?.category).toBe('tablet');
    const over = { ...initialState(today), categories: { tablet: { misses: 0, pausedUntil: addDays(today, -1) } } };
    expect(pick(s, { state: over })?.category).toBe('tablet');
  });
});

describe('noteCategory', () => {
  it('rests a category after three empty runs in a row, and a product resets the count', () => {
    let state = initialState(today);
    for (let i = 1; i < PAUSE_AFTER_MISSES; i++) {
      state = noteCategory(state, 'tablet', 0, today);
      expect(state.categories.tablet.pausedUntil).toBeNull();
    }
    expect(noteCategory(state, 'tablet', 1, today).categories.tablet.misses).toBe(0);
    state = noteCategory(state, 'tablet', 0, today);
    expect(state.categories.tablet.pausedUntil).toBe(addDays(today, 14));
    expect(state.lastRun).toBe(today);
  });
});

describe('candidates', () => {
  it('asks about the category, the 18 month window, and names what to leave out', () => {
    const prompt = candidatePrompt({
      today,
      category: 'e-reader',
      known: ['Kindle Colorsoft'],
      rejected: ['kobo-x'],
    });
    expect(prompt).toContain('e-readers');
    expect(prompt).toContain('between 2025-05-10 and 2026-11-10');
    expect(prompt).toContain('Kindle Colorsoft');
    expect(prompt).toContain('kobo-x');
    expect(monthsBefore('2026-11-10', 18)).toBe('2025-05-10');
  });

  it('keeps only launches inside the window with a brand page and forces the requested category', () => {
    const good = {
      name: 'Pad',
      brand: 'Acme',
      releaseDate: '2026-03-01',
      launchPrice: 499,
      officialUrl: 'https://acme.com/pad',
    };
    const raw = [
      { ...good, category: 'phone' },
      { ...good, name: 'Old', releaseDate: '2025-01-01' },
      { ...good, name: 'Future', releaseDate: '2026-12-01' },
      { ...good, name: 'NoPrice', launchPrice: 'free' },
      { ...good, name: 'NoPage', officialUrl: 'http://acme.com' },
      { ...good, name: '' },
      null,
    ];
    const found = usableCandidates(raw, 'tablet', today);
    expect(found.map((c) => c.name)).toEqual(['Pad']);
    expect(found[0].category).toBe('tablet');
    expect(usableCandidates('nope', 'tablet', today)).toEqual([]);
  });
});

describe('rejected candidates', () => {
  it('forgets pages after 30 days and backfill candidates after 90', () => {
    const rejected = {
      'verge.com/a': addDays(today, -31),
      'verge.com/b': addDays(today, -29),
      [rejectKey('old')]: addDays(today, -91),
      [rejectKey('recent')]: addDays(today, -60),
    };
    const kept = keepRejected(rejected, today, 30);
    expect(Object.keys(kept)).toEqual(['backfill:recent', 'verge.com/b']);
    expect(rejectedIds(kept)).toEqual(['recent']);
  });
});

describe('backfillStatus', () => {
  const state = { ...initialState('2026-11-01'), lastRun: '2026-11-09' };
  const base = site(10, { tablet: 5 });
  const status = (over: object = {}, products: P[] = base.products, now = today) =>
    backfillStatus({ products, reviews: base.reviews, config, state, today: now, ...over });

  it('is stalled when work remains and nothing was added for 7 days (counted from the start when never)', () => {
    expect(status().verdict).toBe('stalled'); // 9 days since 2026-11-01
    expect(status({}, base.products, '2026-11-07').verdict).toBe('ok'); // 6 days
    expect(status({}, base.products, '2026-11-08').verdict).toBe('stalled'); // 7 days
  });

  it('counts from the newest backfilled product still on the site', () => {
    const products = base.products.map((p, i) => (i === 0 ? { ...p, backfilled: '2026-11-08' } : p));
    const s = status({}, products);
    expect(s.lastAdded).toBe('2026-11-08');
    expect(s.verdict).toBe('ok');
  });

  it('is complete, never stalled, when every category is full', () => {
    const full = site(15, { earbuds: 15, tv: 15, camera: 15, 'e-reader': 15, handheld: 15 });
    expect(status({ ...full }, full.products).verdict).toBe('complete');
  });

  it('keeps a resting category in the picture', () => {
    const resting = { ...state, categories: { tablet: { misses: 0, pausedUntil: addDays(today, 5) } } };
    const s = status({ state: resting });
    expect(s.next?.category).toBe('tablet');
    expect(s.rows.find((r) => r.category === 'tablet')?.pausedUntil).toBe(addDays(today, 5));
  });
});
