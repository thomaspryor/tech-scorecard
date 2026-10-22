import type { MetadataRoute } from 'next';
import { getAllProducts, indexableCategories } from '@/lib/data';

export const dynamic = 'force-static';

const BASE = 'https://www.thetechscorecard.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/` },
    { url: `${BASE}/best/` },
    ...indexableCategories().map((c) => ({ url: `${BASE}/category/${c}/` })),
    { url: `${BASE}/methodology/` },
    { url: `${BASE}/about/` },
    ...getAllProducts().map((p) => ({ url: `${BASE}/product/${p.slug}/`, lastModified: p.latestReviewDate ?? undefined })),
  ];
}
