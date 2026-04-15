[English](./README.md) | **中文**

# OPL 文档索引

这个目录是 `One Person Lab` 的第二层技术阅读面。
仓库首页优先写给潜在用户、人类专家和非技术读者。
而这份索引负责承接其后的架构、合同、规划和实现配套材料。

## 按读者类型进入

| 读者 | 建议起点 | 目的 |
| --- | --- | --- |
| 潜在用户、人类专家、非技术读者 | [仓库首页](../README.zh-CN.md)、[路线图](./roadmap.zh-CN.md)、[任务版图](./task-map.zh-CN.md)、[Gateway 联邦](./gateway-federation.zh-CN.md) | 先理解 `OPL` 是干什么的，再决定是否进入技术细节 |
| 技术规划者、架构读者、方向同步读者 | [项目概览](./project.md)、[当前状态](./status.md)、[架构](./architecture.md)、[硬约束](./invariants.md)、[关键决策](./decisions.md)、[合同目录说明](../contracts/README.md) | 快速把握当前真相、边界和技术主线 |
| 开发者与维护者 | [参考级索引](./references/README.zh-CN.md)、`docs/specs/`、`docs/plans/`、`docs/history/omx/` | 查看实现配套材料、历史记录和跟踪中的工作笔记 |

## 当前基线

- `OPL` 继续是顶层 gateway、federation 与 shared-boundary surface。
- Domain runtime ownership 继续留在 admitted domain 仓，而不是上收进 `OPL`。
- `frontdesk-entry-guide` 现在是给 AI / GUI 壳消费的 family-level machine-readable entry layer；如果用户前台产品壳命名为 `OPL Cortex`，那一层名称位于 repo 内部 `frontdesk_*` contract id 之上。
- 仓库首页应继续保持对非技术专家可读；这份索引可以承担技术说明。
- 当前公开活跃承接面分别是：`Med Auto Science` 的 `Research Ops`、`RedCube AI` 的 `Presentation Ops`，以及当前活跃的医学 `Grant Ops` 业务仓路径 `Med Auto Grant`，其中后者的顶层 admission / handoff wording 仍在 `OPL` 单独门控。

## 技术工作集

开始改仓库状态前，最快应该读的是这些文件：

- [项目概览](./project.md)
- [当前状态](./status.md)
- [架构](./architecture.md)
- [硬约束](./invariants.md)
- [关键决策](./decisions.md)
- [合同目录说明](../contracts/README.md)

## 现有四层文档体系如何使用

仓库仍然沿用 `OPL` 现有的四层文档体系。
这次要修正的，不是层级本身，而是入口顺序：

- 人类专家应从仓库首页和第一层进入
- 技术规划应把“技术工作集”和第二层组合起来阅读
- 开发实现应把第三层和第四层视作配套材料，而不是公开首页
- frontdesk、hosted 与 domain-entry 的现时真相仍以 [当前状态](./status.md) 为准

## 第一层：默认公开主线

这一层是外部读者理解 `OPL` 的默认公开叙事。
它们必须保持双语、可读、适合第一次接触项目的人。

- [仓库首页](../README.zh-CN.md)
- [路线图](./roadmap.zh-CN.md)
- [任务版图](./task-map.zh-CN.md)
- [Gateway 联邦](./gateway-federation.zh-CN.md)
- [运行模型](./operating-model.zh-CN.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.zh-CN.md)

## 第二层：公开合同与技术配套文档

这一层仍然是公开文档，也保持双语，但它的角色是技术理解，不再承担“第一次介绍项目”的首页叙事。

- [OPL 联邦合同](./opl-federation-contract.zh-CN.md)
- [共享基础结构](./shared-foundation.zh-CN.md)
- [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)
- [Shared Runtime Contract](./shared-runtime-contract.zh-CN.md)
- [Shared Domain Contract](./shared-domain-contract.zh-CN.md)
- [OPL Runtime 命名与边界合同](./opl-runtime-naming-and-boundary-contract.zh-CN.md)
- [OPL 只读 Discovery Gateway](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.zh-CN.md)
- [OPL 公开界面索引](./opl-public-surface-index.zh-CN.md)
- [OPL Gateway 合同](../contracts/opl-gateway/README.zh-CN.md)

## 第三层：参考级配套文档

第三层承接审核、验收、推进板、基准、示例和边界检查等参考材料。
它们继续被仓库跟踪，但不应再挤占公开首页的默认阅读路径。

- [参考级索引](./references/README.zh-CN.md)
- `docs/references/contract-convergence-v1-execution-board.md`
- `docs/references/hermes-agent-runtime-substrate-benchmark.md`
- `docs/references/family-orchestration-contract-absorb-crewai.md`
- `docs/references/family-lightweight-direct-entry-rollout-board.md`
- `docs/references/opl-hosted-web-frontdesk-benchmark.md`
- `docs/references/opl-product-entry-and-hermes-kernel-integration.md`
- `docs/references/family-product-entry-and-domain-handoff-architecture.md`
- `docs/references/family-executor-adapter-defaults.md`
- `docs/references/hermes-native-executor-proof-lane.md`
- `docs/references/mas-top-level-cutover-board.md`
- `docs/references/opl-phase-2-central-reference-sync-board.md`
- `docs/references/opl-phase-2-admitted-domain-delta-intake-refresh.md`
- `docs/references/opl-gateway-rollout*`
- `docs/references/opl-gateway-acceptance-test-spec*`
- `docs/references/opl-candidate-domain-backlog*`
- `docs/references/opl-surface-lifecycle-map*`
- `docs/references/opl-surface-authority-matrix*`
- `docs/references/opl-surface-review-matrix*`
- `docs/references/opl-governance-audit-operating-surface*`
- `docs/references/opl-publish-promotion-operating-surface*`
- `docs/references/opl-gateway-example-corpus*`
- `docs/references/opl-routed-safety-example-corpus*`
- `docs/references/opl-operating-example-corpus*`
- `docs/references/opl-operating-record-catalog*`

## 第四层：历史规格与计划

第四层是工作历史。
它可以解释某次冻结和实现为什么发生，但不属于当前仓库真相面的默认入口。

- `docs/specs/`
- `docs/plans/`
- `docs/history/omx/`

## 文档规则

- 继续把 [仓库首页](../README.zh-CN.md) 保持成潜在用户、医生、专家和其他非技术读者可读的公开入口。
- 第一层与第二层继续保持双语，因为它们属于公开表面。
- 第三层继续保持参考级定位；可以详细，但不能取代公开入口路径。
- 第四层继续作为跟踪中的工作历史，而不是当前真相。
- 任何影响公开 wording、gateway contracts 或 admitted-domain 状态的变更，都必须同步更新文档、contracts 与相关验证。

## 治理说明

- 文档治理规则现在冻结在 [series-doc-governance-checklist.md](./references/series-doc-governance-checklist.md)、技术工作集，以及仓库跟踪的 contract/doc surface 中，而不再只堆在 `AGENTS.md`。
- 当前四仓对齐快照收口在 [four-repo-doc-series-sync-summary-2026-04-14.md](./references/four-repo-doc-series-sync-summary-2026-04-14.md)。
- 可复用的 intake 起点收口在 [four-repo-doc-intake-template.md](./references/four-repo-doc-intake-template.md)。
- 默认中央漂移审计命令是 `npm run audit:doc-series`。
