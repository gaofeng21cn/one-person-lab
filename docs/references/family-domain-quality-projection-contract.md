# Family Domain Quality Projection Contract

## Purpose

`OPL` family 需要统一展示 domain work 是否真的过了质量门，但不能把医学、基金、视觉交付的判断标准合成一个 generic QA gate。本合同只定义 quality projection 的共同字段和 owner split。

## Owner Split

- `OPL` owns：quality projection vocabulary、operator-facing status、source refs、freshness。
- `MAS` owns：`study_charter`、`evidence_ledger`、`review_ledger`、AI reviewer-backed `publication_eval/latest.json`、AI reviewer artifacts、`StudyTruthKernel` / `RuntimeHealthKernel` 或 truth health reducers / runtime health reducers、publication judgment。
- `MAG` owns：grant review、fundability gate、authoring completion、submission readiness。
- `RCA` owns：content-fit review、render proof、export proof、visual QA、deliverable judgment。

## Required Projection Fields

每个 domain repo 暴露给 `OPL` 的 quality projection 必须能表达：

- `quality_gate_status`：`not_started`、`in_review`、`passed`、`failed`、`blocked`、`stale`。
- `evidence_refs`：domain-owned evidence / input / proof source refs。
- `review_refs`：domain-owned reviewer / critique / audit refs。
- `human_gate_reason`：需要人工确认时的原因。
- `failure_escalation`：失败后回到哪个 domain route、contract、runbook 或 human gate。
- `latest_eval_or_proof_pointer`：最近一次 domain-owned eval / proof / package pointer。
- `assessment_owner`：`domain_owned` 或 `projection_only`；`projection_only` 不能关闭质量门。

## Domain Mapping

### MAS

- `quality_gate_status` maps to `study_charter`、`evidence_ledger`、`review_ledger`、AI reviewer-backed `publication_eval/latest.json`、AI reviewer artifacts、`StudyTruthKernel` / `RuntimeHealthKernel` 或 truth health reducers / runtime health reducers。
- `claim-only ready` is forbidden。
- `OPL` only consumes MAS quality projections; it does not issue MAS ready verdicts and does not hold publication judgment。
- `publication_eval` remains MAS-owned medical paper quality authority。

### MAG

- `quality_gate_status` maps to grant review、fundability gate、authoring completion、submission readiness。
- generic document QA cannot replace MAG authoring runtime judgment。
- OPL cannot mark a grant submission-ready without MAG-owned evidence/proof refs。

### RCA

- `quality_gate_status` maps to content-fit review、render proof、export proof、visual QA。
- screenshot-only or claim-only ready cannot replace render/export proof。
- OPL cannot mark a deck or visual deliverable complete without RCA-owned proof refs。

## Forbidden Authority Sources

The following are not family quality owners:

- generic persona QA。
- non-domain owner gate。
- NEXUS role approval。
- claim-only ready。
- chat summary / memory / terminal prose。
- OPL projection without domain-owned eval/proof refs。
- OPL-only quality verdict。
- OPL MAS ready verdict。
- OPL-held publication judgment。

## Failure Semantics

`failed` and `blocked` must include a route back to the owning domain. `OPL` may show the failure, source refs and next human gate, but the domain repo decides repair scope, retry and final closure。
