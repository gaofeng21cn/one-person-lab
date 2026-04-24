#!/usr/bin/env bash
set -euo pipefail

lane="${1:-smoke}"

node scripts/line-budget.mjs

case "$lane" in
  smoke|fast)
    npm test
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
  artifact)
    npm run test:artifact
    ;;
  full)
    npm run test:full
    ;;
  typecheck)
    npm run typecheck
    ;;
  *)
    echo "Unknown lane: $lane" >&2
    echo "Usage: scripts/verify.sh [smoke|fast|family|meta|artifact|full|typecheck]" >&2
    exit 1
    ;;
esac
