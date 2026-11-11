import { describe, expect, it } from 'vitest';
import { checkCanonical, checkIdentity, hasPaywall, isSoft404, pageProblem } from '../scripts/lib/page-guards';

const page = (head: string, body = '') => `<html><head>${head}</head><body>${body}</body></html>`;
const canon = (u: string) => `<link rel="canonical" href="${u}">`;
const pixel10 = { id: 'pixel-10', name: 'Google Pixel 10', brand: 'Google' };
const pixel10pro = { id: 'pixel-10-pro', name: 'Google Pixel 10 Pro', brand: 'Google' };
const s26 = { id: 'galaxy-s26', name: 'Samsung Galaxy S26', brand: 'Samsung' };
const s26plus = { id: 'galaxy-s26-plus', name: 'Samsung Galaxy S26+', brand: 'Samsung' };
const all = [pixel10, pixel10pro, s26, s26plus];

describe('isSoft404', () => {
  it('catches a short error template and a not-found title', () => {
    expect(isSoft404('<html><body>The page you requested is not available.</body></html>')).toBe(true);
    expect(isSoft404(page('<title>Page not found - The Verge</title>', 'x'.repeat(5000)))).toBe(true);
    expect(isSoft404(page('<title>Error 404 | Example</title>', 'x'.repeat(5000)))).toBe(true);
  });
  it('leaves real reviews alone, even ones that mention a missing page or a bare 404 title', () => {
    const long = 'The battery lasts two days. '.repeat(200);
    expect(isSoft404(page('<title>Pixel 10 review</title>', `<p>${long} the page not found joke</p>`))).toBe(false);
    expect(isSoft404(page('<title>404 - A show called 404</title>', long))).toBe(false);
  });
});

describe('checkCanonical', () => {
  const url = 'https://www.theverge.com/reviews/pixel-10-review?utm_source=x';
  it('passes a matching, missing or longer-slug canonical', () => {
    expect(checkCanonical(page(canon('https://www.theverge.com/reviews/pixel-10-review/')), url).ok).toBe(true);
    expect(checkCanonical(page(''), url).ok).toBe(true);
    expect(checkCanonical(page(canon('https://www.theverge.com/reviews/pixel-10-review-the-best')), url).ok).toBe(true);
    expect(checkCanonical(page(canon('https://amp.theverge.com/reviews/pixel-10-review')), url).ok).toBe(true);
    expect(checkCanonical(page('<meta property="og:url" content="/reviews/pixel-10-review">'), url).ok).toBe(true);
  });
  it('rejects a homepage or a different article', () => {
    expect(checkCanonical(page(canon('https://www.theverge.com/')), url).ok).toBe(false);
    expect(checkCanonical(page(canon('https://www.theverge.com/reviews/pixel-11-review')), url).ok).toBe(false);
    expect(checkCanonical(page(canon('https://www.theverge.com/reviews/pixel-10-reviewer')), url).ok).toBe(false);
    expect(checkCanonical(page(canon('https://other.example/reviews/pixel-10-review')), url).ok).toBe(false);
  });
  it('accepts another domain of the same outlet', () => {
    expect(
      checkCanonical(page(canon('https://www.cnet.co.uk/reviews/x')), 'https://www.cnet.com/reviews/x', () => true).ok,
    ).toBe(true);
  });
});

describe('checkIdentity', () => {
  const run = (title: string, url: string, product = pixel10) =>
    checkIdentity(page(`<title>${title}</title>`, `<h1>${title}</h1>`), url, product, all).ok;
  it('accepts the product itself and joint reviews of it', () => {
    expect(run('Google Pixel 10 review: the new baseline', 'https://x.com/pixel-10-review')).toBe(true);
    expect(run('Samsung Galaxy S26 and S26+ review', 'https://x.com/galaxy-s26-and-galaxy-s26-plus-review', s26)).toBe(
      true,
    );
    expect(run('Samsung Galaxy S26+ review', 'https://x.com/galaxy-s26-plus-review', s26plus)).toBe(true);
  });
  it('rejects a sibling model or another product on the site', () => {
    expect(run('Google Pixel 10a review', 'https://x.com/pixel-10a-review')).toBe(false);
    expect(run('Google Pixel 10 Pro review', 'https://x.com/pixel-10-pro-review')).toBe(false);
    expect(run('Samsung Galaxy S26+ review', 'https://x.com/galaxy-s26-plus-review', s26)).toBe(false);
  });
  it('leaves a page that names no product to the model', () => {
    expect(run('The best phones of the year', 'https://x.com/best-phones')).toBe(true);
  });
});

describe('hasPaywall', () => {
  it('finds a wall at the start but not deep in an article', () => {
    expect(hasPaywall('Subscribe to continue reading this review')).toBe(true);
    expect(hasPaywall('x'.repeat(2000) + ' subscribe to continue reading')).toBe(false);
  });
});

describe('pageProblem', () => {
  it('returns the first reason, or null for a good page', () => {
    const good = page(
      `<title>Google Pixel 10 review</title>${canon('https://x.com/pixel-10-review')}`,
      '<p>Great.</p>',
    );
    const base = { url: 'https://x.com/pixel-10-review', product: pixel10, products: all };
    expect(pageProblem({ ...base, html: good, text: 'Great. '.repeat(400) })).toBeNull();
    expect(pageProblem({ ...base, html: good, text: 'Subscribe to continue reading. ' + 'x '.repeat(900) })).toMatch(
      /^paywall/,
    );
  });
});
