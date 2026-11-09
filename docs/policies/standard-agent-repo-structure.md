# OPL 标准智能体 Repo 结构规范

Owner: `One Person Lab`
Purpose: `standard_agent_repo_structure_policy`
State: `active_policy`
Machine boundary: 本文是人读结构规范。机器检查继续归 `contracts/`、scaffold / conformance source、CLI JSON readback、domain-owned contracts、owner receipt 和真实 workspace evidence。

## 结论

标准 OPL 智能体 repo 的理想形态是：

```text
Declarative Domain Pack
+ OPL generated / hosted surfaces
+ minimal authority functions
```

Domain repo 持有阶段语义、专业能力、知识、质量门和最小领域 authority。OPL Framework 持有 scaffold、pack compiler、generated interfaces、runtime transition、workspace shell、readback projection 和 conformance。二者通过机器合同连接，不通过 README、聊天上下文或隐藏脚本连接。

## 标准目录

```text
<agent-repo>/
├─ agent/
│  ├─ primary_skill/
│  │  └─ SKILL.md                 # required, repo-owned rich default Codex entry source
│  ├─ principles/
│  │  ├─ opl-standard-agent-principles.md
│  │  └─ domain-specialization.md
│  ├─ prompts/
│  ├─ stages/
│  │  └─ manifest.json              # required declarative stage graph source
│  ├─ skills/
│  ├─ professional_skills/        # optional, for repo-local Codex-style specialist skills
│  ├─ tools/
│  ├─ knowledge/
│  └─ quality_gates/
├─ contracts/
│  ├─ domain_descriptor.json
│  ├─ pack_compiler_input.json
│  ├─ action_catalog.json
│  ├─ generated_surface_handoff.json
│  ├─ durable_knowledge_catalog.json
│  ├─ artifact_locator_contract.json
│  ├─ owner_receipt_contract.json
│  ├─ foundry_agent_series.json
│  └─ standard-agent-principles-adoption.json
├─ runtime/
│  └─ authority_functions/
├─ docs/
└─ tests/ 或 repo-native verification entry
```

目录语义：

| 路径 | 角色 | 不能承担的职责 |
| --- | --- | --- |
| `agent/primary_skill/SKILL.md` | 标准 OPL Agent 必需的 rich primary Skill 源。它是 Codex 默认入口的 repo-owned 单源，由 OPL materializer 生成标准 Codex plugin carrier。 | 不写 owner receipt、typed blocker、quality / export verdict、domain ready 或 production ready；不承接专业 Skill 全库。 |
| `agent/principles/` | 采用 OPL 标准原则，并说明本领域如何特化。 | 不声明 domain ready、production ready 或 owner acceptance。 |
| `agent/prompts/` | Stage 主提示词。定义目标、输入、输出、证据门槛、route-back 和可用能力。 | 不承接完整专业方法库，不签 owner receipt。 |
| `agent/stages/` | Stage policy 与 required `manifest.json` 的 repo-owned source；manifest 声明 stage identity、refs、actions、transitions、trust lane 与 authority boundary。 | 不保存 OPL generated control plane，不替代 runtime transition、queue 或 provider attempt ledger。 |
| `agent/skills/` | Domain skill declarations、stage 可引用的领域 playbook 或 OPL/generated skill surface 输入。 | 不作为 Codex-style 专业 Skill pack；不决定 stage 是否完成，不签 quality / export verdict。 |
| `agent/professional_skills/<skill-id>/SKILL.md` | Repo-local Codex-style 专业方法 Skill。承载可独立发现/调用的专家 playbook、rubric、审查 lens 和 route-back 方法。 | 不写 runtime wrapper、target artifact、owner receipt、typed blocker、quality verdict、promotion state 或 domain truth。 |
| `agent/tools/` | Tool affordance catalog：资源、工具、连接器、权限、写范围、side effect 和 forbidden authority。 | 不写成硬编码 workflow，不承接专业判断。 |
| `agent/knowledge/` | Agent 包内可跨项目复用的稳定领域知识正文，例如金融机制、研究方法、期刊偏好和交易规则。 | 不保存当前账户、价格、项目事实或 runtime memory body；语义正文仍由领域 owner 维护。 |
| `agent/quality_gates/` | 审稿、交付、导出、owner review 等质量门规则和 receipt shape。 | 不让 OPL 代签领域质量结论。 |
| `contracts/` | 机器可读连接层，固定 pack、stage、action、surface、receipt 和 authority boundary。 | 不承载长篇叙事，不替代真实 owner evidence。 |
| `runtime/authority_functions/` | 最小领域 authority functions 或其声明源。 | 不实现 generic scheduler、queue、attempt ledger、status/workbench shell。 |
| `docs/` | 当前读法、架构、状态、决策和必要操作说明。 | 不作为机器 truth，不替代 contracts/source/tests/readback，不保存完成流水或迁移档案。 |

## Stage 内部连接方式

脚手架同时生成 `contracts/stage_quality_cycle_policy.json` 与领域角色提示，并在
每个 starter Stage 绑定启用的 policy。正式输入产物与 StageRun 身份依赖这个运行
绑定；只有 manifest 而没有 policy 的目录不能据结构检查宣称已可执行。独立 Review
是否必需由领域 owner 按实际风险决定，starter 使用 primary-only 模式。

每个 Stage 内的 Skill、工具、数据库、知识库和记忆，逻辑上都先落成 refs，再由 `agent/stages/manifest.json` 连接；OPL Pack 将其编译为 generated `family_stage_control_plane`：

```text
stage_id
├─ prompt_refs          -> agent/prompts/*
├─ stage_policy_refs    -> agent/stages/*
├─ domain_skill_refs    -> agent/skills/*
├─ professional_skill_refs -> agent/professional_skills/*/SKILL.md 或同步到 workspace 的 professional skill
├─ tool_refs            -> agent/tools/* 或 OPL Connect / Fabric connector descriptor
├─ knowledge_refs       -> agent/knowledge/*，并由 contracts/durable_knowledge_catalog.json 登记生命周期
├─ quality_gate_refs    -> agent/quality_gates/*
├─ expected_receipt_refs
├─ owner_receipt_schema_refs
├─ typed_blocker / human_gate / route_back refs
└─ stage_completion_policy
```

物理上有三层：

1. **Repo source 层**：domain repo 的 `agent/` 和 `contracts/` 是可审阅单源。这里存 declarative stage manifest、Stage 主提示词、专业 Skill、工具 affordance、知识和质量门；不提交第二份 generated stage plane。
2. **OPL 生成 / 托管层**：OPL Pack / Stagecraft / Connect 根据合同与 `agent/stages/manifest.json` 生成 `family_stage_control_plane`、CLI、MCP、Skill descriptor、OpenAI / AI SDK tool descriptor、App projection、workspace projection 和 conformance readback；Codex App carrier 由 `agent/primary_skill/SKILL.md` 物化为 owner Package 的 Codex plugin。
3. **Workspace 执行层**：Codex、App 或 hosted runner 消费投影后的 prompt、skill、tool descriptor 和 refs。`.agents/skills/` 是 workspace / quest-local Codex discovery projection，不是 domain repo 的 canonical source；`.codex/` 仅保留 OPL 的配置、owner、manifest 和 transaction 元数据。

知识正文的归属、来源与生命周期由[知识来源与记忆政策](./knowledge-source-and-memory-policy.md)统一定义，机器字段见 [durable knowledge lifecycle](../../contracts/opl-framework/durable-knowledge-lifecycle-contract.json)。产品知识由 `contracts/durable_knowledge_catalog.json` 登记；用户、主题和项目知识通过获授权的来源绑定接入，同一模型支持个人资料库、普通工作目录与混合来源。知识 scope 不由目录前缀决定。

StageRun 为 producer、reviewer、repairer 和 re-reviewer 固定同一份私有正文快照。静态 `knowledge_refs` 只表达编写关联，不绕过 catalog、来源权限和有效性直接注入正文；`skills` 仍按不可变 managed content 绑定。公开状态只投影召回回执和快照引用。必要知识与可选知识的缺口处理遵守领域任务声明。

因此，“Stage 内可以用哪些能力”不是靠把所有文本塞进一个提示词解决，而是靠 Stage 主提示词引用稳定能力面：domain skill declarations、repo-local professional Skill、外置 professional pack、OPL Connect connector、知识 refs、质量门和 receipt shape。AI executor 在 Stage 内做开放式判断；合同只负责边界、证据和接力。

## 能力归位

能力先按用途分类，再决定物理位置：

| capability kind | 默认位置 | 何时外置 |
| --- | --- | --- |
| `primary_skill` | domain repo `agent/primary_skill/SKILL.md` | 不外置。它是标准 agent 的必需入口源；外部 carrier 只能由 OPL materializer 生成。 |
| `stage_prompt` | domain repo `agent/prompts/` / `agent/stages/` | 默认不外置。 |
| `domain_skill_declaration` | domain repo `agent/skills/` | 默认不外置；由 OPL generated surface 或 stage control plane 消费。 |
| `professional_skill` | domain repo `agent/professional_skills/<skill-id>/SKILL.md`，或同等标准 Codex Skill 目录 | 体量大、跨 stage 高频、需要独立版本和 workspace-local Codex discovery 时外置。 |
| `tool_connector` | OPL Connect / Fabric；未稳定前可留 domain repo | 稳定资源访问能力应逐步收归 Connect / Fabric。 |
| `reference_pack` | domain repo 或专业能力包 | 大体量模板、rubric、gallery、样例和脚本可外置。 |
| `contract_module` | owning repo `contracts/` | 不伪装成 true Skill。 |
| `runtime_projection` | OPL Framework / App / hosted surface | 不写 domain truth。 |

外置是维护选择，不是成熟标志。只要能力是某个 domain agent 的高耦合核心判断，先内置；当它变成大体量、高频复用、独立版本或多 stage 共用能力，再外置为 professional pack，并通过 OPL Connect 同步到 workspace / quest。

## OMA 生成新智能体的边界

OMA 生成 target agent 时不维护私有目录标准。正确链路是：

```text
OMA stage-decomposition / agent-building semantics
  -> OPL Pack scaffold API 生成标准目录
  -> OMA 返回 AgentBlueprint / EvalSpec 语义
  -> OPL Pack scaffold API --validate
  -> OPL agents interfaces 生成统一接口
  -> Foundry Kernel / reviewer / owner gate 收口
```

OMA 负责目标理解、设计依据、`AgentBlueprint` / `EvalSpec`、证据诊断和 `EvolutionProposal`。OPL Framework 负责 Pack scaffold/conformance、generated interfaces、FoundryRun、物化、评测、证据、版本、canary、activation、rollback 和 workspace projection。目标 agent/owner 负责自己的 domain truth、保护测试、artifact body、quality verdict、owner receipt、human gate 与生产采用。

蓝图必须说明所需知识的归属、内容性质、来源模式、必要性与写回负责人。 既有业务系统记录、设备状态、患者事实和执行配置仍由各自 owner 持有；薄知识消费者无需为接入而改造成 Standard Agent。OMA 声明语义需求，获授权的运行控制面建立具体来源绑定；它不为每个新 Agent 另建个人正文库，也不通过蓝图授予私人目录访问权。

## 准入口径

1. repo source 必须具备 `agent/`、`contracts/`、`runtime/` 和 `docs/`，`pack_compiler_input.json` 只能指向真实 source，不得用 README 占位。
2. 每个 Stage 必须能解析自己的 prompt、skill、tool、knowledge、quality gate、receipt 和 authority function refs，并通过当前 Stage Pack contract。
3. generated/hosted surface 必须从同一 declarative source 产生，standalone 与 hosted caller 都不能回到 repo-local generic runtime。
4. professional skill / reference pack 只有在真实多 Stage 或跨仓 consumer、独立 owner 或独立发布节奏存在时才外置。

目录语义是稳定边界，不随命名偏好移动：`agent/primary_skill/SKILL.md` 表示标准 agent 的 rich default Codex entry source；`agent/skills/` 表示 domain pack 内的 skill declaration / generated-surface 输入；`agent/professional_skills/<skill-id>/SKILL.md` 表示 Codex-style 一等专业方法 Skill。若某个 repo 暂时采用等价目录，必须在 `contracts/capability_map.json` 中声明 `capability_kind`、canonical source 和 runtime projection，并保证不会降低 Codex discovery 或 OPL sync 能力。

通过结构 conformance 只说明目录和合同可消费，不说明 live domain progress、domain ready、production ready、quality / export ready、App release ready 或 owner accepted。

### 知识写入与治理

领域仓只维护自己的产品正文和语义规则。个人及项目正文通过来源登记直接读取；工作区保存绑定、任务产物、修订提案和回执，不要求中间全文副本。项目根与调用者范围来自已授权 execution scope，普通请求不能自行带入另一个项目或用户的私有目录。

直接 Skill 与托管 Stage 共用 Framework 的知识快照接口。`opl knowledge prepare` 建立新的私有绑定，`opl knowledge read-context` 读取绑定正文；普通 list、inspect、recall 只输出目录或回执。操作入口见[知识来源接口](../specs/knowledge-sources.md)，具体字段与命令以 `opl help` 和知识合同为准。接受、并发修订、派生失效、撤权和保留规则只由[知识来源与记忆政策](./knowledge-source-and-memory-policy.md)维护。 邮件等业务证据经领域语义判断后才进入个人或项目知识；领域数据库和可重建索引不成为另一份个人来源 registry。新知识在既有授权来源登记，注册正文的修订使用共同写回链；provenance 和批准记录留在控制面，正文沿用用户资料库格式。
