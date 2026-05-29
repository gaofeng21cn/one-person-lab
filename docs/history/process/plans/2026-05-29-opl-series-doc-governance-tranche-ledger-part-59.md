# OPL series docs governance tranche ledger part 59

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_59`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 domain manifest cache contract、CLI/API behavior oracle、runtime provider truth、domain truth、artifact authority、quality verdict、owner receipt、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/domain-manifest/projection-cache.ts`、domain manifest catalog source、focused domain-manifest/cache tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 domain manifest projection cache helper 的过宽公共导出面：

- `src/domain-manifest/projection-cache.ts`
- process ledger index

目标是把 fallow 标出的 `readDomainManifestProjectionCache` 收回为 non-public implementation detail，同时保持 public `writeResolvedDomainManifestProjectionCache` 与 `hydrateDomainManifestCatalogFromProjectionCache` 行为不变。这里不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json --summary`
  - before part59, `unused_exports=155`.
  - target unused export included `readDomainManifestProjectionCache` in `src/domain-manifest/projection-cache.ts`.
- `rg -n "readDomainManifestProjectionCache|domainManifestProjectionCache" src tests docs contracts package.json`
  - the target helper appears only in `src/domain-manifest/projection-cache.ts`.
  - `hydrateDomainManifestCatalogFromProjectionCache` remains the public cache hydration surface.
- CodeGraph caller/context output:
  - `readDomainManifestProjectionCache` has one caller: `hydrateDomainManifestCatalogFromProjectionCache` in the same file.
  - `hydrateDomainManifestCatalogFromProjectionCache -> readDomainManifestProjectionCache -> cacheKey/readCacheFile` is the retained internal flow.

## Changes

- `src/domain-manifest/projection-cache.ts`
  - Made `readDomainManifestProjectionCache` module-private.
  - Kept `writeResolvedDomainManifestProjectionCache` and `hydrateDomainManifestCatalogFromProjectionCache` exports unchanged.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-59.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 59 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `src/domain-manifest/projection-cache.ts`
- fresh fallow output
- CodeGraph caller/context output for domain manifest projection cache helpers

Edited:

- `src/domain-manifest/projection-cache.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-59.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. One TypeScript helper export was retired from the public module surface.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `8cc1de7e` before part59 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part59-domain-manifest-projection-cache-exports`.
- Branch: `codex/opl-doc-governance-20260529-part59-domain-manifest-projection-cache-exports`, based on root `main`.

## Verification

To be completed before absorb:

- focused domain-manifest/cache tests.
- `npm run typecheck`.
- `node scripts/test-lanes.mjs assert-coverage`.
- fresh fallow summary.
- `git diff --check`.
- conflict-marker scan.
- `opl-doc-doctor doctor . --format json`.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidates include `family-runtime-sqlite.ts` helper exports, ledger reader/file-path exports, and tightly scoped provider helper exports. Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
