# OPL series docs governance tranche ledger part 75

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_75`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 family runtime provider contract、runtime truth、domain truth、owner receipt、typed blocker、artifact authority、quality verdict、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/family-runtime-providers.ts`, `src/family-runtime-status.ts`, `src/runtime-manager.ts`, focused family-runtime provider tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 family runtime provider list 的过时公共导出面：

- `src/family-runtime-providers.ts`
- `src/family-runtime.ts`
- process ledger index

目标是删除 fallow 标出的 old provider list surface，同时保持当前 lifecycle-aware provider runtime read model 不变：

- 删除 `family-runtime-providers.ts` 对 `FAMILY_RUNTIME_PROVIDER_KINDS` / `FamilyRuntimeProviderKind` 的 barrel re-export；canonical owner 仍是 `src/family-runtime-types.ts`。
- 删除无 active caller 的 `inspectFamilyRuntimeProviders`。
- 移除 `src/family-runtime.ts` 对 `inspectFamilyRuntimeProviders` 的未用 import。
- 保留 `inspectFamilyRuntimeProvidersWithLifecycle`, `inspectSelectedFamilyRuntimeProvidersWithLifecycle`, `inspectFamilyRuntimeProviderWithLifecycle`, `resolveFamilyRuntimeProviderKind`, `inspectFamilyRuntimeProvider`, CLI `family-runtime status`, runtime manager provider projection 和 App/operator read model 不变。

本轮不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json --summary`
  - before part75, `unused_exports=119` and `unused_types=27`.
  - target unused exports were `FAMILY_RUNTIME_PROVIDER_KINDS` re-export and `inspectFamilyRuntimeProviders` in `src/family-runtime-providers.ts`.
- CodeGraph context / callers:
  - `FAMILY_RUNTIME_PROVIDER_KINDS` canonical definition is `src/family-runtime-types.ts`; CLI shared parser imports the canonical type module directly.
  - CodeGraph callers for `inspectFamilyRuntimeProviders` returned no callers.
- `rg -n "\b(FAMILY_RUNTIME_PROVIDER_KINDS|inspectFamilyRuntimeProviders|family-runtime-providers)\b" src tests docs contracts package.json README.md`
  - showed no source imports of `FAMILY_RUNTIME_PROVIDER_KINDS` from `family-runtime-providers.ts`.
  - showed `inspectFamilyRuntimeProviders` appears only in its owning file and an unused import in `src/family-runtime.ts`.
  - showed active provider status surfaces use lifecycle-aware `inspectSelectedFamilyRuntimeProvidersWithLifecycle` / `inspectFamilyRuntimeProvidersWithLifecycle`.
- Focused source/test read:
  - `src/family-runtime-status.ts` consumes `inspectSelectedFamilyRuntimeProvidersWithLifecycle` for `opl family-runtime status`.
  - `src/runtime-manager.ts` consumes the lifecycle-aware provider runtime projection.
  - focused provider tests assert `provider_runtime.allowed_providers`, `provider_catalog`, default Temporal provider, and lifecycle-aware readiness from those retained surfaces.

## Changes

- `src/family-runtime-providers.ts`
  - Removed unused barrel re-export of `FAMILY_RUNTIME_PROVIDER_KINDS` and `FamilyRuntimeProviderKind`.
  - Deleted unused `inspectFamilyRuntimeProviders`.
  - Kept lifecycle-aware provider inspection exports unchanged.
- `src/family-runtime.ts`
  - Removed unused `inspectFamilyRuntimeProviders` import.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-75.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 75 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files, tests or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `README.md`
- `docs/README.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `src/family-runtime-providers.ts`
- `src/family-runtime-types.ts`
- `src/family-runtime.ts`
- `src/family-runtime-status.ts`
- `src/runtime-manager.ts`
- focused family-runtime provider tests by reference search
- fresh fallow output
- CodeGraph context / callers output for provider list exports
- live `rg` references for provider list helpers and retained lifecycle-aware provider surfaces

Edited:

- `src/family-runtime-providers.ts`
- `src/family-runtime.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-75.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. Two old provider list public surfaces were retired from `family-runtime-providers.ts`.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `0ac5c721` before part75 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part75-provider-list-exports`.
- Branch: `codex/opl-doc-governance-20260529-part75-provider-list-exports`, based on root `main`.

## Verification

Completed in the part75 worktree before absorb:

- `npm ci` exited `0`, ran `npm run build`, and npm audit still reports 10 high severity vulnerabilities, unchanged and not addressed in this tranche.
- `node --test --experimental-strip-types tests/src/cli/cases/family-runtime.test.ts tests/src/cli/cases/runtime-manager-provider.test.ts tests/src/cli/cases/family-runtime-managed-state.test.ts tests/src/cli/cases/family-runtime-worker.test.ts` exited `0`, reporting `tests 40`, `pass 40`, `fail 0`.
- `npm run typecheck` exited `0`.
- `node scripts/test-lanes.mjs assert-coverage` exited `0`, all 212 active test files assigned.
- fresh fallow summary exited `0` with `unused_exports=117` and `unused_types=27`.
- `git diff --check` exited `0`.
- conflict-marker scan returned no matches.
- `opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`; worktree profile reported `tooling_repo` because of worktree path shape, so root checkout must be rechecked after absorb.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidates include stage admission / ledger helpers, test-only helper exports, managed install/update ledger helpers, and small source helper exports.
- Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
