# Product 文档

Owner: `One Person Lab`
Purpose: `product_workbench_support`
State: `active_support`
Machine boundary: 人读索引。机器真相继续归 `contracts/`、源码、CLI/API、runtime ledgers 与 provider/domain receipts。

本目录承接 One Person Lab App/workbench、operator entry、product entry 和 action-routing shell 的 OPL-owned 支撑文档。

当前 App 维护拓扑已收口为 clean `one-person-lab-app` 产品仓和独立 `opl-aion-shell` shell 仓；其中 App 顶层 `docs/` 治理用户文档、release、testing 和截图教程，AionUI upstream 依赖文档留在 `opl-aion-shell/docs/`。本目录只记录 OPL 对 App/workbench 的目标、消费合同和边界，不接管 AionUI upstream 文档生命周期。

Framework 侧的 App 目标形态是 `Codex App wrapper`：App 面向普通用户时固定使用 `Codex CLI` concrete executor，内置 MAS/MAG/RCA 及后续 Foundry Agent 的任务入口，并通过 OPL `app state/action` 消费 runtime/read-model/action truth。普通用户路径只选择工作、任务和 domain entry，不选择 AionUI backend、通用 Agent host 或非默认 executor adapter；这些细节只能出现在显式 developer/operator diagnostic、shell implementation 或 stage-level binding 语境中。GUI product truth、页面合同和用户可见取舍归 `one-person-lab-app`，`opl-aion-shell` 只实现 App-owned contract。当前 GUI 路线是 AionUI 主线、`opl-native-workbench` foreground alternative、Hermes Desktop / `hermes-codex` retained explicit reference candidate、AGUI / `agui-codex` archived technical proof；AGUI 只有在用户明确要求时才 replay，不进入默认产品完善、首启验证或 release/adoption 叙事。

OPL CLI 现在提供 App runtime 的统一读写边界：默认页面状态继续读取 `opl app state --profile fast --json`；`opl app state --profile runtime --json` 是显式 runtime capability，只有在 App contract 消费 `opl_app.runtime_state_profile.v1` 后才可切换，不能由 Framework 单方面宣称为默认；显式刷新读取 `opl app state --profile full --json`。App mutation 统一走 `opl app action execute --action <id> [--payload <json>] [--dry-run] --json`。OPL Framework 只做 GUI-ready state/action producer；GUI 产品真相、release/page-state contract、首启验收和 shell 适配合同继续归 `one-person-lab-app`。GUI 不再把 `opl connect modules`、`opl system developer-supervisor`、provider worker/scheduler、release channel、Codex profile 或系统路径分别拼成页面 truth。`opl runtime app-operator-drilldown --detail full --json` 是运行状态/Operator 页按需展开 full drilldown 的明确例外，不能作为正常 GUI page state 来源。具体首页、设置、关于、主题、图标、文案、默认助手、release channel 与 shell 适配验收继续由 `one-person-lab-app` 的 App-owned contract/docs/tests 持有；`opl-aion-shell` 只实现这些合同。

针对 Runtime 页，Framework 现在的明确职责是：产出**可切换范围的项目运行总览**
所需的 refs-only projection，包括 scope model、用户主状态、自动运行副状态、阶段、
时长、token、liveness、owner route 和高级诊断 refs。Framework 不负责决定用户文案、
页面分组和视觉组织；这些继续由 `one-person-lab-app` contract 与 `opl-aion-shell`
renderer 持有。

当前入口先看：

- [OPL 系列项目开发主参考](../active/opl-family-development-reference.md)
- [One Person Lab App 仓库拆分 Closeout](../history/process/plans/2026-05-15-one-person-lab-app-repo-split-closeout.md)
- [OPL 公开界面索引](./opl-public-surface-index.md)
- [当前支撑参考索引](../references/current-support/README.md)

App / operator workbench 的默认 GUI 消费面仍是 `opl app state --profile fast --json` 提供的 `opl_app_state.v1` bounded 首屏 view model；显式 runtime capability 提供同一投影的更窄 runtime envelope，`--profile full` 继续提供显式刷新 view model。该状态面把 Codex default、Developer Mode、module source、provider health、release channel、workspace paths、默认助手、App action catalog 和 operator summary 放在同一 OPL-owned read model 内，避免 GUI 分别调用 `opl connect modules`、`opl system developer-supervisor`、provider worker/scheduler、release channel、Codex profile 或系统路径后再拼页面 truth。`runtime_tray_snapshot.app_operator_drilldown`、`runtime_visualization_projection` 和 `opl runtime app-operator-drilldown --detail full --json` 仍是 OPL diagnostic/source surface：它们聚合 route graph / decision map refs、review/repair queue items、artifact/package/export lifecycle refs、memory/writeback refs、quality/readiness refs、provider SLO、stage production evidence、domain dispatch evidence、safe action routes 和 MAS `paper_route_lens_refs` 等 refs-only operator detail。App 只有在用户显式展开 full detail 或 operator diagnostic 时才读取这些 detail；正常 GUI 首屏和设置页不得把 raw drilldown 当成主状态源。App action 统一经 `opl app action execute` 进入 OPL action boundary；其内部可以委托 provider、system、module、engine 或 legacy runtime safe-action route，但外部 envelope 始终保持 App-facing，不把 domain truth、memory body、artifact body、quality verdict 或 release authority 交给 GUI shell。

`runtime_visualization_projection.runtime_workbench` 是 App 运行状态页的纵向工作台模型：默认按全局 summary strip、行动队列、domain lane 动态地图、单任务 drilldown 和 MAS paper route lens refs 展示多任务基座状态；summary 允许 10 秒轻轮询兜底，full detail 只按 operator 显式加载，不做逐 token 刷新。全局动态地图使用轻量 DOM/CSS lane map，单任务详情按需展开 graph/timeline/refs；布局和性能字段只描述展示策略，不改变 OPL/App/domain authority。

Runtime 页后续不再把 `running / attention / recent` 直接暴露为用户第一层状态。对
Framework 来说，这三类只保留为内部 aggregation bucket；真正输出到 App contract 的
必须是更接近用户认知的主状态与自动运行副状态。

App 运行状态页的 stage log 来源是 OPL `stage_attempt_workbench.stage_progress_log` 和 `runtime_visualization_projection`，不是 Temporal Web UI 的页面结构。Temporal Web UI 只作为 `temporal_webui_ref` operator/debug link 展开，用于定位 workflow history、run id、namespace 和 Search Attributes；App 首屏、full drilldown、action routing 和用户语义状态继续以 OPL semantic projection 为准。

## App Console 收薄目标

`OPL Console` 在产品层只表示 App/operator cockpit，不是 ledger browser、runtime owner 或 domain owner。普通用户和 operator 默认页应从同一 compact root 读取：

```text
opl app state
  -> current_owner_delta
  -> stage / artifact / blocker summary
  -> allowed App action
  -> explicit drilldown ref
```

因此，App Console 目标态按下面规则维护：

| 面 | 默认页允许 | 只进 full drilldown / diagnostic |
| --- | --- | --- |
| 当前任务 | task / agent / stage / owner / accepted answer shape。 | raw route variants、full worklist、typed blocker group、provider trace。 |
| 当前产物 | stage artifact unit 的 current pointer、manifest validity、owner answer / typed blocker refs。 | artifact gallery internals、historical attempts、orphan/broken artifact drilldown。 |
| 当前行动 | `opl app action execute` 暴露的 owner-aware action；action payload 必须保持 App-facing envelope。 | provider redrive、worker repair、safe-action evidence record、legacy cleanup。 |
| 当前证据 | hard gate、owner receipt ref、typed blocker ref、human gate ref、no-regression ref。 | Atlas / Ledger telemetry、replay packet、long-soak refs、receipt counters、cleanup provenance。 |
| Foundry Kernel | FoundryRun 状态、qualification、risk route、Owner wait、version、canary、activation / rollback。 | 保护测试正文、内部 attempt/lease、物化路径、target domain truth。 |

App Console 不选择 executor/backend，不拼接 domain truth，不读取 artifact/memory body，不把 full drilldown counter 写成完成状态。非默认 executor、provider repair、Foundry Kernel promotion、Developer Mode 和 cleanup route 都必须是显式 operator/developer surface；普通用户路径保持 `Codex CLI` concrete executor + Foundry Agent task entry。

App Console 与 `OPL Atlas` / `OPL Ledger` 的关系也固定：Atlas/Ledger 负责收集和索引 refs-only telemetry；Console 只消费 fold 后的 owner delta、hard gate、artifact/blocker summary 和 drilldown locator。telemetry 增长、ledger verified、provider completion、scorecard pass 或 full detail visible 不能被 Console 升级成 domain ready、artifact ready、App release ready 或 production ready。

## 内容

| 文件 | 生命周期状态 | 当前 owner | 阅读规则 |
| --- | --- | --- | --- |
| `opl-public-surface-index.md` | `active_support` | OPL product/workbench owner | 解释当前公开 surface、OPL-owned runtime/activation surface、domain-owned capability surface、旧 gateway/federation 语料的历史读法和 App/workbench 消费边界。 |
