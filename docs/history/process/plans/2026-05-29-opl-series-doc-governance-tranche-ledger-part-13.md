# OPL series docs governance tranche ledger part 13

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_13`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、active plan、runtime contract、readiness oracle 或机器接口。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、`docs/active/current-development-lines.md`、核心五件套、contracts、source、CLI/API、runtime ledger 和各 repo owner 文档。
Date: `2026-05-29`

## Scope

本轮只处理 OPL repo 内的 stage graph / route-as-transition runtime support 文档：`docs/runtime/stage-graph-route-transition-runtime.md` 是当前 runtime support，但仍带 `Date: 2026-05-26`，并在“已落地能力与剩余证据门”中把动态 read-model 能力写成接近完成证明的表格。

目标是保留 durable stage graph / route-as-transition 边界，同时把 currentness 归回 fresh CLI/read-model、contracts、source、tests 与 runtime ledger；不在 support 文档冻结 attempt id、worklist counter、receipt count、provider proof snapshot 或 App/operator drilldown 数值。

## Fresh evidence

本轮 live evidence 使用 OPL main checkout：

- `opl agents conformance --family-defaults --json`：4 repos passed、0 blocked，`structural_conformance_status=passed`，production evidence tail 只单独报告，不是 structural pass condition。
- `opl framework readiness --family-defaults --json`：`status=framework_control_plane_available_with_operator_attention`，hard blocker count 0，operator actionable attention tail 1，payload-required attention tail 1，evidence envelope open 1，blocked 536；provider cadence/capability SLO satisfied；readiness 不能授权 domain ready、production ready、artifact authority 或 quality/export verdict。
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`：open worklist 1，closed refs-only item 315，payload-required safe action 1，domain-dispatch workorder 1，domain-dispatch stage attempt 1，`domain_ready_authorized=false`，`production_ready_authorized=false`。该 worklist 只暴露 refs-only operator route，不能由 OPL 自行生成 owner receipt、typed blocker、owner-chain ref 或 no-regression ref。
- `opl runtime app-operator-drilldown --json`：stage attempt count 25，route-transition drilldown stage attempt count 13，running provider attempt count 148，domain-dispatch current default actionable attempt count 1，domain-dispatch receipt action route count 1，stage-production evidence receipt action route count 11，domain-owner-payload-summary verified ledger receipt count 24；provider cadence/capability SLO satisfied。App/operator projection 仍是 refs-only，不生成 release/domain/production-ready verdict。
- Source/test refs read this tranche included `src/app-state.ts`, `tests/src/cli/cases/runtime-app-operator-drilldown.test.ts`, `tests/src/cli/cases/family-runtime-stage-attempt-usage.test.ts`, domain owner payload summary tests, `docs/architecture.md`, `docs/status.md`, and runtime support docs. These confirm `stage_progress_log`, `runtime_visualization_projection`, domain-dispatch evidence, stage-production evidence, and domain owner payload summary are projection/read-model surfaces, not domain authority surfaces.

## Changes

- Replaced the fixed `Date: 2026-05-26` header with a currentness policy.
- Rewrote “已落地能力与剩余证据门” as “当前读法与动态证据入口”.
- Split stable support language from dynamic evidence surfaces: `stage_progress_log`, `runtime_visualization_projection`, `runtime_manager_route_support`, domain-dispatch evidence worklist, and physical-thinning evidence now point to their current evidence entry instead of freezing a proof state.
- Tightened the acceptance wording so support docs, read-model snapshots and route-transition counters cannot be treated as active-plan completion.
- During verification, `./scripts/verify.sh` exposed a repo line-budget gate failure in `tests/src/cli/cases/family-runtime-provider-hosted-attempts-cases/mas-default-executor-current-source.ts` at 1068 lines. The file was mechanically split by moving current-source private test fixtures/helpers into `mas-default-executor-current-source-helpers.ts`; the original test semantics stayed in the same imported test file.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/runtime/stage-graph-route-transition-runtime.md`
- `docs/references/runtime-substrate/opl-runtime-manager-target.md`
- `docs/references/runtime-substrate/family-runtime-attempt-contract.md`
- `docs/references/runtime-substrate/family-executor-adapter-defaults.md`
- `docs/references/runtime-substrate/hermes-agent-executor-evaluation.md`
- `docs/architecture.md`
- `docs/status.md`
- `src/app-state.ts`
- `tests/src/cli/cases/runtime-app-operator-drilldown.test.ts`
- `tests/src/cli/cases/family-runtime-stage-attempt-usage.test.ts`
- `tests/src/cli/cases/runtime-app-operator-drilldown-mas-payload-summary.test.ts`
- `tests/src/cli/cases/runtime-app-operator-drilldown-rca-payload-summary.test.ts`
- `tests/src/cli/cases/family-runtime-provider-hosted-attempts.test.ts`
- `tests/src/cli/cases/family-runtime-provider-hosted-attempts-cases/mas-default-executor-current-source.ts`

Edited:

- `docs/runtime/stage-graph-route-transition-runtime.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-13.md`
- `docs/history/process/plans/README.md`
- `tests/src/cli/cases/family-runtime-provider-hosted-attempts-cases/mas-default-executor-current-source.ts`
- `tests/src/cli/cases/family-runtime-provider-hosted-attempts-cases/mas-default-executor-current-source-helpers.ts`

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining stale / retire candidates

- Continue OPL runtime-substrate/reference coverage for documents that still mix support role with dated current-state notes, proof snapshots, receipt ids, counters or old proof status strings.
- `docs/references/runtime-substrate/opl-runtime-manager-target.md` contains current landing-state prose and should be checked against fresh Runtime Manager contracts/read-model before further edits.
- `docs/references/runtime-substrate/family-runtime-attempt-contract.md` and `docs/references/runtime-substrate/family-executor-adapter-defaults.md` remain support references with mostly stable policy language, but still need section-by-section currentness review.
- `docs/references/runtime-substrate/hermes-agent-truth-reset-and-target-state.md` and `docs/references/runtime-substrate/hermes-agent-executor-evaluation.md` are boundary guard / evaluation references; do not delete durable negative guard content without proving the guard is duplicated in current owner docs/contracts.
- MAS dirty domain-dispatch / AI-reviewer lane and RCA dirty native-PPT lane remain external owner work and were not touched.

## Next tranche write scope

- Continue OPL runtime-substrate/reference coverage, prioritizing `opl-runtime-manager-target.md`, `family-runtime-attempt-contract.md`, `family-executor-adapter-defaults.md`, `hermes-agent-truth-reset-and-target-state.md`, and `hermes-agent-executor-evaluation.md`.
- Preserve durable support/reference content; only remove stale current-state counters, dated proof claims, obsolete readiness wording, duplicate contract authority, retired default-entry semantics, or old compatibility promises.
- Re-run fresh read-model before touching documents that mention provider SLO, evidence worklist, App/operator drilldown, framework readiness, domain-dispatch, stage graph, stage progress log, Temporal residency, Developer Mode, OMA consumption, production evidence, managed runtime, executor adapters, or Hermes.
