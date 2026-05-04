#!/usr/bin/env bash
set -u -o pipefail

compare_ref="${OPL_QUALITY_DETAILS_COMPARE_REF:-origin/main}"
quality_details_bin="${OPL_QUALITY_DETAILS_BIN:-./bin/opl}"
quality_details_limit="${OPL_QUALITY_DETAILS_LIMIT:-30}"
quality_details_focus="${OPL_QUALITY_DETAILS_FOCUS:-auto}"

emit_quality_details() {
  local reason="$1"

  echo
  echo "## OPL quality details (${reason})"
  if ! "$quality_details_bin" quality details --root . --format markdown --limit "$quality_details_limit" --focus "$quality_details_focus" --compare-ref "$compare_ref"; then
    echo "::warning::OPL quality details failed for compare ref: ${compare_ref}" >&2
  fi
}

run_gate() {
  if [ ! -f .sentrux/baseline.json ]; then
    echo "::notice::No .sentrux/baseline.json found; skipping Sentrux gate."
    return 0
  fi

  sentrux gate .
  local status=$?
  if [ "$status" -ne 0 ]; then
    emit_quality_details "sentrux gate failed"
    return "$status"
  fi
}

run_rules_check() {
  if [ ! -f .sentrux/rules.toml ]; then
    echo "::notice::No .sentrux/rules.toml found; skipping Sentrux rules check."
    return 0
  fi

  sentrux check .
  local status=$?
  if [ "$status" -ne 0 ]; then
    emit_quality_details "sentrux check failed"
    return "$status"
  fi
}

run_gate || exit $?
run_rules_check || exit $?
