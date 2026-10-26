import type { Product } from '@/lib/data-types';

type Variant = 'hero' | 'thumb';

// Every tile is 3:4. Photos sit inside it with object-contain on a neutral
// background, so press shots with different backdrops look the same.
const SIZE: Record<Variant, { width: number; height: number }> = {
  hero: { width: 600, height: 800 },
  thumb: { width: 300, height: 400 },
};

/**
 * The brand's press photo when the product has one, otherwise a plain tile with the brand name.
 * `priority` loads the image straight away (the product page hero); everything else loads lazily.
 */
export function ProductImage({
  product,
  variant = 'thumb',
  priority = false,
  className = 'h-full w-full',
}: {
  product: Pick<Product, 'brand' | 'name' | 'image'>;
  variant?: Variant;
  priority?: boolean;
  className?: string;
}) {
  const { image } = product;
  if (!image)
    return (
      <div
        role="img"
        aria-label={`${product.name}, no photo yet`}
        className={`${className} flex items-center justify-center bg-[#f4f4f6] p-2 text-center text-xs font-semibold uppercase tracking-wide text-ink-faint`}
      >
        {product.brand}
      </div>
    );
  const { width, height } = SIZE[variant];
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- static export, files are pre-sized WebP
    <img
      src={variant === 'hero' ? image.src : image.thumb}
      // The hero slot is 112px wide on phones and 176px from sm up: small screens can take the thumbnail.
      srcSet={variant === 'hero' ? `${image.thumb} 300w, ${image.src} 800w` : undefined}
      sizes={variant === 'hero' ? '(min-width: 640px) 176px, 112px' : undefined}
      alt={image.alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      className="h-full w-full object-contain"
    />
  );
  return (
    <div className={`${className} bg-white`}>
      {/* React turns an eager <img> into a preload hint in the page's prefetch data, so every product link
          scrolled past would download that product's photo. Inside <picture> it emits no hint. */}
      {priority ? <picture className="contents">{img}</picture> : img}
    </div>
  );
}
