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

## MAS 当前示例

MAS 当前分工按下列口径读取：

| 能力 | capability_kind | canonical_owner | 物理源与同步 | authority_boundary |
| --- | --- | --- | --- | --- |
| MAS `write`、`review`、`figure`、`data/cohort` 等 stage 主提示词 | `stage_prompt` | MAS | MAS 仓内 stage prompt / overlay / stage pack；可投影给 Codex、CLI 或 hosted runner。 | MAS stage prompt 只持有阶段策略和 owner gate，不承接完整医学专业 playbook；owner receipt 仍归 MAS owner surface。 |
| MAS stage / runtime readback、`current_owner_delta`、invocation envelope | `stage_projection` / `runtime_projection` | MAS + OPL 各持其界 | MAS 持有 paper mission / owner truth；OPL 持有 Runway / Stagecraft / App projection 和 refs-only transport。 | OPL projection 不写 MAS truth，不声明 paper progress、publication-ready、domain-ready 或 runtime-ready。 |
| `medical-research-lit`、`medical-manuscript-writing`、`medical-manuscript-review`、`medical-figure-design`、`medical-statistical-review`、`medical-table-design`、`medical-submission-prep`、`medical-data-governance` | `professional_skill` | `mas-scholar-skills` | 通过 OPL Connect 同步 `mas-scholar-skills` aggregate entry 与八个 workspace / quest-local Codex Skill。 | 只提供医学论文专业 playbook 和 candidate refs；不签 MAS owner receipt、typed blocker、quality verdict、artifact authority 或 publication readiness。 |
| PubMed / source API / renderer / environment 等稳定外部资源入口 | `tool_connector` | OPL Connect / Fabric，或尚未稳定时留在 MAS/domain source surface | 稳定后用 connector 输出 normalized refs、invocation receipt 和 no-authority flags。 | connector 负责资源访问和 receipt，不承接文献筛选、临床判断、source readiness verdict 或 reviewer verdict。 |
| Display gallery、人审样例、模板、rubric、reference scripts | `reference_pack` | 对应 domain / professional pack owner | refs-only 或 filtered copy 随专业 pack / workspace sync 暴露。 | 可审或可引用不等于 visual parity、artifact ready、owner accepted 或 publication-ready。 |
| ScholarSkills descriptor、schema、validator、readback contract | `contract_module` | OPL Framework / ScholarSkills contract owner | `contracts/**`、source validator、`opl scholar-skills * --json` readback。 | contract module 不伪装成 true Skill，不替代八个 active professional Skill，也不授权 domain authority。 |

`source`、`intake` 和 `omics` 当前不作为 active 外置合同：通用 source / external-learning intake 归 OPL Framework 或 MAS stage/source surface；组学能力在没有稳定 MAS 组学专业 workflow 前保持内置或候选状态，后续只有满足外置门并明确 owner / source / projection / sync / authority 后才评估外置。

## 新能力审查清单

新增或迁移能力前，最小审查问题是：

1. 这是 stage 策略、专业方法、资源连接、参考材料、机器合同，还是 runtime projection？
2. 默认放回 domain agent 是否已经够用？
3. 若要外置，外置原因是否属于本文外置门，而不是未来想象或命名整齐？
4. 外置后是否仍明确 domain owner 持有 truth、verdict、receipt、typed blocker、human gate 和 readiness？
5. 同步路径是否避免把 cache、runtime data、bulk generated assets、domain truth 或 owner receipts 复制进错误位置？
6. 是否需要在 `docs/decisions.md`、`docs/status.md`、相关 active doc 或 contract/source 中补最小链接，避免形成文档孤岛？

通过清单只说明能力管理边界清楚，不说明实现已完成、runtime ready、release ready、domain ready 或 production ready。
