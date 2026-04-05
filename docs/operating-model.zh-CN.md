[English](./operating-model.md) | **中文**

# OPL 运行模型

## 核心判断

`OPL` 的核心判断，不是“怎么让一个 Agent 一次性做完一个任务”，而是“怎么让一个研究型个人或极小团队，通过稳定表面持续承担正式实验室工作”。

所以，`OPL` 更准确的理解不是静态蓝图，也不是单体 runtime，而是顶层 Gateway 与 federation model。

## 顶层链路

理想主链应是：

```text
Human / Agent
  -> OPL Gateway
      -> Domain Gateway
          -> Domain Harness OS
              -> Review Surfaces / Deliveries / Audit Truth
```

当前最清楚的两条映射是：

- `Research Ops` -> `MedAutoScience`
- `Presentation Ops` -> `RedCube AI` 里的 `ppt_deck`

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

### OPL Gateway

顶层 `OPL Gateway` 负责：

- 表达顶层任务语义
- 把任务路由到正确的 domain surface
- 定义跨 domain 的共享基础结构要求
- 拥有 shared-foundation 的顶层控制语言，但不接管各 domain 的 canonical truth
- 让跨 domain 的身份、治理与交付语言保持一致

当前仓库承担的是这个角色的文档优先公开说明面。

### Domain Gateway 与 Harness

每个 domain 应保持两层分开：

- `domain gateway` 作为该工作流的稳定入口
- `domain harness OS` 作为该工作流的执行、记录、治理与交付底座

例如：

- `MedAutoScience` 是 `Research Ops` 的 domain gateway 与 harness
- `RedCube AI` 是视觉交付的 domain gateway 与 harness

## 运行原则

`OPL` 顶层遵循这些原则：

- 先读状态，再做变更
- 关键动作必须留下可审计结果
- 优先走稳定 gateway，而不是临时旁路
- 优先复用共享资产，而不是复制上下文
- 保留 domain 边界，而不是把一切压成一个 runtime
- 让人类停留在审核与决策面，而不是盯底层执行细节

## 边界规则

`OPL` 不是：

- 通用助手系统
- 某一个 domain 项目的同义词
- 所有 runtime 代码都已经合并到一个仓库里的证明
- 删除 domain gateway 的理由

`OPL` 是：

- 实验室顶层产品与控制语言
- 跨 domain 语义最先冻结的地方
- 独立 domain gateway 与 harness 之上的 federation 层

## 为什么 Domain Gateway 仍然必须保留

即使存在 `OPL Gateway`，domain gateway 仍然必须保留，因为它们提供：

- 独立使用的稳定入口
- domain-specific 的校验、治理与交付合同
- 独立发布与维护边界
- 某个工作流可以独立演进而不拖垮整个 federation 的能力

所以正确方向是：

- `OPL Gateway` 在上层
- 显式而精简的 domain gateway 在中层
- 明确的 domain harness 在下层

而不是：

- 一个吞掉所有工作流的巨型 runtime

## 延伸阅读

- [共享基础结构](./shared-foundation.zh-CN.md)
- [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)
