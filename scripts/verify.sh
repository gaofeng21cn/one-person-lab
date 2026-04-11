#!/usr/bin/env bash
set -euo pipefail

lane="${1:-smoke}"

case "$lane" in
  smoke|fast)
    npm test
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
    echo "Usage: scripts/verify.sh [smoke|fast|meta|artifact|full|typecheck]" >&2
    exit 1
    ;;
esac
