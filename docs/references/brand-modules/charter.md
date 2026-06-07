# OPL Charter

Owner: `One Person Lab`
Purpose: `brand_module_design`
State: `support_reference`
Machine boundary: 本文是人读目标态参考。机器真相继续归核心五件套、contracts、source、CLI/API 行为和 runtime evidence。

## 品牌定位

`OPL Charter` 是 OPL 的顶层宪章模块。它不执行任务，也不管理 runtime；它负责让整套系统长期保持同一套语言、边界、设计决策和品牌组合。

一句话：`Charter` 管“OPL 到底是什么、哪些词能用、哪些 owner 不能越界、哪些设计决策仍有效”。

## 设计理念

- 先固定产品层级，再设计实现：`OPL Framework -> One Person Lab App -> Foundry Agents`。
- 先固定 owner boundary，再设计接口：Framework、App、Foundry Agent、domain repo、executor、provider 各自只持有自己的 authority。
- 先设理想态，再用现状找差距：历史实现只能作为迁移输入，不能定义长期结构。
- 决策要可追溯：重要设计进入 ADR/RFC，不靠聊天记忆或散落 docs。
- 命名必须有生命周期：active term、deprecated term、retired term、history/provenance term 分开。

## 核心对象

| 对象 | 作用 |
| --- | --- |
| `product_taxonomy` | 固定 OPL Framework、App、Foundry Agents 的产品层级。 |
| `authority_matrix` | 固定 runtime、domain truth、artifact authority、quality verdict、release truth 的 owner。 |
| `brand_module_registry` | 固定九个品牌模块及其 owner、scope、interfaces、forbidden claims。 |
| `term_lifecycle` | 管理 active / deprecated / retired / provenance 术语。 |
| `adr` | 记录关键设计决策、原因、取舍、替代方案和 supersession。 |
| `rfc` | 记录较大结构变化的设计提案、验收门和迁移边界。 |

## 接口与文档

理想文档结构：

```text
docs/references/brand-modules/charter.md
docs/decisions.md
docs/invariants.md
docs/policies/docs-lifecycle-policy.md
docs/policies/terminology-lifecycle-policy.md
contracts/opl-framework/brand-module-registry.json
contracts/opl-framework/authority-matrix.json
```

`Charter` 的人读文档解释设计意图；机器合同固定模块、owner、forbidden authority 和 term lifecycle。测试只验证 contract / schema / CLI 行为，不固定 prose wording。

## 不做什么

- 不替 `Runway` 判断 runtime ready。
- 不替 `Stagecraft` 定义 stage 内部策略细节。
- 不替 `Vault` 签 receipt 或 closeout。
- 不替 `Console` 设计具体页面。
- 不把 ADR 写成永久不可改的神谕；被 supersede 的决策必须标出当前读法。

## 成功标准

- 新模块、新接口、新术语都能归入明确品牌模块。
- 任何人问“这个归谁管”，能从 authority matrix 找到答案。
- 历史词汇不会回流成 active surface。
- 当前文档、contracts、CLI help、App projection 的主语一致。

