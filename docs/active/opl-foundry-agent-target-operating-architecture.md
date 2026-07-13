# OPL Foundry Agent Target Operating Architecture

Owner: `One Person Lab`
Purpose: `foundry_agent_target_operating_architecture`
State: `active_support`
Machine boundary: 本文是人读目标操作架构。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、owner receipt、typed blocker、真实 workspace 与 App evidence。

## 读法

本文回答一个更上层的问题：如果不被当前实现分布约束，只从 MVP、AI-first、executor-first 和可维护性出发，OPL / Foundry Agent 应该怎样全面重构，才能让 MAS/MAG/RCA/OMA 最高效地产出、最少被平台噪音拖住、并且最容易长期维护。

本文不替代 live machine truth，也不声明 production ready、domain ready、App release ready、artifact authority ready 或物理删除授权。当前 live 状态、计数、receipt id、attempt id、workorder 数量仍从 CLI/read-model/ledger 读取。

历史 friction 诊断回到 [OPL Foundry Agent MVP Friction Audit](../history/process/plans/2026-06-04-opl-foundry-agent-mvp-friction-audit.md)。当前 gap owner 回到 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。核心边界回到 `project/status/architecture/invariants/decisions`。

## 目标结论

理想 OPL 不是更厚的流程系统，也不是更大的 worklist / evidence ledger。理想 OPL 是一个面向高价值知识工作的 `Cognitive Computation Kernel + Agent Runtime Platform`：

```text
Domain Intent
  -> Foundry Agent Product Pack
  -> Stage Goal + Context + Authority Boundary + Available Affordances + Quality Gate
  -> Cognitive Computation Kernel in selected Codex executor
  -> Stage Attempt Runtime
  -> Stage Artifact Unit
  -> Codex-selected next declared stage or route-back
  -> Optional Independent Gate / Owner Answer for quality or authority claims
  -> current_owner_delta
```

它只默认做四件事：

1. 让最强 executor 尽快拿到正确 stage、材料、权限边界、可用 affordances 和质量门。
2. 在 stage 内保留开放式认知计算空间：executor 自主规划、调工具、生成候选、反思、比较、修订和追问。
3. 让每次 attempt 收敛成可验证的 artifact / receipt / typed blocker。
4. 让 operator / App 只看到当前 owner 欠什么下一步，而不是看到平台内部全部证据尾巴。

因此，目标重构的中心不是 `worklist`，而是 `current_owner_delta`；不是 `evidence envelope`，而是 `stage artifact unit`；不是 `tool profile` 或流程脚本，而是 `tool affordance boundary`；不是 `diagnostic route menu`，而是每个 agent 的单一 golden path。

## External Practice Synthesis

本轮重新查阅了成熟工程经验，吸收原则而不引入外部 runtime truth。

| 外部经验 | 可吸收原则 | OPL 目标设计 |
| --- | --- | --- |
| [Anthropic Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) | agent 系统优先从简单、可组合 pattern 开始；复杂度只有在必要时加入。 | OPL 默认路径必须短；多 agent、proof lane、diagnostic、replay 和 worklist 只在明确需要时显式进入。 |
| [OpenAI Agents SDK handoffs](https://openai.github.io/openai-agents-js/guides/handoffs/) | handoff 是显式 delegation，带目标 agent、输入过滤和结构化 payload；不是隐式路由猜测。 | Foundry Agent handoff 必须是 `owner_answer` 或 `current_owner_delta`，不能从 raw evidence 自动推断下一 owner。 |
| [OpenAI Agents SDK guardrails](https://openai.github.io/openai-agents-python/guardrails/) | guardrail 应按 workflow boundary、input/output/tool 分层。 | OPL guardrail 分为 launch-hard、runtime-enforced、domain/human gate、audit-only；不能把所有 warning 做成启动阻塞。 |
| [OpenAI Agents SDK tracing](https://openai.github.io/openai-agents-python/tracing/) | trace 记录 LLM、tool、handoff、guardrail 等运行事件，用于 debug / monitor。 | OPL trace/evidence 是 audit plane，不是默认 planner；trace 必须折叠成 owner delta 才能影响 next action。 |
| [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence) | checkpoint 支撑 human-in-the-loop、time travel、fault-tolerant execution。 | OPL checkpoint / attempt ledger 服务 resume 和审计；默认进度看任意可读 stage artifact。 |
| [Kubernetes controllers](https://kubernetes.io/docs/concepts/architecture/controller/) 与 [spec/status](https://kubernetes.io/docs/concepts/overview/working-with-objects/kubernetes-objects/) | controller 比较 desired state 和 current state；spec 与 status 分离。 | `stage pack/current_owner_delta` 是 desired；attempt/provider/receipt/worklist 是 status。status 不能生成新的 domain goal。 |
| [Temporal docs](https://docs.temporal.io/) | durable execution 把 workflow history、retry、timeout、worker、task queue、signal/query/update 等 message passing 放到底座。 | OPL 长跑底座归 Temporal-backed provider；provider observation 只进入 attempt ledger/passive projection，不能成为 route authority。 |
| [Argo CD automated sync](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/) / [sync options](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/) / [resource health](https://argo-cd.readthedocs.io/en/latest/operator-manual/health/) | desired/live diff、sync status 和 health status 分开；prune/delete/force/replace 这类高风险动作有显式开关或确认。 | OPL default controller 可持续修正可恢复 drift；artifact/package mutation、physical delete、publication/submission/release claim 和 production-ready 必须由 owner/human gate 显式授权。 |
| Event sourcing / append-only stream | history 支持恢复与审计。 | OPL 只追加 attempt/transport observations；不能从事件流衍生第二套语义 route verdict。 |
| [SLSA provenance](https://slsa.dev/spec/latest/) | provenance/attestation 让 artifact 的来源、构建输入和完整性可验证，但不替代业务验收。 | Stage Artifact Unit 的 manifest、hash、lineage、restore refs 是 artifact authority 的输入；它们不能单独声明 domain ready、publication-ready、package-ready 或 production-ready。 |
| [Backstage Software Templates](https://backstage.io/docs/features/software-templates) 与 [Golden Paths](https://backstage.io/docs/golden-path/create-app/) | 平台用模板和 golden path 给用户一个默认可成功路径。 | 每个 Foundry Agent 只有一个 ordinary golden path；variants/proof/debug/cleanup 走显式 lane。 |
| [CNCF Platform Engineering Maturity Model](https://tag-app-delivery.cncf.io/fr/whitepapers/platform-eng-maturity-model/) | 平台成熟度靠 self-service、paved road、feedback loop，而不是工具堆叠。 | OPL 应作为 thinnest viable agent platform，给 domain pack 自助接入和默认路径反馈，而不是把所有 evidence 暴露给用户。 |
| [Google SRE Eliminating Toil](https://sre.google/sre-book/eliminating-toil/) | manual/repetitive/automatable/tactical/no enduring value/O(n) 工作是 toil。 | receipt-only、read-model reconcile-only、stale route redrive-only、typed-blocker accounting-only 是平台 toil，应优先设计掉；没有 canonical admission consumer 时只记录 advisory diagnostic。 |
| [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/) | traces、metrics、logs 等信号分层，用于理解系统。 | OPL 默认只给 broad owner signal；trace/log/metric/raw refs 全部进 drilldown。 |
| [DORA continuous delivery capability](https://dora.dev/capabilities/continuous-delivery/) | 高质量快速反馈应对所有团队成员可见。 | Foundry Agent 默认反馈必须是用户能理解的 next owner / artifact delta / blocker，而不是内部计数。 |

这些经验共同给出一个判断：OPL 的理想形态应像平台工程的 golden path + Kubernetes 的 controller + Temporal 的 durable execution / message passing + event sourcing append-only stream + SRE 的 toil 消除 + agent handoff/guardrail/tracing 的分层组合；但 OPL 的领域智能继续由 Codex executor、domain pack 和独立 gate 承担。Stage 内的工具目录只应表达可用能力和安全边界，不应变成约束 executor 的工具流程。

## Combined Design Evaluation

本节把两类 prior design-review input 合并成同一个目标态判断；具体会话来源属于历史 provenance / git history，不作为 active architecture truth 维护：

- `purpose-first / owner-delta-first` input：从最终产出反推哪些 repo、surface、wrapper、read-model、evidence 和 cleanup 面真正必要。
- `MVP-first` input：从最短可用路径判断哪些设计正在帮助 agent 产出，哪些会把系统拖入 receipt、reconcile、replay、diagnostic 或 evidence accounting。

两条线给出的共同结论是：OPL 应该成为更强的底座，而不是更厚的默认流程。理想 OPL 的默认层只负责把正确的 `current_owner_delta`、stage context、authority boundary、available affordances、quality gate 和 durable runtime 交给 Codex executor；其余 evidence、diagnostic、replay、long-soak、cleanup 和 wrapper-retirement 都是显式 lane。

### What is already directionally right

| 面 | 设计判断 |
| --- | --- |
| `OPL Framework -> App Cockpit -> Foundry Agents` | 顶层三层是对的。Framework 持 runtime / queue / projection / generated surface；App 展示和介入；domain agent 持 truth / artifact / quality / owner answer。 |
| `Codex CLI` first-class executor | 符合 AI-first / executor-first。OPL 不应把 stage 内专家判断编译成 rigid workflow。 |
| Temporal-backed provider | 长跑、resume、retry、dead-letter、history 和 worker liveness 应归 framework substrate；domain repo 不应复制 daemon / scheduler / attempt loop。 |
| `current_owner_delta` | 这是最重要的默认 root。它把 “还有多少 evidence item” 改成 “谁欠什么可验证 delta”。 |
| Stage Artifact Unit | 任意可读 physical output 都是 progress；manifest、owner answer 和 current pointer 只提升完整性与质量声明等级。 |
| Tool affordance boundary | 工具目录作为能力/权限/凭据/写范围/副作用/forbidden authority 边界有价值；它不能变成工具顺序、认知策略或 quality verdict。 |

### What should be redesigned more aggressively

| 优先级 | 重构点 | 理想目标 |
| --- | --- | --- |
| P0 | `owner_delta_contract_as_single_root` | 把 `current_owner_delta` 从 policy / projection 进一步提升成所有 default read surface 的唯一 canonical object；framework readiness、App fast state、runtime tray、evidence-worklist summary 和 Agent Lab improvement input 都从它派生。 |
| P0 | `no_worklist_root_planning` | worklist、raw evidence envelope、stage replay、typed blocker group 和 private residue inventory 只能是 audit/detail；未 fold 成 owner delta、owner answer、typed blocker 或 hard gate 前，不得生成默认计划或 next action。 |
| P0 | `lineage_no_progress_advisory` | 同一 lineage 反复 receipt-only、platform-repair-only、read-model reconcile-only 或 stale-route redrive-only 时，只生成 advisory diagnostic；在 canonical admission consumer 存在前不得冻结 launch。 |
| P0 | `domain_golden_path_single_default` | MAS/MAG/RCA/OMA 每个 agent 只有一个 ordinary golden path；proof lane、diagnostic lane、route variant、long-soak、cleanup 和 legacy provenance 必须显式进入。 |
| P1 | `generated_surface_absorbs_wrappers` | CLI/MCP/App/status/workbench/default-caller shell 由 OPL generated/hosted surface 承担；domain repo 只保 semantic pack、authority functions、native helpers 和 direct skill path。 |
| P1 | `app_cockpit_not_ledger_browser` | App 默认页只显示任务、stage、owner、缺什么 answer、artifact、hard blocker 和用户介入点；full ledger、raw count、provider trace 和 route menu 只在 drilldown。 |
| P1 | `evidence_ledger_passive` | passive evidence ledger 的规则固定为 record everything, plan from nothing；证据增长不等于进度，typed blocker 增长不等于完成。 |

### Per-agent ideal shape

| Agent | 理想默认路径 | 应下沉或退役的面 |
| --- | --- | --- |
| MAS | 当前 study -> paper/evidence/reviewer/human-gate delta -> MAS owner receipt or typed blocker。 | historical dispatch refs、MDS/backend provenance、platform repair、read-model accounting、full typed blocker groups、stale route redrive。 |
| MAG | selected grant -> authoring/fundability/export/submission delta -> MAG owner receipt or typed blocker。 | grouped CLI internals、Hermes proof lane、manifest consumer long-soak、submission 前的 shell/status/diagnostic 抢占。 |
| RCA | source truth -> image-first visual artifact -> review/export gate -> RCA owner receipt or typed blocker。 | HTML/native PPTX variants、route alias menu、runtimeWatch internals、visual long-soak、historical replay refs。 |
| OMA | target-agent evidence -> mechanism/candidate/work-order -> target owner answer。 | 第二 Framework / 第二 Agent Lab、reviewer pool owner、worktree lifecycle owner、promotion gate owner、script materializer internals默认化。 |

### Design scorecard

| 维度 | 当前方向 | 理想态评分 | 主要缺口 |
| --- | --- | --- | --- |
| 目标对齐 | framework/domain/App owner 边界已经基本正确。 | 高 | 需要继续防止 evidence tail 和 wrapper retirement 被误读成 domain progress。 |
| MVP 可用性 | ordinary path 已收窄到 owner-delta-first。 | 中高 | worklist/evidence/readiness 仍容易在 operator 视角重新变成 action root。 |
| 可维护性 | primitive 已明确，但历史命令和长文件仍有迁移压力。 | 中 | 代码结构应继续围绕 `owner-delta-controller`、`stage-attempt-runtime`、`stage-artifact-kernel`、`evidence-ledger` 等 primitive 收束。 |
| 可扩展性 | standard pack / generated surface / conformance 方向正确。 | 中高 | 新 agent onboarding 应从 product pack + golden path + authority functions 生成，而不是复制 MAS/MAG/RCA 历史 wrapper。 |
| 可审计性 | refs-only ledger、Stage Artifact Unit、Temporal provider 和 owner receipt 边界强。 | 高 | audit plane 必须保持 passive，不能用审计计数驱动 planning。 |

### Target Reading Sequence

本节是目标架构的阅读顺序，不是独立 active roadmap。当前执行顺序、状态和 baton 回到 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。

1. 先固化 `current_owner_delta` canonical schema 和 default derivation，确保所有默认读面同源。
2. 再关闭 worklist-root planning：所有 raw tail 必须通过 owner delta / hard gate / typed blocker fold 才能影响默认动作。
3. 接着删除 disconnected stop-loss control plane，只保留 no-progress advisory；未来只有出现 canonical admission consumer 与明确 owner contract 时才允许重新评估 enforcement。
4. 然后逐 agent 固定唯一 ordinary golden path，并把 route variants、proof lane、diagnostic、cleanup、long-soak 下沉为 explicit lane。
5. 最后推进 domain wrapper retirement：只在 replacement parity、no-active-caller、domain owner receipt / typed blocker、no-forbidden-write、tombstone/provenance 全满足时物理删除。

这套顺序的目的不是增加设计层，而是减少默认面：先让 operator 永远只看到一个当前 owner delta，再让平台证据成为可下钻的 observability，而不是可误触发的任务来源。

### Unified Optimization Direction

两条主线现在合并成同一个优化方向：`目的反推必要性，MVP 检查阻碍性`。

```text
Purpose-first necessity
  -> keep only surfaces that move the owner delta, protect authority, or preserve auditability
MVP-first obstruction check
  -> remove, demote, or isolate anything that delays the next owner answer or artifact delta
Unified target
  -> current_owner_delta-first default path with passive audit and explicit non-default lanes
```

后续优化不再以“还有哪些 surface 可以补齐”为默认问题，而是先问：

1. 这个 surface 是否让当前 owner 更快产出 answer、artifact delta、receipt、typed blocker、human gate 或 no-regression ref。
2. 这个 surface 是否是 launch safety、authority boundary、durable execution、replay/audit 或 App/operator 介入的必要下限。
3. 如果它只解释历史、计数、trace、variant、cleanup、long-soak 或 provider internals，是否已经从 default path 下沉到 explicit diagnostic / audit lane。
4. 如果它已被 OPL generated/hosted surface 或 App/product contract 替代，是否已经进入 no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance 删除门。

符合预期的 OPL 默认形态是：普通 operator 不需要理解 worklist、route menu、provider trace、receipt count、private residue 或 wrapper lineage，也能看清当前谁欠什么、接受什么返回形状、有没有 hard gate、下一步是否能执行。Domain owner 继续用自己的 receipt / blocker / quality gate 关闭真实工作；OPL 只负责把这件事启动、记录、恢复、投影和审计清楚。

### Ordinary Progress Spine and Audit Sidecar

2026-06-09 以后，本目标架构增加一条更明确的分层约束：ordinary progress spine 和 audit sidecar 必须分开维护。

```text
ordinary_progress_spine
  current_owner_delta
  -> stage goal
  -> executor concrete delta
  -> ProgressDeltaReceipt / OwnerReceipt / TypedBlocker
  -> next current_owner_delta

audit_sidecar
  trace / refs / lineage / replay / restore / readiness inventory / long-soak / cleanup / production evidence
  -> drilldown / verification / recovery / delivery gate support
```

`ProgressDeltaReceipt` 是 ordinary step 的轻量接力记录，只证明 changed surfaces、produced refs、consumed refs、delta classification、next owner 和 next required delta。它不是 owner receipt、quality gate receipt、artifact mutation receipt、release receipt 或 production evidence receipt。

Stage Artifact Unit 按四层读取：

| Tier | 目标 | 进入默认路径的条件 |
| --- | --- | --- |
| `T0_progress_delta` | 让 ordinary executor 的写作、分析、证据整理、review 修订或平台修复可接力。 | 当前 owner delta 需要该变化；用 ProgressDeltaReceipt 表达。 |
| `T1_stage_transition` | Codex 选择下一 declared stage。 | 任意可读 artifact、诊断、阴性结果或真实 hard-stop evidence 可作为输入；格式与 receipt 缺口只形成质量债。 |
| `T2_delivery_artifact` | 交付 package、export、publication、submission 或 release。 | 对应 domain / App owner authority receipt、independent review 或 human gate 成立。 |
| `T3_production_evidence` | L5、long-soak、restore proof、cleanup、release cohort 和 no-regression。 | 显式 production evidence lane；只有当前 owner delta 或不可逆操作要求时升级。 |

Audit sidecar 的升级条件必须显式写出。缺 prompt / skill / tool / knowledge / rubric refs、trace、inventory、worklist、restore proof、long-soak、cleanup 或 L5 evidence 默认只形成 advisory / quality debt。只有错误目标 identity、安全/权限/authority、不可逆 mutation、publication/release/physical-delete action 或明确 human decision 才进入 hard stop。

DeepScientist / 旧 MDS 的流畅经验只能在这一层被吸收为 `single ordinary loop` 和 `few default gates`。它们不得重新成为 MAS 默认 backend、quality owner、artifact authority、OPL provider 或 Foundry Agent 顶层入口。

### Audit Standard

后续审计按下面标准判定“更符合预期”。

| 审计项 | 符合预期 | 不符合预期 |
| --- | --- | --- |
| `default_path` | CLI/App/operator 首屏从 `current_owner_delta` 回答 owner、delta、accepted answer shape、hard gate 和 next owner。 | 默认页先展示 raw worklist count、replay packet、typed blocker group、provider trace、route variants 或 ledger browser。 |
| `progress_truth` | 任意可读 physical output 可推进；质量债限制 accepted/ready/export/publication 声明。 | 把 schema、receipt、review 或 retry budget 缺口升级成 execution blocker，或把零输出的 provider completion包装成 progress。 |
| `mvp_friction` | 一次普通尝试能直接进入 stage attempt、产出 artifact delta 或明确 owner blocker。 | 系统在 receipt-only、read-model reconcile、platform repair、stale route redrive、diagnostic proof 或 evidence accounting 里循环。 |
| `authority_boundary` | OPL/App/Agent Lab 只做 transport、projection、guard、generated surface、work-order execution 和 refs-only audit；domain verdict 留给 MAS/MAG/RCA/OMA owner。 | OPL/App/doctor/schema/provider completion 机械替代 paper、grant、visual、agent patch 的质量、ready 或 artifact authority。 |
| `surface_budget` | 新 surface 只有在影响 launch safety、authority boundary、audit/replay/route-back，或被 App/runtime 反复消费时才进 default。 | 学习点、debug view、long-soak、cleanup、history 或 support repo detail 直接进入 ordinary user path。 |
| `golden_path` | 每个 Foundry Agent 只有一个 ordinary route；proof、diagnostic、cleanup、long-soak、variant 都显式 lane 化。 | route variant、proof lane、legacy helper 或 support wrapper 与 ordinary path 同级展示。 |
| `wrapper_retirement` | replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance 满足后删除或 tombstone。 | 为兼容、历史说明或“可能有用”继续保留 active facade、alias、wrapper、session/status shell 或 compatibility-only test。 |
| `app_cockpit` | App 默认只显示 purpose、task/stage、next owner、accepted answer shape、artifact/blocker、用户介入和 release/user-path facts。 | App 普通页暴露 backend/provider/permission/executor selector、raw ledger、full drilldown、shell candidate 或 upstream implementation detail。 |
| `evidence_ledger` | passive evidence ledger 记录一切，但只有 fold 成 owner delta、hard gate、owner answer 或 typed blocker 后影响 default planning。 | evidence 增长、typed blocker 聚合、replay ref 或 production tail count 直接生成默认下一步。 |

审计结论应拆成三类，不再混写：

- `meets_target`: 默认路径更短、owner 更清楚、artifact / receipt / blocker 更可接力，且没有新增默认面。
- `needs_demotion`: 功能有价值，但应降为 full-detail、diagnostic、audit、history、support 或 explicit lane。
- `needs_retirement`: 已被 generated/hosted surface、App contract 或 domain authority function 替代，应走删除 / tombstone gate。

不把 `tests passed`、`conformance passed`、`open_worklist=0`、`verified ledger`、`doctor clean` 或 `docs updated` 单独写成“更符合预期”。这些只证明机器门或文档门通过；最终判断仍看默认路径是否减少阻碍、owner delta 是否更清楚、真实 domain progress 是否回到正确 owner。

## Greenfield Target

如果从零设计，OPL family 应拆成 8 个稳定 primitive。

### 1. Agent Product Pack

每个 Foundry Agent 是一个产品包，而不是一个小平台：

```text
agent_product_pack
  identity
  ordinary_golden_path
  stages
  prompts
  skills
  tool_affordance_boundaries
  knowledge
  quality_gates
  artifact_contract
  memory_contract
  owner_answer_schema
  authority_functions
```

Domain repo 只持有领域语义、质量判断、artifact/memory authority、owner receipt/typed blocker signer、少量 native helper。它不持有 generic scheduler、queue、attempt ledger、session store、workbench、status shell、product-entry wrapper 或 evidence worklist planner。

### 2. Cognitive Computation Kernel

认知计算内核是 stage 内的执行策略空间，不是 OPL 的硬编码流程引擎：

```text
stage_goal + context + authority_boundary + available_affordances + quality_gate
  -> executor autonomous planning
  -> candidate generation
  -> grounded reflection / review
  -> comparative selection
  -> evolution / revision
  -> strategy retrospective proposal
  -> closeout packet for independent gate
```

OPL 只要求 stage pack 暴露可审计 refs：

- `prompt_refs`；
- `skill_refs`；
- `tool_refs` 与 `tool_affordance_boundary`；
- `knowledge_refs`；
- `rubric_refs` / `quality_gate_refs`；
- candidate pool / handoff / independent gate policy。

其中 `tool_affordance_boundary` 是关键：工具只声明能力、权限、凭据边界、可写范围、side effect 风险和 forbidden authority。它不规定 executor 必须怎么用、什么时候用、按什么顺序用，也不把工具用途写死成 prompt 外的流程约束。具体工具选择、组合、跳过、替代、并行和追问，交给 executor 在 attempt 内自主决定。

OPL 记录实际使用过的工具 refs、证据 refs、artifact refs、owner answer 和 blocker；不把这些记录反向升级成下一轮固定流程。

### 3. Stage Attempt Runtime

Stage 是 OPL Stage graph 中唯一默认领域工作单元；StageRun 是一次 durable 工单，StageAttempt 是该工单内一次上下文隔离的 executor 调用。Attempt Runtime 只负责：

- context：运输 stage id、owner、goal、可选 scope / input refs 与 selected executor；
- launch：生成 attempt request、绑定 provider 与 workspace root；
- execution envelope：给 Codex executor 清晰目标、材料、权限边界、可用 affordances、知识和质量门；
- progress：持久化任意可读 artifact、部分草稿、诊断、阴性结果、owner answer 或 route-back ref；
- replay/audit refs：只进入 audit plane。

Attempt Runtime 不负责生成候选、选择工具、评审、排序、修订或学习，也不负责决定医学结论、基金质量、视觉审美、agent patch 是否好。开放式专家判断继续由 executor + independent gate + domain owner 完成。

StageRun Kernel 不拥有语义 route、launch admission 或 closeout 格式授权。Codex 可以从 declared/requested stage、主提示词、workspace context 与任意可读 artifact 启动；packet、manifest、scope、receipt、review、lineage 与 capability binding 缺口只形成质量债。OPL 只在 identity 冲突可能写错目标、权限/安全/authority、不可逆动作或明确 human decision 时硬停。

### 4. Current Owner Delta Controller

OPL 默认 read model 的根对象是 `current_owner_delta`：

```text
current_owner_delta
  delta_id
  domain
  task_or_study_ref
  stage_ref
  lineage_ref
  source_fingerprint
  desired_delta_kind
  desired_delta_description
  current_owner
  accepted_answer_shape
  hard_gate
  advisory_warnings
  live_attempt_ref
  latest_owner_answer_ref
  audit_refs
```

Controller 只做 desired/current reconcile：

```text
desired current_owner_delta
  vs
actual queue / provider / attempt / artifact / owner-answer / typed-blocker state
```

它不从 raw evidence tail 合成新 work，不把 blocked envelope 数量变成 action，不把 receipt 增长写成 progress。

### 5. Codex CLI 单一语义路由面

Codex CLI 直接消费当前 stage 的可读 artifact、部分/阴性结果、review finding、owner/human answer 和非权威 route context，并选择下一 declared stage。它可以前进、跳过、重复、逆向或 route-back；retry/review/repair 次数只是质量预算。

OPL 只把终局 Codex Attempt 的 route decision 或 domain pack 已声明的默认 progression 运输成 StageRun request，记录 attempt/currentness/artifact refs，并被动投影 current pointer、terminal metadata 与 `current_owner_delta`。Framework 必须拒绝无终局资格、shape 非法、decision/recommendation 并存、legacy field、undeclared target 或无效 finding-closure 的 route output；但不按专业语义接受、拒绝、排名或改写 ABI 合法 route，也不要求 owner receipt 或 quality-gate receipt 才允许普通 stage progression，不保留 append-only transition authority/event-log 裁决面。

### 6. Stage Artifact Unit

每个 stage attempt 必须落成一个可重建单元：

```text
stage_artifact_unit
  physical_outputs
  manifest
  content_hashes
  owner_answer_ref
  current_pointer
  lineage
```

进度公式固定为：

```text
progress = any readable physical output
```

manifest、owner answer、hash、current pointer、reviewer 或 schema 缺口都作为质量债记录，只限制 accepted/quality/export/publication/ready 声明；零可读输出或损坏不可读同样物化为 progress diagnostic 并继续。只有 selected executor unavailable、硬 authority/safety/permission、wrong-target identity/currentness、不可逆动作或明确 human decision 才阻止实际执行。

### 7. passive evidence ledger

passive evidence ledger 是 passive audit store：

- raw evidence envelope；
- provider trace；
- replay packet；
- receipt ledger；
- typed blocker groups；
- production long-soak refs；
- no-regression refs；
- cleanup provenance；
- diagnostic logs / metrics。

Ledger 的原则是 `record everything, plan from nothing`。只有当 evidence 被 fold 成 `current_owner_delta`、hard gate、owner answer 或 typed blocker，它才影响默认路径。

### 8. App Cockpit

App 是 cockpit，不是 ledger browser。默认视图只展示：

- 当前任务；
- 当前 stage；
- 当前 owner；
- 缺什么 answer；
- 当前 artifact；
- 是否需要用户介入；
- provider 是否硬阻塞执行；
- 下一步 action 的 owner。

所有 raw count、full worklist、receipt group、replay packet、private residue inventory、route variants、provider internal traces 都必须通过显式 drilldown 查看。

## Target Runtime Flow

### Ordinary flow

```text
User chooses MAS/MAG/RCA/OMA purpose
  -> App/CLI loads agent_product_pack
  -> OPL selects ordinary_golden_path
  -> Stage Attempt Runtime admits next stage
  -> Current Owner Delta Controller emits one delta
  -> Temporal-backed provider starts Codex attempt
  -> Cognitive Computation Kernel runs inside selected executor
  -> Codex produces stage artifact unit
  -> Framework preserves any readable output as progress input
  -> Codex selects the next declared stage or route-back target
  -> Framework persists the next StageRun and passively projects current_owner_delta
```

### Blocked flow

```text
stage cannot launch
  -> classify blocker
  -> if launch-hard: provider/framework/human/domain owner action
  -> if domain judgment missing: domain-owned typed blocker
  -> if advisory: production backlog / audit lane
  -> never synthesize fallback verdict
```

### Anti-spin flow

```text
same lineage repeats receipt-only/platform-repair/read-model-reconcile
  -> record advisory diagnostic ref
  -> do not mutate launch, current pointer, or terminal state
  -> route fresh owner delta or stable typed blocker through existing authority
  -> do not append an authority event from the advisory alone
  -> move old attempts to audit lineage
```

### Improvement flow

```text
failed/blocked attempt
  -> Agent Lab reads artifact/receipt/audit refs
  -> OMA proposes work order or mechanism patch
  -> OPL work-order execute runs target patch
  -> target owner returns receipt/typed blocker
  -> no domain truth written by Agent Lab or OMA
```

## Default Golden Paths

### MAS

Ordinary path:

```text
study goal/source
  -> current paper/evidence/reviewer/human-gate delta
  -> Codex cognitive attempt with source/evidence/tool affordances
  -> manuscript/evidence/reviewer artifact delta
  -> MAS owner receipt or typed blocker
```

Non-default:

- historical dispatch refs；
- stale source repair；
- MDS/backend provenance；
- refs-only evidence envelope；
- full typed blocker group；
- platform read-model repair；
- long-soak/provider proof。

MAS 的最大重构点是：`domain_dispatch_evidence` 默认不再是 worklist root，只是 owner-delta 的 audit ref。默认只问：当前 study 有没有新的 paper/reviewer/human gate delta；没有就要 MAS stable typed blocker。MAS stage pack 应把医学 source、evidence、reviewer、统计/绘图 helper 等工具作为 affordance 边界暴露，让 executor 自主决定先读、先算、先写还是先请审稿。

### MAG

Ordinary path:

```text
selected grant target
  -> authoring/fundability/export/submission delta
  -> Codex cognitive attempt with writing/review/export affordances
  -> proposal/package/gate artifact
  -> MAG owner receipt or typed blocker
```

Non-default:

- funding rediscovery；
- grouped CLI internals；
- Hermes proof lane；
- manifest consumer long-soak；
- product-entry shell diagnostics。

MAG 的重构点是把 `submission_ready_export_gate` 设为 domain/human gate，而不是让 shell、manifest、proof lane 或 runtime-budget warning 抢占 authoring。MAG 不应把基金写作工具配置成固定流程，而应声明 authoring、fundability review、export、submission evidence 的 affordance 与 forbidden authority。

### RCA

Ordinary path:

```text
source truth
  -> image-first visual artifact stage
  -> Codex/RCA cognitive attempt with render/review/export affordances
  -> review/export gate
  -> RCA owner receipt or typed blocker
```

Non-default:

- HTML/native PPTX route；
- route alias hygiene；
- native helper diagnostics；
- visual long-soak；
- replay/human-review historical refs。

RCA 的重构点是单一 visual golden path：能产生可看的 artifact 是默认目标，route 多样性只服务显式需求。RCA 可以暴露 render、screenshot、native PPTX、review/export helper 等 affordance，但不把 visual strategy、工具顺序或版式探索写成 OPL 固定流程。

### OMA

Ordinary path:

```text
target agent evidence
  -> mechanism/candidate/work-order stage
  -> OMA cognitive attempt with reviewer/worktree/test affordances
  -> target owner answer
  -> receipt or typed blocker
```

Non-default:

- script materializer internals；
- reviewer pool orchestration；
- promotion gate；
- worktree lifecycle；
- second Agent Lab behavior。

OMA 的重构点是保持 target-agent generic vocabulary；它不成为第二 OPL Framework，也不直接关闭目标 domain owner receipt。OMA 只声明 agent-building、reviewer、worktree、test、patch proposal affordance 边界；机制选择和补丁构思继续交给 executor 与独立 reviewer。

## What To Remove From Default Design

这些面可以继续存在，但不属于 ordinary path：

| Surface | 目标处置 |
| --- | --- |
| Raw evidence envelope | passive evidence ledger / full drilldown。 |
| Full worklist | 从 `current_owner_delta` 派生的 secondary view；不作为 next-action root。 |
| Stage replay packet | Release/audit lane；只在阻断 launch/handoff 时进入 default blocker。 |
| Runtime budget / cohort / assumption warning | Production hardening backlog；除非影响启动安全或 provider liveness。 |
| Private platform residue inventory | Cleanup lane；不作为 agent progress。 |
| Default caller deletion evidence | No-resurrection guard；不作为 delivery progress。 |
| Provider scheduler status | Diagnostic query；provider liveness blocker 才进 default。 |
| Domain dispatch refs-only tail | Audit refs；默认只暴露 compact current owner delta。 |
| Receipt count / typed blocker count | Metric/audit；不作为 completion claim。 |
| Route variants / proof lanes | Explicit request only。 |

## Contract Support Categories

目标重构需要这些合同类别作为机器支撑；哪些已经落地、哪些仍是 gap，归 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md) 维护：

| Contract | 作用 |
| --- | --- |
| `current-owner-delta.schema.json` | 默认 owner/delta/hard-gate/action payload。 |
| `stage-artifact-unit.schema.json` | physical output 是 progress；manifest、owner answer、hash、pointer 与 lineage描述质量和可追溯性。 |
| `owner-answer.schema.json` | owner receipt / typed blocker / human decision / route-back 的统一 return shape。 |
| `evidence-ledger-event.schema.json` | audit-only evidence 分类和 bounded envelope。 |
| `golden-path-profile.schema.json` | 每个 Foundry Agent 的 ordinary path 与 explicit variants。 |
| `default-surface-budget.schema.json` | default / diagnostic / audit / production / cleanup 的升级门。 |
| `cognitive-computation-kernel.json` | stage 内认知计算层、tool affordance boundary、独立 quality gate 和 route/stage 分层边界。 |

这些合同不应复制 domain truth；它们只固定 OPL 能看见、能启动、能审计、能 fail-closed 的形状。

## Target Codebase Shape

理想 OPL Framework 代码分层应围绕 primitive，而不是围绕历史命令长文件：

```text
src/
  agent-product-pack/
  cognitive-computation-kernel/
  stage-attempt-runtime/
  owner-delta-controller/
  stage-artifact-kernel/
  evidence-ledger/
  app-cockpit-projection/
  generated-surfaces/
  provider-temporal/
  agent-lab/
  cli/
    commands as thin adapters
```

CLI、App、runtime tray、Agent Lab、safe action shell 都是 thin adapters。它们不各自判断 readiness，也不各自读取 raw state 拼结论。

Domain repo 理想形态继续是：

```text
domain-agent-repo/
  agent/
  contracts/
  runtime/authority_functions/
  runtime/native_helpers/
  docs/
  tests/
```

保留的 `src/` / `packages/` 只实现 domain handler、authority function、native helper、schema helper 或 fixture；任何 generic runtime/queue/session/workbench/status/product wrapper 都是迁移输入。

## Machine Contract Support

目标架构对应的机器面应以 contracts、source、CLI/read-model 和 tests 为准；本文只解释它们为什么存在、如何读取，以及为什么不能越权声明 domain ready / production ready / physical delete authorized。

当前目标架构的支撑合同组包括：

| Contract / policy | 支撑的目标边界 |
| --- | --- |
| `current-owner-delta.schema.json` | 默认 owner / delta / accepted answer shape / hard gate payload。 |
| `stage-artifact-progress-truth-policy.json` | 任意可读 physical output 都是 progress；其他缺口只形成质量债。 |
| `cognitive-computation-kernel.json` | stage 内认知计算、tool affordance boundary、knowledge refs 和 independent gate 的 refs-only 组织边界。 |
| `evidence-ledger-event.schema.json` | raw evidence、trace、replay、typed blocker group、long-soak 和 cleanup provenance 只作为 passive audit。 |
| `guardrail-tier-policy.json` | launch-hard、runtime-enforced、domain/human gate、audit-only 分级。 |
| `wrapper-retirement-gate-policy.json` | replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance 删除门。 |
| `golden-path-profile.schema.json` | 每个 Foundry Agent 的 single ordinary route 与 explicit variants。 |

`compact_owner_delta_projection` 已从 active/default surfaces 退役；旧名只允许出现在 history、tombstone 或 negative guard 语境。默认文档、App contract 和普通 CLI/App/operator summary 只消费 `current_owner_delta`；audit count 和 full-detail refs 进入显式 `current_owner_delta_read_model`。

## Migration Reading

迁移阶段只作为目标架构支撑，不再作为独立 active roadmap。当前执行顺序和 active-goal baton 回到 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。

| Phase | 当前读法 |
| --- | --- |
| Design target | 目标架构已冻结为 `OPL resource model + current_owner_delta + Cognitive Computation Kernel + Stage Artifact Unit + Passive passive evidence ledger + App Cockpit + Agent Lab improvement control plane`。 |
| Owner delta contract | 所有默认 read surface 应从同一 `current_owner_delta` 派生；raw worklist 不能覆盖 owner delta。 |
| Audit-plane passivity | raw evidence、stage replay、typed blocker group 和 private residue 只能在 fold 成 owner answer / typed blocker / hard gate / owner delta 后影响默认路径。 |
| Cognitive kernel | Stage pack 只声明 prompt / skill / tool affordance / knowledge / rubric / quality gate refs；工具目录不能变成 workflow script。 |
| Progress truth | 任意非空可读 artifact 都是 progress；质量债只限制质量与 ready 类声明。 |
| Golden path | MAS/MAG/RCA/OMA 每个 agent 只有一个 ordinary route；proof/diagnostic/cleanup/long-soak/variant 显式 lane 化。 |
| Generated surface / Domain Pack | Declarative Domain Pack 和 authority ABI 是新 Agent 默认形态；OPL pack compiler / generated interface bundle 可以生成 CLI/MCP/Skill/product-entry/OpenAI/AI SDK/status/workbench surface，但 generated ready 只能证明结构归位，不证明 domain ready。 |
| Surface budget compiler policy | 新 default surface 先按 `contracts/opl-framework/default-surface-budget.schema.json` 和 `surface-budget-policy.json` 分类；debug、history、telemetry、cleanup、proof lane 和 long-soak 只能作为 explicit lane，不能抢 ordinary path。 |
| Small reconcilers | Route、artifact、owner-delta、Atlas/Ledger telemetry 和 App Console reconciler 都只做 transport/currentness 与 refs-only 被动投影；不得接受、拒绝或覆盖 Codex route。 |
| App Console thinning | App 默认页只消费 `opl app state`、`current_owner_delta`、artifact/blocker summary 和 allowed action；full worklist、provider trace、ledger browser、route variants、private residue 和 replay packet 只在 explicit drilldown。 |
| Agent Lab loop | Agent Lab / OMA 只产出 improvement candidate、work order、mechanism proposal、risk gate、target owner receipt / typed blocker ref 或 follow-up；target owner 关闭真实 owner receipt。 |
| Wrapper retirement | Domain repo retained surface 逐项按删除门处理；OPL descriptor ready、conformance pass、generated surface visible 或 test pass 不授权跨仓删除。 |

## Acceptance Gate Categories

目标架构需要这些机器可验证门；当前 coverage、open tail 和 owner 归 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md) 与 repo-native test/contract 维护：

| Gate | 必须证明 |
| --- | --- |
| `default_owner_delta_derivation` | App fast state、framework readiness、evidence-worklist summary、runtime tray 同源。 |
| `no_worklist_root_planning` | raw worklist item 不能绕过 owner delta 进入 default next action。 |
| `lineage_no_progress_advisory` | 重复 lineage 只产生 audit/advisory refs；`canonical_admission_consumer=null` 时不得冻结默认 launch。 |
| `cognitive_kernel_executor_first` | stage strategy refs 不写死认知流程；executor 能自主规划、调工具、生成候选、反思、修订和追问。 |
| `tool_affordance_boundary` | 工具目录只标准化能力、权限、凭据、可写范围、side effect 和 forbidden authority；不能规定工具顺序、替代 executor 规划或授权 forbidden write。 |
| `stage_artifact_progress_truth` | 任意可读 output 可推进；manifest、receipt、pointer、hash 与 reviewer 缺口只产生质量债。 |
| `golden_path_single_default` | 每个 agent ordinary route 只有一个；variants 显式选择。 |
| `audit_plane_passive` | passive evidence ledger 写入不改变 delivery state，除非 fold 成 owner answer / hard gate / owner delta。 |
| `codex_single_semantic_route_owner` | Codex 可选择任意 declared stage；OPL 不存在 accept/reject/override route 的第二控制面。 |
| `route_not_stage_strategy` | Route reconciler 只 hydrate/reconcile owner route；候选生成、评估排序、stage completion、receipt signing 和 typed blocker creation 只能发生在 stage attempt / independent gate / domain owner 边界内。 |
| `audit_tail_cannot_plan` | raw evidence、replay packet、receipt ledger、typed blocker group 和 private residue inventory 只能作为 audit/detail refs；未折叠为 current owner delta / owner answer / typed blocker / hard gate 前不能生成默认计划。 |
| `guardrail_tier_policy` | launch-hard、runtime-enforced、domain/human gate、audit-only 分级稳定。 |
| `domain_no_generic_runtime` | domain repo 没有长期 generic scheduler/queue/session/workbench/status owner。 |
| `app_cockpit_boundary` | App 默认页不消费 raw envelope、full replay、private residue、provider internal trace。 |
| `no_false_ready_claim` | conformance/generated/provider/ledger/replay/test pass 都不能单独声明 domain ready 或 production ready。 |

## Risks

- `current_owner_delta` 若设计太大，会重新变成另一个 full worklist。它必须保持 compact，只承载默认决策需要的字段。
- Stop-loss 若没有 domain owner escape hatch，会误停真实可推进任务。它必须接受 fresh owner delta 或 stable typed blocker。
- Golden path 若过度单一路径，会压制 domain 正当变体。变体应保留，但必须显式选择并说明 owner。
- App cockpit 若完全隐藏 audit，会降低调试能力。解决方式是默认隐藏、显式 drilldown，而不是删除证据。
- Domain wrapper retirement 若只按文件名删除，会破坏 active caller。必须按 replacement parity 和 owner receipt 迁移。

## Non-Goals

- 不把 OPL 改成 domain quality owner。
- 不把 Codex executor 的开放式专家行为写成固定 workflow compiler。
- 不引入新的外部 runtime 作为第二 truth。
- 不让 App 持有 domain truth、artifact body、memory body、owner receipt 或 production verdict。
- 不把所有 audit evidence 删除；只是不让它们驱动 ordinary path。
- 不为了保持兼容而长期保留旧 wrapper、facade、alias 或 product shell。

## Design Decision

推荐方案是 `Cognitive Computation Kernel + Owner Delta Kernel + Stage Artifact Unit + Passive passive evidence ledger`。

与只修补现有 worklist 相比，它把默认推进根从 “还有多少 evidence item” 改成 “谁欠什么 owner delta”。与完全重写成通用 workflow engine 相比，它保留 OPL 的 AI-first / executor-first / contract-light / Codex-first 定位，让 stage 内认知计算继续由 executor 自主完成，让工具目录保持 affordance catalog，让 domain 专家判断继续由 independent gate 和 owner receipt 承接。

这也是最符合 MVP 的重构：少一个默认入口，多一个稳定 primitive；少暴露一层平台细节，多暴露一个可执行下一步；少一套工具流程标准，多一个安全可审计的工具 affordance 边界。

## Verification Boundary

本文是 target architecture 支撑，不维护一次性验证 transcript、外部 refresh
date 或执行流水。当前 coverage、open tail、repo-native verification 和
docs-lifecycle closeout 归 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)、
machine contracts/tests、live read-model 和 history/provenance。
