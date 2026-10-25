import { describe, expect, it } from 'vitest';
import {
  articleParagraphs,
  containsQuote,
  decodeEntities,
  hostOf,
  jsonLd,
  normQuote,
  pageText,
  reviewPages,
} from '../scripts/lib/page';
import { parseJsonReply } from '../scripts/lib/models';

const LONG = 'The battery lasts two full days and the screen is the best on any phone this year.';

describe('pageText', () => {
  it('keeps body text, drops scripts and styles, and joins inline tags', () => {
    const html = `<html><head><style>p{}</style><script>var x="secret"</script></head>
      <body><p>Pixel</a>&#8217;s camera</p><div>is great&nbsp;&amp; fast</div></body></html>`;
    expect(pageText(html)).toBe("Pixel's camera is great & fast");
  });
});

describe('articleParagraphs', () => {
  it('returns long paragraphs only, without navigation, footers or asides', () => {
    const html = `<nav><p>${LONG} nav</p></nav><p class="x">${LONG}</p><p>Short byline</p>
      <aside><p>${LONG} aside</p></aside><footer><p>${LONG} footer</p></footer><p>&ldquo;Quoted&rdquo; <b>bold</b> text that runs long enough to keep.</p>`;
    expect(articleParagraphs(html)).toEqual([LONG, '"Quoted" bold text that runs long enough to keep.']);
  });
});

describe('decodeEntities', () => {
  it('turns curly quotes and dash entities into plain characters', () => {
    expect(decodeEntities('a &ndash; b &mdash; c &#39;d&#x27; &quot;e&quot;')).toBe('a - b - c \'d\' "e"');
  });
});

describe('quote matching', () => {
  it('ignores case, spacing, curly quotes and dashes, like verify-quotes.py', () => {
    expect(normQuote('  It’s  “GREAT” — really ')).toBe('it\'s "great" - really');
    expect(
      containsQuote('Overall, it’s the best phone — for most people.', "It's the best phone - for most people."),
    ).toBe(true);
    expect(containsQuote('Overall, it is fine.', "It's the best phone.")).toBe(false);
  });
});

describe('jsonLd', () => {
  const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

  it('reads rating, critic and date from a Review block', () => {
    const html = ld({
      '@type': 'Review',
      reviewRating: { '@type': 'Rating', ratingValue: '4.5', bestRating: '5' },
      author: [{ '@type': 'Person', name: 'Jane Critic' }],
      datePublished: '2026-09-20T10:00:00Z',
    });
    expect(jsonLd(html)).toEqual({ rating: '4.5/5', critic: 'Jane Critic', date: '2026-09-20' });
  });

  it('defaults bestRating to 5, rejects impossible ratings and skips malformed blocks', () => {
    expect(jsonLd(ld({ reviewRating: { ratingValue: 4 } })).rating).toBe('4/5');
    expect(jsonLd(ld({ reviewRating: { ratingValue: 9, bestRating: 5 } })).rating).toBeUndefined();
    expect(jsonLd('<script type="application/ld+json">{not json</script>')).toEqual({});
  });
});

describe('reviewPages', () => {
  it('adds GSMArena continuation pages and leaves other URLs alone', () => {
    const pages = reviewPages('https://www.gsmarena.com/apple_iphone_17-review-2900.php');
    expect(pages).toHaveLength(9);
    expect(pages[1]).toBe('https://www.gsmarena.com/apple_iphone_17-review-2900p2.php');
    expect(reviewPages('https://www.gsmarena.com/apple_iphone_17-review-2900p3.php')).toHaveLength(1);
    expect(reviewPages('https://www.theverge.com/review/1')).toEqual(['https://www.theverge.com/review/1']);
  });
});

describe('hostOf', () => {
  it('strips www and survives bad URLs', () => {
    expect(hostOf('https://www.theverge.com/x')).toBe('theverge.com');
    expect(hostOf('not a url')).toBe('');
  });
});

describe('parseJsonReply', () => {
  it('pulls an object or an array out of surrounding prose', () => {
    expect(parseJsonReply('Sure: {"a": 1} done')).toEqual({ a: 1 });
    expect(parseJsonReply('Found [{"url": "https://x.com"}].', '[')).toEqual([{ url: 'https://x.com' }]);
  });
  it.each([null, '', 'none', '{bad}', '] [', '}{'])('returns null for %j', (s) => {
    expect(parseJsonReply(s)).toBeNull();
    expect(parseJsonReply(s, '[')).toBeNull();
  });
});
