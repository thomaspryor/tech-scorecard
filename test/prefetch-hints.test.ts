import { describe, expect, it } from 'vitest';
import { imageHints } from '../scripts/lib/prefetch-hints';

describe('imageHints', () => {
  it('finds image preload hints and ignores style and font hints', () => {
    const payload = [
      ':HL["/_next/static/chunks/a.css","style"]',
      ':HL["/_next/static/media/f.woff2","font",{"crossOrigin":""}]',
      ':HL["/images/products/x/main.webp","image",{"fetchPriority":"high"}]',
    ].join('\n');
    expect(imageHints(payload)).toEqual(['/images/products/x/main.webp']);
  });

  it('finds nothing in a payload without image hints', () => {
    expect(imageHints('0:{"a":1}\n:HL["/x.css","style"]')).toEqual([]);
  });
});
