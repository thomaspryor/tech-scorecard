import { ProductListCard } from '@/components/product-cards';
import type { ScoredProduct } from '@/lib/data';
import { EARLY_SCORE_BELOW } from '@/config/scoring';

/** Numbered list of products, best first, used by the best, category and roundup pages. */
export function RankedList({ products }: { products: ScoredProduct[] }) {
  return (
    <ol className="mt-6 space-y-3">
      {products.map((p, i) => (
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
  );
}
