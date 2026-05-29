# OPL series docs governance tranche ledger part 72

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_72`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 Codex stage-runner contract、Temporal provider truth、domain truth、owner receipt、typed blocker、artifact authority、quality verdict、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/family-runtime-codex-stage-runner.ts`、`src/family-runtime-temporal-activities.ts`、`src/family-runtime-stage-attempt-query.ts`、focused Codex / Agent stage-runner tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 Codex stage-runner 的过宽公共导出面：

- `src/family-runtime-codex-stage-runner.ts`
- Codex / Agent stage-runner focused tests
- process ledger index

目标是把 fallow 标出的 Codex runner implementation details 从 public module surface 收回或删除，同时保持公开 runtime entry `runAgentStageRunner`、`buildCodexStageActivityInput`、`normalizeTypedStageCloseoutPacket`、Temporal `codexStageActivity` 和 stage-attempt query projection 行为不变。这里不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json --summary`
  - before part72, `unused_exports=132` and `unused_types=27`.
  - target unused exports were `normalizeCodexStageRunnerMode`, `buildCodexStageRunnerReceipt`, `runCodexStageRunner`, `parseJsonObject`, and `buildDomainHandlerDispatchActivityInput`; the follow-up fresh fallow pass also exposed same-file-only type export `CodexStageRunnerMode` in `src/family-runtime-codex-stage-runner.ts`.
- CodeGraph context / explore for `family-runtime-codex-stage-runner`
  - surfaced `normalizeCodexStageRunnerMode` and `runCodexStageRunner` as same-file implementation path.
  - showed `buildCodexStageRunnerReceipt` and `runCodexStageRunner` are called by same-file public runtime entry points, not external production imports.
- `rg -n "normalizeCodexStageRunnerMode|buildCodexStageRunnerReceipt|runCodexStageRunner|parseJsonObject|buildDomainHandlerDispatchActivityInput" src tests package.json docs contracts README.md`
  - live production source imports from `src/family-runtime-codex-stage-runner.ts` consume retained public entry points: `runAgentStageRunner`, `buildCodexStageActivityInput`, and `normalizeTypedStageCloseoutPacket`.
  - `runCodexStageRunner` was imported only by focused tests; tests were moved to the public `runAgentStageRunner` entry that routes Codex CLI attempts through the same Codex runner path.
  - `parseJsonObject` and `buildDomainHandlerDispatchActivityInput` had no live callers in the owning file or external source.

## Changes

- `src/family-runtime-codex-stage-runner.ts`
  - Made `CodexStageRunnerMode`, `normalizeCodexStageRunnerMode`, `buildCodexStageRunnerReceipt`, and `runCodexStageRunner` module-private implementation details.
  - Deleted unused `parseJsonObject`.
  - Deleted unused `buildDomainHandlerDispatchActivityInput`.
  - Kept `runAgentStageRunner`, `buildCodexStageActivityInput`, `normalizeTypedStageCloseoutPacket`, and `TypedStageCloseoutPacket` exports unchanged.
- `tests/src/family-runtime-codex-stage-runner.test.ts`
  - Replaced test-only direct `runCodexStageRunner` imports/calls with public `runAgentStageRunner` calls.
- `tests/src/family-runtime-codex-stage-runner-protocol.test.ts`
  - Replaced test-only direct `runCodexStageRunner` imports/calls with public `runAgentStageRunner` calls.
- `tests/src/family-runtime-codex-stage-runner-mas-recovery.test.ts`
  - Replaced test-only direct `runCodexStageRunner` imports/calls with public `runAgentStageRunner` calls.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-72.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 72 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `src/family-runtime-codex-stage-runner.ts`
- `src/family-runtime-temporal-activities.ts`
- `src/family-runtime-stage-attempt-query.ts`
- `tests/src/family-runtime-codex-stage-runner.test.ts`
- `tests/src/family-runtime-codex-stage-runner-protocol.test.ts`
- `tests/src/family-runtime-codex-stage-runner-mas-recovery.test.ts`
- `tests/src/family-runtime-agent-stage-runner.test.ts`
- `package.json`
- `docs/decisions.md`
- `docs/status.md`
- fresh fallow output
- CodeGraph context / explore output for Codex stage-runner exports and callers
- live `rg` references for Codex stage-runner exports and retained public entry points

Edited:

- `src/family-runtime-codex-stage-runner.ts`
- `tests/src/family-runtime-codex-stage-runner.test.ts`
- `tests/src/family-runtime-codex-stage-runner-protocol.test.ts`
- `tests/src/family-runtime-codex-stage-runner-mas-recovery.test.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-72.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived or tombstoned in this tranche. Two unused TypeScript helper functions were deleted, and one type plus three Codex runner implementation functions were retired from the public module surface.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `52a48769` before part72 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part72-codex-stage-runner-exports`.
- Branch: `codex/opl-doc-governance-20260529-part72-codex-stage-runner-exports`, based on root `main`.

## Verification

To be completed before absorb:

- focused Codex / Agent stage-runner tests.
- `npm run typecheck`.
- `node scripts/test-lanes.mjs assert-coverage`.
- fresh fallow summary.
- `git diff --check`.
- conflict-marker scan.
- `opl-doc-doctor doctor . --format json`.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidates include tightly scoped provider proof/repair helper exports and smaller Temporal provider part helpers. Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
