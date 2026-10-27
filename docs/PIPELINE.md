# Adding products and reviews (the pipeline)

Every product on the site goes through these steps. Do not skip any: the site's
credibility rests on every quote and score being traceable to a real review.

1. **Research** (one subagent per product; Sonnet is fine). Brief: "Research brief" below.
   Output: `{product, reviews, newOutlets}` JSON. Gap-fill passes for missing outlets
   use `{productId, reviews}` (append mode).
2. **Import**: `node scripts/import-product.js <file.json> [...]` (validates the merged data in memory and writes nothing if it fails).
3. **Verify quotes**: `python3 scripts/verify-quotes.py <id,id>`. Every MISS must be fixed or the
   review dropped. BLOCKED pages (403/429/timeouts) need a second check (WebFetch) or drop.
4. **Score**: `node scripts/score-reviews.js --only=<id>` (needs OPENAI_API_KEY + GEMINI_API_KEY).
   For many products run one `--dry-run --only=<id>` per product in parallel to warm
   `.cache/scores`, then one plain `node scripts/score-reviews.js` to write everything.
5. **Photo (optional)**: run `node scripts/add-product-image.js` with a photo from the brand's own newsroom or product page (see `docs/IMAGES.md`). Without one the site shows a plain brand tile.
6. **Build + push**: `npm run build` (prebuild runs validate-data), push main; Vercel deploys in ~1 min.
   Verify on https://www.thetechscorecard.com.

Lessons from the first 30 products (2026-10-22):

- Subagent WebSearch budgets run out; tell researchers to guess outlet URLs directly
  (curl + JSON-LD `ratingValue`/`bestRating`/`author`/`datePublished`) and to use WebSearch sparingly.
  A second gap-fill pass for The Verge, CNET, Wired, PCMag, ZDNET, Mashable, Engadget, Tom's Guide,
  TechRadar, Gizmodo and Digital Trends roughly doubles big-outlet coverage.
- Researchers occasionally return quotes that are not on the page. verify-quotes catches them; drop them.
- Skip hands-on/first-look pieces, video-only reviews, non-English editions and reviews of sibling models
  (joint reviews are fine with a `note`).

## Daily refresh (automatic)

`.github/workflows/weekly-refresh.yml` runs every day at 09:17 UTC (and on demand from the Actions tab) and calls
`scripts/refresh-pipeline.sh`:

0. `scripts/find-feeds.js` looks up the RSS/Atom feed of any outlet added since the last run and saves it as
   `feeds` in `data/outlets.json` (`[]` when it has none; `--all` looks every outlet up again).
1. `scripts/refresh.js` reads every outlet feed first. A review headline from the last 14 days that names a
   product on the site (`scripts/lib/feeds.js`) sends that page to the checks below, whichever product it is.
   Headlines that name no product are passed to the launch search as leads. Then it asks Gemini (with Google
   Search) for review URLs: products released in the last 45 days first, then the least recently checked,
   15 a run. Every candidate page, from a feed or from search, is read by the script itself: rating, critic and date come from the page's JSON-LD, and the quote must
   appear word for word in the page text. Only outlets in `data/outlets.json` are accepted. It also looks
   for launches from the last 45 days and adds one only when 6 or more reviews pass these checks
   (card text is written from the review texts only, with `autoAdded` set on the product).
   A candidate is skipped when it matches a product already on the site (same name with or without the
   brand, "+" spelled out so S26 and S26+ stay apart) or when at least half of its reviews are pages already on the site.
   The card must pass the copy rules (`scripts/lib/copy-voice.js`); a card that breaks them is asked for once more.
   Each import file is validated on its own, so one bad file is rejected without losing the rest.
2. `verify-quotes.py` re-checks every new quote; a MISS or unreadable page drops that review.
3. `score-reviews.js` band-scores everything new (OpenAI + Gemini), twice so a missing model answer is
   asked again. A new review still without two model scores is dropped (`drop-unscored.js`) and found
   again next run; a new product left under 6 reviews is removed (`drop-thin-products.js`).
4. `npm run build` validates the data, copy rules included. The workflow commits `data/` to main only if it passed.
5. Anything that went wrong (a failed launch search, more than a third of product searches failing, a
   rejected import, or a failed run) opens or updates a GitHub issue labelled `refresh-failed`, which
   emails the owner. The next clean run closes it.

Needs repo secrets `OPENAI_API_KEY` and `GEMINI_API_KEY`. `data/refresh-state.json` remembers when each
product was last checked, so each run covers the least recently checked products first.
Local dry run: `node scripts/refresh.js --only=<id> --dry-run`.

---

# Research brief (give this to each research subagent)

Tech Scorecard aggregates professional reviews into one tier-weighted 0-100 critic score (like Rotten Tomatoes/Metacritic). Use today's date when judging what is new. REAL data only: never invent a quote, rating, author, date, price or spec. Use WebSearch (mode "extended" when needed) and WebFetch (or `curl -sL -A "<browser UA>"` + read JSON-LD when WebFetch fails) to open each review page.

Existing files for reference (read them, do not edit): /home/user/tech-scorecard/data/products.json (shape of a product), data/reviews.json (shape of a review), data/outlets.json (outlet ids + tiers).

## Collect 12-18 professional reviews of the product

Prioritize: The Verge, Wired, CNET, Engadget, WSJ, Tom's Guide, TechRadar, PCMag, ZDNET, Mashable, Gizmodo, Digital Trends, Android Central / 9to5Mac / 9to5Google / Macworld, Trusted Reviews, Tech Advisor, Expert Reviews, GSMArena, Pocket-lint, Stuff, T3, What Hi-Fi?, Notebookcheck. Only include a review if you opened the outlet's page (or the outlet's own RSS/JSON-LD). Skip video-only reviews. If an outlet reviewed two models jointly with one score, include it with a "note". If the score is clearly for a sibling model, add note "Joint review of X and Y; the outlet's score is published for Y."

Each review object (exact keys):
{"productId": "<id>", "outletId": "<id from outlets.json, or a new id>", "critic": "Name" or null, "url": "https://...", "date": "YYYY-MM-DD", "rating": "4.5/5" | "8/10" | "90%" | null, "score": int, "scoreSource": "rating"|"text", "excerpt": "verbatim sentence, aim for 40 words or fewer (the validator rejects over 45 or under 3)", "editorsChoice": true (only if the page shows the award; else omit), "note": "..." (optional)}

- rating is the outlet's own published score, written as "a/b" or "NN%". score = round(a/b\*100). Unrated: rating null, scoreSource "text", score = your estimate of the verdict (90+ rave, 80-89 very positive, 70-79 positive with caveats, 60-69 mixed-positive, 50-59 mixed, <50 negative).
- url host must be the outlet's own domain.

## Product object (exact keys)

{"id","slug" (same as id),"name","brand","category": one of "phone", "foldable", "tablet", "laptop", "headphones", "watch", "console", "wearable","releaseDate":"YYYY-MM-DD" (US on-sale date),"launchPrice": number (USD base model),"officialUrl": manufacturer product page you opened,
"criticsTake": 2-3 plain sentences summarizing the critical consensus (no em dashes, no "not X but Y", no hype words),
"loved": 3-4 short strings, "gripes": 3-5 short strings (things several reviewers said),
"specs": [{"label","value"}] 7-9 items: the 7-9 specs a buyer of this category cares about (e.g. laptop: Display, Chip, Memory, Storage, Battery life, Weight, Ports, Price),
"art": {"kind": same as category (use "foldable" for book folds, "flip" for clamshells, "earbuds" for in-ear audio, "glasses" for smart glasses, "headset" for VR/AR headsets), "body": "<hex of a real launch color>", "accent": "<hex screen color>", "backdrop": ["<very light hex>", "<light hex>"]}}

## Output

Write ONE file: research/<id>.json (gitignored scratch folder) containing
{"product": {...}, "reviews": [...], "newOutlets": [{"id","name","tier": 1-4,"domain"}], "sourceNotes": ["how each review was verified, one line each"]}
Tiers: 1 = major national outlets with full-time reviews staff (Verge, WSJ, CNET, Engadget, Wired, NYT); 2 = large tech publications (Tom's Guide, TechRadar, PCMag, ZDNET, Digital Trends, Mashable, Gizmodo, CNN, Guardian...); 3 = specialist + general-interest (GSMArena, Pocket-lint, Notebookcheck, Daily Mail...); 4 = blogs/small.
Then validate: `python3 -c "import json;d=json.load(open('<file>'));print(len(d['reviews']))"`.
Final reply to me: under 80 words: product name, release date, price, number of reviews, any problems. Do not paste the JSON.

## Extra rules for this batch

- Category-appropriate outlets are fine (e.g. RTINGS, SoundGuys and What Hi-Fi? for audio; IGN, GameSpot, Eurogamer and Digital Foundry for consoles; Laptop Mag, Notebookcheck and Tom's Hardware for laptops; DC Rainmaker for watches; UploadVR and Road to VR for headsets). Add any outlet not in outlets.json to newOutlets with a sensible tier.
- Product pages from the outlet only; skip "hands-on", "first look" and video-only pieces. A review must give a final verdict.
- If the product as named does not exist or has fewer than 6 published reviews, pick the closest widely reviewed real product (e.g. the prior generation) and say so in your final reply.
- Never use a review dated after today.
