#!/usr/bin/env bash
set -euo pipefail

framework_repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_repo="${OPL_APP_REPO:-"$framework_repo/../one-person-lab-app"}"
cloud_repo="${OPL_CLOUD_REPO:-"$framework_repo/../one-person-lab-cloud"}"

run_in_repo() {
  local repo="$1"
  local command="$2"
  if ! git -C "$repo" rev-parse --git-dir >/dev/null 2>&1; then
    echo "Missing repo: $repo" >&2
    exit 1
  fi
  echo "==> $(basename "$repo"): $command"
  (cd "$repo" && bash -lc "$command")
}

for repo in "$app_repo" "$cloud_repo"; do
  if ! cmp -s "$framework_repo/scripts/opl-whitepaper-builder.ts" "$repo/scripts/opl-whitepaper-builder.ts"; then
    echo "Shared builder drift: $repo/scripts/opl-whitepaper-builder.ts" >&2
    exit 1
  fi
done

run_in_repo "$framework_repo" "npm run docs:whitepaper"
run_in_repo "$app_repo" "npm run docs:whitepaper"
run_in_repo "$cloud_repo" "node --experimental-strip-types scripts/build-opl-cloud-whitepaper.ts"
