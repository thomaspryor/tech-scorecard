import type { Product } from '@/lib/data-types';

type Variant = 'hero' | 'thumb';

// Every tile is 3:4. Photos sit inside it with object-contain on a neutral
// background, so press shots with different backdrops look the same.
// `sizes` is the slot's rendered width: the hero is w-28 (112px) on phones and sm:w-44 (176px)
// on the product page, so small screens can take the 300px thumbnail.
const SIZE: Record<Variant, { width: number; height: number; sizes?: string }> = {
  hero: { width: 600, height: 800, sizes: '(min-width: 640px) 176px, 112px' },
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
  const { width, height, sizes } = SIZE[variant];
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- static export, files are pre-sized WebP
    <img
      src={variant === 'hero' ? image.src : image.thumb}
      srcSet={sizes ? `${image.thumb} 300w, ${image.src} 800w` : undefined}
      sizes={sizes}
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
