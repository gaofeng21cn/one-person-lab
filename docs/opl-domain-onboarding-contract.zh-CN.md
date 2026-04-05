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
- 当前仓库中的机器可读合同面：[`../contracts/opl-gateway/README.zh-CN.md`](../contracts/opl-gateway/README.zh-CN.md)

如果顶层 registry、discovery 与 routed-action 这几层还不稳定，domain onboarding 不应继续推进。

## 机器可读配套工件

- [`../contracts/opl-gateway/domain-onboarding-readiness.schema.json`](../contracts/opl-gateway/domain-onboarding-readiness.schema.json)
- [`../examples/opl-gateway/domain-onboarding-readiness.json`](../examples/opl-gateway/domain-onboarding-readiness.json)

这个 schema 把 onboarding-readiness record 落成 non-executing contract surface。
它不会自动收录 domain，也不会取代本文件中的 prose review gate。
这条 example record 只是 illustrative 示例，不构成正式 domain 收录。

## 核心承诺

一个新 domain 只有在下面这些条件都满足时，才能被 `OPL` 正式收录：

- 它的 registry identity 是显式的
- 它的 truth ownership 是显式的
- 它的 public gateway / harness boundary 是显式的
- 它的 review surface 是显式的
- 顶层 discovery 与 routing 可以不靠 prose 猜测就指向它

`OPL` 不接受“先挂名，后补边界”的 onboarding。

## 非目标

这份合同不允许：

- 把 `OPL` 变成新 domain 的 runtime owner
- 让一个 domain 只作为 `OPL` 下面的内部实现细节存在
- 仅凭产品名、仓库链接或未来意图就完成 domain 收录
- 用 family 名直接替代 workstream semantics，而不提供显式顶层映射

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

7. **Cross-domain wording aligned**  
   `OPL`、该 domain README 以及相关公开表面，在顶层角色语言上保持一致。

只要其中任意一条不成立，这个 domain 仍可以处于讨论或设计中，但还不能算正式收录。

## 硬性禁止项

下面这些做法都不允许：

- 在 boundary package 还不存在时，就先把 domain 名字加入 `OPL` 导航
- 在 truth ownership 还是“以后再定”的情况下就收录 domain
- 把现有 domain harness 误当成自动定义了一个新 domain gateway
- 把 family 或 profile 名误当成已经自动定义了顶层 workstream
- 在 discovery 与 routing surface 还没更新时，就宣称 domain 已正式 onboard

## 最小 Onboarding 审查问题

一个 domain 在正式收录前，顶层 review 至少要能清楚回答：

- 它拥有哪个 workstream，或哪几个 workstream？
- 它暴露什么 gateway surface？
- 它下面是什么 harness surface？
- 哪些 truth 在这个 domain 内部保持 canonical？
- 哪些 family 位于这个 domain 内，但不自动等于某个 OPL workstream？
- `OPL` 如何 discover 并 route 到它？
- 为什么这应被视作一个新 domain，而不是现有 domain 里的一个 family？

如果这些问题答不清，这个 onboarding 就还没准备好。

## 完成定义

只有当未来的新 domain 都能被放到这套稳定顶层门槛下审查，而不再依赖临时 wording 时，domain onboarding contract 才算真正冻结完成。
