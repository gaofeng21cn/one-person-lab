[English](./shared-foundation.md) | **中文**

# 共享基础结构

> 当前状态说明（`2026-04-25`）：本文是共享基础结构参考，早于当前公开主语收口。下文 `domain gateway / harness` 按内部兼容语言理解；当前公开文档应把 `MAS`、`MAG`、`RCA` 写成可由 OPL activation 或 Codex/app-skill direct entry 调用的独立 domain agents。

`OPL` 之所以能把多个工作流纳入同一体系，不只是因为它们都能让 Agent 参与，而是因为它们通过 federation model 复用同一套基础层。

共享基础结构的含义是：不同 domain agent 使用兼容的资产、记忆、治理、交付与执行语言。
`OPL` 负责共享语言与索引层，而具体对象的 canonical truth 继续留在 domain-owned surface，或留在尚未进入 formal domain admission 的 human/private 材料里。

## 当前 Auto 主线与未来 HITL 分层

`OPL` 顶层现在冻结的是一条更窄、更可执行的规则：

- 当前各个 domain 仓都先按 `Auto-only` 主线理解
- 未来如果要做 `Human-in-the-loop` 产品，应在同一 substrate 之上另建兼容的 sibling 或 upper-layer product

当前规则要求在下面这些方面继续共享同一套可复用基础层：

- 当前全自动执行
- 未来高判断密度的人机回环返回点

因此，真正需要跨 workstream 复用的，不只是数据、文献和模板，也包括：

- 可复用的判断记忆
- continue / stop / reframe gate
- review surface
- 审计回写语言
- Agent runtime 所依赖的显式 formal-entry matrix：默认正式入口 `CLI`、支持协议层 `MCP`、`controller` 仅作为 internal control surface

## 资产层

`资产层` 承载会被多个工作流反复消费的对象：

- 数据资产
- 文献与参考资料
- 图表与模板
- 已完成的正式交付物

如果没有这一层，每个工作流都会复制自己的事实底座。

## 记忆层

`记忆层` 承载不应只停留在即时会话中的结构化判断：

- 选题记忆
- 数据问题映射
- 期刊偏好
- 基金方偏好
- 评审经验
- 教学素材结构

它的目的不是保存所有对话，而是保存可复用判断。

## 治理层

`治理层` 回答的是：什么时候允许继续，什么时候应该停下来。

它覆盖：

- continue / stop gate
- 证据是否充足
- 是否需要改题或改路线
- 何时允许进入正式交付

没有这一层，执行过程就会失去明确控制。

## 交付层

`交付层` 把过程性产物收束为正式输出。

它定义：

- 哪些文件构成交付包
- 人类应该审核哪些表面
- 上游资产如何同步到下游正式材料

不同工作流的交付协议可以不同，但交付层本身必须存在。

## 智能体执行层

`智能体执行层` 让 Agent 成为可控、可审阅的执行者。

它关注：

- 稳定入口
- route / controller
- 执行可见性
- 审计回写

这一层让人类只看关键输出，不必盯住底层执行细节。
它也意味着 `OPL` 默认采用 `Agent-first`，并把代码的职责收口到稳定结构、工具与 gate 上。

## 联邦消费方式

在理想的 `OPL` 结构里：

- OPL 在 session/runtime、activation 与 indexing 层声明共享基础结构语言
- 每个 domain agent 把这套语言水化到自己的工作流
- 每个 domain-owned truth surface 再按 domain 规则执行、落盘、审计与交付

这就是为什么共享基础结构应位于任何单一 domain 仓库之上。

## 当前已经清楚的部分

今天，`Research Foundry` 上这五层最清楚的具象化是：

- `MedAutoScience` 作为 active 的 research domain agent

视觉交付上最清楚的 emerging 具象化是：

- `RedCube AI` 作为视觉交付 domain agent，其中 `ppt_deck` 是最直接映射到 `Presentation Foundry` 的 family

也正因为如此，`OPL` 已经不只是概念层。
它已经有三个 active domain-agent surface：`MAS`、`MAG`、`RCA`。

## 延伸阅读

- [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)
