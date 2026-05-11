[English](./opl-domain-onboarding-contract.md) | **中文**

# OPL Domain-Agent Admission Contract

> 当前状态说明（`2026-05-11`）：本文是候选 domain-agent admission review 的活跃人读支撑。当前已收录 domain 同时保留 direct Codex/domain-skill activation 与 durable OPL stage-attempt hosting：`Codex-default executor -> explicit OPL activation -> provider-backed stage runtime -> selected domain-agent entry`，`MAS`、`MAG`、`RCA` 对外仍是独立 domain agent。

## 目的

本文定义当前新 domain agent 被 OPL framework 收录前必须通过的审查合同。

它的目标是定义：未来一个新 domain-agent system 在什么条件下，才能被 `OPL` stage-led framework 选择，同时不模糊 ownership、stage selection 与 truth boundary。

目标不是先把 domain 名字挂上去，后面再慢慢补边界。
目标是要求“先有显式边界材料，后有正式收录”。

## 与活跃 Framework 合同的关系

Domain-agent admission 以当前活跃 framework 合同集为审查依据：

- [OPL Candidate Domain Backlog](../references/domain-admission/opl-candidate-domain-backlog.zh-CN.md)
- 当前仓库中的机器可读合同面：[`../contracts/opl-framework/README.zh-CN.md`](../../contracts/opl-framework/README.zh-CN.md)

如果 domain-agent identity、stage capability package、truth ownership 与 product entry surface 不稳定，admission 不应继续推进。

## 机器可读配套工件

- [`../contracts/opl-framework/domains.json`](../../contracts/opl-framework/domains.json)
- [`../contracts/opl-framework/workstreams.json`](../../contracts/opl-framework/workstreams.json)
- [`../contracts/opl-framework/task-topology.json`](../../contracts/opl-framework/task-topology.json)

这些合同把已收录 domain-agent catalog 与 stage topology 落成 non-executing framework surface。
它们不会授予 OPL domain truth，也不会自动收录候选 workstream。
公开 scaffold 或 domain-direction hint 可以帮助说明 candidate path，但在真实 domain-agent boundary package 落地前，它们仍然只算 top-level signal。
这条规则现在只作用于剩余候选 workstream：`Grant Ops` 已经进入已收录的 `MedAutoGrant` domain-agent entry，而 `IP Ops`、`Award Ops`、`Thesis Ops` 与 `Review Ops` 仍然需要完整 admission package 才能完成正式收录。

## 执行模型审查配套文档

当审查者判断一个 onboarding package 是否真的与当前 `OPL` 的执行方向对齐时，应先看当前 Codex-default executor 与 provider-backed stage-runtime 口径：

- [OPL Runtime 命名与边界合同](./opl-runtime-naming-and-boundary-contract.zh-CN.md) — 当前 Codex-default executor、provider-backed stage runtime、host-agent / managed runtime deployment-shape 口径
- [家族 Executor Adapter 默认口径](../references/runtime-substrate/family-executor-adapter-defaults.md) — 当前家族执行器命名、默认模式、默认模型与 `Hermes-Agent` 实验边界（中文内部参考）

如果审查时仍需要追溯历史迁移上下文，再单独参考下面这些历史材料：

- [Codex-default Host-Agent Runtime 合同](../history/runtime-substrate/host-agent-runtime-contract.md) — 历史本地 host-agent runtime 合同，当前有效内容已吸收到 runtime 命名与边界合同
- [四仓统一开发运行合同](../history/frontdoor-legacy/development-operating-model.md) — 历史 `Codex Host` / `OMX` 迁移纪律；不是当前执行手册（中文内部参考）
- [四仓统一对齐检查表与任务板](../history/frontdoor-legacy/runtime-alignment-taskboard.md) — 已退役四仓收口清单的历史参考
- [OMX 历史资料索引](../history/omx/README.zh-CN.md) — 已退役 OMX 时代工作流材料的墓碑页（中文历史参考）

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

#### 必需的 domain-agent registry entry

该 domain entry 必须完整定义活跃 domain-agent 字段：

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

#### 必需的 workstream registry entry

如果这个新 domain 拥有一个新的 OPL workstream，它还必须提供完整的 workstream entry，覆盖全部 `G1` 字段：

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

公开面还必须吸收旧 product-entry / direct-entry 计划中仍有效的内容，但不能继承旧 Hermes-first 或 Gateway-first 路线。

每个 domain onboarding package 都必须显式区分三类入口：

| 入口类型 | 固定含义 | OPL 审查重点 |
| --- | --- | --- |
| `operator_entry` | 面向工程操作者的命令、脚本、调试或运维入口 | 可以存在，但不能伪装成普通用户产品入口。 |
| `agent_entry` | 面向 Codex 或其他 host-agent 的 CLI、MCP、controller 或 app skill callable surface | 必须结构化、可审计、可失败；不能只是一段 prompt。 |
| `product_entry` | 面向最终用户的启动、恢复、会话、路由与交互入口 | 必须清楚说明当前是否已经成熟；不允许把未来 hosted/web 目标写成当前现实。 |

如果 domain 已经暴露 `frontdoor_surface`、`operator_loop_surface` 或等价字段，必须同时说明：

- `frontdoor_surface` 是否是真正的用户入口，还是只是一层 product-entry shell；
- `operator_loop_surface` 是否仍承担真实 runtime / controller loop；
- direct domain path 与 OPL-hosted path 如何共享 owner receipts、artifact locator 和 return surface；
- 哪些入口只是 historical / diagnostic / compatibility route，不能作为默认路线。

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
- 任何被写成 `Hermes-Agent experimental` 的执行路线，是否真的是完整 `Hermes AIAgent` loop，而不是单步 chat 或 chat relay
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

如果这份 package 不能把唯一成功目标保持在 public domain-agent entry，它就还不是 stage-execution-ready。
公开 scaffold 或方向提示本身，也不足以满足这一 package。

## 8. Cross-Domain Wording Alignment

一个新 domain 必须暴露足够的 OPL/domain 双侧 linked wording，让审查者能验证双方使用的是同一套顶层角色语言。

Onboarding package 必须说明：

- 哪些 OPL public surface 承载这组 linked role wording
- 哪些 domain public surface 承载匹配的 wording
- 哪句边界声明用来防止 signal-only scaffold 被误读成 admission、stage-selection readiness、stage-execution readiness 或 handoff readiness

如果这组 wording 不能被显式审查，这个 domain 就仍然位于 formal inclusion 之下。

就当前 candidate path 而言，`IP Ops`、`Award Ops`、`Review Ops` 与 `Thesis Ops` 都仍然位于 formal inclusion 之下。
`IP Ops` 会把 patent truth 与人工/法律审阅 gate 留在未来 domain 一侧，并在 future domain boundary package 存在前保持在 `OPL` 与 `MedAutoGrant` 之外。
`Award Ops` 会把 award truth 与人工专家审阅 gate 留在未来 domain 一侧，并在 future domain boundary package 存在前保持在 `OPL` 与 `MedAutoGrant` 之外。
`Review Ops` 会把 `execution_model`、`stage_selection_readiness`、`stage_execution_readiness` 与 `cross_domain_wording` 四类 package 持续保持为显式 blocker，同时把 review truth 留在未来 domain 一侧，并继续不具备 handoff-ready domain-agent entry。
`Thesis Ops` 也会把 `execution_model`、`stage_selection_readiness`、`stage_execution_readiness` 与 `cross_domain_wording` 四类 package 持续保持为显式 blocker；它继续区别于 `Research Ops` 的 manuscript/submission flow 与 `Presentation Ops` / `RedCube AI` 的 deck production，并继续不具备 handoff-ready domain-agent entry。

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

6. **Review ready**  
   这个 domain 暴露了显式 review semantics，而不只是执行入口。

7. **Execution model aligned**
   这个 domain 明确保持 `Agent-first`，诚实描述当前 `Auto-only` 主线，并给出未来 `Human-in-the-loop` 产品如何以 substrate-compatible 的 sibling 或 upper-layer 形式复用同一基座，而不是把当前仓强行做成同仓双模或漂移成 `fixed-code-first` 主流程。

8. **Cross-domain wording aligned**
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
- 它依赖什么 stable agent runtime surface？
- 当前 `Auto-only` 仓如何与未来 `Human-in-the-loop` sibling 或 upper-layer product 保持兼容，而不是变成两套互不相干的系统？
- 为什么这应被视作一个新 domain，而不是现有 domain 里的一个 family？

如果这些问题答不清，这个 onboarding 就还没准备好。

## 完成定义

只有当未来的新 domain 都能被放到这套稳定顶层门槛下审查，而不再依赖临时 wording 时，domain onboarding contract 才算真正冻结完成。
