import { describe, expect, it } from 'vitest';
import { feedLinks, isReviewTitle, matchProduct, parseFeed, sortFeedItems } from '../scripts/lib/feeds';

const products = [
  { id: 'iphone-duo', name: 'iPhone Duo', brand: 'Apple' },
  { id: 'iphone-17', name: 'iPhone 17', brand: 'Apple' },
  { id: 'iphone-17-pro', name: 'iPhone 17 Pro', brand: 'Apple' },
  { id: 'steam-frame', name: 'Valve Steam Frame (256GB)', brand: 'Valve' },
  { id: 'nothing-phone-4a-pro', name: 'Nothing Phone (4a) Pro', brand: 'Nothing' },
  { id: 'headphone-1-pro', name: 'Headphone (1) Pro', brand: 'Nothing' },
  { id: 'nothing-headphone-a', name: 'Nothing Headphone (a)', brand: 'Nothing' },
  { id: 'galaxy-s26', name: 'Galaxy S26', brand: 'Samsung' },
  { id: 'galaxy-s26-plus', name: 'Galaxy S26+', brand: 'Samsung' },
];
const match = (title: string) => matchProduct(title, products)?.id;

describe('parseFeed', () => {
  it('reads RSS items', () => {
    const xml = `<rss><channel><title>Ars Technica</title>
      <item><title>Apple iPhone Duo review: Two screens, two experiences, two thousand dollars</title>
      <link>https://arstechnica.com/gadgets/2026/10/apple-iphone-duo-review/</link>
      <pubDate>Tue, 27 Oct 2026 13:00:00 +0000</pubDate></item>
      <item><title><![CDATA[Panasonic Bread &#038; Ice Cream Maker Review]]></title>
      <link>https://example.com/b</link></item></channel></rss>`;
    expect(parseFeed(xml)).toEqual([
      {
        title: 'Apple iPhone Duo review: Two screens, two experiences, two thousand dollars',
        url: 'https://arstechnica.com/gadgets/2026/10/apple-iphone-duo-review/',
        date: '2026-10-27',
      },
      { title: 'Panasonic Bread & Ice Cream Maker Review', url: 'https://example.com/b', date: '' },
    ]);
  });

  it('reads Atom entries, taking the alternate link', () => {
    const xml = `<feed><entry><title type="html">Fitbit Edge review</title>
      <link rel="replies" href="https://example.com/a#comments"/>
      <link rel="alternate" href="https://example.com/a"/>
      <published>2026-10-26T10:00:00Z</published></entry></feed>`;
    expect(parseFeed(xml)).toEqual([{ title: 'Fitbit Edge review', url: 'https://example.com/a', date: '2026-10-26' }]);
  });
});

it('feedLinks finds advertised feeds and skips comment feeds', () => {
  const html = `<link rel="alternate" type="application/rss+xml" title="Feed" href="/feed/">
    <link rel="alternate" type="application/rss+xml" title="Comments" href="/comments/feed/">
    <link rel="stylesheet" href="/a.css">`;
  expect(feedLinks(html, 'https://example.com/')).toEqual(['https://example.com/feed/']);
});

it('isReviewTitle keeps reviews and skips hands-ons, roundups and comparisons', () => {
  expect(isReviewTitle('Apple iPhone Duo review: Two screens')).toBe(true);
  expect(isReviewTitle('Review: The Oppo Find X10 Pro Max is a gut punch')).toBe(true);
  expect(isReviewTitle('iPhone Duo review roundup: mixed verdicts')).toBe(false);
  expect(isReviewTitle('iPhone Duo hands-on review')).toBe(false);
  expect(isReviewTitle('iPhone Duo vs Galaxy Z Fold 8 review')).toBe(false);
  expect(isReviewTitle('The iPhone Duo reviews are in')).toBe(false);
  expect(isReviewTitle('Apple releases iOS 27.2')).toBe(false);
});

describe('matchProduct', () => {
  it('matches the name with or without the brand', () => {
    expect(match('Apple iPhone Duo review: Two screens, two experiences')).toBe('iphone-duo');
    expect(match('iPhone Duo review')).toBe('iphone-duo');
  });
  it('prefers the most specific product', () => {
    expect(match('iPhone 17 Pro review: the camera phone to beat')).toBe('iphone-17-pro');
    expect(match('iPhone 17 review')).toBe('iphone-17');
    expect(match('Samsung Galaxy S26+ review')).toBe('galaxy-s26-plus');
    expect(match('Nothing Headphone (1) Pro review')).toBe('headphone-1-pro');
    expect(match('Nothing Headphone (a) review')).toBe('nothing-headphone-a');
  });
  it('drops a bracketed detail headlines leave out, and keeps one they use', () => {
    expect(match('Valve Steam Frame Review: Costly and Inconsistent')).toBe('steam-frame');
    expect(match('Nothing Phone (4a) Pro review')).toBe('nothing-phone-4a-pro');
  });
  it('matches nothing for another product', () => {
    expect(match('Fitbit Edge review')).toBeUndefined();
  });
});

it('sortFeedItems splits reviews of products on the site from leads, and skips old, unknown and repeated pages', () => {
  const items = [
    { title: 'Apple iPhone Duo review', url: 'https://arstechnica.com/duo/', date: '2026-10-27' },
    { title: 'Apple iPhone Duo review', url: 'https://www.arstechnica.com/duo', date: '2026-10-27' },
    { title: 'Fitbit Edge review', url: 'https://www.wired.com/review/fitbit-edge/', date: '2026-10-26' },
    { title: 'iPhone 17 review', url: 'https://arstechnica.com/old/', date: '2026-09-01' },
    { title: 'iPhone Duo review', url: 'https://unknown.example/duo', date: '2026-10-27' },
    { title: 'Some iPhone Duo screens are failing', url: 'https://arstechnica.com/news/', date: '2026-10-27' },
  ];
  const known = (u: string) => /arstechnica\.com|wired\.com/.test(u);
  const res = sortFeedItems(items, products, known, '2026-10-27');
  expect([...res.byProduct]).toEqual([['iphone-duo', ['https://arstechnica.com/duo/']]]);
  expect(res.leads.map((l) => l.title)).toEqual(['Fitbit Edge review']);
});
