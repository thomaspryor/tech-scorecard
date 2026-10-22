# Porting Broadway Scorecard improvements

Tech Scorecard is built on Broadway Scorecard's layout and scoring method
(repo `thomaspryor/Broadwayscore`, live at https://broadwayscorecard.com). Broadway gets
general web improvements almost every day: performance, SEO, accessibility, security,
shared UI fixes. This doc says which of those carry over here, how to decide, how to port
one, and holds the weekly routine that keeps the two sites in step without anyone having to
remember.

## What carries over

Port a Broadway change when it fixes or improves something this site also has:

| Area          | Usually carries over                                                                                                                                                                                         | Usually does not                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Performance   | page weight and payload budgets, font loading, render-blocking resources, LCP hints, content-visibility, hydration cost                                                                                      | Supabase, PostHog, Sentry, ISR/revalidation, poster image pipelines (this site has none of them) |
| SEO           | title/description/canonical rules, Open Graph and Twitter cards, sitemap and robots rules, noindex for thin or error pages, JSON-LD that follows Google's policies, internal-link hygiene, crawl-size limits | show/venue/cast/critic page rules, Broadway-specific schema types (TheaterEvent, FAQ for shows)  |
| Accessibility | focus rings, 44px touch targets, layout at 320-414px, contrast, screen-reader labels, input font size (iOS zoom), reduced motion                                                                             | fixes inside features this site lacks (accounts, My Shows, fantasy, lists)                       |
| Security      | response headers (CSP, frame, referrer, permissions), dependency upgrades, link rel rules                                                                                                                    | auth, email links, API routes, Supabase grants (this site is a static export with no server)     |
| Shared UI     | score badge, list and mini cards, tier chip, score breakdown bar, header/footer behaviour, copy voice rules                                                                                                  | show-specific widgets (box office, recoupment, tours, audience buzz)                             |
| Framework     | Next.js / React / Tailwind upgrades and the fixes they needed                                                                                                                                                | `vercel-deploy.yml`, deploy gates, cron workflows, Linear tooling, Claude hooks                  |

Never port scoring-data changes or Broadway's data pipeline; this site has its own
(docs/PIPELINE.md). Never port anything that needs a server: `next.config.js` here is
`output: 'export'`, so response headers live in `vercel.json` and there is no middleware.

## How to decide, item by item

1. Read the Broadway commit or card. What user-visible or crawler-visible problem did it fix?
2. Check whether this site has the same problem, on the live site, not by reading code:
   `curl -s https://www.thetechscorecard.com/<path>`, Playwright (Chromium at
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`), Lighthouse
   (`npx lighthouse@12 <url> --chrome-flags="--headless=new --no-sandbox"` with `CHROME_PATH`
   set to that Chromium).
3. Mark it **applies**, **does not apply** (say why in one line) or **already done**.
4. If it applies, port the idea, not the code: Broadway is a server-rendered, dark-themed,
   much larger app. Match this repo's patterns (static export, no client JS where CSS works,
   logic in `scripts/lib/` with a Vitest test, JSDoc types for scripts).

## How to port one

1. `git pull --rebase origin main`. Other sessions push to main here too.
2. Make the change as one small commit. Say in the message which Broadway change it follows,
   for example `Ported from Broadway Scorecard (BRO-5968)`.
3. `npm run check` (typecheck incl. scripts, lint, Prettier, tests) and `npm run build`
   (validates data, exports the site, then fails if any page is over 1.8MB).
4. For UI changes, look at it at 320, 390 and 1280px wide in Chromium and check there is no
   horizontal scroll. For performance changes, run Lighthouse on the live page before and after.
5. `git pull --rebase origin main` again, re-run the build, then push main. Vercel deploys in
   about a minute. Cloud sessions that also have the Broadwayscore repo attached push with
   `LAND_ENFORCE_OFF=1 git push origin main` (Broadwayscore's hooks forbid pushing main; that
   rule is for Broadwayscore only).
6. Verify on https://www.thetechscorecard.com, then add a row to the port log below.

## How Broadway flags a change for porting

Broadway sessions are asked (Broadwayscore `CLAUDE.md`, "Tech Scorecard carry-over") to mark
changes that are generic web improvements in one of two ways:

- a commit message line `PORT-TECH: <what to carry over, one line>`, or
- the Linear label `port-tech` on the card.

The routine below reads both, and also scans everything else, because flags will be missed.

## Weekly routine

Recommended schedule: Mondays 06:47 Europe/Berlin (`CRON_TZ=Europe/Berlin 47 6 * * 1`), each
run in a fresh session. The prompt is self-contained:

```text
Weekly Tech Scorecard porting run. Goal: carry last week's general web improvements from
Broadway Scorecard (repo thomaspryor/Broadwayscore, broadwayscorecard.com) to Tech Scorecard
(repo thomaspryor/tech-scorecard, www.thetechscorecard.com), verify them live, and report.
Plain English, no em dashes. Never invent data or results.

1. Setup. Attach thomaspryor/tech-scorecard with push access and clone it to
   /home/user/tech-scorecard (shallow is fine). Read README.md, docs/PORTING.md (this routine,
   the carry-over rules and the port log) and docs/PIPELINE.md. Do not clone Broadwayscore
   (it is several GB); read it through the GitHub API with gh. Attach it read-only if gh
   refuses. File a Linear card in team "Broadway Scorecard" titled
   "Tech Scorecard weekly port <today's date>" and keep it updated.

2. Find candidates since the "Last reviewed through" date in the port log (default: 8 days ago).
   a. Flagged: gh api "repos/thomaspryor/Broadwayscore/commits?sha=main&since=<date>&per_page=100&page=N"
      (page by hand: --paginate is refused by the proxy), keep commits whose message has a
      "PORT-TECH:" line; Linear issues with label "port-tech" completed since <date>.
   b. Unflagged: the same API with &path=src, &path=next.config.js, &path=tailwind.config.ts,
      &path=public, &path=vercel.json; skip data-only and pipeline commits. Read the message and
      file list of any commit about performance, SEO, structured data, Open Graph, sitemap,
      robots, canonical, accessibility, focus, touch targets, mobile widths, security headers,
      fonts, images, framework upgrades, or the shared card/badge/chip components.
      Also Linear Done cards since <date> whose title mentions SEO, performance, Lighthouse,
      accessibility, a11y, mobile, header, footer, Open Graph, schema or security.
   c. Open Broadway cards on the same topics (In Progress or Todo) are not ported yet; list
      them as "watch" so next week's run checks them again.

3. Decide each candidate with docs/PORTING.md "How to decide": applies, does not apply (one-line
   reason), or already done. Check this site live, not only the code.

4. Before porting, check that no other session is changing the same files: git log -10 on
   tech-scorecard main, and any open Linear cards titled "Tech Scorecard". If someone else
   owns the area, leave it and say so.

5. Port each applicable item per docs/PORTING.md "How to port one": small commit, npm run check
   and npm run build before every push, git pull --rebase origin main right before each push,
   push main (with LAND_ENFORCE_OFF=1 if Broadwayscore hooks are loaded). One item that needs
   an owner decision or more than about an hour: file a Linear card with the finding and leave it.

6. Verify live after Vercel deploys (about a minute): curl the changed pages; Playwright at 320,
   390 and 1280px (Chromium at /opt/pw-browsers/chromium-1194/chrome-linux/chrome) with no
   horizontal scroll and no console errors (CSP violations show up there); Lighthouse mobile on
   / and one product page before and after any performance item.

7. Update docs/PORTING.md: set "Last reviewed through" to the newest Broadway commit date you
   reviewed (and its short sha), and add one port-log row per ported item. Commit and push.

8. Report on the Linear card, then mark it Done: counts (candidates, applies, does not apply,
   already done, watch), each port with its tech-scorecard commit and live URL, Lighthouse
   before/after numbers, anything left for the owner. If nothing applied this week, say so in
   one line and close the card.
```

## Port log

Last reviewed through: 2026-10-22 (Broadwayscore main `f34982aa1`).

| Date       | Broadway change                                     | Tech Scorecard change                                                                      |
| ---------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 2026-10-22 | security headers on every response                  | `vercel.json`: enforced CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy |
| 2026-10-22 | BRO-5968 pages over Googlebot's 2MB fetch limit     | `postbuild` page-size guard: warn above 1MB, fail above 1.8MB                              |
| 2026-10-22 | BRO-4575, BRO-4949 header/footer overflow on phones | header fits one row from 320px; header links 44px tall                                     |
| 2026-10-22 | BRO-5812 copy voice rules and guard                 | `test/copy-voice.test.ts` checks src/ strings and products.json copy                       |
| 2026-10-22 | BRO-4881 tier chip meaning for every reader         | tier chip has a screen-reader label (title alone is mouse-only)                            |

## Catch-up inventory (2026-09-22 to 2026-10-22)

The first review, covering Broadway's last 30 days (396 commits that touched site code, plus
Linear cards). Generic web items only; Broadway data, pipeline, tooling and feature work is left
out.

| Broadway change                                                            | Verdict                          | Why                                                                                                 |
| -------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| BRO-5985 performance audit (2026-10-22, open): Supabase in the root layout | does not apply                   | no Supabase or auth here                                                                            |
| BRO-5985: PostHog surveys and recorder loaded for everyone                 | does not apply                   | analytics is Vercel Web Analytics only (one small same-origin script)                               |
| BRO-5985: only the LCP image should get fetchpriority=high                 | does not apply                   | no `<img>` on any page; device art is inline SVG                                                    |
| BRO-5985: oversized poster images                                          | does not apply                   | no raster images besides the 61kB Open Graph card                                                   |
| BRO-5985: JS growth hidden by a stale performance baseline                 | applies, partly done             | page-size guard added; a JS budget is not needed yet (8 small chunks, Lighthouse 98-99)             |
| BRO-4872 stop inlining data the homepage does not show                     | done by BRO-5959                 | homepage now renders one list with CSS order and content-visibility (Lighthouse home 82 to 98)      |
| BRO-5968 pages over 2MB, plus a guard                                      | ported                           | largest page today is 525kB; guard stops a regression                                               |
| self-host Inter (2026-09-29)                                               | already done                     | `next/font` serves Inter from this domain                                                           |
| BRO-3203 Next.js 15 / React 19 upgrade                                     | already done                     | site started on Next 15.5 and React 19                                                              |
| BRO-5592 / BRO-5565 stale tabs after a deploy (Skew Protection)            | applies, owner setting           | low traffic and few deploys, so low priority; Skew Protection is a Vercel project setting           |
| BRO-5811 traced data snapshot for runtime re-renders                       | does not apply                   | static export, no runtime rendering                                                                 |
| BRO-5529 each page's own link-preview card                                 | applies, handed to BRO-5960      | /methodology/ and /about/ had no og:image or twitter:image on 2026-10-22                            |
| BRO-5399 soft-404 and inherited canonical                                  | already done                     | every page sets its own canonical; the 404 page is noindex with no canonical                        |
| BRO-5967 review markup against Google's snippet policy                     | already done                     | no Review or AggregateRating markup by design (README)                                              |
| BRO-5978 ItemList items with wrong schema types                            | already done                     | ItemList items are plain ListItem with name and url                                                 |
| BRO-5970 doubled brand in titles, sitemap lastmod, links to redirects      | already done                     | no doubled titles; lastmod is each product's latest review date; no redirects                       |
| BRO-5969 thin pages in the sitemap                                         | covered by BRO-5960              | categories need 2+ products to be indexed; product thresholds are an SEO-plan call                  |
| BRO-4481 noindex on not-found states                                       | already done                     | 404 page is noindex                                                                                 |
| BRO-4395 Open Graph image small enough for WhatsApp                        | already done                     | 61kB PNG                                                                                            |
| security headers (CSP, frame, nosniff, referrer, permissions)              | ported                           | Vercel sent HSTS only                                                                               |
| BRO-4575 / BRO-4949 / BRO-3049 layout at 320-414px                         | ported                           | header overflowed at 320 and 360px; cards and footer were fine                                      |
| 44px touch targets (2026-10-18)                                            | ported                           | header links were 20px tall; inline text links are exempt                                           |
| BRO-5624 and 2026-10-16 visible keyboard focus                             | already done                     | every tab stop on the homepage shows a focus ring                                                   |
| BRO-4294 inputs under 16px zoom iOS                                        | does not apply                   | no text inputs                                                                                      |
| BRO-4881 tier chip explained to every reader                               | ported (label); popover deferred | screen-reader label added; a tap/keyboard popover needs a design call (title tooltip is mouse-only) |
| BRO-5812 copy voice rules and guard                                        | ported                           | src/ was clean; one product line fixed; quotes exempt                                               |
| BRO-5262 emailed links act only on POST                                    | does not apply                   | no email actions                                                                                    |
| BRO-4525 scrub OAuth tokens from analytics                                 | does not apply                   | no sign-in                                                                                          |

Counts: 28 items. 6 ported (one in part), 1 partly covered by the new page-size guard, 10 already
done (one of them by BRO-5959), 2 handed to the SEO session BRO-5960, 1 left as an owner setting,
8 do not apply.
