import Link from 'next/link';

export function Logo({
  className = '',
  beta = 'sm',
  betaClassName = '',
}: {
  className?: string;
  beta?: 'sm' | 'lg' | false;
  betaClassName?: string;
}) {
  // Beta pill sized like Broadway Scorecard's West End / Opera beta markers.
  const pill =
    beta === 'lg'
      ? 'relative -top-3 ml-2 px-1.5 py-0.5 text-[10px] sm:-top-6 sm:text-xs sm:leading-4'
      : 'relative -top-2 ml-1 px-1 py-px text-[9px]';
  return (
    <span className={`whitespace-nowrap font-extrabold tracking-tight ${className}`}>
      <span className="text-ink">Tech</span>
      <span className="text-brand-logo">Scorecard</span>
      {beta && (
        <span
          className={`${pill} ${betaClassName} inline-block rounded-sm border border-brand/40 leading-none bg-brand-muted align-middle font-bold uppercase tracking-wider text-brand-ink`}
        >
          Beta
        </span>
      )}
    </span>
  );
}

export function Header() {
  // Fits one row down to 320px wide: below 360px the logo shrinks and drops its Beta pill
  // (the homepage hero still shows it). Links are 44px tall for touch.
  const link = 'inline-flex min-h-11 items-center hover:text-ink';
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
        <Link href="/" className="inline-flex min-h-11 items-center">
          <Logo
            className="text-lg min-[360px]:text-xl min-[420px]:text-2xl sm:text-[28px]"
            betaClassName="max-[359px]:hidden"
          />
        </Link>
        <nav className="flex items-center gap-3 whitespace-nowrap text-[13px] font-medium text-ink-muted sm:gap-5 sm:text-sm">
          <Link href="/" className={`${link} max-sm:hidden`}>
            All products
          </Link>
          <Link href="/methodology/" className={link}>
            Methodology
          </Link>
          <Link href="/about/" className={link}>
            About
          </Link>
        </nav>
      </div>
    </header>
  );
}
