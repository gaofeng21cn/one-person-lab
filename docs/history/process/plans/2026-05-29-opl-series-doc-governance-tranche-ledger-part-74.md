# OPL series docs governance tranche ledger part 74

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_74`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 Temporal provider contract、runtime provider truth、domain truth、owner receipt、typed blocker、artifact authority、quality verdict、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/family-runtime-temporal-provider-parts/worker-process.ts`、`src/family-runtime-temporal-provider-parts/workflow-bundle.ts`、`src/family-runtime-temporal-provider.ts`、focused Temporal provider tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 Temporal provider parts 的过宽公共导出面：

- `src/family-runtime-temporal-provider-parts/worker-process.ts`
- `src/family-runtime-temporal-provider-parts/workflow-bundle.ts`
- process ledger index

目标是把 fallow 标出的 provider-part implementation helpers 收回为 module-private，同时保持 provider 主体实际消费的 public entry 不变：

- 保留 `stopWorkerPid` 和 `stopOrphanTemporalForegroundWorkers`。
- 保留 `buildTemporalStageAttemptWorkerOptions`。
- 不改 `src/family-runtime-temporal-provider.ts` public runtime/provider API、CLI 行为、contracts、runtime ledger 或 provider state。

本轮不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json --summary`
  - before part74, `unused_exports=125` and `unused_types=27`.
  - target unused exports were `waitForProcessExit`, `signalManagedWorker`, `findTemporalForegroundWorkerPids`, `temporalWorkflowBundleDir`, `temporalWorkflowBundleManifestPath`, and `materializeTemporalWorkflowBundle`.
- CodeGraph context for Temporal provider parts:
  - surfaced `signalManagedWorker` in `worker-process.ts`.
  - did not surface external production callers for the target helpers.
- `rg -n "\b(waitForProcessExit|signalManagedWorker|findTemporalForegroundWorkerPids|temporalWorkflowBundleDir|temporalWorkflowBundleManifestPath|materializeTemporalWorkflowBundle)\b" src tests docs package.json`
  - showed all target helpers appear only in their owning files.
  - showed `waitForProcessExit`, `signalManagedWorker`, and `findTemporalForegroundWorkerPids` are implementation details behind retained `stopWorkerPid` / `stopOrphanTemporalForegroundWorkers`.
  - showed `temporalWorkflowBundleDir`, `temporalWorkflowBundleManifestPath`, and `materializeTemporalWorkflowBundle` are implementation details behind retained `buildTemporalStageAttemptWorkerOptions`.
- `src/family-runtime-temporal-provider.ts`
  - imports retained `stopWorkerPid`, `stopOrphanTemporalForegroundWorkers`, and `buildTemporalStageAttemptWorkerOptions` only.

## Changes

- `src/family-runtime-temporal-provider-parts/worker-process.ts`
  - Made `waitForProcessExit` module-private.
  - Made `signalManagedWorker` module-private.
  - Made `findTemporalForegroundWorkerPids` module-private.
  - Kept `stopWorkerPid` and `stopOrphanTemporalForegroundWorkers` exports unchanged.
- `src/family-runtime-temporal-provider-parts/workflow-bundle.ts`
  - Made `temporalWorkflowBundleDir` module-private.
  - Made `temporalWorkflowBundleManifestPath` module-private.
  - Made `materializeTemporalWorkflowBundle` module-private.
  - Kept `buildTemporalStageAttemptWorkerOptions` export unchanged.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-74.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 74 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files, tests or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `README.md`
- `docs/README.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `src/family-runtime-temporal-provider-parts/worker-process.ts`
- `src/family-runtime-temporal-provider-parts/workflow-bundle.ts`
- `src/family-runtime-temporal-provider.ts`
- fresh fallow output
- CodeGraph context output for Temporal provider parts
- live `rg` references for Temporal worker-process / workflow-bundle helpers and callers

Edited:

- `src/family-runtime-temporal-provider-parts/worker-process.ts`
- `src/family-runtime-temporal-provider-parts/workflow-bundle.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-74.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. Six Temporal provider part helper exports were retired from the public module surface.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `f2aee93e` before part74 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part74-temporal-provider-part-helpers`.
- Branch: `codex/opl-doc-governance-20260529-part74-temporal-provider-part-helpers`, based on root `main`.

## Verification

Completed in the part74 worktree before absorb:

- `npm ci` exited `0`, ran `npm run build`, and npm audit still reports 10 high severity vulnerabilities, unchanged and not addressed in this tranche.
- `node --test --experimental-strip-types tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts tests/src/family-runtime-temporal-provider.test.ts` exited `0`, reporting `tests 31`, `pass 31`, `fail 0`.
- `npm run typecheck` exited `0`.
- `node scripts/test-lanes.mjs assert-coverage` exited `0`, all 212 active test files assigned.
- fresh fallow summary exited `0` with `unused_exports=119` and `unused_types=27`.
- `git diff --check` exited `0`.
- conflict-marker scan returned no matches.
- `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`; worktree profile reported `tooling_repo` because of worktree path shape, so root checkout must be rechecked after absorb.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidates include provider list helpers, stage admission / ledger helpers, or test-only helper exports.
- Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
