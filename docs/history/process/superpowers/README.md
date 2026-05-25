# Superpowers 过程材料归档

Owner: `One Person Lab`
Purpose: `history_process_superpowers_index`
State: `history_only`
Machine boundary: 本目录是人读历史归档。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、App/operator read model 和真实验证 evidence。

本目录保存早期 Superpowers worker flow 生成的 plan/spec 过程材料。下面文件中的 `Goal`、`Task`、`Design`、`Validation`、`Current`、checkbox 和命令块都按文件日期阅读，只用于 provenance、迁移回顾和 stale wording 负向 guard，不是当前 active backlog、active spec、runtime/provider contract、App/product surface、readiness oracle 或 production evidence。

## 当前 owner

| 历史主题 | 当前 owner |
| --- | --- |
| OPL 当前角色、ready/readiness 边界、不能声明项 | [项目概览](../../../project.md)、[当前状态](../../../status.md)、[架构](../../../architecture.md)、[硬约束](../../../invariants.md)、[关键决策](../../../decisions.md) |
| 当前目标态和 gap baton | [OPL Family 当前状态与理想目标差距](../../../active/current-state-vs-ideal-gap.md)、[OPL 与 Foundry Agents 理想目标态](../../../references/runtime-substrate/opl-family-agent-ideal-state.md) |
| Domain-agent entry / onboarding | [OPL Domain-Agent Admission Contract](../../../specs/opl-domain-onboarding-contract.md) |
| Runtime / provider / executor 命名 | [OPL Runtime 命名与边界合同](../../../runtime/opl-runtime-naming-and-boundary-contract.md)、[Shared Runtime Contract](../../../specs/shared-runtime-contract.md) |
| Shared domain/runtime boundary | [Shared Domain Contract](../../../specs/shared-domain-contract.md)、[Shared Runtime Contract](../../../specs/shared-runtime-contract.md) |
| App / workbench / operator surface | [Product 文档](../../../product/README.md)、One Person Lab App repo-owned docs and release surfaces |

## 内容

| 子目录 | 读法 |
| --- | --- |
| [plans](./plans/) | 早期 worker implementation plans。保留任务拆解、历史命令和当时文件面；不得作为当前待执行计划读取。 |
| [specs](./specs/) | 早期 worker design specs。保留当时设计取舍；不得作为当前 active spec 或 machine-readable contract 读取。 |

## 边界

- `frontdoor`、`opl web`、`Product API`、旧 Hermes/Gateway wording 只按历史语境阅读；当前产品/workbench owner 回到 `docs/product/`、App repo 和 App/operator read model。
- `Multica` 只作为外部产品语义学习来源；它不是 OPL runtime、provider、executor 或 dependency。
- 早期 `family shared modules` 与 `domain_agent_entry_spec` 计划中的有效结论已由当前 specs、runtime boundary、active gap 和 machine read models 持有。
- 本目录不承载 action queue、验证门或 long-horizon `/goal` baton；当前 baton 只回到 `docs/active/current-state-vs-ideal-gap.md` 和 coverage ledger。
