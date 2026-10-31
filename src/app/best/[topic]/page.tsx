import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { bestYear } from '@/lib/data';
import { CATEGORY_PLURAL, formatPrice } from '@/lib/format';
import { getRoundup, getRoundups, type Roundup } from '@/lib/roundups';
import { getScoreTier, RECOMMENDED_MIN } from '@/config/score-buckets';
import { RankedList } from '@/components/RankedList';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbLd, clip, fitTitle, itemListLd, socialMeta, titleCandidates } from '@/lib/seo';

type Params = { topic: string };

export function generateStaticParams(): Params[] {
  return getRoundups().map((r) => ({ topic: r.slug }));
}

function stats(r: Roundup) {
  const reviews = r.products.reduce((n, p) => n + p.reviewCount, 0);
  const top = r.products[0];
  const last = r.products[r.products.length - 1];
  const strong = r.products.filter((p) => Math.round(p.criticScore) >= RECOMMENDED_MIN).length;
  return { reviews, top, last, strong };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const r = getRoundup((await params).topic);
  if (!r) return {};
  const { reviews, top } = stats(r);
  const titles = titleCandidates.roundup(r.subject, bestYear());
  const description = clip(
    `The best ${r.subject} in ${bestYear()} by critic score: ${r.products.length} ranked from ${reviews} professional reviews. Top rated: ${top.name} at ${Math.round(top.criticScore)}/100.`,
    158,
  );
  const url = `/best/${r.slug}/`;
  return {
    title: fitTitle(titles),
    description,
    alternates: { canonical: url },
    ...socialMeta(titles[0], description, url),
  };
}

export default async function RoundupPage({ params }: { params: Promise<Params> }) {
  const r = getRoundup((await params).topic);
  if (!r) notFound();
  const { reviews, top, last, strong } = stats(r);
  const year = bestYear();
  const path = `/best/${r.slug}/`;
  const siblings = getRoundups().filter((x) => x.slug !== r.slug && x.kind === r.kind);
  const crumb = r.subject.charAt(0).toUpperCase() + r.subject.slice(1);
  const categoryLink = r.category ? `/category/${r.category}/` : null;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-4 pt-6 sm:px-6">
      <JsonLd
        data={[
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: `Best to buy in ${year}`, path: '/best/' },
            { name: crumb, path },
          ]),
          itemListLd(
            `Best ${r.subject} in ${year}`,
            r.products.map((p) => ({ name: p.name, path: `/product/${p.slug}/` })),
          ),
        ]}
      />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-faint">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>
        <span className="mx-2">/</span>
        <Link href="/best/" className="hover:text-ink">
          Best to buy in {year}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink">{crumb}</span>
      </nav>

      <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl sm:leading-10">
        Best {r.subject} in {year}, ranked by critic score
      </h1>
      <p className="mt-3 max-w-[65ch] leading-relaxed text-ink-muted">
        {r.products.length} {r.kind === 'brand' ? `${r.brand} products` : 'products'} ranked by the weighted average of{' '}
        {reviews} professional reviews. The top rated is the {top.name} at {Math.round(top.criticScore)}/100 (
        {getScoreTier(top.criticScore).label}); the lowest is the {last.name} at {Math.round(last.criticScore)}/100.{' '}
        {strong === r.products.length
          ? `Every one scores ${RECOMMENDED_MIN} or higher.`
          : `${strong} of ${r.products.length} score ${RECOMMENDED_MIN} or higher.`}{' '}
        <Link href="/methodology/" className="font-semibold text-brand-ink underline underline-offset-2">
          How scores work
        </Link>
      </p>
      {r.cap != null && (
        <p className="mt-2 max-w-[65ch] text-sm text-ink-faint">
          Price is the launch price of the base model in US dollars, below {formatPrice(r.cap)}. Street prices change,
          so check the current price before you buy.
        </p>
      )}

      <RankedList products={r.products} />

      <section className="mt-10" aria-labelledby="more-lists">
        <h2 id="more-lists" className="mb-3 text-lg font-bold">
          More lists
        </h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {categoryLink && r.category && (
            <li>
              <Link
                href={categoryLink}
                className="inline-flex min-h-11 items-center rounded-full border border-line px-4 font-semibold hover:border-ink"
              >
                All {CATEGORY_PLURAL[r.category].toLowerCase()}
              </Link>
            </li>
          )}
          {siblings.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/best/${s.slug}/`}
                className="inline-flex min-h-11 items-center rounded-full border border-line px-4 hover:border-ink"
              >
                Best {s.subject}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/best/"
              className="inline-flex min-h-11 items-center rounded-full border border-line px-4 hover:border-ink"
            >
              Best to buy in {year} overall
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
