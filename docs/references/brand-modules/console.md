# OPL Console

Owner: `One Person Lab App`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归 App contracts, App release/user-path evidence, OPL runtime projection, domain-owned projection 和 CLI/API 行为。

## 品牌定位

`OPL Console` 是 App/operator 工作台模块。它把 OPL Framework、Foundry Agents、Workspace、Runway、Ledger 和 capability invocation plan 的投影转成用户能看懂、能行动、能检查产物的界面。

一句话：`Console` 管“用户和 operator 当前应该看什么、点什么、等待谁、检查哪个产物”。

## 设计理念

- Current owner first：默认首屏先显示当前 owner、需要什么 answer、阻塞什么 ready。
- Summary first, drilldown later：普通用户看少量可行动信息，维护者才展开 refs、ledger、provider trace。
- Product truth split：本仓只生产 App state/action/read-model 与 operator projection；GUI product truth、release gate、active shell validation 和用户路径 evidence 归 `one-person-lab-app`。
- No second truth：Console 只消费 OPL/domain projection，不自己判断 domain ready。

## 核心对象

| 对象 | 作用 |
| --- | --- |
| `current_owner_card` | 当前 owner、required answer、accepted answer shape。 |
| `task_entry` | MAS/MAG/RCA/OMA 或 future agent 的任务入口。 |
| `workspace_panel` | 当前 workspace、project、stage outputs、inspection roots。 |
| `runway_panel` | attempt、provider state、heartbeat、human gate、repair route。 |
| `ledger_panel` | receipt、typed blocker、artifact lineage、evidence refs。 |
| `action_route` | owner-aware safe action、App action 或 human gate action。 |
| `invocation_plan_card` | 从 `current_owner_delta` 派生的 CapabilityInvocationPlan / next callable projection，供 operator 理解下一步工具或 owner action。 |
| `capability_invocation_lifecycle_projection` | 从 Pack lifecycle 派生的 soft discovery、scored fit、hard gate 投影，帮助 operator 区分 advisory 候选、可解释 fit 和必须 fail-closed 的 current-owner gate。 |
| `diagnostic_drilldown` | full detail、audit refs、provider trace、legacy cleanup。 |

Workspace 级 L4 的 Console 对象模型必须独立于 registry entry 存在。最低模型如下：

| 对象 | L4 验收含义 |
| --- | --- |
| `console_read_model` | 从 `family-product-operator-projection`、`current-owner-delta`、workspace/action catalog 和 runtime drilldown 派生的 App-facing 状态，不读写 domain body。 |
| `console_action_catalog` | App 可以触发的 safe actions、payload shape、authority boundary 和 owner gate。 |
| `console_interface_bundle` | CLI/App/descriptor 对外暴露的 status、inspect、interfaces、validate、doctor schema。 |
| `console_diagnostic_report` | `doctor` 输出的 stale projection、缺 descriptor、缺 action binding、缺 provider ref 或 domain projection gap。 |
| `console_status_foldback` | `docs/status.md`、public surface index、maturity doc 与 App release evidence 的引用关系。 |

## Workspace 级 L4 验收 refs

| 层面 | 目标 refs |
| --- | --- |
| `schema / contract` | `contracts/opl-framework/family-product-operator-projection.json`、`contracts/opl-framework/current-owner-delta.schema.json`、`contracts/opl-framework/capability-registry-resolver.schema.json#/$defs/capability_invocation_lifecycle_policy`、`contracts/opl-framework/public-surface-index.json`、`contracts/opl-framework/agent-platform-surface-ownership-contract.json`。 |
| `CLI family` | `opl console status --json`、`opl console inspect --json`、`opl console interfaces --json`、`opl console validate --json`、`opl console doctor --json`。 |
| `current delegate CLI` | 默认 `opl app state --profile fast --json`、显式 capability `opl app state --profile runtime --json`、`opl app state --profile full --json`、`opl app action execute --json`、`opl runtime app-operator-drilldown --detail full --json`、`opl brand-modules inspect --module console --json`。 |
| `App action / read-model` | `app_projection:current_owner_delta`、`app_projection:capability_invocation_lifecycle`、`app_projection:evidence_next_steps`、`app_action:workspace_ensure`、`app_action:provider_scheduler_status`；后续 `opl console interfaces` 必须把这些字段和 action shape 输出给 App。 |
| `descriptor` | App action descriptor、operator drilldown descriptor、task entry descriptor、diagnostic drilldown descriptor、`contracts/opl-framework/brand-module-registry.json#modules.console`。 |
| `validation / doctor` | `opl console validate --json` 检查 schema、action descriptor、projection freshness 和 forbidden claims；`opl console doctor --json` 输出可修复/需 owner 的诊断，不写 domain truth 或 App release truth。 |
| `tests` | CLI public spec、read-model fixture、action descriptor conformance、negative false-authority、doctor stale-projection fixture、`brand-modules` regression。 |
| `status` | `docs/status.md`、`docs/product/opl-public-surface-index.md`、`docs/references/brand-modules/current-maturity-against-workspace.md`、App release/user-path evidence refs。 |

## 接口与文档

模块级 CLI family 验收入口：

```text
opl console status --json
opl console inspect --detail full --json
opl console interfaces --json
opl console validate --json
opl console doctor --json
```

现有 delegate / source-of-truth 入口：

```text
opl app state --profile fast --json
opl app state --profile runtime --json
opl app state --profile full --json
opl app action execute --action <id> --payload <json> --json
opl runtime app-operator-drilldown --json
opl brand-modules inspect --module console --json
```

理想文档：

```text
docs/references/brand-modules/console.md
docs/product/opl-public-surface-index.md
one-person-lab-app/docs/product/*
one-person-lab-app/contracts/*
```

## 模块级 CLI 验收说明

- `status`：返回 Console 当前可展示状态、current owner、next action、workspace action health、projection freshness 和 source refs；不得包含 GUI release-ready 结论。
- `inspect`：返回对象模型、contract refs、App action/read-model refs、descriptor refs、forbidden claims 和与 `opl app state` / `opl runtime app-operator-drilldown` 的 delegate mapping。
- `interfaces`：输出 App 可以消费的 read-model 字段、Capability Invocation lifecycle projection、safe action payload schema、diagnostic drilldown descriptor 和 CLI command descriptor。
- `validate`：fail closed 检查 contract 存在、schema shape、action binding、read-model projection、status doc refs 和 authority flags；不能用 registry presence 代替这些检查。
- `doctor`：定位 stale current-owner delta、缺 action descriptor、缺 provider scheduler ref、缺 workspace action、App projection drift 或 domain projection missing，并把结果分成 `framework_fix`、`app_release_owner`、`domain_owner` 或 `runtime_provider`。

## Authority boundary

- 本仓 Console 持有 App/operator projection、safe action routing、read-model producer 和用户检查面的机器边界。
- `one-person-lab-app` 持有 GUI product truth、release gate、active shell validation 和用户路径 evidence。
- OPL Framework 持有 runtime projection、workspace/read-model/action catalog 的机器边界。
- Domain agent 持有 domain truth、quality verdict、owner receipt 和 artifact authority。
- CapabilityInvocationPlan 和 ToolResultEnvelope 只作为 Console 投影，不是 owner answer、typed blocker、quality verdict 或 current-owner authorization。
- Capability Invocation lifecycle 只作为 Console 投影：soft discovery / scored fit 是 advisory，hard gate 必须回到 `current_owner_delta`；Console 不签 owner answer，不创建 typed blocker，不写 domain truth。
- App release/user-path evidence 只证明 Console 用户路径可用，不替代 runtime long-soak 或 domain ready。

## Forbidden claims

- 不把 AionUI backend / Agent selector 暴露为普通用户 truth。
- 不直接读写 SQLite sidecar。
- 不签 owner receipt 或 quality verdict。
- 不把 release-ready 写成 runtime-ready。
- 不把 Console projection 写成 MAS/MAG/RCA/OMA 已完成。
- 不把 App action 可点击写成 owner 已接受。
- 不把本仓 App state/action producer 写成 App GUI release truth。
- 不把 invocation-plan projection 写成 owner answer 或 domain readiness。
- 不把 capability invocation lifecycle projection 写成 current-owner authorization、owner answer、typed blocker 或 domain readiness。

## L4 structural baseline 成功标准

- `opl console status|inspect|interfaces|validate|doctor` 与现有 `opl app state`、`opl app action execute`、`opl runtime app-operator-drilldown` 从同一 contract / projection 派生。
- Console 有自己的 read-model、action catalog、interface bundle、validate gate 和 doctor report，不只依赖 `brand-module-registry` 说明。
- App action 与 CLI/action catalog 同源，且 tests 覆盖 happy path、stale projection、缺 descriptor 和 forbidden authority flags。
- Full drilldown 可解释 blocker，但默认不让用户被 raw evidence 淹没。
- 用户能从首屏知道下一步等谁、要交付什么、产物在哪里；release/user-path evidence 只作为 App repo 外部 refs。
- Console 的 ready 声明能明确区分本仓 App state/action producer readiness、App GUI release readiness、runtime readiness 和 domain owner acceptance。
