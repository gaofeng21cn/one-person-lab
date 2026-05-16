# OPL Agent Lab 控制面边界

Status: `active_runtime_support`
Owner: `One Person Lab`
Purpose: `agent_eval_improvement_control_plane`
State: `active_support`
Machine boundary: 本文是人读 runtime 支撑说明。机器真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、domain-owned eval/proof surface 和语义化 `human_doc:*` id。

## 定位

`OPL Agent Lab` 是 OPL Framework 内部统一的 eval / improvement control plane。它面向 framework 维护者、operator 和 App/workbench read model，统一组织跨 domain agent 的能力评估、回归观察、改进候选、实验证据和 follow-up 任务。

它属于 OPL runtime / control plane，不是新的 domain agent、不是新的 product truth store，也不是 MAS/MAG/RCA 之上的质量裁判。

核心职责是：

- 聚合 OPL 可见的 framework runtime evidence、stage attempt refs、provider receipt、descriptor parity、operator blocker 和 domain-owned eval/proof refs。
- 把跨 domain 的评估问题转成可审计的 lab run、improvement candidate、acceptance evidence 和 follow-up queue item。
- 为 App/workbench 提供可读的改进看板、回归风险、验证状态和下一步动作。
- 维护 framework-level 问题归因：runtime/provider/executor/control-plane 问题归 OPL；domain truth、quality gate、artifact authority 问题回 domain owner。

Agent Lab 的最小语义链路是：

```text
runtime / descriptor / domain-owned proof refs
  -> OPL Agent Lab eval run
  -> improvement candidate
  -> framework or domain owner route
  -> typed evidence / receipt refs
  -> status / workbench projection
```

## 权限边界

Agent Lab 明确不持有：

- domain truth；
- publication / fundability / visual quality verdict；
- artifact authority；
- domain memory body；
- memory accept / reject decision；
- domain owner receipt authority；
- domain package / export / submission readiness verdict。

Agent Lab 可以持有：

- eval run metadata；
- metric / rubric / scenario descriptor；
- OPL framework regression signal；
- framework improvement candidate；
- cross-domain comparison view；
- owner route refs；
- evidence refs、receipt refs、blocker refs 与 follow-up refs。

当 Agent Lab 展示 MAS/MAG/RCA 的质量、进度或交付状态时，只能引用 domain-owned eval/proof/receipt/artifact locator。它不能把 provider completion、harness pass、descriptor aligned、agent-lab score 或 OPL operator judgment 写成 domain ready verdict。

## 输入与输出

允许输入：

- `opl agents descriptors`、`opl stages`、`opl actions`、`opl domain-memory` 的只读 read model；
- `stage_attempt_ledger`、`stage_attempt_workbench`、`runtime snapshot`、provider receipt 与 closeout packet refs；
- domain-owned eval/proof refs，例如 MAS publication eval、MAG grant-stage proof、RCA visual no-regression evidence；
- App/workbench operator action refs、human gate refs、dead-letter / retry / blocker refs；
- regression、soak、fixture、parity、direct-skill equivalence 和 no-forbidden-write evidence。

允许输出：

- `agent_lab_eval_run`：一次评估运行的目标、输入 refs、执行环境、rubric 和结果摘要；
- `agent_lab_improvement_candidate`：需要改进的 framework 或 domain owner 路由项；
- `agent_lab_acceptance_evidence`：验收证据 refs、通过/阻断原因和后续 gate；
- `agent_lab_projection`：给 CLI/App/workbench 的 read-only 改进看板；
- `agent_lab_follow_up_queue_item`：进入 OPL typed queue 或 domain owner backlog 的后续动作引用。

禁止输出：

- domain truth mutation；
- domain quality verdict；
- artifact mutation；
- memory body write；
- receipt instance 伪造；
- 对 MAS/MAG/RCA 交付物的最终通过判断。

## 与现有控制面的关系

Agent Lab 建在现有 OPL Framework control plane 之上：

- 依赖 `Unified Domain-Agent Descriptor` 做 domain entry、stage、action、memory、skill、runtime/session/progress/artifact refs 的统一发现；
- 依赖 `Family Stage Control Plane` 做 stage descriptor、handoff、evaluation refs 和 authority boundary 的读取；
- 依赖 `Family Action Catalog` 做 callable action metadata 与 owner route；
- 依赖 `family-runtime` stage attempt ledger、typed closeout、human gate、retry/dead-letter 和 provider receipt 做运行证据；
- 依赖 App/workbench projection 展示 operator-facing 改进状态。

它不替代这些 surface，也不新建平行 runtime。Agent Lab 只把 eval / improvement 的组织语言收敛到 OPL 内部，避免 MAS/MAG/RCA 各自重复实现一套跨域评估控制面。

## 初始落地顺序

Agent Lab 的落地顺序应从只读、refs-only、无 authority 的 surface 开始：

1. 定义 `agent_lab_eval_run`、`agent_lab_improvement_candidate`、`agent_lab_acceptance_evidence` 和 `agent_lab_projection` 的最小 machine-readable contract。
2. 用现有 descriptor、stage attempt ledger、provider receipt、domain-owned eval/proof refs 生成只读 lab projection。
3. 先覆盖 framework regression、direct-skill parity、no-forbidden-write、provider SLO、descriptor drift 和 task-bound bridge evidence。
4. 再接入 MAS/MAG/RCA 各自 owner 提供的质量或交付 proof refs，并保持 domain verdict 回 domain owner。
5. 最后把 operator follow-up 接入 typed queue / App workbench，但只路由动作，不越权执行 domain truth mutation。

当前文档只冻结边界和入口。实际合同、CLI、App projection 和验证 lane 落地后，应同步更新 `docs/status.md`、`docs/architecture.md`、`docs/runtime/README.md`、`docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`，并在需要时把机器合同放入 `contracts/`。
