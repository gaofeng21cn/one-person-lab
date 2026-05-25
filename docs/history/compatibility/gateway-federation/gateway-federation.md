# OPL Gateway Federation

Owner: `One Person Lab`
Purpose: `legacy_gateway_federation_boundary_provenance`
State: `history_only`
Machine boundary: 本文只保存 gateway-first 阶段的边界语料。当前 OPL 拓扑是 stage-led、以 Agent executor 为最小执行单位；当前机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipts、domain-owned manifests / receipts 与 App/workbench projection。本文不得作为 active runtime、domain gateway、domain harness、compatibility interface、machine contract 或 test oracle。

> 历史说明（`2026-04-24`）：这份文档保留的是 gateway-first 阶段的边界语料。当前 `OPL` 主线已经转成 stage-led framework；这里只应作为历史 provenance 阅读。

## 目的

这份文档定义下面三者的关系：

- 顶层 `OPL Gateway`
- 独立 `domain agent` 仓内部的 `domain gateway`
- 独立 `domain agent` 仓内部的 `domain harness`

历史上它的作用是避免两个常见误判：

- 把 `OPL` 继续只理解成静态蓝图
- 把 `OPL` 理解成一个应该吞掉所有 domain 的单体 runtime

## 核心判断

历史 gateway-first 控制链曾写作：

```text
Human / Agent
  -> OPL Gateway
      -> Domain Gateway
          -> Domain Harness OS
```

`OPL` 掌握顶层产品语言和路由语义。
每个独立 `domain agent` 仓掌握自己的正式执行与交付面。

在当前 OPL 定位下，更准确的公开主语是：

- `OPL`：family-level session/runtime/projection 与 shared modules/contracts/indexes
- `MAS`、`MAG`、`RCA`：独立 `domain agent`
- `domain gateway / domain harness`：这些 domain agent 仓内部的边界层与执行层语言

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

这也是为什么当时即使有 `OPL`，仍要求 domain gateway 保留。
当前 domain repo 的稳定入口、handler、authority refs 与 generated/default-caller 边界以各 repo 的 live source、contracts、tests 与 OPL domain admission / runtime boundary 文档为准，不由本文保留旧 `domain gateway` 兼容面。

## Domain Harness 的职责

每个 `Domain Harness OS` 负责：

- 执行
- truth persistence
- governance hooks
- replay 与 rerun
- 审计回写
- 交付物生产

harness 是内部执行底座，不是顶层产品面。

## 当前映射

### Research Foundry

- `OPL workstream`: `Research Foundry`
- `domain agent`: `MedAutoScience`
- `domain gateway`: `MedAutoScience` 仓内 research gateway
- `domain harness`: 由 `MedAutoScience` 控制的 research harness

### Presentation Foundry

- `OPL workstream`: `Presentation Foundry`
- `domain agent`: `RedCube AI`
- `domain gateway`: `RedCube AI` 仓内 visual gateway
- `direct family`: `ppt_deck`
- 说明：`xiaohongshu` 与 `ppt_deck` 共享 RedCube harness，但不自动等同于 `Presentation Foundry`

### Grant Foundry

- `OPL workstream`: `Grant Foundry`
- `domain agent`: `MedAutoGrant`
- `domain gateway`: `MedAutoGrant` 仓内 grant gateway
- `domain harness`: 由 `MedAutoGrant` 控制的 grant harness

## 边界规则

不要把系统写成：

- `OPL` 取代所有 domain gateway
- domain agent 仓退化成没有独立角色的私有实现细节
- 一个 runtime 拥有全部工作流

应该把系统写成：

- 顶层的 `OPL Gateway`
- 其下独立 `domain agent` 仓内部的 `domain gateway`
- 再其下独立的 `domain harness`

## 下一层具体契约

在这份边界文档之后，下一层更具体的合同是：

- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Public Surface Index](../../../product/opl-public-surface-index.md)
- [OPL Framework Contracts](../../../../contracts/opl-framework/README.md)
