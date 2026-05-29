# OPL series docs governance tranche ledger part 61

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_61`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 family runtime dispatch command contract、CLI/API behavior oracle、runtime provider truth、domain truth、artifact authority、quality verdict、owner receipt、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/family-runtime-dispatch-command.ts`、`src/family-runtime-task-dispatch.ts`、focused family-runtime dispatch tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 family runtime dispatch command helper 的过宽公共导出面：

- `src/family-runtime-dispatch-command.ts`
- process ledger index

目标是直接删除 fallow 标出的 `commandPreviewForDomain` 与 `commandForDomain` compatibility-style wrappers，同时保持 public `dispatchCommandForDomain` 和 `parseDispatchOutput` 行为不变。这里不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json --summary`
  - before part61, `unused_exports=153`.
  - target unused exports included `commandPreviewForDomain` and `commandForDomain` in `src/family-runtime-dispatch-command.ts`.
- `rg -n "commandPreviewForDomain|commandForDomain|family-runtime-dispatch-command" src tests docs contracts package.json`
  - live external source imports only `dispatchCommandForDomain` and `parseDispatchOutput` from this module.
  - `commandPreviewForDomain` and `commandForDomain` appear only in their owning file.
- CodeGraph caller output:
  - no callers found for `commandForDomain`.
  - `commandPreviewForDomain` was not resolved by the current index, so live `rg`, fallow, typecheck and focused behavior tests were treated as authoritative for that wrapper.

## Changes

- `src/family-runtime-dispatch-command.ts`
  - Removed `commandPreviewForDomain`.
  - Removed `commandForDomain`.
  - Kept `dispatchCommandForDomain` and `parseDispatchOutput` exports unchanged.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-61.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 61 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `src/family-runtime-dispatch-command.ts`
- `src/family-runtime-task-dispatch.ts`
- fresh fallow output
- CodeGraph context/caller output for dispatch command wrappers
- live `rg` references for dispatch command exports and callers

Edited:

- `src/family-runtime-dispatch-command.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-61.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. Two unused TypeScript wrapper exports were deleted from the public module surface.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `26886508` before part61 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part61-dispatch-command-wrapper-exports`.
- Branch: `codex/opl-doc-governance-20260529-part61-dispatch-command-wrapper-exports`, based on root `main`.

## Verification

To be completed before absorb:

- focused family-runtime dispatch tests.
- `npm run typecheck`.
- `node scripts/test-lanes.mjs assert-coverage`.
- fresh fallow summary.
- `git diff --check`.
- conflict-marker scan.
- `opl-doc-doctor doctor . --format json`.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidates include ledger reader/file-path exports and tightly scoped provider helper exports. Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
