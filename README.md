# Tech Scorecard

[![CI](https://github.com/thomaspryor/tech-scorecard/actions/workflows/ci.yml/badge.svg)](https://github.com/thomaspryor/tech-scorecard/actions/workflows/ci.yml)

A review aggregator for consumer tech, live at **https://www.thetechscorecard.com** (beta).
Each product gets one 0-100 critic score: a weighted average of professional reviews,
with every review quoted and linked to the original article.

It ports the scoring method of Broadway Scorecard, a sister site for theatre reviews, to
gadgets: same outlet tiers, same rating bands, same score labels.

## Architecture

```
data/*.json  ──►  scripts/validate-data.js  ──►  next build (static export)  ──►  out/  ──►  Vercel
     ▲                (npm prebuild)               src/lib/engine.ts computes
     │                                             every score at build time
research ─► import-product.js ─► verify-quotes.py ─► score-reviews.js
```

- **No server and no database.** The site is a Next.js 15 App Router project built with
  `output: 'export'`. Every page is static HTML generated at build time from the JSON files in
  `data/`. Vercel deploys each push to `main` in about a minute.
- **Data is the source of truth.** Scores are never stored per product; `src/lib/engine.ts`
  recomputes them from the reviews on every build, so a data fix shows up everywhere at once.
- **The data pipeline is offline.** Scripts in `scripts/` add products, check quotes against the
  live article and place scores. They run on a developer machine, not in the build.

```
src/
  app/            routes: home, /product/[slug], /category/[name], /best, /methodology, /about, /privacy
  components/     UI; product-cards/ holds the score badge, cards and device art
  config/         scoring constants (tiers, weights, thresholds), categories, SEO constants
  lib/            data loading, scoring engine, formatting, JSON-LD helpers
scripts/
  lib/            pure modules shared by the scripts and the tests
test/             Vitest unit tests
data/             products.json, reviews.json, outlets.json
docs/             PIPELINE.md (how to add products), SEO-PLAN.md, PORTING.md (carrying Broadway Scorecard fixes over), IMAGES.md (press photo terms per brand)
```

## Data model

Types live in `src/lib/data-types.ts`; the scripts reference the same types through JSDoc, and
`tsconfig.scripts.json` checks them.

| File                 | One record is                      | Key fields                                                                                                                                                                                                                         |
| -------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/products.json` | a product                          | `id`, `slug`, `category`, `releaseDate`, `launchPrice`, `criticsTake`, `loved[]`, `gripes[]`, `specs[]`, `art` (colors for the drawn device illustration)                                                                          |
| `data/reviews.json`  | one outlet's review of one product | `productId`, `outletId`, `url`, `date`, `rating` (as published, e.g. `"4.5/5"`, or `null`), `score` (0-100), `scoreSource` (`rating` or `text`), `excerpt` (verbatim, at most 45 words), `scoreBand`, `modelScores`, `scoreReason` |
| `data/outlets.json`  | a publication                      | `id`, `name`, `tier` (1-4), `domain`, `altDomains[]`                                                                                                                                                                               |

`scripts/lib/validate.js` enforces the rules that keep the data honest, and the build refuses
to run if any fail: unique ids and slugs, known categories, real calendar dates, https links
whose host belongs to the credited outlet, one review per outlet per product, integer scores
inside their rating band, and short verbatim excerpts.

## Scoring method

The site's [methodology page](https://www.thetechscorecard.com/methodology/) explains this for
readers. In code:

1. **A published rating is a band, not a point** (`scripts/lib/rating-band.js`). A rating's
   share of its scale picks the band: 90% of the scale and up maps to 91-100, 70-89% to 71-90,
   50-69% to 51-70, 30-49% to 31-50, and anything lower to 0-30. So 4.5/5 and 9/10 both land in 91-100, while 4/5 and 8/10 land
   in 71-90. A printed percentage such as "88%" is already a score and gets a narrow band
   (83-93).
2. **Two models place the review inside its band** (`scripts/score-reviews.js`). An OpenAI
   model and a Gemini model each read the full article and pick a score inside the band:
   near the top for an unreserved recommendation, near the bottom when the rating comes with
   major reservations. The review's score is their average, clamped to the band, so a model can
   never move a review outside what the outlet published. Using two models from different
   vendors reduces the effect of either one's quirks. Reviews without a rating are scored
   0-100 from the text the same way and labelled "Unrated, scored from text" on the site.
   The article goes into the prompt fenced as untrusted data, with an instruction to ignore
   anything in it that is not the reviewer's verdict, so a page cannot steer its own score.
   When the two placements differ by more than 15 points the review keeps the average but is
   marked `modelsDisagree`, and the run summary lists it for a human check. A person who reads the
   review can then record `adjudicatedScore` (inside the same band) with an `adjudicationReason`; it
   becomes the published score, the model scores are kept, and later runs do not overwrite it. Answers are cached
   in `.cache/` (gitignored) keyed by URL, rating, models and prompt.
3. **Outlets are weighted by tier** (`src/config/scoring.ts`): tier 1 counts 1.0, tier 2
   0.75, tier 3 0.4, tier 4 0.2. The product score is the weighted mean
   `sum(score × weight) / sum(weight)` (`computeCriticScore` in `src/lib/engine.ts`), shown
   once there are at least 5 reviews. It is stored unrounded and rounded once for display.
4. **The rounded score sets the label** (`src/config/score-buckets.ts`): Critical Gold 85+,
   Recommended 75-84, Worth a Look 65-74, Mixed 55-64, Critical Miss below 55.

## Running it

Requires Node 22 (`.nvmrc`). Python 3 is needed only for `verify-quotes.py`.

```sh
npm ci
npm run dev          # http://localhost:3000
npm run check        # typecheck + lint + formatting + unit tests
npm run format       # apply Prettier
npm run build        # validates data/, then writes the static site to out/
npx serve out        # preview the production build
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, the Prettier check, the unit tests and the
build on every push and pull request.

| Script                                                    | What it does                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run validate`                                        | Data checks only (also runs automatically before `build`)                             |
| `npm test`                                                | Vitest: rating bands, tier weights and boundaries, validator rules, importer merge    |
| `node scripts/import-product.js <file.json>...`           | Merge researched products into `data/`                                                |
| `python3 scripts/verify-quotes.py [id,...]`               | Fetch each review page and confirm the excerpt appears word for word                  |
| `node scripts/score-reviews.js --only=<id>`               | Place reviews inside their bands (needs `OPENAI_API_KEY`, `GEMINI_API_KEY`)           |
| `python3 scripts/drop-reviews.py <productId/outletId>...` | Remove reviews, e.g. after a failed quote check                                       |
| `bash scripts/refresh-pipeline.sh`                        | Weekly refresh: find new reviews and launches, verify, score, build (see PIPELINE.md) |

## Adding a product

The full process, including the research brief, is in [docs/PIPELINE.md](docs/PIPELINE.md).
In short:

1. Research the product into a JSON file shaped `{product, reviews, newOutlets}` from reviews
   that were opened and read. Never invent a quote, rating, author or date.
2. `node scripts/import-product.js research/<id>.json` merges it. The merged data is validated
   in memory first, so a bad file leaves `data/` untouched. A file shaped
   `{productId, reviews}` appends reviews to an existing product instead.
3. `python3 scripts/verify-quotes.py <id>`; fix or drop every MISS.
4. `node scripts/score-reviews.js --only=<id>`.
5. `npm run build`, commit, push. Vercel deploys `main`.

## Design decisions

- **Static export over a server.** The data changes a few times a week and every page is the
  same for every visitor, so there is nothing to compute per request. Static HTML is fast,
  cheap and has no runtime to break.
- **JSON in git over a database.** Every score change is a reviewable diff with a commit
  message, and the full history of a product's score is `git log -p data/reviews.json`.
- **Validation as a build gate.** The rules in `scripts/lib/validate.js` run before every build,
  locally and on Vercel, so bad data cannot deploy.
- **Interaction without JavaScript.** Category filters and sort toggles are radio inputs styled
  with CSS, and "show more reviews" is a `<details>` element, so pages work before or without
  hydration. Analytics is Vercel Web Analytics, which sets no cookies.
- **No `Review` or `AggregateRating` structured data.** Google's guidelines say not to mark up
  ratings aggregated from other sites, so product pages carry breadcrumb and `WebPage` JSON-LD
  only.
- **Plain JavaScript in `scripts/`.** The pipeline scripts run with plain `node`, with no build
  step. Their logic lives in small pure modules under `scripts/lib/`, typed with JSDoc against
  the TypeScript types, type-checked by `npm run typecheck` (`tsconfig.scripts.json`) and covered
  by the unit tests. The two networked scripts, `score-reviews.js` and `refresh.js`, are not yet
  under `checkJs`.

## Known limitations

- **Coverage is partial.** It is a beta with a few dozen products; some have fewer than 10
  reviews, which the product page labels as an early score.
- **Model placement is a judgement.** Placing a review inside its band is done by language
  models. The band limits how far that judgement can move a score, and each review keeps both
  models' scores and a one-line reason in `reviews.json` for audit, but it is not a human edit.
- **Tiers are editorial.** Outlet tiers are assigned by hand in `data/outlets.json`.
- **Article fetching is best effort.** `score-reviews.js` and `verify-quotes.py` fetch pages
  with curl; sites that block scripted requests fall back to the excerpt or need a manual check.
- **Static means stale until rebuilt.** Scores update when the data changes and the site is
  redeployed, not in real time.
- **`next lint` is deprecated** in Next.js 15.5. Moving to the ESLint CLI with a flat config is
  a planned upgrade.

## Content

Review excerpts are short quotations from the credited publications and link to the original
articles; they remain the property of their publishers. Full article text fetched for scoring
is cached locally only and never committed.
