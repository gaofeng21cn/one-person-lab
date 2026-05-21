#!/usr/bin/env bash
set -euo pipefail

if [ -z "${OPL_REPO_TEMP_ENV_ACTIVE:-}" ]; then
  exec "$(dirname "$0")/run-with-repo-temp-env.sh" "$0" "$@"
fi

if [[ "${1:-}" != "full" ]]; then
  echo "Usage: $0 full" >&2
  exit 2
fi

parallel_lanes=(
  "test:fast:parallel"
  "test:fresh-install"
  "test:structure"
  "typecheck"
  "lint"
)

serial_lanes=(
  "test:read-model-gates"
  "test:meta"
  "test:regression"
  "test:integration"
  "test:artifact"
  "test:native"
)

log_root="$(mktemp -d "${TMPDIR:-/tmp}/opl-test-full.XXXXXX")"
trap 'rm -rf "${log_root}"' EXIT

declare -a lane_statuses=()

for lane in "${parallel_lanes[@]}"; do
  (
    echo "[${lane}] start"
    npm run "${lane}"
  ) >"${log_root}/${lane//:/_}.log" 2>&1 &
  lane_statuses+=("${lane}|$!")
done

exit_code=0
for lane_status in "${lane_statuses[@]}"; do
  lane="${lane_status%%|*}"
  pid="${lane_status##*|}"
  if ! wait "${pid}"; then
    exit_code=1
  fi
  sed "s/^/[${lane}] /" "${log_root}/${lane//:/_}.log"
done

for lane in "${serial_lanes[@]}"; do
  (
    echo "[${lane}] start"
    npm run "${lane}"
  ) >"${log_root}/${lane//:/_}.log" 2>&1 || exit_code=1
  sed "s/^/[${lane}] /" "${log_root}/${lane//:/_}.log"
done

exit "${exit_code}"
