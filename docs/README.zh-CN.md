[English](./README.md) | **中文**

# OPL 文档索引

这个目录是 `One Person Lab` 仓库跟踪文档面的入口索引。
仓库首页优先写给想安装并开始工作的用户。
这份索引服务需要理解当前产品模型、活跃 runtime/activation 主线，以及文档生命周期地图的读者。

## 当前产品模型

`OPL` 是面向高价值知识工作的完整智能体运行框架。它以 Codex 优先、阶段推进为原则，阶段内默认最小执行单元是 `Codex CLI`，编排单元是领域阶段，产品目标是通过可恢复的阶段尝试、人工关口、收口凭据、进度投影和文件生命周期，推进到可审计的全自动交付。

当前公开的 `OPL` 资源模型统一为：

- `System`
- `Engines`
- `Modules`
- `Agents`
- `Workspaces`
- `Sessions`
- `Progress`
- `Artifacts`

当前 canonical truth 是 `Codex-default` session/runtime，以及其上的 explicit activation layer 和 provider-backed family runtime control plane。
各个领域仓继续持有自己的 agent logic、runtime rule、progress truth 和 deliverable。

## 按读者类型进入

| 读者 | 建议起点 | 目的 |
| --- | --- | --- |
| 用户 | [仓库首页](../README.zh-CN.md) | 安装 OPL、启动 GUI 或网页入口，并按任务选择 Codex 或 domain agent |
| 技术规划者、架构读者、方向同步读者 | [项目概览](./project.md)、[当前状态](./status.md)、[架构](./architecture.md)、[硬约束](./invariants.md)、[关键决策](./decisions.md)、[合同目录说明](../contracts/README.md) | 恢复当前边界、运行时模型和 admitted-domain split |
| 开发者与维护者 | [文档组合治理](./docs_portfolio_consolidation.md)、[活跃支撑文档](./active/README.zh-CN.md)、[公开支撑文档](./public/README.zh-CN.md)、[参考级索引](./references/README.zh-CN.md)、`docs/specs/` 下的当前规格、[历史归档索引](./history/README.zh-CN.md) | 查看生命周期角色、活跃支撑、公开支撑、参考材料、规格和退役路线 |

## 技术工作集

开始改仓库状态前，最快应该读的是这些文件：

- [项目概览](./project.md)
- [当前状态](./status.md)
- [架构](./architecture.md)
- [硬约束](./invariants.md)
- [关键决策](./decisions.md)
- [合同目录说明](../contracts/README.md)
- [文档组合治理](./docs_portfolio_consolidation.md)
- [Family Docs 生命周期治理落地记录](./references/convergence-governance/family-docs-lifecycle-governance-rollout-2026-05-09.zh-CN.md)
- [OPL Runtime Manager 目标形态](./references/runtime-substrate/opl-runtime-manager-target.md)
- [Runtime Substrate 参考索引](./references/runtime-substrate/README.zh-CN.md)
- [OPL Stage-Led Agent Framework Roadmap](./references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md)
- [Family Domain Memory Governance](./references/operating-governance/family-domain-memory-governance.zh-CN.md)

2026-05-11 架构收敛后，OPL framework 后续开发的总入口是
[OPL Stage-Led Agent Framework Roadmap](./references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md)。
它持有当前 `TypeScript` 控制面决策、Temporal provider 计划、domain-agent 边界，以及
Hermes-first / Gateway / legacy local-runtime surface 的退役纪律。
涉及 MAS/MAG/RCA 的领域经验记忆、路线套路、视觉模式或模板边界时，先读
[Family Domain Memory Governance](./references/operating-governance/family-domain-memory-governance.zh-CN.md)；
该入口只治理 framework 与 domain owner 边界，不把领域内容上收到 OPL。

## 生命周期组合

`docs/` 现在按生命周期状态管理，而不是继续平铺四层文件。
每份长期文档都必须说明 `owner`、`purpose`、`state` 和 `machine boundary`。
生命周期按内容角色判断，不按文件名、目录名或旧链接机械判断。一个看起来仍在 active/reference 路径下的文件，如果内容是过时计划、旧 topology、旧入口或旧 provider 判断，就必须标成 superseded / retired / tombstone 语境，并指向当前 owner surface。

- `docs/` 根目录只保留文档索引、核心五件套和 [文档组合治理](./docs_portfolio_consolidation.md)。
- `docs/active/` 承接当前 runtime、activation、onboarding 和 shared-boundary 的人读支撑。
- `docs/public/` 承接仓库首页之后的公开产品方向支撑。
- `docs/specs/` 承接仍然活跃的 runtime / product-boundary 规格。
- `docs/references/` 按用途承接支撑参考。
- `docs/history/` 承接 dated snapshot、退役路径、来源归档和 tombstone。

当前活跃公开模型写在 [项目概览](./project.md)、[当前状态](./status.md) 和 [架构](./architecture.md)。
当前活跃交互模型是 Codex-first、stage-led、runtime-first、skill-first。
已退役的 `gateway / federation / routed-action` 语料以及 `frontdoor` 时代材料，都应放在活跃层之下理解。

## 公开支撑

仓库首页首先面向潜在用户，必须保持安装优先、双语、可读，并直接说明用户可以开始和交付什么工作。路线图和运行模型在用户知道如何启动后，再解释产品方向。

- [仓库首页](../README.zh-CN.md)
- [路线图](./public/roadmap.zh-CN.md)
- [任务版图](./public/task-map.zh-CN.md)
- [运行模型](./public/operating-model.zh-CN.md)
- [Unified Harness Engineering Substrate](./public/unified-harness-engineering-substrate.zh-CN.md)

## 活跃支撑

这些人读文档支撑当前 `Codex-default session/runtime + explicit activation layer + family skill sync/discovery` 主线。

- [项目概览](./project.md)
- [当前状态](./status.md)
- [架构](./architecture.md)
- [硬约束](./invariants.md)
- [关键决策](./decisions.md)
- [合同目录说明](../contracts/README.md)
- [OPL 公开界面索引](./active/opl-public-surface-index.zh-CN.md)
- [活跃支撑文档索引](./active/README.zh-CN.md)

## 参考与历史

参考文档承接审核、验收、推进板、基准、迁移说明、样例和 operating-governance 材料。
它们继续被仓库跟踪，但不是当前默认实现依据。

- [参考级索引](./references/README.zh-CN.md)
- [Runtime Substrate 参考索引](./references/runtime-substrate/README.zh-CN.md)
- [OPL Runtime Manager 目标形态](./references/runtime-substrate/opl-runtime-manager-target.md)
- [OPL stage-led agent framework roadmap](./references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md)
- [Docker WebUI 部署参考](./references/current-support/opl-docker-webui-deployment.zh-CN.md)
- [OPL GUI Shell Adapter 边界说明](./references/current-support/opl-gui-shell-adapter-boundary.zh-CN.md)
- [OPL Fresh Install 与 GUI 首启测试参考](./references/current-support/opl-fresh-install-and-gui-first-launch-testing.zh-CN.md)
- [OPL 默认 Skill 生态参考](./references/current-support/opl-default-skill-ecosystem.zh-CN.md)
- [OPL Release 与 Packages 模块化分发参考](./references/current-support/opl-release-packages-modular-distribution.zh-CN.md)
- [OPL 测试 Lane 治理参考](./references/current-support/opl-test-lane-governance.zh-CN.md)
- [共享基础结构](./active/shared-foundation.zh-CN.md)、[共享基础结构归属](./active/shared-foundation-ownership.zh-CN.md)、[共享运行时合同](./active/shared-runtime-contract.zh-CN.md)、[共享领域合同](./active/shared-domain-contract.zh-CN.md) 与 [OPL 运行时命名与边界合同](./active/opl-runtime-naming-and-boundary-contract.zh-CN.md) 是活跃支撑文档。
- 已退役的 `gateway / federation / routed-action` 语料进入 [Gateway / Federation 来源归档](./history/compatibility/gateway-federation/README.zh-CN.md)。
- 已退役的 `frontdoor` 时代材料进入 [Frontdoor 历史资料](./history/frontdoor-legacy/README.md)。

## 历史

历史解释某次冻结和实现的来龙去脉；[当前状态](./status.md) 是当前基线面。

- [过程历史归档](./history/process/README.zh-CN.md)
- [历史归档索引](./history/README.zh-CN.md)

## 当前真相分别去哪看

- 公开角色、活跃边界、默认阅读顺序： [项目概览](./project.md)、[当前状态](./status.md)、[架构](./architecture.md)
- OPL 自己持有的机器可读产品资源： [合同目录说明](../contracts/README.md)
- 已收录 domain 的 capability surface：各 domain 仓自己的 repo-owned surface 与 `opl skill sync`
- 活跃 framework 合同：`contracts/opl-framework/*.json`
- 已退役 gateway/federation 来源语料：[Gateway / Federation 来源归档](./history/compatibility/gateway-federation/README.zh-CN.md)
- 参考级配套材料： [参考级索引](./references/README.zh-CN.md)
- 历史与退役路线： [历史归档索引](./history/README.zh-CN.md) 与 [过程历史归档](./history/process/README.zh-CN.md)

## 文档规则

- 继续把 [仓库首页](../README.zh-CN.md) 保持成安装优先、用户视角、医生/专家和其他非技术读者可读的公开入口。
- 活跃公开文档继续保持双语。
- 文档治理按内容生命周期判断，不按文件名、目录名或旧链接机械判断。
- 已被核心五件套或当前 framework roadmap 取代的一次性计划，应进入 history / tombstone 语境，不继续作为 active reference 扩写。
- 参考文档必须把 provenance surface 和 current truth 区分清楚。
- 历史继续作为仓库跟踪的 provenance 和 tombstone。
- `docs/**` 与 `README*` 默认是人读材料：脚本、合同、测试和 runtime dashboard 应使用 contract file、schema file、source file、CLI/API 行为或语义化 `human_doc:*` 标识，不应把叙述文档路径钉成机读约束。
- 新增或移动文档必须先按 [文档组合治理](./docs_portfolio_consolidation.md) 判断生命周期角色。
- 跨仓 docs 治理按 [Family Docs 生命周期治理落地记录](./references/convergence-governance/family-docs-lifecycle-governance-rollout-2026-05-09.zh-CN.md) 执行：OPL、MAS、MAG、RCA 保持生命周期角色等价，不强制目录名完全一致。
- 任何影响公开表述、合同或已收录领域状态的变更，都必须同步更新文档、合同与相关验证。
