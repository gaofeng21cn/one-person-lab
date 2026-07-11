# OPL Stage Graph 与 Route-as-Transition Runtime

Owner: `One Person Lab`
Purpose: `stage_graph_route_transition_runtime_support`
State: `active_support`
Machine boundary: 本文是人读运行规划与边界合同。机器 truth 继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、stage attempt ledger 和 App/operator drilldown read model。
Currentness policy: 本文不冻结日期、attempt id、worklist counter、receipt count、provider proof snapshot 或 App/operator drilldown 数值；当前状态必须从 fresh CLI/read-model、contracts、source、tests 与 runtime ledger 读取。

## 结论

复杂 domain agent 不需要在 domain repo 内维护一套小 stage runtime。OPL 的稳定目标是把大 stage、stage 内 route、route-back、human gate、review/audit、retry/dead-letter 和后续 child-run 能力统一承载为 `stage_control_graph`：stage 是 OPL provider-backed attempt 的可调度单位；route 是 domain-declared transition / owner-chain recommendation；Stage Transition Authority 是 OPL-owned generic primitive，负责把多来源 transition intent 裁决成唯一 current stage pointer、StageRun terminal state 与 `current_owner_delta`；child graph 目前只作为 OPL runtime 支撑语言 / future graph primitive 阅读，不能被写成已经落地的生产 child-workflow 能力。

这组能力的目标 runtime 名称是 `DomainProgressTransitionRuntime`。它归 OPL：OPL 负责 append-only event log、command/outbox/event intake、fixed-point reconciler、exactly-one transition、StageRun identity、idempotency、projection metadata、read-model rebuild、replay、NonAdvancingApply 分类、human gate resume token lifecycle、closeout transport 和 operator projection。当前 executable slice 已提供 physical JSONL command/event/outbox append/read/idempotency readback、physical JSONL live readback、transaction replay audit、aggregate read-model rebuild、human gate resume token issued/readback/consume/idempotent replay API。live readback 必须从 physical log 重建同一 transaction 的 command、event 与 outbox item，并证明三处 StageRun identity 一致；完整时返回 `complete_transaction` 与 `replay_audit.replay_status=replay_ready`，缺任一项、outbox identity 错配或 StageRun identity 不一致时 fail closed 为 `domain_progress_transition_readback_incomplete_transaction` / `blocked_incomplete_transaction`，且 `replay_audit.read_model_projection_consumable=false`。该切片仍不等于 provider-backed runtime soak、真实 operator / human gate integration 或 terminal closeout integration 完成。它是 Stage Transition Authority / Runway control-loop 的标准 runtime form，不新增 OPL 品牌模块；主模块是 `Runway`，协同模块是 `Pack`、`Stagecraft`、`Console`、`Ledger`、`Atlas`、`Workspace`、`Foundry Lab` 和 `Connect`。

Domain agent 只声明本域语义、guard、owner route、expected receipt、typed blocker、quality/artifact authority 和 forbidden-write boundary。MAS/MAG/RCA/OMA 模块只能提交 `transition_intent`、`owner_answer`、`typed_blocker`、`human_gate` 或 `provider_observation`；这些输入进入 OPL append-only authority event log 后，由 Stage Transition Authority 单点裁决。OPL 负责读取这些 refs，把它们放入 queue、stage attempt、transition runner、provider checkpoint、human gate transport、event/receipt ledger、App/operator read model 和 long-soak evidence worklist。OPL transition runner 当前只执行 domain-declared transition table、guard id matching、matrix fixture evaluation 与 receipt/projection envelope construction；它不执行 domain action，不解释 publication/fundability/visual verdict，也不替 domain 签 owner receipt。Domain 对应层统一读作 Domain Progress Policy Adapter：它把本域 stage、gate、human gate、artifact delta、owner receipt / typed blocker / quality verdict shape 和 forbidden-write boundary 映射到 OPL published language，不维护通用 scheduler、event log、outbox、fixed-point runtime 或 StageRun lifecycle。

## StageRun 循环状态归约

`opl-framework/stage-run-orchestration` 是 StageRun Kernel 的纯 refs event reducer，主模块是 `OPL Stagecraft`，协同模块是 `OPL Runway`。Domain agent 以 control-plane manifest input 提供 canonical `target_agent_ref`、`descriptor_ref`、`run_ref` 和 cycle / attempt 预算；generated control-plane adapter 复用 canonical `normalizeFamilyStageControlPlane`，校验 canonical Agent alias 与 control-plane domain owner 一致，把 `plane_id`、`target_domain_id`、owner 和完整 normalized plane fingerprint 绑定进 manifest identity，并注入唯一 OPL canonical launch owner、stage binding 与 Agent runner ref，不接受 caller 自填第二 scheduler。Reducer 只接受 `manifest_input + events`，每次从 normalized control plane内部构造 canonical manifest；raw manifest、caller mutable state和一致伪造的 fingerprint/manifest-id 对都不属于 public reducer input。每个 route/effect event 必须同时绑定 `manifest_id`、`stage_run_id`、`cycle_index` 与 `attempt_index`，跨 run、跨 cycle 或跨 attempt 重放 fail closed。Route decision 与 effect status 只接受各自 discriminant 允许的字段，夹带会被忽略的 checkpoint、blocker 或 output refs 一律 fail closed。当前没有 persistence consumer，也不公开 speculative persisted-state validator；当前没有 canonical admission consumer 的 no-progress signal只属于 reducer 外 advisory，不进入 manifest/effect/status，也不能阻断或耗尽 StageRun。

该模块只提供 stable identity、initial state 和有序 event reducer。它消费 domain owner 提供的 `dispatch / accepted / rollback / blocked` refs，以及 canonical runner / domain handler 已经产生的 `domain_result_ref / typed_blocker_ref / runtime_blocker_ref / checkpoint_ref / closeout_refs`，然后从 manifest 与完整 event 序列重建 pending stage、attempt、checkpoint、rollback 或 exhaustion 投影。它不循环调用 callback，不 spawn process，不接收 cwd / argv / env / output root，不创建目录、manifest、receipt 或 run closeout，也不选择 domain route。执行授权继续由 StageRun execution authorization 与 current-control admission 持有；Codex/Agent effect 继续走 `runAgentStageRunner` / Temporal activity，domain CLI effect 继续走既有 `runFamilyRuntimeDomainHandlerCommand`。Reducer 观察到 effect ref 不等于 OPL 创建了 domain result、typed blocker 或 owner receipt；最终 Stage current pointer 与 terminal state仍只由 Stage Transition Authority 消费合法 domain owner answer 后派生。

真实 domain 绑定通过显式 `npm run test:stage-run-mag-integration` 验收，不进入默认 smoke 冒充跨仓 current。该 gate 必须同时提供 `MAG_REPO_DIR` 与 40 位 `EXPECTED_MAG_HEAD`，缺失、路径错误、HEAD 漂移、CLI 非零或字段漂移都会 fail closed；它读取真实 stage manifest，经既有 clean domain-handler process boundary 调用 MAG quality-aware `workspace next-step`、typed-blocker authority 与 revision single-pass，证明 P3A critique/typed-blocker 路径及 revision 后 forward route，并且只把真实物理 refs 喂给 reducer。StageRun manifest 仍只绑定唯一 canonical Agent runner，domain-handler process 不是第二 runner owner。

MAS `PaperMissionTransaction` 进入 OPL 时只能作为 request-only `mas_domain_progress_transition_request` carrier。OPL 消费其中的 `opl_route_command` 并映射到自己的 `DomainProgressTransitionRuntime` command：`start_next_stage` 才能成为 `StartProviderAttempt`，且 request idempotency 与 provider attempt idempotency 必须分开；`stop_with_typed_blocker` 只能成为 terminal `RecordTypedBlocker`，产出 `typed_blocker_ref` outcome，不能排入 provider admission queue；`open_human_gate` 只能成为 terminal `OpenHumanGate`，产出 human-gate outcome。Provider admission 对非 `StartProviderAttempt` command fail closed；MAS carrier 不得声明 provider running、OPL StageRun / outbox / event 已写、provider completion 是 domain completion、domain ready、publication ready 或 paper artifact progress。

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
| Nextflow / DVC / Kubeflow / MLflow / Dagster / PROV-O / OpenLineage | 声明输出、stage/dep/out lock、artifact path/URI、run metadata 与 artifact store 分离、asset key/materialization metadata、entity/activity/agent 或 job/run/dataset 分层。 | OPL 吸收 `Stage Folder + Manifest + Receipt`、content hash、lineage event、current pointer 和 metadata/artifact body 分离；外部系统不成为 dependency，下游仍依赖 declared refs、manifest 和 owner receipt，不依赖 publish/display 目录。 |
| Event sourcing / append-only stream | 状态从不可变事件流派生；修正通过新事件表达，不原地改历史。 | Stage Transition Authority 的唯一可写面是 append-only authority event log；Stage current pointer、StageRun terminal state 和 `current_owner_delta` 只能从该 log 派生，不能由模块、projection、counter 或 UI 直接写入。 |
| Controller desired/status / message passing / structured delegation | controller 对齐 desired 与 status；message/signal 只表达输入；handoff 带结构化目标与 payload。 | transition intent、owner answer、typed blocker、human gate、provider observation 都是消息输入；OPL authority 才能把它们折叠成 next current pointer、terminal state 或 owner delta。 |

参考锚点是 [Azure Architecture Center 的 Event Sourcing pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)、[Kubernetes controller pattern](https://kubernetes.io/docs/concepts/architecture/controller/)、[Temporal Workflow / Event History](https://docs.temporal.io/workflows) 和 [LangGraph persistence / checkpointing](https://docs.langchain.com/oss/python/langgraph/persistence)。它们只作为设计输入：OPL 采用 append-only authority event、desired/current reconciliation、durable provider history、checkpoint/resume/human gate 等模式；OPL 的机器 truth 仍只归本仓 contracts、source、tests、runtime ledger、provider receipt、domain-owned owner answer 和 App/operator projection。

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

这组 runtime 对象也应按 OPL resource model 读成一条可维护链：

```text
workspace/project
  -> stage
  -> stage_run / attempt
  -> route transition event
  -> stage artifact unit
  -> owner answer / typed blocker / human gate
  -> current_owner_delta
  -> App Console action / Agent Lab follow-up
```

`workspace/project` 只定义 stage artifact 的用户检查根和生命周期投影；`stage_run / attempt` 只定义 OPL runtime envelope；`route transition event` 是 Stage Transition Authority 的输入；`stage artifact unit` 只证明 physical output、manifest、hash、lineage 和 owner answer refs；`current_owner_delta` 是 App/CLI/operator 默认根。App Console、Agent Lab、Atlas / Ledger telemetry 和 evidence worklist 都是这条链的 consumer 或 observation producer，不能成为第二 transition authority。

核心对象：

| 对象 | Owner | 语义 |
| --- | --- | --- |
| `stage` | OPL runtime, domain semantic pack declares | 大型研究步骤和 provider-backed attempt admission 单位。 |
| `route` | Domain declares, OPL transports | domain owner-chain 下一步选择、route-back、typed blocker、human gate 或 owner action recommendation。 |
| `node` | OPL runtime | stage graph 内可恢复执行点，可绑定 executor、reviewer、human gate、choice、parallel/map 或 receipt ingest。 |
| `child_graph` | OPL runtime | parent stage 内部的可恢复子运行；完成后只回写 typed parent result/ref。 |
| `authority_function` | Domain repo | 写 domain truth、artifact body、quality verdict、owner receipt 或 typed blocker 的最小程序面。 |
| `receipt/event ledger` | OPL for refs, domain for authority | OPL 保存 refs-only attempt/event/transport receipt；domain 签 owner receipt 和 verdict/blocker。 |
| `stage_transition_authority` | OPL runtime | generic primitive；读取多模块提交的 transition intent / owner answer / typed blocker / human gate / provider observation，并把 append-only authority event log 派生为唯一 stage current pointer、StageRun terminal state 和 `current_owner_delta`。 |
| `domain_progress_transition_runtime` | OPL Runway with Pack/Stagecraft/Console/Ledger support | OPL-owned standard runtime；消费 domain transition request / OPL-native command record 与 policy adapter refs，负责 fixed-point reconcile、exactly-one transition、StageRun identity、replay、NonAdvancingApply 和 projection demotion；不持有 domain truth、owner receipt 或 quality verdict。 |
| `domain_progress_policy_adapter` | Domain repo | 把 domain-specific progress policy 映射为 OPL published language；只产出 policy refs、owner answer shape、typed blocker shape、artifact delta refs、quality verdict boundary 和 forbidden-write flags。 |

## Resource Reconciler Boundary

OPL 可以有多个小 reconciler，但它们都必须是 derived surface，不是 authority：

| reconciler | 允许职责 | 禁止职责 |
| --- | --- | --- |
| `route_reconciler` | 把 domain owner route refs hydrate 成 stage-attempt request、conflict envelope 或 operator projection，并对齐 desired route 与 actual attempt / provider / receipt / human-gate / dead-letter state。 | 执行 route、生成候选、创建 owner receipt、签 typed blocker、关闭 stage 或声明 domain ready。 |
| `stage_artifact_reconciler` | 从 Stage Folder、manifest、content hash、lineage、owner receipt / typed blocker 和 artifact current pointer 重建 artifact progress。 | 把目录存在、file presence、provider completion 或 gallery projection 写成 stage complete。 |
| `owner_delta_reconciler` | 从 Stage Transition Authority 派生状态和合法 owner answer shape 生成 compact `current_owner_delta`。 | 从 raw evidence tail、typed blocker group、worklist counter 或 App projection 合成默认 next action。 |
| `atlas_ledger_reconciler` | 把 route graph、evidence、receipt、trace、replay、long-soak、cleanup 和 no-regression refs 收进 Atlas / Ledger telemetry。 | 让 telemetry count 直接改变 current pointer、terminal state、quality verdict 或 delivery progress。 |
| `app_console_reconciler` | 把 `current_owner_delta`、hard gate、artifact/blocker refs 和 allowed actions 投影成 App Console / operator action。 | 让 GUI shell、full drilldown 或 operator override 写 domain truth、owner receipt、stage terminal state 或 App release verdict。 |

这些 reconciler 的共同迁移门是：先证明 replacement parity、active caller cutover、no-forbidden-write 和 owner receipt / typed blocker 或 stable blocker，再收薄或删除旧 domain-local scheduler、status shell、workbench wrapper、route menu、sidecar 和 read-model accounting path。当前迁移顺序和 open tail 仍归 `docs/active/current-state-vs-ideal-gap.md`。

## Stage Transition Authority

Stage Transition Authority 是 OPL-owned generic primitive，不属于 MAS/MAG/RCA/OMA 任一 domain module，也不属于 App、Agent Lab、provider 或 read-model projection。它解决的问题是：一个 stage 运行中可以有多方提交事实或意图，但 current state 只能由一个 authority 裁决。

稳定输入只有五类：

- `transition_intent`：domain stage pack、route table、owner-chain 或 Agent Lab work order 提交的下一步意图。
- `owner_answer`：domain owner 返回的 owner receipt、quality/export/review receipt、route-back 或 no-regression ref。
- `typed_blocker`：domain owner、OPL runtime 或 human gate 返回的结构化阻塞；OPL runtime blocker 与 domain typed blocker 必须区分 owner。
- `human_gate`：人工 approve / reject / pause / defer / route-back 的 typed decision receipt。
- `provider_observation`：provider attempt、lease、heartbeat、timeout、retry/dead-letter、execution authorization 或 closeout binding 的 refs-only observation。

稳定输出只有三类，且都只能从 authority event log 派生：

- `stage_current_pointer`：当前 StageRun / attempt / manifest / current pointer 的选择结果。
- `stage_run_terminal_state`：`success`、`blocked`、`skipped/deferred` 或仍未 terminal 的状态解释。
- `current_owner_delta`：默认 App/CLI/operator 根对象，说明当前 owner 欠什么 accepted answer shape。

因此，多模块可以提议，单 authority 才能裁决。MAS/MAG/RCA/OMA 继续持有 domain truth、artifact body、quality/export verdict、owner receipt 和 typed blocker authority；OPL 持有 generic transition event log、current pointer derivation、StageRun terminal-state derivation 和 owner-delta projection。App/operator drilldown、`stage_progress_log`、runtime visualization、evidence worklist 和 provider trace 都只能消费派生结果或提交 observation，不能直接更新 current pointer、terminal state 或 `current_owner_delta`。

## Stage Folder Contract

每个可持久化 stage attempt 应物化为外部 runtime artifact root 中的 stage folder。目标目录语义如下：

```text
runtime-state/domains/<domain_id>/deliverables/<program>/<topic>/<deliverable>/
  deliverable.json
  stages/<stage_order>-<stage_id>/
    stage.json
    latest -> attempts/<attempt_id>/
    attempts/<attempt_id>/
      attempt.json
      inputs/
      outputs/
      evidence/
      receipts/
      manifest.json
  artifacts/canonical/
  artifacts/exports/
  lineage/events.jsonl
  current.json
```

`stage.json` 描述 stage role、required outputs、allowed receipt kinds、authority boundary 和 retention policy。`attempt.json` 描述 attempt identity、executor/provider binding、source/artifact/workspace refs、consumed refs 与 idempotency key。`manifest.json` 记录 required outputs、checksums、content type、producer、lineage refs、receipt refs、broken/orphan classification 和 promotion eligibility。`current.json` / `latest` 只声明当前 attempt pointer；它不替代 manifest、receipt 或 domain verdict。

RCA 的 stage output role 应固定在 contract 语义上：`source_intake` 输出 source truth pack、material inventory 或 missing material blocker；`communication_strategy` 输出 strategy brief 与 audience/claim/voice constraints；`visual_direction` 输出 storyboard、page plan 和 visual direction；`artifact_creation` 输出 render artifacts、render manifest 与 asset checksums；`review_and_revision` 输出 review verdict、screenshots、repair plan 和 before/after refs；`package_and_handoff` 输出 export bundle、handoff manifest、publish copy 与 checksum/provenance。实际文件名可以随 domain 工具变化，但 manifest 中的 role 必须稳定。

Stage status / explain 的推导顺序固定为：

1. 读取 `current.json` / `latest`，定位当前 attempt。
2. 校验 `manifest.json` 的 schema、required output roles、hash、path、lineage refs 与 receipt refs。
3. 校验 owner receipt、typed blocker 或 decision receipt 的 authority。
4. 输出 `success`、`blocked`、`skipped/deferred`、`running`、`stale`、`orphan artifact` 或 `broken artifact` 解释。

OPL 可以为这组语义提供 `stage open|commit|status|explain|promote|gc` 这类目标 API，但现有 CLI/read-model 是否已落地必须回到 fresh contracts/source/tests 判断。无论当前实现形态如何，DB、UI、App/operator projection、`stage_progress_log` 和 artifact gallery 都只能是从 stage folder contract 派生的索引。

## 调度规则

1. OPL 读取 domain `stage_control_plane`、`action_catalog`、transition spec、route contract、expected receipt refs 和 forbidden-authority refs。
2. OPL 把用户任务或 domain handoff hydrate 成 stage-attempt request/projection，并创建 provider-backed `stage_attempt`。
3. Graph runner 在 attempt 内执行 node：choice/guard 只读取 typed state 和 refs；外部副作用进入 executor activity 或 domain authority function。
4. Domain transition policy adapter 返回 generic transition request：必须携带 aggregate/study/work-unit identity、idempotency key、source generation、expected version、required postcondition/outcome、`owner_route_ref`、`next_owner`、`allowed_actions`、`typed_blocker_refs`、`expected_owner_receipt_refs`、`source/artifact/workspace refs`，并声明 domain 不能创建 OPL outbox/event。OPL runtime 通过 `DOMAIN_PROGRESS_POLICY_ADAPTER_CONTRACT` / `normalizeDomainProgressPolicyAdapterRequest` 固定该 ABI：`PaperProgressPolicyAdapter` request 只能作为 domain policy input 被 normalize 成 OPL command，不能携带 runtime artifact、owner receipt / typed blocker body、quality verdict 或 provider-completion-ready overclaim。
5. OPL 把 transition request normalize 成 command/outbox/event，并把 provider observation、human gate 和 owner answer 写成 authority event，再由 Stage Transition Authority 裁决下一 stage attempt、human gate request、parallel/map child attempt、dead-letter intent、operator workorder 或 current owner delta。OPL 只运行通用 DomainProgressTransitionRuntime substrate，不解释任何 domain 的业务 recovery 语义，也不从 read-model/current-control projection 自行推导下一步 domain action。
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

- stage graph schema、`DomainProgressTransitionRuntime`、transition runner、queue、attempt ledger、retry/dead-letter、provider wakeup/resume、human gate transport、checkpoint/replay、parallel/map child attempt、App/workbench projection。
- executor/reviewer/auditor 独立 invocation 调度与 receipt ingestion。
- refs-only evidence ledger、operator workorder、long-soak/SLO projection 和 no-forbidden-write preflight。
- PaperMission stage-route terminal reconcile 只负责把仍停在 `running` queue 的 OPL task 对齐到 linked terminal StageAttempt：provider / closeout terminal failure 只能落为 OPL queue `dead_letter`，domain gate pending、非 ready verdict、缺少可接受 typed closeout，或 accepted typed closeout 携带 `domain_ready_verdict=domain_ready`，都只能落为 OPL queue `blocked` 并等待 MAS authority；它不把 provider completion、closeout receipt 或 `domain_ready_verdict` 升格成 MAS domain ready、paper progress、owner receipt、typed blocker、human gate、publication/package/paper authority。

MAS 负责：

- Domain Progress Policy Adapter、医学 stage/route 语义、study truth、source readiness、publication quality verdict、artifact/package authority、memory accept/reject、owner receipt、typed blocker、safe action refs。
- 指定杂志格式整理这类任务的 domain 判断：目标 journal requirements、paper/package mutation authority、reviewer/auditor verdict 和 submission handoff receipt。

## 当前读法与动态证据入口

本节不是 active plan、完成 ledger 或 readiness oracle；当前 active gap 与下一轮 prompt 回到 `docs/active/current-state-vs-ideal-gap.md`。这里仅说明 stage graph / route transition 支撑文档如何读取 live truth。

基础运行面是否可用，应由 provider-backed stage attempt、stage-attempt request/projection、transition runner、receipt ledger、`stage_progress_log`、`runtime_visualization_projection`、App/operator drilldown 和 evidence worklist 的 fresh 输出共同证明。任何 open route、closed refs-only receipt、blocked envelope、running attempt、provider SLO 或 route-transition drilldown 数量都是动态读数，只能作为 operator attention / diagnostic / refs-only projection，不升级为 domain ready、production ready、artifact authority 或质量 verdict。

| lane | 稳定读法 | 当前证据入口 |
| --- | --- | --- |
| `graph_runtime_contract` | stage、route、node、child graph、authority function 与 receipt owner 是 runtime support language。新增 graph primitive 或 machine contract 时才同步本文。 | `docs/architecture.md`、`docs/invariants.md`、`contracts/`、stage pack / action catalog / transition runner 源码。 |
| `transition_runner` | `family_transition_runner` 是 domain-neutral transition spec / matrix runner；OPL 只做 guard id matching、fail-closed blocker/dead-letter intent、owner-route/receipt/projection envelope，不拥有 domain verdict。 | `contracts/opl-framework/family-transition-runner-contract.json`、`src/family-transition-runner.ts`、`tests/src/family-transition-runner.test.ts`。 |
| `stage_transition_authority` | Stage current pointer、StageRun terminal state 与 `current_owner_delta` 只能从 OPL authority event log 派生；MAS/MAG/RCA/OMA 只能提交 transition intent、owner answer、typed blocker、human gate 或 provider observation。 | `docs/architecture.md`、`docs/invariants.md`、StageRun Kernel contract/source/tests、current-owner-delta read model、transition runner support surfaces。 |
| `operator_drilldown` | `runtime app-operator-drilldown` 是 summary-first refs-only read model；full detail 可定位 route graph、stage progress、domain dispatch、stage production evidence 和 safe action refs，但不生成 verdict。 | `opl runtime app-operator-drilldown --json` 与 `--detail full`。 |
| `stage_progress_log` | `stage_progress_log` 是 OPL attempt/progress projection，不是平行 runtime log database；它从 attempt ledger、provider run、activity events、usage projection、closeout packet 和 blocker refs 派生。 | `opl family-runtime attempt query|inspect`、`stage_attempt_workbench`、App/operator drilldown、相关 tests。 |
| `runtime_visualization_projection` | graph/timeline/research lens 只是 App/operator 可视化投影；route graph visible、paper route lens visible 或 Temporal Web UI link visible 都不等于 owner-chain closure。 | App/operator drilldown 的 `runtime_visualization_projection` 与 `visual_ref_groups`。 |
| `mas_route_contract_consumption` | MAS route support 只作为 refs-only catalog 与 domain dispatch workorder 进入 OPL；OPL hydrate/dispatch/retry/dead-letter，不写 MAS liveness/redrive/runtime_state 仲裁。 | `runtime_manager_route_support`、domain-dispatch evidence worklist、MAS owner surface。 |
| `executor_reviewer_split` | AI-first independent reviewer/auditor gate 是 invariant；同一 invocation 不能执行后自审并关闭 quality gate。 | `docs/invariants.md`、Agent Lab / stage-control-plane read model、domain owner receipt 或 typed blocker。 |
| `human_gate_transport` | pause/resume/stop/approve/reject 由 OPL transport 承载；domain repo 只给 gate schema、authority boundary 和 receipt。 | provider signal/query/readiness、human gate refs、stage attempt ledger。 |
| `child_graph_parallelism` | child graph 只回写 typed parent result/ref，不共享 domain body；失败、retry、dead-letter 应由 OPL attempt ledger 记录。当前按 future graph primitive / support language 阅读，不作为已闭合生产能力或 readiness proof。 | future graph primitive、provider child workflow / subgraph refs、attempt ledger。 |
| `production_evidence_scaleout` | domain-dispatch / stage-production evidence 的 open、closed、blocked、superseded envelope 只是 refs-only operator lens。 | `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`、domain owner receipts / typed blockers。 |
| `physical_thinning` | cleanup/read-model 只能定位 replacement parity、no-active-caller、owner receipt / typed blocker 与 provenance/tombstone refs；物理删除仍归 domain owner gate。 | conformance/default-caller deletion read model、domain contracts、focused tests、no-forbidden-write proof。 |
| `domain_progress_transition_live_readback` | `readDomainProgressTransitionRuntimeReadbackJsonl` 读取 physical JSONL command/event/outbox log，并只在 command、event、outbox item 属于同一 transaction 且 `readDomainProgressStageRunIdentity` 证明三处 StageRun identity 一致时输出 `complete_transaction`。`auditDomainProgressTransitionReplay` 同步输出 `replay_ready` / `fail_closed` 和 `read_model_projection_consumable`，供 current-control / domain adapter 判断是否可消费。若 latest event 存在但 transaction 不完整、outbox identity 错配或 StageRun identity 不一致，readback 必须 fail closed，不能由 domain repo 补偿半事务，也不能把 projection clean 当作 owner answer。 | `src/family-runtime-domain-progress-transition-runtime-parts/live-readback.ts`、`src/family-runtime-domain-progress-transition-runtime-parts/replay-audit.ts`、`src/family-runtime-domain-progress-transition-runtime.ts#readDomainProgressStageRunIdentity`、`tests/src/cli/cases/family-runtime-domain-progress-transition-runtime.test.ts`、`contracts/opl-framework/stage-route-scheduler-contract.json#stage_route_arbiter_substrate_contract.domain_progress_transition_runtime_first_slice.physical_persistence_refs`。 |

## Route 与 Stage 的固定解释

| 问题 | 固定回答 |
| --- | --- |
| route 是不是小 stage？ | route 是 domain transition label / owner-chain recommendation；它可以触发 OPL 创建下一 stage attempt，但自身不持有 runtime lifecycle。 |
| 大 stage 里要不要套小 stage？ | 可以，但小 stage 是 OPL stage graph node 或 child graph，不是 MAS 私有 runner。 |
| Route 之间谁调度？ | OPL transition runner / family runtime manager 调度；MAS 只发布 route refs、guards、owner receipt、typed blocker。 |
| 多个模块都提交下一步时谁说了算？ | 模块只提交 transition intent / owner answer / typed blocker / human gate / provider observation；Stage Transition Authority 从 append-only event log 单点派生 current pointer、terminal state 和 `current_owner_delta`。 |
| MAS 是否维护完整 Runtime？ | 目标态下不维护。现有 runtime/status/transport/SQLite 面只能作为 refs-only adapter、authority bridge、diagnostic 或 tombstone migration input。 |
| domain progress transition runtime 放哪里？ | 通用 `DomainProgressTransitionRuntime` 放 OPL；domain 仓只保留 policy adapter 和本域 authority function。 |
| OPL 不具备能力怎么办？ | 优化 OPL 的 graph/runtime/provider/read-model，而不是在 MAS 回补 queue、scheduler、retry/dead-letter 或 liveness arbiter。 |

## 验收口径

可以声明：

- OPL 的目标运行模型是 stage graph + route-as-transition：stage 是 provider-backed attempt admission 单位，route 是 domain owner-chain recommendation / typed blocker / route-back / owner action ref。
- Stage Transition Authority 是 OPL-owned generic primitive；多模块可提议，单 authority 裁决，current pointer、terminal state 和 `current_owner_delta` 从 append-only authority event log 派生。
- OPL transition runner 已有 domain-neutral contract / source / tests，可运行 domain-declared transition spec、guard matching 和 matrix fixture，并只输出 owner route、human gate、typed blocker、dead-letter intent、receipt/projection envelope。
- Fresh read-model 可以证明某一时刻的 stage graph projection、transition runner、provider-backed stage attempt、stage-attempt request/projection、receipt ledger、runtime manager route projection、`stage_progress_log`、`runtime_visualization_projection` 或 App/operator drilldown 可读。
- MAS 应继续作为 declarative medical research pack + minimal authority functions，而不是私有 runtime platform。

不能声明：

- 本文、某次 read-model 快照或某个 route-transition counter 等于当前 active plan 完成。
- transition runner pass 等于 MAS paper closure。
- provider completion 等于 publication-ready、artifact-ready、quality-ready 或 submission-ready。
- route graph visible 等于 owner receipt chain 已闭合。
- transition intent、provider observation、human gate 或 App projection 等于 current pointer / terminal state / owner delta 已被直接更新。
- paper route lens visible 等于论文正文已读、论文路线已成功或 publication ready。
- transition runner pass、matrix fixture pass 或 child graph support language 等于 domain action 已执行、domain owner receipt 已签、child workflow production 能力已闭合或 production ready。
- MAS retained adapter 已物理删除，除非 deletion gate 的所有 receipt/proof 都成立。
