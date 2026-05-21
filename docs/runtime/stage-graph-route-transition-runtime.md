# OPL Stage Graph 与 Route-as-Transition Runtime

Owner: `One Person Lab`
Purpose: `stage_graph_route_transition_runtime_plan`
State: `active_plan`
Machine boundary: 本文是人读运行规划与边界合同。机器 truth 继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、stage attempt ledger 和 App/operator drilldown read model。
Date: `2026-05-21`

## 结论

复杂 domain agent 不需要在 domain repo 内维护一套小 stage runtime。OPL 应把大 stage、stage 内 route、route-back、human gate、review/audit、retry/dead-letter 和 child-run 统一承载为 `stage_control_graph`：stage 是 OPL provider-backed attempt 的可调度单位；route 是 domain-declared transition / owner-chain recommendation；child graph 只在 OPL runtime 内作为 parent stage 的可恢复子运行存在。

MAS 这类 domain agent 只声明医学研究语义、guard、owner route、expected receipt、typed blocker、quality/artifact authority 和 forbidden-write boundary。OPL 负责读取这些 refs，把它们放入 queue、stage attempt、transition runner、provider checkpoint、human gate transport、event/receipt ledger、App/operator read model 和 long-soak evidence worklist。

## 外部模式吸收

外部系统只作为模式来源，不作为 OPL 或 MAS 的 runtime dependency：

| 系统 | 可吸收模式 | OPL 采用口径 |
| --- | --- | --- |
| LangGraph | typed graph、checkpoint、thread cursor、subgraph、interrupt/human gate、super-step recovery。 | `stage_control_graph` 使用 typed state、checkpoint/ref cursor、human gate interrupt、subgraph/child-run interface；副作用必须在 executor attempt / domain receipt 中落账。 |
| Temporal | event history、deterministic replay、Activity 作为外部副作用边界、Signal/Query/Update、Child Workflow。 | OPL provider runtime 以 append-only event/attempt ledger 和 provider receipt 为恢复真相；domain action 是 activity-like authority function，不在 graph replay 中重写。 |
| AWS Step Functions | Task / Choice / Wait / Parallel / Map / callback token、JSON state input/output、显式 Next。 | OPL transition spec 支持 task、choice、wait_for_human、parallel/map、fail/complete；human approval 是 typed callback receipt。 |
| Prefect | flow/task/subflow、rich states、pause/resume、type-checked human input、state history。 | OPL stage attempt 暴露 rich state 与 typed human input request；domain repo 只声明审批字段与质量门含义。 |
| AutoGen Core | actor-style agent runtime、async routed messages、topic/subscription、runtime-managed agent lifecycle。 | executor、reviewer、auditor 必须是 OPL 调度的独立 invocation 与 receipt 流；同一 invocation 不能执行后自审并关闭 quality gate。 |
| CrewAI Flows | event-driven flow、start/listen/router、state management、flow visualization。 | OPL 可在 App/operator read model 中投影 route graph，但图展示不等于 domain verdict 或 production ready。 |

## 目标模型

```text
OPL stage_control_graph
  -> parent stage attempt
      -> route transition node
      -> executor node
      -> independent reviewer/auditor node
      -> human gate node
      -> parallel/map child graph node
      -> closeout/receipt node
          -> MAS owner receipt / typed blocker / route-back ref
```

核心对象：

| 对象 | Owner | 语义 |
| --- | --- | --- |
| `stage` | OPL runtime, domain semantic pack declares | 大型研究步骤和 provider-backed attempt admission 单位。 |
| `route` | Domain declares, OPL transports | domain owner-chain 下一步选择、route-back、typed blocker、human gate 或 owner action recommendation。 |
| `node` | OPL runtime | stage graph 内可恢复执行点，可绑定 executor、reviewer、human gate、choice、parallel/map 或 receipt ingest。 |
| `child_graph` | OPL runtime | parent stage 内部的可恢复子运行；完成后只回写 typed parent result/ref。 |
| `authority_function` | Domain repo | 写 domain truth、artifact body、quality verdict、owner receipt 或 typed blocker 的最小程序面。 |
| `receipt/event ledger` | OPL for refs, domain for authority | OPL 保存 refs-only attempt/event/transport receipt；domain 签 owner receipt 和 verdict/blocker。 |

## 调度规则

1. OPL 读取 domain `stage_control_plane`、`action_catalog`、transition spec、route contract、expected receipt refs 和 forbidden-authority refs。
2. OPL 把用户任务或 domain handoff hydrate 成 typed queue item，并创建 provider-backed `stage_attempt`。
3. Graph runner 在 attempt 内执行 node：choice/guard 只读取 typed state 和 refs；外部副作用进入 executor activity 或 domain authority function。
4. MAS route 返回 `owner_route_ref`、`next_owner`、`allowed_actions`、`typed_blocker_refs`、`expected_owner_receipt_refs`、`source/artifact/workspace refs`。
5. OPL 根据 route 生成下一 stage attempt、human gate request、parallel/map child attempt、dead-letter intent 或 operator workorder。
6. Domain owner receipt、independent reviewer/auditor record、human approval receipt 或 stable typed blocker 才能关闭对应 stage graph edge。
7. Provider completion、transition matrix pass、generated descriptor ready、route graph visible 或 App projection visible 都不能关闭 domain ready、publication ready、artifact ready 或 quality verdict。

## MAS 承载方式

MAS 经 OPL 托管时的完整功能链应读成：

```text
MAS semantic pack / route contract / authority function
  -> OPL family runtime intake
  -> OPL queue + provider-backed stage attempt
  -> OPL stage graph / transition runner
  -> MAS owner callable or AI reviewer/auditor authority
  -> MAS owner receipt / typed blocker / route-back ref
  -> OPL receipt ledger + App/operator projection
```

OPL 负责：

- stage graph schema、transition runner、queue、attempt ledger、retry/dead-letter、provider wakeup/resume、human gate transport、checkpoint/replay、parallel/map child attempt、App/workbench projection。
- executor/reviewer/auditor 独立 invocation 调度与 receipt ingestion。
- refs-only evidence ledger、operator workorder、long-soak/SLO projection 和 no-forbidden-write preflight。

MAS 负责：

- 医学 stage/route 语义、study truth、source readiness、publication quality verdict、artifact/package authority、memory accept/reject、owner receipt、typed blocker、safe action refs。
- 指定杂志格式整理这类任务的 domain 判断：目标 journal requirements、paper/package mutation authority、reviewer/auditor verdict 和 submission handoff receipt。

## 一步到位落地计划

这不是按阶段串行推进的计划，而是可并行关闭的守门面。每条 lane 都可以单独 worktree/subagent 推进，吸收回 main 后以同一组 read model 和 verification gate 收口。

| lane | 目标产物 | 完成门槛 |
| --- | --- | --- |
| `graph_runtime_contract` | OPL `stage_control_graph` schema 与 route-as-transition 读法进入 runtime docs / contracts index。 | stage、route、node、child_graph、authority_function、receipt 的 owner 清楚；机器入口指向已有 transition runner / family runtime / stage attempt contracts。 |
| `operator_drilldown` | 单一 operator read model 串起 transition spec、matrix result、stage attempt、owner route、human gate、dead-letter、owner receipt refs。 | App/operator 可从 full detail 看到同一 attempt 的 queue item、transition receipt、owner receipt/typed blocker/no-regression refs；projection 不生成 verdict。 |
| `mas_route_contract_consumption` | MAS route contract 明确 route 不是小 stage，也不是 runtime attempt。 | MAS sidecar 只输出 refs-only owner-route handoff；OPL hydrate/dispatch/retry/dead-letter；MAS 不写 liveness/redrive/runtime_state 仲裁。 |
| `executor_reviewer_split` | Executor、reviewer、auditor 成为独立 stage graph nodes/invocations。 | quality gate 只能由独立 reviewer/auditor record、domain owner receipt 或 typed blocker 关闭；同一 invocation 自审不得 close gate。 |
| `human_gate_transport` | typed human input / approval request 进入 OPL runtime owner handoff。 | pause/resume/stop/approve/reject 由 OPL transport 承载；MAS 只给 gate schema、authority boundary 和 receipt。 |
| `child_graph_parallelism` | 大 stage 内 route/sub-route 用 child graph / map / parallel 表达。 | child graph 只回写 typed parent result/ref；不共享 domain body；失败、retry、dead-letter 由 OPL attempt ledger 记录。 |
| `production_evidence_scaleout` | 真实 MAS paper-line canary 证明 provider attempt -> MAS owner callable -> receipt/blocker/progress delta。 | 多条真实 paper line 产出 owner receipt、typed blocker、AI reviewer/gate receipt、artifact movement、human gate、stop-loss 或 no-regression evidence。 |
| `physical_thinning` | MAS retained runtime/status/workbench/SQLite/transport adapter 按 delete/archive/tombstone gate 收口。 | no-active-caller、OPL replacement parity、MAS receipt parity、focused tests、no-forbidden-write proof、provenance/tombstone refs 全部成立。 |

## Route 与 Stage 的固定解释

| 问题 | 固定回答 |
| --- | --- |
| route 是不是小 stage？ | route 是 domain transition label / owner-chain recommendation；它可以触发 OPL 创建下一 stage attempt，但自身不持有 runtime lifecycle。 |
| 大 stage 里要不要套小 stage？ | 可以，但小 stage 是 OPL stage graph node 或 child graph，不是 MAS 私有 runner。 |
| Route 之间谁调度？ | OPL transition runner / family runtime manager 调度；MAS 只发布 route refs、guards、owner receipt、typed blocker。 |
| MAS 是否维护完整 Runtime？ | 目标态下不维护。现有 runtime/status/transport/SQLite 面只能作为 refs-only adapter、authority bridge、diagnostic 或 tombstone migration input。 |
| OPL 不具备能力怎么办？ | 优化 OPL 的 graph/runtime/provider/read-model，而不是在 MAS 回补 queue、scheduler、retry/dead-letter 或 liveness arbiter。 |

## 验收口径

可以声明：

- OPL 已具备承载 MAS route-as-transition 的基础运行面：stage graph projection、family transition runner、provider-backed stage attempt、typed queue、receipt ledger、runtime manager MAS route projection 和 App/operator drilldown。
- MAS 应继续作为 declarative medical research pack + minimal authority functions，而不是私有 runtime platform。

不能声明：

- transition runner pass 等于 MAS paper closure。
- provider completion 等于 publication-ready、artifact-ready、quality-ready 或 submission-ready。
- route graph visible 等于 owner receipt chain 已闭合。
- MAS retained adapter 已物理删除，除非 deletion gate 的所有 receipt/proof 都成立。
