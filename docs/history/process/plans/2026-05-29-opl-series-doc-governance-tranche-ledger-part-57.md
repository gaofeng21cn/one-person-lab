# OPL series docs governance tranche ledger part 57

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_57`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 family-runtime command contract、CLI behavior oracle、runtime provider truth、domain truth、artifact authority、quality verdict、owner receipt、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/family-runtime-command-parts/registry.ts`、`src/family-runtime-command.ts`、focused family-runtime CLI tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 family-runtime command parser 的过宽公共导出面：

- `src/family-runtime-command-parts/registry.ts`
- process ledger index

目标是把 fallow 标出的、只在 registry 模块内部消费的 command usage string 与 command registry array 收回为 module-private implementation details，同时保持 public `parseRegisteredFamilyRuntimeCommand`、`parseFamilyRuntimeCommand` 和 `opl family-runtime` CLI 行为不变。这里不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json`
  - before part57, `unused_exports=161`.
  - target unused exports included `FAMILY_RUNTIME_COMMAND_USAGE` and `FAMILY_RUNTIME_COMMAND_REGISTRY` in `src/family-runtime-command-parts/registry.ts`.
  - refactoring target list ranked `src/family-runtime-command-parts/registry.ts` as the first dead-code quick win.
- CodeGraph caller checks:
  - `FAMILY_RUNTIME_COMMAND_USAGE`: no callers found.
  - `FAMILY_RUNTIME_COMMAND_REGISTRY`: no callers found.
  - `parseRegisteredFamilyRuntimeCommand`: called by `parseFamilyRuntimeCommand` in `src/family-runtime-command.ts`.
- `rg -n "FAMILY_RUNTIME_COMMAND_(USAGE|REGISTRY)|parseRegisteredFamilyRuntimeCommand|parseFamilyRuntimeCommand" src tests docs package.json`
  - target constants are not imported by tests or other modules.
  - public parser entry remains the consumed surface.
- Focused family-runtime CLI tests cover public parsing, help/unknown-command behavior, transition bridge and evidence-worklist command paths that consume the registry internals.

## Changes

- `src/family-runtime-command-parts/registry.ts`
  - Changed `FAMILY_RUNTIME_COMMAND_USAGE` from exported constant to module-private constant.
  - Changed `FAMILY_RUNTIME_COMMAND_REGISTRY` from exported constant to module-private constant.
  - Kept `parseRegisteredFamilyRuntimeCommand` export unchanged.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-57.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 57 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `README.md`
- `docs/README.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `src/family-runtime-command-parts/registry.ts`
- `src/family-runtime-command.ts`
- focused CLI/family-runtime test surfaces
- `docs/history/process/plans/README.md`
- fresh fallow output
- CodeGraph context/caller output for the target registry symbols

Edited:

- `src/family-runtime-command-parts/registry.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-57.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. Two TypeScript constant exports were retired from the public module surface.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `b8e9c4c2` before part57 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part57-family-runtime-command-registry-exports`.
- Branch: `codex/opl-doc-governance-20260529-part57-family-runtime-command-registry-exports`, based on root `main`.

## Verification

Fresh verification before absorb:

- `npm ci` exited `0` and ran `npm run build`; npm audit still reports 10 high severity vulnerabilities, unchanged and not addressed.
- `node --test --experimental-strip-types tests/src/cli/cases/contracts-help.test.ts tests/src/cli/cases/family-runtime.test.ts tests/src/cli/cases/family-runtime-evidence-worklist-domain-blockers.test.ts` reported `tests 65`, `pass 65`, `fail 0`.
- `npm run typecheck` exited `0`.
- `node scripts/test-lanes.mjs assert-coverage` exited `0` and reported all active test files assigned to a test lane.
- `npx --yes fallow@latest --root . --no-cache --production --format json --summary` exited `0`; summary included `unused_files=0`, `unused_dependencies=0`, `unresolved_imports=0`, `unused_exports=159`, `unused_types=30`, `duplicate_exports=7`, `circular_dependencies=26`.
- `git diff --check` exited `0`.
- Conflict-marker scan returned no matches: `rg -n '^(<<<<<<<|=======|>>>>>>>)' src tests docs README.md .github contracts`.
- `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidates include ledger reader/file-path exports, domain-manifest projection-cache helpers, tightly scoped provider helper exports, or small `opl-runtime-paths.ts` URL helper exports. Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.
- If App dirty lanes are resolved or explicitly assigned, refresh App active truth and release evidence docs from clean App main before editing App-owned files.
- If active shell dirty lanes are resolved or explicitly assigned, refresh shell Docker/WebUI auth/session docs and tests from clean shell main before editing shell-owned files.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
