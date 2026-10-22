import { getAllProducts, getTotals } from '@/lib/data';
import { MiniProductCard, ProductListCard } from '@/components/product-cards';
import { Logo } from '@/components/Header';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'phone', label: 'Phones' },
  { id: 'foldable', label: 'Foldables' },
] as const;

export default function HomePage() {
  const products = getAllProducts();
  const totals = getTotals();
  const newest = [...products].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)).slice(0, 8);
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6">
      <section className="pb-8 pt-12 sm:pt-16">
        <h1><Logo className="text-5xl sm:text-7xl" /></h1>
        <p className="mt-4 text-xl text-ink-muted sm:text-2xl">Every gadget. Every review. One score.</p>
        <p className="mt-1 text-base text-ink-faint sm:text-lg">
          {totals.products} products. {totals.reviews} critic reviews from {totals.outlets} outlets. And counting.
        </p>
      </section>

      <section aria-labelledby="newest" className="pb-10">
        <h2 id="newest" className="mb-3 text-lg font-bold">Newest Releases</h2>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:gap-4 sm:px-6">
          {newest.map((p) => (
            <div key={p.id} className="w-32 shrink-0 snap-start sm:w-40"><MiniProductCard product={p} /></div>
          ))}
        </div>
      </section>

      <section aria-labelledby="all" className="cat-filter">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="all" className="text-lg font-bold">All Phones</h2>
          <span className="section-label">Sorted by critic score</span>
        </div>
        {FILTERS.map((f) => (
          <input key={f.id} type="radio" name="cat" id={`cat-${f.id}`} className={`f-${f.id}`} defaultChecked={f.id === 'all'} />
        ))}
        <div className="filter-labels mb-4 flex gap-2" role="radiogroup" aria-label="Filter by type">
          {FILTERS.map((f) => (
            <label key={f.id} htmlFor={`cat-${f.id}`} className={`lbl-${f.id}`}>{f.label}</label>
          ))}
        </div>
        <div className="cat-list flex flex-col gap-3">
          {products.map((p) => (
            <div key={p.id} data-cat={p.category}><ProductListCard product={p} /></div>
          ))}
        </div>
      </section>
    </div>
  );
}
