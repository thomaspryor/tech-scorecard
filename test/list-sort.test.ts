import { describe, expect, it } from 'vitest';
import { sortByRank } from '@/components/ListSort';

const el = (id: string, oScore: number, oDate: number) => ({
  id,
  dataset: { oScore: String(oScore), oDate: String(oDate) },
});

describe('sortByRank', () => {
  const items = [el('a', 0, 2), el('b', 1, 0), el('c', 2, 1)];

  it('orders by the chosen rank without mutating the input', () => {
    expect(sortByRank(items, 'date').map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(sortByRank(items, 'score').map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(items.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('compares ranks as numbers, not strings', () => {
    const many = [el('ten', 10, 0), el('two', 2, 1)];
    expect(sortByRank(many, 'score').map((x) => x.id)).toEqual(['two', 'ten']);
  });
});
