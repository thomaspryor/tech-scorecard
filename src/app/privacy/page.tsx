import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy',
  openGraph: { title: 'Privacy | Tech Scorecard', description: 'What Tech Scorecard collects and what it does not.', url: '/privacy/' },
  description: 'What Tech Scorecard collects (privacy-friendly page-view analytics only) and what it does not.',
  alternates: { canonical: '/privacy/' },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Privacy</h1>
      <p className="mt-3 max-w-[65ch] leading-relaxed text-ink-muted">
        Short version: Tech Scorecard does not ask for your name or email, has no accounts, and does not use advertising cookies.
      </p>

      <section className="card mt-8 p-5 sm:p-6">
        <h2 className="section-label">What we collect</h2>
        <p className="mt-3 max-w-[65ch] text-sm leading-relaxed">
          We use Vercel Web Analytics to count visits and see which pages are popular. It does not use cookies and does not
          follow you across other websites. It records things like the page visited, the country, the type of device and
          browser, and where the visit came from. It does not record your name, email address or any
          personal profile.
        </p>
      </section>

      <section className="card mt-4 p-5 sm:p-6">
        <h2 className="section-label">What we do not do</h2>
        <ul className="mt-3 max-w-[65ch] list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>No accounts, sign-ups or comments.</li>
          <li>No advertising and no ad trackers.</li>
          <li>We do not sell or share data about visitors.</li>
        </ul>
      </section>

      <section className="card mt-4 p-5 sm:p-6">
        <h2 className="section-label">Other sites</h2>
        <p className="mt-3 max-w-[65ch] text-sm leading-relaxed">
          The site loads its text font from Google Fonts. Every review links to the outlet that published it, and every
          product links to its maker. Those sites have their own privacy policies.
        </p>
      </section>

      <p className="mt-6 text-sm text-ink-muted">
        Back to <Link href="/about/" className="underline underline-offset-2 hover:text-ink">About</Link>.
      </p>
    </div>
  );
}
