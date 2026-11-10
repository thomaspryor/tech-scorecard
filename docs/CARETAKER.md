# Daily caretaker

A scheduled Claude session ("Tech Scorecard daily caretaker") runs this every evening, after the daily refresh.
It does the jobs that used to wait for a person, so nothing on this site depends on the owner noticing a
GitHub issue or merging a PR. The owner does not read GitHub. Their only contact is this session's final
message.

Read CLAUDE.md first. Its "Finishing work" rules apply to every fix (branch, PR, CI and Vercel preview green,
squash-merge it yourself, confirm the production deploy is READY on Vercel).

## 1. A failed daily refresh

- Look for an open issue labelled `refresh-failed`, and at the latest runs of `weekly-refresh.yml`
  ("Daily refresh") and `sync-claude-skills.yml`.
- If the newest run of a workflow succeeded after the failure, the problem fixed itself. The refresh
  workflow closes its own alert issue after a clean run, so leave it.
- If the latest run failed, read the failed job's log and find the cause.
  - **A fault in this repo** (a script error, a validation failure, a broken test): fix it, land it, then
    re-run the workflow (`workflow_dispatch`) and confirm it goes green.
  - **An outside outage** (an API down, a feed unreachable, a rate limit): change nothing, and say so in
    one line. Re-run the workflow only once, and only if the failure was more than 6 hours ago.
  - **The same failure for 3 days in a row**: root-cause it properly. "Flaky" is not a cause.
- If an API key is rejected (401/403 from OpenAI or Gemini), only the owner can fix that. Report it with
  the last-line format below.

## 2. Pull requests nobody is merging

- **Dependabot PRs**: `dependabot-merge.yml` merges these once CI passes. If one is red, find out why.
  Fix it on the PR branch if the fix is small and safe. If the upgrade cannot work yet, close the PR
  with a one-line comment saying why.
- **Other PRs open more than a day** (left by a session that stopped early): finish them per CLAUDE.md
  if they are green and their purpose is clear. If one is abandoned or superseded, close it with a
  one-line comment.

## 3. Reviews the two scoring models disagree on

`npm run validate` passes with these, but each one is a published score that two models placed more than
15 points apart.

1. Find them: reviews in `data/reviews.json` with `modelsDisagree: true` and no `adjudicatedScore`.
2. For each one, read the original article.
3. Record `adjudicatedScore` inside the review's band, and an `adjudicationReason` of one plain sentence.
   The README "How scores work" section explains bands and the adjudication fields.
4. Land the changes as one PR.

## 4. Photos and names

- `npm run validate` already fails if a product the refresh added has no photo, or if a name does not
  start with its brand.
- Also look at the newest 3 products on https://www.thetechscorecard.com.
- If a photo shows the wrong product, or is mostly logo or text, replace it with
  `scripts/add-product-image.js`, following docs/IMAGES.md (an official brand image, credited).

## 5. The backfill adding nothing

The daily refresh also fills catalogue gaps (docs/PIPELINE.md, "Backfill"): up to 3 older products a day, until
every category has 15. It should add something most days, so a quiet week means it is stuck.

1. Run `npm run backfill:status`. It prints products per category, what is next, and a verdict.
2. `complete` or `ok`: nothing to do. `complete` means every category has 15 products.
3. `stalled` (exit code 1: work remains and no backfilled product was added for 7 days): find out why. Read the
   backfill lines of the latest runs of `weekly-refresh.yml` ("backfill:", "backfill candidate:", "only N verified
   reviews", "no usable official photo yet") and `data/refresh-rejected.json` (`backfill:` keys).
   - **The step crashed or its search failed** (look for "The backfill" in the run's problems): a fault in this repo
     gets fixed and landed like section 1; an outside outage waits a day.
   - **Every candidate fails for the same reason** (no photos, quotes never found, a card rule): fix that cause
     in the scripts. Do not loosen a check: a quote that fails verification stays dropped, and a product
     without an official photo or with fewer than 5 reviews from outlets in `data/outlets.json` is not added.
   - **The category really has nothing left** (its candidates are all on the site or rejected): `data/backfill-state.json`
     already rests a category for 14 days after 3 empty runs, so the others go ahead. If every remaining
     category is resting, say so in one line; it will try again by itself.
4. Never add products by hand to get around a stall.

## Rules

- Never publish unverified scores or quotes.
- Never skip or disable a test to get green.
- Never call send_later or create_trigger, and never create sessions.
- If there was nothing to do, say so in one line.
- End with a plain-English summary of what changed, then a last line of exactly one of:
  - `SAFE TO ARCHIVE`
  - `ACTION NEEDED FROM YOU: <one sentence with your recommendation>`. Use this only for things only
    the owner can do, such as a rejected API key or a payment.
