# GraphFlow / GFL contract vocabulary reference

Owner: `One Person Lab`
Purpose: `reference`
State: `support_reference`
Machine boundary: 本文是人读参考，不是机器合同、runtime 依赖、planner、proof assistant、workflow compiler 或 domain verdict surface。机器真相继续归 contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 workspace / App evidence。

## 当前读法

本文只保留 GraphFlow / GFL 对 OPL 有用的治理词汇，不冻结当前 stage readiness、provider proof、App/operator counter 或 production evidence。当前机器入口是：

- `contracts/family-orchestration/family-stage-conformance.schema.json`
- `contracts/family-orchestration/family-stage-control-plane.schema.json`
- `contracts/family-orchestration/family-stage-proof-bundle.schema.json`
- `contracts/family-orchestration/family-stage-graph-projection.schema.json`
- `contracts/family-orchestration/family-stage-assumption-lifecycle.schema.json`
- `contracts/family-orchestration/family-stage-cohort-loop.schema.json`
- `contracts/family-orchestration/family-stage-runtime-budget.schema.json`
- `contracts/family-orchestration/family-stage-pack-registry.schema.json`
- `contracts/family-orchestration/family-stage-pack-source-spec.schema.json`
- `contracts/family-orchestration/family-stage-replay-certification.schema.json`
- `src/family-stage-readiness.ts`
- `src/family-runtime-stage-admission-gate.ts`
- `opl stages readiness --family-defaults --json`
- `opl framework readiness --family-defaults --json`
- `opl runtime app-operator-drilldown --json`

这些入口的当前读法固定为 refs-only Stage Kernel / Readiness / Derived Diagnostic Lenses。`graphflow_runtime_dependency=false`、`can_claim_domain_ready=false`、`can_claim_artifact_authority=false`、`can_claim_production_ready=false` 和 `can_authorize_quality_verdict=false` 是关键边界；具体 warning、counter、stage 数、workorder 数和 evidence 计数必须从 live CLI/read-model 读取，不能从本文冻结。

## 参考边界

GraphFlow / GFL 对 OPL 的有效价值只在治理词汇层：`boundary`、`evidence`、`audit`、`replay`、`route-back`。这些词汇帮助 OPL 把 stage pack 启动、运行时边界、证据缺口和回退路径说清楚，但不改变 OPL 的 AI-first、contract-light 架构。

OPL 不引入 GraphFlow / GFL runtime、graph engine、planner、proof assistant、workflow compiler、executor、stage runner、domain verdict owner、artifact authority、memory owner 或 quality authority。任何类似 capability 只能回到 OPL 的三层 active surface：

- `Stage Kernel`：最小合同核，负责 stage pack admission、owner boundary、allowed refs、selected executor binding、expected receipt、audit、replay 和 route-back 下限。
- `Readiness`：operator / App 默认聚合面，只把启动安全、越权、receipt、scope、monitor、replay 和 evidence gap 投成 warning、typed blocker、human gate 或 route-back ref。
- `Derived Diagnostic Lenses`：从 Kernel 派生的只读解释面，用于 assumption freshness、cohort visibility、runtime budget、failure localization、replay certification、pack registry 或 source/spec review。

## 可吸收词汇

- `boundary`：明确 OPL、domain owner、人、外部系统、artifact、memory 与 provider 的责任边界。
- `evidence`：把 expected receipt、observed receipt、runtime event、monitor ref、owner ref 和 missing support 做成可审计引用。
- `audit`：保留 append-only event、attempt ledger、receipt refs、no-forbidden-write proof 和 replay evidence。
- `replay`：只用既有 event / ledger / receipt refs 复核运行轨迹，不重新询问 AI、人或外部系统。
- `route-back`：缺口、冲突或 stale evidence 回到 typed blocker、human gate、owner receipt conflict 或 domain-owned repair route。

## 当前映射

以下映射只解释既有 machine-readable surface 的读法，不扩展 active narrative：

- `family-stage-conformance` 与 `family-stage-control-plane` 共同形成 Stage Kernel admission read model。
- `family-stage-proof-bundle`、`family-stage-graph-projection`、`family-stage-pack-source-spec` 和 `family-stage-pack-registry` 是只读 support / diagnostic surface，不执行 stage。
- `family-stage-assumption-lifecycle`、`family-stage-cohort-loop` 和 `family-stage-runtime-budget` 是 Derived Diagnostic Lenses；它们只能被 readiness 折叠消费，不能成为 standalone launch authority。
- `family-stage-replay-certification` 只读 append-only event log refs、attempt ledger refs、runtime event refs 和 closeout receipt refs；replay 不重新查询 AI、人或外部系统。
- `generated_artifact_manifest` 只记录从 stage pack / diagram 派生的 refs 与 drift status；它不是 proof assistant 结论，也不是 domain ready 或 quality verdict。

## 禁止升级

这些参考映射不得升级为 active implementation narrative 中的默认主语：

- GraphFlow / GFL runtime、graph engine、planner、proof assistant、workflow compiler、stage runner 或 executor。
- 由 OPL 签发的 domain ready、quality verdict、publication / fundability / visual verdict、artifact ready 或 owner receipt。
- 独立于 `opl stages readiness --domain <domain>` 的默认 capacity / validity / reliability CLI 或 schema 目标。
- 用机械 score、checklist、contract completeness、generated proof 或 provider completion 替代独立 AI reviewer / domain-owned quality gate。
