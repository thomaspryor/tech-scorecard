import Link from 'next/link';
import type { ComputedProduct } from '@/lib/engine';
import { getScoreTier } from '@/config/score-buckets';
import { formatDate, formatPrice } from '@/lib/format';
import { ProductImage } from './ProductImage';
import { ProductChips } from './ProductChips';
import { ScoreBadge } from './ScoreBadge';

/**
 * [Thumbnail] [Info] [Score], same three-column card as Broadway Scorecard's ShowListCard.
 * `heading` keeps the outline valid: h2 directly under a page h1, h3 under a section h2.
 */
export function ProductListCard({
  product,
  heading: Heading = 'h3',
}: {
  product: ComputedProduct;
  heading?: 'h2' | 'h3';
}) {
  const tier = product.criticScore != null ? getScoreTier(product.criticScore) : null;
  const price = formatPrice(product.launchPrice);
  return (
    <Link href={`/product/${product.slug}/`} className="card-interactive flex items-center gap-4 p-4 sm:gap-5 sm:p-5">
      <div className="h-[84px] w-[84px] shrink-0 overflow-hidden rounded-lg sm:h-28 sm:w-28">
        <ProductImage product={product} />
      </div>
      <div className="min-w-0 flex-1">
        <Heading className="line-clamp-2 text-lg font-bold leading-tight sm:text-xl">{product.name}</Heading>
        <div className="mt-1.5">
          <ProductChips category={product.category} releaseDate={product.releaseDate} />
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          {product.brand} · {formatDate(product.releaseDate)}
          {price && <span className="hidden sm:inline"> · From {price}</span>}
        </p>
      </div>
      <div className="flex w-20 shrink-0 flex-col items-center gap-1 text-center sm:w-24">
        {tier && (
          <span className={`text-[10px] font-bold uppercase tracking-wide ${tier.textClass}`}>{tier.label}</span>
        )}
        <ScoreBadge score={product.criticScore} />
        <span className="text-[11px] text-ink-faint">{product.reviewCount} reviews</span>
      </div>
    </Link>
  );
}
