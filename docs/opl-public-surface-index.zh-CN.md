[English](./opl-public-surface-index.md) | **中文**

# OPL 公开界面索引

## 目的

这份文档索引当前 `OPL` 的权威公开界面。

当前主线是：

- `Codex-default session/runtime`
- `explicit activation layer`
- `shared modules / contracts / indexes`
- `family domain skill sync / discovery`

`OPL` 已经不再把旧的 gateway/federation 语料当作默认公开集成合同。
那批语料仍然保留在仓库里，供审计、兼容性检查和 schema 考古使用，但已经不是恢复当前 runtime 模型的第一入口。

如果要看仓库级文档分层与参考级处理规则，请继续看 [文档索引](./README.zh-CN.md)。

## 当前活跃界面

### 1. OPL 自己持有的 runtime 与 activation 界面

下面这些文档定义当前 `OPL` 主线：

- [仓库首页](../README.zh-CN.md)
- [项目概览](./project.md)
- [当前状态](./status.md)
- [架构](./architecture.md)
- [硬约束](./invariants.md)
- [关键决策](./decisions.md)
- [合同目录说明](../contracts/README.md)

这些界面解释默认入口（`opl`、`opl exec`、`opl resume`）、当前资源模型（`workspaces / sessions / progress / artifacts`），以及“只有显式 activation 或 runtime switch 才进入 OPL 增量语义”这条规则。
它们也把 `OPL Runtime Manager` 限定为 external `Hermes-Agent` 之上的 product-managed 薄 adapter，并把 Rust native helper / index 工作限定在 native assistance 与 indexed discovery。

### 2. 已链接的 domain capability surface

这些 surface 由 `OPL` 索引，但 ownership 仍留在各自仓：

- `Med Auto Science`
- `Med Auto Grant`
- `RedCube AI`

`OPL` 通过 `opl skill sync` 和各 domain 仓自己的 CLI / 程序 / 脚本 / contract surface 来发现并激活它们。
所以当前顶层集成单元其实是 repo-owned 的 domain app skill 及其底下的 command contract，而不是 OPL 自己再造一套 gateway handoff 词汇。

### 3. 共享基础结构配套界面

下面这些文档仍然活跃，但它们服务的是 shared-foundation 边界，而不是重新把公开主线拉回 gateway-first：

- [共享基础结构](./shared-foundation.zh-CN.md)
- [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)
- [共享运行时合同](./shared-runtime-contract.zh-CN.md)
- [共享领域合同](./shared-domain-contract.zh-CN.md)
- [OPL 运行时命名与边界合同](./opl-runtime-naming-and-boundary-contract.zh-CN.md)

## 旧兼容语料

下面这组内容保留为早期 gateway-first 阶段的兼容语料：

- [Gateway 联邦](./gateway-federation.zh-CN.md)
- [OPL 联邦合同](./opl-federation-contract.zh-CN.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.zh-CN.md)
- [OPL Gateway 契约面](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.zh-CN.md)
- [OPL Gateway 合同](../contracts/opl-gateway/README.zh-CN.md)
- [`../contracts/opl-gateway/public-surface-index.json`](../contracts/opl-gateway/public-surface-index.json)

这些 surface 仍可能出现在测试、审计流程、兼容性检查和历史设计复盘中。
但它们不能再作为今天 `OPL` 的默认实现依据。

## 参考级配套材料

下面这些材料继续承担审核与追溯作用：

- [参考级索引](./references/README.zh-CN.md)
- [历史归档索引](./history/README.zh-CN.md)
- [生态四仓统一状态总表](./references/ecosystem-status-matrix.md)
- `docs/references/` 下保留的 gateway/federation 样例、matrix、acceptance spec 与 lifecycle 文档

## 阅读规则

把这份索引理解成一张 **runtime/activation 地图**。

- 如果你要恢复当前 `OPL` 真相，先读核心工作集和 [合同目录说明](../contracts/README.md)。
- 如果你要恢复当前跨仓集成单元，去读已收录 domain 仓及其 app skill surface。
- 如果某份文档仍然把主语写成 `OPL Gateway`、`domain_gateway`、routed handoff payload 或 gateway-owned public-surface indexing，除非新的核心文档把它重新提升，否则都应按旧兼容语料理解。

## 完成定义

只有当下面这些条件都成立时，这份 public surface index 才算合格：

- 它把当前 `Codex-default runtime + activation + shared modules/contracts/indexes + skill sync` 主线讲清楚
- 它区分 OPL-owned 的 runtime/activation surface 与 repo-owned 的 domain capability surface
- 它明确标出旧 gateway/federation 语料已经退到 reference/compatibility 层
- 它继续把 domain runtime truth、progress truth 与 artifact truth 放在对应 domain 仓自己名下
