import type { MetadataRoute } from 'next';
import { getAllProducts, indexableCategories, latestReviewDate } from '@/lib/data';
import { getRoundups } from '@/lib/roundups';
import { SITE_URL as BASE } from '@/config/seo';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  // Lists change when a review is added, so each list page's lastmod is its newest review.
  const all = getAllProducts();
  const newest = latestReviewDate(all);
  return [
    { url: `${BASE}/`, lastModified: newest },
    { url: `${BASE}/best/`, lastModified: newest },
    ...indexableCategories().map((c) => ({
      url: `${BASE}/category/${c}/`,
      lastModified: latestReviewDate(all.filter((p) => p.category === c)),
    })),
    ...getRoundups().map((r) => ({
      url: `${BASE}/best/${r.slug}/`,
      lastModified: latestReviewDate(r.products),
    })),
    { url: `${BASE}/methodology/` },
    { url: `${BASE}/about/` },
    ...all.map((p) => ({
      url: `${BASE}/product/${p.slug}/`,
      lastModified: p.latestReviewDate ?? undefined,
    })),
  ];
}
