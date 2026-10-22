import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAllProducts, indexableCategories } from '@/lib/data';
import { CATEGORY_ORDER, CATEGORY_PLURAL } from '@/lib/format';
import type { Category } from '@/lib/data-types';
import { ProductListCard } from '@/components/product-cards';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbLd, clip, itemListLd } from '@/lib/seo';
import { BEST_YEAR } from '@/config/seo';

type Params = { name: string };

function productsIn(category: Category) {
  return getAllProducts().filter((p) => p.category === category && p.criticScore != null);
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
  const name = (await params).name as Category;
  if (!CATEGORY_ORDER.includes(name)) return {};
  const { list, reviews, top } = summary(name);
  if (!top) return {};
  const plural = CATEGORY_PLURAL[name];
  const title = `Best ${plural} ${BEST_YEAR}: ranked by critic score`;
  const description = clip(
    `The best ${plural.toLowerCase()} of ${BEST_YEAR} by critic score: ${list.length} ranked from ${reviews} professional reviews. Top rated: ${top.name} at ${Math.round(top.criticScore!)}/100.`,
    158,
  );
  const url = `/category/${name}/`;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: indexableCategories().includes(name) ? undefined : { index: false, follow: true },
    openGraph: { siteName: 'Tech Scorecard', type: 'website', title, description, url, images: [{ url: '/opengraph-image.png', width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function CategoryPage({ params }: { params: Promise<Params> }) {
  const name = (await params).name as Category;
  if (!CATEGORY_ORDER.includes(name)) notFound();
  const { list, reviews, top } = summary(name);
  if (!top) notFound();
  const plural = CATEGORY_PLURAL[name];
  const others = indexableCategories().filter((c) => c !== name);
  const path = `/category/${name}/`;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-4 pt-6 sm:px-6">
      <JsonLd
        data={[
          breadcrumbLd([{ name: 'Home', path: '/' }, { name: plural, path }]),
          itemListLd(`Best ${plural} ${BEST_YEAR}`, list.map((p) => ({ name: p.name, path: `/product/${p.slug}/` }))),
        ]}
      />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-faint">
        <Link href="/" className="hover:text-ink">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-ink">{plural}</span>
      </nav>

      <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">Best {plural} of {BEST_YEAR}, ranked by critic score</h1>
      <p className="mt-3 max-w-[65ch] leading-relaxed text-ink-muted">
        Ranked by the weighted average of {reviews} professional reviews.
        The top rated is the {top.name} at {Math.round(top.criticScore!)}/100. Each score blends reviews from major tech outlets, with bigger outlets
        counting more; every review links to the original article.{' '}
        <Link href="/methodology/" className="font-semibold text-brand-ink underline underline-offset-2">How scores work</Link>
      </p>

      <ol className="mt-6 space-y-3">
        {list.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3">
            <span className="w-6 shrink-0 text-center text-sm font-bold text-ink-faint" aria-label={`Rank ${i + 1}`}>{i + 1}</span>
            <div className="min-w-0 flex-1"><ProductListCard product={p} /></div>
          </li>
        ))}
      </ol>

      {others.length > 0 && (
        <section className="mt-10" aria-labelledby="more-cats">
          <h2 id="more-cats" className="mb-3 text-lg font-bold">More categories</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {others.map((c) => (
              <li key={c}><Link href={`/category/${c}/`} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 hover:border-ink">{CATEGORY_PLURAL[c]}</Link></li>
            ))}
            <li><Link href="/best/" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 hover:border-ink">Best of {BEST_YEAR} overall</Link></li>
          </ul>
        </section>
      )}
    </div>
  );
}
