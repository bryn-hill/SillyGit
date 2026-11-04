#!/usr/bin/env bash
# Deletes remote branches whose work is already on dev or main.
#
# A branch counts as merged when any of these hold:
#   - its tip is reachable from origin/dev or origin/main (merged or fast-forwarded)
#   - every commit on it has a patch-identical commit on dev or main (rebased, then merged)
#   - merging it into dev or main would change nothing (squashed or conflict-resolved)
#
# main, dev, backup/* and branches with an open pull request are never touched.
#
# Usage: scripts/prune-merged-branches.sh [--dry-run]
# Needs git with full history of origin, and gh signed in (or GH_TOKEN) with
# contents: write on the repo. GITHUB_REPOSITORY picks the repo (default bryn-hill/SillyGit).
set -euo pipefail

dry_run=false
[ "${1:-}" = "--dry-run" ] && dry_run=true

repo="${GITHUB_REPOSITORY:-bryn-hill/SillyGit}"

git fetch --prune --quiet origin '+refs/heads/*:refs/remotes/origin/*'

open_heads="$(gh api --paginate "repos/$repo/pulls?state=open&per_page=100" --jq '.[].head.ref')"

is_merged_into() {
  local branch="$1" base="$2"
  git merge-base --is-ancestor "$branch" "$base" && return 0
  # git cherry marks commits with no patch-identical twin on base with '+'.
  if git merge-base "$branch" "$base" >/dev/null 2>&1 &&
    ! git cherry "$base" "$branch" | grep -q '^+'; then
    return 0
  fi
  local merged
  merged="$(git merge-tree --write-tree "$base" "$branch" 2>/dev/null | head -n1)" || return 1
  [ "$merged" = "$(git rev-parse "$base^{tree}")" ]
}

deleted=0
kept=0
for ref in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin); do
  branch="${ref#origin/}"
  case "$branch" in
    origin | HEAD | main | dev | backup/*) continue ;;
  esac
  if printf '%s\n' "$open_heads" | grep -qxF "$branch"; then
    echo "keep   $branch (open pull request)"
    kept=$((kept + 1))
    continue
  fi
  if is_merged_into "$ref" origin/dev || is_merged_into "$ref" origin/main; then
    if $dry_run; then
      echo "would delete $branch"
    else
      gh api --silent -X DELETE "repos/$repo/git/refs/heads/$branch"
      echo "delete $branch"
    fi
    deleted=$((deleted + 1))
  else
    echo "keep   $branch (not merged)"
    kept=$((kept + 1))
  fi
done

echo "$deleted merged, $kept kept"
