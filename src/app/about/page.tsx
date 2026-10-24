import type { Metadata } from 'next';
import { socialMeta } from '@/lib/seo';
import Link from 'next/link';
import { getTotals } from '@/lib/data';

export const metadata: Metadata = {
  title: 'About',
  ...socialMeta(
    'About Tech Scorecard',
    'An independent review aggregator that combines professional tech reviews into one critic score.',
    '/about/',
  ),
  description:
    'Tech Scorecard is an independent review aggregator that combines professional tech reviews into one critic score, using the Broadway Scorecard method.',
  alternates: { canonical: '/about/' },
};

export default function AboutPage() {
  const totals = getTotals();
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-4xl">About Tech Scorecard</h1>
      <p className="mt-3 max-w-[65ch] leading-relaxed text-ink-muted">
        Tech Scorecard collects professional reviews of new gadgets and boils them down to one number from 0 to 100, so
        you can see at a glance what the critics think before you buy.
      </p>

      <section className="card mt-8 p-5 sm:p-6">
        <h2 className="section-label">Who runs it</h2>
        <p className="mt-3 max-w-[65ch] text-sm leading-relaxed">
          Tech Scorecard is made by Thomas Pryor, an independent project with no staff and no sponsors. It uses the same
          scoring method as Broadway Scorecard, a review aggregator for theater, applied to phones, laptops, headphones,
          watches and other devices. It is not owned by, paid by or affiliated with any gadget maker or review outlet.
        </p>
      </section>

      <section className="card mt-4 p-5 sm:p-6">
        <h2 className="section-label">How the score works, in plain words</h2>
        <ol className="mt-3 max-w-[65ch] list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>We find reviews from well-known tech outlets. Each one links back to the original article.</li>
          <li>
            If the outlet gave a rating (stars, a score out of 10), that rating sets a range. A 4.5 out of 5 always
            lands high, a 3 out of 5 lands in the middle.
          </li>
          <li>
            Two AI models read the full review and decide where inside that range it belongs. A warm, enthusiastic
            review sits near the top. A review with big reservations sits near the bottom. The review&apos;s score is
            the average of the two, and it never leaves the range the outlet set.
          </li>
          <li>Bigger outlets count for more. The product&apos;s score is the weighted average of all its reviews.</li>
        </ol>
        <p className="mt-4 text-sm">
          The full detail is on the{' '}
          <Link href="/methodology/" className="font-semibold text-brand-ink underline underline-offset-2">
            methodology page
          </Link>
          .
        </p>
      </section>

      <section className="card mt-4 p-5 sm:p-6">
        <h2 className="section-label">Where the reviews come from</h2>
        <p className="mt-3 max-w-[65ch] text-sm leading-relaxed">
          Right now the site covers {totals.products} products and {totals.reviews} reviews from {totals.outlets}{' '}
          outlets. We only use reviews published by the outlets themselves. Every quote shown is checked word for word
          against the original page, and quotes that cannot be matched are dropped. We link to the source on every
          review and quote only a sentence or two. We do not copy full reviews.
        </p>
        <p className="mt-3 max-w-[65ch] text-sm leading-relaxed">
          New reviews and new launches are added every week. The site is in beta, so coverage is still growing and some
          gadgets have only a few reviews.
        </p>
      </section>

      <section className="card mt-4 p-5 sm:p-6">
        <h2 className="section-label">Independence</h2>
        <p className="mt-3 max-w-[65ch] text-sm leading-relaxed">
          Tech Scorecard does not write its own reviews and does not take money to change a score. Scores come only from
          the published reviews and the method above.
        </p>
      </section>

      <p className="mt-6 text-sm text-ink-muted">
        See also the{' '}
        <Link href="/privacy/" className="underline underline-offset-2 hover:text-ink">
          privacy page
        </Link>
        .
      </p>
    </div>
  );
}
