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

## 已落地入口

当前 Agent Lab 已经从边界文档推进到可运行的 refs-only control plane：

- 机器合同：`contracts/opl-framework/agent-lab-contract.json`。
- TypeScript surface：`src/agent-lab.ts`，并通过 package export `./agent-lab` 暴露。
- CLI sample：`opl agent-lab sample --json`，输出 MAS/MAG/RCA 三个 fixture task 的 eval run、recovery probe、domain-owned scorecard refs、improvement candidate 和 promotion gate。
- CLI longline：`opl agent-lab longline --json`，输出 MAS/MAG/RCA 三个 provider-hosted longline task、七个 recovery probe、跨仓 no-forbidden-write gate 和 repo test reduction guidance。
- CLI complete：`opl agent-lab complete --json`，输出完整 Agent Lab control plane：OPL-native suite runner、Inspect AI optional adapter contract、METR task-standard reference、OpenInference/OpenTelemetry trace refs、Langfuse/Phoenix optional connector refs、optimizer loop 和 RL transition boundary。
- CLI external suite：`opl agent-lab run --suite <suite.json> --json`，运行 domain agent 或 OPL-compatible meta-agent 仓生成的 OPL-compatible Agent Lab suite JSON，返回同一套 refs-only suite result、ref summary 和 authority boundary。

`opl agent-lab longline --json` 是当前统一长线测试 read-model 入口。它可用于判断哪些“浸润/长线测试编排”已经能由 OPL 承接；它不能把 longline suite `passed` 升级成 MAS/MAG/RCA 的 publication、fundability、visual quality 或 export verdict。

2026-05-17 校准：MAS/MAG/RCA 已在各自 repo-native verification lane 中加入 Agent Lab longline migration guard。三仓本地测试现在会调用 `opl agent-lab longline --json`，断言 OPL 承接 framework-level longline orchestration / recovery / no-forbidden-write regression，同时断言 domain repo 继续保留 scorer、owner receipt fixture 与 artifact authority checks。该 guard 只证明测试责任已收敛到 OPL Agent Lab；它不声明真实 domain production soak、publication/fundability/visual verdict 或 artifact/export readiness 已完成。

`opl agent-lab complete --json` 是当前完整 Agent Lab 控制面入口。它说明核心 OPL 不强依赖 Inspect AI、Langfuse、Phoenix 或 RL 训练框架；这些外部系统通过 adapter / export / optimizer refs 接入。OPL core 持有稳定任务、轨迹、恢复、scorecard refs、candidate 和 promotion gate；外部 eval runner、observability backend 或 optimizer 只能消费这些 refs，不能取得 domain authority。

`opl agent-lab run --suite <suite.json> --json` 是当前外部 suite 闭环入口。它允许 `opl-meta-agent` 这类独立 Foundry Agent 生成候选 agent 的 baseline suite，再交回 OPL Agent Lab 运行。该入口只读取 suite JSON 中的 refs、scorecard refs、recovery probes、trajectory refs、improvement candidate refs 和 promotion gates；它不会读取或写入 domain truth、memory body、artifact body、owner receipt body，也不会因为 suite passed 而推广默认 agent 配置。

当前 complete control plane 的状态：

| 能力 | 状态 | 边界 |
| --- | --- | --- |
| OPL-native suite runner | `landed` | `agent-lab sample/longline/complete` 可运行。 |
| Inspect AI adapter | `adapter_contract_ready_optional_runtime` | 映射 task / solver / scorer / eval log，不作为 core 依赖。 |
| METR task-standard reference | `task_standard_reference_ready` | 只吸收 portable task environment pattern。 |
| OpenInference / OpenTelemetry refs | `trace_ref_contract_ready` | 输出 trace / span refs，不上传 domain truth。 |
| Langfuse / Phoenix | `optional_connector_pending_export_contract_ready` | connector 可后接，当前只冻结 dataset/run/experiment/evaluator refs。 |
| Optimizer loop | `control_plane_ready_external_optimizer_optional` | 可产生 prompt/skill/stage/tool-policy candidate refs。 |
| RL boundary | `downstream_ready_after_stable_trajectory_and_reward_surfaces` | 可输出 transition refs；不在 OPL core 训练或部署模型权重。 |

当前 longline suite 覆盖：

| Domain | OPL 承接的长线面 | Domain 仍保留的 authority |
| --- | --- | --- |
| `med-autoscience` | provider-hosted guarded apply soak orchestration；resume/retry/dead-letter recovery probe；no-forbidden-write cross-domain regression | publication-quality scorer；owner receipt fixture；paper artifact authority checks |
| `med-autogrant` | controlled grant-stage soak orchestration；receipt reconciliation projection；no-forbidden-write cross-domain regression | fundability scorer；grant owner receipt fixture；proposal artifact authority checks |
| `redcube-ai` | controlled visual-stage soak orchestration；hosted-attempt reconciliation projection；no-forbidden-write cross-domain regression | visual quality scorer；render/export owner receipt fixture；artifact authority checks |

## 各仓测试收敛规则

Agent Lab 的价值是把各仓重复维护的 framework-level 长线测试收敛到 OPL，并让 domain repo 的测试回到领域 authority 本身。

应迁入 OPL Agent Lab 的测试：

- provider-hosted long soak / controlled soak 编排；
- interruption resume、retry、dead-letter repair、human gate resume、artifact restore 这类恢复探针；
- OPL typed queue / stage attempt / provider receipt / hosted-attempt reconciliation 投影；
- cross-domain no-forbidden-write、no-memory-body、no-artifact-mutation regression；
- improvement candidate / promotion gate 的 refs-only projection。

应继续留在 domain repo 的测试：

- MAS publication / review / study truth scorer；
- MAG fundability / grant strategy scorer；
- RCA visual quality / render-export scorer；
- domain owner receipt fixture、typed blocker fixture 和 owner-signed transition spec；
- artifact package / export / submission authority；
- memory body apply、writeback accept/reject 和 domain truth mutation。

因此，各仓可以删除或降级自己维护的 OPL-hosted soak 编排重复测试，但不能删除 domain-owned scorer、receipt、artifact authority、truth mutation 和 quality gate 测试。

## 继续落地顺序

下一步应围绕已落地 CLI 与合同做增量，而不是再新建平行 harness：

1. App/workbench 消费 `opl agent-lab complete --json`，展示 eval adapters、observability exports、optimizer candidates、promotion gates 和 online learning refs。
2. MAS/MAG/RCA 已将计划中的 provider-hosted soak / recovery orchestration 测试责任引用到 OPL Agent Lab longline suite，并在各自 repo-native verification lane 中保留 domain authority 测试边界。
3. 按需实现可选 Inspect AI runner connector、Langfuse/Phoenix export connector；这些 connector 只消费 OPL refs，不成为 OPL core runtime truth。
4. 当真实长时 domain owner chain 产生新的 owner receipt refs 时，只更新 Agent Lab 输入 refs 和 domain-owned proof refs，不把 receipt body 复制到 OPL。
5. Optimizer / RL 只生成 candidate config、candidate branch 或 transition refs；promotion gate 只允许推动 framework config / branch candidate，不允许 OPL 直接改写 domain truth、artifact、memory body 或默认 agent 配置。
6. `opl-meta-agent` 是独立 OPL-based Foundry Agent repo；它消费本控制面，不作为 OPL Framework 内置命令或合同 surface。
