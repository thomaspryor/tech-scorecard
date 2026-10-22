#!/usr/bin/env node
// Weekly refresh: find new reviews for products already on the site, and new launches.
// Uses Gemini with Google Search grounding to FIND candidate review URLs only. Everything
// that reaches data/ is read from the outlet's own page: rating, critic and date come from
// the page's JSON-LD, and the quote must appear word for word in the page text.
// A separate workflow step then runs verify-quotes.py and score-reviews.js, and only commits
// when those pass (see .github/workflows/weekly-refresh.yml).
//
// Usage: node scripts/refresh.js [--max-products=15] [--max-new=2] [--only=id,id] [--no-launches] [--dry-run]
// Needs GEMINI_API_KEY (search + excerpt picking) and OPENAI_API_KEY (copy for new products).
// Writes files in .cache/refresh/ in the import-product.js shapes and imports them unless --dry-run.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(ROOT, '.cache', 'refresh');
const STATE_FILE = path.join(DATA, 'refresh-state.json');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const GEMINI_MODEL = 'gemini-3.1-pro-preview';
const OPENAI_MODEL = 'gpt-5.4';
const TODAY = new Date().toISOString().slice(0, 10);
const CATEGORIES = require('../src/config/categories.json');
const MIN_REVIEWS_NEW_PRODUCT = 6;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const MAX_PRODUCTS = Number(args['max-products'] || 15);
const MAX_NEW = Number(args['max-new'] ?? 2);
const only = args.only ? new Set(String(args.only).split(',')) : null;

const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const products = load('products.json');
const reviews = load('reviews.json');
const outlets = load('outlets.json');
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};

function curl(argv, input, timeout = 90) {
  try {
    return execFileSync('curl', ['-sL', '-m', String(timeout), ...argv], {
      input,
      maxBuffer: 64 * 1024 * 1024,
      encoding: 'utf8',
    });
  } catch (e) {
    // The failed command line holds API keys: report only the exit code.
    throw new Error(`curl exit ${e.status}`);
  }
}

function gemini(prompt, { search = false } = {}) {
  const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } };
  if (search) body.tools = [{ google_search: {} }];
  else body.generationConfig.responseMimeType = 'application/json';
  const out = JSON.parse(
    curl(
      [
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        '-H',
        'Content-Type: application/json',
        '-H',
        `x-goog-api-key: ${process.env.GEMINI_API_KEY}`,
        '-d',
        '@-',
      ],
      JSON.stringify(body),
      240,
    ),
  );
  if (out.error) throw new Error(`gemini: ${out.error.message}`);
  return (out.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
}

function openai(prompt) {
  const req = JSON.stringify({
    model: OPENAI_MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });
  const out = JSON.parse(
    curl(
      [
        'https://api.openai.com/v1/chat/completions',
        '-H',
        'Content-Type: application/json',
        '-H',
        `Authorization: Bearer ${process.env.OPENAI_API_KEY}`,
        '-d',
        '@-',
      ],
      req,
    ),
  );
  if (out.error) throw new Error(`openai: ${out.error.message}`);
  return out.choices?.[0]?.message?.content || '';
}

function parseJson(s, open = '{', close = '}') {
  const a = String(s || '').indexOf(open);
  const b = String(s || '').lastIndexOf(close);
  if (a < 0 || b < a) return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
}

// Same normalization as scripts/verify-quotes.py, so a quote that passes here passes there.
const QUOTES = { '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-' };
function norm(s) {
  let t = String(s).normalize('NFKC');
  for (const [a, b] of Object.entries(QUOTES)) t = t.split(a).join(b);
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
}
function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;|&#x27;|&#39;/g, "'")
    .replace(/&quot;|&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&#8212;|&mdash;/g, '-');
}

/** Page text for quote checking (body only, like verify-quotes.py) and for reading. */
function pageText(html) {
  const body = html
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(p|div|br|li|h[1-6]|section|article|blockquote|figure|figcaption|td|tr)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  return decode(body).replace(/\s+/g, ' ').trim();
}

/** Rating, author and date from the page's own JSON-LD. Never guessed. */
function jsonLd(html) {
  const found = {};
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const rr = n.reviewRating || (n['@type'] === 'Rating' ? n : null);
    if (rr && rr.ratingValue != null && !found.rating) {
      const v = parseFloat(rr.ratingValue);
      const best = parseFloat(rr.bestRating ?? 5);
      if (Number.isFinite(v) && best > 0 && v <= best) found.rating = `${v}/${best}`;
    }
    const author = n.author;
    if (author && !found.critic) {
      const a = Array.isArray(author) ? author[0] : author;
      const name = typeof a === 'string' ? a : a?.name;
      if (name && name.length < 60) found.critic = name;
    }
    if (n.datePublished && !found.date) found.date = String(n.datePublished).slice(0, 10);
    Object.values(n).forEach(walk);
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()));
    } catch {
      /* malformed block */
    }
  }
  return found;
}

/** Reviews usually publish a week or two before the on-sale date. */
const daysBefore = (iso, n) => new Date(Date.parse(iso) - n * 864e5).toISOString().slice(0, 10);

const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const outletForUrl = (u) =>
  outlets.find((o) => [o.domain, ...(o.altDomains || [])].some((d) => hostOf(u) === d || hostOf(u).endsWith(`.${d}`)));

/** Ask Gemini (with Google Search) for review URLs for one product on outlets we know. */
function findReviewUrls(product, skipOutletIds) {
  const list = outlets
    .filter((o) => !skipOutletIds.has(o.id))
    .map((o) => `${o.name} (${o.domain})`)
    .join(', ');
  const text = gemini(
    `Find professional written reviews of the ${product.name} (${product.brand}, on sale ${product.releaseDate}) on these outlets: ${list}.
Only full reviews with a verdict. Skip hands-on, first-look, news, comparison, video-only and roundup pages, and reviews of other models.
Search for them and return only URLs you actually saw in search results. Reply with a JSON array only: [{"url":"https://..."}]`,
    { search: true },
  );
  return (parseJson(text, '[', ']') || [])
    .map((x) => resolveRedirect(x.url))
    .filter((u) => typeof u === 'string' && /^https:\/\//.test(u));
}

/** Search grounding sometimes answers with vertexaisearch redirect links: follow them to the real page. */
function resolveRedirect(u) {
  if (typeof u !== 'string' || !u.includes('grounding-api-redirect')) return u;
  try {
    return curl(['-o', '/dev/null', '-A', UA, '-w', '%{url_effective}', u], undefined, 30);
  } catch {
    return null;
  }
}

/** Turn one candidate URL into a review object, or null with a reason. */
function buildReview(product, url) {
  const outlet = outletForUrl(url);
  if (!outlet) return { skip: 'outlet not in data/outlets.json' };
  let html;
  try {
    html = curl(['-f', '-A', UA, url]);
  } catch {
    return { skip: 'page not readable (blocked or missing)' };
  }
  const text = pageText(html);
  if (text.length < 1500) return { skip: 'page too short' };
  const ld = jsonLd(html);
  if (!ld.date || ld.date > TODAY || ld.date < daysBefore(product.releaseDate, 21))
    return { skip: `date ${ld.date || 'missing'} outside launch..today` };
  const answer = parseJson(
    gemini(`You help a review aggregator. Product: ${product.name} (${product.brand}).
Decide whether the ARTICLE below is a full professional review of exactly this product with a final verdict (not hands-on, first impressions, news, a comparison or a review of a sibling model).
If it is, copy ONE complete sentence from the article that best sums up the reviewer's verdict, character for character (max 40 words, no ellipses, no edits).
Reply JSON only: {"fullReview": true|false, "excerpt": "<verbatim sentence or empty>"}

ARTICLE:
${text.slice(0, 30000)}`),
  );
  if (!answer || !answer.fullReview) return { skip: 'not a full review of this product' };
  const excerpt = String(answer.excerpt || '').trim();
  const words = excerpt.split(/\s+/).length;
  if (!excerpt || words > 40 || words < 5) return { skip: 'no usable excerpt' };
  if (!norm(text).includes(norm(excerpt).replace(/[.!?…]+$/, ''))) return { skip: 'excerpt not found word for word' };
  return {
    review: {
      productId: product.id,
      outletId: outlet.id,
      critic: ld.critic || null,
      url,
      date: ld.date,
      rating: ld.rating || null,
      score: 70,
      scoreSource: ld.rating ? 'rating' : 'text',
      excerpt,
    },
  };
}

function collectReviews(product, existing) {
  const have = new Set(existing.map((r) => r.outletId));
  const urls = findReviewUrls(product, have);
  const out = [];
  for (const url of [...new Set(urls)]) {
    const outlet = outletForUrl(url);
    if (!outlet || have.has(outlet.id)) continue;
    const res = buildReview(product, url);
    if (res.review) {
      out.push(res.review);
      have.add(outlet.id);
      console.log(`  + ${outlet.id} ${res.review.rating || 'unrated'}`);
    } else console.log(`  - ${url.slice(0, 90)}: ${res.skip}`);
  }
  return out;
}

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** New launches: find them, collect reviews, and only keep products that reach the review minimum. */
function newLaunches() {
  const known = products.map((p) => p.name).join('; ');
  const text = gemini(
    `Today is ${TODAY}. Using search, list up to 6 consumer gadgets that went on sale in the US within the last 45 days and already have several professional reviews from major tech outlets.
Categories allowed: ${CATEGORIES.categories.join(', ')}. Skip anything already on this list: ${known}.
Reply with a JSON array only: [{"name":"","brand":"","category":"","releaseDate":"YYYY-MM-DD","launchPrice":<USD number>,"officialUrl":"https://..."}]. Use only facts you saw in search results.`,
    { search: true },
  );
  const found = (parseJson(text, '[', ']') || []).filter(
    (c) =>
      c.name &&
      CATEGORIES.categories.includes(c.category) &&
      /^\d{4}-\d{2}-\d{2}$/.test(c.releaseDate) &&
      c.releaseDate <= TODAY &&
      Number.isFinite(c.launchPrice) &&
      /^https:\/\//.test(c.officialUrl || ''),
  );
  const made = [];
  for (const c of found) {
    if (made.length >= MAX_NEW) break;
    const id = slug(c.name);
    if (products.some((p) => p.id === id || p.name.toLowerCase() === c.name.toLowerCase())) continue;
    console.log(`new launch candidate: ${c.name}`);
    try {
      curl(['-f', '-o', '/dev/null', '-A', UA, c.officialUrl]);
    } catch {
      console.log('  official page not readable, skipped');
      continue;
    }
    const probe = { ...c, id };
    const revs = collectReviews(probe, []);
    if (revs.length < MIN_REVIEWS_NEW_PRODUCT) {
      console.log(`  only ${revs.length} verified reviews, need ${MIN_REVIEWS_NEW_PRODUCT}`);
      continue;
    }
    const texts = revs
      .slice(0, 8)
      .map((r) => `SOURCE ${r.outletId}: ${pageText(curl(['-f', '-A', UA, r.url])).slice(0, 6000)}`)
      .join('\n\n');
    const copy = parseJson(
      openai(`Write the summary card for ${c.name} (${c.brand}) using ONLY facts stated in the review texts below. Never add a spec, price or claim that is not in the texts. No em dashes. No "not X but Y" phrasing, no hype words.
Return JSON: {"criticsTake": "2-3 plain sentences on the critical consensus", "loved": [3-4 short strings], "gripes": [3-5 short strings], "specs": [{"label":"","value":""} 7-9 items a buyer of this category cares about, each stated in the texts, plus {"label":"Price","value":"From $${c.launchPrice}"}]}

${texts}`),
    );
    if (!copy || !copy.criticsTake || !Array.isArray(copy.specs) || copy.specs.length < 5) {
      console.log('  could not write the card, skipped');
      continue;
    }
    const kind = { foldable: 'foldable', wearable: 'glasses' }[c.category] || c.category;
    const product = {
      id,
      slug: id,
      name: c.name,
      brand: c.brand,
      category: c.category,
      releaseDate: c.releaseDate,
      launchPrice: c.launchPrice,
      officialUrl: c.officialUrl,
      criticsTake: copy.criticsTake,
      loved: copy.loved,
      gripes: copy.gripes,
      specs: copy.specs,
      art: { kind, body: '#3a3d46', accent: '#8aa4d8', backdrop: ['#f4f6fb', '#e3e8f3'] },
      autoAdded: TODAY,
    };
    made.push({ product, reviews: revs, newOutlets: [] });
  }
  return made;
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const files = [];
  // 1. New reviews for existing products: newest and least recently checked first.
  const recent = (p) =>
    TODAY.localeCompare(p.releaseDate) < 0
      ? 0
      : Math.max(0, 1 - (Date.parse(TODAY) - Date.parse(p.releaseDate)) / (365 * 864e5));
  const queue = products
    .filter((p) => !only || only.has(p.id))
    .sort((a, b) => (state[a.id] || '').localeCompare(state[b.id] || '') || recent(b) - recent(a))
    .slice(0, MAX_PRODUCTS);
  for (const p of queue) {
    console.log(`checking ${p.id}`);
    let revs = [];
    try {
      revs = collectReviews(
        p,
        reviews.filter((r) => r.productId === p.id),
      );
    } catch (e) {
      console.error(`  failed: ${e.message.slice(0, 160)}`);
      continue;
    }
    state[p.id] = TODAY;
    if (revs.length) {
      const f = path.join(OUT, `append-${p.id}.json`);
      fs.writeFileSync(f, JSON.stringify({ productId: p.id, reviews: revs }, null, 2));
      files.push(f);
    }
  }
  // 2. New launches.
  if (!args['no-launches'] && !only) {
    try {
      for (const m of newLaunches()) {
        const f = path.join(OUT, `new-${m.product.id}.json`);
        fs.writeFileSync(f, JSON.stringify(m, null, 2));
        files.push(f);
      }
    } catch (e) {
      console.error(`launch search failed: ${e.message.slice(0, 160)}`);
    }
  }
  console.log(`\n${files.length} import file(s)`);
  if (args['dry-run'] || !files.length) {
    if (!args['dry-run']) fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
    return;
  }
  execFileSync('node', [path.join(__dirname, 'import-product.js'), ...files], { stdio: 'inherit' });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
  // What the later steps should check and score: product ids, and the exact reviews added.
  const parsed = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  fs.writeFileSync(
    path.join(OUT, 'touched.txt'),
    [...new Set(parsed.map((m) => m.productId || m.product.id))].join(','),
  );
  fs.writeFileSync(
    path.join(OUT, 'added.txt'),
    parsed.flatMap((m) => m.reviews.map((r) => `${m.productId || m.product.id}/${r.outletId}`)).join('\n') + '\n',
  );
}

main();
