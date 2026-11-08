import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { findLaunchPhoto, photoCandidates } from '../scripts/lib/launch-photo';

const page = `<html><head>
<meta property="og:image" content="/img/hero.jpg?v=1&amp;w=1200">
<meta name="twitter:image" content="https://cdn.example.com/brand-logo.png">
<script type="application/ld+json">{"@type":"Product","name":"X","image":["//cdn.example.com/x-front.png",{"url":"https://cdn.example.com/x-side.png"}]}</script>
</head></html>`;

describe('photoCandidates', () => {
  it('collects share and product images, resolved, without logos', () => {
    expect(photoCandidates(page, 'https://www.example.com/products/x/')).toEqual([
      'https://www.example.com/img/hero.jpg?v=1&w=1200',
      'https://cdn.example.com/x-front.png',
      'https://cdn.example.com/x-side.png',
    ]);
  });

  it('keeps photos whose file name only contains a filtered word', () => {
    const html = `<meta property="og:image" content="https://a.example.com/s27-flagship-hero.jpg"><meta property="og:image" content="https://a.example.com/brand_logo.png">`;
    expect(photoCandidates(html, 'https://a.example.com/')).toEqual(['https://a.example.com/s27-flagship-hero.jpg']);
  });

  it('upgrades http and skips broken JSON-LD', () => {
    const html = `<meta content="http://a.example.com/p.jpg" property="og:image"><script type="application/ld+json">{bad</script>`;
    expect(photoCandidates(html, 'https://a.example.com/')).toEqual(['https://a.example.com/p.jpg']);
  });
});

describe('findLaunchPhoto', () => {
  const c = { name: 'Example X', brand: 'Example', officialUrl: 'https://www.example.com/products/x/' };
  const image = (w: number, h: number) =>
    sharp({ create: { width: w, height: h, channels: 3, background: '#ddd' } })
      .png()
      .toBuffer();

  it('returns the first photo the judge accepts', async () => {
    const seen: string[] = [];
    const got = await findLaunchPhoto(c, {
      fetchPage: () => page,
      download: async (u) => {
        seen.push(u);
        return image(1200, 900);
      },
      judge: async () => (seen.length === 1 ? '{"ok": false, "reason": "banner"}' : '{"ok": true}'),
      parse: JSON.parse,
    });
    expect(got?.url).toBe('https://cdn.example.com/x-front.png');
  });

  it('skips photos that are too small and returns null when none pass', async () => {
    let judged = 0;
    const got = await findLaunchPhoto(c, {
      fetchPage: () => page,
      download: () => image(200, 200),
      judge: async () => {
        judged++;
        return '{"ok": true}';
      },
      parse: JSON.parse,
    });
    expect(got).toBeNull();
    expect(judged).toBe(0);
  });

  it('returns null when the official page cannot be read', async () => {
    const got = await findLaunchPhoto(c, {
      fetchPage: () => {
        throw new Error('403');
      },
      download: () => image(1000, 1000),
      judge: async () => '{"ok": true}',
      parse: JSON.parse,
    });
    expect(got).toBeNull();
  });

  it('throws when the model call fails, so the run raises an alert', async () => {
    await expect(
      findLaunchPhoto(c, {
        fetchPage: () => page,
        download: () => image(1000, 1000),
        judge: async () => {
          throw new Error('HTTP 429');
        },
        parse: JSON.parse,
      }),
    ).rejects.toThrow('429');
  });
});
