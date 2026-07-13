# OPL Family 理想系统评估

Owner: `One Person Lab`
Purpose: `opl_family_ideal_system_assessment`
State: `support_reference`
Machine boundary: 本文是人读 north-star 评估和设计参考。当前事实、gap、计数、receipt、release verdict、domain ready、production ready 继续归 `docs/active/current-state-vs-ideal-gap.md`、核心五件套、contracts、source、CLI/API、runtime ledger、provider receipt、domain-owned manifests、App release/user-path evidence 和真实 workspace evidence。

## 读法

本文回答一个理想态问题：如果不受当前实现分布约束，OPL 基座、One Person Lab App、MAS/MAG/RCA/OMA 这些 Foundry Agents 应怎样设计，才能更易维护、更易使用、更一致、更能长期扩展。

本文不做当前落地度盘点，不冻结路线优先级，也不声明任何模块已经达到 L5 或 production ready。需要行动顺序时回到 [OPL Family 当前状态与理想目标差距](../../active/current-state-vs-ideal-gap.md)。需要底层 north-star owner boundary 时回到 [OPL 与 Foundry Agents 理想目标态](./opl-family-agent-ideal-state.md)。需要 operating model 分类时回到 [OPL Family Ideal Operating Model Redesign](../../active/opl-family-ideal-operating-model-redesign.md)。

Currentness policy：本文不维护 live evidence / production evidence / release evidence / Brand L5 / owner-chain scaleout worklist。理想系统评估只回答“目标形态应该是什么”和“哪些边界不能被误读”；live evidence 的独立维护入口是 [OPL Family Live Evidence 维护入口](../operating-governance/family-live-evidence-maintenance.md)。因此本文中的 L5、long-soak、release/user path、owner acceptance 只作为理想验收类型出现，不作为当前 active gap 或执行清单。

## 结论

理想的 OPL Family 应该是一个 `AI-native internal agent platform`：

```text
One Person Lab brand
  -> OPL Framework
  -> One Person Lab App cockpit
  -> Foundry Agents
  -> domain-owned stage artifacts / receipts / typed blockers
```

OPL 基座不应变成工作流脚本引擎、ledger 浏览器、多 backend launcher、跨仓 wrapper 集合或第二 domain truth。它应该像成熟内部平台一样提供一条 self-service golden path：统一 agent pack、统一 runtime、统一 App cockpit、统一 evidence/audit、统一 release/install，但把领域判断、交付物权威和质量 verdict 留在对应 Foundry Agent。

最理想的共同形态仍是：

```text
Declarative Domain Pack
  + OPL generated/hosted surfaces
  + standard authority functions
```

每个 Agent 只保留领域语义、prompt/skill/knowledge/quality gate、领域 truth、artifact/memory authority、owner receipt 和少量无法声明化的 authority functions。通用 scheduler、queue、attempt ledger、workspace lifecycle、artifact lifecycle、memory locator、operator projection、App workbench、CLI/MCP/status wrapper 和 release/install transport 都应由 OPL Framework 或 App 承接。

2026-06-10 的顶层重设把这套 north-star 进一步压成 `multi-plane operating system`：普通推进、durable runtime、stage artifact、domain decision、evidence telemetry、reconciler、App cockpit 和 agent improvement 彼此分离。默认路径只看 `current_owner_delta` 和 `Stage Artifact Unit`；其他平面只提供 refs、safe action、human/owner gate、repair action 或 drilldown。

## 外部成熟经验映射

OPL 应吸收成熟工程原则，不引入外部系统作为第二 runtime truth。

| 成熟经验 | 可吸收原则 | OPL 目标态映射 | 吸收分类 |
| --- | --- | --- | --- |
| CNCF platform engineering maturity model / platform as product | 平台要按产品经营，提供 self-service、golden path、反馈循环和可扩展治理。 | OPL 是面向 Foundry Agent 和普通用户的 agent platform；模块、CLI、App、skill、install 都从同一合同派生。 | `adopt_template` |
| Backstage Software Catalog / Software Templates | catalog 统一 owner/metadata/discovery，templates 生成标准组件和最佳实践脚手架。 | `OPL Atlas` 管 agent/capability/surface catalog；`Foundry Lab` 和 pack compiler 生成标准 domain-agent skeleton。 | `adopt_template` |
| Kubernetes controller / operator pattern | desired state 与 observed state 分离，controller reconcile current drift，不把 status 当业务目标。 | `current_owner_delta` / stage pack 是 desired；attempt/provider/worklist 是 observed；`Runway Progress Reconciler` 只输出 safe action、owner/gate wait 或 OPL repair blocker。 | `adopt_contract` |
| Temporal durable execution | durable execution、task queue、retry、timer、signal/query/update、workflow history 交给专门 substrate。 | `OPL Runway` 持有 Temporal-backed provider、attempt、lease、retry/dead-letter、human gate、recovery 和 provider refs；domain repo 不保 generic scheduler。 | `adopt_contract` |
| Dagster assets / asset checks | asset、materialization、dependency、check、freshness 分开建模。 | `Stage Artifact Unit` 按 asset unit 读取：manifest、hash、upstream refs、current pointer、artifact check refs 与 owner receipt 分离。 | `adopt_template` |
| OpenAI Agents SDK | handoffs、guardrails、tracing 是分层 primitive，handoff 和 guardrail 需要显式结构。 | stage handoff、tool affordance boundary、quality gate、trace/audit 分层；trace 只进 Ledger/diagnostic，不成为默认 plan root。 | `adopt_template` |
| LangGraph durable / HITL agents | checkpoint、thread state、pause/resume、human approve/edit/reject/respond 支撑长任务。 | OPL human gate 与 StageRun resume 使用显式 owner decision shape；checkpoint 只做 Runway/Ledger refs。 | `adopt_template` |
| MCP | tool/resource/prompt 通过机器可读能力暴露，权限可按 tool/capability 分离。 | `OPL Connect` 从 action/stage metadata 派生 CLI、MCP、OpenAI/AI SDK tool、Skill/plugin；权限和 forbidden authority 写入 tool boundary。 | `adopt_template` |
| OpenTelemetry | traces、metrics、logs、baggage 是观测信号，不是业务真相。 | provider trace、ledger、replay、evidence envelope 进入 `OPL Ledger`；默认 App/CLI 只显示 next owner、accepted answer shape 和 blocker。 | `adopt_template` |
| MLflow / DVC | run、params、metrics、artifact refs、dataset lineage、stage deps/outs 支撑可复现研究。 | MAS source / analysis / manuscript provenance 记录到 refs-only lineage；真实 source truth、publication verdict 和 owner answer 仍归 MAS。 | `adopt_template` |
| DORA metrics | 交付度量要同时看速度和稳定性，避免只看活动量。 | OPL L5 不看 worklist 数字，而看 agent lead time、owner-answer latency、blocked recovery time、release/user-path pass、change failure。 | `adopt_template` |
| Design systems / design tokens | 品牌和 UI 决策要有统一 token、组件、语言和迁移规则。 | One Person Lab 需要品牌系统：命名、视觉 token、图标、状态语言、产品层级、agent cards、receipt/blocker 文案统一。 | `adopt_template` |

参考来源：CNCF [Platform Engineering Maturity Model](https://www.cncf.io/blog/2023/11/20/announcing-the-platform-engineering-maturity-model/)、Backstage [Software Catalog](https://backstage.io/docs/features/software-catalog/) 与 [Software Templates](https://backstage.io/docs/features/software-templates)、Kubernetes [Operator pattern](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/) 与 [Controllers](https://kubernetes.io/docs/concepts/architecture/controller/)、Temporal [Durable Execution](https://docs.temporal.io/temporal)、[Event History](https://docs.temporal.io/encyclopedia/event-history/) 与 [Workflow message passing](https://docs.temporal.io/encyclopedia/workflow-message-passing)、Dagster [Assets](https://docs.dagster.io/api/dagster/assets) 与 [Asset checks](https://docs.dagster.io/api/dagster/asset-checks)、LangGraph [Overview](https://docs.langchain.com/oss/python/langgraph/overview) 与 [Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、OpenAI Agents SDK [Handoffs](https://openai.github.io/openai-agents-python/handoffs/)、[Guardrails](https://openai.github.io/openai-agents-python/guardrails/) 与 [Tracing](https://openai.github.io/openai-agents-python/tracing/)、MCP [Tools](https://modelcontextprotocol.io/specification/draft/server/tools) 与 [Authorization](https://modelcontextprotocol.io/docs/tutorials/security/authorization)、OpenTelemetry [Signals](https://opentelemetry.io/docs/concepts/signals/) 与 [Semantic conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/)、MLflow [Tracking](https://mlflow.org/docs/latest/ml/tracking/) 与 [Dataset Tracking](https://mlflow.org/docs/latest/ml/dataset/)、DVC [dvc.yaml](https://doc.dvc.org/user-guide/project-structure/dvcyaml-files)、DORA [software delivery metrics](https://dora.dev/guides/dora-metrics/)、Atlassian [Design tokens](https://atlassian.design/foundations/tokens/) 和 Carbon [Themes/tokens](https://v10.carbondesignsystem.com/guidelines/themes/overview/)。

所有外部经验都按 contract-first 处理：`adopt_contract` 只能落到 OPL/MAS 自己的 schema、read model、owner surface 或 generated surface；`adopt_template` 只能变成 stage pack、App cockpit、Ledger/Console drilldown 或 operating metric 的模板。任何外部 runtime、selector、scheduler、always-on sidecar、memory truth、quality verdict 或 popularity-based route 都默认 `watch_only` 或 `reject`。

## 理想产品与品牌结构

One Person Lab 对外应保持三层产品认知：

| 层 | 用户理解 | 维护者理解 |
| --- | --- | --- |
| `OPL Framework` | 让智能体可创建、可运行、可恢复、可审计的基座。 | Agent platform、runtime、contracts、pack compiler、generated surfaces、Ledger/Runway/Console。 |
| `One Person Lab App` | 人用工作台：选任务、看进度、处理阻塞、取交付物。 | Cockpit，不持有 runtime truth、domain truth、quality verdict 或 release 之外的领域权威。 |
| `Foundry Agents` | 可直接完成医学论文、基金、视觉交付和 agent 构建的领域智能体。 | Domain pack + authority functions；持有领域 truth、quality/export verdict、artifact/memory authority。 |

当前品牌模块应作为 OPL Framework 的 bounded contexts，而不是另一个产品层级：

| 模块 | 理想职责 | 主要品牌/维护价值 |
| --- | --- | --- |
| `Charter` | 命名、术语、ADR/RFC、原则、brand architecture。 | 防止概念漂移，让用户和维护者用同一语言。 |
| `Atlas` | Agent/capability/surface/owner catalog。 | 让能力可发现，避免孤儿 surface。 |
| `Workspace` | Project Unit、Stage Artifact Unit、文件生命周期和用户检查面。 | 用户知道文件在哪里，Agent 知道输出如何交接。 |
| `Pack` | Domain Pack、authority ABI、pack compiler、generated/hosted surfaces。 | 让 domain agent 用标准声明和最小 authority function 接入，不复制私有平台。 |
| `Stagecraft` | stage pack、prompt/skill/knowledge/rubric/quality gate。 | 把 AI-first 专家工作设计成可审计的 stage。 |
| `Runway` | durable execution、attempt、lease、retry、dead-letter、human gate。 | 长跑可靠性和恢复。 |
| `Ledger` | refs-only evidence、receipt、typed blocker、lineage、restore/provenance。 | 证据可追踪，但不抢 domain authority。 |
| `Console` | App/operator cockpit、next owner、blocked action、artifact/blocker view。 | 默认使用体验变短、变清楚。 |
| `Foundry Lab` | agent 创建、测试接管、mechanism improvement、canary/promotion。 | 让新增 agent 走同一生产线。 |
| `Connect` | CLI、MCP、OpenAI/AI SDK tool、Skill/plugin、install/release。 | 同一能力多入口一致暴露。 |

品牌一致性的关键不是给每个模块加 logo，而是固定 `product grammar`：

- 命名：所有 agent 都是 `One Person Lab Foundry Agent` 家族成员，公开名用领域品牌，机器名用稳定 id。
- 视觉：App 使用统一 design tokens、状态颜色、agent icon shape、artifact card、receipt/blocker status pattern。
- 语言：默认只说 `current owner`、`next action`、`artifact`、`receipt`、`typed blocker`、`human gate`；内部 ledger、trace、provider、worklist 只在 drilldown。
- 信息架构：Home 从目的进入，Agent page 从任务进入，Runtime page 从 owner delta 进入，Ledger page 从证据 drilldown 进入。
- 分发：managed modules、skills、plugins、CLI、App release 使用同一 manifest/capability source，不让开发 checkout 隐式决定普通用户体验。

## OPL 基座目标态

理想 OPL 基座由 9 个 primitive 组成：

| Primitive | 做什么 | 不做什么 |
| --- | --- | --- |
| `owner-delta-controller` | 汇总 desired/current、next owner、accepted answer shape、hard gate、route-back。 | 不生成领域目标，不签 domain receipt。 |
| `stage-attempt-runtime` | provider attempt、retry budget、currentness 与 artifact refs transport。 | 不决定 stage route、推理、写作、评审或质量。 |
| `stage-artifact-kernel` | Stage Folder、manifest、role artifact、hash、current pointer、lineage。 | 不判定 publication/fundability/visual/export quality。 |
| `agent-pack-compiler` | 从 domain pack 生成 stage/action/tool/skill/App/CLI/MCP metadata。 | 不把领域语义硬编码进 OPL。 |
| `generated-surface-host` | 托管 CLI、MCP、Skill/product-entry、status、workbench、default caller。 | 不让 domain repo 长期维护重复 wrapper。 |
| `passive-evidence-ledger` | 保存 refs-only evidence、trace、replay、typed blocker group、long-soak、cleanup provenance。 | 不作为默认 planning root。 |
| `app-state-action-producer` | 产出 App fast/full state、safe action shell、operator handoff payload。 | 不持有 GUI release verdict 之外的 product truth。 |
| `agent-lab-improvement-loop` | 组织 eval refs、root cause、candidate fix、promotion/canary/rollback evidence。 | 不接管目标 agent 的 owner receipt 或 domain truth。 |
| `human-owner-decision-gate` | approval/edit/reject/respond、quality reviewer、release owner、physical delete owner 和 route-back decision。 | 不用隐式默认、provider completion 或 old blocker 代替 owner decision。 |

基座维护原则：

- 默认路径短：`purpose -> agent -> stage -> current owner -> artifact/receipt/blocker`。
- 证据被动：Ledger 可以记录很多，但普通路径不从 raw evidence 规划。
- 合同少而硬：只硬门 identity、owner、scope、authority、forbidden write、receipt/blocker shape、replay/audit lineage。
- AI 空间保留：stage 内认知策略由 executor + prompt/skill/knowledge/rubric 驱动，OPL 不写死工具顺序或专家判断。
- 生成面优先：CLI/MCP/App/status/workbench 从 pack metadata 派生，domain repo 不复制平台。

## Foundry Agents 目标态

### MAS

MAS 的理想定位是医学研究与论文交付 Agent。

保留：

- study truth、医学 source policy、analysis / manuscript / reviewer / publication stage pack。
- AI reviewer、publication quality gate、artifact/package authority、publication-route memory body。
- source readiness、owner receipt signer、医学 helper implementation。

上收或退役：

- generic scheduler、progress portal、read-model repair loop、storage compaction shell、workspace/source shell、memory/artifact transport、standalone product wrapper。

理想普通路径：

```text
Research question / study
  -> source cohort
  -> analysis stage
  -> manuscript stage
  -> independent AI review
  -> revision
  -> publication package handoff
  -> owner receipt / typed blocker
```

理想 MAS/OPL 层面应把当前最容易卡住的推进面拆成：

| MAS/OPL plane | 长期 owner | 理想职责 |
| --- | --- | --- |
| `study_truth` | MAS | study.yaml、source policy、current_execution_envelope、医学 source/currentness。 |
| `research_stage_pack` | MAS declares, OPL Pack compiles | analysis、manuscript、review、revision、publication handoff 的 stage/prompt/skill/knowledge/quality refs。 |
| `stage_attempt_runtime` | OPL Runway | provider-backed attempt、retry budget、human/authority wait 与 progress refs。 |
| `research_artifact_unit` | OPL Workspace shell + MAS artifact authority | analysis output、manuscript draft、review packet、revision delta、package handoff manifest。 |
| `publication_quality_gate` | MAS | independent AI reviewer、publication criteria、quality gate receipt 或 typed blocker。 |
| `owner_answer_bridge` | MAS owner answer, OPL projection | MAS owner receipt / typed blocker / human gate / route-back evidence 绑定当前 StageRun identity、source fingerprint 和 idempotency。 |
| `research_provenance` | OPL Ledger refs-only + MAS source truth | MLflow/DVC-like run/dataset/artifact refs、source fingerprint、review lineage；只做可追踪，不授权 ready。 |

这让 MAS 像 RCA 一样顺滑的关键不是“没有 blocker”，而是 blocker 只来自真实 owner decision、quality gate、human gate 或不可恢复的 source/currentness hard boundary；平台 repair、provider proof、read-model reconcile、evidence accounting 和 stale route redrive 不再抢默认推进面。

### MAG

MAG 的理想定位是基金策略、撰写、评审和提交包 Agent。

保留：

- grant truth、funder/program memory、specific aims、strategy/rationale、fundability verdict。
- authoring quality/export verdict、package authority、submission human gate。
- non-authoritative grant route context、owner receipt signer、grant helper implementation；Codex CLI 独占 semantic stage route。

上收或退役：

- grouped CLI shell、product/status/user-loop wrapper、domain runtime wrapper、package/export generic lifecycle shell、memory locator、workbench。

理想普通路径：

```text
Opportunity / PI context
  -> fit and fundability stage
  -> specific aims / narrative stage
  -> budget/package stage
  -> independent grant review
  -> submission handoff
  -> owner receipt / typed blocker
```

### RCA

RCA 的理想定位是高质量视觉交付 Agent。

保留：

- visual truth、communication strategy、visual direction、source readiness。
- review/export verdict、canonical visual artifact authority、visual memory body。
- native helper implementation、artifact mutation authorization、owner receipt signer。

上收或退役：

- session store、runtimeWatch、domain_action_adapter、operator projection wrapper、artifact gallery shell、review/repair transport、route variant defaultization。

理想普通路径：

```text
Source / message goal
  -> source readiness
  -> communication strategy
  -> visual direction
  -> artifact build
  -> independent visual review
  -> export/handoff
  -> owner receipt / typed blocker
```

### OMA

OPL Meta Agent 的理想定位是 agent builder / tester / mechanism improver，不是第二个 Framework。

保留：

- target-agent pack candidate、work order、mechanism patch proposal、test takeover plan。
- conformance/eval evidence refs、risk-tier promotion recommendation、typed blocker。

上收或约束：

- worktree lifecycle、promotion gate authority、runtime ownership、App shell、registry truth 都留在 OPL Framework / App / target repo owner。

理想普通路径：

```text
Agent improvement request
  -> target pack diagnosis
  -> candidate patch/work order
  -> isolated verification
  -> owner review / promotion gate
  -> accepted change or typed blocker
```

## App 与使用体验

理想 App 不应该让普通用户理解 provider、queue、ledger、worklist、MCP、shell backend 或 executor adapter。它应该像一个 cockpit：

- Home：选择目标或 Agent，不展示平台内部。
- Agent page：展示任务模板、最近工作、可继续的 stage、当前 owner。
- Runtime page：只回答哪个任务在跑、下一步是谁、需要什么、是否有 artifact 或 blocker。
- Workspace page：打开 Project Unit、Stage Artifact Unit 和 deliverables，不让用户找 runtime state。
- Ledger page：证据、receipt、typed blocker、lineage、restore proof 只做 drilldown。
- Settings：managed modules、Codex CLI、Temporal provider、skills/plugins、release/update、Developer Mode。

普通用户默认操作应只有四类：

| 操作 | 意义 |
| --- | --- |
| `Start` | 选择 Foundry Agent 和任务模板。 |
| `Continue` | 恢复当前 owner delta 指向的下一步。 |
| `Review` | 处理 human gate、quality review 或 handoff。 |
| `Open artifact` | 查看当前 stage artifact 或交付物。 |

开发者模式才暴露 pack compiler、stage descriptor、provider trace、MCP tool catalog、raw receipts、runtime repair、cleanup gate 和 release evidence。

## 维护与治理目标

理想维护模型应让新增或改造一个 Agent 成为模板化过程：

1. 在 `agent/` 写 stage、prompt、skill、knowledge、quality gate 和 policies。
2. 在 `contracts/` 写 descriptor、stage control plane、action catalog、memory/artifact locator、receipt schema。
3. 在 `runtime/authority_functions/` 只放必要领域 authority implementation。
4. 通过 OPL pack compiler 生成 CLI/MCP/Skill/App/status/workbench metadata。
5. 通过 conformance、direct/hosted parity、no-forbidden-write、independent gate、release/install smoke 进入 L4。
6. 通过 real user path、long-soak、owner acceptance、operator repair loop、release cohort evidence 进入 L5。

维护者默认看三张表：

| 表 | 回答什么 |
| --- | --- |
| `Agent catalog` | 有哪些 Agent、owner 是谁、能力是什么、当前 maturity。 |
| `Owner delta board` | 哪些任务需要谁交付 artifact/receipt/blocker。 |
| `Operating evidence board` | 哪些模块缺 L5 的 release、soak、user path、owner acceptance。 |

不应继续维护多套同义状态页、多套 default caller、多个 wrapper alias、多个 progress truth、多个 App runtime bridge 或多个 release truth。

## 安全与权限边界

理想权限模型是 capability-scoped：

- 每个 tool/action 都声明 effect、input/output schema、credential scope、write boundary、human gate、forbidden authority。
- OPL 只授权 launch/execution/transport，不授权 domain verdict。
- Domain owner 才能签 owner receipt、typed blocker、quality/export verdict、artifact mutation、memory accept/reject。
- App safe action 只能提交 owner-provided payload 或 explicit human gate decision。
- Developer Mode 是显式开关；普通 managed runtime 不被 sibling checkout 或实验分支隐式污染。

MCP / OpenAI tool / CLI / App action 需要从同一 action catalog 派生，避免同一能力在不同入口有不同权限和语义。

## 度量与 L5 证据

理想 L5 不看“文档写完了、contract valid、worklist 为 0”。L5 应看真实运营指标：

| 指标 | OPL 读法 |
| --- | --- |
| `time_to_first_owner_delta` | 用户发起任务后多久看到明确 next owner / accepted answer shape。 |
| `stage_lead_time` | 从 stage launch 到 artifact + owner answer 的时间。 |
| `blocked_recovery_time` | typed blocker 出现后到 route-back / human gate / fix receipt 的时间。 |
| `owner_answer_validity` | owner receipt / typed blocker 是否绑定当前 StageRun identity、manifest、fingerprint。 |
| `change_failure_rate` | Agent pack / runtime / App 改动后导致 owner chain 断裂的比例。 |
| `release_user_path_pass` | 同 cohort install/update/first-run/agent task 是否通过。 |
| `no_second_truth_regression` | 是否有 wrapper/status/read-model/legacy alias 重新成为默认 truth。 |

这些指标应进入 `OPL Ledger` 和 `Console` 的 L5 drilldown，但普通用户仍只看到 next owner、artifact、blocker 和交付状态。

## 演进顺序原则

理想实现顺序不是“先把所有底层都做完”，而是围绕使用路径和维护路径同时收敛。本文只保留 north-star 顺序，不维护 landed / in-progress / remaining gate 状态；当前完成度、下一步和证据尾项必须回到 [OPL Family 当前状态与理想目标差距](../../active/current-state-vs-ideal-gap.md)、核心五件套、contracts、source、tests 和 fresh CLI/read-model。

1. 先固定 One Person Lab 品牌系统、产品层级、状态语言、visual pattern、Agent 命名和 receipt/blocker 文案，让用户、App、CLI 和模块文档使用同一套语言。
2. 再固定 standard Agent Pack ABI，让 `agent/`、`contracts/`、`runtime/authority_functions/`、stage / quality / receipt / tool boundary 成为所有 Foundry Agent 的标准接入形态。
3. 把 MAS/MAG/RCA/OMA 压到同一 ordinary golden path：domain pack 声明领域语义，OPL 生成/托管通用 surface，domain owner 仍持有 receipt、typed blocker、human gate、quality/export/no-regression verdict。
4. 让 CLI、MCP、OpenAI/AI SDK tool、Skill/plugin、App action、status read model 和 workbench 从同一 action / stage / pack metadata 派生，避免 domain repo 继续复制 generated wrapper。
5. 把 private platform residue 进入显式删除门：scheduler、queue、session store、workbench、status shell、domain wrapper、runtimeWatch、agent-lab materializer 等只能在 no-active-caller、replacement parity、owner receipt / typed blocker、no-forbidden-write 和 tombstone/provenance 成立后物理退役。
6. 最后用真实 user path、release/install cohort、long-soak、owner-chain scaleout、operator repair、owner acceptance 和 no-second-truth regression 关闭 L5；contract validation、conformance、provider completion、verified refs-only ledger 或 App projection 都只能作为输入。
7. 长期治理只在证据表明普通路径仍慢、不清楚或越权时新增 surface；否则优先 demote、merge 或 retire。

## 不应继续强化的方向

- 把 OPL 写成固定 workflow script engine。
- 把 provider completion、contract completeness、conformance pass、verified ledger 或 open worklist 为 0 写成 domain ready。
- 为每个 domain repo 保留自己的 scheduler、queue、attempt ledger、session store、workbench、status shell。
- 在 App 普通路径暴露 backend/executor/provider selector。
- 让 reference docs、dashboard、SQLite sidecar、runtime state 或 old proof 成为第二 truth。
- 因为已有 active caller 就保留历史 wrapper，而不做 generated replacement 和 delete gate。
- 用机械 score、regex、schema completeness 或 screenshot check 替代 AI-first independent quality gate。

## 目标状态检查表

一个理想 OPL family release 只有在下列问题都能正面回答时，才接近 L5：

- 普通用户是否能从 App 直接选择 MAS/MAG/RCA/OMA 任务并看到清楚下一步。
- 每个 Agent 是否只有一个 ordinary golden path，其他 route 是否下沉为 diagnostic/developer lane。
- 每个 stage 是否产出 artifact + manifest + owner receipt / typed blocker + current pointer。
- 执行 attempt 和审核/gate attempt 是否分离。
- CLI、MCP、OpenAI/AI SDK tool、Skill/plugin、App action 是否由同一 catalog 派生。
- App 是否只消费 projection，不持有 domain truth 或 runtime truth。
- Domain repo 是否只保留 domain pack、authority functions 和必要 native helper。
- OPL Ledger 是否能回放证据，但不会从 raw evidence 直接规划下一步。
- 品牌、视觉、文案、状态、图标、任务卡和 release/install 体验是否一致。
- L5 证据是否来自真实 user path、long-soak、release/install、owner acceptance 和 no-second-truth regression，而不是 docs 或 conformance。
