#!/usr/bin/env bash
set -u -o pipefail

compare_ref="${OPL_QUALITY_DETAILS_COMPARE_REF:-origin/main}"
quality_details_limit="${OPL_QUALITY_DETAILS_LIMIT:-30}"
quality_details_timeout_seconds="${OPL_QUALITY_DETAILS_TIMEOUT_SECONDS:-240}"

emit_quality_details() {
  local reason="$1"
  local resolved_compare_ref="$compare_ref"

  echo
  echo "## OPL structural diff summary (${reason})"
  if ! git rev-parse --verify "${resolved_compare_ref}^{commit}" >/dev/null 2>&1; then
    if git rev-parse --verify "HEAD^" >/dev/null 2>&1; then
      resolved_compare_ref="HEAD^"
    fi
  fi
  node ./scripts/run-quality-details-with-timeout.mjs \
    "$quality_details_timeout_seconds" \
    "$resolved_compare_ref" \
    "$quality_details_limit" || true
}

run_gate() {
  if [ ! -f .sentrux/baseline.json ]; then
    echo "::notice::No .sentrux/baseline.json found; skipping Sentrux gate."
    return 0
  fi
  if ! command -v sentrux >/dev/null 2>&1; then
    echo "::notice::sentrux binary not installed; skipping Sentrux gate."
    return 0
  fi

  sentrux gate .
  local status=$?
  if [ "$status" -ne 0 ]; then
    emit_quality_details "sentrux baseline regression advisory"
    echo "::warning::Sentrux baseline regression reported structural drift (advisory)." >&2
    return 0
  fi
}

run_rules_check() {
  if [ ! -f .sentrux/rules.toml ]; then
    echo "Sentrux explicit rules are not configured; baseline regression checks remain active."
    return 0
  fi
  if ! command -v sentrux >/dev/null 2>&1; then
    return 0
  fi

  sentrux check .
  local status=$?
  if [ "$status" -ne 0 ]; then
    emit_quality_details "sentrux rules advisory"
    echo "::warning::Sentrux explicit rules reported structural drift (advisory)." >&2
    return 0
  fi
}

run_gate || exit $?
run_rules_check || exit $?
