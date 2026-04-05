[English](./opl-public-surface-index.md) | **中文**

# OPL Public Surface Index

## 目的

这份文档索引当前 `OPL Gateway` 的 authoritative public surfaces。

它的作用是：让顶层 gateway 在 README、roadmap、rollout、contracts、acceptance、examples，以及链接出去的 domain gateway public entry 之间更容易被发现。

它不是 runtime registry。

## 机器可读工件

- [`../contracts/opl-gateway/public-surface-index.json`](../contracts/opl-gateway/public-surface-index.json)

## 非目标

这个 index 不负责：

- 启动执行
- 注册 harness internals
- 把 canonical truth 上收给 `OPL`
- 把 domain system 写成内部模块

## 已索引的 Surface 类别

### 1. OPL public-entry surfaces

这类 surface 负责给顶层 gateway 做定位与导航：

- `README`
- `Roadmap`
- `Gateway Rollout`

### 2. OPL contract surfaces

这类 surface 负责冻结 gateway 与 federation 边界：

- Federation contract
- Gateway contract hub
- Read-only discovery gateway
- Routed action gateway
- Domain onboarding contract + onboarding-readiness schema
- Governance / audit operating surface
- Publish / promotion operating surface

### 3. OPL supporting surfaces

这类 surface 负责提升审核与 discoverability，但不变成执行层：

- Acceptance test spec
- Gateway example corpus
- Routed-safety example corpus
- Operating example corpus
- Operating record catalog
- Surface lifecycle map
- Surface authority matrix
- Public surface index

### 4. Linked domain public-entry surfaces

这些 surface 由 `OPL` 做顶层索引，但 ownership 仍留在各自 domain：

- `MedAutoScience` 对应 `research_ops`
- `RedCube AI` 对应 `presentation_ops`

关键边界：

- `ppt_deck` 直接映射 `presentation_ops`
- `xiaohongshu` 仍可路由到 `redcube`，但不自动等于 `presentation_ops`

## 阅读规则

这份 index 必须被理解成 **surface map**，而不是 execution registry。

只要某个 surface 是 domain-owned，`OPL` 就只索引它的 public entry role。
canonical runtime truth、review truth、release truth 与 submission truth 仍然留在对应 domain system 内部。

## Gateway 上位文档

- [Gateway Federation](./gateway-federation.zh-CN.md)
- [OPL Federation Contract](./opl-federation-contract.zh-CN.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.zh-CN.md)
- [OPL 只读 Discovery Gateway](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.zh-CN.md)

## 配套示例 / 审核 / 映射 Surfaces

这些配套 surface 只负责提升 discoverability 与 reviewability，
不会升级成 governing gateway surface。

- [OPL Gateway Example Corpus](./opl-gateway-example-corpus.zh-CN.md)
- [OPL Routed-Safety Example Corpus](./opl-routed-safety-example-corpus.zh-CN.md)
- [OPL Operating Example Corpus](./opl-operating-example-corpus.zh-CN.md)
- [OPL Operating Record Catalog](./opl-operating-record-catalog.zh-CN.md)
- [OPL Surface Lifecycle Map](./opl-surface-lifecycle-map.zh-CN.md)
- [OPL Surface Authority Matrix](./opl-surface-authority-matrix.zh-CN.md)

## 完成定义

只有当下面这些条件都成立时，public surface index 才算合格：

- 它保持 machine-readable
- 它区分 OPL-owned surface 与 domain-owned public entry
- 它把 derived 的 surface lifecycle map 暴露为 supporting/reference surface
- 它把 derived 的 surface authority matrix 暴露为 supporting/reference surface
- 它不暗示 launcher、runtime 或 harness bypass
- 它不把 canonical truth 上收给 `OPL`
