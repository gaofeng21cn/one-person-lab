# OPL series docs governance tranche ledger part 31

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_31`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、source/workspace contract、artifact/package lifecycle contract、App read model、domain owner receipt 或 readiness oracle。当前 truth 回到 `contracts/opl-framework/generic-substrate-projection-contract.json`、`contracts/opl-framework/standard-domain-agent-skeleton-contract.json`、`contracts/family-orchestration/family-lifecycle-ledger.schema.json`、source、tests、核心五件套和 live CLI/read-model。
Date: `2026-05-29`

## Scope

本轮继续 OPL support-reference coverage，处理：

- `docs/source/workspace-source-intake-boundary.md`
- `docs/delivery/artifact-package-lifecycle-boundary.md`

目标是把 source/delivery support docs 从静态 owner split 说明补齐为 stable support reference：明确 currentness policy、动态证据入口和 negative boundary，避免后续把 workspace/source/artifact/package/lifecycle refs、App/workbench projection 或 lifecycle index 读成 domain source truth、artifact authority、ready/export verdict、owner receipt 或 production ready。

## Fresh Evidence

本轮 live evidence：

- `contracts/opl-framework/generic-substrate-projection-contract.json`
  - OPL 只拥有 workspace/source/artifact/memory locator、index、lifecycle projection、manifest ref transport 和 operator workbench grouping。
  - Domain agents 继续拥有 workspace truth、source truth body、artifact body、artifact authority、memory body、memory writeback accept/reject、quality verdict 与 publication/fundability/visual verdict。
- `contracts/opl-framework/standard-domain-agent-skeleton-contract.json`
  - Standard Foundry Agent repo-source 不保存真实 artifacts；artifact roots 是 locators。
  - OPL allowed content 只包括 locator refs、freshness、receipt refs、restore proof refs 和 migration state。
  - OPL-owned generic primitives 包括 `workspace_source_intake_shell` 与 `artifact_package_lifecycle_shell`；domain retained thin surfaces 仍包括 domain truth、artifact authority、owner receipt、typed blocker、quality/export verdict 和 domain handler target。
- `src/runtime-tray-workspace-source-intake.ts`
  - `buildAttemptWorkspaceSourceIntake` 与 workbench projection 只投影 workspace root、runtime root、profile ref、source/material refs、missing material attention refs、source fingerprint 和 checkpoint refs。
  - authority boundary 明确 `can_authorize_source_readiness=false`、`can_select_domain_profile=false`、`can_write_domain_truth=false`。
- `src/runtime-tray-package-export-lifecycle.ts`
  - package/export projection 只投影 package refs、export refs、gap report refs、handoff refs、artifact refs 和 external submission status ref。
  - authority boundary 明确 `can_authorize_package_readiness=false`、`can_authorize_export_verdict=false`、`can_mutate_artifact=false`、`can_write_domain_truth=false`。
- `src/family-runtime-lifecycle-index.ts` and `tests/src/family-runtime-lifecycle-index.test.ts`
  - Lifecycle index records refs-only SQLite sidecar entries without domain authority.
  - Dry-run does not write cleanup ledger receipts.
  - Apply writes only safe OPL-owned cleanup receipt / ledger refs, while domain artifact mutation stays as domain owner receipt ref.
  - Active source repo file deletion and domain body mutation remain fail-closed.
- `src/family-runtime-command-parts/registry.ts` and `src/family-runtime-command-parts/lifecycle.ts`
  - CLI exposes `opl family-runtime lifecycle apply` and `opl family-runtime lifecycle reconcile`.
  - There is no `opl family-runtime lifecycle list` command; list/read currentness belongs to the lifecycle index, tests and App/operator read-model surfaces.
- `docs/policies/runtime-artifact-hygiene-policy.md`
  - Developer checkout stores repo-source, contracts, tests and docs only; workspace state body, runtime artifact body, receipt instances and deliverables belong outside the checkout.

## Changes

- `docs/source/workspace-source-intake-boundary.md`
  - Added currentness policy: stable support text must not freeze source ref counts, workspace binding counts, App/workbench route counts or readiness state.
  - Added dynamic evidence table for generic substrate projection, stage attempt source intake, repo-source boundary and App/workbench projection.
  - Added explicit negative boundary for source readiness, source truth currentness, source body access, domain profile selection, runtime workspace roots and retired product-entry / gateway-era / local-manager / compat entrypoints.
- `docs/delivery/artifact-package-lifecycle-boundary.md`
  - Added currentness policy: stable support text must not freeze artifact/package/export/lifecycle ref counts, App gallery counts, verified receipt counts or readiness state.
  - Added dynamic evidence table for generic substrate projection, package/export projection, lifecycle apply/index and repo-source artifact boundary.
  - Corrected lifecycle CLI evidence to the real `apply` / `reconcile` surfaces and removed the nonexistent `lifecycle list` command from the machine-entry row.
  - Added explicit negative boundary for artifact/export/submission/quality/production ready, App gallery authority, lifecycle apply authority, developer checkout artifact roots and retired product-entry / gateway-era / local-manager / compat entrypoints.

No contracts, source, tests, package scripts, App files, Aion shell files, MAS/MAG/RCA/OMA repos, or runtime ledgers were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/source/README.md`
- `docs/source/workspace-source-intake-boundary.md`
- `docs/delivery/README.md`
- `docs/delivery/artifact-package-lifecycle-boundary.md`
- `docs/docs_portfolio_consolidation.md`
- `docs/active/development-document-portfolio.md`
- `docs/policies/runtime-artifact-hygiene-policy.md`
- `docs/specs/shared-runtime-contract.md`
- `docs/specs/shared-domain-contract.md`
- `contracts/opl-framework/generic-substrate-projection-contract.json`
- `contracts/opl-framework/standard-domain-agent-skeleton-contract.json`
- `contracts/family-orchestration/family-lifecycle-ledger.schema.json`
- `src/generic-substrate-projection.ts`
- `src/runtime-tray-workspace-source-intake.ts`
- `src/runtime-tray-package-export-lifecycle.ts`
- `src/family-runtime-lifecycle-index.ts`
- `tests/src/generic-substrate-projection.test.ts`
- `tests/src/family-runtime-lifecycle-index.test.ts`
- `tests/src/cli/cases/runtime-app-operator-drilldown-lifecycle.test.ts`
- prior `part-30` memory and process ledger to avoid duplicate scope

Edited:

- `docs/source/workspace-source-intake-boundary.md`
- `docs/delivery/artifact-package-lifecycle-boundary.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-31.md`
- `docs/history/process/plans/README.md`

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was clean and synced at `6cb9fabb` before starting part31.
- New worktree: `/Users/gaofeng/workspace/one-person-lab-opl-cleanup-part31`.
- New branch: `codex/opl-doc-governance-20260529-part31-source-delivery`.
- Retained unrelated worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/dm003-default-executor-handoff` on `fix/dm003-default-executor-handoff`.

## Remaining stale / retire candidates

- Continue scanning `docs/runtime/*` for support docs that still mix stable runtime role with dated proof/current counters.
- Continue scanning `docs/references/current-support/*` for fixed App/release/provider evidence snapshots.
- Re-check `docs/specs/shared-runtime-contract.md` and `docs/specs/shared-domain-contract.md` if their date anchors or old `Domain Gateway` / `Domain Harness OS` notes start acting as current truth instead of support reference.
- Continue six-repo OPL series governance from each repo's ideal-state reference and active truth plan; this tranche only covered OPL source/delivery support references.

## Next tranche write scope

- Prefer a small OPL runtime/current-support tranche backed by live contracts/source/tests/read-model evidence.
- Candidate areas:
  - `docs/runtime/*` runtime support docs;
  - `docs/references/current-support/*` release/install/App support references;
  - cross-repo active truth owner refresh if fresh `framework readiness`, App/operator drilldown or domain owner surfaces expose a new contradiction.
