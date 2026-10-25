import { TIER_WEIGHTS } from '@/config/scoring';

/** "T1 ▂▄▆█" chip, same idea as Broadway Scorecard's OutletTierChip. */
export function OutletTierChip({ tier }: { tier: 1 | 2 | 3 | 4 }) {
  const bars = 5 - tier;
  const label = `Tier ${tier} outlet, weighted ${Math.round(TIER_WEIGHTS[tier] * 100)}%`;
  // title is mouse-only; the sr-only copy gives screen readers the same words (Broadway BRO-4881).
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm border border-line px-1.5 py-px text-[10px] font-bold text-ink-muted"
      title={label}
    >
      <span aria-hidden="true">T{tier}</span>
      <span className="flex items-end gap-[1.5px]" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`w-[2px] rounded-[1px] ${i <= bars ? 'bg-ink-muted' : 'bg-line-strong'}`}
            style={{ height: 2 + i * 2 }}
          />
        ))}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
