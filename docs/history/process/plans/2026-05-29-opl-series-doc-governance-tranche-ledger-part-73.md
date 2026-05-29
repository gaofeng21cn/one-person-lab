# OPL series docs governance tranche ledger part 73

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_73`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 Temporal provider contract、runtime provider truth、domain truth、owner receipt、typed blocker、artifact authority、quality verdict、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/family-runtime-provider-proof-receipts.ts`、`src/family-runtime-provider-slo-executor.ts`、focused provider SLO tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 Temporal provider proof receipt 的过宽公共导出面：

- `src/family-runtime-provider-proof-receipts.ts`
- process ledger index

目标是把 fallow 标出的 `temporalProductionCapabilityReceipt` 和 `temporalProviderSloRepairReceipt` 收回为 `temporalProviderSloExecutionReceipt` 的 module-private implementation detail，同时保持 public `persistTemporalProductionProof`、`temporalProviderSloExecutionReceipt`、`runTemporalProviderSloTick`、CLI provider-slo tick behavior 和 provider receipt shape 不变。这里不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json --summary`
  - before part73, `unused_exports=127` and `unused_types=27`.
  - target unused exports were `temporalProductionCapabilityReceipt` and `temporalProviderSloRepairReceipt` in `src/family-runtime-provider-proof-receipts.ts`.
- CodeGraph context / node for `family-runtime-provider-proof-receipts`
  - showed `temporalProviderSloRepairReceipt` is called by same-file public `temporalProviderSloExecutionReceipt`.
  - showed `temporalProductionCapabilityReceipt` is called by same-file public `temporalProviderSloExecutionReceipt`.
  - did not surface external production callers for either target helper.
- `rg -n "temporalProductionCapabilityReceipt|temporalProviderSloRepairReceipt|maybeRepairTemporalWorkerForProviderSlo|repairTemporalWorkerLifecycleForProvider|family-runtime-provider-proof-receipts|family-runtime-provider-slo-executor|family-runtime-provider-worker-repair" src tests docs contracts package.json README.md`
  - live production source consumes retained `temporalProviderSloExecutionReceipt` and `persistTemporalProductionProof`.
  - tests still directly import `maybeRepairTemporalWorkerForProviderSlo` and `repairTemporalWorkerForProviderRepair`, so worker repair public surfaces were intentionally left unchanged in this tranche.
  - the two target receipt builders appear only in their owning file.

## Changes

- `src/family-runtime-provider-proof-receipts.ts`
  - Made `temporalProductionCapabilityReceipt` module-private.
  - Made `temporalProviderSloRepairReceipt` module-private.
  - Kept `persistTemporalProductionProof` and `temporalProviderSloExecutionReceipt` exports unchanged.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-73.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 73 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files, tests or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `src/family-runtime-provider-proof-receipts.ts`
- `src/family-runtime-provider-slo-executor.ts`
- `src/family-runtime-provider-worker-repair.ts`
- `src/family-runtime.ts`
- `tests/src/cli/cases/family-runtime-provider-slo.test.ts`
- fresh fallow output
- CodeGraph context / node output for Temporal provider proof receipt helpers
- live `rg` references for provider proof / SLO / repair helpers and callers

Edited:

- `src/family-runtime-provider-proof-receipts.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-73.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. Two Temporal provider receipt helper exports were retired from the public module surface.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `a60d2a79` before part73 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part73-provider-proof-receipt-helpers`.
- Branch: `codex/opl-doc-governance-20260529-part73-provider-proof-receipt-helpers`, based on root `main`.

## Verification

To be completed before absorb:

- focused provider SLO tests.
- `npm run typecheck`.
- `node scripts/test-lanes.mjs assert-coverage`.
- fresh fallow summary.
- `git diff --check`.
- conflict-marker scan.
- `opl-doc-doctor doctor . --format json`.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidates include smaller Temporal provider part helpers, provider list helpers, or stage admission / ledger helpers. Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
