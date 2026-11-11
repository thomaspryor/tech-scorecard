#!/bin/bash
# Daily refresh, end to end: find new reviews and launches, backfill gaps, verify every quote, score, build.
# Exits 0 with nothing changed when there is nothing new; non-zero if a check fails (the workflow then
# commits nothing). Single bad items are dropped instead, and listed in .cache/refresh/problems.txt
# when the workflow should alert after committing the rest. Needs GEMINI_API_KEY and OPENAI_API_KEY.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=.cache/refresh
# Pages the fetch services read earlier in a run are cached for that run (scripts/lib/fetch-ladder.js); start each run clean.
rm -rf .cache/fetch-ladder

# --backfill-only runs just the backfill and the checks after it (to try it by hand): bash scripts/refresh-pipeline.sh
# --backfill-only --category=tablet --max-backfill=1. Otherwise the normal refresh runs first, then the backfill.
BACKFILL_ARGS=()
if [ "${1:-}" = "--backfill-only" ]; then
  shift
  BACKFILL_ARGS=("$@")
  rm -rf "$OUT"
  mkdir -p "$OUT"
else
  # Outlets added since the last run get their RSS feeds looked up (saved in data/outlets.json);
  # on Mondays, outlets saved without one are tried again.
  if [ "$(date -u +%u)" = 1 ]; then node scripts/find-feeds.js --retry-empty; else node scripts/find-feeds.js; fi
  node scripts/refresh.js "$@"
fi

# Backfill: up to 3 older, well-reviewed products a day that the site is missing (thin categories first, then new
# categories; scripts/lib/backfill.js has the rules). Its products join touched.txt and added.txt, so they go through
# every check below like any new launch. It reports its own faults in problems.txt, so a crash here must not cost
# the refresh above: note it and carry on.
node scripts/refresh.js --backfill-only ${BACKFILL_ARGS[@]+"${BACKFILL_ARGS[@]}"} || echo "The backfill step crashed (see the run log)." >> "$OUT/problems.txt"
# Nothing new to check, but a photo found for an older product (or the state files) may have changed data/: validate it.
[ -s "$OUT/touched.txt" ] || { echo "nothing new"; npm run validate; exit 0; }
IDS=$(cat "$OUT/touched.txt")

# Quote check: a new review whose quote is missing (or whose page cannot be read) is dropped.
ADDED_FILE="$OUT/added.txt" python3 scripts/verify-quotes.py "$IDS" > "$OUT/verify.txt" || true
cat "$OUT/verify.txt"
# It exits non-zero when it finds a MISS, so check it got to the end (its last line is the counts).
tail -n 1 "$OUT/verify.txt" | grep -q '^{' || { echo "verify-quotes.py did not finish"; exit 1; }
DROP=$(grep -E '^(MISS|BLOCKED)' "$OUT/verify.txt" | awk '{print $2}' | grep -Fxf "$OUT/added.txt" || true)
[ -z "$DROP" ] || node scripts/drop-reviews.js $DROP

# A product added by the refresh needs MIN_REVIEWS_NEW_PRODUCT reviews left, or it is removed again.
node scripts/drop-thin-products.js

# Band-score whatever is new (two models read each review). A second pass asks again only for the
# model answers still missing (the rest come from the cache); new reviews that still lack one are dropped.
IDS=$(node -e "const p=new Set(JSON.parse(require('fs').readFileSync('data/products.json')).map(x=>x.id));console.log(require('fs').readFileSync('$OUT/touched.txt','utf8').split(',').filter(i=>p.has(i)).join(','))")
if [ -n "$IDS" ]; then
  node scripts/score-reviews.js --only="$IDS"
  node scripts/score-reviews.js --only="$IDS"
  node scripts/drop-unscored.js "$OUT/added.txt"
  node scripts/drop-thin-products.js
fi
npm run build
