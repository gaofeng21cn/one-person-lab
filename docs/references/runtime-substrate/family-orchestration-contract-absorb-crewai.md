# Family Orchestration 合同吸收说明

Purpose: `references_runtime_substrate_family_orchestration_contract_absorb_crewai`
State: `support_reference`

Status: `support_reference_updated`
Owner: `One Person Lab`
Machine boundary: 本文是外部框架学习与合同吸收的人读记录；机器可读事实以 `contracts/family-orchestration/`、`contracts/opl-framework/`、source code、CLI/API 行为、runtime ledger、App/operator read model 与 domain-owned manifests 为准。

## 当前读法

本文保留“不引入 CrewAI runtime dependency，只吸收 contract pattern”的结论。旧 `gateway + federation` wording 已被 stage-led、provider-backed，并以 Agent executor 为最小执行单位的 OPL Framework 取代；gateway-first federation product 只作为 history/provenance/negative-guard 阅读。

当前机器入口是：

- `contracts/family-orchestration/`
- `contracts/opl-framework/`
- `src/family-orchestration.ts`
- `src/family-stage-control-plane.ts`
- `src/family-runtime-stage-admission-gate.ts`
- `opl stages readiness --family-defaults --json`
- `opl framework readiness --family-defaults --json`
- `opl runtime app-operator-drilldown --json`

本文不冻结当前 adoption 顺序、repo 状态、readiness 计数或 production evidence。OPL 当前职责是 shared contracts、descriptor discovery、stage pack admission、stage-attempt request/projection、stage attempt、refs-only receipt / projection、safe action route 和 domain authority boundary；它不接管 CrewAI runtime、domain truth、memory body、artifact authority、owner receipt 或 quality/export verdict。

## 背景

这一轮对 `CrewAI` 的评估，结论不是“把它直接接成四仓共同依赖”，而是“把它最值得学的 orchestration 能力收编进 `OPL` 顶层 shared contracts”。

原因很直接：

1. `Codex CLI` 已经是家族默认执行器主线，默认模式是 `autonomous`，能力与语义都比 `CrewAI` 自带的 agent / LLM wrapper 路径更贴近当前目标。
2. `Hermes-Agent`、`Codex CLI`、`OPL`、各 domain 仓之间已经形成了比较清楚的 owner split；如果再塞一个框架进去，容易把 runtime substrate、executor、authority、truth 混成一层。
3. 现在真正缺的不是“再来一层 agent framework”，而是“把跨仓已经反复出现的 orchestration 语义，冻结成 contract-first、machine-readable、可验证的统一 surface”。

## 结论

结论固定为：

- 不把 `CrewAI` 引入为 `OPL` family runtime dependency
- 不让 `CrewAI` 接管默认 LLM / executor / runtime owner 语义
- 只吸收它在 flow、event、checkpoint、human gate、graph introspection 这些方面最成熟的思想
- 由 `OPL` 顶层把这些思想冻结成 family orchestration companion contracts

## 当前收编的 5 类 contract

### runtime-oriented

1. `family event envelope`
   - 统一跨仓 event correlation、producer、session、audit ref 的包裹方式
2. `family checkpoint lineage`
   - 统一 checkpoint ancestry、resume、state ref 的包裹方式

### domain-oriented

3. `family action graph`
   - 统一 action graph、node、edge、checkpoint policy 的表达方式
4. `family human gate`
   - 统一 human review 的 request / decision / resume 语义
5. `family product-entry manifest v2`
   - 统一 direct entry、operator loop、human gate、resume contract 与 runtime companion 的发现面

## 明确不吸收的层

下面这些层不作为本轮 family 收编目标：

- `CrewAI` 的 `Crew` / `Agent` runtime object model
- `CrewAI` 自带的 LLM wrapper / provider assumption
- `CrewAI` 的 memory owner 语义
- `CrewAI` 的 AMP / A2A 默认 handoff 路线
- 任何把 `OPL` 改写成 domain runtime owner 的抽象

换句话说，吸收的是 orchestration contract，不是整个 framework runtime。

## 当前 owner boundary map

| Surface | 当前 owner | 读法 |
| --- | --- | --- |
| `family-event-envelope`、`family-checkpoint-lineage` | OPL shared contract | 只统一 event correlation、audit refs、checkpoint ancestry、resume/state refs；不成为 domain runtime owner。 |
| `family-action-graph`、`family-action-catalog`、`family-human-gate`、`family-product-entry-manifest-v2` | OPL shared contract + domain-owned manifest | 让 MAS/MAG/RCA/OMA 暴露 action / gate / product-entry metadata；handler、truth、quality/export verdict 与 owner receipt 留在 domain repo。 |
| `family-stage-control-plane`、`family-stage-conformance` | OPL Stage Kernel | 只做 stage descriptor、owner boundary、allowed refs、selected executor binding、expected receipt、audit、handoff 和 route-back 下限；不执行 stage。 |
| `family-stage-proof-bundle`、`family-stage-graph-projection`、`family-stage-pack-registry`、`family-stage-pack-source-spec`、`family-stage-replay-certification` | OPL read-model / diagnostic projection | 只给 scheduler、App 和 operator 提供 refs-only proof、graph、registry、source/spec、replay 输入；不重新询问 AI、人或外部系统，不生成 verdict。 |
| `family-stage-assumption-lifecycle`、`family-stage-cohort-loop`、`family-stage-runtime-budget` | Derived Diagnostic Lenses | 只把 assumption freshness、cohort visibility、runtime budget 和 replay/audit 缺口折叠成 warning、typed blocker、human gate 或 route-back ref。 |

MAS/MAG/RCA/OMA 的当前 adoption 状态必须回到各自 repo-owned descriptor、contracts、active plan、runtime ledger、production acceptance / owner payload 和 fresh OPL read-model 读取。旧“四仓 adoption 顺序”只解释 CrewAI pattern 被吸收时的历史推进背景，不能作为当前实施队列、完成表或兼容承诺。

## 这轮交付的意义

这轮最关键的价值不是“又多了五个 schema 文件”，而是：

- 把家族级 orchestration 语义从口头共识提升成 repo-tracked contract
- 让四仓以后新增功能时优先接同一套 surface，而不是各自再发明一遍
- 为后续轻量代码对齐提供稳定锚点
- 明确告诉未来实现者：该复用的是成熟软件的长处，但 owner split 不能乱

## 当前使用规则

1. 若需要判断 family orchestration 当前状态，先读 live contracts/source 和 `opl stages readiness --family-defaults --json`、`opl framework readiness --family-defaults --json`、`opl runtime app-operator-drilldown --json`。
2. 若需要新增 orchestration surface，优先放入现有 family orchestration / OPL framework contract 或 Stage Kernel / Diagnostic Lens，不引入 CrewAI runtime、planner、memory owner、executor 或 domain authority。
3. 若某段历史 wording 仍提到 gateway/federation/direct-entry adoption 顺序，只按 provenance 阅读；当前 active plan 回到 `docs/active/current-state-vs-ideal-gap.md`、核心五件套和 machine-readable contracts。
