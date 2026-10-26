/** Single place for site-wide SEO constants. */
export const SITE_URL = 'https://www.thetechscorecard.com';
export const SITE_NAME = 'Tech Scorecard';
/** Appended to every page title by the root layout's title template. */
export const TITLE_SUFFIX = ` | ${SITE_NAME}`;
/** Longest <title> before search results usually cut it off. */
export const MAX_TITLE_LENGTH = 65;
/** A category page is indexed and listed in the sitemap only with at least this many products. */
export const MIN_PRODUCTS_FOR_CATEGORY_PAGE = 2;

/**
 * Search engine ownership tokens. Paste the token from Google Search Console
 * (HTML tag method, the content="..." value) or Bing Webmaster Tools here and
 * push. Empty means no tag is emitted. See docs/SEO-PLAN.md.
 */
export const GOOGLE_SITE_VERIFICATION = 'JDB7pNbIL03m08KK2SBrbhjOdUwYKm4bV3N1Glc5Bzo';
export const BING_SITE_VERIFICATION = '';
