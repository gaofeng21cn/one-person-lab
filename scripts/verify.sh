#!/usr/bin/env bash
set -euo pipefail

lane="${1:-smoke}"

node scripts/line-budget.mjs

case "$lane" in
  smoke|fast)
    npm test
    ;;
  structure)
    ./scripts/run-structural-quality-gate.sh
    ;;
  family)
    npm run family:shared-release -- check
    PYTHONPATH=python/opl-harness-shared/src \
      pytest \
      python/opl-harness-shared/tests/test_family_shared_release.py \
      python/opl-harness-shared/tests/test_editable_dependency_bootstrap.py \
      python/opl-harness-shared/tests/test_editable_consumer_bootstrap.py \
      python/opl-harness-shared/tests/test_editable_consumer_launcher.py
    ;;
  meta)
    npm run test:meta
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
    :
    ;;
  typecheck)
    npm run typecheck
    ;;
  *)
    echo "Unknown lane: $lane" >&2
    echo "Usage: scripts/verify.sh [smoke|fast|structure|family|meta|fresh-install|artifact|native|full|lint|line-budget|typecheck]" >&2
    exit 1
    ;;
esac
