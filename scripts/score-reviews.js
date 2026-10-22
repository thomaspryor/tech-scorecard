#!/usr/bin/env node
// Place every review inside its rating band by reading the review, like
// Broadway Scorecard. Two models (OpenAI + Gemini) each read the article and
// pick a score inside the band; the published score is their average, clamped.
// Unrated reviews get the full 0-100 range.
//
// Usage: node scripts/score-reviews.js [--only=id,id] [--limit=N] [--dry-run] [--force]
// Needs OPENAI_API_KEY and GEMINI_API_KEY. Article text is cached in .cache/
// (gitignored, never committed: review text is the outlets' copyright).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { ratingToBand } = require('./lib/rating-band');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CACHE = path.join(ROOT, '.cache', 'review-text');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const OPENAI_MODEL = 'gpt-5.4';
const GEMINI_MODEL = 'gemini-3.1-pro-preview';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const only = args.only ? new Set(String(args.only).split(',')) : null;

function curl(argv, input) {
  return execFileSync('curl', ['-sL', '-m', '90', ...argv], { input, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });
}

/** Article paragraphs as plain text (multi-page GSMArena reviews are joined). Cached per URL. */
function articleText(url) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, crypto.createHash('md5').update(url).digest('hex') + '.txt');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const pages = [url];
  if (/gsmarena\.com/.test(url) && !/p\d+\.php$/.test(url)) for (let n = 2; n <= 9; n++) pages.push(url.replace('.php', `p${n}.php`));
  let text = '';
  for (const u of pages) {
    let html = '';
    try { html = curl(['-A', UA, u]); } catch { continue; }
    html = html.replace(/<(script|style|noscript|nav|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');
    const paras = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, "'").replace(/&quot;|&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"').replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 40);
    if (pages.length > 1 && paras.length === 0 && u !== url) break;
    text += paras.join('\n') + '\n';
  }
  fs.writeFileSync(file, text);
  return text;
}

function prompt(r, product, outlet, band, text) {
  const rated = !!r.rating;
  const head = `You score one professional tech review for a review aggregator.
Product: ${product.name} (${product.brand}). Outlet: ${outlet.name}.
${rated
    ? `The outlet's own published rating is ${r.rating}. On our 0-100 scale that rating means a score from ${band.floor} to ${band.ceiling}. Read the review and decide where inside that band it belongs:
- near ${band.ceiling}: an unreserved recommendation at that rating level, the reviewer is enthusiastic
- the middle: clear praise with the usual caveats
- near ${band.floor}: the rating comes with major reservations, or the reviewer tells many readers to skip or wait`
    : `The outlet publishes no rating. Score the reviewer's overall verdict from 0 to 100: 90+ rave, 80-89 very positive, 70-79 positive with caveats, 60-69 mixed-positive, 50-59 mixed, below 50 negative.`}
Judge the verdict on this product only, not on rivals mentioned in passing.
Return JSON only: {"score": <integer ${band.floor}-${band.ceiling}>, "reason": "<under 20 words, plain English, no quotes from the review>"}`;
  const body = text.length > 800 ? text.slice(-24000) : `(Full article unavailable. Verdict excerpt: "${r.excerpt}")`;
  return `${head}\n\nREVIEW TEXT:\n${body}`;
}

function parseJson(s) {
  const m = String(s || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { const o = JSON.parse(m[0]); return Number.isFinite(o.score) ? o : null; } catch { return null; }
}

function askOpenAI(p) {
  const req = JSON.stringify({ model: OPENAI_MODEL, messages: [{ role: 'user', content: p }], response_format: { type: 'json_object' } });
  const out = JSON.parse(curl(['https://api.openai.com/v1/chat/completions', '-H', 'Content-Type: application/json', '-H', `Authorization: Bearer ${process.env.OPENAI_API_KEY}`, '-d', '@-'], req));
  if (out.error) throw new Error(`openai: ${out.error.message}`);
  return parseJson(out.choices?.[0]?.message?.content);
}

function askGemini(p) {
  const req = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: p }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } });
  const out = JSON.parse(curl([`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, '-H', 'Content-Type: application/json', '-d', '@-'], req));
  if (out.error) throw new Error(`gemini: ${out.error.message}`);
  return parseJson((out.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join(''));
}

const clamp = (v, b) => Math.min(b.ceiling, Math.max(b.floor, Math.round(v)));

async function main() {
  const products = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(DATA, 'products.json'), 'utf8')).map((p) => [p.id, p]));
  const outlets = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(DATA, 'outlets.json'), 'utf8')).map((o) => [o.id, o]));
  const reviews = JSON.parse(fs.readFileSync(path.join(DATA, 'reviews.json'), 'utf8'));
  let todo = reviews.filter((r) => (!only || only.has(r.productId)) && (args.force || !r.modelScores));
  if (args.limit) todo = todo.slice(0, Number(args.limit));
  console.log(`scoring ${todo.length} reviews${args['dry-run'] ? ' (dry run)' : ''}`);
  const changes = [];
  for (const r of todo) {
    const band = r.rating ? ratingToBand(r.rating) : { floor: 0, ceiling: 100 };
    if (!band) { console.error(`skip ${r.productId}/${r.outletId}: unparseable rating ${r.rating}`); continue; }
    const text = articleText(r.url);
    const p = prompt(r, products[r.productId], outlets[r.outletId], band, text);
    const got = {};
    for (const [name, fn] of [['openai', askOpenAI], ['gemini', askGemini]]) {
      try { const o = fn(p); if (o) got[name] = { score: clamp(o.score, band), reason: o.reason }; } catch (e) { console.error(`  ${name} failed: ${e.message.slice(0, 120)}`); }
    }
    const vals = Object.values(got).map((g) => g.score);
    if (!vals.length) { console.error(`skip ${r.productId}/${r.outletId}: no model answered`); continue; }
    const score = clamp(vals.reduce((a, b) => a + b, 0) / vals.length, band);
    changes.push({ id: `${r.productId}/${r.outletId}`, rating: r.rating, before: r.score, after: score, models: vals, textChars: text.length });
    console.log(`${r.productId}/${r.outletId} ${r.rating || 'unrated'} band ${band.floor}-${band.ceiling}: ${r.score} -> ${score} (${Object.entries(got).map(([k, g]) => `${k} ${g.score}`).join(', ')}; text ${text.length} chars)`);
    if (!args['dry-run']) {
      r.score = score;
      r.scoreBand = [band.floor, band.ceiling];
      r.modelScores = Object.fromEntries(Object.entries(got).map(([k, g]) => [k, g.score]));
      r.scoreReason = (got.openai || got.gemini).reason;
      r.scoredFromFullText = text.length > 800;
      fs.writeFileSync(path.join(DATA, 'reviews.json'), JSON.stringify(reviews, null, 2) + '\n'); // checkpoint every review
    }
  }
  const moved = changes.filter((c) => c.before !== c.after);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  console.log(`\n${changes.length} scored, ${moved.length} changed; mean ${mean(changes.map((c) => c.before)).toFixed(1)} -> ${mean(changes.map((c) => c.after)).toFixed(1)}`);
}

main();
