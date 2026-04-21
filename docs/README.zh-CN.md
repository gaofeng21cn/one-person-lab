[English](./README.md) | **中文**

# OPL 文档索引

这个目录是 `One Person Lab` 仓库跟踪文档面的入口索引。
仓库首页优先写给潜在用户、人类专家和非技术读者。
这份索引把当前产品模型、核心工作集、参考材料和历史记录串起来。

## 当前产品模型

当前公开的 `OPL` 产品模型统一为：

- `System`
- `Engines`
- `Modules`
- `Agents`
- `Workspaces`
- `Sessions`
- `Progress`
- `Artifacts`

`OPL` 的 canonical truth 是 session runtime；GUI 外壳、`opl` shell / TUI、CLI 与 `Product API` 消费的是同一套产品资源投影。
各个领域仓继续持有自己的智能体逻辑、运行规则和交付物。

## 按读者类型进入

| 读者 | 建议起点 | 目的 |
| --- | --- | --- |
| 潜在用户、人类专家、非技术读者 | [仓库首页](../README.zh-CN.md)、[路线图](./roadmap.zh-CN.md)、[任务版图](./task-map.zh-CN.md)、[运行模型](./operating-model.zh-CN.md) | 先理解 `OPL` 用来解决什么问题，以及产品家族怎么组织 |
| 技术规划者、架构读者、方向同步读者 | [项目概览](./project.md)、[当前状态](./status.md)、[架构](./architecture.md)、[硬约束](./invariants.md)、[关键决策](./decisions.md)、[合同目录说明](../contracts/README.md) | 快速把握产品边界、资源模型和当前技术主线 |
| 开发者与维护者 | [参考级索引](./references/README.zh-CN.md)、`docs/specs/`、`docs/plans/`、[历史归档索引](./history/README.zh-CN.md) | 查看实现配套材料、迁移说明和退役路线 |

## 技术工作集

开始改仓库状态前，最快应该读的是这些文件：

- [项目概览](./project.md)
- [当前状态](./status.md)
- [架构](./architecture.md)
- [硬约束](./invariants.md)
- [关键决策](./decisions.md)
- [合同目录说明](../contracts/README.md)

## 现有四层文档体系如何使用

仓库仍然沿用 `OPL` 的四层文档体系。
当前入口顺序是：

- 人类专家从仓库首页和第一层进入
- 技术规划把技术工作集和第二层组合起来阅读
- 开发实现把第三层和第四层视作配套材料
- 当前活跃的公开产品模型写在 [项目概览](./project.md)、[当前状态](./status.md) 和 [架构](./architecture.md)
- 当前活跃交互主线写在本地 `opl` shell / TUI、`Codex` 中的显式调用与外部壳 projection 之间的关系里
- 已退役的 `frontdesk` 时代材料只留在参考层或历史层

## 第一层：默认公开主线

这一层是外部读者理解 `OPL` 的默认公开叙事。
它们必须保持双语、可读、适合第一次接触项目的人。

- [仓库首页](../README.zh-CN.md)
- [路线图](./roadmap.zh-CN.md)
- [任务版图](./task-map.zh-CN.md)
- [运行模型](./operating-model.zh-CN.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.zh-CN.md)

## 第二层：公开合同与技术配套文档

这一层仍然是公开文档，也保持双语，但它的角色是技术理解。

- [OPL 联邦合同](./opl-federation-contract.zh-CN.md)
- [共享基础结构](./shared-foundation.zh-CN.md)
- [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)
- [共享运行时合同](./shared-runtime-contract.zh-CN.md)
- [共享领域合同](./shared-domain-contract.zh-CN.md)
- [OPL 运行时命名与边界合同](./opl-runtime-naming-and-boundary-contract.zh-CN.md)
- [OPL 网关契约面](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL 路由动作网关](./opl-routed-action-gateway.zh-CN.md)
- [OPL 领域接入合同](./opl-domain-onboarding-contract.zh-CN.md)
- [OPL 公开界面索引](./opl-public-surface-index.zh-CN.md)
- [OPL Gateway 合同](../contracts/opl-gateway/README.zh-CN.md)

## 第三层：参考级配套文档

第三层承接审核、验收、推进板、基准和迁移参考材料。
它们继续被仓库跟踪，作为配套材料存在。

- [参考级索引](./references/README.zh-CN.md)
- 产品运行时与执行器参考说明
- 领域对齐与增量收录记录
- 基准与 rollout 看板
- 只为审计保留的 `frontdesk` 历史参考材料

## 第四层：历史规格与计划

第四层是工作历史。
它解释某次冻结和实现的来龙去脉；[当前状态](./status.md) 是当前基线面。

- `docs/specs/`
- `docs/plans/`
- [历史归档索引](./history/README.zh-CN.md)

## 当前真相分别去哪看

- 公开角色、活跃边界、默认阅读顺序： [项目概览](./project.md)、[当前状态](./status.md)、[架构](./architecture.md)
- 机器可读产品资源： [合同目录说明](../contracts/README.md) 与 `contracts/opl-gateway/*.json`
- 参考级配套材料： [参考级索引](./references/README.zh-CN.md)
- 历史与退役路线： [历史归档索引](./history/README.zh-CN.md)

## 文档规则

- 继续把 [仓库首页](../README.zh-CN.md) 保持成潜在用户、医生、专家和其他非技术读者可读的公开入口。
- 第一层与第二层继续保持双语，因为它们属于公开表面。
- 第三层继续保持参考级定位，可以详细。
- 第四层继续作为跟踪中的工作历史。
- 任何影响公开表述、合同或已收录领域状态的变更，都必须同步更新文档、合同与相关验证。
