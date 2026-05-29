# OPL series docs governance tranche ledger part 51

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_51`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 Codex CLI contract、stage runner protocol contract、runtime provider truth、domain truth、artifact authority、quality verdict、owner receipt、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/codex.ts`、`src/family-runtime-codex-stage-runner.ts`、tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 `src/codex.ts` 的过宽公共导出面：

- `src/codex.ts`
- `tests/src/family-runtime-codex-stage-runner-protocol.test.ts`
- process ledger index

目标是把 fallow 标出的 Codex output / unsupported function-call helper 收回为 module-private helper，并把唯一白盒测试改成 public stage-runner 行为验证。这里不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json --summary`
  - before part51, `unused_exports=184` from part50 memory.
  - after part51, `unused_exports=181`.
  - `unused_files=0`
  - `unused_dependencies=0`
  - `unresolved_imports=0`
  - `private_type_leaks=0`
  - `boundary_violations=0`
- CodeGraph context/callers for `summarizeCodexOutputLine`, `extractCodexRecentOutput`, and `findPendingUnsupportedFunctionCalls` showed these as `src/codex.ts` helper symbols without external production callers in the index.
- `rg -n "\b(summarizeCodexOutputLine|extractCodexRecentOutput|findPendingUnsupportedFunctionCalls)\b" src tests docs package.json`
  - after the change, outside this history ledger all three names appear only inside `src/codex.ts`.
  - tests no longer import `findPendingUnsupportedFunctionCalls` directly.
- `tests/src/family-runtime-codex-stage-runner-protocol.test.ts`
  - existing public runner tests already cover live unsupported function-call fail-fast and recovered-session unsupported function-call detection.
  - this tranche adds the symmetric public runner test for recovered-session function calls that have matching `function_call_output`.

## Changes

- `src/codex.ts`
  - Changed `summarizeCodexOutputLine` from exported helper to module-private function.
  - Changed `extractCodexRecentOutput` from exported helper to module-private function.
  - Changed `findPendingUnsupportedFunctionCalls` from exported helper to module-private function.
- `tests/src/family-runtime-codex-stage-runner-protocol.test.ts`
  - Removed direct import of `findPendingUnsupportedFunctionCalls`.
  - Replaced the white-box helper assertion with a public `runCodexStageRunner` scenario that recovers a session containing a resolved function call and verifies the result remains `no_output_timeout`, not `unsupported_tool_protocol`.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-51.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 51 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `src/codex.ts`
- `src/family-runtime-codex-stage-runner.ts`
- `tests/src/family-runtime-codex-stage-runner-protocol.test.ts`
- `tests/src/cli/helpers-parts/fixtures.ts`
- `docs/history/process/plans/README.md`
- fresh fallow summary
- CodeGraph status/context/caller output for the target helper symbols

Edited:

- `src/codex.ts`
- `tests/src/family-runtime-codex-stage-runner-protocol.test.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-51.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. Three TypeScript helper exports were retired from the public module surface.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `07086a9e` before part51 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab-opl-cleanup-part51-unused-codex-output-exports`.
- Branch: `codex/opl-doc-governance-20260529-part51-unused-codex-output-exports`, based on root `main`.

## Verification

Fresh verification before absorb:

- `npm ci` exited `0` and ran `npm run build`; npm audit still reports 10 high severity vulnerabilities, unchanged and not addressed.
- `node --test --experimental-strip-types tests/src/family-runtime-codex-stage-runner-protocol.test.ts` reported `tests 5`, `pass 5`, `fail 0`.
- `npm run typecheck` exited `0`.
- `node scripts/test-lanes.mjs assert-coverage` exited `0` and reported `All 212 active test files are assigned to a test lane.`
- `npx --yes fallow@latest --root . --no-cache --production --format json --summary` exited `0`; summary included `unused_files=0`, `unused_dependencies=0`, `unresolved_imports=0`, `unused_exports=181`, `unused_types=30`, `duplicate_exports=7`, `circular_dependencies=26`.
- `git diff --check` exited `0`.
- Conflict-marker scan returned no matches: `rg -n '^(<<<<<<<|=======|>>>>>>>)' src tests docs README.md .github contracts`.
- `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- `src/codex.ts` still owns public Codex command surfaces such as `runCodexCommandStreaming`, `parseCodexExecOutput`, `runCodexPassthrough`, and recovery exports; those are active callers and were not part of this tranche.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.
- If App dirty lanes are resolved or explicitly assigned, refresh App active truth and release evidence docs from clean App main before editing App-owned files.
- If active shell dirty lanes are resolved or explicitly assigned, refresh shell Docker/WebUI auth/session docs and tests from clean shell main before editing shell-owned files.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
