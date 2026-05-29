# OPL series docs governance tranche ledger part 76

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_76`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 MAG sustained-consumption contract、domain truth、owner receipt、typed blocker、artifact authority、quality verdict、App sustained-consumption oracle、provider long-soak oracle 或 production readiness oracle。当前 truth 回到 `src/mag-manifest-sustained-consumption-ledger.ts`, `src/cli/cases/runtime-mag-manifest-sustained-consumption-command-spec.ts`, App/operator drilldown MAG sustained-consumption projection、focused runtime App/operator tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 MAG manifest sustained-consumption followthrough ledger 的过时公共导出面：

- `src/mag-manifest-sustained-consumption-ledger.ts`
- process ledger index

目标是收回 fallow 标出的 ledger-internal helper exports，同时保持当前 public CLI / runtime action / App operator read model 不变：

- 将 `readMagManifestSustainedConsumptionLedger` 从 public export 收回为 module-private reader。
- 删除无 active caller 的 `magManifestSustainedConsumptionLedgerFilePath`。
- 删除无 active caller 的 `magManifestSustainedConsumptionLedgerAuthorityBoundary`。
- 删除随之无用的 `node:path` import。
- 保留 `magManifestSustainedConsumptionTargetKey`, `preflightMagManifestSustainedConsumptionReceiptInput`, `assertMagManifestSustainedConsumptionReceiptInputReady`, `recordMagManifestSustainedConsumptionReceipts`, `verifyMagManifestSustainedConsumptionReceipt`, `listMagManifestSustainedConsumptionReceipts`, receipt types, CLI `opl runtime mag-manifest-sustained-consumption record|verify|list`, runtime safe-action shell 和 App/operator projection 不变。

本轮不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production`
  - before part76, `unused_exports=117` and `unused_types=27`.
  - target unused exports were `readMagManifestSustainedConsumptionLedger`, `magManifestSustainedConsumptionLedgerFilePath`, and `magManifestSustainedConsumptionLedgerAuthorityBoundary` in `src/mag-manifest-sustained-consumption-ledger.ts`.
- `rg -n "readMagManifestSustainedConsumptionLedger|magManifestSustainedConsumptionLedgerFilePath|magManifestSustainedConsumptionLedgerAuthorityBoundary" . --glob '!node_modules/**' --glob '!dist/**'`
  - showed `readMagManifestSustainedConsumptionLedger` is consumed only by same-file `recordMagManifestSustainedConsumptionReceipts`, `verifyMagManifestSustainedConsumptionReceipt`, and `listMagManifestSustainedConsumptionReceipts`.
  - showed no active caller for the file-path helper.
  - showed no active caller for the authority-boundary helper.
- Focused source/test read:
  - `src/cli/cases/runtime-mag-manifest-sustained-consumption-command-spec.ts` consumes retained public `recordMagManifestSustainedConsumptionReceipts`, `verifyMagManifestSustainedConsumptionReceipt`, and `listMagManifestSustainedConsumptionReceipts`.
  - `src/runtime-operator-action-execution-parts/mag-manifest-sustained-consumption-action.ts` consumes retained public preflight/record/verify surfaces.
  - `src/runtime-tray-app-operator-drilldown-parts/mag-manifest-sustained-consumption.ts` consumes retained public list and target-key surfaces for App/operator projection.
  - `tests/src/cli/cases/runtime-app-operator-drilldown-mag-payload-summary.test.ts` covers MAG sustained-consumption route, record, verify, projection, and negative authority-boundary behavior through public CLI/read-model surfaces.

## Changes

- `src/mag-manifest-sustained-consumption-ledger.ts`
  - Made `readMagManifestSustainedConsumptionLedger` module-private.
  - Deleted unused `magManifestSustainedConsumptionLedgerFilePath`.
  - Deleted unused `magManifestSustainedConsumptionLedgerAuthorityBoundary`.
  - Removed now-unused `node:path` import.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-76.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 76 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files, tests or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/docs_portfolio_consolidation.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-75.md`
- `src/mag-manifest-sustained-consumption-ledger.ts`
- `src/cli/cases/runtime-mag-manifest-sustained-consumption-command-spec.ts`
- `src/runtime-operator-action-execution-parts/mag-manifest-sustained-consumption-action.ts`
- `src/runtime-tray-app-operator-drilldown-parts/mag-manifest-sustained-consumption.ts`
- `tests/src/cli/cases/runtime-app-operator-drilldown-mag-payload-summary.test.ts`
- fresh fallow output
- live `rg` references for target helpers and retained MAG sustained-consumption public surfaces

Edited:

- `src/mag-manifest-sustained-consumption-ledger.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-76.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. Three MAG sustained-consumption ledger helper public surfaces were retired.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `1c591226` before part76 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part76-fallow-export`.
- Branch: `codex/opl-doc-governance-20260529-part76-fallow-export`, based on root `main`.

## Verification

Completed in the part76 worktree before absorb:

- `npm ci` exited `0`, ran `npm run build`, and npm audit still reports 10 high severity vulnerabilities, unchanged and not addressed in this tranche.
- `node --test --experimental-strip-types tests/src/cli/cases/runtime-app-operator-drilldown-mag-payload-summary.test.ts tests/src/cli/cases/runtime-app-operator-drilldown.test.ts tests/src/cli/cases/runtime-app-operator-drilldown-actions-execute.test.ts` exited `0`, reporting `tests 10`, `pass 10`, `fail 0`.
- `npm run typecheck` exited `0`.
- `node scripts/test-lanes.mjs assert-coverage` exited `0`, all 212 active test files assigned.
- fresh fallow summary reported `unused_exports=114` and `unused_types=27`; the command still exits non-zero because remaining unrelated dead-code, duplication and complexity findings are outside this tranche.
- `git diff --check` exited `0`.
- conflict-marker scan returned no matches.
- `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`; worktree profile reported `tooling_repo` because of worktree path shape, so root checkout must be rechecked after absorb.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidates include `buildStageAdmissionLaunchGateFromReview`, `stageAttemptCloseoutToPayload`, `temporalWorkerRuntimeModuleRoot`, stage admission / ledger helpers, test-only helper exports, managed install/update ledger helpers, and small source helper exports.
- Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
