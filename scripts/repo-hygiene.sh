#!/usr/bin/env bash
set -euo pipefail

fix=0
if [ "${1:-}" = "--fix" ]; then
  fix=1
elif [ "$#" -gt 0 ]; then
  echo "Usage: scripts/repo-hygiene.sh [--fix]" >&2
  exit 2
fi

if [ "${fix}" = "1" ]; then
  while IFS= read -r path_to_remove; do
    if git check-ignore -q -- "${path_to_remove}"; then
      rm -rf "${path_to_remove}"
    fi
  done < <(
    find . \
      -path './.git' -prune -o \
      -path './node_modules' -prune -o \
      -path './dist' -prune -o \
      -path './target' -prune -o \
      -path './.worktrees' -prune -o \
      \( -name '.venv' -o -name '__pycache__' -o -name '.pytest_cache' -o -name '*.egg-info' -o -name '.DS_Store' \) \
      -print
  )
fi

tracked="$(
  git ls-files -- \
    tmp \
    ':(glob)**/dist/**' \
    ':(glob)**/build/**' \
    ':(glob)**/out/**' \
    ':(glob)**/__pycache__/**' \
    ':(glob)**/*.egg-info/**' \
    ':(glob)**/.DS_Store' \
    ':(glob)**/.codex/**' \
    ':(glob)**/.omx/**' \
    ':(glob)**/.opl-state/**' \
    ':(glob)**/.runtime-program/**' \
    ':(glob)**/runtime-state/**' \
    .agent-contract-baseline.json
)"

if [ -n "$tracked" ]; then
  printf '%s\n%s\n' 'repo hygiene: forbidden tracked paths:' "$tracked" >&2
  exit 1
fi

unignored_generated="$(
  git ls-files --others --exclude-standard -- \
    tmp \
    ':(glob)**/dist/**' \
    ':(glob)**/build/**' \
    ':(glob)**/out/**' \
    ':(glob)**/target/**' \
    ':(glob)**/.venv/**' \
    ':(glob)**/__pycache__/**' \
    ':(glob)**/.pytest_cache/**' \
    ':(glob)**/*.egg-info/**' \
    ':(glob)**/.DS_Store' \
    ':(glob)**/.codex/**' \
    ':(glob)**/.omx/**' \
    ':(glob)**/.opl-state/**' \
    ':(glob)**/.runtime-program/**' \
    ':(glob)**/runtime-state/**' \
    .agent-contract-baseline.json
)"

if [ -n "$unignored_generated" ]; then
  printf '%s\n%s\n' 'repo hygiene: generated paths are not ignored:' "$unignored_generated" >&2
  printf '%s\n' 'Route the producer to OPL_REPO_TEMP_ROOT or add an explicit ignore for unavoidable local runtime output.' >&2
  exit 1
fi
