#!/bin/bash
# Weekly refresh, end to end: find new reviews and launches, verify every quote, score, build.
# Exits 0 with nothing changed when there is nothing new; non-zero if any check fails
# (the workflow then commits nothing). Needs GEMINI_API_KEY and OPENAI_API_KEY.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=.cache/refresh

node scripts/refresh.js "$@"
[ -s "$OUT/touched.txt" ] || { echo "nothing new"; exit 0; }
IDS=$(cat "$OUT/touched.txt")

# Quote check: a new review whose quote is missing (or whose page cannot be read) is dropped.
python3 scripts/verify-quotes.py "$IDS" > "$OUT/verify.txt" || true
cat "$OUT/verify.txt"
DROP=$(grep -E '^(MISS|BLOCKED)' "$OUT/verify.txt" | awk '{print $2}' | grep -Fxf "$OUT/added.txt" || true)
[ -z "$DROP" ] || python3 scripts/drop-reviews.py $DROP

# A product added by the refresh needs at least 6 reviews left, or it is removed again.
node -e "
const fs=require('fs');
let p=JSON.parse(fs.readFileSync('data/products.json'));
let r=JSON.parse(fs.readFileSync('data/reviews.json'));
const thin=p.filter(x=>x.autoAdded&&r.filter(y=>y.productId===x.id).length<6).map(x=>x.id);
if(thin.length){console.log('removing thin new products: '+thin);
fs.writeFileSync('data/products.json',JSON.stringify(p.filter(x=>!thin.includes(x.id)),null,2)+'\n');
fs.writeFileSync('data/reviews.json',JSON.stringify(r.filter(y=>!thin.includes(y.productId)),null,2)+'\n');}"

# Band-score whatever is new (two models read each review), then validate and build.
IDS=$(node -e "const p=new Set(JSON.parse(require('fs').readFileSync('data/products.json')).map(x=>x.id));console.log(require('fs').readFileSync('$OUT/touched.txt','utf8').split(',').filter(i=>p.has(i)).join(','))")
[ -z "$IDS" ] || node scripts/score-reviews.js --only="$IDS"
npm run build
node -e "
const r=JSON.parse(require('fs').readFileSync('data/reviews.json'));
const bad=r.filter(x=>!x.modelScores);
if(bad.length){console.error('reviews without two model scores: '+bad.map(x=>x.productId+'/'+x.outletId).join(', '));process.exit(1);}"
