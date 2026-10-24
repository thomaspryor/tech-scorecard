import { SITE_NAME, SITE_URL } from '@/config/seo';

/** Absolute URL for a site path such as "/product/x/". */
export function abs(path: string): string {
  return `${SITE_URL}${path}`;
}

/** Trim text to a search-snippet length at a word boundary. */
export function clip(text: string, max = 155): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '')}…`;
}

export type Crumb = { name: string; path: string };

export function breadcrumbLd(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: abs(c.path) })),
  };
}

export function itemListLd(name: string, items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, url: abs(it.path) })),
  };
}

export const websiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: `${SITE_URL}/`,
};

export const organizationLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/icon.svg`,
};

/**
 * Every page that sets its own openGraph must also pass the image, or the site image is lost (Next does not deep-merge).
 * Pass `image` for a page with its own opengraph-image route (e.g. the product pages).
 */
export function socialMeta(title: string, description: string, path: string, image = '/opengraph-image.png') {
  return {
    openGraph: {
      siteName: SITE_NAME,
      type: 'website' as const,
      title,
      description,
      url: path,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image' as const, title, description },
  };
}
