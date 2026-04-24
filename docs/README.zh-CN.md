[English](./README.md) | **中文**

# OPL 文档索引

这个目录是 `One Person Lab` 仓库跟踪文档面的入口索引。
仓库首页优先写给潜在用户、人类专家和非技术读者。
这份索引把当前产品模型、活跃 runtime/activation 主线，以及参考层和历史层串起来。

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

当前 canonical truth 是 `Codex-default` session/runtime 以及其上的 explicit activation layer。
各个领域仓继续持有自己的 agent logic、runtime rule、progress truth 和 deliverable。

## 按读者类型进入

| 读者 | 建议起点 | 目的 |
| --- | --- | --- |
| 潜在用户、人类专家、非技术读者 | [仓库首页](../README.zh-CN.md)、[路线图](./roadmap.zh-CN.md)、[任务版图](./task-map.zh-CN.md)、[运行模型](./operating-model.zh-CN.md) | 先理解 `OPL` 用来解决什么问题，以及产品家族怎么组织 |
| 技术规划者、架构读者、方向同步读者 | [项目概览](./project.md)、[当前状态](./status.md)、[架构](./architecture.md)、[硬约束](./invariants.md)、[关键决策](./decisions.md)、[合同目录说明](../contracts/README.md) | 恢复当前边界、运行时模型和 admitted-domain split |
| 开发者与维护者 | [参考级索引](./references/README.zh-CN.md)、`docs/specs/`、`docs/plans/`、[历史归档索引](./history/README.zh-CN.md) | 查看配套材料、兼容说明和退役路线 |

## 技术工作集

开始改仓库状态前，最快应该读的是这些文件：

- [项目概览](./project.md)
- [当前状态](./status.md)
- [架构](./architecture.md)
- [硬约束](./invariants.md)
- [关键决策](./decisions.md)
- [合同目录说明](../contracts/README.md)

## 四层文档体系怎么用

仓库仍然沿用四层 `OPL` 文档体系，使用方式如下：

- 第一层解释默认公开产品叙事。
- 第二层解释当前活跃的 runtime/activation 主线。
- 第三层承接 reference、compatibility、audit 和 migration 材料。
- 第四层承接仓库跟踪的工作历史。

当前活跃公开模型写在 [项目概览](./project.md)、[当前状态](./status.md) 和 [架构](./architecture.md)。
当前活跃交互模型是 runtime-first、skill-first。
已退役的 `gateway / federation / routed-action` 语料以及 `frontdesk` 时代材料，都应放在活跃层之下理解。

## 第一层：默认公开主线

这一层是外部读者理解 `OPL` 的默认公开叙事。
它们必须保持双语、可读、适合第一次接触项目的人。

- [仓库首页](../README.zh-CN.md)
- [路线图](./roadmap.zh-CN.md)
- [任务版图](./task-map.zh-CN.md)
- [运行模型](./operating-model.zh-CN.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.zh-CN.md)

## 第二层：活跃 runtime / activation 文档

这一层仍然是公开文档，也保持双语。
它解释的是当前 `Codex-default session/runtime + explicit activation layer + family skill sync/discovery` 这条主线。

- [项目概览](./project.md)
- [当前状态](./status.md)
- [架构](./architecture.md)
- [硬约束](./invariants.md)
- [关键决策](./decisions.md)
- [合同目录说明](../contracts/README.md)
- [共享基础结构](./shared-foundation.zh-CN.md)
- [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)
- [共享运行时合同](./shared-runtime-contract.zh-CN.md)
- [共享领域合同](./shared-domain-contract.zh-CN.md)
- [OPL 运行时命名与边界合同](./opl-runtime-naming-and-boundary-contract.zh-CN.md)
- [OPL 公开界面索引](./opl-public-surface-index.zh-CN.md)

## 第三层：参考 / 兼容文档

第三层承接审核、验收、推进板、基准、迁移说明和退役合同语料。
它们继续被仓库跟踪，但不是当前默认实现依据。

- [参考级索引](./references/README.zh-CN.md)
- 产品运行时与执行器参考说明
- 领域对齐与增量收录记录
- 基准与 rollout 看板
- 已退役的 `gateway / federation / routed-action` 合同语料
- 只为审计保留的 `frontdesk` 历史参考材料

## 第四层：历史规格与计划

第四层是仓库跟踪的工作历史。
它解释某次冻结和实现的来龙去脉；[当前状态](./status.md) 是当前基线面。

- `docs/specs/`
- `docs/plans/`
- [历史归档索引](./history/README.zh-CN.md)

## 当前真相分别去哪看

- 公开角色、活跃边界、默认阅读顺序： [项目概览](./project.md)、[当前状态](./status.md)、[架构](./architecture.md)
- OPL 自己持有的机器可读产品资源： [合同目录说明](../contracts/README.md)
- 已收录 domain 的 capability surface：各 domain 仓自己的 repo-owned surface 与 `opl skill sync`
- 历史 gateway/federation 兼容语料：`contracts/opl-gateway/*.json` 与配套 gateway 文档
- 参考级配套材料： [参考级索引](./references/README.zh-CN.md)
- 历史与退役路线： [历史归档索引](./history/README.zh-CN.md)

## 文档规则

- 继续把 [仓库首页](../README.zh-CN.md) 保持成潜在用户、医生、专家和其他非技术读者可读的公开入口。
- 活跃公开文档继续保持双语。
- 第三层必须把 compatibility surface 和 current truth 区分清楚。
- 第四层继续作为仓库跟踪历史。
- 任何影响公开表述、合同或已收录领域状态的变更，都必须同步更新文档、合同与相关验证。
