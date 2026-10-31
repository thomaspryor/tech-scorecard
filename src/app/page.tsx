import Link from 'next/link';
import type { Metadata } from 'next';
import { bestYear, getAllProducts, getLatestReviews, getTotals, indexableCategories, isScored } from '@/lib/data';
import { MiniProductCard, ProductListCard } from '@/components/product-cards';
import { Logo } from '@/components/Header';
import { ListSort } from '@/components/ListSort';
import { CATEGORY_ORDER, CATEGORY_PLURAL, formatDate } from '@/lib/format';

export const metadata: Metadata = { alternates: { canonical: '/' } };

export default function HomePage() {
  const products = getAllProducts();
  const totals = getTotals();
  // Filters come from the categories that exist; the CSS for each is generated
  // so a new category needs no stylesheet edit.
  const present = CATEGORY_ORDER.filter((c) => products.some((p) => p.category === c));
  const filters = [{ id: 'all', label: 'All' }, ...present.map((c) => ({ id: c, label: CATEGORY_PLURAL[c] }))];
  const filterCss = present
    .map(
      (c) =>
        `.f-${c}:checked ~ .filter-labels .lbl-${c}{background:var(--ink);border-color:var(--ink);color:#fff}` +
        `.f-${c}:focus-visible ~ .filter-labels .lbl-${c}{outline:2px solid var(--brand-ink);outline-offset:2px}` +
        `.f-${c}:checked ~ .cat-list > :not([data-cat='${c}']){display:none}`,
    )
    .join('');
  // `products` is sorted by score. The list renders newest first, so scoreRank keeps the CSS/JS score order.
  const byDate = [...products].sort(
    (a, b) => b.releaseDate.localeCompare(a.releaseDate) || (b.criticScore ?? 0) - (a.criticScore ?? 0),
  );
  const scoreRank = new Map(products.map((p, i) => [p.id, i] as const));
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const since = cutoff.toISOString().slice(0, 10);
  const latest = getLatestReviews(8);
  const topRecent = products.filter((p) => isScored(p) && p.releaseDate >= since).slice(0, 8);
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6">
      <section className="pb-8 pt-12 sm:pt-16">
        <div>
          <Logo className="text-[clamp(32px,11vw,44px)] sm:text-7xl" beta="lg" />
        </div>
        {/* The tagline is the page's h1: it says what the site is, where the logo would read "TechScorecardBeta". */}
        <h1 className="mt-4 text-xl text-ink-muted sm:text-2xl">Professional tech reviews, combined into one score.</h1>
        <p className="mt-1 text-base text-ink-faint sm:text-lg">
          {totals.products} products and {totals.reviews} critic reviews from {totals.outlets} outlets so far. More
          gadgets and reviews are on the way.
        </p>
        <p className="mt-3 max-w-[60ch] text-sm text-ink-muted">
          Each score is a weighted average of professional reviews, with bigger outlets counting more.{' '}
          <Link href="/methodology/" className="font-semibold text-brand-ink underline underline-offset-2">
            How scores work
          </Link>
        </p>
      </section>

      <section aria-labelledby="top-recent" className="pb-10">
        <h2 id="top-recent" className="mb-3 text-lg font-bold">
          Top gadgets of the last 12 months
        </h2>
        <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:gap-4 sm:px-6">
          {topRecent.map((p) => (
            <div key={p.id} className="w-32 shrink-0 snap-start sm:w-40">
              <MiniProductCard product={p} />
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="latest" className="pb-10">
        <h2 id="latest" className="mb-3 text-lg font-bold">
          Latest reviews
        </h2>
        <p className="mb-3 text-sm text-ink-muted">
          The newest review of each product, with that outlet&apos;s own score out of 100.
        </p>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {latest.map(({ product, review }) => (
            <li key={product.id}>
              <Link
                href={`/product/${product.slug}/`}
                className="flex min-h-11 items-center gap-3 px-3 py-2 hover:bg-surface-overlay"
              >
                <span
                  className="w-8 shrink-0 text-center text-sm font-bold tabular-nums"
                  title={`${review.outlet.name}'s score`}
                >
                  {review.score}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{product.name}</span>
                  <span className="block truncate text-xs text-ink-faint">
                    {review.outlet.name} · {formatDate(review.date)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="all" className="cat-filter sort-toggle">
        <style>{filterCss}</style>
        <h2 id="all" className="mb-3 text-lg font-bold">
          All Products
        </h2>
        <input type="radio" name="home-sort" id="home-sort-score" className="by-score" />
        <input type="radio" name="home-sort" id="home-sort-date" className="by-date" defaultChecked />
        {filters.map((f) => (
          <input
            key={f.id}
            type="radio"
            name="cat"
            id={`cat-${f.id}`}
            className={`f-${f.id}`}
            defaultChecked={f.id === 'all'}
          />
        ))}
        <div className="filter-labels mb-4 flex flex-wrap gap-2">
          {filters.map((f) => (
            <label key={f.id} htmlFor={`cat-${f.id}`} className={`lbl-${f.id}`}>
              {f.label}
            </label>
          ))}
        </div>
        <div className="sort-labels mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider">
          <span className="text-ink-faint">Sort:</span>
          <label htmlFor="home-sort-date" className="lbl-date">
            Newest
          </label>
          <label htmlFor="home-sort-score" className="lbl-score">
            Critic score
          </label>
        </div>
        {/* One list, each card shipped once. ListSort moves the cards so DOM, keyboard and screen-reader
            order match the chosen sort; without JavaScript, CSS `order` still sorts it visually. */}
        <div id="all-products" className="cat-list flex flex-col gap-3">
          {byDate.map((p, i) => (
            <div
              key={p.id}
              data-cat={p.category}
              className="list-item"
              data-o-score={scoreRank.get(p.id)}
              data-o-date={i}
              style={{ '--o-score': scoreRank.get(p.id), '--o-date': i } as React.CSSProperties}
            >
              <ProductListCard product={p} />
            </div>
          ))}
        </div>
        <ListSort listId="all-products" dateRadioId="home-sort-date" />
      </section>

      <section aria-labelledby="best" className="pb-4 pt-10">
        <h2 id="best" className="mb-3 text-lg font-bold">
          Best to buy in {bestYear()}
        </h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          <li>
            <Link
              href="/best/"
              className="inline-flex min-h-11 items-center rounded-full border border-line px-4 font-semibold hover:border-ink"
            >
              Best-reviewed overall
            </Link>
          </li>
          {indexableCategories().map((c) => (
            <li key={c}>
              <Link
                href={`/category/${c}/`}
                className="inline-flex min-h-11 items-center rounded-full border border-line px-4 hover:border-ink"
              >
                Best {CATEGORY_PLURAL[c].toLowerCase()}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
