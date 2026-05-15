# OPL 与 Foundry Agents 理想目标态

Owner: `One Person Lab`
Purpose: `north_star_reference`
State: `active_support`
Machine boundary: 本文是人读目标态参考。机器可读真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace 与 App 证据。
Date: `2026-05-13`

## 结论

理想状态下，`OPL Framework` 是完整生产级智能体开发与运行框架。它负责把开发、运行、长时间在线、状态管理、记忆管理、文件生命周期、恢复、审计、质控投影和用户工作台连接成一套可复用 framework。MAS、MAG 与 RCA 理想目标态中提到的通用 runtime、queue、workspace/source intake shell、memory locator、artifact/package lifecycle、restore/retention、projection、workbench shell、route/decision visualization、review/repair transport、native-helper execution envelope 和 observability primitive，都应优先在这一层沉淀为 family-level 能力。

`MAS`、`MAG`、`RCA` 以及未来 Patent、Award、Thesis、Review 等 `Foundry Agents` 是基于 OPL Framework 开发的垂类智能体。它们持有领域知识、stage 语义、领域真相、质量 verdict 与交付 authority；它们复用 OPL 的运行外围能力，不重复维护 scheduler、queue、attempt ledger、workspace lifecycle、artifact index、memory locator、resume token、operator projection 这类通用模块。

换句话说，理想 Foundry Agent 是 `Domain Knowledge / Authority Pack + thin program surface`，不是自带一套运行平台。开发、运行、托管、恢复、排队、唤醒、状态机执行、工作区生命周期、文件生命周期、App/workbench 投影和跨 domain 审计都应由 OPL Framework / One Person Lab App 提供通用承载；Foundry Agent 只声明 stage 内需要做什么、如何判断质量、谁能写 truth、哪些 artifact 可变更、以及完成或阻塞时返回什么 receipt。这里的 thin program surface 包括 descriptor、contract/schema、sidecar/thin adapter、projection builder、domain transition spec/table、quality gate、artifact locator、receipt schema、tests 和 domain entry；它服务 OPL 发现、托管、审计和投影，不构成第二套 generic framework/runtime。

状态机也按这个边界拆分：OPL Framework 提供 generic state-machine engine，包括 transition schema、幂等 tick、attempt/retry/dead-letter、human gate transport、dispatch receipt、operator projection 和 transition matrix runner；Foundry Agents 提供 domain transition table / spec。OPL 可以验证和执行 domain 声明的 transition spec，但不能把 MAS 的 publication gate、MAG 的 fundability gate 或 RCA 的 visual/export gate 解释成 OPL 自己的 ready verdict。

`One Person Lab App` 是面向普通用户的桌面端或 Web 端工作台。它消费 OPL Framework 与 Foundry Agents 的投影，让用户看见任务、阶段、进度、阻塞、人类确认点、交付物和下一步动作。App 不持有 domain truth，也不复制 OPL runtime 或 domain runtime。

本文描述目标态，不替代当前状态判断。当前落地程度和剩余闭环以 [OPL 当前状态](../../status.md)、[OPL 架构](../../architecture.md)、[OPL Stage-Led Agent Framework Roadmap](./opl-stage-led-agent-framework-roadmap.md) 与 [OPL 生产级框架闭环差距矩阵](../../active/production-framework-closure-gap-matrix.md) 为准。

## 产品分层

目标产品认知保持三层：

1. `OPL Framework`
   开发者和技术操作者使用的完整智能体框架。它提供 CLI、module registry、domain-agent activation、stage control plane、typed queue、provider-backed runtime、state/index/cache primitives、memory locator、artifact/file lifecycle、operator projection、shared contracts、shared helpers 和验证门禁。
2. `Foundry Agents`
   垂类智能体产品线。每个 Agent 以 OPL-compatible repo / package 形态提供 descriptor、stage pack、prompt、Skill、knowledge refs、quality gates、sidecar、receipt schema、projection builder 与 artifact locator contract。领域逻辑、领域判断和最终交付真相归对应 Agent。
3. `One Person Lab App`
   用户工作台。它把 Framework 的 runtime truth 和 Foundry Agents 的 domain-owned projection 组织成可使用界面，包括工作区、任务、阶段、进度、交付物、人类确认点、恢复入口和关注队列。

目标链路如下：

```text
User / Codex / CLI / One Person Lab App
  -> OPL Framework
  -> explicit domain-agent activation
  -> stage control plane
  -> typed queue / provider-backed runtime
  -> selected Agent executor
  -> domain-owned stage pack
  -> domain-owned quality gate / truth reducer / artifact authority
```

## OPL Framework 的理想职责

OPL Framework 的长期职责是持有所有 domain-neutral、可跨垂类复用、服务长期自治和生产级恢复的外围能力。

### 开发与接入

- 提供 `opl framework locate`、module install/update、domain discovery、skill sync、contract validation、skeleton validation 和 package/release surface。
- 提供统一 `domain-agent skeleton`，让新 Agent 按稳定目录与 contract 暴露能力，而不是各自发明运行时入口。
- 提供 shared TypeScript / Python helpers，帮助 domain repo 生成 action catalog、stage descriptor、runtime supervision、memory locator、lifecycle ledger、owner route、receipt 和 projection。
- 提供统一测试与验证 lane：descriptor parity、direct skill parity、OPL-hosted path、no-forbidden-write proof、artifact locator proof、restore/provenance proof 和 closeout gate。

### 运行与长时间在线

- 以 `stage_attempt` 为生产运行单元，记录 attempt id、provider kind、workflow id、stage id、workspace locator、source fingerprint、retry budget、checkpoint refs、closeout refs、human gate refs 和 owner receipt refs。
- 使用 provider-backed runtime 承担 durable workflow、worker residency、activity retry/timeout、heartbeat、signal/query、history、dead-letter 和 restart recovery。生产在线目标由 Temporal-backed provider 承接。
- 把 `Codex CLI` 作为当前第一公民 Agent executor。非默认 executor 只能通过当前 canonical registry 显式接入并产生可审计 receipt；`hermes_agent` 和 `claude_code` 同属显式非默认 executor adapter/backend，不属于 provider、默认 executor、readiness path 或兼容 fallback，也不承诺与 `Codex CLI` 行为、质量、工具语义或 resume 等价。
- 支持 pause、resume、human gate、user instruction、stop、repair、retry、dead-letter 和 handoff；每个动作都必须留下 provider receipt 或 domain owner receipt。

### 状态管理

- 统一管理 session、stage attempt、queue item、checkpoint、closeout、progress、attention item、recent item、running item、blocked reason、freshness 和 operator action history。
- 状态投影面服务 CLI、App、TUI 和外部 shell；它们读取同一套 runtime truth。
- OPL 可以保存 control metadata、locator、source refs、receipt refs、freshness 和 repair hints；domain truth、quality verdict 和最终交付 authority 保持在 domain repo / workspace owner surface。

### 记忆管理

- OPL 持有 domain memory 的 locator、descriptor、freshness、migration plan ref、seed corpus ref、consumed memory refs、writeback proposal refs 与 writeback receipt refs。
- 记忆正文、写回接受/拒绝、route 判断、质量判断和最终 truth 由 domain agent 持有。
- 理想运行中，每个 stage 明确声明需要读取的 `knowledge_refs`、可提出的 writeback、写回 owner、验收 gate 和拒绝原因；OPL 只投影这些 refs 和 receipts。

### 文件生命周期

- OPL 持有 workspace registry、runtime artifact root locator、artifact index、retention policy、safe cleanup receipt、restore proof、migration ledger 和 provenance refs。
- 真实输入文件、中间产物、运行日志、receipt 实例、交付包、manuscript、grant package、PPT deck 等运行产物属于 workspace / runtime artifact root。
- domain repo 源码目录只放 source、contract、prompt、Skill、stage definition、quality gate、projection builder、tests、fixtures 和 docs；生产运行文件不写入开发目录。

### 通用能力上收

MAS、MAG 与 RCA 理想目标态进一步明确了一条适用于所有 Foundry Agents 的上收边界：domain agent 应成为 `Domain Knowledge / Authority Pack`，OPL Framework 应提供可复用的通用运行与产品外围。MAG 在这条边界上补充了 grant-specific 证据：funding/call intake、TODO/显式唤醒、grant strategy memory、submission-ready package、route/decision drilldown 和质量/导出投影都需要通用 transport 与 workbench 壳，但不能把 fundability、authoring quality 或 export verdict 交给 OPL。RCA 在这条边界上补充了 visual-deliverable 证据：source/workspace intake、artifact gallery、route/decision map、review/repair queue、export handoff、native helper execution 和 screenshot/export proof 都需要通用 envelope 与 workbench 壳，但不能把 visual direction、review verdict、export verdict 或 canonical artifact authority 交给 OPL。

| 通用能力 | OPL Framework 理想职责 | Domain Agent 理想职责 |
| --- | --- | --- |
| Provider-backed workflow | 提供 stage attempt、workflow id、query/signal、heartbeat、retry/dead-letter、restart recovery 和 provider receipt。 | 声明 stage、entry condition、allowed task、domain closeout、owner receipt 和 forbidden writes。 |
| State-machine runner / transition matrix | 提供 transition schema、幂等 tick、attempt/retry/dead-letter、human gate transport、dispatch receipt、operator projection 和 table-driven matrix runner。 | 声明 domain transition table、guard、owner、next work unit、domain action、fail-closed blocker、oracle fixtures 和 forbidden cross-owner writes。 |
| Queue / human gate transport | 提供 typed queue、approval transport、resume token、human gate signal、operator action ledger 和 handoff history。 | 给出 human gate 边界、resume/stop-loss 语义、domain blocker 和下一 owner。 |
| Workspace / source intake shell | 提供 workspace registry、source receipt、candidate/input pool、profile/call/material locator、intake handoff、missing-material attention item 和 provenance shell。 | 持有 funding/call 解释、profile 选择策略、study/grant/source truth、source readiness verdict、blocking/residual gap 和 go/no-go 或 refine 决策。 |
| Memory locator / index / writeback transport | 提供 memory descriptor discovery、locator/index、freshness、body-free inventory、consumed refs、writeback proposal/ref transport 和 App grouping。 | 持有 memory body、领域检索策略、接受/拒绝规则、writeback receipt、route/quality judgment。 |
| Artifact lifecycle / restore / retention | 提供 artifact locator、runtime artifact root registry、retention、safe cleanup、restore proof、migration ledger 和 lifecycle projection。 | 持有 canonical artifact authority、artifact mutation permission、package/export verdict 和 domain receipt。 |
| Package/export lifecycle shell | 提供 package locator、export attempt ledger、gap-report projection、delivery artifact index、artifact gallery、handoff packet navigation、restore/provenance proof 和 external-submission status shell。 | 持有 package readiness、submission/export verdict、visual/export verdict、portal/manual submission boundary 和 artifact content authority。 |
| Workbench shell / route visualization | 提供 workspace shell、attention queue、running/recent items、stage attempt drilldown、通用 route/decision graph renderer 和 action routing shell。 | 提供 domain-owned projection、route map nodes/edges、decision rationale、quality refs、artifact refs 和 typed action receipts。 |
| Quality / readiness projection shell | 提供 scorecard/closure-dossier/quality-ref 展示协议、freshness、AI-reviewer-currentness 状态和 operator drilldown。 | 持有 publication/fundability/visual/authoring quality verdict、AI reviewer artifact 和 hard-issue closure 判断。 |
| Review / repair transport | 提供 blocked item queue、repair target transport、rerun request envelope、human approval lane、repair receipt threading、screenshot/export proof locator 和 repair command projection。 | 持有 review verdict、blocked item 语义、repair decision、quality gate、ready/exportable/handoffable verdict。 |
| Native helper catalog / execution envelope | 提供 helper registration、environment/provisioning metadata、execution receipt、version/proof index、operator-safe launch envelope 和 helper artifact locator。 | 持有 domain helper implementation、helper-specific proof、artifact mutation logic 和 domain gate integration。 |
| Observability / diagnostics | 提供 trace/log/event transport、freshness/SLO projection、stale scan、repair command projection 和 operator drilldown。 | 提供 domain blocker、quality/source refs、runtime health facts、safe repair hint 和 authority boundary。 |

这类上收不表示 OPL 接管 domain truth。OPL 持有的是 transport、locator、index、projection、receipt refs 和 operator workflow；医学研究路线、基金策略、fundability、specific aims、视觉策略、visual direction、review/export verdict、质量 verdict、artifact/export authority、source readiness verdict 和 memory body 继续回到对应 domain owner。

### 仍需 OPL 层实现的目标能力

对照 MAS、MAG、RCA 的理想态与当前三仓 read model，OPL 后续应优先补齐下面这些 framework 能力，而不是让 domain repo 各自复制。更硬的规则是：同一份 canonical action/stage metadata 负责派生 CLI、MCP、Skill、product-entry 与 sidecar 的 descriptor / routing metadata；OPL 只做发现、投影和校验，不派生 domain handler，也不派生 domain truth：

- `state-machine runner`：OPL 已有 domain-neutral transition schema、runner、matrix runner、generic `family_transition_spec` manifest ingestion、MAG `grant_transition_oracle` ingestion、RCA `visual_transition_spec` ingestion 和 `family_transition_matrix_result` -> provider-hosted `family_transition/domain_tick` task bridge；后续继续补真实 tick loop、retry/dead-letter、human gate transport、dispatch receipt、MAS actual spec/cases 常态接入和 MAG/RCA adapter 的真实 owner receipt / no-regression evidence 对账。Domain repo 提供 transition spec 与 owner receipt；OPL 只执行、hydrate、审计和投影 spec，不解释医学发表、基金 fundability 或视觉 export ready。
- `provider SLO executor`：把当前 Temporal production proof / `operator_slo_repair_loop` 从 read-model 推进到周期性 supervised execution receipt、overdue repair receipt、restart/re-query/signal/history 长时证据。该能力只证明 provider residency，不证明 domain ready。
- `stage attempt activity bridge`：把 typed queue、provider attempt、sidecar dispatch、typed closeout、owner receipt refs、typed blocker、no-regression evidence refs 和 no-forbidden-write proof 做成跨 domain 的稳定 transport。
- `App workbench product shell`：把 workspace/source intake、route/decision graph、review/repair queue、artifact gallery、package/export lifecycle、memory locator、quality/readiness、observability/SLO 与 owner-aware action routing 做成 One Person Lab App 的通用工作台。
- `memory / artifact / lifecycle transport`：提供 body-free memory inventory、writeback proposal / receipt transport、runtime artifact root locator、retention / restore ledger、package/export shell 和 provenance drilldown。OPL 不保存 memory body、不接受/拒绝 writeback、不改 artifact、不下 export verdict。
- `physical skeleton / legacy retirement gate`：保持 read-only follow-through gate，并在 direct/hosted parity、replacement proof 和 provenance retention 齐备后指导 repo owner 做受控迁移或删除。

### 质控与审计

- OPL 提供 framework-level gate：stage closeout required-for-completion、receipt idempotency、conflict fail-closed、forbidden write protection、source fingerprint、attempt replay safety、direct/hosted parity 和 operator audit trail。
- Domain agent 提供 domain-level gate：publication quality、fundability、visual quality、submission/package readiness、artifact export verdict 和最终交付 authority。
- App 和 CLI 只展示证据、状态、owner、next action 与 refs；ready verdict 必须回到 domain-owned surface。

## Stage 是核心组织单元

理想的 OPL 运行逻辑以专家阶段 `stage` 为中心，而不是以单个工具调用、脚本节点或轻量 LLM message 为中心。每个 stage 都应接近真实专家完成复杂工作的一个阶段。

每个 stage 至少声明：

- `goal`：本阶段要完成的专家目标。
- `inputs`：输入材料、workspace locator、上游 handoff、用户约束、domain memory refs、artifact refs。
- `entry_conditions`：何时允许进入该阶段。
- `executor_requirements`：默认 `Codex CLI`，以及当前允许的显式 executor adapter 要求；退役 executor 名称只允许作为历史、诊断或负向 guard。
- `prompt_refs`：阶段提示词、审稿提示词、修复提示词、角色策略。
- `skill_refs`：Codex skill、domain skill、工具说明和可调用 surface。
- `knowledge_refs`：领域知识、记忆、文献、历史失败路径、参考 corpus。
- `tool_refs`：CLI、MCP、脚本、native helper、Office/PDF/browser 等可审计工具入口。
- `quality_gates`：domain-owned 质量 gate、review gate、export gate、publication / submission / deliverable gate。
- `outputs`：closeout packet、artifact delta refs、owner receipt refs、blocked reason、human gate refs、writeback proposal refs。
- `handoff`：下一 stage、next owner、resume token、用户确认点、stop rule。

OPL 负责 stage 的发现、排队、唤醒、恢复、投影和审计。Stage 内部的专家拆解、创作、分析、修订和质量判断由被选中的 Agent executor 与 domain-owned stage pack 完成。

## Foundry Agents 的理想职责

垂类 Agent 的目标是把领域专业性做好，把通用运行外围交给 OPL。它们保留 domain package 必需的薄程序面，但不承担 generic framework/runtime。

每个 Foundry Agent 应持有：

- 领域 `Domain Knowledge / Authority Pack`：领域 stage pack、路线/策略知识、quality rubric、memory policy、artifact authority contract、owner receipt schema 和 domain projection builder。
- 领域 ontology、任务类型、stage pack 和 route policy。
- 领域 prompt、Skill、tool policy、knowledge refs 和 memory writeback policy。
- 领域 truth reducer、quality gate、review gate、artifact/package authority。
- domain-owned sidecar export / dispatch surface。
- OPL-readable descriptor、receipt schema、projection builder、artifact locator contract 和 lifecycle adapter。
- domain transition spec/table、oracle fixture、owner action、typed blocker、focused tests 和 domain entry。
- Direct Codex skill path 与 OPL-hosted path 的语义等价证明。

每个 Foundry Agent 不需要重复维护：

- 独立 agent runtime framework 或通用运行平台。
- 长时间在线 runtime substrate。
- 通用 queue / retry / dead-letter / human gate transport。
- stage attempt ledger。
- generic state-machine runner / transition matrix runner。
- framework-level state cache 和 operator projection。
- workspace registry、artifact index、retention、restore proof 和 migration ledger 的通用实现。
- generic memory service、memory locator/index、body-free inventory projection 和 writeback transport。
- generic workspace/source intake shell、profile/call/material locator、source receipt provenance、missing-material attention item 和 intake handoff transport。
- generic workbench navigation、attention queue、running/recent items、route graph renderer、notification 和 cross-domain dashboard。
- generic package/export locator、gap-report projection、delivery artifact index、artifact gallery、handoff shell 和 external-submission status shell。
- generic review/repair transport、blocked item queue、repair target threading、screenshot/export proof locator 和 human approval lane。
- generic native helper catalog、execution envelope、version/proof index、helper artifact locator 和 operator-safe launch shell。
- generic observability transport、trace/log/event collection、freshness/SLO projection、stale scan 和 repair command projection。
- family-level skill sync、module install、contract discovery 和 App 投影协议。

目标 skeleton 如下：

```text
domain-agent-repo/
  agent/
    stages/
    prompts/
    skills/
    knowledge/
    quality_gates/
  contracts/
    domain_descriptor.json
    stage_control_plane.json
    action_catalog.json
    memory_descriptor.json
    artifact_locator_contract.json
    sidecar_export.schema.json
    sidecar_dispatch_receipt.schema.json
  runtime/
    sidecar/
    projection_builders/
    lifecycle_adapters/
  docs/
    project.md
    status.md
    architecture.md
    invariants.md
    decisions.md
```

该 skeleton 是 OPL 发现、托管、审计和投影所需的外部边界。OPL-facing skeleton 与 docs taxonomy 应在 MAS/MAG/RCA 以及后续 domain agents 之间保持一致；Domain 内部可以继续使用最适合自己的语言、包结构、数据格式和专业 workflow。

## 当前与未来 Agent 家族

| Agent 家族 | 理想 domain truth owner | 典型 stage | 最终 authority |
| --- | --- | --- | --- |
| `Research Foundry / MAS` | 医学研究设计、证据、分析、审稿、publication route、manuscript/package truth | study intake、evidence preparation、analysis campaign、manuscript authoring、AI reviewer、publication decision | MAS-owned publication / manuscript / package gate |
| `Grant Foundry / MAG` | 基金方向、fundability、specific aims、proposal strategy、review/rebuttal truth | call intake、fundability strategy、aims design、proposal authoring、review/revision、package gate | MAG-owned grant / submission readiness gate |
| `Presentation Foundry / RCA` | 视觉策略、叙事结构、PPT/图像/报告交付、review/export truth | source intake、communication strategy、visual direction、artifact creation、review/revision、handoff/export | RCA-owned visual quality / artifact export gate |
| `IP Foundry` | 专利交底、权利要求、实施例、检索和答复 truth | invention intake、prior art review、claim strategy、drafting、review/revision、filing package | Patent agent-owned patent package gate |
| `Award Foundry` | 科技奖材料、成果叙事、证明材料和评审口径 truth | award intake、evidence assembly、impact narrative、document drafting、review/revision、package gate | Award agent-owned award package gate |
| `Thesis Foundry` | 学位论文结构、章节、格式、答辩材料和学术合规 truth | thesis intake、chapter plan、writing、format/references、defense preparation | Thesis agent-owned thesis package gate |
| `Review Foundry` | 审稿、回复、修回策略和版本交付 truth | review intake、critique mapping、response strategy、revision drafting、final response package | Review agent-owned revision / response gate |

`MDS` 保持 MAS 声明的 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle reference；它不作为独立 Foundry Agent 进入 OPL 顶层产品线。

## Workspace 与运行文件边界

理想情况下，每次 domain Agent 运行都有明确 workspace。Workspace 是运行时真相和文件生命周期的承载点。

Workspace 应保存：

- 用户输入、原始资料、source refs 和 ingest receipts。
- 运行状态、stage attempt receipts、domain owner receipts、human gate receipts。
- 中间产物、分析结果、审稿意见、artifact deltas 和最终交付物。
- domain memory body、accepted/rejected writeback receipt、restore proof、retention receipt。
- App / CLI 需要展示的只读投影源。

Domain repo 应保存：

- 源码、contract、schema、prompt、Skill、stage definition、quality gate、projection builder、tests 和文档。
- 小型 fixture 或模拟数据，但必须与真实运行产物区分。

OPL 应保存：

- workspace locator、artifact locator、runtime root locator、attempt metadata、queue metadata、receipt refs、freshness、provenance refs、repair hints 和 operator projection。

这个边界能保证开发目录干净、可审查、可发布；运行文件有生命周期、可恢复、可清理、可迁移；用户工作和 domain truth 不被 framework 源码目录污染。

## One Person Lab App 的理想职责

One Person Lab App 面向用户，不面向 framework 内部实现。理想 App 应提供：

- `Agents`：展示已安装 Foundry Agents、能力范围、当前 readiness、可启动 stage 和 direct / hosted path。
- `Workspaces`：展示用户工作区、资料、运行状态、artifact root、recent activity 和 cleanup / restore 状态。
- `Sessions`：展示普通 Codex session、OPL-hosted stage attempt、resume token 和历史上下文。
- `Progress`：展示 stage、当前 owner、blocked reason、human gate、next action、freshness 和 quality refs。
- `Route / Decision`：展示 domain-owned route map、decision trail、分支、失败/阻塞原因、转向理由、superseded path、active/winning path、route node/edge 和 source refs。App 提供通用图形壳与 drilldown，不推断 domain route 或质量。
- `Review / Repair`：展示 domain-owned review verdict、blocked item、repair target、rerun request、human approval、repair receipt、screenshot/export proof 和 residual risk；App 只提供通用队列和 drilldown。
- `Artifacts`：展示交付物、artifact deltas、artifact gallery、package refs、export state、handoff packet、restore proof 和 provenance。
- `Attention Queue`：汇总需要用户确认、需要修复、需要等待 provider、需要 domain owner action 的事项。
- `Operator Drilldown`：在不越权写 domain truth 的前提下，展示 provider receipt、domain receipt、memory refs、artifact locator 和 repair command。

### 运行状态页 / Runtime Workbench 理想形态

理想的 OPL 运行状态页应是面向人的状态工作台，而不是巨大 raw snapshot 的直接渲染。它消费 `opl runtime snapshot`、family runtime provider、stage attempt ledger、domain-owned projection、workspace / artifact locator 和 source refs，把普通用户与操作者真正需要判断的状态放在第一屏。

第一屏应采用中文优先、dense、status-first 的工作台布局：顶部指标条展示整体健康、provider readiness、最后更新时间、数据 freshness、运行中数量、OPL 正在处理数量、需用户处理数量、后台恢复数量和近期项目数量；下面使用 segmented filter 或 tabs 按 lane 分组展示 `运行中`、`用户处理`、`OPL 正在处理`、`后台恢复` 与 `近期项目`。CLI 命令只作为 probe / debug / repair 证据留在详情层，不作为普通用户主操作面。

每个 runtime item 卡片应固定展示：

- Agent / domain、workspace、stage、active run、当前 owner、下一步动作、blocked reason、freshness 和状态来源。
- source refs、artifact refs、portal / workbench 链接、artifact/package/export 状态，以及可打开的 workspace 或交付物入口。
- owner-aware action：用户确认、provider signal、OPL repair、domain sidecar / direct skill / product entry action 必须分清 owner；不可把按钮做成无 owner 的通用“继续”或“修复”。

Stage attempt drilldown 应展示 attempt id、provider kind、workflow / activity 状态、heartbeat、checkpoint refs、closeout refs、receipt refs、human gate refs、dead-letter、resume refs、rejected writes、route impact、provider completion 与 domain ready verdict 的区别。Provider completion 只能说明 transport / workflow 完成，不能写成 domain readiness、quality verdict 或 artifact/export readiness。

Domain agent drilldown 应按 MAS / MAG / RCA 以及后续 Foundry Agents 展示 domain-owned projection：质量 / publication / fundability / visual / export verdict、domain route、review / repair queue、artifact authority、receipt refs 和可执行 action。OPL App 只展示投影、路由、owner、source refs 和 action transport；不持有或改写 domain truth，不替代 domain-owned ready verdict。

基础设施与恢复面板应展示 provider、queue、worker、native helpers、module install 状态、dirty / ahead / behind 开发状态、repair command、latest proof、SLO / freshness 和 degraded reason。开发状态应作为诊断信息展示，不应在没有 install / update / repair action 时误导为不可用或必须更新。

详情层默认折叠 raw refs、命令、JSON pointer、payload 摘要和 schema refs，只在开发者详情或操作者 drilldown 中展开。普通用户优先看到当前状态、原因、谁负责、下一步和可安全点击的动作；操作者可以继续下钻到 receipt、source ref、repair command 与 provider/domain 边界。

App 中的按钮和动作必须路由到明确 owner：

- framework-level 动作走 OPL CLI / Runtime Manager。
- provider-level 动作走 family runtime provider signal / query / repair。
- domain-level 动作走 domain sidecar / direct skill / domain CLI / domain product entry。
- quality verdict、publication verdict、fundability verdict、visual verdict、artifact authority 回到 domain-owned gate。

## 新垂类 Agent 的开发路径

理想开发者体验如下：

1. 创建 OPL-compatible domain repo / package。
2. 声明 `domain_descriptor`、stage control plane、action catalog、memory descriptor、artifact locator contract 和 authority boundary。
3. 编写 `agent/stages`、prompts、skills、knowledge refs 与 quality gates。
4. 实现 domain sidecar export / dispatch receipt 和 projection builder。
5. 定义 workspace/runtime artifact root 策略、retention policy、restore proof 和 no-forbidden-write rule。
6. 运行 OPL skeleton validation、contract validation、direct skill parity、OPL-hosted dry run、controlled apply、closeout gate 和 artifact locator proof。
7. 让 OPL Framework 安装、发现、托管、唤醒、投影和恢复该 Agent。
8. 让 One Person Lab App 以同一套 projection 显示该 Agent。

开发者主要维护领域专业内容和质量边界；OPL 提供可复用的生产运行外围。

## 理想完成门槛

OPL 与 Foundry Agents 达到理想生产级状态时，应满足以下门槛：

- OPL production provider 长期 ready：service、worker、query/signal、retry/dead-letter、restart recovery、operator repair 都有持续证据。
- OPL generic state-machine runner 可消费 MAS/MAG/RCA 声明的 domain transition table / spec，并用 matrix runner 验证输入状态组合到 route/work-unit/action/receipt 的转换；sidecar/export 返回的 matrix result 可进入 provider-hosted transition task；OPL 不持有 domain gate 语义。
- 每个 admitted Agent 同时通过 direct Codex skill path 与 OPL-hosted path，并留下语义等价和 no-regression evidence。
- 每个 stage attempt 都有 typed closeout、checkpoint、owner receipt、blocked reason 或 human gate receipt。
- OPL 只持 refs、locator、metadata 和 projection；domain truth、quality verdict 和 artifact authority 留在 domain owner。
- Memory retrieval、writeback proposal、accepted/rejected receipt 和 migration plan 在三仓以上泛化。
- File lifecycle、retention、safe cleanup、restore proof 和 migration ledger 在 workspace/runtime root 上可运行。
- Source/workspace envelope、artifact gallery、route/decision graph、review/repair transport、native-helper execution envelope 和 observability projection 在 MAS/MAG/RCA 之间泛化，同时保持 domain-owned verdict。
- App 能展示用户关心的状态和动作来源，不把 provider completion 写成 domain ready verdict。
- Domain repo 不写入真实 runtime artifacts；运行文件全部进入 workspace / runtime artifact root。
- 旧 Hermes-first、Gateway/frontdoor、local manager、MDS-default 等历史默认面完成 active-path 退役；active surface 不保留兼容接口，旧名称只在 diagnostic、fixture、provenance、history 或负向 guard 语境保留。

## 当前使用方式

本文适合作为新增垂类 Agent、规划 OPL production closure、设计 App runtime workbench、评估 shared module 上收范围时的目标态参考。MAS/MAG/RCA 的单仓理想态和仓内完善计划由对应 domain repo 自己维护；OPL 只保留 framework-level 上收边界、shared primitives、domain admission 和 App/workbench 目标。

实际实施时按当前状态递进：

- 当前 truth 读核心五件套。
- 当前闭环差距读 production gap matrix。
- Runtime/provider 执行路线读 stage-led roadmap 和 Temporal plan。
- Domain-specific truth 回到 MAS/MAG/RCA 各自仓库。
- 新增机器接口写入 `contracts/`、源码、CLI/API 行为或 domain-owned manifest，不写入本文。
