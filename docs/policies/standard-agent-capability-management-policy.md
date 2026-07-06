# OPL 标准智能体能力管理规范

Owner: `One Person Lab`
Purpose: `standard_agent_capability_management_policy`
State: `active_policy`
Machine boundary: 本文是 OPL family 维护者的人读规范，用来统一能力分层、外置判断、同步边界和 no-authority 口径。机器真相仍归 contracts、source、CLI/API readback、runtime ledger、domain-owned manifest、owner receipt 和真实 workspace / App evidence。

## 适用范围

本文适用于 OPL 标准智能体及其专业能力包、连接器、reference pack、contract module 和 runtime projection 的命名与归属判断。它不把每个能力硬编码成 machine contract，也不替代 MAS/MAG/RCA/OMA/BookForge/ScholarSkills 等 owner repo 的 domain truth。

新增、拆分、外置或同步能力时，维护者必须声明：

| 字段 | 含义 |
| --- | --- |
| `capability_kind` | 能力类型，只能使用本文定义的六类之一，或先扩本文再使用。 |
| `canonical_owner` | 持有判断、维护和升级责任的 owner repo / owner surface。 |
| `physical_source` | 可审阅的物理源头，例如 domain repo prompt、skill pack repo、connector source、contract file 或 reference pack。 |
| `runtime_projection` | OPL / App / Codex / CLI / hosted runner 实际消费的投影面。没有投影时写 `none`。 |
| `sync_policy` | 如何同步、安装、生成、缓存或只读引用；必须写清默认路径和显式开发者路径。 |
| `authority_boundary` | 该能力不能声明的 truth、verdict、receipt、typed blocker、human gate、artifact authority 或 readiness。 |
| `externalization_reason` | 为什么需要外置；默认内置时写 `domain_agent_builtin`。 |

## capability_kind

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

- 默认 `canonical_owner`：内置在 domain agent repo 的 `agent/skills/` 或同等位置。
- 外置 `canonical_owner`：只有满足外置条件时才进入独立专业 pack repo。
- 常见 `runtime_projection`：Codex Skill discovery surface、workspace / quest-local skill、domain stage prompt 引用的 specialist ref。
- `authority_boundary`：不得签 owner receipt、typed blocker、human gate、artifact authority、quality verdict、publication/export/submission readiness 或 domain ready。

注意：`agent/skills/` 只有在承载可主动执行的专业方法时才归为 `professional_skill`。若目录里是 domain execution policy、route-control policy、owner receipt 规则、stage packet 规则或质量门槛说明，应按 `stage_prompt`、`reference_pack` 或 `contract_module` 归类，不要因为路径名含 `skills` 就投成 Codex 专业 Skill。

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
| `OPL Foundry Lab` | Scaffold、conformance、work-order、canary、promotion / rollback refs、OMA improvement control plane。 | 不接管 target agent 的领域权威、质量 verdict 或交付物 acceptance。 |

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
- Professional skill 可以被 OPL Connect 同步到 workspace / quest-local Codex discovery 面；默认不要写用户系统级 Codex registry，除非显式开发者路径要求。
- Tool connector 进入 OPL Connect / Fabric 后，必须返回 source refs、invocation refs、receipt candidate 和 no-authority flags；不能返回领域结论作为 authority。
- Reference pack 默认 refs-only 或 filtered copy；重型生成中间结果、cache、runtime artifact 和 bulk asset 不进入普通同步面。
- Contract module 只负责机器边界；如果需要 Codex Skill discovery，必须另有真实 `professional_skill` 或 `stage_prompt` wrapper，并写清 wrapper 不是第二真相源。
- 外部大型 skill 库进入 OPL Connect 后，默认走 `search -> inspect -> single-skill sync`，而不是把全库变成默认上下文。`list` 只作为 source/index 审阅面；普通任务应从搜索或明确 selector 开始。

## OPL-owned base / support Skill 归位

OPL 可以持有少量 base / support Skill，但它们必须服务 Framework 使用者或 agent 作者，而不是替代 domain 专业 Skill。典型内容包括：标准 Agent 建模说明、capability 分类审查、contract-light 调试 playbook、workspace handoff 写法、owner-route 诊断、package / descriptor review、Foundry Lab work-order 写法。它们只给 AI executor 提供操作方法和审阅提示，不签 owner receipt、typed blocker、quality verdict、artifact authority、domain readiness、App release readiness 或 production readiness。

推荐物理位置如下：

- source-only OPL base/support Skill：`plugins/opl-foundation-skills/skills/<skill-id>/SKILL.md`，并可带同目录 `references/`、`templates/` 或 `scripts/`。
- OPL-generated Codex-visible surface：由 Pack / Connect / plugin registry 从 source-only Skill 或 contract pack materialize；生成物不得成为 source of truth。
- workspace / quest local discovery：通过 `opl connect sync-skills ... --scope workspace|quest` 或等价 managed profile 复制 refs-only 子集到目标 `.codex/skills/`。
- packaged / managed payload：进入 OPL package / Full runtime / managed companion 路径时，只作为安装来源或缓存，当前状态以 fresh CLI/readback 和 receipt 为准。

当前已经落地的 source-only OPL foundation support Skill 放在
`plugins/opl-foundation-skills/skills/`：

| Skill | 主责模块 | AI-first 弹性 | 程序/owner 边界 |
| --- | --- | --- | --- |
| `opl-runway-compute-operator` | `OPL Runway` + `OPL Connect` | 环境/SSH/SLURM/Modal/endpoint 路线判断、provider failure 分类、handoff/receipt briefing。 | Runway / Connect 继续持有 credential、submit/wait/harvest、endpoint registration、provider receipt 和 runtime readback。 |
| `opl-stagecraft-stage-designer` | `OPL Stagecraft` | stage goal、prompt、rubric、capability use、route-back、handoff lower-bound 设计。 | Stagecraft contract 只固化 descriptor、allowed/forbidden surface、receipt/blocker lower bound 和 transition readback。 |
| `opl-connect-source-and-skill-router` | `OPL Connect` | external source / Skill 搜索、inspect、single-skill sync 决策、connector receipt debug、refs-only/no-authority review。 | Connect 继续持有 registry、sync、connector invocation、receipt candidate 和 package/descriptor transport。 |
| `opl-foundry-agent-improver` | `OPL Foundry Lab` | Agent/Skill 失败分析、work-order review、conformance/eval 解释、Skill rewrite plan、promotion/rollback briefing。 | Foundry Lab 继续持有 harness、scorecard、work-order envelope、patch refs、promotion/rollback receipt refs。 |
| `opl-workspace-handoff-writer` | `OPL Workspace` | workspace/source/artifact refs 组织、handoff packet、missing-input route-back、owner-route packet 写法。 | Workspace / program surface 继续持有 locator、path、artifact unit、source ref、workspace state 和 owner route。 |
| `opl-ledger-evidence-curator` | `OPL Ledger` | evidence sufficiency 判断、refs-only proof 编排、claim support、provenance chain、gap classification。 | append-only ledger、owner receipt、runtime/readback surface 和 domain owner 继续持有记录事实与 receipt。 |
| `opl-console-operator-copilot` | `OPL Console` | current_owner_delta 解读、action catalog 比较、operator next-action 建议、forbidden claim review。 | Console/App projection、action execution、runtime state mutation、domain truth 和 App/runtime/domain readiness 仍归对应 owner。 |
| `opl-pack-capability-reviewer` | `OPL Pack` | declarative pack、capability ABI、authority ABI、tool affordance 与专业方法放置审查。 | pack compiler、schema、validator、program source 和 generated/hosted surface 继续持有机器边界。 |
| `opl-atlas-capability-router` | `OPL Atlas` | owner/source/skill/connector/tool-card/capability refs 路由、catalog ambiguity diagnosis、refs-only route packet。 | catalog registry、lifecycle index、refs graph 和 owner surface 继续持有 canonical identity 与生命周期状态。 |
| `opl-charter-authority-reviewer` | `OPL Charter` | authority boundary、owner split、no-second-truth、forbidden claim、readiness overclaim 和 closeout claim 审查。 | policy、contract、runtime state、owner answer 和 readiness/complete claim 仍需对应 authority evidence。 |

这些 Skill 的完成只表示 source、plugin manifest 和静态验证面已存在；它们不证明任何 provider live ready、domain ready、App release ready、owner acceptance 或 production ready。

禁止归位：

- 不把 OPL base/support Skill 的正文塞进 `src/modules/**`、validator、schema 或 CLI handler；源码只消费 stable refs、descriptor 和 receipt。
- 不把 OPL-owned support Skill 放进 MAS/MAG/RCA/BookForge 等 domain 仓作为长期 source truth；domain 仓只声明采用、映射或 route-back refs。
- 不把 `~/.codex/skills`、Codex plugin cache、workspace copy、generated plugin source 或 package payload 当作 canonical source。
- 不把一次性调试提示、当前 lane 计划或尚未复用的专家判断提前沉淀成 OPL base Skill。

## MAS 当前示例

MAS 当前分工按下列口径读取：

| 能力 | capability_kind | canonical_owner | 物理源与同步 | authority_boundary |
| --- | --- | --- | --- | --- |
| MAS `write`、`review`、`figure`、`data/cohort` 等 stage 主提示词 | `stage_prompt` | MAS | MAS 仓内 stage prompt / overlay / stage pack；可投影给 Codex、CLI 或 hosted runner。 | MAS stage prompt 只持有阶段策略和 owner gate，不承接完整医学专业 playbook；owner receipt 仍归 MAS owner surface。 |
| MAS stage / runtime readback、`current_owner_delta`、invocation envelope | `stage_projection` / `runtime_projection` | MAS + OPL 各持其界 | MAS 持有 paper mission / owner truth；OPL 持有 Runway / Stagecraft / App projection 和 refs-only transport。 | OPL projection 不写 MAS truth，不声明 paper progress、publication-ready、domain-ready 或 runtime-ready。 |
| `medical-research-lit`、`medical-manuscript-writing`、`medical-manuscript-review`、`medical-figure-design`、`medical-figure-style`、`medical-figure-composer`、`medical-statistical-review`、`medical-table-design`、`medical-submission-prep`、`medical-data-governance`、`medical-epidemiology-study-design`、`medical-cohort-phenotyping`、`medical-rebuttal-strategy`、`medical-display-qc`、`medical-omics-analysis-plan` | `professional_skill` | `mas-scholar-skills` | 通过 OPL Connect 同步 `mas-scholar-skills` aggregate entry 与十五个 workspace / quest-local Codex Skill。`medical-figure-style` / `medical-figure-composer` 是 Display 子 Skill，不新增 active module。 | 只提供医学论文专业 playbook、研究设计/表型/反驳/display QC/omics planning candidate refs；不签 MAS owner receipt、typed blocker、quality verdict、artifact authority、runtime readiness 或 publication readiness。 |
| PubMed / source API / renderer / environment 等稳定外部资源入口 | `tool_connector` | OPL Connect / Fabric，或尚未稳定时留在 MAS/domain source surface | 稳定后用 connector 输出 normalized refs、invocation receipt 和 no-authority flags。 | connector 负责资源访问和 receipt，不承接文献筛选、临床判断、source readiness verdict 或 reviewer verdict。 |
| Display gallery、人审样例、模板、rubric、reference scripts | `reference_pack` | 对应 domain / professional pack owner | refs-only 或 filtered copy 随专业 pack / workspace sync 暴露。 | 可审或可引用不等于 visual parity、artifact ready、owner accepted 或 publication-ready。 |
| ScholarSkills descriptor、schema、validator、readback contract | `contract_module` | OPL Framework / ScholarSkills contract owner | `contracts/**`、source validator、`opl scholar-skills * --json` readback。 | contract module 不伪装成 true Skill，不替代默认 professional Skill，也不授权 domain authority。 |

`source` 和 `intake` 当前不作为 active 外置合同：通用 source / external-learning intake 归 OPL Framework 或 MAS stage/source surface。组学当前只以 `medical-omics-analysis-plan` 作为 planning / route-back 专业 Skill；真实 Nextflow / RDKit / PyHealth / single-cell 等 executable runtime、数据访问、artifact mutation 和 readiness 仍需独立 owner / source / projection / sync / authority 后才可落地。

## 新能力审查清单

新增或迁移能力前，最小审查问题是：

1. 这是 stage 策略、专业方法、资源连接、参考材料、机器合同，还是 runtime projection？
2. 默认放回 domain agent 是否已经够用？
3. 若要外置，外置原因是否属于本文外置门，而不是未来想象或命名整齐？
4. 外置后是否仍明确 domain owner 持有 truth、verdict、receipt、typed blocker、human gate 和 readiness？
5. 同步路径是否避免把 cache、runtime data、bulk generated assets、domain truth 或 owner receipts 复制进错误位置？
6. 是否需要在 `docs/decisions.md`、`docs/status.md`、相关 active doc 或 contract/source 中补最小链接，避免形成文档孤岛？

通过清单只说明能力管理边界清楚，不说明实现已完成、runtime ready、release ready、domain ready 或 production ready。
