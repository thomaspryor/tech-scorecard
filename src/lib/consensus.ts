import type { ComputedProduct } from './engine';
import { formatDate } from './format';
import { RECOMMENDED_MIN } from '@/config/score-buckets';

const AGREE_WITHIN = 12;
const SPLIT_AT = 30;
/** Tier 1 against the rest is only worth saying when the gap is at least this many points. */
const OUTLET_GAP = 4;

function names(list: { outlet: { name: string } }[]): string {
  const n = list.map((r) => r.outlet.name);
  if (n.length <= 2) return n.join(' and ');
  return `${n.slice(0, 2).join(', ')} and ${n.length - 2} more`;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Short, factual sentences on how the critics line up, built only from the review scores, dates and
 * awards already on the page. Empty when the product has no score yet. Page copy, so no em dashes.
 */
export function consensusSentences(p: ComputedProduct): string[] {
  const reviews = p.reviews; // sorted best first
  if (p.criticScore == null || reviews.length === 0) return [];
  const n = reviews.length;
  const hi = reviews[0];
  const lo = reviews[n - 1];
  const spread = hi.score - lo.score;
  const out: string[] = [];

  if (spread <= AGREE_WITHIN)
    out.push(`Critics largely agree: all ${n} reviews land between ${lo.score} and ${hi.score}.`);
  else if (spread >= SPLIT_AT)
    out.push(`Critics are split: scores run from ${lo.score} to ${hi.score} across ${n} reviews.`);
  else out.push(`Scores run from ${lo.score} to ${hi.score} across ${n} reviews.`);

  if (spread > AGREE_WITHIN) {
    const tops = reviews.filter((r) => r.score === hi.score);
    const bottoms = reviews.filter((r) => r.score === lo.score);
    out.push(
      `${names(tops)} ${tops.length > 1 ? 'are' : 'is'} the most enthusiastic at ${hi.score}, ${names(bottoms)} the least at ${lo.score}.`,
    );
  }

  const strong = reviews.filter((r) => r.score >= RECOMMENDED_MIN).length;
  if (strong === n) out.push(`Every review scores ${RECOMMENDED_MIN} or higher.`);
  else if (strong === 0) out.push(`None of the ${n} reviews reaches ${RECOMMENDED_MIN}.`);
  else out.push(`${strong} of ${n} reviews score ${RECOMMENDED_MIN} or higher.`);

  const major = reviews.filter((r) => r.outlet.tier === 1);
  const rest = reviews.filter((r) => r.outlet.tier !== 1);
  if (major.length >= 2 && rest.length >= 2) {
    const a = Math.round(mean(major.map((r) => r.score)));
    const b = Math.round(mean(rest.map((r) => r.score)));
    if (Math.abs(a - b) >= OUTLET_GAP)
      out.push(`The ${major.length} major national outlets average ${a}, against ${b} for the other ${rest.length}.`);
  }

  const awarded = reviews.filter((r) => r.editorsChoice);
  if (awarded.length > 0) out.push(`${names(awarded)} gave it an Editors' Choice award.`);

  const dates = reviews.map((r) => r.date).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  out.push(
    first === last
      ? `All the reviews were published on ${formatDate(first)}.`
      : `Reviews were published between ${formatDate(first)} and ${formatDate(last)}.`,
  );
  return out;
}
