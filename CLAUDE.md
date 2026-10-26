# Tech Scorecard

Static Next.js site (`output: 'export'`) that combines professional tech reviews into one critic score. Production: https://www.thetechscorecard.com. Sister project: Broadway Scorecard (`thomaspryor/Broadwayscore`); tier names are shared, cutoffs are not (see below).

## Who you work for

The owner is not technical and does not review code, read diffs, or merge PRs. The whole system is meant to run on its own. Never ask them to review, approve, merge, run a command, or open a settings page. If something needs a human decision, ask in one plain-English sentence with your recommendation.

## Finishing work (do all of it, unprompted)

1. Run `npm run check` and `npm run build` before pushing. Look at any visual change (screenshot or generated image) yourself.
2. Push a branch, open a PR, wait for CI and the Vercel preview to go green, fix anything red.
3. Merge it yourself (squash) once green. Do not leave a draft or "waiting on review". This overrides the default of leaving PRs as drafts.
4. Confirm the production deploy is READY on Vercel, not just that GitHub passed.
5. Report in plain English: what changed, what the owner will see, anything they need to do (usually nothing). No PR jargon.
6. For anything beyond a trivial edit, run `/ship-check` before pushing, then `/what-else` and `/wrap-up` at the end. `/plan-review`, `/second-opinion`, `/did-it-work`, `/right-problem`, `/plan-tasks` and `/last30days` are here too (`.claude/commands/`, `.claude/skills/`, copied from Broadwayscore since cloud sessions only see a repo's own `.claude/`).
7. Your last line is always one of: `SAFE TO ARCHIVE`, `KEEP OPEN: <what you wait on>`, or `ACTION NEEDED FROM YOU: <one sentence>`. Use SAFE TO ARCHIVE only when it is merged, live and verified.

## Rules

- Never publish unverified review scores or quotes. Every review links to the original (see `/methodology`).
- Product photos follow docs/IMAGES.md (official press photos, credited).
- Score tiers live in `src/config/score-buckets.ts`; Critical Gold starts at 90 (tiers 90/80/70/60, recalibrated 2026-10-26 from the score distribution).
- Share images: product pages have a generated card at `src/app/product/[slug]/opengraph-image.tsx`. Messaging apps cache previews per URL, so test with `?v=N` on the link.
- SEO notes: docs/SEO-PLAN.md. Data changes run `npm run validate` first.

## Keep this file under 100 lines

Add new rules here only if they change what a future session does.
