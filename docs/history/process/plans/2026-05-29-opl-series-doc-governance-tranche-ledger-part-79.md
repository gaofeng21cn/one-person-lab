# OPL series docs governance tranche ledger part 79

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_79`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 Temporal provider contract、worker lifecycle oracle、domain truth、owner receipt、typed blocker、artifact authority、quality verdict、App release oracle、provider readiness oracle 或 production readiness oracle。当前 truth 回到 `src/family-runtime-temporal-provider-parts/worker-dependencies.ts`, retained public `inspectTemporalWorkerRuntimeDependencies`, focused Temporal worker/provider tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 Temporal worker runtime dependency inspector 的过时公共导出面：

- `src/family-runtime-temporal-provider-parts/worker-dependencies.ts`
- process ledger index

目标是收回 fallow 标出的 same-file helper export，同时保持当前 Temporal provider dependency health read surface 不变：

- 将 `temporalWorkerRuntimeModuleRoot` 从 public export 收回为 module-private helper。
- 保留 `inspectTemporalWorkerRuntimeDependencies` public export 不变。
- 保留 `src/family-runtime-temporal-provider.ts` 对 dependency health 的调用路径不变。
- 保留 focused worker lifecycle test 对 retained public inspector 的覆盖不变。

本轮不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npm run hygiene:fallow` before part79 reported `unused_exports=112` and `unused_types=27`; candidate was `temporalWorkerRuntimeModuleRoot` in `src/family-runtime-temporal-provider-parts/worker-dependencies.ts`.
- `rg -n "temporalWorkerRuntimeModuleRoot|inspectTemporalWorkerRuntimeDependencies" src tests contracts docs --glob '!node_modules/**' --glob '!dist/**'`
  - showed `temporalWorkerRuntimeModuleRoot` appears only in its owning file and prior history ledgers.
  - showed active source consumers import retained `inspectTemporalWorkerRuntimeDependencies` from `src/family-runtime-temporal-provider.ts`.
  - showed focused tests import retained `inspectTemporalWorkerRuntimeDependencies`, not the module-root helper.
- CodeGraph context was checked for the Temporal worker dependency area before editing; live text references were used for the exact helper/caller proof.
- Focused source/test read:
  - `inspectTemporalWorkerRuntimeDependencies` calls `temporalWorkerRuntimeModuleRoot` in the same file to compute the module root for the repair command.
  - `tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts` verifies missing SWC dependency behavior through retained public inspector and `buildTemporalWorkerReadiness`.

## Changes

- `src/family-runtime-temporal-provider-parts/worker-dependencies.ts`
  - Made `temporalWorkerRuntimeModuleRoot` module-private.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-79.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 79 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files, tests or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/history/process/plans/README.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-78.md`
- `src/family-runtime-temporal-provider-parts/worker-dependencies.ts`
- `src/family-runtime-temporal-provider.ts`
- `tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts`
- `tests/src/family-runtime-temporal-provider.test.ts`
- fresh fallow output
- live `rg` references for target helper and retained public inspector
- CodeGraph context for the Temporal worker dependency area

Edited:

- `src/family-runtime-temporal-provider-parts/worker-dependencies.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-79.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. One Temporal worker dependency helper public surface was retired.

## Branch / Worktree Hygiene

- Root `main` was clean and synced with `origin/main` at `fe9d2145` after part78.
- Worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part79-temporal-worker-module-root`.
- Branch: `codex/opl-doc-governance-20260529-part79-temporal-worker-module-root`, based on `fe9d2145`.

## Verification

Completed in the part79 worktree before absorb:

- `node --test --experimental-strip-types tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts tests/src/family-runtime-temporal-provider.test.ts` exited `0`, reporting `tests 31`, `pass 31`, `fail 0`.
- `npm run typecheck` exited `0`.
- `node scripts/test-lanes.mjs assert-coverage` exited `0`, all 212 active test files assigned.
- fresh fallow summary reported `unused_exports=111` and `unused_types=27`; the command still exits non-zero because remaining unrelated dead-code, duplication and complexity findings are outside this tranche. Fallow also warned that this worktree does not have its own `node_modules`; focused tests and typecheck still resolved dependencies from the shared checkout environment.
- `git diff --check` exited `0`.
- conflict-marker scan with line-start anchors returned no matches.
- `opl-doc-doctor doctor . --format json` exited `0`, returning `finding_count=0` and `active_truth_health.status=pass`; worktree profile reported `tooling_repo` because of worktree path shape, so root checkout must be rechecked after absorb.

## Remaining stale / retire candidates

- Continue retiring remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.

## Next tranche write scope

- Prefer another small source/export cleanup tranche backed by fresh fallow, references, source/test read and focused verification.
- Keep tranches small, then absorb to `main`, root-reverify and push.
