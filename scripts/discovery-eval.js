#!/usr/bin/env node
// Read-only check of the outlet search (scripts/lib/discovery.js) against reviews already on the site: for products with many
// reviews, search the major outlets that reviewed them and count how often the stored review is among the pages the search
// keeps (recall), and how often a kept page is a review of another product on the site (wrong pages that the page checks must
// then catch). Writes nothing to data/ (only the run's search cache under .cache/). Costs 1 to 3 ScrapingDog searches per outlet checked.
// Usage: node scripts/discovery-eval.js [--products=8] [--outlets=6]
const { loadData } = require('./lib/data-files');
const { urlKey } = require('./lib/launches');
const discovery = require('./lib/discovery');

/** @type {Record<string, string>} */
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const N_PRODUCTS = Number(args.products || 8);
const N_OUTLETS = Number(args.outlets || 6);

async function main() {
  if (!discovery.available()) throw new Error('SCRAPINGDOG_API_KEY is not set');
  const { products, reviews, outlets } = loadData();
  const byOutlet = new Map(outlets.map((o) => [o.id, o]));
  /** urlKey -> product id, for every stored review. */
  const owner = new Map(reviews.map((r) => [urlKey(r.url), r.productId]));
  // Spread over categories: the best-covered product of each category in turn.
  const ranked = [...products].sort(
    (a, b) => reviews.filter((r) => r.productId === b.id).length - reviews.filter((r) => r.productId === a.id).length,
  );
  /** @type {typeof products} */
  const picked = [];
  const cats = new Set();
  for (const p of ranked)
    if (picked.length < N_PRODUCTS && !cats.has(p.category)) (picked.push(p), cats.add(p.category));
  let checked = 0;
  let found = 0;
  let wrong = 0;
  let kept = 0;
  for (const p of picked) {
    const theirs = reviews
      .filter((r) => r.productId === p.id && (byOutlet.get(r.outletId)?.tier ?? 9) <= 2)
      .slice(0, N_OUTLETS);
    let hits = 0;
    for (const r of theirs) {
      const outlet = byOutlet.get(r.outletId);
      if (!outlet) continue;
      const res = await discovery.findByOutletSearch(p, [outlet], {
        skip: new Set(),
        maxTier: 4,
        maxQueries: 3,
        runLimit: Number(process.env.SERP_CAP || 400),
        others: products,
      });
      if (!res.searchedIds.length) continue;
      checked++;
      kept += res.urls.length;
      if (res.urls.some((u) => urlKey(u) === urlKey(r.url))) (found++, hits++);
      wrong += res.urls.filter((u) => owner.has(urlKey(u)) && owner.get(urlKey(u)) !== p.id).length;
    }
    console.log(`${p.id} (${p.category}): stored review found on ${hits} of ${theirs.length} outlets`);
  }
  console.log(
    `\nrecall: ${found}/${checked} (${checked ? Math.round((100 * found) / checked) : 0}%), ${kept} pages kept, ${wrong} of them reviews of another product on the site`,
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
