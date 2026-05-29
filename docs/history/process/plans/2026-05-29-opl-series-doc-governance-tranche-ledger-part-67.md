# OPL series docs governance tranche ledger part 67

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_67`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 Domain Owner payload summary ledger contract、CLI/API behavior oracle、runtime provider truth、domain truth、domain owner receipt、typed blocker, artifact authority、quality verdict、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/domain-owner-payload-summary-ledger.ts`、runtime action execution source、App/operator drilldown source、focused domain owner payload summary tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 Domain Owner payload summary ledger 的过宽公共导出面：

- `src/domain-owner-payload-summary-ledger.ts`
- process ledger index

目标是把 fallow 标出的 ledger reader、unused file-path helper 和 unused authority-boundary helper 收回为 non-public implementation detail，同时保持 public `recordDomainOwnerPayloadSummaryReceipts`、`verifyDomainOwnerPayloadSummaryReceipt`、`listDomainOwnerPayloadSummaryReceipts`、`preflightDomainOwnerPayloadSummaryReceiptInput`、`assertDomainOwnerPayloadSummaryReceiptInputReady`、`domainOwnerPayloadSummaryTargetKey` 和 receipt / input / verify-input types 行为不变。这里不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json --summary`
  - before part67, `unused_exports=141` and `unused_types=28`.
  - target unused exports in `src/domain-owner-payload-summary-ledger.ts` were `readDomainOwnerPayloadSummaryLedger`, `domainOwnerPayloadSummaryLedgerFilePath`, and `domainOwnerPayloadSummaryLedgerAuthorityBoundary`.
  - no unused type from this module was reported.
- `rg -n "readDomainOwnerPayloadSummaryLedger|domainOwnerPayloadSummaryLedgerFilePath|domainOwnerPayloadSummaryLedgerAuthorityBoundary|recordDomainOwnerPayloadSummaryReceipts|verifyDomainOwnerPayloadSummaryReceipt|listDomainOwnerPayloadSummaryReceipts|DomainOwnerPayloadSummary" src tests docs contracts package.json`
  - live external callers consume `recordDomainOwnerPayloadSummaryReceipts`, `verifyDomainOwnerPayloadSummaryReceipt`, `listDomainOwnerPayloadSummaryReceipts`, `preflightDomainOwnerPayloadSummaryReceiptInput`, `assertDomainOwnerPayloadSummaryReceiptInputReady`, `domainOwnerPayloadSummaryTargetKey`, `DomainOwnerPayloadSummaryReceipt`, and `DomainOwnerPayloadSummaryReceiptInput`.
  - `readDomainOwnerPayloadSummaryLedger` appears only in its owning file.
  - `domainOwnerPayloadSummaryLedgerFilePath` appears only as its unused definition.
  - `domainOwnerPayloadSummaryLedgerAuthorityBoundary` appears only as its unused definition.
- CodeGraph context matched a sibling OMA App live path ledger for this query, so the current index/matching was not treated as authoritative for this small symbol set. Live `rg`, fallow, source review, typecheck and focused CLI/App projection tests are the authoritative evidence for this tranche.

## Changes

- `src/domain-owner-payload-summary-ledger.ts`
  - Made `readDomainOwnerPayloadSummaryLedger` module-private.
  - Deleted unused `domainOwnerPayloadSummaryLedgerFilePath`.
  - Deleted unused `domainOwnerPayloadSummaryLedgerAuthorityBoundary`.
  - Removed the now-unused `node:path` import.
  - Kept `recordDomainOwnerPayloadSummaryReceipts`, `verifyDomainOwnerPayloadSummaryReceipt`, `listDomainOwnerPayloadSummaryReceipts`, `preflightDomainOwnerPayloadSummaryReceiptInput`, `assertDomainOwnerPayloadSummaryReceiptInputReady`, `domainOwnerPayloadSummaryTargetKey`, `DomainOwnerPayloadSummaryReceipt`, `DomainOwnerPayloadSummaryReceiptInput`, and `DomainOwnerPayloadSummaryReceiptVerifyInput` exports unchanged.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-67.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 67 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `src/domain-owner-payload-summary-ledger.ts`
- `src/runtime-operator-action-execution-parts/domain-owner-payload-summary-action.ts`
- `src/runtime-tray-app-operator-drilldown-parts/domain-owner-payload-summary-action-routes.ts`
- `src/cli/cases/runtime-domain-owner-payload-summary-command-spec.ts`
- `tests/src/cli/cases/runtime-app-operator-drilldown-mas-payload-summary.test.ts`
- `tests/src/cli/cases/runtime-app-operator-drilldown-rca-payload-summary.test.ts`
- `tests/src/cli/cases/runtime-app-operator-drilldown-mag-payload-summary.test.ts`
- fresh fallow output
- CodeGraph context output for Domain Owner payload summary ledger surface
- live `rg` references for Domain Owner payload summary ledger exports and callers

Edited:

- `src/domain-owner-payload-summary-ledger.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-67.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. One TypeScript helper export was retired from the public module surface; two unused helper exports were deleted.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `be3cffc1` before part67 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part67-domain-owner-payload-summary-ledger-exports`.
- Branch: `codex/opl-doc-governance-20260529-part67-domain-owner-payload-summary-ledger-exports`, based on root `main`.

## Verification

To be completed before absorb:

- focused Domain Owner payload summary CLI/App projection tests.
- `npm run typecheck`.
- `node scripts/test-lanes.mjs assert-coverage`.
- fresh fallow summary.
- `git diff --check`.
- conflict-marker scan.
- `opl-doc-doctor doctor . --format json`.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidates include Agent Lab risk-tier promotion ledger reader/file-path helpers and tightly scoped provider helper exports. Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
