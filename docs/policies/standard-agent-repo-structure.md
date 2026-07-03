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
│  ├─ principles/
│  │  ├─ opl-standard-agent-principles.md
│  │  └─ domain-specialization.md
│  ├─ prompts/
│  ├─ stages/
│  ├─ skills/
│  ├─ tools/
│  ├─ knowledge/
│  └─ quality_gates/
├─ contracts/
│  ├─ domain_descriptor.json
│  ├─ pack_compiler_input.json
│  ├─ stage_control_plane.json
│  ├─ action_catalog.json
│  ├─ generated_surface_handoff.json
│  ├─ memory_descriptor.json
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
| `agent/principles/` | 采用 OPL 标准原则，并说明本领域如何特化。 | 不声明 domain ready、production ready 或 owner acceptance。 |
| `agent/prompts/` | Stage 主提示词。定义目标、输入、输出、证据门槛、route-back 和可用能力。 | 不承接完整专业方法库，不签 owner receipt。 |
| `agent/stages/` | Stage policy / stage contract 的人读或半结构化源。 | 不替代 runtime transition、queue 或 provider attempt ledger。 |
| `agent/skills/` | 内置 professional specialist skill 或领域专业 playbook。 | 不决定 stage 是否完成，不签 quality / export verdict。 |
| `agent/tools/` | Tool affordance catalog：资源、工具、连接器、权限、写范围、side effect 和 forbidden authority。 | 不写成硬编码 workflow，不承接专业判断。 |
| `agent/knowledge/` | 领域知识、source semantics、memory locator policy 和 reference refs。 | 不复制 runtime memory body，不成为第二 truth store。 |
| `agent/quality_gates/` | 审稿、交付、导出、owner review 等质量门规则和 receipt shape。 | 不让 OPL 代签领域质量结论。 |
| `contracts/` | 机器可读连接层，固定 pack、stage、action、surface、receipt 和 authority boundary。 | 不承载长篇叙事，不替代真实 owner evidence。 |
| `runtime/authority_functions/` | 最小领域 authority functions 或其声明源。 | 不实现 generic scheduler、queue、attempt ledger、status/workbench shell。 |
| `docs/` | 当前读法、架构、状态、决策和迁移说明。 | 不作为机器 truth，不替代 contracts/source/tests/readback。 |

## Stage 内部连接方式

每个 Stage 内的 Skill、工具、数据库、知识库和记忆，逻辑上都先落成 refs，再由 `contracts/stage_control_plane.json` 连接：

```text
stage_id
├─ prompt_refs          -> agent/prompts/*
├─ stage_policy_refs    -> agent/stages/*
├─ skill_refs           -> agent/skills/* 或同步到 workspace 的 professional skill
├─ tool_refs            -> agent/tools/* 或 OPL Connect / Fabric connector descriptor
├─ knowledge_refs       -> agent/knowledge/*
├─ quality_gate_refs    -> agent/quality_gates/*
├─ expected_receipt_refs
├─ owner_receipt_schema_refs
├─ typed_blocker / human_gate / route_back refs
└─ stage_completion_policy
```

物理上有三层：

1. **Repo source 层**：domain repo 的 `agent/` 和 `contracts/` 是可审阅单源。这里存 Stage 主提示词、专业 Skill、工具 affordance、知识和质量门。
2. **OPL 生成 / 托管层**：OPL Pack / Stagecraft / Connect 根据合同生成 CLI、MCP、Skill descriptor、OpenAI / AI SDK tool descriptor、App projection、workspace projection 和 conformance readback。
3. **Workspace 执行层**：Codex、App 或 hosted runner 消费投影后的 prompt、skill、tool descriptor 和 refs。`.codex/skills/` 是 workspace / quest-local execution projection，不是 domain repo 的 canonical source。

因此，“Stage 内可以用哪些能力”不是靠把所有文本塞进一个提示词解决，而是靠 Stage 主提示词引用稳定能力面：内置专业 Skill、外置 professional pack、OPL Connect connector、知识 refs、质量门和 receipt shape。AI executor 在 Stage 内做开放式判断；合同只负责边界、证据和接力。

## 能力归位

能力先按用途分类，再决定物理位置：

| capability kind | 默认位置 | 何时外置 |
| --- | --- | --- |
| `stage_prompt` | domain repo `agent/prompts/` / `agent/stages/` | 默认不外置。 |
| `professional_skill` | domain repo `agent/skills/` | 体量大、跨 stage 高频、需要独立版本和 workspace-local Codex discovery 时外置。 |
| `tool_connector` | OPL Connect / Fabric；未稳定前可留 domain repo | 稳定资源访问能力应逐步收归 Connect / Fabric。 |
| `reference_pack` | domain repo 或专业能力包 | 大体量模板、rubric、gallery、样例和脚本可外置。 |
| `contract_module` | owning repo `contracts/` | 不伪装成 true Skill。 |
| `runtime_projection` | OPL Framework / App / hosted surface | 不写 domain truth。 |

外置是维护选择，不是成熟标志。只要能力是某个 domain agent 的高耦合核心判断，先内置；当它变成大体量、高频复用、独立版本或多 stage 共用能力，再外置为 professional pack，并通过 OPL Connect 同步到 workspace / quest。

## OMA 生成新智能体的边界

OMA 生成 target agent 时不维护私有目录标准。正确链路是：

```text
OMA stage-decomposition / agent-building semantics
  -> OPL agents scaffold 生成标准目录
  -> OMA 写入领域 pack refs / candidate package refs
  -> OPL agents scaffold --validate
  -> OPL agents interfaces 生成统一接口
  -> Agent Lab / reviewer / owner gate 收口
```

OMA 负责 agent-building 语义、stage decomposition、candidate package、developer work order、mechanism proposal 和 typed blocker。OPL Framework 负责 scaffold、conformance、generated interfaces、Agent Lab、runtime 和 workspace projection。目标 agent 负责自己的 domain truth、artifact body、quality verdict、owner receipt、typed blocker 和 human gate。

## 迁移口径

1. 先保证 repo source 结构完整：`agent/`、`contracts/`、`runtime/`、`docs/` 都存在，并由 `pack_compiler_input.json` 指向真实非 README 文件。
2. 再补 Stage 内资源连接：每个 stage 都要能解析 prompt、skill、tool、knowledge 和 quality gate refs。
3. 再推进 Stage Pack v2：补 plane version、standard pack ABI、tool affordance boundary、receipt schema refs、authority function refs、L4 / L5 entry gate、independent gate 和 stage completion policy。
4. 最后处理外置能力包：只有高频、重型、跨 stage 或需要独立发布的 professional skill / reference pack 才外置。

通过结构 conformance 只说明目录和合同可消费，不说明 live domain progress、domain ready、production ready、quality / export ready、App release ready 或 owner accepted。
