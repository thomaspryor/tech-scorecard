import Link from 'next/link';
import type { Metadata } from 'next';
import { getScoredProducts, indexableCategories } from '@/lib/data';
import { CATEGORY_PLURAL } from '@/lib/format';
import { ProductListCard } from '@/components/product-cards';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbLd, clip, itemListLd, socialMeta } from '@/lib/seo';
import { BEST_YEAR } from '@/config/seo';
import { EARLY_SCORE_BELOW } from '@/config/scoring';

const TOP_N = 10;

const rated = getScoredProducts;

export function generateMetadata(): Metadata {
  const top = rated()[0];
  if (!top) return { title: `Best-reviewed tech to buy in ${BEST_YEAR}`, alternates: { canonical: '/best/' } };
  const title = `Best-reviewed tech to buy in ${BEST_YEAR}: top gadgets by critic score`;
  const description = clip(
    `The ${TOP_N} best-reviewed gadgets to buy in ${BEST_YEAR}, ranked by critic score across ${rated().reduce((n, p) => n + p.reviewCount, 0)} professional reviews. Top rated: ${top.name} at ${Math.round(top.criticScore)}/100.`,
    158,
  );
  return {
    title,
    description,
    alternates: { canonical: '/best/' },
    ...socialMeta(title, description, '/best/'),
  };
}

export default function BestPage() {
  const all = rated();
  const top = all.slice(0, TOP_N);
  const cats = indexableCategories();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-4 pt-6 sm:px-6">
      <JsonLd
        data={[
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: `Best to buy in ${BEST_YEAR}`, path: '/best/' },
          ]),
          itemListLd(
            `Best-reviewed tech to buy in ${BEST_YEAR}`,
            top.map((p) => ({ name: p.name, path: `/product/${p.slug}/` })),
          ),
        ]}
      />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-faint">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink">Best to buy in {BEST_YEAR}</span>
      </nav>
      <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl sm:leading-10">
        Best-reviewed tech to buy in {BEST_YEAR}
      </h1>
      <p className="mt-3 max-w-[65ch] leading-relaxed text-ink-muted">
        The {top.length} highest critic scores across every category we track, from{' '}
        {all.reduce((n, p) => n + p.reviewCount, 0)} professional reviews. A score is a weighted average of published
        reviews.{' '}
        <Link href="/methodology/" className="font-semibold text-brand-ink underline underline-offset-2">
          How scores work
        </Link>
      </p>
      <ol className="mt-6 space-y-3">
        {top.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3">
            <span className="w-6 shrink-0 text-center text-sm font-bold text-ink-faint">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <ProductListCard product={p} heading="h2" />
              {p.reviewCount < EARLY_SCORE_BELOW && (
                <p className="mt-1 text-xs text-ink-faint">Early score: based on {p.reviewCount} reviews so far</p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <section className="mt-10" aria-labelledby="by-cat">
        <h2 id="by-cat" className="mb-3 text-lg font-bold">
          Best by category
        </h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {cats.map((c) => (
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
