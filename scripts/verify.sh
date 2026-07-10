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
  structure)
    node scripts/line-budget.mjs
    ./scripts/run-structural-quality-gate.sh
    ;;
  structure:strict)
    node scripts/line-budget.mjs --strict
    OPL_STRUCTURAL_QUALITY_STRICT=1 ./scripts/run-structural-quality-gate.sh
    ;;
  reuse-first)
    npm run reuse-first:scan:diff
    ;;
  family)
    npm run family:shared-release -- check
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
    PYTHONPATH=python/opl-harness-shared/src \
      pytest \
      python/opl-harness-shared/tests/test_family_shared_release.py \
      python/opl-harness-shared/tests/test_editable_dependency_bootstrap.py \
      python/opl-harness-shared/tests/test_editable_consumer_bootstrap.py \
      python/opl-harness-shared/tests/test_editable_consumer_launcher.py
    ;;
  fresh-install)
    npm run test:fresh-install
    ;;
  artifact)
    npm run test:artifact
    ;;
  native)
    npm run native:doctor
    npm run native:prebuild-check
    npm run native:pack-check
    npm run native:test
    npm run native:build
    npm run native:cache
    npm run native:family-smoke
    ;;
  full)
    npm run test:full
    ;;
  lint)
    npm run lint
    ;;
  line-budget)
    node scripts/line-budget.mjs
    ;;
  line-budget:strict)
    node scripts/line-budget.mjs --strict
    ;;
  typecheck)
    npm run typecheck
    ;;
  *)
    echo "Unknown lane: $lane" >&2
    echo "Usage: scripts/verify.sh [smoke|fast|regression|integration|structure|structure:strict|reuse-first|family|meta|fresh-install|artifact|native|full|lint|line-budget|line-budget:strict|typecheck]" >&2
    exit 1
    ;;
esac
