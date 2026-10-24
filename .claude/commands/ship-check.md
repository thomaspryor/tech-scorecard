Independent review of finished work before it ships. Run it after any change to `src/`, `scripts/`, `data/`, `.github/` or tests, before pushing.

1. Scope: `git diff origin/main --stat`, then read the changed files.
2. Checks: `npm run check` and `npm run build`. Both must pass. If data changed, `npm run validate`.
3. Independent reviewer: spawn one `Agent` (subagent_type `general-purpose`) with a real review prompt (200+ characters) that includes the diff and asks it to hunt for bugs, broken pages, wrong scores, missing credits or links, and anything that would look bad on thetechscorecard.com. Do not hand it your conclusion.
4. If the diff touches UI or generated images, look at the result yourself (screenshot or the built image) at phone width.
5. Fix real findings. Say in one line each what you fixed and what you left alone and why.
6. Finish with a `COVERAGE:` block, one line per step: `ran: <command or agent>` or `skipped: <reason>`.
