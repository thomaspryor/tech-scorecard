import Link from 'next/link';
import type { Metadata } from 'next';
import { bestYear, getScoredProducts, indexableCategories } from '@/lib/data';
import { CATEGORY_PLURAL } from '@/lib/format';
import { RankedList } from '@/components/RankedList';
import { getRoundups, type Roundup } from '@/lib/roundups';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbLd, clip, fitTitle, itemListLd, socialMeta, titleCandidates } from '@/lib/seo';

const TOP_N = 10;

const rated = getScoredProducts;

export function generateMetadata(): Metadata {
  const top = rated()[0];
  if (!top) return { title: `Best-reviewed tech to buy in ${bestYear()}`, alternates: { canonical: '/best/' } };
  const titles = titleCandidates.best(bestYear());
  const title = titles[0];
  const description = clip(
    `The ${TOP_N} best-reviewed gadgets to buy in ${bestYear()}, ranked by critic score across ${rated().reduce((n, p) => n + p.reviewCount, 0)} professional reviews. Top rated: ${top.name} at ${Math.round(top.criticScore)}/100.`,
    158,
  );
  return {
    title: fitTitle(titles),
    description,
    alternates: { canonical: '/best/' },
    ...socialMeta(title, description, '/best/'),
  };
}

export default function BestPage() {
  const all = rated();
  const top = all.slice(0, TOP_N);
  const cats = indexableCategories();
  const roundups = getRoundups();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-4 pt-6 sm:px-6">
      <JsonLd
        data={[
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: `Best to buy in ${bestYear()}`, path: '/best/' },
          ]),
          itemListLd(
            `Best-reviewed tech to buy in ${bestYear()}`,
            top.map((p) => ({ name: p.name, path: `/product/${p.slug}/` })),
          ),
        ]}
      />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-faint">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink">Best to buy in {bestYear()}</span>
      </nav>
      <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl sm:leading-10">
        Best-reviewed tech to buy in {bestYear()}
      </h1>
      <p className="mt-3 max-w-[65ch] leading-relaxed text-ink-muted">
        The {top.length} highest critic scores across every category we track, from{' '}
        {all.reduce((n, p) => n + p.reviewCount, 0)} professional reviews. A score is a weighted average of published
        reviews.{' '}
        <Link href="/methodology/" className="font-semibold text-brand-ink underline underline-offset-2">
          How scores work
        </Link>
      </p>
      <RankedList products={top} />
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
      <RoundupGroup id="by-price" title="Best by price" items={roundups.filter((r) => r.kind === 'price')} />
      <RoundupGroup id="by-brand" title="Best by brand" items={roundups.filter((r) => r.kind === 'brand')} />
    </div>
  );
}

function RoundupGroup({ id, title, items }: { id: string; title: string; items: Roundup[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-10" aria-labelledby={id}>
      <h2 id={id} className="mb-3 text-lg font-bold">
        {title}
      </h2>
      <ul className="flex flex-wrap gap-2 text-sm">
        {items.map((r) => (
          <li key={r.slug}>
            <Link
              href={`/best/${r.slug}/`}
              className="inline-flex min-h-11 items-center rounded-full border border-line px-4 hover:border-ink"
            >
              Best {r.subject}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
