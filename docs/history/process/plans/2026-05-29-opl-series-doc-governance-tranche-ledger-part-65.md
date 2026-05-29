# OPL series docs governance tranche ledger part 65

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_65`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 Codex App runtime evidence ledger contract、CLI/API behavior oracle、runtime provider truth、domain truth、artifact authority、quality verdict、owner receipt、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/codex-app-runtime-evidence-ledger.ts`、runtime action execution source、App/operator drilldown source、focused Codex App runtime evidence tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 Codex App runtime evidence ledger 的过宽公共导出面：

- `src/codex-app-runtime-evidence-ledger.ts`
- process ledger index

目标是把 fallow 标出的 ledger reader、unused file-path helper 和 internal receipt type 收回为 non-public implementation detail，同时保持 public `recordCodexAppRuntimeEvidenceReceipts`、`verifyCodexAppRuntimeEvidenceReceipt`、`listCodexAppRuntimeEvidenceReceipts` 和 input / verify-input types 行为不变。这里不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json --summary`
  - before part65, `unused_exports=145` and `unused_types=29`.
  - target unused exports included `readCodexAppRuntimeEvidenceLedger` and `codexAppRuntimeEvidenceLedgerFilePath` in `src/codex-app-runtime-evidence-ledger.ts`.
  - target unused type included `CodexAppRuntimeEvidenceReceipt` in the same file.
- `rg -n "readCodexAppRuntimeEvidenceLedger|codexAppRuntimeEvidenceLedgerFilePath|recordCodexAppRuntimeEvidenceReceipts|verifyCodexAppRuntimeEvidenceReceipt|listCodexAppRuntimeEvidenceReceipts|CodexAppRuntimeEvidence" src tests docs contracts package.json`
  - live external callers consume `recordCodexAppRuntimeEvidenceReceipts`, `verifyCodexAppRuntimeEvidenceReceipt`, `listCodexAppRuntimeEvidenceReceipts`, and `CodexAppRuntimeEvidenceReceiptInput`.
  - `readCodexAppRuntimeEvidenceLedger` appears only in its owning file.
  - `codexAppRuntimeEvidenceLedgerFilePath` appears only as its unused definition.
  - no live external source imports `CodexAppRuntimeEvidenceReceipt`.
- CodeGraph context returned the sibling App release ledger context for this query, so the current index/matching was not treated as authoritative for this small symbol set. Live `rg`, fallow, source review, typecheck and focused CLI/App projection tests are the authoritative evidence for this tranche.

## Changes

- `src/codex-app-runtime-evidence-ledger.ts`
  - Made `CodexAppRuntimeEvidenceReceipt` module-private.
  - Made `readCodexAppRuntimeEvidenceLedger` module-private.
  - Deleted unused `codexAppRuntimeEvidenceLedgerFilePath`.
  - Removed the now-unused `node:path` import.
  - Kept `recordCodexAppRuntimeEvidenceReceipts`, `verifyCodexAppRuntimeEvidenceReceipt`, `listCodexAppRuntimeEvidenceReceipts`, `CodexAppRuntimeEvidenceReceiptInput`, and `CodexAppRuntimeEvidenceReceiptVerifyInput` exports unchanged.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-65.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 65 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `src/codex-app-runtime-evidence-ledger.ts`
- `src/runtime-operator-action-execution-parts/codex-app-runtime-evidence-action.ts`
- `src/runtime-tray-app-operator-drilldown-parts/codex-app-runtime-role.ts`
- `src/cli/cases/runtime-codex-app-runtime-evidence-command-spec.ts`
- `tests/src/cli/cases/runtime-codex-app-runtime-evidence-ledger.test.ts`
- fresh fallow output
- CodeGraph context output for Codex App runtime evidence ledger surface
- live `rg` references for Codex App runtime evidence ledger exports and callers

Edited:

- `src/codex-app-runtime-evidence-ledger.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-65.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. One TypeScript helper export and one internal receipt type export were retired from the public module surface; one unused file-path helper was deleted.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `45c1c1f8` before part65 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part65-codex-app-runtime-ledger-exports`.
- Branch: `codex/opl-doc-governance-20260529-part65-codex-app-runtime-ledger-exports`, based on root `main`.

## Verification

To be completed before absorb:

- focused Codex App runtime evidence CLI/App operator tests.
- `npm run typecheck`.
- `node scripts/test-lanes.mjs assert-coverage`.
- fresh fallow summary.
- `git diff --check`.
- conflict-marker scan.
- `opl-doc-doctor doctor . --format json`.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidates include sibling ledger reader/file-path exports and tightly scoped provider helper exports. Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
