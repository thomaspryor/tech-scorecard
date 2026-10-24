Close out the session so the owner can walk away.

1. Inventory: `git log --oneline origin/main..HEAD` and `git status`. Anything uncommitted, unpushed or in an open PR is unfinished.
2. Land it: PR merged, CI green, Vercel production deploy READY (not just the GitHub run). Check the live page or image, not "should be fine".
3. Run `/ship-check` first if code changed and it has not run, then `/what-else` if it has not run.
4. Stop any dev servers or background jobs you started.
5. Write the report in plain English, no PR or git jargon: what changed, what the owner will see, anything left over.
6. End with exactly one last line:
   - `SAFE TO ARCHIVE` — everything is merged, live and verified, nothing pending.
   - `KEEP OPEN — <what you are waiting on>` — a deploy, a build or a worker session will report back and you still need to act.
   - `ACTION NEEDED FROM YOU — <one plain sentence>` — only for a real decision or account step only the owner can do, with your recommendation.
