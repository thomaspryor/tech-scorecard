# Tech Scorecard (proof of concept)

Professional tech reviews, combined into one score (beta). A light-theme port of the Broadway Scorecard
layout and scoring method to tech reviews, starting with three phones:
iPhone Duo, iPhone 18 Pro and Samsung Galaxy Z Fold 8.

## How it maps to Broadway Scorecard

| Broadway Scorecard | Tech Scorecard |
|---|---|
| `data/shows.json` | `data/products.json` |
| `data/reviews.json` | `data/reviews.json` (outlet, critic, url, date, published rating, 0-100 score, excerpt) |
| outlet tiers T1-T4 (1.0 / 0.75 / 0.4 / 0.2) | same weights, tech outlets (`data/outlets.json`) |
| Critical Gold 83+, Recommended 75+, Worth Seeing 65+, Mixed 55+ | same thresholds (`src/config/score-buckets.ts`) |
| `src/components/show-cards/` (ScoreBadge, ShowListCard, MiniShowCard, ScoreBreakdownBar, OutletTierChip) | `src/components/product-cards/` |
| `/show/[slug]` | `/product/[slug]` |

Scores: a published rating is a band, as on Broadway Scorecard (>= 90% of scale -> 91-100,
>= 70% -> 71-90, ...; scripts/lib/rating-band.js). Two models read the full review and place it
inside the band; the score is their average. Unrated reviews are scored 0-100 the same way and
labeled "Unrated, scored from text".
Every review links to the original article.

## Commands

```
npm install
npm run validate        # data checks (rating conversion, https urls, excerpt length, duplicates)
npm run build           # static export to out/
node scripts/import-product.js <file.json>  # add/replace a product: {product, reviews, newOutlets}
node scripts/score-reviews.js --only=<id>  # place each review inside its rating band (OpenAI + Gemini read the review)
python3 scripts/verify-quotes.py <id,...>   # every excerpt must appear word for word on its page
```

Review data was gathered in October 2026 from the outlets' own review pages; every quote was
re-checked word for word against the live page before import.
