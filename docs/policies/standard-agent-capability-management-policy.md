# OPL 标准智能体能力管理规范

Owner: `One Person Lab`
Purpose: `standard_agent_capability_management_policy`
State: `active_policy`
Machine boundary: 本文是 OPL family 维护者的人读规范，用来统一能力分层、外置判断、同步边界和 no-authority 口径。机器真相仍归 contracts、source、CLI/API readback、runtime ledger、domain-owned manifest、owner receipt 和真实 workspace / App evidence。

## 适用范围

本文适用于 OPL 标准智能体及其专业能力包、连接器、reference pack、contract module 和 runtime projection 的命名与归属判断。它不把每个能力硬编码成 machine contract，也不替代 MAS/MAG/RCA/OMA/OBF/ScholarSkills 等 owner repo 的 domain truth。

新增、拆分、外置或同步能力时，维护者必须声明：

| 字段 | 含义 |
| --- | --- |
| `capability_kind` | 能力类型，只能使用本文定义的类型之一，或先扩本文再使用。 |
| `canonical_owner` | 持有判断、维护和升级责任的 owner repo / owner surface。 |
| `physical_source` | 可审阅的物理源头，例如 domain repo prompt、skill pack repo、connector source、contract file 或 reference pack。 |
| `runtime_projection` | OPL / App / Codex / CLI / hosted runner 实际消费的投影面。没有投影时写 `none`。 |
| `sync_policy` | 如何同步、安装、生成、缓存或只读引用；必须写清默认路径和显式开发者路径。 |
| `exposure_scope` | Codex / App / CLI 能看到该能力 metadata 的默认层面；必须从本文的暴露层级中选择。 |
| `activation_gate` | 触发该能力进入当前任务上下文的条件，例如 workspace、quest、domain、developer profile、显式 selector 或 router 命中。 |
| `authority_boundary` | 该能力不能声明的 truth、verdict、receipt、typed blocker、human gate、artifact authority 或 readiness。 |
| `externalization_reason` | 为什么需要外置；默认内置时写 `domain_agent_builtin`。 |

审计顺序固定为：

1. 先识别能力模块，即用户或 agent 真正要完成的 bounded capability，例如文献、统计、图件、submission package、runtime provider、workspace handoff 或 owner evidence intake。
2. 再拆该模块内部的三层职责比例：AI-first `professional_skill` / `domain_skill_declaration`，随 Skill 分发的确定性 helper，以及 OPL / domain 程序化基座或 authority surface。
3. 最后决定暴露方式：source-only、project/workspace/quest local、domain profile、developer_codex 或 global_user。暴露层级不得反过来定义能力模块，也不得因为目录已经存在就推断成可全局发现的 Codex Skill。

因此，能力模块审计表应以模块为行，而不是以文件目录、Skill 名称或 CLI 命令为行。同一模块可以是混合实现：例如文献模块的检索策略和 claim support map 属于专业 Skill，DOI/PMID 归一化可属于 helper，PubMed/Crossref/OpenAlex 访问、receipt 和 owner acceptance 属于 Connect / MAS authority surface。

Foundry Agent profile selector 是 `activation_gate` 的机器化来源之一。`opl profiles select --intent ... --json` / `opl profiles inspect ... --json` 可以为 OMA 或其他 agent builder 提供 `selected_profile_refs`、profile requirements 和 conformance refs；这些 refs 只能决定应该装配哪些 stage/capability/knowledge/tool/evaluation surface，不能替代 domain repo 的专业 Skill、reference pack 正文、quality verdict、owner receipt 或 readiness evidence。

## capability_kind

### `primary_skill`

Primary skill 是标准 OPL Agent 的 rich 默认 Codex 入口。它让用户或 Codex 在选择该 agent 后获得稳定、完整、领域化的入口说明，而不是只看到 action catalog 生成的薄 Skill。

- 默认 `canonical_owner`：对应 domain agent repo。
- 默认 `physical_source`：domain repo 内的 `agent/primary_skill/SKILL.md`。
- 常见 `runtime_projection`：OPL materialized Codex plugin carrier、Codex App plugin entry、OPL App package cockpit drilldown。
- `sync_policy`：由 OPL Connect / materializer 从 repo-owned primary skill 生成 Codex plugin carrier；生成物和 cache 不是 source of truth。
- `authority_boundary`：不得签 owner receipt、typed blocker、human gate、artifact authority、quality verdict、publication/export/submission readiness、domain ready 或 production ready。

`primary_skill` 是标准 agent 必需能力，不是专业 Skill 外置候选。Action catalog 可以追加 `Generated Action Contracts` / command-contract readback，但不能替代 rich primary skill 源。

### `stage_prompt`

Stage 主提示词定义某一阶段如何推进：阶段目标、输入输出、证据门槛、route-back、owner gate、handoff、可用 specialist/tool refs 和 forbidden claims。

- 默认 `canonical_owner`：对应 domain agent repo。
- 默认 `physical_source`：domain repo 内的 `agent/stages/`、`agent/prompts/`、overlay template 或同等 stage pack。
- 常见 `runtime_projection`：Codex prompt、App action input、CLI action、hosted runner input、MCP descriptor。
- `authority_boundary`：不得冒充专业方法库、不得签 owner receipt / typed blocker / human gate，不得声明 quality verdict、artifact authority、publication/export/submission readiness 或 domain ready。

### `stage_projection` / `runtime_projection`

Stage projection / runtime projection 是把 domain stage、current owner delta、invocation envelope、attempt ledger、receipt refs 或 App read-model 投影给执行器或 operator 的结构化读面。

- 默认 `canonical_owner`：OPL Framework 持有 shared runtime / projection；domain-specific truth 仍归 domain owner。
- 默认 `physical_source`：OPL source、contracts、generated descriptor、read-model builder 或 runtime ledger。
- 常见 `runtime_projection`：CLI JSON、App state、Runway / Stagecraft readback、provider input envelope。
- `authority_boundary`：只运输 refs 和状态，不写 domain truth、artifact body、owner receipt、typed blocker、human gate 或 quality verdict；projection clean 不能声明目标产物 ready。

### `professional_skill`

Professional skill 是专业方法和 playbook，例如医学论文写作、审稿、图件、统计、表格、投稿、文献和数据治理。它告诉 AI executor 如何做好专业任务，不决定 stage 是否完成。

- 默认 `canonical_owner`：内置在 domain agent repo 的 `agent/professional_skills/<skill-id>/SKILL.md` 或同等标准 Codex Skill 目录。
- 外置 `canonical_owner`：只有满足外置条件时才进入独立专业 pack repo。
- 常见 `runtime_projection`：Codex Skill discovery surface、workspace / quest-local skill、domain stage prompt 引用的 specialist ref。
- `authority_boundary`：不得签 owner receipt、typed blocker、human gate、artifact authority、quality verdict、publication/export/submission readiness 或 domain ready。

### `domain_skill_declaration`

Domain skill declaration 是 domain pack 内给 Stage Control Plane、OPL generated surface 或 domain prompt 引用的领域 skill/playbook 声明。它可以描述 action flow、domain skill surface、accepted refs 和 delegation boundary，但不是 Codex-style 一等专业 Skill。

- 默认 `canonical_owner`：对应 domain agent repo。
- 默认 `physical_source`：domain repo `agent/skills/*.md` 或等价 domain pack file。
- 常见 `runtime_projection`：stage control plane skill refs、generated Codex carrier、CLI/App action input、domain prompt support。
- `authority_boundary`：不得因为路径名含 `skills` 就进入 Codex professional Skill discovery；不得签 owner receipt、typed blocker、quality verdict、promotion gate state 或 readiness。

注意：`agent/skills/` 默认按 `domain_skill_declaration` 读取；`agent/professional_skills/<skill-id>/SKILL.md` 默认按 `professional_skill` 读取。若某个 repo 使用等价目录，必须在 `contracts/capability_map.json` 中显式声明 `capability_kind`、physical source 和 runtime projection，不能靠目录名推断。若一个文件只是 execution policy、route-control policy、owner receipt 规则、stage packet 规则或质量门槛说明，应按 `stage_prompt`、`reference_pack` 或 `contract_module` 归类。

### `tool_connector`

Tool connector 负责资源访问、标准化 source refs、调用记录、限流/凭据边界、receipt candidate 和 no-authority readback。PubMed、数据库、HPC、渲染器、存储、软件环境和外部 API 都属于这类。

- 默认 `canonical_owner`：OPL Connect / Fabric；若 connector 只服务单一 domain 且尚不稳定，可先留在 domain repo。
- 默认 `physical_source`：connector source、schema、CLI/API handler、credential policy 和 receipt builder。
- 常见 `runtime_projection`：`opl connect <resource> ... --json`、App action、hosted connector descriptor、invocation receipt。
- `authority_boundary`：connector 只负责访问资源和给出 receipt，不承接专业判断，不决定 citation quality、数据可用性、临床结论、图表质量、owner acceptance 或 readiness。

### `reference_pack`

Reference pack 是大体量参考材料、模板、rubric、gallery、人审样例、脚本、schema refs 或 prompt-context bundle。它可以支撑专业 skill 或 stage prompt，但自身不是执行 authority。

- 默认 `canonical_owner`：拥有该参考材料的 domain / professional pack / OPL support owner。
- 默认 `physical_source`：docs、templates、gallery manifests、example refs、scripts 或 generated context bundle。
- 常见 `runtime_projection`：refs-only context bundle、skill 附属文件、workspace-local copied refs、App drilldown。
- `authority_boundary`：reference observed / synced / validated 只证明参考材料可读，不能声明 artifact ready、quality verdict、owner acceptance 或 production ready。

### `contract_module`

Contract module 是 schema、descriptor、validator、readback shape 或 machine-readable policy。它可以定义可执行边界，但不是给 AI executor 直接使用的专业 Skill。

- 默认 `canonical_owner`：持有该机器合同的 repo / module owner。
- 默认 `physical_source`：`contracts/**`、schema、source validator、generated type 或 CLI contract readback。
- 常见 `runtime_projection`：validator output、CLI contract mode、App / runtime read-model。
- `authority_boundary`：contract pass 不等于 Skill 存在，不等于 domain result accepted，不等于 runtime / release / production ready；不得把 contract_module 伪装成 true Skill 进入 Codex discovery。

## OPL 模块与 Skill 层分工

OPL 的 AI-first / contract-light 读法是：模块化留在运维层，弹性留在 Skill 层。Framework 模块只提供 identity、contract、locator、catalog、readback、receipt、handoff、projection、distribution、validation 和 recovery 这类可审计边界；开放式评估、路线选择、调试策略、执行 playbook、审阅标准、修订方法和领域判断应进入专业 Skill、stage prompt、knowledge / rubric refs 或 domain-owned quality gate。

固定术语采用三层读法，而不是按文件后缀或目录名分类：

| 层 | 正式语义 | 典型物理源 | 边界 |
| --- | --- | --- | --- |
| `domain_skill_declaration` | Domain pack 内的 skill/playbook 声明，供 stage control plane、generated surface 或 prompt 引用。 | domain repo `agent/skills/*.md`。 | 可声明 accepted refs、delegation boundary 和 action flow；不是 Codex professional Skill discovery source。 |
| `professional_skill` | 专业 Skill，承载 AI-first 专家 playbook、rubric、策略、审阅 lens、route-back 写法和候选产物组织。 | domain repo `agent/professional_skills/<skill-id>/SKILL.md`、外置 professional pack，或 OPL base/support Skill source。 | 可产出 candidate refs、review notes、diagnostic brief 或 handoff；不签 owner receipt，不写 domain truth，不声明 readiness。 |
| `skill_local_deterministic_helper` | 随专业 Skill 分发的确定性小工具，服务可重复、低成本、局部的解析、归一化、lint、skeleton、manifest / receipt shaping 或 self-check。 | `skills/<skill-id>/kernel.py`、同目录 `scripts/`、`templates/` 或轻量 refs。 | 跟随 Skill，不升级为 OPL module、provider worker、authority function、runtime queue 或 publication helper owner。 |
| `programmatic_substrate` / `authority_surface` | 程序化基座和权威面，承接身份、同步、安装、connector、runtime、queue、receipt、ledger、App projection、owner gate 和 release/currentness evidence。 | OPL `src/modules/**`、`contracts/**`、CLI/readback、runtime artifacts、domain owner surfaces。 | 可以证明结构、同步、receipt、runtime 或 owner evidence；不能替代专业判断，也不能把测试绿或投影存在写成 domain result。 |

同一个功能可以同时使用三层。例如文献能力由 `medical-research-lit` 做检索策略和证据判断，`kernel.py` 做 DOI/PMID 归一化和 citation lint，MAS owner surface 负责 PubMed connector、owner acceptance 与 citation ledger，OPL Connect 只保留通用 provider transport/receipt。设计时先定位子职责所在层，再决定物理文件；不要因为需要一个小工具就把专业 Skill 脚本化，也不要因为有专业 Skill 就把同步、凭据、provider lifecycle 或 owner gate 下放给 Skill。

| 模块 | OPL-owned 边界 | 不进入模块的开放式工作 |
| --- | --- | --- |
| `OPL Charter` | 术语、原则、authority matrix、forbidden claims、ADR/RFC lifecycle。 | 不写执行策略、调试 playbook、领域评价或 owner answer。 |
| `OPL Pack` | Declarative pack、capability ABI、authority ABI、generated/hosted surface 输入、standard authority function 边界。 | 不把专业方法、评估 rubric 或执行策略硬编码成 pack schema。 |
| `OPL Stagecraft` | Stage descriptor、stage prompt refs、capability use policy、handoff / receipt / blocker 下限。 | 不替 stage 内 AI executor 规划、审稿、诊断或选择路线。 |
| `OPL Workspace` | Workspace / Project / Stage Artifact Unit locator、source shell、inspectable file structure、handoff refs。 | 不解释 source body，不判定 domain source readiness，不清洗或接受领域数据。 |
| `OPL Atlas` | Agent / capability / tool-card / source / owner catalog、refs-only graph、lifecycle index。 | 不执行 capability，不排序开放式策略，不生成 domain verdict。 |
| `OPL Connect` | Connector、external skill discovery、selective sync、plugin / descriptor / package 分发、invocation receipt candidate。 | 不承接专业筛选、临床/基金/视觉判断、citation judgment 或 install-ready claim。 |
| `OPL Runway` | Durable attempt admission、queue、lease、retry / dead-letter、provider observation、recovery refs。 | 不把 provider completion、worker ready 或 queue clean 写成 domain progress / readiness。 |
| `OPL Ledger` | Refs-only evidence、receipt / blocker refs、lineage、replay、provenance、cleanup proof。 | 不保存 artifact / memory body，不签 owner receipt，不替 reviewer 或 owner 接受结果。 |
| `OPL Console` | App/operator projection、current-owner-delta-first cockpit、action catalog、invocation plan、drilldown。 | 不维护第二套 runtime truth、App release verdict 或 domain truth。 |
| `OPL Foundry Kernel` | FoundryRun、Pack materialization、evaluation、EvidenceBundle、qualification、AgentVersion、canary、activation / rollback 与 OMA provider orchestration。 | 不接管 target agent 的领域权威、保护测试正文、质量 verdict 或生产采用。 |

若某项能力需要“AI 判断怎么做”，默认先问它是否应是 `professional_skill`、`stage_prompt` 或 `reference_pack`；只有需要稳定身份、权限、输入输出、分发、receipt、readback 或 fail-closed 边界时，才提升为 OPL 模块合同。不要为了让模块看起来完整，把开放式 playbook 写进 `src/modules/**`、schema、validator 或 MAS/MAG/RCA 的私有 runtime 面。

## 默认归属与外置门

默认原则：能力先内置在 domain agent。外置是例外，不是成熟标志。

只有满足下面至少一项，且外置后不会转移 domain authority，才考虑从 domain agent 中拆出：

- 跨 workspace / quest / repo 反复复用，需要单源维护。
- 体量大，或携带大量 reference、模板、rubric、gallery、脚本、schema refs。
- 需要独立版本、发布、安装、回滚或 package channel。
- 被多个 stage 反复调用，继续塞进单个 stage prompt 会污染阶段策略。
- 需要 Codex 原生 discovery / workspace-local Skill 同步，而不是只被 domain prompt 内部引用。
- 需要作为 OPL Connect / Fabric 的稳定资源访问能力，而不是一次性 domain helper。

不满足这些条件时，保留为 `domain_agent_builtin`。不要为了目录整齐、命名统一或未来可能复用而外置。外置后也必须保留 owner boundary：domain agent 继续持有 domain truth、artifact body、quality verdict、owner receipt、typed blocker、human gate 和 release / publication / submission readiness。

## 同步与投影规则

- Stage prompt 可以生成 Codex prompt、App action、CLI action、MCP descriptor 或 hosted input，但 canonical stage source 仍留在 domain agent。
- Primary skill 必须由 `agent/primary_skill/SKILL.md` 经 OPL materializer 进入标准 Codex plugin carrier；Codex carrier、plugin cache 和 marketplace wrapper 都只是投影，不是第二真相源。
- Domain skill declaration 可以被 OPL generated surface 或 stage control plane 引用；只有被显式 materialize 为标准 `SKILL.md` 目录时，才进入 Codex Skill discovery。
- Professional skill 可以被 OPL Connect 同步到 workspace / quest-local Codex discovery 面；默认不要写用户系统级 Codex registry，除非显式开发者路径要求。
- Codex metadata 也是暴露面，不是零成本缓存。新增 Skill 必须先声明 `exposure_scope` 和 `activation_gate`；默认从 `source_only` 开始，只有证明普通任务不会被污染、且有明确消费场景时，才提升到更宽的 discovery 面。
- Tool connector 进入 OPL Connect / Fabric 后，必须返回 source refs、invocation refs、receipt candidate 和 no-authority flags；不能返回领域结论作为 authority。
- Reference pack 默认 refs-only 或 filtered copy；重型生成中间结果、cache、runtime artifact 和 bulk asset 不进入普通同步面。
- Contract module 只负责机器边界；如果需要 Codex Skill discovery，必须另有真实 `professional_skill` 或 `stage_prompt` wrapper，并写清 wrapper 不是第二真相源。
- 外部大型 skill 库进入 OPL Connect 后，默认走 `search -> inspect -> single-skill sync`，而不是把全库变成默认上下文。`list` 只作为 source/index 审阅面；普通任务应从搜索或明确 selector 开始。`K-Dense-AI/scientific-agent-skills` / `kdense-scientific-agent-skills` 属于 approved external source registry；approved 只表示可被 Connect 搜索、inspect 和按需同步单个 Skill，不表示默认安装、默认上下文或默认 Codex metadata 暴露。
- `opl-external-specialist-skill-router` 是 generic external specialist router，不是 scientific/MAS-only alias。它只在默认 OPL/domain professional pack 不足时路由到 registered source 的 `search` / `inspect` / optional single workspace-or-quest Skill sync；不得因为科研场景高频就新增 scientific alias Skill 或把外部源做成默认安装包。
- 标准 Agent 的用户级叙事统一为 `OPL Agent Package`；Codex Plugin、OPL App module、Capability Pack、MCP/Web/native surface 只是 carrier / projection。标准 domain agent 的 Codex Plugin 物理 carrier 统一由 repo-owned primary skill materialize，不再保留 MAS/MAG/RCA 与 OMA/OBF 两套行为路径。统一抽象不得被实现成“把所有 carrier 的 Skill metadata 全局注册到用户 Codex”。
- `contracts/opl-framework/foundry-agent-series-contract.json#agent_package_exposure_unification_policy` 和 `#skill_on_demand_exposure_policy` 是该规则的机器入口；`opl connect skills --json` 必须投影 `agent_package_exposure_model` 与 `professional_skill_exposure.on_demand_exposure_policy`，供 App / CLI / tests 使用同一口径。

## Skill 暴露层级

Skill 的物理 source、安装 payload、Codex metadata 和任务上下文是四个不同层面。source 存在不代表已安装；安装 payload 存在不代表已注册；注册 metadata 存在也不代表正文应该进入当前任务。默认按最窄可用层级暴露：

| exposure_scope | 允许可见面 | 默认适用 | 升级条件 |
| --- | --- | --- | --- |
| `source_only` | repo source、package source、review 文档；不进入 Codex discovery。 | OPL base/support Skill、候选 Skill、尚未证明复用价值的 playbook。 | 有明确 workspace、quest、domain 或 developer 场景需要 discovery。 |
| `project_local` | 当前 repo / project-local discovery 或开发者显式 profile。 | OPL repo 自身维护、agent authoring、framework diagnosis。 | 需要在具体 workspace / quest 执行，且不会污染系统级 Codex。 |
| `workspace_local` | 目标 workspace 的 `.codex/skills` 或等价 managed profile 子集。 | 专业任务工作区、source/artifact handoff、workspace-bound review。 | 需要 quest 级精确收窄或长期复用。 |
| `quest_local` | 单个 quest / stage worktree 的 `.codex/skills` 子集。 | 论文 quest、mission、stage-specific specialist pack。 | 需要 domain 默认 pack，且 profile 明确列入 required/default。 |
| `domain_profile` | domain agent 的 managed profile / package dependency graph。 | MAS Scholar Skills 等 domain professional capability package。 | 需要 Codex plugin carrier 或 family registry 投影。 |
| `developer_codex` | 开发者显式开启的 Codex plugin / marketplace / managed profile。 | OPL developer mode、framework support pack 调试。 | 只给 developer/operator，不作为普通用户默认。 |
| `global_user` | 用户系统级 Codex discovery。 | 极少数跨项目 companion skill 或用户显式安装的个人能力。 | 必须有明确用户选择、可卸载路径和污染风险说明。 |

OPL 不把 `plugins/opl-foundation-skills/skills/**` 的全部 metadata 默认提升到 `global_user`。如果 support Skill 数量增长，应优先使用一个极薄的 router / search / inspect 入口，再按 workspace、quest、domain 或 developer profile 同步需要的子集；不得为了“方便发现”把 100 个 framework 小 Skill 变成日常 Codex 全局候选，也不得给每个小模块、窄场景或 `legacy_redirect` 新增物理 support Skill。`plugins/opl-foundation-skills/exposure.json` 是该规则的 machine-readable guard；`opl connect foundation-skills inspect|sync` 消费该 manifest 并禁止 global / codex scope。

MAS / MDS historical 或 audit Skill 的全局安装状态不作为默认暴露层级；当前本机审计和治理结论见 [MAS 全局 Skill 暴露审计](../references/current-support/mas-global-skill-exposure-audit.md)。默认 policy 是 domain profile、workspace_local、quest_local 或 developer_codex，`global_user` 只允许显式个人安装。

## OPL-owned base / support Skill 归位

OPL 可以持有少量 base / support Skill，但它们必须服务 Framework 使用者或 agent 作者，而不是替代 domain 专业 Skill。典型内容包括：标准 Agent 建模说明、capability 分类审查、contract-light 调试 playbook、workspace handoff 写法、owner-route 诊断、package / descriptor review、FoundryRun 证据与风险审阅。它们只给 AI executor 提供操作方法和审阅提示，不签 owner receipt、typed blocker、quality verdict、artifact authority、domain readiness、App release readiness 或 production readiness。

推荐物理位置如下：

- source-only OPL base/support Skill：`plugins/opl-foundation-skills/skills/<skill-id>/SKILL.md`，并可带同目录 `references/`、`templates/` 或 `scripts/`。
- OPL-generated Codex-visible surface：由 Pack / Connect / plugin registry 从 source-only Skill 或 contract pack materialize；生成物不得成为 source of truth，且必须保留 `exposure_scope` / `activation_gate` 读法。
- workspace / quest local discovery：通过 `opl connect foundation-skills sync --skill <skill-id> --scope workspace|quest --target-root <path>` 或等价 managed profile 复制 refs-only 子集到目标 `.codex/skills/`；不得默认复制完整 foundation pack。
- packaged / managed payload：进入 OPL package / Full runtime / managed companion 路径时，只作为安装来源或缓存，当前状态以 fresh CLI/readback 和 receipt 为准。

当前已经落地的 source-only OPL foundation support Skill 放在
`plugins/opl-foundation-skills/skills/`：

| Skill | 主责模块 | AI-first 弹性 | 程序/owner 边界 |
| --- | --- | --- | --- |
| `opl-runway-compute-operator` | `OPL Runway` + `OPL Connect` | 环境/SSH/SLURM/Modal/endpoint 路线判断、provider failure 分类、handoff/receipt briefing。 | Runway / Connect 继续持有 credential、submit/wait/harvest、endpoint registration、provider receipt 和 runtime readback。 |
| `opl-stagecraft-stage-designer` | `OPL Stagecraft` | stage goal、prompt、rubric、capability use、route-back、handoff lower-bound 设计。 | Stagecraft contract 只固化 descriptor、allowed/forbidden surface、receipt/blocker lower bound 和 transition readback。 |
| `opl-stage-quality-gate-critic` | `OPL Stagecraft` | quality gate、stage admission projection、evidence lower bound、trust lane、composition obligation、human-review burden、evaluator overclaim 和 route-back packet 审查。 | Stagecraft / domain owner 继续持有 gate execution、quality verdict、owner receipt、typed blocker、admission truth 和 transition truth。 |
| `opl-connect-source-and-skill-router` | `OPL Connect` | external source / Skill 搜索、inspect、single-skill sync 决策、connector receipt debug、refs-only/no-authority review。 | Connect 继续持有 registry、sync、connector invocation、receipt candidate 和 package/descriptor transport。 |
| `opl-connect-connector-receipt-auditor` | `OPL Connect` | connector receipt candidate、normalized source refs、failed-provider records、freshness 和 no-authority handoff 审查。 | Connect 继续持有 connector registry、access、normalization、invocation records、failed-provider records 和 receipt candidate。 |
| `opl-foundry-agent-improver` | `OPL Foundry Kernel` | FoundryRun/EvidenceBundle 解释、失败分类、风险/Owner gate、canary/activation/rollback briefing 和 operational confidence。 | Foundry Kernel 继续持有 evaluation plan、EvidenceBundle、QualificationRecord、AgentVersion 与 activation/rollback receipts；OMA 持有 EvolutionProposal 语义。 |
| `opl-workspace-handoff-writer` | `OPL Workspace` | workspace/source/artifact refs 组织、source-readiness audit section、handoff packet、missing-input route-back、owner-route packet 写法。 | Workspace / program surface 继续持有 locator、path、artifact unit、source ref、workspace state、source readiness truth 和 owner route；`opl-workspace-source-readiness-auditor` 只作为 `exposure.json` redirect-only 旧入口保留。 |
| `opl-ledger-evidence-curator` | `OPL Ledger` | evidence sufficiency 判断、refs-only proof 编排、claim support、provenance chain、gap classification。 | append-only ledger、owner receipt、runtime/readback surface 和 domain owner 继续持有记录事实与 receipt。 |
| `opl-console-operator-copilot` | `OPL Console` + `OPL App` | current_owner_delta、action catalog、App first-run、Settings IA、Runtime page、user workbench action、release evidence wording 和 forbidden claim review。 | Console/App projection、action execution、runtime state mutation、domain truth 和 App/runtime/domain readiness 仍归对应 owner。 |
| `opl-pack-admission-reviewer` | `OPL Pack` | pack admission candidate、registry fit、capability / authority ABI、contract evidence、allowed / forbidden writes 和 owner route 审查。 | Pack registry、schema、validators、compiler surfaces 和 owning program contracts 继续持有 admission 与 registry truth。 |
| `opl-atlas-capability-router` | `OPL Atlas` | owner/source/skill/connector/tool-card/capability refs 路由、catalog ambiguity diagnosis、refs-only route packet。 | catalog registry、lifecycle index、refs graph 和 owner surface 继续持有 canonical identity 与生命周期状态。 |
| `opl-charter-authority-reviewer` | `OPL Charter` | authority boundary、owner split、no-second-truth、forbidden claim、readiness overclaim 和 closeout claim 审查。 | policy、contract、runtime state、owner answer 和 readiness/complete claim 仍需对应 authority evidence。 |
| `opl-completion-audit-writer` | `OPL Ledger` + `OPL Charter` | Plan Completion Audit、完成度百分比、evidence class 匹配、gap / next owner / Brand L5/release evidence overclaim / forbidden claim 编排。 | 完成、ready、release、owner acceptance 仍需对应 fresh evidence；Skill 不签 receipt、不创建 blocker。 |
| `opl-incident-root-cause-triager` | `OPL Console` + `OPL Runway` + `OPL Ledger` | stall、currentness drift、heartbeat、provider failure、owner-route gap、conflict/blocker、stop-loss 和 nonprogress 的 L0-L4 root-cause brief。 | runtime/readback、provider receipt、owner route、repair action、typed blocker/human gate 和 readiness 仍归对应 owner surface。 |
| `opl-eval-harness-designer` | `OPL Foundry Kernel` | eval harness、task cases、scorecard、failure taxonomy、promotion/hold evidence 设计。 | Foundry Kernel 继续持有 harness execution、scorecard result、promotion/rollback decision 和 receipt refs。 |
| `opl-owner-evidence-intake-reviewer` | `OPL Console` + `OPL Ledger` + domain owner | owner_evidence_intake、observed refs、owner-chain evidence、evidence class fit 和 acceptance overclaim 审查。 | owner surface / Ledger / domain owner 继续持有 owner receipt、typed blocker、owner acceptance、runtime truth 和 readiness。 |
| `opl-source-module-boundary-reviewer` | `OPL Charter` + source module owner | source-module owner、public entrypoint、dependency direction、upstream shell intake、private-tail retirement、forbidden import、module boundary 和 route-back 审查。 | contracts、source、module owner 和 validation surface 继续持有 source truth、allowed imports、runtime behavior、physical delete 和 readiness。 |
| `opl-memory-artifact-lifecycle-curator` | `OPL Workspace` + `OPL Ledger` + domain owner | memory/artifact/local-data lifecycle refs、artifact unit、archive/restore、retention / cleanup、provenance 和 owner-route brief 编排。 | Workspace / Ledger / domain owner 继续持有 locator、artifact body、memory body、local-data mutation、lifecycle truth、owner receipt 和 readiness。 |
| `opl-agent-package-lifecycle-reviewer` | `OPL Pack` + `OPL Connect` | agent package trust、manifest digest、dependency refs、carrier exposure、provenance、install/update/repair/rollback、Codex reload proof 和 owner route 审查。 | Pack / Connect / package owner 继续持有 registry、lock、install receipt、package authority、provider/runtime truth 和 readiness。 |
| `opl-runtime-soak-and-recovery-auditor` | `OPL Runway` + `OPL Connect` | external runtime provider fit、runtime environment bundle、native helper diagnostics、credential boundary、provider receipt、long-soak、recovery 和 route-back evidence 审查。 | Runway / Connect / release owner 继续持有 credential、provider mutation、provider receipt、runtime readback、helper repair、long-soak evidence 和 readiness。 |
| `opl-external-specialist-skill-router` | `OPL Connect` | 默认 OPL / domain professional pack 覆盖不到专业工具、source、workflow 或 method 时，搜索、inspect 并按需 single-skill sync 一个 approved external Skill。 | Connect 继续持有 external skill source registry、search / inspect / sync、sync receipt 和 refs-only handoff；该 router 不签 owner receipt、domain verdict 或 readiness。 |

这些 Skill 的完成只表示 source、plugin manifest 和静态验证面已存在；它们不证明任何 provider live ready、domain ready、App release ready、owner acceptance 或 production ready。

禁止归位：

- 不把 OPL base/support Skill 的正文塞进 `src/modules/**`、validator、schema 或 CLI handler；源码只消费 stable refs、descriptor 和 receipt。
- 不把 OPL-owned support Skill 放进 MAS/MAG/RCA/BookForge 等 domain 仓作为长期 source truth；domain 仓只声明采用、映射或 route-back refs。
- 不把 `~/.codex/skills`、Codex plugin cache、workspace copy、generated plugin source 或 package payload 当作 canonical source。
- 不把一次性调试提示、当前 lane 计划或尚未复用的专家判断提前沉淀成 OPL base Skill。
- 不为 K-Dense / scientific-agent-skills 这类 approved external source 的每个小类、工具或 scientific alias 新增 OPL support Skill；默认通过 `opl-external-specialist-skill-router` 做 search / inspect / single-skill sync。

## MAS 当前示例

MAS 当前分工按下列口径读取：

| 能力 | capability_kind | canonical_owner | 物理源与同步 | authority_boundary |
| --- | --- | --- | --- | --- |
| MAS `write`、`review`、`figure`、`data/cohort` 等 stage 主提示词 | `stage_prompt` | MAS | MAS 仓内 stage prompt / overlay / stage pack；可投影给 Codex、CLI 或 hosted runner。 | MAS stage prompt 只持有阶段策略和 owner gate，不承接完整医学专业 playbook；owner receipt 仍归 MAS owner surface。 |
| MAS stage / runtime readback、`current_owner_delta`、invocation envelope | `stage_projection` / `runtime_projection` | MAS + OPL 各持其界 | MAS 持有 paper mission / owner truth；OPL 持有 Runway / Stagecraft / App projection 和 refs-only transport。 | OPL projection 不写 MAS truth，不声明 paper progress、publication-ready、domain-ready 或 runtime-ready。 |
| MAS Scholar Skills professional skills | `professional_skill` | canonical `mas-scholar-skills` source repo | 外部 package 的 `.codex-plugin/plugin.json` 与实际 `skills/*/SKILL.md` 是清单和内容真相；OPL Packages 校验 provider contract，并由 activation transaction 把当前发布包声明的全部 35 Skills 物化到指定 workspace / quest。11 core + 8 module contracts 是 hard readiness floor，不是安装上限；OPL 不维护第二份医学 Skill ID 或 required/default profile。 | 只提供 package owner 声明的专业 playbook 与 candidate refs；不签 MAS owner receipt、typed blocker、quality verdict、artifact authority、runtime readiness 或 publication readiness。 |
| PubMed / source API / renderer / environment 等稳定外部资源入口 | `tool_connector` | OPL Connect / Fabric，或尚未稳定时留在 MAS/domain source surface | 稳定后用 connector 输出 normalized refs、invocation receipt 和 no-authority flags。 | connector 负责资源访问和 receipt，不承接文献筛选、临床判断、source readiness verdict 或 reviewer verdict。 |
| Display gallery、人审样例、模板、rubric、reference scripts | `reference_pack` | 对应 domain / professional pack owner | refs-only 或 filtered copy 随专业 pack / workspace sync 暴露。 | 可审或可引用不等于 visual parity、artifact ready、owner accepted 或 publication-ready。 |
| ScholarSkills descriptor、schema 与 capability catalog | `contract_module` | `mas-scholar-skills` package owner | 内容合同留在外部 package；OPL 只通过 capability dependency schema、package channel、lock、activation/status readback 和 provenance receipt 消费。 | OPL 不复制 catalog/validator，不提供 `opl scholar-skills` 私有命令，也不授权 domain authority。 |

外部 package 中已经物化且通过 plugin/Skill 校验的目录，可以由 `opl packages activate` 投影到 workspace / quest-local discovery；是否 required/default、属于哪类医学方法，以及何时 route-back 都由 package/domain owner 声明。executable runtime、数据访问、artifact mutation 和 readiness 仍需独立 owner / source / projection / authority；不得在 OPL 内创建第二套正文、Skill 清单或 profile。

## 新能力准入门

新增能力的第一步不是创建 Skill，而是填写 capability admission record。该 record 可以落在 `contracts/capability_map.json`、对应 active plan、PR 描述或审计文档中；只要本轮变更新增 `agent/professional_skills/**/SKILL.md`、`plugins/opl-foundation-skills/skills/**/SKILL.md`、外部 Skill registry 条目、connector、helper 或 authority surface，就必须先给出下列表格字段。

| 字段 | 必填内容 |
| --- | --- |
| `capability_id` | 稳定能力 id；优先表达能力模块，不用文件名或临时任务名。 |
| `user_need` | 用户/agent 需要完成的真实能力模块。 |
| `existing_coverage` | 已有 stage prompt、professional skill、router、reviewer、connector、script、contract 或 authority surface 是否能覆盖。 |
| `selected_layer` | 从 `existing`、`stage_prompt`、`professional_skill`、`deterministic_helper`、`tool_connector`、`reference_pack`、`contract_module`、`authority_surface`、`external_skill` 中选择。 |
| `physical_owner` | canonical repo、目录和 owner surface。 |
| `exposure_scope` | `source_only`、`project_local`、`workspace_local`、`quest_local`、`domain_profile`、`developer_codex` 或 `global_user`。 |
| `activation_gate` | 什么条件下进入 Codex discovery / task context；默认不得 global。 |
| `why_not_existing` | 如果不复用现有能力，说明现有能力具体缺什么。 |
| `authority_boundary` | 明确不得写的 truth、verdict、receipt、typed blocker、artifact authority、human gate、readiness。 |
| `verification_ref` | 证明 locator、exposure、sync 或 owner boundary 的验证入口；docs-only 只能证明规范落地。 |

`selected_layer` 的判定顺序固定如下：

| 问题 | 结果 |
| --- | --- |
| 现有 stage prompt、router、reviewer、professional skill 或 connector 能覆盖吗？ | 选择 `existing`，更新现有能力或补 route/ref；不新建 Skill。 |
| 只是一次性提示、当前 lane 分析或临时计划吗？ | 不落盘；必要时写入本次 handoff，不进入能力目录。 |
| 主要是阶段目标、输入输出、证据门槛、route-back、owner gate 或 handoff shape 吗？ | 选择 `stage_prompt`，放到 domain `agent/stages/`、`agent/prompts/` 或 stage pack。 |
| 主要是专业判断、写作、审稿、策略、设计方法、诊断 lens 或 route-back 写法吗？ | 选择 `professional_skill`，默认 repo-local；满足外置门后才进 professional pack。 |
| 主要是低成本、可重复、局部的解析、归一化、lint、skeleton、manifest / receipt shaping 吗？ | 选择 `deterministic_helper`，跟随 owning Skill 或 connector，不升级为独立专业 Skill。 |
| 主要是 API、数据库、下载、同步、环境、渲染器、凭据、限流或 invocation receipt 吗？ | 选择 `tool_connector`，优先 OPL Connect / Fabric 或 domain connector source。 |
| 主要是模板、rubric、gallery、样例、知识包或大体量上下文吗？ | 选择 `reference_pack`，按 refs-only / filtered copy 暴露。 |
| 主要是 schema、validator、readback shape、resolver、policy 或机器边界吗？ | 选择 `contract_module`，不得伪装成 Codex Skill。 |
| 会写 truth、签 owner receipt、创建 typed blocker、决定 artifact / quality / readiness / release 吗？ | 选择 `authority_surface`，必须留在对应 owner repo；禁止放进 Skill。 |
| 默认包覆盖不到罕见专科工具、source、workflow 或 method 吗？ | 选择 `external_skill`，走 OPL Connect `search -> inspect -> single-skill sync`，不把全库注册进默认 Codex。 |

## Skill 合并与不降级门

Skill 合并的目标是降低默认 metadata 暴露和认知负担，不是把专业能力压扁。合并前必须先把旧能力按 capability module 审计到下面四类之一；不能只因为 Skill 名称相近、数量多或目录想收薄就删除实体。

| 类别 | 保留 / 合并规则 | 必要记录 |
| --- | --- | --- |
| `real_named_specialty_skill` | 不可替代的专业 playbook、方法判断、rubric、诊断 lens 或子领域流程应保留真实 `SKILL.md`，可作为 optional / named / workspace / quest-local 暴露。 | 在 owning repo 的 capability map 或 pack manifest 记录 `capability_kind=professional_skill`、canonical source、`exposure_scope`、activation gate 和 no-authority boundary。 |
| `legacy_redirect` | 同一 workflow 下的旧细粒度入口、旧命名或 operator 习惯可以合并到 canonical workflow Skill；旧入口不再保留 active `SKILL.md`。 | 机器 redirect 必须记录 `covered_by_skill_ref`、`covered_by_capability_id`、`capability_preserved=true`、`default_codex_exposure=false` 和 reason；canonical Skill 必须能覆盖旧 playbook 的实质任务。 |
| `no_merge_rationale` | 复杂多阶段能力或不同专业动作不能为了数量好看强行合并，例如构图 vs 绘图、style profiling vs native deliverable rendering、source integrity vs manuscript prose review。 | 在 capability map、audit doc 或 decision log 记录不合并原因、各自 owner、调用关系、暴露层级和防重复边界。 |
| `deterministic_helper_or_runtime_surface` | 纯脚本、解析、归一化、下载、渲染、安装、凭据、runtime/provider、receipt、authority write 或 readback surface 不应被做成 Skill。 | 放入 helper、tool connector、contract module 或 authority surface，并记录 Skill 只引用 refs，不承接 mutation / truth / readiness。 |

评估顺序固定为：先问旧 Skill 是否包含不可替代的专业判断；再问是否只是同一 workflow 的旧入口；再问是否属于复杂子能力需要拆开；最后把确定性或权威工作下沉到 helper / connector / contract / authority surface。合并后必须同时满足两点：能力实质不降级，默认 Codex metadata 暴露不扩大。

拒绝条件：

- `existing_coverage` 未说明，或只是因为“以后可能复用”就新增 Skill。
- `selected_layer=professional_skill` 但内容主要是脚本、API 调用、安装同步、authority write 或 runtime provider lifecycle。
- `exposure_scope` 默认为 `global_user`、`developer_codex` 或宽域 domain profile，但没有 activation gate 和污染风险说明。
- 新增 `agent/professional_skills/**/SKILL.md` 后没有进入 owning repo 的 `contracts/capability_map.json` 或等价 capability resolver。
- 新增 OPL foundation support Skill 后没有进入 `plugins/opl-foundation-skills/exposure.json`，或缺少 no-authority boundary。
- 外置专业 Skill 没有说明为什么不能留在 consuming domain agent。

这道准入门的目标是控制 Skill 膨胀，而不是压低能力上限。高价值开放式方法仍应放进 Skill；稳定重复动作放进 helper/connector；权威判断留在 owner surface；默认暴露面从最窄层级开始。

## 新能力审查清单

新增或迁移能力前，最小审查问题是：

1. 是否已经填写 capability admission record？
2. 这是 stage 策略、专业方法、确定性 helper、资源连接、参考材料、机器合同，还是 authority surface / runtime projection？
3. 默认放回 domain agent 是否已经够用？
4. 若要外置，外置原因是否属于本文外置门，而不是未来想象或命名整齐？
5. 外置后是否仍明确 domain owner 持有 truth、verdict、receipt、typed blocker、human gate 和 readiness？
6. 同步路径是否避免把 cache、runtime data、bulk generated assets、domain truth 或 owner receipts 复制进错误位置？
7. 是否需要在 `docs/decisions.md`、`docs/status.md`、相关 active doc 或 contract/source 中补最小链接，避免形成文档孤岛？

通过清单只说明能力管理边界清楚，不说明实现已完成、runtime ready、release ready、domain ready 或 production ready。
