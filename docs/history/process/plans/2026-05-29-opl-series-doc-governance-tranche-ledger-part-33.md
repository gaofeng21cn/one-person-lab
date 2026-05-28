# OPL series docs governance tranche ledger part 33

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_33`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、Agent Lab contract、runtime readiness oracle、App/workbench read model、domain owner receipt、quality verdict、artifact authority 或 production readiness oracle。当前 truth 回到 `contracts/`、source、tests、核心五件套和 live CLI/read-model。
Date: `2026-05-29`

## Scope

本轮继续 OPL runtime support coverage，处理：

- `docs/runtime/opl-agent-lab-control-plane.md`

目标是把 Agent Lab 控制面支撑文档从长篇 live inventory / dated status / ready-pass 读法收窄为 stable support reference：明确 currentness policy、机器入口读法、Longline 测试归属和 negative boundary，避免后续把文档里的 suite pass、workbench ready、fixture receipt、provider completion、scorecard pass 或 risk-gate 状态读成 domain ready、production ready、owner receipt 或 App release ready。

## Fresh Evidence

本轮 live evidence：

- `contracts/opl-framework/agent-lab-contract.json`
  - Contract owns Agent Lab input refs, suite result refs, Developer Mode repair route, risk-tier promotion refs, efficiency/cost/stage-executor refs and forbidden authority boundary.
  - Forbidden authority flags keep Agent Lab from domain truth, memory body, artifact mutation, quality/export verdict, owner receipt, managed runtime mutation and default promotion without gate.
- `src/agent-lab-authority.ts`
  - `AGENT_LAB_AUTHORITY_BOUNDARY` fixes `can_write_domain_truth=false`, `can_write_memory_body=false`, `can_authorize_domain_ready=false`, `can_authorize_quality_verdict=false`, `can_authorize_export_verdict=false`, `can_mutate_domain_artifact=false`, `can_write_owner_receipt=false`, `can_modify_managed_runtime=false` and `can_promote_default_agent_without_gate=false`.
- Source surfaces reviewed:
  - `src/agent-lab.ts`
  - `src/agent-lab-complete.ts`
  - `src/agent-lab-longline.ts`
  - `src/agent-lab-promotion.ts`
  - `src/agent-lab-control-read-models.ts`
  - `src/agent-lab-ahe-evidence.ts`
  - `src/agent-lab-variant-comparison.ts`
  - `src/agent-lab-developer-mode.ts`
  - `src/agent-lab-work-order-execution.ts`
  - `src/agent-lab-efficiency-nonregression.ts`
  - `src/agent-lab-token-cost-estimate.ts`
  - `src/agent-lab-executor-capability-aperture.ts`
  - `src/agent-lab-stage-executor-policy.ts`
  - `src/runtime-tray-app-operator-drilldown.ts`
- Tests reviewed:
  - `tests/src/agent-lab.test.ts`
  - `tests/src/cli/cases/agent-lab.test.ts`
  - `tests/src/cli/cases/work-order-execution.test.ts`
  - `tests/src/agent-lab-developer-mode-contract.test.ts`
  - `scripts/test-lanes.mjs`
- Fresh CLI/read-model run from a checkout with installed dependencies:
  - `./bin/opl agent-lab complete --json` returned `surface_kind=opl_agent_lab_complete_control_plane`, `status=ready_for_opl_native_use`, `core_requires_external_eval_runtime=false`, `core_requires_langfuse_or_phoenix=false`, `automatic_mechanism_promotion_ready=false`, `automatic_model_training_ready=false`, and `automatic_default_agent_promotion_ready=risk_tiered_after_independent_ai_review`. Authority boundary remained false for domain truth, memory body, domain ready, quality/export verdict, artifact mutation, owner receipt, managed runtime mutation, shared submission action, model training/deploy and default promotion without gate.
  - `./bin/opl agent-lab workbench --json` returned `surface_kind=opl_agent_lab_workbench_read_model`, `app_workbench_consumption_ready=true`, refs-only source results, `observability_export_readiness.upload_external_service=false`, `observability_export_readiness.reads_domain_body=false`, and `efficiency_nonregression.status=ready`. This is App/workbench read-model readiness only, not App release ready or domain ready.
  - `./bin/opl agent-lab longline --json` returned `surface_id=opl_agent_lab_longline_suite`, `suite_kind=agent_lab_longline_suite`, `status=passed`, `task_count=3`, `recovery_probe_count=7`, `scorecard_passed_count=3`, `promotable_candidate_count=0`, and false authority for domain truth / owner receipt. This is framework-level regression guard only.
  - `./bin/opl work-order execute --json` without `--work-order` returned a usage error requiring `--work-order <developer-patch-work-order.json>`, confirming active command surface and avoiding the retired `agent-lab execute-work-order` alias.

## Changes

- `docs/runtime/opl-agent-lab-control-plane.md`
  - Added currentness policy for Agent Lab support reference.
  - Replaced fixed live inventory / ready-pass status table with a stable machine-entry table covering contract/authority, suite/read model, mechanism evolution, Developer Mode repair route, work-order primitive, efficiency/cost/executor policy and optional connector export.
  - Retained Longline test ownership split, while making suite pass and workbench readiness explicitly non-authoritative for domain, production, App release, artifact/export or owner receipt claims.
  - Moved future work wording from active next-step list to durable read rules that point back to the active gap plan, contracts, source, tests and fresh CLI/read-model.
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-33.md`
  - Added this coverage ledger.
- `docs/history/process/plans/README.md`
  - Added part 33 index row.

No contracts, source, tests, package scripts, App files, MAS/MAG/RCA/OMA repos, runtime ledgers or provider state were modified.

## Verification

Fresh verification:

- `rtk git diff --check` in the part33 worktree exited `0`.
- `rtk rg -n "^(<<<<<<<|=======|>>>>>>>)" docs README.md contracts scripts src tests .github` returned no conflict markers.
- `rtk opl-doc-doctor doctor . --format json` returned `finding_count=0` and `active_truth_health.status=pass`.
- Initial focused Agent Lab run in the isolated worktree passed 28 direct tests, then the two CLI case files failed before assertions because `@temporalio/client` was not installed. Root cause was missing worktree dependencies, not an Agent Lab semantic regression.
- `rtk npm ci` exited `0` and ran `npm run build`; npm audit reported 10 high severity vulnerabilities, unchanged and not addressed in this docs-only tranche.
- After dependency install, `rtk node --experimental-strip-types --test tests/src/agent-lab.test.ts tests/src/agent-lab-complete.test.ts tests/src/agent-lab-developer-mode-contract.test.ts tests/src/agent-lab-efficiency-nonregression.test.ts tests/src/agent-lab-token-cost-estimate.test.ts tests/src/cli/cases/agent-lab-command-surface.test.ts tests/src/cli/cases/work-order-execution.test.ts` passed: `tests 40`, `pass 40`, `fail 0`.
- Final root verification after fast-forward / push repeated `git diff --check HEAD~1..HEAD`, conflict-marker scan, and `opl-doc-doctor`; all passed.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/docs_portfolio_consolidation.md`
- `docs/active/development-document-portfolio.md`
- `docs/runtime/README.md`
- `docs/runtime/opl-agent-lab-control-plane.md`
- `contracts/opl-framework/agent-lab-contract.json`
- `src/agent-lab.ts`
- `src/agent-lab-complete.ts`
- `src/agent-lab-longline.ts`
- `src/agent-lab-authority.ts`
- `src/agent-lab-promotion.ts`
- `src/agent-lab-control-read-models.ts`
- `src/agent-lab-ahe-evidence.ts`
- `src/agent-lab-variant-comparison.ts`
- `src/agent-lab-developer-mode.ts`
- `src/runtime-tray-app-operator-drilldown.ts`
- `src/agent-lab-work-order-execution.ts`
- `src/agent-lab-efficiency-nonregression.ts`
- `src/agent-lab-token-cost-estimate.ts`
- `src/agent-lab-executor-capability-aperture.ts`
- `src/agent-lab-stage-executor-policy.ts`
- `tests/src/agent-lab.test.ts`
- `tests/src/cli/cases/agent-lab.test.ts`
- `tests/src/cli/cases/work-order-execution.test.ts`
- `tests/src/agent-lab-developer-mode-contract.test.ts`
- `scripts/test-lanes.mjs`
- prior process ledger index entries, especially part 8 and part 32, to avoid duplicate scope

Edited:

- `docs/runtime/opl-agent-lab-control-plane.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-33.md`
- `docs/history/process/plans/README.md`

## Branch / Worktree Hygiene

- `one-person-lab` root `main` was synced with `origin/main` at `d4fd6dc4` before part33 edits.
- Worktree: `/Users/gaofeng/workspace/one-person-lab-opl-cleanup-part33`.
- Branch: `codex/opl-doc-governance-20260529-part33-agent-lab`, tracking `origin/main`.
- Part32 worktree `/Users/gaofeng/workspace/one-person-lab-opl-cleanup-part32` and branch `codex/opl-doc-governance-20260529-part32-runtime-support` were already absent; root `main` and `origin/main` contain `d4fd6dc4 docs: stabilize runtime support index`, with no same-name remote codex branch.
- Retained unrelated worktree: `/Users/gaofeng/workspace/one-person-lab/.worktrees/dm003-default-executor-handoff` on `fix/dm003-default-executor-handoff`, dirty with source/test/core-doc changes and recent writes.

## Remaining stale / retire candidates

- Continue scanning `docs/references/current-support/*` for fixed App/release/provider evidence snapshots, stale version anchors, head SHA examples and old support assumptions.
- Re-check `docs/specs/shared-runtime-contract.md` and `docs/specs/shared-domain-contract.md` if old Domain Gateway / Domain Harness OS notes start acting as current truth instead of support reference.
- Continue six-repo OPL series governance from each repo's ideal-state reference and active truth plan; this tranche only covered OPL Agent Lab runtime support currentness.

## Next tranche write scope

- Prefer a current-support reference tranche backed by live contracts/source/tests/read-model evidence.
- Candidate areas:
  - `docs/references/current-support/opl-release-packages-modular-distribution.md`
  - `docs/references/current-support/opl-default-skill-ecosystem.md`
  - `docs/references/current-support/opl-fresh-install-and-gui-first-launch-testing.md`
  - cross-repo active truth owner refresh if fresh read-model evidence exposes a contradiction.
