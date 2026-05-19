# Product 文档

Owner: `One Person Lab`
Purpose: `product_workbench_support`
State: `active_support`
Machine boundary: 人读索引。机器真相继续归 `contracts/`、源码、CLI/API、runtime ledgers 与 provider/domain receipts。

本目录承接 One Person Lab App/workbench、operator entry、product entry 和 action-routing shell 的 OPL-owned 支撑文档。

当前 App 维护拓扑已收口为 clean `one-person-lab-app` 产品仓和独立 `opl-aion-shell` shell 仓；其中 App 顶层 `docs/` 治理用户文档、release、testing 和截图教程，AionUI upstream 依赖文档留在 `opl-aion-shell/docs/`。本目录只记录 OPL 对 App/workbench 的目标、消费合同和边界，不接管 AionUI upstream 文档生命周期。

当前入口先看：

- [OPL 系列项目开发主参考](../active/opl-family-development-reference.md)
- [One Person Lab App 仓库拆分 Closeout](../history/process/plans/2026-05-15-one-person-lab-app-repo-split-closeout.md)
- [OPL 公开界面索引](./opl-public-surface-index.md)
- [当前支撑参考索引](../references/current-support/README.md)

App / operator workbench 对 drilldown、冲突与阻塞优先消费 `runtime_tray_snapshot.app_operator_drilldown`、`runtime_tray_snapshot.operator_conflicts[]` 和 item-level `operator_conflicts[]`。`app_operator_drilldown` 是 OPL-owned machine read model：它聚合 route graph / decision map refs、review/repair queue items、artifact gallery / package / export lifecycle refs、memory / writeback refs、functional privatization audit summary、domain evidence request / replacement coverage、legacy cleanup executable plan、quality/readiness refs、provider SLO、`domain_dispatch_evidence` owner-chain refs、`stage_production_evidence` production caller / executor / receipt / monitor refs 与 operator action routing refs。App 通过 `app_execution_bridge` 判断哪些 route 可提交到 `opl runtime action execute`，domain route 只能进入 typed queue / approval，provider route 只能形成 provider receipt，lifecycle route 只能走 OPL lifecycle apply/reconcile；`stage_production_attempt_request` route 只能调用 OPL `family-runtime attempt create` 创建 provider-backed stage attempt request，不执行 domain action、不写 domain truth、不生成 owner receipt；legacy cleanup plan 只能通过 `opl agents legacy-cleanup apply` 写 OPL cleanup ledger / tombstone refs，domain repo 文件删除必须由 domain owner receipt 证明。cleanup detail 同时展示 `agent_id` 和 CLI 可执行 `command_domain_id`，按钮或复制命令必须使用 `command_domain_id`。App 只展示这些 refs、owner 和 action route，不读取 memory body、artifact body，不写 domain truth，不下 quality/readiness/export verdict；`stage_production_evidence` 只能说明 production caller evidence 是否出现，不能授权 domain ready 或 stage completion。

## 内容

| 文件 | 生命周期状态 | 当前 owner | 阅读规则 |
| --- | --- | --- | --- |
| `opl-public-surface-index.md` | `active_support` | OPL product/workbench owner | 解释当前公开 surface、OPL-owned runtime/activation surface、domain-owned capability surface、旧 gateway/federation 语料的历史读法和 App/workbench 消费边界。 |
