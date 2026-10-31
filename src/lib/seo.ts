import { MAX_TITLE_LENGTH, SITE_NAME, SITE_URL, TITLE_SUFFIX } from '@/config/seo';

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

/**
 * The page title to set, from candidates in order of preference (most descriptive first): the first
 * that fits with the site suffix, else the first that fits on its own (without the suffix), else the last.
 */
export function fitTitle(candidates: string[], max = MAX_TITLE_LENGTH): string | { absolute: string } {
  const withSuffix = candidates.find((c) => c.length + TITLE_SUFFIX.length <= max);
  if (withSuffix) return withSuffix;
  return { absolute: candidates.find((c) => c.length <= max) ?? candidates[candidates.length - 1] };
}

/** Title candidates per page type, most descriptive first, for fitTitle. The first is also the share-card title. */
export const titleCandidates = {
  product: (name: string, score: number | null) =>
    score != null
      ? [`${name} reviews: ${score}/100 critic score`, `${name} reviews: ${score}/100`, `${name} reviews`]
      : [`${name} reviews`],
  category: (plural: string, year: number) => [
    `Best ${plural} to buy in ${year}: ranked by critic score`,
    `Best ${plural} ${year}: ranked by critic score`,
    `Best ${plural} to buy in ${year}`,
  ],
  /** `subject` is the lower-case list name from a Roundup ("Apple products", "phones under $800"). */
  roundup: (subject: string, year: number) => [
    `Best ${subject} in ${year}: ranked by critic score`,
    `Best ${subject} ${year}: ranked by critic score`,
    `Best ${subject} ${year} by critic score`,
    `Best ${subject} in ${year}`,
  ],
  best: (year: number) => [
    `Best-reviewed tech to buy in ${year}: top gadgets by critic score`,
    `Best-reviewed tech of ${year} by critic score`,
    `Best-reviewed tech to buy in ${year}`,
  ],
};

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
