# OPL series docs governance tranche ledger part 29

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_29`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、runtime contract、attempt ledger、transition runner contract、provider receipt、domain authority、App read model 或 production readiness oracle。当前 truth 回到 `contracts/opl-framework/family-runtime-attempt-contract.json`、`contracts/opl-framework/stage-route-scheduler-contract.json`、`contracts/opl-framework/family-transition-runner-contract.json`、source、tests、核心五件套和 live CLI/read-model。
Date: `2026-05-29`

## Scope

本轮处理 OPL runtime support prose 的 attempt / route-transition currentness：

- `docs/references/runtime-substrate/family-runtime-attempt-contract.md`
- `docs/runtime/stage-graph-route-transition-runtime.md`

目标是把 support 文档对齐到当前 machine contracts 和 tests，避免旧最小字段说明、child graph 目标语、transition runner 示例或 provider completion 被误读成当前生产能力、domain verdict、owner receipt 或 production readiness。

## Fresh Evidence

本轮 live evidence：

- `contracts/opl-framework/family-runtime-attempt-contract.json`
  - 当前 attempt states 包含 queued、checkpointed、human_gate、completed、dead_lettered 等 control-plane 状态。
  - required ledger/projection fields 覆盖 provider run、activity events、user instruction / resume refs、usage projection、closeout receipt status、`stage_progress_log`、`attempt_true_path_proof`、Temporal visibility 和 `current_control_state`。
  - completed status 需要 typed closeout；free text closeout 不被接受。
  - `user_stage_log` 只投影 OPL timing/usage/refs 与 domain-provided human semantics；缺失 domain 语义时必须显式 `missing_domain_semantic_summary`。
  - `current_control_state` 只从 family queue、stage attempt ledger、provider run projection 和 typed stage closeout ledger 派生，并对 missing/stale/provider-completed-without-typed-closeout fail closed。
- `contracts/opl-framework/stage-route-scheduler-contract.json`
  - stage 是 OPL executable/recoverable/auditable attempt unit；route 是 domain-owner semantic，不是小 stage，也不能完成 stage attempt。
  - route hydration 只能把 domain route refs 解析成 typed queue task、stage attempt request、conflict envelope 或 operator projection。
- `contracts/opl-framework/family-transition-runner-contract.json`
  - transition runner 当前职责是 domain-declared transition spec、guard id matching、matrix fixture evaluation、receipt/projection envelope construction。
  - runner output 只包括 next state/work unit、owner route、human gate、typed blocker、dead-letter intent、receipt/projection 和 authority boundary。
  - OPL forbidden authority 包括 publication quality verdict、fundability verdict、visual/export verdict、domain truth interpretation、artifact mutation、memory body writeback 和 domain action execution。
- `tests/src/family-runtime-attempt-contract.test.ts`
  - 覆盖 attempt fields、typed closeout、stage progress log、user stage log、Temporal visibility、attempt true path proof、current control state 和 retired `stage_execution_log` no-resurrection。
- `tests/src/family-transition-runner.test.ts`
  - 覆盖 MAS-like transition spec、MAG oracle ingestion、matrix cases、fail-closed blockers 和 `transition_runner_transport_projection_only` authority boundary。
- `tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts`
  - 覆盖 Temporal attempt `stage_progress_log.temporal_visibility`、`attempt_true_path_proof`、App drilldown true-path projection 和 authority false flags。

## Changes

- `docs/references/runtime-substrate/family-runtime-attempt-contract.md`
  - Replaced the stale minimal attempt field list with current contract-level reading rules.
  - Added typed closeout / user-stage-log / current-control-state support prose.
  - Clarified completed/succeeded states must be read with typed closeout, owner receipt refs, typed blocker refs and completion boundary; provider completed is not domain ready.
  - Clarified reconciliation may route to OPL provider/runtime safe action or domain-owned surface, while quality gate / owner receipt decisions remain domain-owned.
- `docs/runtime/stage-graph-route-transition-runtime.md`
  - Clarified child graph is current support language / future primitive, not a landed production child-workflow claim.
  - Added transition runner lane and machine evidence refs.
  - Clarified transition runner pass / matrix pass cannot be read as domain action execution, owner receipt, production child graph, or production ready.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/README.md`
- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/decisions.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/references/runtime-substrate/README.md`
- `docs/references/runtime-substrate/family-runtime-attempt-contract.md`
- `docs/runtime/stage-graph-route-transition-runtime.md`
- `contracts/opl-framework/family-runtime-attempt-contract.json`
- `contracts/opl-framework/stage-route-scheduler-contract.json`
- `contracts/opl-framework/family-transition-runner-contract.json`
- `src/family-transition-runner.ts`
- `src/family-runtime-stage-attempt-current-query.ts`
- `src/family-runtime-stage-attempt-true-path-proof.ts`
- `tests/src/family-runtime-attempt-contract.test.ts`
- `tests/src/family-transition-runner.test.ts`
- `tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts`

Edited:

- `docs/references/runtime-substrate/family-runtime-attempt-contract.md`
- `docs/runtime/stage-graph-route-transition-runtime.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-29.md`
- `docs/history/process/plans/README.md`

No contracts, source, tests, package scripts, App files, Aion shell files, or domain repos were modified in this tranche. This tranche only aligns support prose and history coverage with current machine behavior.

## Remaining stale / retire candidates

- Continue scanning `docs/runtime/*` and `docs/references/runtime-substrate/*` for old Product API, hosted pilot, local-manager, fixed counters, provider snapshot, child graph production, transition runner overclaim, or old compatibility wording.
- Re-check support references that mention `framework production-closeout` to ensure they distinguish the still-active framework-level summary command from retired `family-runtime production-closeout`.
- Continue six-repo OPL series governance from each repo's ideal-state reference and active truth plan; this tranche only covered OPL repo runtime support prose.

## Next tranche write scope

- Prefer another small OPL support-reference tranche backed by live contracts/source/tests/read-model evidence.
- Strong candidates:
  - `docs/runtime/*` files that still mix target runtime language with current proof snapshots;
  - remaining `docs/references/runtime-substrate/*` sections with fixed read-model counts or stale provider/alias wording;
  - `docs/source/*` / `docs/delivery/*` support references if they still preserve old Product API, frontdoor, local-manager or compatibility promise language.
