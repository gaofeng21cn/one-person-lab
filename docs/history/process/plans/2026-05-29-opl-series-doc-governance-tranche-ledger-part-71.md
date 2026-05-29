# OPL series docs governance tranche ledger part 71

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_71`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 standard domain-agent skeleton contract、CLI/API behavior oracle、domain conformance oracle、runtime provider truth、domain truth、owner receipt、typed blocker、artifact authority、quality verdict、App release oracle、physical-delete authorization 或 production readiness oracle。当前 truth 回到 `src/family-domain-agent-skeleton.ts`、`src/cli/cases/public-command-specs.ts`、focused agents descriptor/conformance tests、fresh fallow output、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 App/workbench projection。
Date: `2026-05-29`

## Scope

本轮继续从 source/interface 层清理 standard domain-agent skeleton 的过宽公共导出面：

- `src/family-domain-agent-skeleton.ts`
- process ledger index

目标是把 fallow 标出的 internal normalizer `normalizeStandardDomainAgentSkeleton` 收回为 non-public implementation detail，同时保持 public `buildStandardDomainAgentSkeletonInspection`、`buildFamilyAgentsList`、`buildFamilyAgentInspect`、`runFamilyAgentLegacyCleanupApply`、CLI `opl agents list|inspect|legacy-cleanup apply` 和 descriptor / conformance read-model 行为不变。这里不新增兼容 alias、facade、wrapper 或测试专用公共入口。

## Fresh Evidence

本轮 live evidence：

- `npx --yes fallow@latest --root . --no-cache --production --format json --summary`
  - before part71, `unused_exports=133` and `unused_types=27`.
  - target unused export was `normalizeStandardDomainAgentSkeleton` in `src/family-domain-agent-skeleton.ts`.
- CodeGraph context for `normalizeStandardDomainAgentSkeleton`
  - surfaced the normalizer in `src/family-domain-agent-skeleton.ts` and same-file helper/caller context.
  - did not identify external callers for the normalizer.
- `rg -n "normalizeStandardDomainAgentSkeleton|buildStandardDomainAgentSkeletonInspection|buildFamilyAgentsList|runFamilyAgentLegacyCleanupApply|family-domain-agent-skeleton|agents descriptors|agents descriptor|agents conformance" src tests docs contracts package.json`
  - `normalizeStandardDomainAgentSkeleton` appears only in `src/family-domain-agent-skeleton.ts`.
  - live external source imports retained public entry points from `src/family-domain-agent-skeleton.ts`: descriptor inspection, family agents list, and legacy cleanup apply surfaces.
  - CLI public command specs wire the retained public entry points to `opl agents list|inspect|legacy-cleanup apply`; descriptor/conformance surfaces continue through their existing owners.

## Changes

- `src/family-domain-agent-skeleton.ts`
  - Made `normalizeStandardDomainAgentSkeleton` module-private.
  - Kept `buildStandardDomainAgentSkeletonInspection`, `buildFamilyAgentsList`, `buildFamilyAgentInspect`, and `runFamilyAgentLegacyCleanupApply` exports unchanged.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-71.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 71 index row.

No machine-readable contracts, workflows, runtime ledgers, provider state, App repo files, shell repo files, domain repo files or read-model output were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `src/family-domain-agent-skeleton.ts`
- `src/family-domain-agent-descriptor.ts`
- `src/runtime-tray-app-operator-drilldown.ts`
- `src/runtime-operator-action-execution.ts`
- `src/cli/cases/public-command-specs.ts`
- `tests/src/cli/cases/workspace-domain.lifecycle-cleanup.test.ts`
- `tests/src/cli/cases/workspace-domain.descriptor.test.ts`
- `tests/src/cli/cases/agents-conformance.test.ts`
- `contracts/opl-framework/standard-domain-agent-skeleton-contract.json`
- fresh fallow output
- CodeGraph context output for standard domain-agent skeleton normalizer
- live `rg` references for standard domain-agent skeleton exports and callers

Edited:

- `src/family-domain-agent-skeleton.ts`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-71.md`
- `docs/history/process/plans/README.md`

No docs, modules, workflows, App release files, shell files or domain repo files were archived, tombstoned or deleted in this tranche. One TypeScript normalizer export was retired from the public module surface.

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced with `origin/main` at `1eb3a926` before part71 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/opl-cleanup-part71-domain-agent-skeleton-normalizer-export`.
- Branch: `codex/opl-doc-governance-20260529-part71-domain-agent-skeleton-normalizer-export`, based on root `main`.

## Verification

To be completed before absorb:

- focused agents descriptor / lifecycle / conformance tests.
- `npm run typecheck`.
- `node scripts/test-lanes.mjs assert-coverage`.
- fresh fallow summary.
- `git diff --check`.
- conflict-marker scan.
- `opl-doc-doctor doctor . --format json`.

## Remaining stale / retire candidates

- Continue retiring the remaining fallow-reported public exports only after checking each symbol's active CLI/API/test/document role and replacement owner.
- Likely next candidates include Codex stage-runner helper exports and tightly scoped provider helper exports. Avoid large runtime/provider API exports until their package/API role is explicitly proven.
- Continue checking `docs/specs/**`, `docs/runtime/**`, `docs/product/**`, `docs/public/**` and current-support docs for stale Gateway/frontdoor/routed-action wording, retired interface names, compatibility alias language, App release overclaims or prose path machine-interface drift.

## Next tranche write scope

- Prefer another small source/export, specs/runtime/product, public-doc or current-support cleanup tranche backed by fresh contracts/source/tests/read-model evidence.
- Keep tranches small: edit only the support doc, source module, contract or focused guard that actually owns the stale claim, then absorb to `main`, root-reverify and push.
