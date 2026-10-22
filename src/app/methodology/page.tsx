import type { Metadata } from 'next';
import { socialMeta } from '@/lib/seo';
import { TIER_DESCRIPTIONS, TIER_WEIGHTS, MIN_REVIEWS_FOR_SCORE } from '@/config/scoring';
import { SCORE_TIERS, GOLD_MIN, RECOMMENDED_MIN, WORTH_IT_MIN, MIXED_MIN } from '@/config/score-buckets';
import { OutletTierChip } from '@/components/product-cards';

export const metadata: Metadata = {
  title: 'How scores work',
  ...socialMeta('How Tech Scorecard scores work', 'How we turn published tech reviews into one 0-100 critic score.', '/methodology/'),
  description:
    'How we turn published tech reviews into one 0-100 critic score: outlet tiers, how star ratings become score bands, and how unrated reviews are scored.',
  alternates: { canonical: '/methodology/' },
};

const RANGES = [
  ['gold', `${GOLD_MIN}-100`],
  ['recommended', `${RECOMMENDED_MIN}-${GOLD_MIN - 1}`],
  ['worthIt', `${WORTH_IT_MIN}-${RECOMMENDED_MIN - 1}`],
  ['mixed', `${MIXED_MIN}-${WORTH_IT_MIN - 1}`],
  ['miss', `0-${MIXED_MIN - 1}`],
] as const;

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-4xl">How scores work</h1>
      <p className="mt-3 max-w-[65ch] leading-relaxed text-ink-muted">
        Every product gets one critic score from 0 to 100: a weighted average of professional reviews. It uses the same
        method as Broadway Scorecard, adapted for tech outlets.
      </p>

      <section className="card mt-8 p-5 sm:p-6">
        <h2 className="section-label">1. Each review becomes a number</h2>
        <p className="mt-3 max-w-[65ch] text-sm leading-relaxed">
          A published rating sets a range, the same rule Broadway Scorecard uses for star ratings: 4.5/5 or 9/10 and up
          lands between 91 and 100, 3.5/5 to 4/5 (7/10 to 8.9/10) between 71 and 90, and lower ratings in lower ranges.
          Two AI models (from OpenAI and Google) then read the full review and place it inside that range: near the top
          when the reviewer is enthusiastic, near the bottom when the rating comes with big reservations. The
          review&apos;s score is the average of the two, and it can never leave the range the outlet set. When an outlet
          publishes no rating, the same two models score the verdict from 0 to 100, and the review is labeled
          &ldquo;Unrated, scored from text.&rdquo;
        </p>
      </section>

      <section className="card mt-4 p-5 sm:p-6">
        <h2 className="section-label">2. Bigger outlets count for more</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {([1, 2, 3, 4] as const).map((t) => (
            <li key={t} className="flex items-start gap-3">
              <OutletTierChip tier={t} />
              <span className="w-10 shrink-0 font-semibold tabular-nums">{Math.round(TIER_WEIGHTS[t] * 100)}%</span>
              <span className="min-w-0 text-ink-muted">{TIER_DESCRIPTIONS[t]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-muted">
          A product needs at least {MIN_REVIEWS_FOR_SCORE} reviews before it gets a score.
        </p>
      </section>

      <section className="card mt-4 p-5 sm:p-6">
        <h2 className="section-label">3. The score sets the label</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {RANGES.map(([key, range]) => (
            <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={`score-badge ${SCORE_TIERS[key].badgeClass} h-8 w-8 rounded-md text-xs`}>
                {range.split('-')[0]}
              </span>
              <span className="w-28 shrink-0 font-semibold">{SCORE_TIERS[key].label}</span>
              <span className="w-16 shrink-0 tabular-nums text-ink-faint">{range}</span>
              <span className="min-w-0 basis-full pl-11 text-ink-muted sm:basis-auto sm:flex-1 sm:pl-0">
                {SCORE_TIERS[key].blurb}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
