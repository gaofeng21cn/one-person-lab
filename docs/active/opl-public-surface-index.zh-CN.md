[English](./opl-public-surface-index.md) | **中文**

# OPL 公开界面索引

## 目的

这份文档索引当前 `OPL` 的权威公开界面。

当前主线是：

- `Codex-default concrete executor`
- `explicit activation layer`
- `provider-backed stage runtime`
- `stage attempt / typed family queue / wakeup / receipt / recovery / projection`
- `shared modules / contracts / indexes`
- `family domain skill sync / discovery`

`OPL` 已经不再把旧的 gateway/federation/routed-action 语料作为活跃合同或样例层。
那批语料只保留在 history/reference 页面中，用于 provenance 和设计复盘。

如果要看仓库级文档生命周期与参考级处理规则，请继续看 [文档索引](../README.zh-CN.md) 和 [文档组合治理](../docs_portfolio_consolidation.md)。

## 当前活跃界面

### 1. OPL 自己持有的 runtime 与 activation 界面

下面这些文档定义当前 `OPL` 主线：

- [仓库首页](../README.zh-CN.md)
- [项目概览](../project.md)
- [当前状态](../status.md)
- [架构](../architecture.md)
- [硬约束](../invariants.md)
- [关键决策](../decisions.md)
- [合同目录说明](../../contracts/README.md)

这些界面解释默认入口（`opl`、`opl exec`、`opl resume`）、当前资源模型（`workspaces / sessions / progress / artifacts`），以及“只有显式 domain activation 或 executor switch 才进入 OPL 增量语义”这条规则。
它们也把 `OPL Runtime Manager` 限定为已配置 provider-backed family runtime 之上的产品控制面，并把 typed family queue、provider 诊断、Rust native helper / index 工作限定在产品调度、native assistance 与 indexed discovery。Temporal-backed provider 是 production online runtime 的必需 substrate；未安装、不可达或 worker 未 ready 都是平台 readiness blocker，需要通过安装、修复、监控和运维维护闭合。旧 Hermes provider/readiness/Gateway 语义已经退出 runtime provider、默认 substrate、readiness path、兼容 fallback 和 cron surface；`hermes_agent` 是 canonical 显式非默认 executor adapter/backend，必须走独立 receipt、audit 和 fail-closed gate。普通 Product Entry 与 session resume 保持 Codex-default 路径。

### 2. 已链接的 domain capability surface

这些 surface 由 `OPL` 索引，但 ownership 仍留在各自仓：

- `Med Auto Science`
- `Med Auto Grant`
- `RedCube AI`

`OPL` 通过 `opl skill sync` 和各 domain 仓自己的 CLI / 程序 / 脚本 / contract surface 来发现并激活它们。
所以当前顶层集成单元其实是 repo-owned 的 domain app skill 及其底下的 command contract，而不是 OPL 自己再造一套 gateway handoff 词汇。

### 3. 共享基础结构配套界面

下面这些文档仍然活跃，但它们服务的是 shared-foundation 边界，而不是重新把公开主线拉回已退役的 gateway-first 路线：

- [共享基础结构](./shared-foundation.zh-CN.md)
- [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)
- [共享运行时合同](./shared-runtime-contract.zh-CN.md)
- [共享领域合同](./shared-domain-contract.zh-CN.md)
- [OPL 运行时命名与边界合同](./opl-runtime-naming-and-boundary-contract.zh-CN.md)

## 历史来源材料

早期 gateway-first 阶段只作为历史来源材料保留：

- [Gateway 联邦](../history/compatibility/gateway-federation/gateway-federation.zh-CN.md)
- [OPL 联邦合同](../history/compatibility/gateway-federation/opl-federation-contract.zh-CN.md)
- [OPL Routed Action Gateway](../history/compatibility/gateway-federation/opl-routed-action-gateway.zh-CN.md)
- [OPL Gateway 契约面](../history/compatibility/gateway-federation/opl-read-only-discovery-gateway.zh-CN.md)

这些 surface 不能再作为今天 `OPL` 的活跃实现、测试或机器可读合同输入。
本轮清理已经把 Hermes legacy provider / Gateway cron / frontdoor-local-manager / compatibility alias 从 active provider 与默认路径中移除。历史 provenance、fixture 或负向 guard 可保留旧名，但必须明确为退役证据，不能再作为 provider fallback 或 readiness 路径。

## 参考级配套材料

下面这些材料继续承担审核与追溯作用：

- [参考级索引](../references/README.zh-CN.md)
- [历史归档索引](../history/README.zh-CN.md)
- [生态四仓统一状态总表](../references/convergence-governance/ecosystem-status-matrix.md)
- `docs/history/compatibility/` 下的退役 gateway/federation provenance

## 阅读规则

把这份索引理解成一张 **runtime/activation 地图**。

- 如果你要恢复当前 `OPL` 真相，先读核心工作集和 [合同目录说明](../../contracts/README.md)。
- 如果你要恢复当前跨仓集成单元，去读已收录 domain 仓及其 app skill surface。
- 如果某份文档仍然把主语写成 `OPL Gateway`、`domain_gateway`、routed handoff payload 或 gateway-owned public-surface indexing，都应按历史来源材料理解。

## 完成定义

只有当下面这些条件都成立时，这份 public surface index 才算合格：

- 它把当前 `Codex-default executor + activation + provider-backed stage runtime + shared modules/contracts/indexes + skill sync` 主线讲清楚
- 它区分 OPL-owned 的 runtime/activation surface 与 repo-owned 的 domain capability surface
- 它明确标出旧 gateway/federation 语料已经退到 reference/provenance 层
- 它把保留的旧名限制在退役 provider 负向 guard、provenance 或历史 fixture 语境
- 它继续把 domain runtime truth、progress truth 与 artifact truth 放在对应 domain 仓自己名下
