# OPL series docs governance tranche ledger part 56

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_56`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 domain manifest contract、family transition runner contract、runtime provider truth、domain truth、artifact authority、quality verdict、owner receipt、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/domain-manifest/family-transition-normalizer.ts`、focused domain-manifest transition tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 domain manifest family-transition normalizer 的过宽公共导出面：

- `src/domain-manifest/family-transition-normalizer.ts`
- process ledger index

目标是把 fallow 标出的、只在本文件内消费的 transition spec / matrix case / projection helper 收回为 module-private implementation details，同时保持 public `normalizeFamilyTransitionSurfaces`、domain manifest read-model 和 transition runner projection 输出不变。这里不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json --summary`
  - before part56, `unused_exports=164` from part55 memory and fresh preflight.
  - after part56, `unused_exports=161`.
  - `unused_files=0`
  - `unused_dependencies=0`
  - `unresolved_imports=0`
  - `private_type_leaks=0`
  - `boundary_violations=0`
- CodeGraph caller checks:
  - `normalizeFamilyTransitionSpec`: only called by `normalizeFamilyTransitionSurfaces` in `src/domain-manifest/family-transition-normalizer.ts`.
  - `normalizeFamilyTransitionMatrixCases`: only called by `normalizeFamilyTransitionSurfaces` in `src/domain-manifest/family-transition-normalizer.ts`.
  - `normalizeFamilyTransitionProjection`: only called by `normalizeFamilyTransitionSurfaces` in `src/domain-manifest/family-transition-normalizer.ts`.
- `rg -n "normalizeFamilyTransitionSpec|normalizeFamilyTransitionMatrixCases|normalizeFamilyTransitionProjection" src tests docs package.json`
  - after the change, outside this history ledger all target names appear only inside `src/domain-manifest/family-transition-normalizer.ts`.
  - tests do not import these helpers directly.
- Focused domain manifest / transition tests cover public manifest normalization and transition projection behavior that consumes these internals.

## Changes

- `src/domain-manifest/family-transition-normalizer.ts`
  - Changed `normalizeFamilyTransitionSpec`, `normalizeFamilyTransitionMatrixCases`, and `normalizeFamilyTransitionProjection` from exported functions to module-private functions.
  - Kept `normalizeFamilyTransitionSurfaces` export unchanged.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-56.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 56 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `src/domain-manifest/family-transition-normalizer.ts`
- `src/domain-manifest/normalizers.ts`
- `src/family-transition-runner.ts`
- `tests/src/cli/cases/workspace-domain.transitions.test.ts`
- `tests/src/family-transition-runner.test.ts`
- `tests/src/cli/cases/family-runtime-transition-bridge.test.ts`
- `docs/history/process/plans/README.md`
- fresh fallow summary
- CodeGraph caller output for the target normalizer helper symbols

Edited:

- `src/domain-manifest/family-transition-normalizer.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-56.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. Three TypeScript helper exports were retired from the public module surface.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `c3db978c` before part56 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab-opl-cleanup-part56-family-transition-normalizer-exports`.
- Branch: `codex/opl-doc-governance-20260529-part56-family-transition-normalizer-exports`, based on root `main`.

## Verification

Fresh verification before absorb:

- `npm ci` exited `0` and ran `npm run build`; npm audit still reports 10 high severity vulnerabilities, unchanged and not addressed.
- `node --test --experimental-strip-types tests/src/cli/cases/workspace-domain.transitions.test.ts tests/src/family-transition-runner.test.ts tests/src/cli/cases/family-runtime-transition-bridge.test.ts` reported `tests 22`, `pass 22`, `fail 0`.
- `npm run typecheck` exited `0`.
- `node scripts/test-lanes.mjs assert-coverage` exited `0` and reported `All 212 active test files are assigned to a test lane.`
- `npx --yes fallow@latest --root . --no-cache --production --format json --summary` exited `0`; summary included `unused_files=0`, `unused_dependencies=0`, `unresolved_imports=0`, `unused_exports=161`, `unused_types=30`, `duplicate_exports=7`, `circular_dependencies=26`.
- `git diff --check` exited `0`.
- Conflict-marker scan returned no matches: `rg -n '^(<<<<<<<|=======|>>>>>>>)' src tests docs README.md .github contracts`.
- `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidates include ledger reader/file-path exports, domain-manifest projection-cache helpers, family-runtime command registry helpers, or tightly scoped provider helper exports. Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.
- If App dirty lanes are resolved or explicitly assigned, refresh App active truth and release evidence docs from clean App main before editing App-owned files.
- If active shell dirty lanes are resolved or explicitly assigned, refresh shell Docker/WebUI auth/session docs and tests from clean shell main before editing shell-owned files.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
