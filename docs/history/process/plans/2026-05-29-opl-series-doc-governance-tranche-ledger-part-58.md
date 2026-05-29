# OPL series docs governance tranche ledger part 58

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_58`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 OPL runtime path contract、CLI/API behavior oracle、runtime provider truth、domain truth、artifact authority、quality verdict、owner receipt、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/opl-runtime-paths.ts`、`src/opl-runtime-paths/current.ts`, `src/opl-runtime-paths/shared.ts`, focused endpoint/path tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 OPL runtime endpoint helper 的过宽公共导出面：

- `src/opl-runtime-paths.ts`
- process ledger index

目标是把 fallow 标出的 URL / base-path helper exports 收回为 non-public implementation details or retired code，同时保持 public `OplEndpoints` type alias、`buildOplEndpoints` 和 current runtime endpoint catalog 不变。这里不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production`
  - before part58, `unused_exports=159`.
  - target unused exports included `normalizeBasePath` re-export, `buildOplEntryUrl`, `buildOplApiBaseUrl`, and `stripOplBasePath` in `src/opl-runtime-paths.ts`.
  - refactoring target list ranked `src/opl-runtime-paths.ts` as the first dead-code quick win.
- `rg --files | rg 'opl.*paths|web-paths'` and `git ls-files 'src/opl-web-paths.ts' 'src/opl-runtime-paths.ts' 'src/opl-runtime-paths/*'`
  - tracked live files are `src/opl-runtime-paths.ts`, `src/opl-runtime-paths/current.ts`, and `src/opl-runtime-paths/shared.ts`.
  - no tracked `src/opl-web-paths.ts` file exists in the current checkout.
- `rg -n "normalizeBasePath|buildOplEntryUrl|buildOplApiBaseUrl|stripOplBasePath|opl-runtime-paths" src tests docs package.json contracts`
  - `buildOplEndpoints` and `OplEndpoints` remain the consumed top-level public surface.
  - `normalizeBasePath` remains directly consumed by `src/opl-runtime-paths/current.ts` from `src/opl-runtime-paths/shared.ts`.
  - the target top-level re-export / URL helpers are not imported by tests, docs, contracts, package metadata, or live source outside their owning file.
- CodeGraph context/caller output:
  - `buildOplEndpoints` has active callers in system installation and app state code.
  - CodeGraph still returned stale references to `src/opl-web-paths.ts`, but live filesystem and `git ls-files` show that file is absent. This tranche therefore treats live tracked files plus fallow/typecheck/test as authoritative.
- Focused endpoint/path tests cover the public `buildOplEndpoints` behavior that remains.

## Changes

- `src/opl-runtime-paths.ts`
  - Removed top-level `normalizeBasePath` re-export.
  - Removed exported `buildOplEntryUrl`, `buildOplApiBaseUrl`, and `stripOplBasePath` helpers.
  - Kept `OplEndpoints` type alias and `buildOplEndpoints` export unchanged.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-58.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 58 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `README.md`
- `docs/README.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `src/opl-runtime-paths.ts`
- `src/opl-runtime-paths/current.ts`
- `src/opl-runtime-paths/shared.ts`
- `tests/src/runtime-state-paths.test.ts`
- `src/system-installation/environment.ts`
- fresh fallow output
- CodeGraph context/caller output for OPL runtime path helpers
- tracked file inventory for OPL path modules

Edited:

- `src/opl-runtime-paths.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-58.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. Four top-level TypeScript helper exports were retired from the public module surface.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `fd73d8f4` before part58 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part58-opl-runtime-path-helper-exports`.
- Branch: `codex/opl-doc-governance-20260529-part58-opl-runtime-path-helper-exports`, based on root `main`.

## Verification

Fresh verification before absorb:

- `npm ci` exited `0` and ran `npm run build`; npm audit still reports 10 high severity vulnerabilities, unchanged and not addressed.
- `node --test --experimental-strip-types tests/src/runtime-state-paths.test.ts tests/src/cli/cases/system-commands.test.ts tests/src/cli/cases/app-state.test.ts` reported `tests 31`, `pass 31`, `fail 0`.
- `npm run typecheck` exited `0`.
- `node scripts/test-lanes.mjs assert-coverage` exited `0` and reported all active test files assigned to a test lane.
- `npx --yes fallow@latest --root . --no-cache --production --format json --summary` exited `0`; summary included `unused_files=0`, `unused_dependencies=0`, `unresolved_imports=0`, `unused_exports=155`, `unused_types=30`, `duplicate_exports=7`, `circular_dependencies=26`.
- `git diff --check` exited `0`.
- Conflict-marker scan returned no matches: `rg -n '^(<<<<<<<|=======|>>>>>>>)' src tests docs README.md .github contracts`.
- `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidates include `family-runtime-sqlite.ts` helper exports, ledger reader/file-path exports, domain-manifest projection-cache helpers, and tightly scoped provider helper exports. Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.
- If App dirty lanes are resolved or explicitly assigned, refresh App active truth and release evidence docs from clean App main before editing App-owned files.
- If active shell dirty lanes are resolved or explicitly assigned, refresh shell Docker/WebUI auth/session docs and tests from clean shell main before editing shell-owned files.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
