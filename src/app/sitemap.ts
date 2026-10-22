import type { MetadataRoute } from 'next';
import { getAllProducts } from '@/lib/data';
import { CATEGORY_ORDER } from '@/lib/format';
import { MIN_PRODUCTS_FOR_CATEGORY_PAGE } from '@/config/seo';

export const dynamic = 'force-static';

const BASE = 'https://www.thetechscorecard.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/` },
    { url: `${BASE}/best/` },
    ...CATEGORY_ORDER.filter((c) => getAllProducts().filter((p) => p.category === c && p.criticScore != null).length >= MIN_PRODUCTS_FOR_CATEGORY_PAGE)
      .map((c) => ({ url: `${BASE}/category/${c}/` })),
    { url: `${BASE}/methodology/` },
    { url: `${BASE}/about/` },
    ...getAllProducts().map((p) => ({ url: `${BASE}/product/${p.slug}/`, lastModified: p.latestReviewDate ?? undefined })),
  ];
}
