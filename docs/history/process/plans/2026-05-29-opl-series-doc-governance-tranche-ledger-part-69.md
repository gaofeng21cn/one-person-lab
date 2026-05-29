# OPL series docs governance tranche ledger part 69

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_69`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 Agent Lab suite contract、CLI/API behavior oracle、runtime provider truth、domain truth、owner receipt、typed blocker、artifact authority、quality verdict、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/agent-lab-longline.ts`、`src/agent-lab-complete.ts`、Agent Lab CLI command source、focused Agent Lab tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 Agent Lab longline suite 的过宽公共导出面：

- `src/agent-lab-longline.ts`
- `tests/src/agent-lab.test.ts`
- process ledger index

目标是把 fallow 标出的 internal suite builder `buildLonglineAgentLabSuite` 收回为 non-public implementation detail，同时保持 public `buildLonglineAgentLabResult`、CLI `agent-lab longline` payload、complete/workbench read model 和 longline behavior coverage 不变。这里不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json --summary`
  - before part69, `unused_exports=135` and `unused_types=27`.
  - target unused export was `buildLonglineAgentLabSuite` in `src/agent-lab-longline.ts`.
- CodeGraph context for `buildLonglineAgentLabSuite`, `fullRuntimeWorkbenchSummary`, and `normalizeStandardDomainAgentSkeleton`
  - surfaced `buildLonglineAgentLabSuite` as the entry point in `src/agent-lab-longline.ts`.
  - showed same-file `buildLonglineAgentLabResult` as the retained public wrapper that runs the suite.
- `rg -n "buildLonglineAgentLabSuite|buildLonglineAgentLabResult|agent-lab-longline" . --glob '!node_modules/**' --glob '!dist/**' --glob '!package-lock.json'`
  - live production callers import `buildLonglineAgentLabResult` from `src/agent-lab-complete.ts` and `src/cli/modules/agent-lab-public-payloads.ts`.
  - `tests/src/agent-lab.test.ts` was the only external direct import of `buildLonglineAgentLabSuite`.
  - no live source or docs require `buildLonglineAgentLabSuite` as public API.

## Changes

- `src/agent-lab-longline.ts`
  - Made `buildLonglineAgentLabSuite` module-private.
  - Kept `buildLonglineAgentLabResult` public and unchanged.
- `tests/src/agent-lab.test.ts`
  - Switched the longline behavior test to call `buildLonglineAgentLabResult`.
  - Kept the same longline summary and task-count assertions.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-69.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 69 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `src/agent-lab-longline.ts`
- `src/agent-lab-complete.ts`
- `src/cli/modules/agent-lab-public-payloads.ts`
- `src/agent-lab.ts`
- `tests/src/agent-lab.test.ts`
- `docs/runtime/opl-agent-lab-control-plane.md`
- fresh fallow output
- CodeGraph context output for Agent Lab longline suite surface
- live `rg` references for Agent Lab longline exports and callers

Edited:

- `src/agent-lab-longline.ts`
- `tests/src/agent-lab.test.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-69.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. One TypeScript suite-builder export was retired from the public module surface.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `b104ae54` before part69 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part69-agent-lab-longline-suite-export`.
- Branch: `codex/opl-doc-governance-20260529-part69-agent-lab-longline-suite-export`, based on root `main`.

## Verification

To be completed before absorb:

- focused Agent Lab tests.
- `npm run typecheck`.
- `node scripts/test-lanes.mjs assert-coverage`.
- fresh fallow summary.
- `git diff --check`.
- conflict-marker scan.
- `opl-doc-doctor doctor . --format json`.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidates include `fullRuntimeWorkbenchSummary`, `normalizeStandardDomainAgentSkeleton`, Codex stage-runner helper exports, and tightly scoped provider helper exports. Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
