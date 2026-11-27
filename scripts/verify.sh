#!/usr/bin/env bash
set -euo pipefail

if [ -z "${OPL_REPO_TEMP_ENV_ACTIVE:-}" ]; then
  exec "$(dirname "$0")/run-with-repo-temp-env.sh" "$0" "$@"
fi

lane="${1:-smoke}"

case "$lane" in
  smoke)
    npm run v2:build
    npm run v2:typecheck
    npm run v2:guard
    npm run v2:test
    npm run lint
    ./scripts/repo-hygiene.sh
    node --experimental-strip-types ./scripts/generate-v2-contracts.mjs --check
    ;;
  fast)
    npm run test:fast
    ;;
  artifact)
    npm run test:artifact
    ;;
  structure|structure:strict)
    npm run v2:guard
    ./scripts/run-structural-quality-gate.sh
    ;;
  family)
    node --test extensions/foundry/tests/*.test.mjs
    for f in extensions/foundation-skills/skills/*/kernel.py; do
      PYTHONDONTWRITEBYTECODE=1 python3 -B "$f"
    done
    PYTHONDONTWRITEBYTECODE=1 TMPDIR=/tmp PYTHONPATH=sdks/python-client/src python3 -B -m unittest discover -s sdks/python-client/tests -v
    PYTHONDONTWRITEBYTECODE=1 TMPDIR=/tmp node sdks/python-client/tests/test_opld_e2e.mjs
    node --test tests/release-note-writer.test.mjs tests/flow-capability-compiler.test.mjs
    node --experimental-strip-types --test tests/dependency-release-resolution.test.ts
    PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest tests/product_release_test.py tests/package_daily_status_test.py tests/package_channel_detection_test.py -v
    ;;
  e2e)
    node ./tests/e2e/run.mjs
    ;;
  full)
    "$0" smoke
    "$0" artifact
    "$0" structure
    "$0" family
    node --test tests/e2e/harness.self.test.mjs tests/e2e/stubs/stubs.self.test.mjs
    if [ "${OPL_VERIFY_INCLUDE_E2E:-0}" = "1" ]; then
      "$0" e2e
    fi
    ;;
  lint)
    npm run lint
    ;;
  typecheck)
    npm run typecheck
    ;;
  *)
    echo "Unknown lane: $lane" >&2
    echo "Usage: scripts/verify.sh [smoke|fast|artifact|structure|family|e2e|full|lint|typecheck]" >&2
    exit 1
    ;;
esac
