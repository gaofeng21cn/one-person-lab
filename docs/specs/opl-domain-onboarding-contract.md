# OPL Domain-Agent Admission Contract

Owner: `One Person Lab`
Purpose: `specs_opl_domain_onboarding_contract`
State: `active_spec_support`
Machine boundary: 本文是人读 spec 支撑材料。机器可读行为继续归 contracts、schema、source、CLI/API 行为、runtime ledger、生成产物和 semantic human_doc ids。

> Currentness rule: 本文只定义候选 domain-agent admission 的审查合同，不冻结当前已收录 Agent、workstream 数量或候选清单。当前 `src/kernel/standard-agent-registry.ts` 只是在迁移期提供身份与成员资格兼容投影；目标 identity 归 Package owner descriptor，Framework discovery 归平台 installed inventory，官方 starter membership 归 App Official Profile。可调用性继续由 selected carrier 与 owner-owned descriptor/action/stage contracts 证明。`domains.json`、`workstreams.json` 与 `task-topology.json` 只描述 workspace/runtime/legacy topology 和候选 workstream，不得作为标准 Agent 的发现白名单。迁移门见 [`../active/opl-package-platform-composition-migration.md`](../active/opl-package-platform-composition-migration.md)。

## 目的

本文定义当前新 domain agent 被 OPL framework 收录前必须通过的审查合同。

它的目标是定义：未来一个新 domain-agent system 在什么条件下，才能被 `OPL` stage-led framework 选择，同时不模糊 ownership、stage selection 与 truth boundary。

目标不是先把 domain 名字挂上去，后面再慢慢补边界。
目标是要求“先有显式边界材料，后有正式收录”。

## 与活跃 Framework 合同的关系

Domain-agent admission 以当前活跃 framework 合同集为审查依据：

- [OPL Candidate Domain Backlog](../references/domain-admission/opl-candidate-domain-backlog.md)
- 当前仓库中的机器可读合同面：[`../contracts/opl-framework/README.md`](../../contracts/opl-framework/README.md)

如果 domain-agent identity、stage capability package、truth ownership 与 product entry surface 不稳定，admission 不应继续推进。

对运行依赖来说，候选 domain-agent 必须把 `OPL Framework` 当作外部依赖环境：通过 `opl framework locate` / `opl_framework_locator` 定位 framework root、CLI、contracts、state dir 与 modules root，再调用 OPL-owned runtime / contract / projection surface。它不得 vendor 或 fork 一份 OPL runtime，也不能把 `One Person Lab App` 当成运行必需入口；App 只可作为可选工作台和 projection consumer。

## 机器可读配套工件

- [`../contracts/opl-framework/standard-agent-admission-gates.json`](../../contracts/opl-framework/standard-agent-admission-gates.json)
- [`../src/kernel/standard-agent-registry.ts`](../../src/kernel/standard-agent-registry.ts)（迁移期兼容投影，目标由 installed descriptor 替代）
- [`../contracts/opl-framework/domains.json`](../../contracts/opl-framework/domains.json)
- [`../contracts/opl-framework/workstreams.json`](../../contracts/opl-framework/workstreams.json)
- [`../contracts/opl-framework/task-topology.json`](../../contracts/opl-framework/task-topology.json)
- [`../contracts/opl-framework/public-surface-index.json#opl_framework_locator`](../../contracts/opl-framework/public-surface-index.json)
- `opl agents descriptors --json`
- `opl agents descriptor --domain <domain> --json`

迁移期 registry 与 owner contracts 把已收录标准 Agent 的身份、公开 action 和 stage pack 落成 generated surface；目标态由动态 installed descriptor 发现，registry 不再拥有 membership。
它们不会授予 OPL domain truth，也不会自动收录候选 workstream。
`standard-agent-admission-gates.json` 是本文 admission package 的机器可读 gate 面：它要求正式收录前至少覆盖 identity、domain truth owner、generated surface default entry、standard pack ABI、stage artifact contract、execution model、authority boundary、owner receipt boundary、typed blocker boundary 与 human gate false-authority；它只冻结 gate 与 false-authority 语义，不声明任何当前或候选 domain ready / production ready。
`opl agents descriptors` 是 registry-derived 的统一公共 descriptor projection，覆盖每个 `standard_domain_agent` 成员；selected checkout 与 owner contracts 决定各成员是 resolved 还是返回 typed blocker。Workspace-bound legacy manifest/skeleton 只作为 descriptor 中的嵌套诊断信息，不决定 membership、公开可发现性、action 或 Stage 合同。Descriptor projection 仍不读取或嵌入 domain memory 正文、prompt 长正文、route 判断或 quality verdict。
公开 scaffold 或 domain-direction hint 可以帮助说明 candidate path，但在真实 domain-agent boundary package 落地前，它们仍然只算 top-level signal。
这条规则的适用对象必须从 live machine surfaces 读取：standard Agent registry 列出已注册 Agent；selected checkout 与 owner contracts 决定其当前 generated/hosted surface 是否可用；`workstreams.json` 只列出 active workstream，`domains.json` 只保留 workspace/runtime/legacy domain manifest 配置，`task-topology.json` 的 `under_definition` / `not_registered` / `candidate_domain_agent_pending` entry 与 candidate backlog 共同说明仍在 formal inclusion 之下的 candidate lane。当前机器面把 `Grant Ops` 归入已收录 `MedAutoGrant` Agent；候选 lane 仍需要完整 admission package 才能进入 registry。

## 执行模型审查配套文档

当审查者判断一个 onboarding package 是否真的与当前 `OPL` 的执行方向对齐时，应先看当前 Codex-default executor 与 provider-backed stage-runtime 口径：

- [OPL Runtime 命名与边界合同](../runtime/opl-runtime-naming-and-boundary-contract.md) — 当前 Codex-default executor、provider-backed stage runtime、host-agent / managed runtime deployment-shape 口径
- [家族 Executor Adapter 默认口径](../references/runtime-substrate/family-executor-adapter-defaults.md) — 当前家族执行器命名、默认模式、默认模型与退役 executor guard（中文内部参考）

如果审查时仍需要追溯历史迁移上下文，再单独参考下面这些历史材料：

- [Codex-default Host-Agent Runtime 合同](../history/runtime-substrate/host-agent-runtime-contract.md) — 历史本地 host-agent runtime 合同，当前有效内容已吸收到 runtime 命名与边界合同
- [四仓统一开发运行合同](../history/frontdoor-legacy/development-operating-model.md) — 历史 `Codex Host` / `OMX` 迁移纪律；不是当前执行手册（中文内部参考）
- [四仓统一对齐检查表与任务板](../history/frontdoor-legacy/runtime-alignment-taskboard.md) — 已退役四仓收口清单的历史参考
- [OMX 历史资料索引](../history/omx/README.md) — 已退役 OMX 时代工作流材料的墓碑页（中文历史参考）

当前活跃执行路径在 concrete executor 层保持 Codex-default，在 framework runtime 层对齐 provider-backed stage runtime；这些配套文档只用于帮助审查当前 execution-model wording，并把它与保留下来的历史迁移边界分开。
它们**不会**把 `OPL` 变成候选 domain 的 runtime owner。

## 核心承诺

一个新 domain 只有在下面这些条件都满足时，才能被 `OPL` 正式收录：

- 它的 registry identity 是显式的
- 它的 truth ownership 是显式的
- 它的 public domain-agent entry 与内部 harness boundary 是显式的
- 它的 review surface 是显式的
- 它的 execution model 与 `OPL` 的 `Codex CLI + autonomous 模式 + 共享基座分层` 方向是显式对齐的
- 顶层 stage selection 可以不靠 prose 猜测就指向它

`OPL` 不接受“先挂名，后补边界”的 onboarding。

## 非目标

这份合同不允许：

- 把 `OPL` 变成新 domain 的 runtime owner
- 让一个 domain 只作为 `OPL` 下面的内部实现细节存在
- 仅凭产品名、仓库链接或未来意图就完成 domain 收录
- 用 family 名直接替代 workstream semantics，而不提供显式顶层映射
- 收录一个把主流程定义成 `fixed-code-first`、或只打算长期提供单模执行面的 domain

## 必需的 Onboarding Package

### 1. Registry Material

一个新 domain 必须提供完整 registry package。

#### 必需的 standard Agent registry entry

候选必须在 shared standard Agent registry 中定义稳定身份、别名、package/module locator 与 series membership，并在 owner repo 中提供 `domain_descriptor`、`action_catalog` 和 stage manifest。标准 Agent 的公开发现不得依赖 `domains.json` 条目。

Owner domain descriptor 必须完整定义活跃 domain-agent 字段：

- `domain_id`
- `label`
- `project`
- `independent_domain_agent`
- `single_app_skill`
- `domain_truth_owner`
- `opl_projection_role`
- `runtime_dependency_boundary`
- `standalone_allowed`
- `owned_workstreams`
- `non_opl_families`

#### 条件必需的 workspace/workstream registry entry

只有当新 Agent 同时引入 OPL workspace/runtime topology 或新的 OPL workstream 时，才需要更新 `domains.json`、`workstreams.json` 或 `task-topology.json`。这些配置不参与 standard Agent discovery。新 workstream entry 覆盖全部 `G1` 字段：

- `workstream_id`
- `label`
- `status`
- `description`
- `domain_id`
- `entry_mode`
- `primary_families`
- `top_level_intents`
- `notes`

如果这个新 domain 接管的是一个已经定义过的 workstream，那么这次 ownership 变更也必须在 workstream registry 里显式表达出来。

#### 必需的 stage vocabulary 影响说明

Onboarding package 还必须说明这个新 domain：

- 是完全复用现有 stage vocabulary
- 还是需要新增 `intent_id`、`delivery_kind`、`review_kind` 或其他顶层 vocabulary entry

任何 vocabulary 扩张，都不能只停留在 prose 里暗示。

### 2. Public Documentation Surface

一个新 domain 必须提供公开、可审阅的文档面，让外部读者在不进入 runtime 的情况下也能看清边界。

至少必须提供：

- 一个公开的 domain README，或等价的 domain-agent entry 文档
- 明确写清 public domain-agent entry 以及其下的 internal harness/controller boundary
- 明确写清它保持独立可用，而不是 `OPL` 的内部模块
- 说明它拥有的 workstream、deliverable object 与 review semantics
- 说明它的 stable agent runtime / tool / controller surface，以及代码与 Agent 的分工边界
- 提供足够公开 wording，让 `OPL` 顶层文档可以链接它，而不需要替它发明身份

公开面还必须吸收旧 product-entry / direct-entry 计划中仍有效的内容，但已退役 Hermes-first 或 Gateway-first 路线不得恢复。

每个 domain onboarding package 都必须显式区分三类入口：

| 入口类型 | 固定含义 | OPL 审查重点 |
| --- | --- | --- |
| `operator_entry` | 面向工程操作者的命令、脚本、调试或运维入口 | 可以存在，但不能伪装成普通用户产品入口。 |
| `agent_entry` | 面向 Codex 或其他 host-agent 的 CLI、MCP、controller 或 app skill callable surface | 必须结构化、可审计、可失败；不能只是一段 prompt。 |
| `product_entry` | 面向最终用户的启动、恢复、会话、路由与交互入口 | 必须清楚说明当前是否已经成熟；不允许把未来 hosted/web 目标写成当前现实。 |

如果旧 domain manifest 仍携带 `frontdoor_surface` 或等价 legacy 字段，onboarding package 必须把这层含义迁移到上面的当前入口分类中。保留的旧字段名只能作为 historical / provenance evidence，不能再作为 OPL 默认路由、readiness 或 compatibility surface。

如果 domain 暴露 `operator_loop_surface` 或等价当前 loop 字段，必须同时说明：

- `operator_loop_surface` 是否仍承担真实 runtime / controller loop；
- direct domain path 与 OPL-hosted path 如何共享 owner receipts、artifact locator 和 return surface；
- 哪些入口只是 historical / diagnostic route，不能作为默认路线。

`OPL -> domain` handoff envelope 至少要能表达：

- `target_domain_id`
- `task_intent`
- `entry_mode`
- `workspace_locator`
- `runtime_session_contract`
- `return_surface_contract`
- `domain_truth_authority_refs`
- `artifact_locator_refs`

这些字段只把 stage selection 和 handoff 送到正确 domain-agent entry；它们不会把 domain truth、quality verdict、artifact authority 或 user-facing delivery ownership 迁入 OPL。

## 3. Truth Ownership Declaration

一个新 domain 必须显式声明它拥有什么 truth。

这个声明必须精确到让读者能判断：

- 哪些 runtime truth 仍然留在 domain 内部
- 哪些 run / delivery / audit / review record 归这个 domain 所有
- 哪些内容 `OPL` 只允许做 index、projection 或 stage selection
- 哪些内容 `OPL` 绝不能宣称是 canonical truth

只要 truth ownership 仍然模糊，这个 domain 就不能被正式收录。

## 4. Review Surface Declaration

一个新 domain 必须暴露显式 review surface，而不是只宣称“能执行”。

Onboarding package 必须说明：

- 有哪些 human review surface
- 有哪些 publish 或 release gate
- 有哪些 quality-regression 或同级别 review hook
- 顶层 `OPL` stage selection 与 projection 如何引用这些 review semantics

如果一个 domain 说不清工作如何被审阅，就还不具备正式 domain-agent 收录条件。

## 5. Execution Model Declaration

一个新 domain 必须显式声明它的执行模型如何与 `OPL` 对齐，而不是只说“能运行”。

Onboarding package 必须说明：

- 默认执行器正式名称是否是 `Codex CLI`、默认模式是否是 `autonomous`、默认模型 / 默认 reasoning effort 是否继承本机 `Codex` 默认配置，以及它依赖的 stable agent runtime surface 是什么
- 当前仓库主线是否是 `Auto-only`；如果是，未来 `Human-in-the-loop` 产品会如何作为兼容 sibling 或 upper-layer product 复用同一 substrate，而不是把当前仓强行改成同仓双模
- formal-entry matrix 如何通过 `default_formal_entry`、`supported_protocol_layer` 与 `internal_controller_surface` 表达
- 任何 `Hermes-Agent experimental` 执行路线是否被显式声明为非默认 receipt/audit adapter，以及旧 provider/Gateway 用法是否已迁入历史、诊断或负向 guard
- 代码承担哪些 stable object / controller / tool / gate / review 责任
- 哪些部分绝不能被描述成 `fixed-code-first` 主流程，只让 Agent 做少量 prompt 补位

如果一个 domain 说不清执行模型如何与 `OPL` 的统一范式对齐，就还不具备正式 domain-agent 收录条件。

## 6. Stage Selection Readiness Declaration

一个新 domain 必须显式声明：OPL stage selection 如何到达它的公开入口。

Onboarding package 必须说明：

- stage selection 最终指向哪个 domain-agent entry surface
- 哪些 workstream ID 会通过这个 entry 变成可选择对象
- 哪些 wording 明确把 selection 保持在 framework 层，而不提前暗示 OPL 持有 domain truth

仅有顶层信号或 domain-direction evidence，不足以满足这一 package。

## 7. Stage Execution Readiness Declaration

一个新 domain 必须显式声明：被选中的 stage 如何进入该 domain agent。

Onboarding package 必须说明：

- 哪个 domain-agent entry 是唯一允许的 successful stage target
- 哪些 workstream ID 会进入 stage-eligible 集合
- 哪些显式 stage / handoff evidence 能把 no-bypass-to-internal-harness 规则继续保持为硬边界
- 每个可持久化 stage attempt 如何按 `Stage Folder + Manifest + Receipt` 物化到外部 runtime artifact root
- 每个 stage 的 required output roles、manifest schema refs、owner receipt kinds、typed blocker kinds、decision receipt kinds、current/latest pointer 规则和 retention / restore policy
- 如何从 stage folder 重建 stage status / explain，而不依赖 domain 私有状态表、UI projection 或目录存在启发式

如果这份 package 不能把唯一成功目标保持在 public domain-agent entry，它就还不是 stage-execution-ready。
公开 scaffold 或方向提示本身，也不足以满足这一 package。

## 7.5 Stage Artifact Contract Readiness

标准 OPL Agent 的 admission package 必须声明 stage-native artifact contract。OPL 接受的是可物化、可校验、可恢复的 stage 单元，而不是任意输出目录。

最小要求如下：

- `success`、`blocked`、`skipped/deferred` 三类终态必须都能落成 receipt：`success` 需要 required outputs、valid manifest 和 owner receipt；`blocked` 需要 typed blocker 和 missing/failed evidence；`skipped/deferred` 需要 explicit decision receipt。
- manifest 必须把 physical output path、role、content hash、producer、input refs、lineage refs、receipt refs、current/canonical/export eligibility 和 repair classification 写清楚。
- OPL projection、DB、UI、artifact gallery 和 status read model 必须能从 stage folders 重建；domain repo 可以保留 domain-owned truth table 或 review ledger，但不能要求 OPL 读取它们来解释基本 stage progress。
- 文件存在、目录存在、render/export bundle 存在或 provider completion 都不能被声明为 stage complete。缺 owner receipt 的文件必须投影为 orphan artifact；receipt/manifest 指向但文件缺失或 hash 不匹配必须投影为 broken artifact；未被 current/latest pointer 指向的旧 attempt 只能投影为 historical evidence。

对 RCA 这类 visual deliverable domain，stage output role 应按 domain contract 固定，例如 source truth pack、material inventory、strategy brief、storyboard/page plan、render manifest、review verdict、repair plan、handoff manifest、canonical artifact refs 和 export bundle refs。OPL 只审查这些 role 是否可被 manifest / receipt / pointer 稳定定位，不审查视觉质量或 export verdict。

## 8. Cross-Domain Wording Alignment

一个新 domain 必须暴露足够的 OPL/domain 双侧 linked wording，让审查者能验证双方使用的是同一套顶层角色语言。

Onboarding package 必须说明：

- 哪些 OPL public surface 承载这组 linked role wording
- 哪些 domain public surface 承载匹配的 wording
- 哪句边界声明用来防止 signal-only scaffold 被误读成 admission、stage-selection readiness、stage-execution readiness 或 handoff readiness

如果这组 wording 不能被显式审查，这个 domain 就仍然位于 formal inclusion 之下。

当前 candidate path 以 `task-topology.json` 和 [OPL Candidate Domain Backlog](../references/domain-admission/opl-candidate-domain-backlog.md) 为准；本文只复述其审查姿态。当前机器面中的 `IP Ops`、`Award Ops`、`Review Ops` 与 `Thesis Ops` 都仍然位于 formal inclusion 之下，没有 `current_domain_id`，没有 `entry_surface`，且 `formal_domain_required=true`。
`IP Ops` 的 patent truth 与人工/法律审阅 gate 必须留在未来 domain 一侧，并在 future domain boundary package 存在前保持在 `OPL` 与 `MedAutoGrant` 之外。
`Award Ops` 的 award truth 与人工专家审阅 gate 必须留在未来 domain 一侧，并在 future domain boundary package 存在前保持在 `OPL` 与 `MedAutoGrant` 之外。
`Review Ops` 必须把 `execution_model`、`stage_selection_readiness`、`stage_execution_readiness` 与 `cross_domain_wording` 四类 package 持续保持为显式 blocker，同时把 review truth 留在未来 domain 一侧，并继续不具备 handoff-ready domain-agent entry。
`Thesis Ops` 也必须把 `execution_model`、`stage_selection_readiness`、`stage_execution_readiness` 与 `cross_domain_wording` 四类 package 持续保持为显式 blocker；它继续区别于 `Research Ops` 的 manuscript/submission flow 与 `Presentation Ops` / `RedCube AI` 的 deck production，并继续不具备 handoff-ready domain-agent entry。

## 正式收录门槛

一个 domain 只有在下面全部成立时，才算可被 `OPL` 正式收录：

1. **Registry complete**  
   必需 registry entry 已存在，且内部一致。

2. **Boundary explicit**  
   该 domain README 与 `OPL` 顶层文档都能无歧义地描述它。

3. **Truth ownership explicit**  
   Canonical truth 仍留在 domain 内部，没有被悄悄上收给 `OPL`。

4. **Stage selection ready**
   OPL stage selection 能识别这个 domain、它拥有的 workstream，以及正确 public entry surface。

5. **Stage execution ready**
   Stage execution 能带着显式 evidence 进入 public domain-agent entry，且不会绕过 domain-owned harness/controller boundary。

6. **Stage artifact ready**
   Stage attempt 能以 `Stage Folder + Manifest + Receipt` 物化，且 OPL 可以从 physical outputs、manifest validity、receipt authority 与 current pointer 重建 progress / blocker / repair 状态。

7. **Review ready**
   这个 domain 暴露了显式 review semantics，而不只是执行入口。

8. **Execution model aligned**
   这个 domain 明确保持 `Agent-first`，诚实描述当前 `Auto-only` 主线，并给出未来 `Human-in-the-loop` 产品如何以 substrate-compatible 的 sibling 或 upper-layer 形式复用同一基座，而不是把当前仓强行做成同仓双模或漂移成 `fixed-code-first` 主流程。

9. **Cross-domain wording aligned**
   `OPL`、该 domain README 以及相关公开表面，在顶层角色语言上保持一致。

只要其中任意一条不成立，这个 domain 仍可以处于讨论或设计中，但还不能算正式收录。

## 硬性禁止项

下面这些做法都不允许：

- 在 boundary package 还不存在时，就先把 domain 名字加入 `OPL` 导航
- 在 truth ownership 还是“以后再定”的情况下就收录 domain
- 把现有 domain harness 误当成自动定义了一个新 domain-agent entry
- 把 family 或 profile 名误当成已经自动定义了顶层 workstream
- 在 stage selection 与 execution surface 还没更新时，就宣称 domain 已正式 onboard
- 允许一个 domain 在 admission 时回避 `Agent-first` / 当前 `Auto-only` / 未来 `Human-in-the-loop` 分层问题，或把主流程写成 `fixed-code-first`

## 最小 Onboarding 审查问题

一个 domain 在正式收录前，顶层 review 至少要能清楚回答：

- 它拥有哪个 workstream，或哪几个 workstream？
- 它暴露什么 public domain-agent entry？
- 它下面是什么 harness/controller surface？
- 哪些 truth 在这个 domain 内部保持 canonical？
- 哪些 family 位于这个 domain 内，但不自动等于某个 OPL workstream？
- `OPL` 如何在 stage 边界选择并进入它？
- stage attempt 如何物化为 stage folder，manifest / receipt / current pointer 如何证明 progress？
- 它依赖什么 stable agent runtime surface？
- 当前 `Auto-only` 仓如何与未来 `Human-in-the-loop` sibling 或 upper-layer product 保持兼容，而不是变成两套互不相干的系统？
- 为什么这应被视作一个新 domain，而不是现有 domain 里的一个 family？

如果这些问题答不清，这个 onboarding 就还没准备好。

## 完成定义

只有当未来的新 domain 都能被放到这套稳定顶层门槛下审查，而不再依赖临时 wording 时，domain onboarding contract 才算真正冻结完成。
