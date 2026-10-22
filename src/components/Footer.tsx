import Link from 'next/link';
import { Logo } from './Header';
import { BEST_YEAR } from '@/config/seo';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface-overlay">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-10 text-center text-sm text-ink-muted">
        <Logo className="text-xl" />
        <p>Professional tech reviews, combined into one score.</p>
        <p className="text-xs text-ink-faint">
          Beta: we&apos;re still adding gadgets and reviews. Scores are tier-weighted averages of published reviews;
          excerpts link to the original articles.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm">
          <Link href="/best/" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-ink">
            Best to buy in {BEST_YEAR}
          </Link>
          <Link
            href="/methodology/"
            className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-ink"
          >
            Methodology
          </Link>
          <Link
            href="/about/"
            className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-ink"
          >
            About
          </Link>
          <Link
            href="/privacy/"
            className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-ink"
          >
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
