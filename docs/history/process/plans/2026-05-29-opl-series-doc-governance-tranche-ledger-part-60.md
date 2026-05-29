# OPL series docs governance tranche ledger part 60

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_60`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 family runtime SQLite contract、CLI/API behavior oracle、runtime provider truth、domain truth、artifact authority、quality verdict、owner receipt、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/family-runtime-sqlite.ts`、family-runtime store/lifecycle/memory callers、focused SQLite behavior tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 family runtime SQLite helper 的过宽公共导出面：

- `src/family-runtime-sqlite.ts`
- `tests/src/family-runtime-sqlite.test.ts`
- process ledger index

目标是把 fallow 标出的 `FAMILY_RUNTIME_SQLITE_BUSY_TIMEOUT_MS` 与 `configureFamilyRuntimeSqliteConnection` 收回为 non-public implementation details，同时保持 public `openFamilyRuntimeSqlite` 行为不变。测试继续验证 bounded busy timeout behavior，但不把内部常量作为 public contract 导入。这里不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json --summary`
  - before part60, `unused_exports=154`.
  - target unused exports included `FAMILY_RUNTIME_SQLITE_BUSY_TIMEOUT_MS` and `configureFamilyRuntimeSqliteConnection` in `src/family-runtime-sqlite.ts`.
- `rg -n "FAMILY_RUNTIME_SQLITE_BUSY_TIMEOUT_MS|configureFamilyRuntimeSqliteConnection|openFamilyRuntimeSqlite|family-runtime-sqlite" src tests docs contracts package.json`
  - `openFamilyRuntimeSqlite` remains imported by family runtime store, lifecycle store/index, tray snapshot/workbench, domain memory, provider closure, production closeout and focused SQLite tests.
  - `FAMILY_RUNTIME_SQLITE_BUSY_TIMEOUT_MS` was only imported by `tests/src/family-runtime-sqlite.test.ts`.
  - `configureFamilyRuntimeSqliteConnection` is only used by `openFamilyRuntimeSqlite` in its owning source file.
- CodeGraph did not resolve these small top-level symbols in the current index, so live `rg`, fallow, typecheck and focused behavior tests were treated as authoritative for this tranche.

## Changes

- `src/family-runtime-sqlite.ts`
  - Made `FAMILY_RUNTIME_SQLITE_BUSY_TIMEOUT_MS` module-private.
  - Made `configureFamilyRuntimeSqliteConnection` module-private.
  - Kept `FamilyRuntimeSqliteOpenOptions` and `openFamilyRuntimeSqlite` exports unchanged.
- `tests/src/family-runtime-sqlite.test.ts`
  - Removed direct import of the internal timeout constant.
  - Kept behavior assertions that `openFamilyRuntimeSqlite` sets `PRAGMA busy_timeout` to the expected bounded value for normal and read-only connections.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-60.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 60 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `src/family-runtime-sqlite.ts`
- `tests/src/family-runtime-sqlite.test.ts`
- fresh fallow output
- CodeGraph context/caller output for family runtime SQLite helpers
- live `rg` references for SQLite helper exports and callers

Edited:

- `src/family-runtime-sqlite.ts`
- `tests/src/family-runtime-sqlite.test.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-60.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. Two TypeScript helper exports were retired from the public module surface, and the focused test stopped consuming an internal helper as public API.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `c646c14e` before part60 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part60-family-runtime-sqlite-exports`.
- Branch: `codex/opl-doc-governance-20260529-part60-family-runtime-sqlite-exports`, based on root `main`.

## Verification

To be completed before absorb:

- focused SQLite/family-runtime tests.
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
