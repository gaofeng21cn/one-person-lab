[English](./README.md) | **中文**

# OPL 文档索引

这个目录是 `One Person Lab` 的技术阅读面。
仓库首页优先写给潜在用户、人类专家和非技术读者。
这份索引承接当前产品壳叙事背后的架构、合同、规划和实现配套材料。

## 按读者类型进入

| 读者 | 建议起点 | 目的 |
| --- | --- | --- |
| 潜在用户、人类专家、非技术读者 | [仓库首页](../README.zh-CN.md)、[路线图](./roadmap.zh-CN.md)、[任务版图](./task-map.zh-CN.md)、[运行模型](./operating-model.zh-CN.md) | 先理解 `OPL` 的产品壳、产品家族和当前实现，再进入技术细节 |
| 技术规划者、架构读者、方向同步读者 | [项目概览](./project.md)、[当前状态](./status.md)、[架构](./architecture.md)、[硬约束](./invariants.md)、[关键决策](./decisions.md)、[合同目录说明](../contracts/README.md) | 快速把握当前基线、边界和技术主线 |
| 开发者与维护者 | [参考级索引](./references/README.zh-CN.md)、`docs/specs/`、`docs/plans/`、`docs/history/omx/` | 查看实现配套材料、历史记录和跟踪中的工作笔记 |

## 当前基线

- `OPL` 是一人课题组智能体的 Codex-native GUI 产品壳与模块管理器。
- 对外公开的阅读模型采用三层：产品壳 -> 产品家族 -> 当前实现。
- GUI 中并列呈现三类工作模式：普通 Codex 对话、通用 Codex 任务、专用智能体模块。
- `Research Foundry`、`Grant Foundry`、`Presentation Foundry` 是当前活跃产品家族；`Thesis Foundry` 与 `Review Foundry` 继续处在定义阶段。
- `MAS`、`MAG`、`RCA` 是这些产品家族当前已经公开的实现。
- 设置面承载模块管理、模块升级、版本 pin、模块健康、默认模式和 online gateway 配置。
- workspace 侧边栏承载人话进度、运行中的任务状态和交付文件。
- `Hermes-Agent` 是显式备用模式与在线网关，用于远端或替代 runtime 路径。
- 各智能体仓库继续维护各自专业能力和 readiness 真相。

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
- 技术规划把“技术工作集”和第二层组合起来阅读
- 开发实现把第三层和第四层视作配套材料
- 当前公开产品心智以 `产品壳 -> 产品家族 -> 当前实现` 为准
- 产品壳、模块、设置和 online gateway 的现时真相以 [当前状态](./status.md) 为准
- `opl frontdesk bootstrap --path <workspace>` 准备本地 `OPL Atlas` Desktop 壳，并把 active workspace 接入模块 registry
- 默认的 `OPL Cortex` 前台桥保持小而稳定：论文/项目进度、执行请求、任务状态、最近会话、恢复会话、运行日志、项目列表、切换 workspace
- 真正的前台执行请求采用“异步受理”语义：先返回 `task_id`，再通过任务状态面持续追踪
- Codex 是普通对话与通用本地任务的默认执行者
- `Hermes-Agent` 是显式备用在线网关

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
- [Shared Runtime Contract](./shared-runtime-contract.zh-CN.md)
- [Shared Domain Contract](./shared-domain-contract.zh-CN.md)
- [OPL Runtime 命名与边界合同](./opl-runtime-naming-and-boundary-contract.zh-CN.md)
- [OPL Gateway 契约面](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.zh-CN.md)
- [OPL 公开界面索引](./opl-public-surface-index.zh-CN.md)
- [OPL Gateway 合同](../contracts/opl-gateway/README.zh-CN.md)

## 第三层：参考级配套文档

第三层承接审核、验收、推进板、基准、示例和边界检查等参考材料。
它们继续被仓库跟踪，作为配套材料存在。

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
- admitted-domain 同步与 delta intake 参考记录
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
它解释某次冻结和实现的来龙去脉；[当前状态](./status.md) 是当前基线面。

- `docs/specs/`
- `docs/plans/`
- `docs/history/omx/`

## 文档规则

- 继续把 [仓库首页](../README.zh-CN.md) 保持成潜在用户、医生、专家和其他非技术读者可读的公开入口。
- 第一层与第二层继续保持双语，因为它们属于公开表面。
- 第三层继续保持参考级定位，可以详细。
- 第四层继续作为跟踪中的工作历史。
- 任何影响公开 wording、contracts 或 admitted-domain 状态的变更，都必须同步更新文档、contracts 与相关验证。

## 治理说明

- 文档治理说明收口在 [series-doc-governance-checklist.md](./references/series-doc-governance-checklist.md)、技术工作集，以及仓库跟踪的 contract/doc surface 中。
- 当前四仓对齐快照收口在 [four-repo-doc-series-sync-summary-2026-04-14.md](./references/four-repo-doc-series-sync-summary-2026-04-14.md)。
- 可复用的 intake 起点收口在 [four-repo-doc-intake-template.md](./references/four-repo-doc-intake-template.md)。
- 跨仓文档轮次应直接在受影响仓库里人工审阅，并配套各仓自己的常规验证入口。
