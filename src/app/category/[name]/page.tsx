import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { bestYear, getScoredProducts, indexableCategories } from '@/lib/data';
import { CATEGORY_ORDER, CATEGORY_PLURAL, isCategory } from '@/lib/format';
import type { Category } from '@/lib/data-types';
import { RankedList } from '@/components/RankedList';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbLd, clip, fitTitle, itemListLd, socialMeta, titleCandidates } from '@/lib/seo';
import { getRoundups } from '@/lib/roundups';

type Params = { name: string };

function productsIn(category: Category) {
  return getScoredProducts().filter((p) => p.category === category);
}

export function generateStaticParams(): Params[] {
  return CATEGORY_ORDER.filter((c) => productsIn(c).length > 0).map((name) => ({ name }));
}

function summary(category: Category) {
  const list = productsIn(category);
  const reviews = list.reduce((n, p) => n + p.reviewCount, 0);
  return { list, reviews, top: list[0] };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { name } = await params;
  if (!isCategory(name)) return {};
  const { list, reviews, top } = summary(name);
  if (!top) return {};
  const plural = CATEGORY_PLURAL[name];
  const titles = titleCandidates.category(plural, bestYear());
  const title = titles[0];
  const description = clip(
    `The best ${plural.toLowerCase()} to buy in ${bestYear()} by critic score: ${list.length} ranked from ${reviews} professional reviews. Top rated: ${top.name} at ${Math.round(top.criticScore)}/100.`,
    158,
  );
  const url = `/category/${name}/`;
  return {
    title: fitTitle(titles),
    description,
    alternates: { canonical: url },
    robots: indexableCategories().includes(name) ? undefined : { index: false, follow: true },
    ...socialMeta(title, description, url),
  };
}

export default async function CategoryPage({ params }: { params: Promise<Params> }) {
  const { name } = await params;
  if (!isCategory(name)) notFound();
  const { list, reviews, top } = summary(name);
  if (!top) notFound();
  const plural = CATEGORY_PLURAL[name];
  const others = indexableCategories().filter((c) => c !== name);
  const path = `/category/${name}/`;
  const pricePages = getRoundups().filter((r) => r.category === name);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-4 pt-6 sm:px-6">
      <JsonLd
        data={[
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: plural, path },
          ]),
          itemListLd(
            `Best ${plural} to buy in ${bestYear()}`,
            list.map((p) => ({ name: p.name, path: `/product/${p.slug}/` })),
          ),
        ]}
      />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-faint">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink">{plural}</span>
      </nav>

      <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl sm:leading-10">
        Best {plural} to buy in {bestYear()}, ranked by critic score
      </h1>
      <p className="mt-3 max-w-[65ch] leading-relaxed text-ink-muted">
        Ranked by the weighted average of {reviews} professional reviews. The top rated is the {top.name} at{' '}
        {Math.round(top.criticScore)}/100. Each score blends reviews from major tech outlets, with bigger outlets
        counting more; every review links to the original article.{' '}
        <Link href="/methodology/" className="font-semibold text-brand-ink underline underline-offset-2">
          How scores work
        </Link>
      </p>

      <RankedList products={list} />

      {pricePages.length > 0 && (
        <section className="mt-10" aria-labelledby="by-price">
          <h2 id="by-price" className="mb-3 text-lg font-bold">
            {plural} by price
          </h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {pricePages.map((r) => (
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
      )}

      {others.length > 0 && (
        <section className="mt-10" aria-labelledby="more-cats">
          <h2 id="more-cats" className="mb-3 text-lg font-bold">
            More categories
          </h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {others.map((c) => (
              <li key={c}>
                <Link
                  href={`/category/${c}/`}
                  className="inline-flex min-h-11 items-center rounded-full border border-line px-4 hover:border-ink"
                >
                  {CATEGORY_PLURAL[c]}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/best/"
                className="inline-flex min-h-11 items-center rounded-full border border-line px-4 hover:border-ink"
              >
                Best to buy in {bestYear()} overall
              </Link>
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}
