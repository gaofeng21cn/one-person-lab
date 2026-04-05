[English](./gateway-federation.md) | **中文**

# OPL Gateway Federation

## 目的

这份文档定义下面三者的关系：

- 顶层 `OPL Gateway`
- 独立的 `domain gateway`
- 独立的 `domain harness`

它的作用是避免两个常见误判：

- 把 `OPL` 继续只理解成静态蓝图
- 把 `OPL` 理解成一个应该吞掉所有 domain 的单体 runtime

## 核心判断

正确控制链应是：

```text
Human / Agent
  -> OPL Gateway
      -> Domain Gateway
          -> Domain Harness OS
```

`OPL` 掌握顶层产品语言和路由语义。
每个 domain 掌握自己的正式执行与交付面。

## OPL Gateway 的职责

`OPL Gateway` 负责：

- 顶层任务 intake 语义
- 把任务路由到正确 domain
- 声明共享基础结构语言
- 统一跨 domain 的治理与交付词汇
- 作为顶层公开产品面

当前仓库承担的是这个角色的文档优先、契约优先的公开说明面。

## Domain Gateway 的职责

每个 `domain gateway` 负责：

- 为该工作流提供稳定入口
- 进行 domain-specific 的校验与 contract hydration
- 提供 domain-specific 的 review 与 delivery 语义
- 在需要时支持独立使用

这也是为什么即使有 `OPL`，domain gateway 仍必须保留。

## Domain Harness 的职责

每个 `domain harness OS` 负责：

- 执行
- truth persistence
- governance hooks
- replay 与 rerun
- 审计回写
- 交付物生产

harness 是内部执行底座，不是顶层产品面。

## 当前映射

### Research Ops

- `OPL workstream`: `Research Ops`
- `domain gateway`: `MedAutoScience`
- `domain harness`: 由 `MedAutoScience` 控制的 research harness

### Presentation Ops

- `OPL workstream`: `Presentation Ops`
- `domain gateway`: `RedCube AI`
- `direct family`: `ppt_deck`
- 说明：`xiaohongshu` 与 `ppt_deck` 共享 RedCube harness，但不自动等同于 `Presentation Ops`

## 边界规则

不要把系统写成：

- `OPL` 取代所有 domain gateway
- domain 项目退化成没有独立角色的私有实现细节
- 一个 runtime 拥有全部工作流

应该把系统写成：

- 顶层的 `OPL Gateway`
- 其下独立的 `domain gateway`
- 再其下独立的 `domain harness`

## 下一层具体契约

在这份边界文档之后，下一层更具体的合同是：

- [OPL Federation Contract](./opl-federation-contract.zh-CN.md)
- [OPL Public Surface Index](./opl-public-surface-index.zh-CN.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.zh-CN.md)
