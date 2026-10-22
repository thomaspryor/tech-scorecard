import Link from 'next/link';

export function Logo({ className = '', beta = 'sm' }: { className?: string; beta?: 'sm' | 'lg' | false }) {
  // Beta pill sized like Broadway Scorecard's West End / Opera beta markers.
  const pill = beta === 'lg'
    ? 'relative -top-3 ml-2 px-1.5 py-0.5 text-[10px] sm:-top-6 sm:text-xs'
    : 'relative -top-2 ml-1 px-1 py-px text-[9px]';
  return (
    <span className={`whitespace-nowrap font-extrabold tracking-tight ${className}`}>
      <span className="text-ink">Tech</span><span className="text-brand-logo">Scorecard</span>
      {beta && (
        <span className={`${pill} inline-block rounded border border-brand/40 leading-none bg-brand-muted align-middle font-bold uppercase tracking-wider text-brand-ink`}>
          Beta
        </span>
      )}
    </span>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Tech Scorecard home"><Logo className="text-xl min-[360px]:text-2xl sm:text-[28px]" /></Link>
        <nav className="flex items-center gap-4 whitespace-nowrap text-sm font-medium text-ink-muted sm:gap-5">
          <Link href="/" className="hidden hover:text-ink sm:inline">Phones</Link>
          <Link href="/methodology/" className="hover:text-ink">Methodology</Link>
        </nav>
      </div>
    </header>
  );
}
