[English](./operating-model.md) | **中文**

# OPL 运行模型

## 核心判断

`OPL` 的核心判断，不是“怎么让一个 Agent 一次性做完一个任务”，而是“怎么让一个研究型个人或极小团队，通过稳定表面持续承担正式实验室工作”。

所以，`OPL` 更准确的理解是面向持续实验室工作的 Codex-default session/runtime 层、显式 activation 层，以及 shared modules / contracts / indexes 的归属层。

## 顶层链路

理想主链应是：

```text
Human / Agent
  -> Codex-default session/runtime
      -> explicit OPL activation
          -> selected domain agent entry
              -> Domain Harness OS / Review Surfaces / Deliveries / Audit Truth
```

当前最清楚的三条映射是：

- `Research Foundry` -> 独立 `domain agent` `MedAutoScience`
- `Grant Foundry` -> 独立 `domain agent` `MedAutoGrant`
- `Presentation Foundry` -> 独立 `domain agent` `RedCube AI` 里的 `ppt_deck`

## 角色分工

### 人类

人类主要负责：

- 定义目标与任务边界
- 提供或授权使用数据、文献和上下文
- 审核关键结论与正式交付物
- 决定继续、停止、改题或提交

### Agent

Agent 主要负责：

- 先读状态再行动
- 调用稳定接口推进任务
- 组织中间产物和正式产物
- 把关键执行过程写回可审计表面

### OPL Activation 与共享基础结构

顶层 `OPL` 层负责：

- 表达顶层任务语义
- 只在显式请求时把任务 activation 到正确的 domain surface
- 定义跨 domain 的共享基础结构要求
- 拥有 shared-foundation 的顶层控制语言，但不接管各 domain 的 canonical truth
- 让跨 domain 的身份、治理与交付语言保持一致
- 维护 family-level shared modules、contracts 与 indexes

当前仓库承担的是这个角色的文档优先公开说明面。

### Domain Agent、Entry 与 Harness

每个独立 `domain agent` 仓应保持三层分开：

- `domain agent` 作为仓库对外公开主语
- domain-owned entry surface 作为该工作流的稳定边界入口
- `Domain Harness OS` 作为该工作流的执行、记录、治理与交付底座

例如：

- `MedAutoScience` 是 `Research Foundry` 的独立 domain agent，其内部继续持有 domain entry、runtime truth 与 harness
- `RedCube AI` 是视觉交付的独立 domain agent，其内部继续持有 domain entry、runtime truth 与 harness

## Agent-first 执行

`OPL` 默认采用 `Agent-first` 执行。
各个 domain 可以选择自己的模型接口，但 `OPL` 层的默认 executor 路径是 `Codex CLI`。
主流程驱动者负责读状态、调用稳定的 domain-owned 工具、组织中间产物、推进 gate，并把关键痕迹写回可审计表面。

在这个模型里，代码的主要职责是提供：

- 稳定对象模型
- route / controller
- 工具封装
- gate 规则
- 审计落盘
- review surface 与交付协议

`OPL` 应避免把 domain workstream 重新压回“固定代码流水线 + 少量 prompt 占位”的形态，否则共享 foundation 仍会存在，但各个 `Ops` 会逐步失去可编排性与可迁移性。

## 当前 Auto 主线与未来 HITL 分层

在 `OPL` 层，当前冻结下来的规则已经不再是“同一个仓里同时暴露两套顶层模式”。
现在统一后的规则是：

- 已收录的 domain 仓按 `Auto-only` 主线理解
- 未来如果要做 `Human-in-the-loop` 产品，应作为 sibling 或 upper-layer product 复用同一套 substrate-compatible contract 与执行模块
- 真正共享的是 substrate contract，而不是同仓模式切换开关

这里的关键区别在于分层方式：未来更高判断密度的上层产品，建立在当前 `Auto-only` 主线之上，并复用同一套稳定 contract、对象语义、审计面与执行模块。
`OPL` 现在冻结的是这种分层规则，并保持当前主线定义清楚。

## 产品入口与 Runtime Manager

当前 repo-tracked 的 formal entry，是通过 `opl`、`opl exec` 与 `opl resume` 暴露的 `Codex CLI` default 路径。
这是当前真实默认入口，同时显式 activation 仍可以选择 domain agent 或非默认 runtime。

更合理的长期方向是：

- 当前继续以 `Codex CLI` 作为 formal executor
- `MCP` 继续作为 supported protocol layer
- domain-owned product entry surface 继续作为 domain workflow、runtime truth 与 delivery truth 的 ownership 边界
- `OPL Runtime Manager` 只作为 external `Hermes-Agent` 之上的 product-managed 薄 adapter

在这条演进线上：

- 顶层 `OPL` 继续定义产品体系、显式 activation 语义与 shared indexes
- `UHS` 继续作为共享 Harness Engineering 上位语言
- `Shared Runtime Contract` 逐步承接长期在线运行所需的共享合同
- `Shared Domain Contract` 逐步承接 formal entry、运行身份、报告面、审计面与 gate 语义这类跨 domain 正式行为合同
- 各个独立 `domain agent` 仓继续承接自己的产品入口、domain workflow 与交付真相

因此，未来更像是“多个垂类在线 agent 产品复用同一 substrate”，而不是“一个顶层巨型 runtime 吞掉所有 domain”。
这条方向当前还没有全部实现，但现在应该按这个结构推进。

`Hermes-Agent` 是上游外部 runtime project / service。
`OPL Runtime Manager` 可以在它之上适配 product-managed runtime operations，但不能写成 scheduler、session store、memory owner、domain truth owner 或 concrete executor owner。
Rust native helper / index-only 工作可以支持 native assistance 与 indexed discovery，但不能成为 domain execution 或 truth 的 owner。

## 运行原则

`OPL` 顶层遵循这些原则：

- 先读状态，再做变更
- 关键动作必须留下可审计结果
- 优先走稳定 domain-owned entry contract，而不是临时旁路
- 优先复用共享资产，而不是复制上下文
- 保留 domain 边界，而不是把一切压成一个 runtime
- 让人类停留在审核与决策面，而不是盯底层执行细节

## 边界规则

请用下面这组范围来理解 `OPL`：

- 实验室顶层产品与控制语言
- 跨 domain 语义最先冻结的地方
- 独立 domain agent 仓之上的显式 activation 层
- 连接各个 domain-owned runtime、但不吞并其身份的 shared modules / contracts / indexes owner

## 为什么 Domain Entry 仍然必须保留

即使存在共享 `OPL` activation，domain-owned entry 仍然必须保留，因为它们提供：

- 独立使用的稳定入口
- domain-specific 的校验、治理与交付合同
- 独立发布与维护边界
- 某个工作流可以独立演进而不拖垮整个 federation 的能力

所以正确方向是：

- Codex-default `OPL` runtime 加显式 activation 在 domain 之上
- 显式而精简的 domain-owned entry 在中层
- 明确的 domain harness 在下层

## 延伸阅读

- [共享基础结构](./shared-foundation.zh-CN.md)
- [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)
