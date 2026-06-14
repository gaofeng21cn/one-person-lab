#!/usr/bin/env bash
set -u -o pipefail

compare_ref="${OPL_QUALITY_DETAILS_COMPARE_REF:-origin/main}"
quality_details_bin="${OPL_QUALITY_DETAILS_BIN:-./bin/opl}"
quality_details_limit="${OPL_QUALITY_DETAILS_LIMIT:-30}"
quality_details_focus="${OPL_QUALITY_DETAILS_FOCUS:-auto}"
quality_details_timeout_seconds="${OPL_QUALITY_DETAILS_TIMEOUT_SECONDS:-240}"
strict_mode="${OPL_STRUCTURAL_QUALITY_STRICT:-0}"

run_quality_details_with_timeout() {
  local resolved_compare_ref="$1"

  node - "$quality_details_timeout_seconds" "$quality_details_bin" "$resolved_compare_ref" "$quality_details_limit" "$quality_details_focus" <<'NODE'
const [timeoutRaw, qualityDetailsBin, compareRef, limit, focus] = process.argv.slice(2);
const timeoutSeconds = Number(timeoutRaw);
if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
  console.error(`Invalid OPL_QUALITY_DETAILS_TIMEOUT_SECONDS: ${timeoutRaw}`);
  process.exit(64);
}

const { spawn } = require('node:child_process');
const child = spawn(
  qualityDetailsBin,
  [
    'quality',
    'details',
    '--root',
    '.',
    '--format',
    'markdown',
    '--limit',
    limit,
    '--focus',
    focus,
    '--compare-ref',
    compareRef,
  ],
  { stdio: 'inherit' },
);

let timedOut = false;
let killTimer;
const timer = setTimeout(() => {
  timedOut = true;
  child.kill('SIGTERM');
  killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
  killTimer.unref();
}, timeoutSeconds * 1000);

child.on('error', (error) => {
  clearTimeout(timer);
  if (killTimer) clearTimeout(killTimer);
  console.error(error.message);
  process.exit(127);
});

child.on('close', (code, signal) => {
  clearTimeout(timer);
  if (killTimer) clearTimeout(killTimer);
  if (timedOut) {
    process.exit(124);
  }
  if (signal) {
    console.error(`OPL quality details terminated by signal: ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
NODE
}

emit_quality_details() {
  local reason="$1"
  local resolved_compare_ref="$compare_ref"

  echo
  echo "## OPL quality details (${reason})"
  if ! git rev-parse --verify "${resolved_compare_ref}^{commit}" >/dev/null 2>&1; then
    if git rev-parse --verify "HEAD^" >/dev/null 2>&1; then
      echo "::notice::Compare ref ${compare_ref} is unavailable; using HEAD^ for quality details." >&2
      resolved_compare_ref="HEAD^"
    fi
  fi
  run_quality_details_with_timeout "$resolved_compare_ref"
  local details_status=$?
  if [ "$details_status" -eq 124 ]; then
    echo "::warning::OPL quality details exceeded ${quality_details_timeout_seconds}s in the local structure gate; use the Sentrux Advisory workflow for the full quality-details artifact." >&2
  elif [ "$details_status" -ne 0 ]; then
    echo "::warning::OPL quality details failed for compare ref: ${resolved_compare_ref}" >&2
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
    emit_quality_details "sentrux baseline regression advisory"
    echo "::warning::Sentrux baseline regression reported structural drift; quality details were emitted for triage. Default structure checks are advisory; use ./scripts/verify.sh structure:strict for the maintenance hard gate." >&2
    return 0
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
    emit_quality_details "sentrux rules advisory"
    if [ "$strict_mode" = "1" ] || [ "$strict_mode" = "true" ] || [ "$strict_mode" = "yes" ]; then
      return "$status"
    fi
    echo "::warning::Sentrux explicit rules reported structural drift; default structure lane is advisory. Re-run with OPL_STRUCTURAL_QUALITY_STRICT=1 or ./scripts/verify.sh structure:strict for the maintenance hard gate." >&2
    return 0
  fi
}

run_gate || exit $?
run_rules_check || exit $?
