import type { MetadataRoute } from 'next';
import { getAllProducts, indexableCategories } from '@/lib/data';
import { SITE_URL as BASE } from '@/config/seo';

export const dynamic = 'force-static';

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
