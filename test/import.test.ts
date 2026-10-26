import { describe, expect, it } from 'vitest';
import { applyImport, importAll, importEach, provisionalScore } from '../scripts/lib/import';
import { categories, outlet, product, review, validData } from './fixtures';

describe('provisionalScore', () => {
  it('clamps a rated review into its band', () => {
    expect(provisionalScore(review({ rating: '9/10', score: 70 }))).toBe(91);
    expect(provisionalScore(review({ rating: '4/5', score: 99 }))).toBe(90);
    expect(provisionalScore(review({ rating: '4/5', score: 80 }))).toBe(80);
  });

  it('uses the band midpoint when there is no score yet', () => {
    expect(provisionalScore({ ...review({ rating: '4/5' }), score: undefined as unknown as number })).toBe(81);
  });

  it('leaves unrated reviews alone', () => {
    expect(provisionalScore(review({ rating: null, scoreSource: 'text', score: 64 }))).toBe(64);
  });
});

describe('applyImport: replace mode', () => {
  it('replaces the product and all of its reviews', () => {
    const data = validData();
    const file = {
      product: product({ name: 'Test Phone (renamed)' }),
      reviews: [review({ productId: undefined as unknown as string, score: 95 })],
    };
    const { data: next, message } = applyImport(data, file, 'f.json');
    expect(next.products).toHaveLength(1);
    expect(next.products[0].name).toBe('Test Phone (renamed)');
    expect(next.reviews).toHaveLength(1); // the old CNET review is gone
    expect(next.reviews[0]).toMatchObject({ productId: 'test-phone', score: 95 });
    expect(message).toMatch(/test-phone: 1 reviews; REMOVED 1 existing reviews not in the file: cnet/);
  });

  it('does not mutate its input', () => {
    const data = validData();
    const before = JSON.stringify(data);
    const file = {
      product: product(),
      reviews: [review({ score: 10 })],
      newOutlets: [outlet({ id: 'wired', name: 'Wired', domain: 'wired.com' })],
    };
    const fileBefore = JSON.stringify(file);
    applyImport(data, file);
    expect(JSON.stringify(data)).toBe(before);
    expect(JSON.stringify(file)).toBe(fileBefore);
  });

  it('rejects a file with neither a product nor a known productId', () => {
    expect(() => applyImport(validData(), { productId: 'ghost', reviews: [] }, 'f.json')).toThrow(
      /f.json: needs product.id/,
    );
    expect(() => applyImport(validData(), { product: product() } as never, 'f.json')).toThrow(/reviews\[\]/);
  });
});

describe('applyImport: append mode', () => {
  it('adds reviews from new outlets and skips outlets that already reviewed the product', () => {
    const file = {
      productId: 'test-phone',
      newOutlets: [outlet({ id: 'wired', name: 'Wired', domain: 'wired.com' })],
      reviews: [
        review({ outletId: 'wired', url: 'https://www.wired.com/review/x', rating: '8/10', score: 85 }),
        review({ outletId: 'cnet', url: 'https://www.cnet.com/again', rating: null, scoreSource: 'text', score: 50 }),
      ],
    };
    const { data: next, message } = applyImport(validData(), file);
    expect(next.reviews).toHaveLength(3);
    expect(next.reviews.find((r) => r.outletId === 'cnet')?.score).toBe(80); // existing review kept
    expect(next.outlets.map((o) => o.id)).toContain('wired');
    expect(message).toBe('test-phone: +1 reviews (1 already present)');
  });
});

describe('applyImport: outlets', () => {
  const base = () => ({ productId: 'test-phone', reviews: [] as ReturnType<typeof review>[] });

  it('reuses an existing outlet that arrives under another id (same name and site)', () => {
    const file = {
      ...base(),
      newOutlets: [outlet({ id: 'verge', name: 'the verge', domain: 'www.theverge.com' })],
      reviews: [review({ outletId: 'verge', productId: 'test-phone' })],
    };
    const { data: next } = applyImport({ ...validData(), reviews: [] }, file);
    expect(next.outlets.map((o) => o.id)).not.toContain('verge');
    expect(next.reviews[0].outletId).toBe('the-verge');
  });

  it('keeps two outlets that share a site but have different names', () => {
    const file = {
      ...base(),
      newOutlets: [outlet({ id: 'verge-deals', name: 'Verge Deals', domain: 'theverge.com' })],
    };
    const { data: next } = applyImport(validData(), file);
    expect(next.outlets.map((o) => o.id)).toContain('verge-deals');
  });

  it('records a second site for the same outlet as an alternate domain', () => {
    const file = { ...base(), newOutlets: [outlet({ domain: 'www.vox.com' })] };
    const { data: next } = applyImport(validData(), file);
    expect(next.outlets.find((o) => o.id === 'the-verge')).toMatchObject({
      domain: 'theverge.com',
      altDomains: ['vox.com'],
    });
  });

  it('refuses an existing id reused for a different outlet', () => {
    const file = { ...base(), newOutlets: [outlet({ name: 'Polygon', domain: 'polygon.com' })] };
    expect(() => applyImport(validData(), file, 'f.json')).toThrow(/outlet id "the-verge" is "The Verge"/);
  });
});

describe('importAll', () => {
  it('returns the merged data when the result validates', () => {
    const files = [
      {
        label: 'a.json',
        content: { productId: 'test-phone', reviews: [review({ outletId: 'cnet', url: 'https://www.cnet.com/x' })] },
      },
    ];
    const res = importAll({ ...validData(), reviews: [] }, files, categories);
    expect(res.errors).toEqual([]);
    expect(res.data?.reviews).toHaveLength(1);
  });

  it('returns errors and no data when any file leaves the data invalid, so nothing is written', () => {
    const good = { label: 'good.json', content: { product: product({ id: 'p2', slug: 'p2' }), reviews: [] } };
    const bad = {
      label: 'bad.json',
      content: { productId: 'p2', reviews: [review({ outletId: 'cnet', url: 'http://cnet.com/x' })] },
    };
    const res = importAll(validData(), [good, bad], categories);
    expect(res.data).toBeUndefined();
    expect(res.errors.join('\n')).toMatch(/url must be a valid https URL/);
    expect(res.messages).toHaveLength(2);
  });
});

describe('importEach', () => {
  it('rejects only the bad file and keeps the others', () => {
    const good = {
      label: 'good.json',
      content: {
        productId: 'test-phone',
        reviews: [review({ outletId: 'wired', url: 'https://www.wired.com/review/test-phone' })],
      },
    };
    const bad = {
      label: 'bad.json',
      content: {
        product: product({ id: 'new-phone', slug: 'new-phone', criticsTake: 'Great — mostly.' }),
        reviews: [],
      },
    };
    const base = validData();
    const data = { ...base, outlets: [...base.outlets, outlet({ id: 'wired', name: 'Wired', domain: 'wired.com' })] };
    const res = importEach(data, [bad, good], categories);
    expect(res.applied).toEqual(['good.json']);
    expect(res.rejected.map((r) => r.label)).toEqual(['bad.json']);
    expect(res.rejected[0].errors.join()).toMatch(/em dash/);
    expect(res.data.reviews.map((r) => r.outletId).sort()).toEqual(['cnet', 'the-verge', 'wired']);
    expect(res.data.products.map((p) => p.id)).toEqual(['test-phone']);
  });

  it('rejects a file that cannot be applied at all', () => {
    const res = importEach(validData(), [{ label: 'x.json', content: { productId: 'nope', reviews: [] } }], categories);
    expect(res.applied).toEqual([]);
    expect(res.rejected[0].errors[0]).toMatch(/needs product.id/);
  });
});
