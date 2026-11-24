#!/usr/bin/env bash
set -euo pipefail

if [ -z "${OPL_REPO_TEMP_ENV_ACTIVE:-}" ]; then
  exec "$(dirname "$0")/run-with-repo-temp-env.sh" "$0" "$@"
fi

lane="${1:-smoke}"

case "$lane" in
  smoke)
    npm run test:smoke
    ;;
  fast)
    npm run test:fast
    ;;
  meta)
    npm run test:meta
    ;;
  regression)
    npm run test:regression
    ;;
  integration)
    npm run test:integration
    ;;
  structure|structure:strict)
    npm run source:modules -- --strict-imports --strict-cycles
    ./scripts/run-structural-quality-gate.sh
    ;;
  family)
    family_tmp_cleanup=0
    if [ -n "${OPL_FAMILY_PYTHON_TMP_ROOT:-}" ]; then
      family_tmp_root="${OPL_FAMILY_PYTHON_TMP_ROOT}"
    else
      family_tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/opl-family-python.XXXXXX")"
      family_tmp_cleanup=1
    fi
    cleanup_family_tmp() {
      if [ "${family_tmp_cleanup}" = "1" ]; then
        rm -rf "${family_tmp_root}"
      fi
    }
    trap cleanup_family_tmp EXIT
    mkdir -p "${family_tmp_root}"
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPYCACHEPREFIX="${PYTHONPYCACHEPREFIX:-${family_tmp_root}/pycache}" \
    PYTEST_ADDOPTS="${PYTEST_ADDOPTS:-} -p no:cacheprovider -o cache_dir=${family_tmp_root}/pytest-cache" \
    PYTHONPATH=python pytest python/tests
    ;;
  fresh-install)
    npm run test:fresh-install
    ;;
  artifact)
    npm run test:artifact
    ;;
  native)
    npm run native:doctor
    npm run native:family-smoke
    npm run native:family-smoke -- --fixture --require-real-workspaces
    ;;
  full)
    npm run test:full
    ;;
  lint)
    npm run lint
    ;;
  typecheck)
    npm run typecheck
    ;;
  *)
    echo "Unknown lane: $lane" >&2
    echo "Usage: scripts/verify.sh [smoke|fast|regression|integration|structure|family|meta|fresh-install|artifact|native|full|lint|typecheck]" >&2
    exit 1
    ;;
esac
