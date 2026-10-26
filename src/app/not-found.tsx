import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-16 text-center sm:px-6">
      <p className="section-label">Error 404</p>
      <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">We could not find that page</h1>
      <p className="mx-auto mt-3 max-w-[50ch] leading-relaxed text-ink-muted">
        The link may be old, or the gadget may not be on the site yet. Try the full list instead.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-pill bg-ink px-6 text-sm font-semibold text-white hover:opacity-90"
      >
        See all products
      </Link>
    </div>
  );
}
