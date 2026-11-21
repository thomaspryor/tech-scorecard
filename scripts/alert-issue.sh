#!/usr/bin/env bash
# Opens, updates or closes the one GitHub issue for a kind of health finding, the way the daily refresh handles its own alert:
# a non-empty FILE opens the issue (or comments on the open one, only when its "- " lines changed, so a lasting problem does not
# email every week); an empty FILE closes any open one. The daily caretaker session reads these issues (docs/CARETAKER.md).
# Usage: scripts/alert-issue.sh <label> <title> <file>    (needs GH_TOKEN and GH_REPO)
set -euo pipefail
LABEL="$1"; TITLE="$2"; FILE="$3"
gh label create "$LABEL" --color D93F0B --description "$TITLE" --force >/dev/null
OPEN=$(gh issue list --label "$LABEL" --state open --json number --jq '.[0].number')
if [ ! -s "$FILE" ]; then
  if [ -n "$OPEN" ]; then gh issue close "$OPEN" --comment "Clean on $(date -u +%Y-%m-%d). Closing."; fi
  echo "$LABEL: nothing to report."
  exit 0
fi
if [ -z "$OPEN" ]; then
  gh issue create --title "$TITLE" --label "$LABEL" --body-file "$FILE"
  exit 0
fi
LAST=$(gh issue view "$OPEN" --json body,comments --jq '(.comments | last | .body) // .body')
NOW=$(grep '^- ' "$FILE" | sort || true)
PREV=$(printf '%s\n' "$LAST" | grep '^- ' | sort || true)
if [ "$NOW" = "$PREV" ]; then echo "$LABEL: same as already reported in issue $OPEN; not posting again."
else gh issue comment "$OPEN" --body-file "$FILE"; fi
