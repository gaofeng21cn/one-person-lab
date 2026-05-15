# Product 文档

Owner: `One Person Lab`
Purpose: `product_workbench_support`
State: `active_support`
Machine boundary: 人读索引。机器真相继续归 `contracts/`、源码、CLI/API、runtime ledgers 与 provider/domain receipts。

本目录承接 One Person Lab App/workbench、operator entry、product entry 和 action-routing shell 的 OPL-owned 支撑文档。

当前 App 维护拓扑已收口为独立 `one-person-lab-app` 产品仓；其中 App 顶层 `docs/` 治理用户文档、release、testing 和截图教程，`shells/aionui/docs/` 仍按上游 AionUI 依赖文档处理。本目录只记录 OPL 对 App/workbench 的目标、消费合同和边界，不接管 AionUI upstream 文档生命周期。

当前入口先看：

- [OPL 系列项目开发主参考](../active/opl-family-development-reference.md)
- [One Person Lab App 仓库拆分计划](../active/one-person-lab-app-repo-split-plan.md)
- [OPL 公开界面索引](./opl-public-surface-index.md)
- [当前支撑参考索引](../references/current-support/README.md)

## 内容

| 文件 | 生命周期状态 | 当前 owner | 阅读规则 |
| --- | --- | --- | --- |
| `opl-public-surface-index.md` | `active_support` | OPL product/workbench owner | 解释当前公开 surface、OPL-owned runtime/activation surface、domain-owned capability surface、旧 gateway/federation 语料的历史读法和 App/workbench 消费边界。 |
