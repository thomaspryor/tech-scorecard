import type { ScoredReview } from '@/lib/engine';
import { formatDate } from '@/lib/format';
import { OutletMark, OutletTierChip, ScoreBadge } from './product-cards';
import { ListSort } from './ListSort';

export function ReviewRow({ review }: { review: ScoredReview }) {
  return (
    <article className="flex gap-3 py-4 sm:gap-4">
      <ScoreBadge score={review.score} size="review" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <OutletMark name={review.outlet.name} />
          <span className="font-bold">{review.outlet.name}</span>
          <OutletTierChip tier={review.outlet.tier} />
          {review.editorsChoice && (
            <span
              className="rounded-sm bg-amber-100 px-1.5 py-px text-[11px] font-semibold text-amber-800"
              title="The outlet's own award badge, such as Editors' Choice, Best Buy or Recommended"
            >
              ★ Outlet award
            </span>
          )}
          <span className="ml-auto text-xs text-ink-faint">{formatDate(review.date)}</span>
        </div>
        <p className="mt-2 leading-relaxed text-ink">&ldquo;{review.excerpt}&rdquo;</p>
        {review.note && <p className="mt-1 text-xs italic text-ink-faint">{review.note}</p>}
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-ink-faint">
            {review.critic ? `By ${review.critic}` : 'Staff review'}
            {' · '}
            {review.rating ? (
              <span
                className="font-medium text-ink-muted"
                title={
                  review.scoreBand
                    ? `A ${review.rating} rating means ${review.scoreBand[0]}-${review.scoreBand[1]}; placed at ${review.score} ${review.scoredFromFullText === false ? 'from the quoted verdict (full article unavailable)' : 'by reading the review'}`
                    : undefined
                }
              >
                Rated {review.rating}
              </span>
            ) : (
              <span title="This outlet does not publish a score; we scored the review's verdict from its text.">
                Unrated, scored from text
              </span>
            )}
          </span>
          <a
            href={review.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-brand-ink hover:underline"
          >
            Full review <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </article>
  );
}

const VISIBLE = 6;

/**
 * The reviews, rendered once in score order (`reviews` arrives sorted by score). ListSort re-orders them
 * when the date radio is picked, keeping the first VISIBLE in view and the rest in the fold.
 */
export function ReviewList({ reviews, id, dateRadioId }: { reviews: ScoredReview[]; id: string; dateRadioId: string }) {
  const dateRank = new Map(
    [...reviews].sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score).map((r, i) => [r, i] as const),
  );
  const row = (r: ScoredReview, i: number) => (
    <div
      key={`${r.outletId}|${r.url}`}
      className="border-b border-line last:border-b-0"
      data-o-score={i}
      data-o-date={dateRank.get(r)}
    >
      <ReviewRow review={r} />
    </div>
  );
  const rest = reviews.slice(VISIBLE);
  return (
    <div>
      <div id={`${id}-head`}>{reviews.slice(0, VISIBLE).map(row)}</div>
      {rest.length > 0 && (
        <details className="more">
          <summary className="mt-2 cursor-pointer rounded-xl border border-line bg-surface-overlay py-3 text-center text-sm font-semibold text-brand-ink hover:border-line-strong">
            <span className="more-closed">Show {rest.length} more reviews ▾</span>
            <span className="more-open">Show fewer ▴</span>
          </summary>
          <div id={`${id}-rest`}>{rest.map((r, i) => row(r, i + VISIBLE))}</div>
        </details>
      )}
      <ListSort
        listId={`${id}-head`}
        dateRadioId={dateRadioId}
        fold={rest.length ? { id: `${id}-rest`, visible: VISIBLE } : undefined}
      />
    </div>
  );
}
