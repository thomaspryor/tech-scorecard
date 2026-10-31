# SEO plan and audit (2026-10-22, card BRO-5960)

Site: https://www.thetechscorecard.com (Next.js static export on Vercel). Written 2026-10-22 at 30 products and 499 reviews; 84 products by 2026-10-26.
Domain bought 2026-10-22, so it starts with no authority and no history.

## 1. Audit findings (live crawl, 34 URLs, Playwright + Lighthouse)

Already fine:

- Apex `thetechscorecard.com` 308-redirects to `https://www.thetechscorecard.com/`; `http` redirects to `https`. One host, no duplicate.
- Every page returned 200, has one `<h1>`, a viewport tag and a unique title.
- `robots.txt` allows everything and points at the sitemap; `sitemap.xml` listed all pages.
- Lighthouse (mobile, simulated): SEO 100, best practices 100, accessibility 95-96, performance 92 (home) and 98 (product). LCP 1.8-2.8 s, CLS 0, TBT 0-100 ms. Desktop product page performance 80 (LCP 2.2 s).
- Product pages already have about 540 words each of real text (critics' take, loved/gripes, per-review excerpts) and 49-55 links.

Problems found (fixed in the first push, see section 3):

1. No `<link rel="canonical">` on any page (34 of 34).
2. No structured data on any page (34 of 34).
3. Meta descriptions up to 518 characters (Google shows about 155). Methodology and home shared one description.
4. Product titles up to 87 characters, so Google would cut or rewrite them.
5. No category or "best of" pages, so no page targets "best <category> 2026". The product breadcrumb's category link just pointed at the home page.
6. `about/` was missing from the sitemap. No `lastmod` on non-product URLs.
7. Home page title carried "(Beta)", which is a weak thing to show in search results.

Open, lower priority (not fixed yet):

- Render-blocking Google Fonts stylesheet (Lighthouse flagged it). Fixed: Inter is now self-hosted with `next/font`.
- Low color contrast on a few muted text styles (accessibility 95-96).
- Lighthouse flags `uses-long-cache-ttl` on a few non-hashed assets (such as the OG image).
- Open Graph image is one generic image for every page.

## 2. How the comparable sites win, and what that means here

Honest limit: this was a desk read, not a rank-tracking study. No search-volume or ranking data was available in this session, so nothing below is a measured number.

- Metacritic and Rotten Tomatoes rank on age and links. Decades of backlinks, a stable URL per title, and a title format of the form "<Title> Reviews" plus the score. They are the reference sources in their own fields, not in gadgets.
- RTINGS wins on original lab testing, which Tech Scorecard does not have and should not pretend to have.
- Review roundups ("best X 2026" lists) win on freshness plus a clear ranked list with a short reason per entry.
- The big tech outlets (The Verge, CNET, Tom's Guide, TechRadar) own "<product> review" because the original review is theirs.

Where a brand-new aggregator can realistically compete:

- Aggregator wording the originals do not use: "<product> review score", "<product> critic score", "<product> reviews roundup", "is the <product> worth it".
- Long-tail "best <category> 2026" and "best-reviewed <category>", especially narrow ones (foldables, smartwatches, handheld consoles).
- Newly released products in the first weeks, before authority pages settle.
- Branded search ("tech scorecard"), once anyone knows the name.

Not realistic in the first months: head terms such as "best phones 2026" or "iPhone 17 review".

## 3. What was shipped (technical and on-site)

All in `src/`, pushed to main:

- `src/config/seo.ts`: site URL, name, title suffix and length limit, thin-page threshold, and empty slots for the Google and Bing verification tokens.
- `src/lib/seo.ts` and `src/components/JsonLd.tsx`: helpers for descriptions (clipped to about 155 characters at a word boundary) and JSON-LD.
- Root layout: title template (`%s | Tech Scorecard`), default title and description without "Beta", `WebSite` and `Organization` JSON-LD, verification tags (emitted only when a token is set).
- Every page sets its own canonical (static pages, product, category, best). A canonical is deliberately not set in the layout, because children would inherit it.
- Product pages: title `"<name> reviews: <score>/100 critic score"`, description led by the score and review count, `BreadcrumbList` and `WebPage` JSON-LD, breadcrumb now links to the category page.
- New `/category/<name>/` pages (8 categories, titled "Best <Plural> to buy in <year>: ranked by critic score", shortened by `fitTitle`), ranked lists built only from existing data, `ItemList` and `BreadcrumbList` JSON-LD. Categories with fewer than 2 scored products are `noindex, follow` and left out of the sitemap until they have more (all 8 are indexed as of 2026-10-26).
- New `/best/` page: the 10 highest critic scores overall, links to each category page.
- Internal links: home page "Best of 2026" section, footer "Best of 2026" link, category pages cross-link each other.
- "Best of 2026" spans launches from Oct 2025 to Oct 2026 (the data window), not only 2026 releases.
- Sitemap now lists home, `/best/`, indexable categories, methodology, about and all products.
- Footer link from Broadway Scorecard and West End Scorecard (one shared footer component, followed link, wording "From the makers of Broadway Scorecard").

### Structured data policy (checked against Google's review snippet docs, 2026-10-22)

Google's review snippet guidelines say: "Don't aggregate reviews or ratings from other websites." Tech Scorecard's score is built from other sites' reviews, so the pages emit no `AggregateRating`, no `Review` and no `ratingValue`. The score still appears in titles, descriptions and page text. Do not add rating markup later without re-reading that page; the risk is a manual action, not just an ignored snippet.
`Product` markup is also left out on purpose: Google requires an offer, review or rating on it, and the site has no first-party reviews.

## 4. Prioritized plan

Status 2026-10-26 (from the SEO audit that day):

- Step 4 done: `fitTitle` (`src/lib/seo.ts`) keeps product, category and /best/ titles within 65 characters,
  dropping the " | Tech Scorecard" suffix only when a long product name needs it. A test checks every product.
- Step 5: the sitemap has real `lastmod` for home, /best/ and categories (newest review), and product
  JSON-LD has `dateModified`. The home "newest reviews" block was added 2026-10-31 (see below).
- Step 6 done: per-product share images. Their URL now keeps its trailing slash (the slashless one redirected).
- The year in "Best ... to buy in" titles comes from the data (`bestYear()` in `src/lib/data.ts`): it moves to a
  new year once 10 reviews are dated in it.
- IndexNow (the key file is live in `public/`) is not wired up: a ping from the weekly workflow would have to wait
  for the Vercel deploy, and that wait was judged more likely to send the owner false alarms than to help.
  It only reaches Bing and Yandex, which read the sitemap anyway. Revisit if Bing indexing lags.
- Status 2026-10-31 (plan finished except link building):
  - Step 5 done: the home page has a "Latest reviews added" block (newest review per product, `getLatestReviews`).
  - Step 7 done: fonts are self-hosted; text colors already meet 4.5:1 (see `globals.css`); the shared share image gets a one-week cache header in `vercel.json`.
  - Step 8 done, with a limit: each scored product page has "Where critics agree and disagree" (`src/lib/consensus.ts`), built only from the review scores, outlets, dates and awards. A "who should buy it" paragraph was left out on purpose: it cannot be derived from the data without guessing.
  - Step 9 done: `/best/<topic>/` roundups from `src/lib/roundups.ts`. One page per brand with at least 4 scored products, plus launch-price ladders (tech under $200 to $1,000; phones, wearables, watches and headphones by price). Pages are generated from the data, so a new product can create or fill one. A price page is skipped when it would list nearly the whole parent list or add fewer than 3 products over the previous cap, to avoid near-duplicates. They are linked from `/best/`, category pages and product pages, and are in the sitemap.
  - Google Search Console and Bing Webmaster Tools are verified (Oct 24); Google began showing the site in results the same day.
  - Step 10 (earning first links) is not something code can do; it stays an ongoing job.

### Now (this week)

1. Verify the site in Google Search Console and Bing Webmaster Tools (owner steps below), submit `sitemap.xml`.
2. Request indexing for `/`, `/best/`, the 7 indexable category pages and the 5 newest products via the URL Inspection tool.
3. Keep the Broadway Scorecard and West End Scorecard footer links (done): they give the new domain its first crawl path from an established site.
4. After the sibling card (BRO-5959) adds products, re-check `npm run build` output: titles under about 65 characters, descriptions about 155, one canonical each.

### Next (weeks 2 to 6)

5. Add a "newest reviews" or changelog block on the home page so crawlers see fresh content, and set real `lastModified` dates per page in the sitemap.
6. Per-product Open Graph images (name + score) so shared links look specific.
7. Move fonts to `next/font`; fix the contrast warnings.
8. Add a short, data-derived "Who should buy it" or "outlet consensus" paragraph per product, only from what the reviews already say. Product pages already have about 540 words; the aim is variety between them, not length.
9. A few narrow roundup pages built from existing data (for example "Best foldable phones", "Best noise-cancelling headphones") once there are at least 4 products in the topic.
10. Earn first links honestly: Broadway Scorecard's own pages where relevant, a post about the method, directories and communities where the owner is already active.

### Later (months)

11. Keep every new product on the same day as release, because a freshly released product's "review score" queries have little competition.
12. Watch Search Console queries; double down on the pages that get impressions, fold or noindex the ones that stay unindexed.
13. Only consider rating markup if Google's policy changes, and only after reading the then-current docs.

## 5. Realistic expectation for a new low-authority domain

- Indexing: new sites often take days to weeks to be crawled well; some pages will sit at "Discovered, currently not indexed" for a while. Pages that are close duplicates (thin category pages, near-identical descriptions) are the usual casualties, which is why thin pages are noindexed.
- Rankings: expect little to no traffic from search in the first 1 to 3 months. A first trickle on long-tail queries is plausible in months 3 to 6 if pages get indexed and a few real links arrive. Head terms are out of reach for this year.
- Impressions come before clicks. The first win to look for is impressions for "<product> review score" style queries in Search Console, not visits.
- These are expectations from how new domains generally behave, not forecasts from data on this site.

## 6. Search Console and Bing setup (needs the owner)

Verification needs a token only the owner's Google or Microsoft account can generate, so it cannot be shipped ahead of time. The site is ready: pasting the token into `src/config/seo.ts` and pushing adds the meta tag.

Google Search Console:

1. Open https://search.google.com/search-console and sign in with the account that should own the site.
2. Add property, choose **URL prefix**, enter `https://www.thetechscorecard.com/`.
3. Choose the **HTML tag** method and copy the `content="..."` value (just the token).
4. Give the token to a Claude session (or paste it into `GOOGLE_SITE_VERIFICATION` in `src/config/seo.ts`), push, wait about a minute for the deploy, then press **Verify**.
5. In Sitemaps, submit `sitemap.xml`.

Bing Webmaster Tools:

1. Open https://www.bing.com/webmasters and sign in.
2. Choose **Import from Google Search Console** once the Google property is verified. This verifies Bing automatically and needs no second tag.
3. If importing is not offered, add the site manually, pick the **HTML Meta Tag** method, and put the `content` value in `BING_SITE_VERIFICATION` in `src/config/seo.ts`.

Optional, a DNS option: if the owner wants a Domain property (covers apex and www at once), Google gives a TXT record to add at the domain's DNS host; no code change is needed.
