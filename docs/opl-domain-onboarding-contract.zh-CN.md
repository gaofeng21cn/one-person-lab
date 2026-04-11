[English](./opl-domain-onboarding-contract.md) | **中文**

# OPL Domain Onboarding Contract

## 目的

这份文档冻结 `OPL Gateway` 的 domain onboarding 合同。

它的目标是定义：未来一个新 domain system 在什么条件下，才能被正式纳入 `OPL` federation，同时不模糊 ownership、routing 与 truth boundary。

目标不是先把 domain 名字挂上去，后面再慢慢补边界。
目标是要求“先有显式边界材料，后有正式收录”。

## 与 G1 / G2 / G3 的关系

Domain onboarding 建立在已冻结的 gateway 层之下：

- [OPL Federation Contract](./opl-federation-contract.zh-CN.md)
- [OPL 只读 Discovery Gateway](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.zh-CN.md)
- [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.zh-CN.md)
- 当前仓库中的机器可读合同面：[`../contracts/opl-gateway/README.zh-CN.md`](../contracts/opl-gateway/README.zh-CN.md)

如果顶层 registry、discovery 与 routed-action 这几层还不稳定，domain onboarding 不应继续推进。

## 机器可读配套工件

- [`../contracts/opl-gateway/domain-onboarding-readiness.schema.json`](../contracts/opl-gateway/domain-onboarding-readiness.schema.json)
- [`../examples/opl-gateway/domain-onboarding-readiness.json`](../examples/opl-gateway/domain-onboarding-readiness.json)
- [`../contracts/opl-gateway/candidate-domain-backlog.json`](../contracts/opl-gateway/candidate-domain-backlog.json)

这个 schema 把 onboarding-readiness record 落成 non-executing contract surface。
它不会自动收录 domain，也不会取代本文件中的 prose review gate。
这条 example record 只是 illustrative 示例，不构成正式 domain 收录。
Candidate-domain backlog 则是位于它上游的 blocker surface，用来记录：对于仍在定义中的 workstream，在 onboarding-readiness record 出现之前还缺什么材料。它的人类可读配套说明见 [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.zh-CN.md)。
`OPL` 当前不会在 task topology、backlog 与 onboarding 之间再定义一层独立的 candidate-domain-definition contract；除非先证明这三层之间还存在真实缺口，否则现有三层组合就是当前 definition path。
公开 scaffold 或 domain-direction hint —— 例如当前 `Grant Ops` 方向上的 `Grant Foundry -> Med Auto Grant` —— 可以帮助说明 candidate path，但它们仍然只算 top-level signal / domain-direction evidence。
它们不能替代 onboarding package，不等于已正式收录的 domain gateway，也不等于 `G2` discovery readiness，更不等于 `G3` routed-action readiness。

## 执行模型审查配套文档

当审查者判断一个 onboarding package 是否真的与当前 `OPL` 的执行方向对齐时，应先看当前 Codex-only 执行口径：

- [Codex-default Host-Agent Runtime 合同](./references/host-agent-runtime-contract.md) — 当前本地默认 runtime 口径（中文内部参考）

如果审查时仍需要追溯历史迁移上下文，再单独参考下面这些历史材料：

- [四仓统一开发运行合同](./references/development-operating-model.md) — 历史 `Codex Host` / `OMX` 迁移纪律与兼容长跑 `worktree` 规则（中文内部参考）
- [四仓统一对齐检查表与任务板](./references/runtime-alignment-taskboard.md) — 已退役四仓收口清单的历史参考
- [OMX 历史资料索引](./history/omx/README.zh-CN.md) — 兼容性长跑规则与迁移资料入口（中文历史参考）

当前活跃执行入口仍是 Codex-only；这些配套文档只用于帮助审查当前 execution-model wording，并把它与保留下来的历史迁移边界分开。
它们**不会**把 `OPL` 变成候选 domain 的 runtime owner。

## 核心承诺

一个新 domain 只有在下面这些条件都满足时，才能被 `OPL` 正式收录：

- 它的 registry identity 是显式的
- 它的 truth ownership 是显式的
- 它的 public gateway / harness boundary 是显式的
- 它的 review surface 是显式的
- 它的 execution model 与 `OPL` 的 `Agent-first + 共享基座分层` 方向是显式对齐的
- 顶层 discovery 与 routing 可以不靠 prose 猜测就指向它

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

#### 必需的 domain registry entry

该 domain entry 必须完整定义 `G1` domain fields：

- `domain_id`
- `label`
- `project`
- `role`
- `gateway_surface`
- `harness_surface`
- `standalone_allowed`
- `owned_workstreams`
- `non_opl_families`
- `canonical_truth_owner`

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

#### 必需的 routing vocabulary 影响说明

Onboarding package 还必须说明这个新 domain：

- 是完全复用现有 routing vocabulary
- 还是需要新增 `intent_id`、`delivery_kind`、`review_kind` 或其他顶层 vocabulary entry

任何 vocabulary 扩张，都不能只停留在 prose 里暗示。

### 2. Public Documentation Surface

一个新 domain 必须提供公开、可审阅的文档面，让外部读者在不进入 runtime 的情况下也能看清边界。

至少必须提供：

- 一个公开的 domain README，或等价的 gateway 入口文档
- 明确写清它是 `domain gateway`，其下还有自己的 `harness`
- 明确写清它保持独立可用，而不是 `OPL` 的内部模块
- 说明它拥有的 workstream、deliverable object 与 review semantics
- 说明它的 stable agent runtime / gateway / tool / controller surface，以及代码与 Agent 的分工边界
- 提供足够公开 wording，让 `OPL` 顶层文档可以链接它，而不需要替它发明身份

## 3. Truth Ownership Declaration

一个新 domain 必须显式声明它拥有什么 truth。

这个声明必须精确到让读者能判断：

- 哪些 runtime truth 仍然留在 domain 内部
- 哪些 run / delivery / audit / review record 归这个 domain 所有
- 哪些内容 `OPL` 只允许做 index 或 routing
- 哪些内容 `OPL` 绝不能宣称是 canonical truth

只要 truth ownership 仍然模糊，这个 domain 就不能被正式收录。

## 4. Review Surface Declaration

一个新 domain 必须暴露显式 review surface，而不是只宣称“能执行”。

Onboarding package 必须说明：

- 有哪些 human review surface
- 有哪些 publish 或 release gate
- 有哪些 quality-regression 或同级别 review hook
- 顶层 `OPL` discovery 与 routed handoff 如何引用这些 review semantics

如果一个 domain 说不清工作如何被审阅，就还不具备正式联邦收录条件。

## 5. Execution Model Declaration

一个新 domain 必须显式声明它的执行模型如何与 `OPL` 对齐，而不是只说“能运行”。

Onboarding package 必须说明：

- 默认执行者是否是 `Agent-first`，以及它依赖的 stable agent runtime surface 是什么
- 当前仓库主线是否是 `Auto-only`；如果是，未来 `Human-in-the-loop` 产品会如何作为兼容 sibling 或 upper-layer product 复用同一 substrate，而不是把当前仓强行改成同仓双模
- formal-entry matrix 如何通过 `default_formal_entry`、`supported_protocol_layer` 与 `internal_controller_surface` 表达
- 代码承担哪些 stable object / controller / tool / gate / review 责任
- 哪些部分绝不能被描述成 `fixed-code-first` 主流程，只让 Agent 做少量 prompt 补位

如果一个 domain 说不清执行模型如何与 `OPL` 的统一范式对齐，就还不具备正式联邦收录条件。

## 6. Discovery Readiness Declaration

一个新 domain 必须显式声明：未来 `G2` 只读 discovery 如何到达它的公开入口。

Onboarding package 必须说明：

- discovery 最终指向哪个 `domain_gateway` surface
- 哪些 workstream ID 会通过这个 gateway 入口变成可 discover 的对象
- 哪些 wording 明确把 discovery 保持在只读 / public-entry 层，而不提前暗示 handoff readiness

仅有顶层信号或 domain-direction evidence，不足以满足这一 package。

## 7. Routing Readiness Declaration

一个新 domain 必须显式声明：当未来真的激活 `G3` routing 时，顶层路由如何只 targeting 这个 domain gateway。

Onboarding package 必须说明：

- 哪个 `domain_gateway` surface 是唯一允许的 successful routing target
- 哪些 workstream ID 会进入 routing-eligible 集合
- 哪些显式 routing / handoff evidence 能把 no-bypass 规则继续保持为硬边界

如果这份 package 不能把唯一成功目标保持在 `domain_gateway`，它就还不是 routing-ready。
公开 scaffold 或方向提示本身，也不足以满足这一 package。

## 8. Cross-Domain Wording Alignment

一个新 domain 必须暴露足够的 OPL/domain 双侧 linked wording，让审查者能验证双方使用的是同一套顶层角色语言。

Onboarding package 必须说明：

- 哪些 OPL public surface 承载这组 linked role wording
- 哪些 domain public surface 承载匹配的 wording
- 哪句边界声明用来防止 signal-only scaffold 被误读成 admission、discovery readiness、routing readiness 或 handoff readiness

如果这组 wording 不能被显式审查，这个 domain 就仍然位于 formal inclusion 之下。

就当前 `Phase 1` 的 candidate path 而言，`Review Ops` 与 `Thesis Ops` 都仍然位于 formal inclusion 之下。
`Review Ops` 会把 `execution_model`、`discovery_readiness`、`routing_readiness` 与 `cross_domain_wording` 四类 package 持续保持为显式 blocker，同时把 review truth 留在未来 domain 一侧、继续不具备 handoff-ready surface，任何未来 successful handoff 也仍只能是 `domain_gateway`-only / no-bypass。
`Thesis Ops` 也会把 `execution_model`、`discovery_readiness`、`routing_readiness` 与 `cross_domain_wording` 四类 package 持续保持为显式 blocker；它继续区别于 `Research Ops` 的 manuscript/submission flow 与 `Presentation Ops` / `RedCube AI` 的 deck production、继续不具备 handoff-ready surface，任何未来 successful handoff 也仍只能是 `domain_gateway`-only / no-bypass。

## 正式收录门槛

一个 domain 只有在下面全部成立时，才算可被 `OPL` 正式收录：

1. **Registry complete**  
   必需 registry entry 已存在，且内部一致。

2. **Boundary explicit**  
   该 domain README 与 `OPL` 顶层文档都能无歧义地描述它。

3. **Truth ownership explicit**  
   Canonical truth 仍留在 domain 内部，没有被悄悄上收给 `OPL`。

4. **Discovery ready**  
   `G2` discovery 能识别这个 domain、它拥有的 workstream，以及正确 entry surface。

5. **Routing ready**  
   `G3` routed action 语义能带着显式 evidence 把请求路由进这个 domain gateway，且不会绕过 domain gateway。

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
- 把现有 domain harness 误当成自动定义了一个新 domain gateway
- 把 family 或 profile 名误当成已经自动定义了顶层 workstream
- 在 discovery 与 routing surface 还没更新时，就宣称 domain 已正式 onboard
- 允许一个 domain 在 admission 时回避 `Agent-first` / 当前 `Auto-only` / 未来 `Human-in-the-loop` 分层问题，或把主流程写成 `fixed-code-first`

## 最小 Onboarding 审查问题

一个 domain 在正式收录前，顶层 review 至少要能清楚回答：

- 它拥有哪个 workstream，或哪几个 workstream？
- 它暴露什么 gateway surface？
- 它下面是什么 harness surface？
- 哪些 truth 在这个 domain 内部保持 canonical？
- 哪些 family 位于这个 domain 内，但不自动等于某个 OPL workstream？
- `OPL` 如何 discover 并 route 到它？
- 它依赖什么 stable agent runtime surface？
- 当前 `Auto-only` 仓如何与未来 `Human-in-the-loop` sibling 或 upper-layer product 保持兼容，而不是变成两套互不相干的系统？
- 为什么这应被视作一个新 domain，而不是现有 domain 里的一个 family？

如果这些问题答不清，这个 onboarding 就还没准备好。

## 完成定义

只有当未来的新 domain 都能被放到这套稳定顶层门槛下审查，而不再依赖临时 wording 时，domain onboarding contract 才算真正冻结完成。
