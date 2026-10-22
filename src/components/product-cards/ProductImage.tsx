import type { Product } from '@/lib/data-types';
import { DeviceArt } from './DeviceArt';

type Variant = 'hero' | 'thumb';

// Every tile is 3:4. Photos sit inside it with object-contain on a neutral
// background, so press shots with different backdrops look the same.
const SIZE: Record<Variant, { width: number; height: number }> = {
  hero: { width: 600, height: 800 },
  thumb: { width: 300, height: 400 },
};

/**
 * The brand's press photo when the product has one, otherwise the drawn device.
 * `priority` marks the page's largest image (LCP); everything else loads lazily.
 */
export function ProductImage({
  product,
  variant = 'thumb',
  priority = false,
  className = 'h-full w-full',
}: {
  product: Pick<Product, 'art' | 'name' | 'image'>;
  variant?: Variant;
  priority?: boolean;
  className?: string;
}) {
  const { image } = product;
  if (!image) return <DeviceArt art={product.art} name={product.name} className={className} />;
  const { width, height } = SIZE[variant];
  return (
    <div className={`${className} bg-[#f4f4f6]`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, files are pre-sized WebP */}
      <img
        src={variant === 'hero' ? image.src : image.thumb}
        alt={image.alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding={priority ? 'sync' : 'async'}
        className="h-full w-full object-contain"
      />
    </div>
  );
}
