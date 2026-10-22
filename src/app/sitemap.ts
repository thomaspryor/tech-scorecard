import type { MetadataRoute } from 'next';
import { getAllProducts } from '@/lib/data';

export const dynamic = 'force-static';

const BASE = 'https://www.thetechscorecard.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/` },
    { url: `${BASE}/methodology/` },
    ...getAllProducts().map((p) => ({ url: `${BASE}/product/${p.slug}/`, lastModified: p.latestReviewDate ?? undefined })),
  ];
}
