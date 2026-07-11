#!/usr/bin/env bash
# Auto-sync hook: after each task, commit all working-tree changes and push.
# Runs on the Stop event. Exits cleanly (0) even on failure so it never
# blocks the session; results are surfaced to the user via systemMessage.
set -uo pipefail

# Move to the repo root; bail quietly if we're not inside a git repo.
root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$root" || exit 0

# Nothing staged, unstaged, or untracked → nothing to sync.
if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi

ts="$(date '+%Y-%m-%d %H:%M')"
git add -A
if ! git commit -q -m "Auto-sync: $ts"; then
  printf '{"systemMessage":"⚠️ 자동 커밋 실패 — 수동 확인 필요"}\n'
  exit 0
fi

# Push the current branch to its origin counterpart.
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
if git push -q origin HEAD; then
  printf '{"systemMessage":"✅ 자동 커밋+푸시 완료 · origin/%s (%s)"}\n' "$branch" "$ts"
else
  printf '{"systemMessage":"⚠️ 커밋은 됐지만 푸시 실패 — 네트워크/인증 확인 후 수동 push 필요"}\n'
fi
exit 0
