# OPL series docs governance tranche ledger part 32

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_32`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、runtime manager contract、stage attempt contract、provider readiness oracle、App/operator read model、domain owner receipt 或 production readiness oracle。当前 truth 回到 `contracts/`、source、tests、核心五件套和 live CLI/read-model。
Date: `2026-05-29`

## Scope

本轮继续 OPL runtime support coverage，处理：

- `docs/runtime/README.md`

目标是把 runtime 目录索引从具体 MAS task/attempt 同步规则承载页收窄为 stable support index：明确 currentness policy、动态证据入口和 negative boundary，避免后续把索引页里的 dated task/attempt behavior、provider snapshot、Search Attribute 状态或 App/operator counter 读成当前 runtime truth、domain ready 或 production ready。

## Fresh Evidence

本轮 live evidence：

- `contracts/opl-framework/runtime-manager-contract.json`
  - OPL Runtime Manager owns provider selection, typed family queue, stage attempt ledger, dispatch contracts, profile wiring, diagnostics, task registration hydration, status projection, optional native helper catalog and high-frequency state indexes.
  - Domain repos keep truth and quality authority.
  - MAS route projection is contract-backed by `mas_runtime_owner_route_handoff` -> `opl_runtime_owner_route`; OPL owns generic queue / stage attempt / liveness / provider wakeup / redrive / retry / dead-letter only.
- `contracts/family-orchestration/family-conflict-envelope.schema.json`
  - Conflict/blocker envelope is the shared fail-closed vocabulary for duplicate tasks, owner conflicts, evidence blockers, human gates, retry/dead-letter outcomes, incomplete identity and closeout conflicts.
  - Authority boundary fixes `provider_completion_is_domain_ready=false`, `can_write_domain_truth=false` and `can_fallback_complete=false`.
- `contracts/opl-framework/family-runtime-attempt-contract.json` and `contracts/opl-framework/README.md`
  - `stage_progress_log` is the canonical OPL attempt/progress projection.
  - Required derivation sources are stage attempt ledger, provider run projection, activity events, typed closeout packet refs, domain-owned receipt refs and usage projection.
  - Forbidden derivation sources are domain truth body, memory body, artifact body and quality verdict body.
  - Temporal visibility Search Attributes are refs / indexable summary only.
- `docs/runtime/stage-graph-route-transition-runtime.md`
  - Already owns stage graph / route transition dynamic evidence wording and negative boundary.
  - It states App/operator drilldown, route graph, transition runner, provider SLO and evidence worklist counters are operator lenses, not readiness or verdicts.
- Source/tests reviewed:
  - `src/family-runtime*.ts`
  - `src/family-runtime-providers.ts`
  - `src/family-runtime-temporal-provider-parts/attempt-query.ts`
  - `src/family-runtime-stage-progress-log.ts`
  - `src/runtime-tray-snapshot.ts`
  - `tests/src/cli/cases/family-runtime-binding-intake.test.ts`
  - `tests/src/cli/cases/family-runtime.test.ts`
  - `tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts`
  - `tests/src/cli/cases/family-runtime-provider-hosted-attempts-cases/mas-default-executor-current-source.ts`

## Changes

- `docs/runtime/README.md`
  - Added currentness policy for runtime support index.
  - Replaced MAS-specific task/attempt synchronization paragraphs with a dynamic evidence table.
  - Kept durable runtime support facts at the index level: conflict envelope, runtime manager / route handoff, stage progress projection, Temporal visibility / repair, stage graph / transition / App drilldown.
  - Preserved negative boundaries: provider/executor completion, route visibility, App/operator counters, Search Attribute readiness or worklist state do not authorize domain truth, owner receipt, artifact authority, quality/export verdict, domain ready or production ready.

No contracts, source, tests, package scripts, App files, Aion shell files, MAS/MAG/RCA/OMA repos, runtime ledgers or provider state were modified.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/runtime/README.md`
- `docs/runtime/opl-runtime-naming-and-boundary-contract.md`
- `docs/runtime/stage-graph-route-transition-runtime.md`
- `docs/runtime/opl-agent-lab-control-plane.md`
- `docs/references/current-support/README.md`
- `contracts/opl-framework/runtime-manager-contract.json`
- `contracts/family-orchestration/family-conflict-envelope.schema.json`
- `contracts/opl-framework/family-runtime-attempt-contract.json`
- `contracts/opl-framework/README.md`
- `docs/history/process/plans/README.md`
- `src/family-runtime*.ts`
- `src/family-runtime-providers.ts`
- `src/family-runtime-temporal-provider-parts/attempt-query.ts`
- `src/family-runtime-stage-progress-log.ts`
- `src/runtime-tray-snapshot.ts`
- `tests/src/cli/cases/family-runtime-binding-intake.test.ts`
- `tests/src/cli/cases/family-runtime.test.ts`
- `tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts`
- `tests/src/cli/cases/family-runtime-provider-hosted-attempts-cases/mas-default-executor-current-source.ts`
- prior part 29 / 30 / 31 process ledger index entries to avoid duplicate scope

Edited:

- `docs/runtime/README.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-32.md`
- `docs/history/process/plans/README.md`

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was synced with `origin/main` at `b846a545` before starting part32.
- New worktree: `/Users/gaofeng/workspace/one-person-lab-opl-cleanup-part32`.
- New branch: `codex/opl-doc-governance-20260529-part32-runtime-support`.
- Retained unrelated worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/dm003-default-executor-handoff` on `fix/dm003-default-executor-handoff`.

## Remaining stale / retire candidates

- Continue scanning `docs/runtime/opl-agent-lab-control-plane.md` for support sections that still mix stable Agent Lab role with long current CLI inventory tables or dated proof language.
- Continue scanning `docs/references/current-support/*` for fixed App/release/provider evidence snapshots; part27 / part28 / part31 covered some files, but the folder remains a support-reference candidate set.
- Re-check `docs/specs/shared-runtime-contract.md` and `docs/specs/shared-domain-contract.md` if their old Domain Gateway / Domain Harness OS notes start acting as current truth instead of support reference.
- Continue six-repo OPL series governance from each repo's ideal-state reference and active truth plan; this tranche only covered OPL runtime support index currentness.

## Next tranche write scope

- Prefer a small Agent Lab support-reference tranche or current-support reference tranche backed by live contracts/source/tests/read-model evidence.
- Candidate areas:
  - `docs/runtime/opl-agent-lab-control-plane.md`
  - `docs/references/current-support/opl-release-packages-modular-distribution.md`
  - `docs/references/current-support/opl-default-skill-ecosystem.md`
  - cross-repo active truth owner refresh if fresh read-model evidence exposes a contradiction.
