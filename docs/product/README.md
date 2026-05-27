# Product 文档

Owner: `One Person Lab`
Purpose: `product_workbench_support`
State: `active_support`
Machine boundary: 人读索引。机器真相继续归 `contracts/`、源码、CLI/API、runtime ledgers 与 provider/domain receipts。

本目录承接 One Person Lab App/workbench、operator entry、product entry 和 action-routing shell 的 OPL-owned 支撑文档。

当前 App 维护拓扑已收口为 clean `one-person-lab-app` 产品仓和独立 `opl-aion-shell` shell 仓；其中 App 顶层 `docs/` 治理用户文档、release、testing 和截图教程，AionUI upstream 依赖文档留在 `opl-aion-shell/docs/`。本目录只记录 OPL 对 App/workbench 的目标、消费合同和边界，不接管 AionUI upstream 文档生命周期。

OPL CLI 现在提供 App runtime 的统一读写边界：默认页面状态读取 `opl app state --profile fast --json`，显式刷新读取 `opl app state --profile full --json`，App mutation 统一走 `opl app action execute --action <id> [--payload <json>] [--dry-run] --json`。GUI 不再把 `opl modules`、`opl system developer-supervisor`、provider worker/scheduler、release channel、Codex profile 或系统路径分别拼成页面 truth。`opl runtime app-operator-drilldown --detail full --json` 是运行状态/Operator 页按需展开 full drilldown 的明确例外。具体首页、设置、关于、主题、图标、文案、默认助手、release channel 与 shell 适配验收继续由 `one-person-lab-app` 的 App-owned contract/docs/tests 持有；`opl-aion-shell` 只实现这些合同。

当前入口先看：

- [OPL 系列项目开发主参考](../active/opl-family-development-reference.md)
- [One Person Lab App 仓库拆分 Closeout](../history/process/plans/2026-05-15-one-person-lab-app-repo-split-closeout.md)
- [OPL 公开界面索引](./opl-public-surface-index.md)
- [当前支撑参考索引](../references/current-support/README.md)

App / operator workbench 的默认 GUI 消费面是 `opl_app_state.v1`，由 `opl app state --profile fast --json` 提供 bounded 首屏 view model，并由 `opl app state --profile full --json` 提供显式刷新 view model。该状态面把 Codex default、Developer Mode、module source、provider health、release channel、workspace paths、默认助手、App action catalog 和 operator summary 放在同一 OPL-owned read model 内，避免 GUI 分别调用 `opl modules`、`opl system developer-supervisor`、provider worker/scheduler、release channel、Codex profile 或系统路径后再拼页面 truth。`runtime_tray_snapshot.app_operator_drilldown`、`runtime_visualization_projection` 和 `opl runtime app-operator-drilldown --detail full --json` 仍是 OPL diagnostic/source surface：它们聚合 route graph / decision map refs、review/repair queue items、artifact/package/export lifecycle refs、memory/writeback refs、quality/readiness refs、provider SLO、stage production evidence、domain dispatch evidence、safe action routes 和 MAS `paper_route_lens_refs` 等 refs-only operator detail。App 只有在用户显式展开 full detail 或 operator diagnostic 时才读取这些 detail；正常 GUI 首屏和设置页不得把 raw drilldown 当成主状态源。App action 统一经 `opl app action execute` 进入 OPL action boundary；其内部可以委托 provider、system、module、engine 或 legacy runtime safe-action route，但外部 envelope 始终保持 App-facing，不把 domain truth、memory body、artifact body、quality verdict 或 release authority 交给 GUI shell。

`runtime_visualization_projection.runtime_workbench` 是 App 运行状态页的纵向工作台模型：默认按全局 summary strip、行动队列、domain lane 动态地图、单任务 drilldown 和 MAS paper route lens refs 展示多任务基座状态；summary 允许 10 秒轻轮询兜底，full detail 只按 operator 显式加载，不做逐 token 刷新。全局动态地图使用轻量 DOM/CSS lane map，单任务详情按需展开 graph/timeline/refs；布局和性能字段只描述展示策略，不改变 OPL/App/domain authority。

## 内容

| 文件 | 生命周期状态 | 当前 owner | 阅读规则 |
| --- | --- | --- | --- |
| `opl-public-surface-index.md` | `active_support` | OPL product/workbench owner | 解释当前公开 surface、OPL-owned runtime/activation surface、domain-owned capability surface、旧 gateway/federation 语料的历史读法和 App/workbench 消费边界。 |
