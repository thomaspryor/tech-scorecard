// Tech critics rate high (83% of published ratings are 8/10 or better, median product score 84 vs Broadway's 73),
// so every cutoff sits 5-10 points above Broadway's (owner, 2026-10-26). Gold = 90+ matches the "rave" line in
// docs/PIPELINE.md and covers about 18% of products, close to Broadway's share.
export const GOLD_MIN = 90;
export const RECOMMENDED_MIN = 80;
export const WORTH_IT_MIN = 70;
export const MIXED_MIN = 60;

export type TierKey = 'gold' | 'recommended' | 'worthIt' | 'mixed' | 'miss';

export interface ScoreTier {
  label: string;
  blurb: string;
  badgeClass: string;
  textClass: string;
}

export const SCORE_TIERS: Record<TierKey, ScoreTier> = {
  gold: {
    label: 'Critical Gold',
    blurb: 'Best in class. If you are buying one, buy this.',
    badgeClass: 'score-must-see',
    textClass: 'text-[#8b6508]',
  },
  recommended: {
    label: 'Recommended',
    blurb: 'A strong buy for most people.',
    badgeClass: 'score-great',
    textClass: 'text-score-great',
  },
  worthIt: {
    label: 'Worth a Look',
    blurb: 'Good, with caveats. Best if its strengths are your priorities.',
    badgeClass: 'score-good',
    textClass: 'text-score-good',
  },
  mixed: { label: 'Mixed', blurb: 'Critics are split.', badgeClass: 'score-tepid', textClass: 'text-score-tepid' },
  miss: { label: 'Critical Miss', blurb: 'Not recommended.', badgeClass: 'score-skip', textClass: 'text-score-skip' },
};

export function getTierKey(score: number): TierKey {
  const s = Math.round(score);
  if (s >= GOLD_MIN) return 'gold';
  if (s >= RECOMMENDED_MIN) return 'recommended';
  if (s >= WORTH_IT_MIN) return 'worthIt';
  if (s >= MIXED_MIN) return 'mixed';
  return 'miss';
}

export function getScoreTier(score: number): ScoreTier {
  return SCORE_TIERS[getTierKey(score)];
}

/** Breakdown-bar labels per tier, so the bar and the badge colors always agree. */
export const BREAKDOWN_LABELS: Record<TierKey, { label: string; color: string }> = {
  gold: { label: 'Rave', color: '#f5c518' },
  recommended: { label: 'Positive', color: '#22c55e' },
  worthIt: { label: 'Favorable', color: '#14b8a6' },
  mixed: { label: 'Mixed', color: '#f59e0b' },
  miss: { label: 'Negative', color: '#ef4444' },
};
export const TIER_ORDER: TierKey[] = ['gold', 'recommended', 'worthIt', 'mixed', 'miss'];
