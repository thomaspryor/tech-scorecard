import Link from 'next/link';
import type { ComputedProduct } from '@/lib/engine';
import { getScoreTier } from '@/config/score-buckets';
import { formatDate, formatMonth, formatPrice } from '@/lib/format';
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
    <Link href={`/product/${product.slug}/`} className="card-interactive flex items-center gap-3 p-3 sm:gap-5 sm:p-5">
      <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg sm:h-28 sm:w-28">
        <ProductImage product={product} />
      </div>
      <div className="min-w-0 flex-1">
        <Heading className="text-base font-bold leading-snug sm:line-clamp-2 sm:text-xl sm:leading-7">
          {product.name}
        </Heading>
        {/* The name starts with the brand, so this line is just category, date and price. Phones get the
            month only so it fits beside the chip; the narrowest ones wrap it under the chip, never cut it. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <ProductChips category={product.category} />
          <p className="whitespace-nowrap text-sm text-ink-muted">
            <span className="sm:hidden">{formatMonth(product.releaseDate)}</span>
            <span className="hidden sm:inline">{formatDate(product.releaseDate)}</span>
            {price && <span className="hidden sm:inline"> · From {price}</span>}
          </p>
        </div>
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
