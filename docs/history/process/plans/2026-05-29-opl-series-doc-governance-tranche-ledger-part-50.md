# OPL series docs governance tranche ledger part 50

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_50`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 agent executor API contract、executor adapter authority、stage runtime truth、domain truth、artifact authority、quality verdict、owner receipt、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/agent-executor.ts`、CLI command specs、contracts、tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮从 source/interface 层清理 `agent-executor` 的过宽公共导出面：

- `src/agent-executor.ts`
- `tests/src/agent-executor.test.ts`
- process ledger index

目标是把 fallow 标出的、只被生产内部使用的 executor resolver / doctor helper 收回为 module-private helper，并让测试通过当前 public runner / doctor surface 覆盖解析顺序、doctor readiness 与 fail-closed 行为。这里不新增兼容 alias、facade、wrapper 或白盒测试入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json --summary`
  - `unused_files=0`
  - `unused_dependencies=0`
  - `unresolved_imports=0`
  - `private_type_leaks=0`
  - `boundary_violations=0`
  - `unused_exports=184` remains as the next cleanup tail after this tranche.
- `rg -n "\b(resolveAgentExecutorKind|inspectAgentExecutor)\b" src tests docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-14.md`
  - `resolveAgentExecutorKind` and `inspectAgentExecutor` now appear only inside `src/agent-executor.ts` plus the historical part14 ledger.
  - Tests no longer import either helper directly.
- `src/cli/cases/private-command-specs.ts`
  - `opl executor doctor` calls `runAgentExecutorDoctor`.
  - `opl executor run` calls `runAgentExecutorRequestFile`.
  - The ask/request runner path calls `runAgentExecutor`.
- `src/agent-executor.ts`
  - Current exported source API remains `runAgentExecutor`, `runAgentExecutorDoctor`, `runAgentExecutorRequestFile`, and exported types/constants.

## Changes

- `src/agent-executor.ts`
  - Changed `resolveAgentExecutorKind` from exported helper to module-private function.
  - Changed `inspectAgentExecutor` from exported helper to module-private function.
- `tests/src/agent-executor.test.ts`
  - Removed direct imports of `resolveAgentExecutorKind` and `inspectAgentExecutor`.
  - Rewrote resolver-order coverage through `runAgentExecutor` and `runAgentExecutorDoctor`.
  - Rewrote doctor readiness / missing-binary coverage through `runAgentExecutorDoctor`.
  - Fixed the focused-test hang by injecting fake Codex through `process.env.OPL_CODEX_BIN`, which is the current `codex_cli` binary resolution contract.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-50.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 50 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `src/agent-executor.ts`
- `src/codex.ts`
- `src/cli/cases/private-command-specs.ts`
- `tests/src/agent-executor.test.ts`
- `tests/src/cli/helpers-parts/fixtures.ts`
- `docs/history/process/plans/README.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-14.md`
- fresh fallow summary

Edited:

- `src/agent-executor.ts`
- `tests/src/agent-executor.test.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-50.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. Two TypeScript helper exports were retired from the public module surface.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `0da480e3` before part50 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab-opl-cleanup-part50-unused-agent-executor-exports`.
- Branch: `codex/opl-doc-governance-20260529-part50-unused-agent-executor-exports`, based on root `main`.

## Debug Note

The first focused test attempt took about 255 seconds because the rewritten test passed fake Codex in `request.env`; the current `codex_cli` path resolves through `process.env.OPL_CODEX_BIN`, so the test launched the real Codex binary for `Resolve default executor.`. The stuck retry process group was terminated, and the test now restores `process.env.OPL_CODEX_BIN` in `finally`.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- `src/agent-executor.ts` still appears in fallow recommendations for `runExternalExecutor` complexity; that is a future refactor/test tranche, not part of this export-surface cleanup.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.
- If App dirty lanes are resolved or explicitly assigned, refresh App active truth and release evidence docs from clean App main before editing App-owned files.
- If active shell dirty lanes are resolved or explicitly assigned, refresh shell Docker/WebUI auth/session docs and tests from clean shell main before editing shell-owned files.

## Verification

Fresh verification before absorb:

- `node --test --experimental-strip-types tests/src/agent-executor.test.ts` reported `tests 17`, `pass 17`, `fail 0`, `duration_ms 2943.418875`.
- `npm run typecheck` exited `0`.
- `node scripts/test-lanes.mjs assert-coverage` exited `0` and reported `All 212 active test files are assigned to a test lane.`
- `npx --yes fallow@latest --root . --no-cache --production --format json --summary` exited `0`; summary included `unused_files=0`, `unused_dependencies=0`, `unresolved_imports=0`, `unused_exports=184`, `unused_types=30`, `duplicate_exports=7`, `circular_dependencies=26`.
- `git diff --check` exited `0`.
- Conflict-marker scan returned no matches: `rg -n '^(<<<<<<<|=======|>>>>>>>)' src tests docs README.md .github contracts`.
- `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
