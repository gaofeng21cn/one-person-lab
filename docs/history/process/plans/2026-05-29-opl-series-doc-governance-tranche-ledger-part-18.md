# OPL series docs governance tranche ledger part 18

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_18`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、runtime contract、GraphFlow/GFL proof surface、provider readiness oracle、App/operator read model 或 domain authority。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、核心五件套、contracts、source、CLI/API、runtime ledger、provider receipt 和各 repo owner 文档。
Date: `2026-05-29`

## Scope

本轮只处理 OPL repo 内一个 runtime-substrate support reference：

- `docs/references/runtime-substrate/graphflow-gfl-contract-vocabulary.md`

目标是保留 durable GraphFlow / GFL 边界：GraphFlow/GFL 只贡献 `boundary`、`evidence`、`audit`、`replay`、`route-back` 这类 governance vocabulary。OPL 不引入 GraphFlow/GFL runtime、planner、proof assistant、workflow compiler、executor、stage runner、domain verdict owner、artifact authority、memory owner 或 quality authority。

## Fresh evidence

本轮 live evidence：

- `contracts/family-orchestration/`：包含 Stage Kernel、proof bundle、graph projection、assumption/cohort/runtime-budget lenses、pack registry/source-spec 和 replay certification schemas。
- `docs/architecture.md`、`docs/invariants.md` 与 `docs/decisions.md`：当前 active narrative 固定为 `Minimal Trust Kernel + Readiness + Derived Diagnostic Lenses + Surface Budget + AI Capability Aperture`；GraphFlow/GFL 只贡献治理词汇，不承担 runtime/planner/proof assistant/workflow compiler/domain verdict 角色。
- `src/family-stage-readiness.ts`：readiness authority boundary 包含 `graphflow_runtime_dependency=false`、`can_claim_domain_ready=false`、`can_authorize_quality_verdict=false`。
- `src/family-runtime-stage-admission-gate.ts` 与 stage launch gate tests：Stage Kernel launch gate 只处理启动安全、composition、effect-boundary/runtime-event、hard human gate 和 executor binding，不把 GraphFlow/GFL 升级为 runtime。
- `opl stages readiness --family-defaults --json`：4 个 domain、19 个 stage admitted、0 hard blocker；authority boundary 明确不能 claim domain ready、artifact authority 或 production ready；每个 domain 的 authority boundary 都有 `graphflow_runtime_dependency=false`。
- `opl framework readiness --family-defaults --json`：framework control plane available with blocked refs-only attention；hard blocker 0；provider cadence/capability SLO satisfied；authority boundary forbids domain ready、production ready、artifact authority 和 quality/export verdict。
- `opl agents conformance --family-defaults --json`：4 repos passed，0 blocked，structural conformance passed；production evidence tail reported separately。
- `opl runtime app-operator-drilldown --json`：App/operator read model available，projection policy 为 refs-only；stage evidence open obligations 0，domain typed-blocker blocked obligations 42；不能写 domain truth、不能授权 quality verdict，provider completion 不是 domain ready。

## Changes

- `graphflow-gfl-contract-vocabulary.md`
  - Normalized state to `support_reference`.
  - Added "当前读法" with live contract/source/CLI/read-model entries for Stage Kernel, Readiness, Derived Diagnostic Lenses, stage readiness, framework readiness, and App/operator drilldown.
  - Made explicit that `graphflow_runtime_dependency=false`、`can_claim_domain_ready=false`、`can_claim_artifact_authority=false`、`can_claim_production_ready=false` and `can_authorize_quality_verdict=false` are durable boundaries, while counters remain dynamic live read-model facts.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/references/runtime-substrate/README.md`
- `docs/references/runtime-substrate/graphflow-gfl-contract-vocabulary.md`
- `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`
- `docs/references/runtime-substrate/ai-first-executor-first-long-horizon-optimization.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/decisions.md`
- `contracts/family-orchestration/`
- `src/family-stage-readiness.ts`
- `src/family-runtime-stage-admission-gate.ts`
- GraphFlow/GFL, Stage Kernel, Derived Diagnostic Lens, readiness and authority-boundary references discovered by `rg`
- fresh stage readiness / framework readiness / conformance / App operator CLI outputs

Edited:

- `docs/references/runtime-substrate/graphflow-gfl-contract-vocabulary.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-18.md`
- `docs/history/process/plans/README.md`

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining stale / retire candidates

- Continue scanning `docs/references/runtime-substrate/*` for support docs that still mix current support role with receipt ids, fixed counters, branch/SHA state, local-machine proof, old provider status, or compatibility promises.
- Re-check `opl-family-agent-ideal-state.md` for dated external-doc citation wording only if live currentness requires it; it is a north-star support doc and should not become an evidence ledger.
- RCA dirty native-PPT lane remains external owner work and was not touched.

## Next tranche write scope

- Continue OPL runtime-substrate/reference coverage in small slices. Candidate areas: north-star target-state wording that still carries dated external-doc snapshot language, residual runtime/provider status wording, or old compatibility/default-entry vocabulary.
- Re-run fresh `framework readiness`, `agents conformance`, `stages readiness`, `evidence-worklist`, `app-operator-drilldown`, and target-specific CLI before editing docs that mention GraphFlow/GFL, Stage Kernel, Derived Diagnostic Lenses, Temporal provider, Runtime Manager, App/operator projection, executor adapters, Hermes, CrewAI, or family ideal state.
