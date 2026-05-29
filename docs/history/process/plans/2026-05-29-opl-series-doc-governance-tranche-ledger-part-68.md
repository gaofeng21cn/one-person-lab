# OPL series docs governance tranche ledger part 68

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_68`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 Agent Lab risk-tier promotion ledger contract、CLI/API behavior oracle、Developer Mode closeout truth、runtime provider truth、domain truth、owner receipt、typed blocker、artifact authority、quality verdict、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/agent-lab-risk-tier-promotion-ledger.ts`、`src/developer-mode-closeout-ledger.ts`、Agent Lab CLI command source、focused Agent Lab / Developer Mode tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 Agent Lab risk-tier promotion ledger 的过宽公共导出面：

- `src/agent-lab-risk-tier-promotion-ledger.ts`
- process ledger index

目标是把 fallow 标出的 ledger reader、verified refs helper、unused file-path helper 和 internal receipt type 收回为 non-public implementation detail，同时保持 public `recordAgentLabRiskTierAutoPromotionReceipts`、`verifyAgentLabRiskTierAutoPromotionReceipt`、`listAgentLabRiskTierAutoPromotionReceipts`、`hasVerifiedAgentLabRiskTierAutoPromotionReceiptRef` 和 input / verify-input types 行为不变。这里不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json --summary`
  - before part68, `unused_exports=138` and `unused_types=28`.
  - target unused exports in `src/agent-lab-risk-tier-promotion-ledger.ts` were `readAgentLabRiskTierAutoPromotionLedger`, `verifiedAgentLabRiskTierAutoPromotionReceiptRefs`, and `agentLabRiskTierAutoPromotionLedgerFilePath`.
  - target unused type in the same module was `AgentLabRiskTierAutoPromotionReceipt`.
- `rg -n "readAgentLabRiskTierAutoPromotionLedger|verifiedAgentLabRiskTierAutoPromotionReceiptRefs|agentLabRiskTierAutoPromotionLedgerFilePath|hasVerifiedAgentLabRiskTierAutoPromotionReceiptRef|recordAgentLabRiskTierAutoPromotionReceipts|verifyAgentLabRiskTierAutoPromotionReceipt|listAgentLabRiskTierAutoPromotionReceipts|AgentLabRiskTierAutoPromotion" src tests docs contracts package.json`
  - live external callers consume `recordAgentLabRiskTierAutoPromotionReceipts`, `verifyAgentLabRiskTierAutoPromotionReceipt`, `listAgentLabRiskTierAutoPromotionReceipts`, `AgentLabRiskTierAutoPromotionReceiptInput`, and `hasVerifiedAgentLabRiskTierAutoPromotionReceiptRef`.
  - `hasVerifiedAgentLabRiskTierAutoPromotionReceiptRef` remains imported by `src/developer-mode-closeout-ledger.ts` to enforce that Developer Mode closeout `risk_tier_auto_promotion_refs` point to already verified Agent Lab risk-tier promotion ledger receipts.
  - `readAgentLabRiskTierAutoPromotionLedger` appears only in its owning file.
  - `verifiedAgentLabRiskTierAutoPromotionReceiptRefs` appears only in its owning file and is only used by the retained public predicate.
  - `agentLabRiskTierAutoPromotionLedgerFilePath` appears only as its unused definition.
  - no live external source imports `AgentLabRiskTierAutoPromotionReceipt`.
- CodeGraph context matched adjacent Agent Lab promotion and OMA App live path symbols for this query, so the current index/matching was not treated as authoritative for this small symbol set. Live `rg`, fallow, source review, typecheck and focused CLI/App projection tests are the authoritative evidence for this tranche.

## Changes

- `src/agent-lab-risk-tier-promotion-ledger.ts`
  - Made `AgentLabRiskTierAutoPromotionReceipt` module-private.
  - Made `readAgentLabRiskTierAutoPromotionLedger` module-private.
  - Made `verifiedAgentLabRiskTierAutoPromotionReceiptRefs` module-private.
  - Deleted unused `agentLabRiskTierAutoPromotionLedgerFilePath`.
  - Removed the now-unused `node:path` import.
  - Kept `recordAgentLabRiskTierAutoPromotionReceipts`, `verifyAgentLabRiskTierAutoPromotionReceipt`, `listAgentLabRiskTierAutoPromotionReceipts`, `hasVerifiedAgentLabRiskTierAutoPromotionReceiptRef`, `AgentLabRiskTierAutoPromotionReceiptInput`, and `AgentLabRiskTierAutoPromotionVerifyInput` exports unchanged.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-68.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 68 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `src/agent-lab-risk-tier-promotion-ledger.ts`
- `src/developer-mode-closeout-ledger.ts`
- `src/cli/cases/agent-lab-public-command-specs.ts`
- `tests/src/cli/cases/runtime-developer-mode-closeout-ledger.test.ts`
- `tests/src/cli/cases/runtime-app-operator-drilldown-developer-mode-live-closeout.test.ts`
- `tests/src/agent-lab-developer-mode-contract.test.ts`
- fresh fallow output
- CodeGraph context output for Agent Lab risk-tier promotion ledger surface
- live `rg` references for Agent Lab risk-tier promotion ledger exports and callers

Edited:

- `src/agent-lab-risk-tier-promotion-ledger.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-68.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. Two TypeScript helper exports and one internal receipt type export were retired from the public module surface; one unused file-path helper was deleted.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `19b081e1` before part68 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part68-agent-lab-risk-tier-ledger-exports`.
- Branch: `codex/opl-doc-governance-20260529-part68-agent-lab-risk-tier-ledger-exports`, based on root `main`.

## Verification

To be completed before absorb:

- focused Agent Lab risk-tier promotion / Developer Mode closeout tests.
- `npm run typecheck`.
- `node scripts/test-lanes.mjs assert-coverage`.
- fresh fallow summary.
- `git diff --check`.
- conflict-marker scan.
- `opl-doc-doctor doctor . --format json`.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidates include small source helper exports and tightly scoped provider helper exports. Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
