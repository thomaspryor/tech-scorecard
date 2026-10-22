import { describe, expect, it } from 'vitest';
import { validateData, isIsoDate } from '../scripts/lib/validate';
import { loadData, loadCategories } from '../scripts/lib/data-files';
import { categories, outlet, product, review, validData } from './fixtures';

type Data = ReturnType<typeof validData>;

/** Validate a copy of the fixture after `edit` changes it; returns the error list. */
function errorsAfter(edit: (d: Data) => void): string[] {
  const d = structuredClone(validData());
  edit(d);
  return validateData({ ...d, categories });
}

describe('validateData', () => {
  it('accepts the fixture', () => {
    expect(validateData({ ...validData(), categories })).toEqual([]);
  });

  it('accepts the committed data in data/', () => {
    expect(validateData({ ...loadData(), categories: loadCategories() })).toEqual([]);
  });

  it.each<[string, (d: Data) => void, RegExp]>([
    ['duplicate product id', (d) => d.products.push(product({ slug: 'other' })), /duplicate product id: test-phone/],
    ['duplicate slug', (d) => d.products.push(product({ id: 'other' })), /duplicate product slug/],
    ['duplicate outlet id', (d) => d.outlets.push(outlet()), /duplicate outlet id/],
    ['outlet tier out of range', (d) => { (d.outlets[0] as { tier: number }).tier = 5; }, /tier must be 1-4/],
    ['impossible release date', (d) => { d.products[0].releaseDate = '2026-02-30'; }, /bad releaseDate/],
    ['missing criticsTake', (d) => { d.products[0].criticsTake = ''; }, /missing criticsTake/],
    ['unknown category', (d) => { (d.products[0] as { category: string }).category = 'toaster'; }, /unknown category "toaster"/],
    ['unknown art kind', (d) => { (d.products[0].art as { kind: string }).kind = 'blob'; }, /unknown art.kind "blob"/],
    ['review of unknown product', (d) => { d.reviews[0].productId = 'ghost'; }, /unknown product/],
    ['review from unknown outlet', (d) => { d.reviews[0].outletId = 'ghost'; }, /unknown outlet/],
    ['two reviews from one outlet', (d) => d.reviews.push(review({ url: 'https://www.theverge.com/2' })), /duplicate outlet for product/],
    ['http url', (d) => { d.reviews[0].url = 'http://www.theverge.com/r'; }, /url must be https/],
    ['url on another outlet\'s site', (d) => { d.reviews[0].url = 'https://www.cnet.com/r'; }, /url host cnet.com is not theverge.com/],
    ['bad review date', (d) => { d.reviews[0].date = '20/09/2026'; }, /bad date/],
    ['non-integer score', (d) => { d.reviews[0].score = 93.5; }, /score must be an integer 0-100/],
    ['score above 100', (d) => { d.reviews[1].score = 101; }, /score must be an integer 0-100/],
    ['unknown scoreSource', (d) => { (d.reviews[0] as { scoreSource: string }).scoreSource = 'vibes'; }, /scoreSource must be rating\|text/],
    ['rated review without a rating', (d) => { d.reviews[0].rating = null; }, /needs a rating/],
    ['unparseable rating', (d) => { d.reviews[0].rating = 'A+'; }, /cannot parse rating "A\+"/],
    ['score outside its rating band', (d) => { d.reviews[0].score = 90; }, /score 90 is outside the 9\/10 band 91-100/],
    ['stale stored scoreBand', (d) => { d.reviews[0].scoreBand = [71, 90]; }, /does not match the 9\/10 band/],
    ['text-scored review with a rating', (d) => { d.reviews[1].rating = '4/5'; }, /text-scored review must not carry a rating/],
    ['empty excerpt', (d) => { d.reviews[0].excerpt = '  '; }, /excerpt must be 1-45 words \(has 0\)/],
    ['excerpt too long', (d) => { d.reviews[0].excerpt = 'word '.repeat(46); }, /has 46/],
  ])('rejects %s', (_name, edit, pattern) => {
    const errors = errorsAfter(edit);
    expect(errors.some((e) => pattern.test(e)), errors.join('\n')).toBe(true);
  });

  it('accepts a review hosted on an outlet\'s alternate domain or a subdomain', () => {
    expect(errorsAfter((d) => {
      d.outlets[0] = { ...d.outlets[0], altDomains: ['vox.com'] } as Data['outlets'][number];
      d.reviews[0].url = 'https://www.vox.com/review';
    })).toEqual([]);
    expect(errorsAfter((d) => { d.reviews[0].url = 'https://reviews.theverge.com/x'; })).toEqual([]);
  });

  it('does not let a look-alike host pass as the outlet', () => {
    expect(errorsAfter((d) => { d.reviews[0].url = 'https://nottheverge.com/r'; })).toHaveLength(1);
  });
});

describe('isIsoDate', () => {
  it.each(['2026-01-01', '2028-02-29'])('accepts %s', (s) => expect(isIsoDate(s)).toBe(true));
  it.each(['2026-02-29', '2026-13-01', '2026-1-01', '', null, undefined])('rejects %s', (s) => expect(isIsoDate(s)).toBe(false));
});
