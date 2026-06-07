# OPL Console

Owner: `One Person Lab App`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归 App contracts, App release/user-path evidence, OPL runtime projection, domain-owned projection 和 CLI/API 行为。

## 品牌定位

`OPL Console` 是 App/operator 工作台模块。它把 OPL Framework、Foundry Agents、Workspace、Runway 和 Vault 的投影转成用户能看懂、能行动、能检查产物的界面。

一句话：`Console` 管“用户和 operator 当前应该看什么、点什么、等待谁、检查哪个产物”。

## 设计理念

- Current owner first：默认首屏先显示当前 owner、需要什么 answer、阻塞什么 ready。
- Summary first, drilldown later：普通用户看少量可行动信息，维护者才展开 refs、ledger、provider trace。
- Product truth in App：GUI product truth、release gate、active shell validation 归 App，不归 Framework。
- No second truth：Console 只消费 OPL/domain projection，不自己判断 domain ready。

## 核心对象

| 对象 | 作用 |
| --- | --- |
| `current_owner_card` | 当前 owner、required answer、accepted answer shape。 |
| `task_entry` | MAS/MAG/RCA/OMA 或 future agent 的任务入口。 |
| `workspace_panel` | 当前 workspace、project、stage outputs、inspection roots。 |
| `runway_panel` | attempt、provider state、heartbeat、human gate、repair route。 |
| `vault_panel` | receipt、typed blocker、artifact lineage、evidence refs。 |
| `action_route` | owner-aware safe action、App action 或 human gate action。 |
| `diagnostic_drilldown` | full detail、audit refs、provider trace、legacy cleanup。 |

## 接口与文档

理想接口：

```text
opl app state --profile fast --json
opl app state --profile full --json
opl app action list --json
opl app action execute --action <id> --payload <json> --json
opl runtime app-operator-drilldown --json
```

理想文档：

```text
docs/references/brand-modules/console.md
docs/product/opl-public-surface-index.md
one-person-lab-app/docs/product/*
one-person-lab-app/contracts/*
```

## 不做什么

- 不把 AionUI backend / Agent selector 暴露为普通用户 truth。
- 不直接读写 SQLite sidecar。
- 不签 owner receipt 或 quality verdict。
- 不把 release-ready 写成 runtime-ready。

## 成功标准

- 用户能从首屏知道下一步等谁、要交付什么、产物在哪里。
- App action 与 CLI/action catalog 同源。
- Full drilldown 可解释 blocker，但默认不让用户被 raw evidence 淹没。
- Release/user-path evidence 足够支撑“用户真的能用”。

