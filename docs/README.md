# OPL 文档索引

Owner: `One Person Lab`
Purpose: `index`
State: `active_index`
Machine boundary: 本文是人读文档入口。机器真相继续归 contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、release artifacts 和真实 evidence。

这个目录是 `One Person Lab` 仓库跟踪文档面的入口索引。
仓库首页优先写给想安装并开始工作的用户。
这份索引服务需要理解当前产品模型、活跃 runtime/activation 主线，以及文档生命周期地图的读者。

## 当前产品模型

`OPL` 是面向高价值知识工作的完整智能体运行框架。它以 阶段推进为原则，并以 Agent executor 为最小执行单位，阶段内默认最小执行单元是 `Codex CLI`，编排单元是领域阶段，产品目标是通过可恢复的阶段尝试、人工关口、收口凭据、进度投影和文件生命周期，推进到可审计的全自动交付。

当前长期原则是 AI-first、executor-first、AI 原生专家判断优先、contract-light：OPL 依靠 `Codex CLI` 等 AI executor、domain stage pack、prompt、skill、tool affordance、knowledge 和 quality gate 的持续进步获得智能体能力提升；合同只负责边界、安全、权限、凭据、可写范围、审计、receipt、阻塞、恢复和投影这些下限，不把开放式智能行为或工具编排写死，也不让机械分数、checklist 或 contract completeness 替代专家 stage 判断。

当前默认 surface 读法是 `Minimal Trust Kernel + Stage Strategy Kernel + Readiness + Derived Diagnostic Lenses + Surface Budget + AI Capability Aperture`。普通 operator / App 先看 readiness entry，例如 `opl framework readiness --family-defaults --json` 和 `opl stages readiness --family-defaults --json`；单仓 `opl stages readiness --domain <domain>` 与其他 diagnostic lenses 只在排障、审计和维护时展开；新增 default surface 必须满足 launch safety、authority boundary、evidence / replay / audit / route-back，或 App / runtime 反复消费。Stage Strategy Kernel 是认知计算内核：stage pack 声明 prompt、skill、tool affordance boundary、knowledge、rubric 和独立 quality gate refs，但工具目录只是 affordance catalog，不是 workflow script。AI Capability Aperture 保留 stage 内开放式专家执行空间，让更强 executor、domain pack、prompt、skill、available affordances、knowledge、rubric 与独立 reviewer 能力直接转化为系统能力。机器政策入口是 `contracts/opl-framework/surface-budget-policy.json` 与 `contracts/opl-framework/cognitive-computation-kernel.json`。

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
Repo 角色按当前 App 边界固定读取：`one-person-lab` 是 framework/runtime/CLI/contracts owner；`one-person-lab-app` 是 GUI product truth、release 和 active-shell validation owner；`opl-aion-shell` 是当前 GUI implementation carrier；MAS/MAG/RCA 等 domain repos 是 domain app/runtime authority。One Person Lab App 的普通用户形态是 `Codex App wrapper`，固定 `Codex CLI` executor，并以内置任务入口呈现 Foundry Agents。

跨仓 SSOT 路由固定为：OPL 文档维护 Framework runtime、StageRun / Runway、`current_owner_delta`、generated/hosted surfaces、App/workbench projection 和 shared primitive 的 truth；MAS/MAG/RCA/Book Forge 文档维护各自 domain truth、quality/export verdict、artifact authority、owner receipt、typed blocker、human gate 和 direct skill path。MAS 论文推进的当前 SSOT 是 MAS 仓的 `PaperMissionRun` / `paper-mission` / `paper_mission/start_or_resume`；OPL 只能消费其 refs、mission projection 和 owner-answer handoff，不能在 OPL 文档或 runtime 中复制为新的 paper-progress truth。

## 按读者类型进入

| 读者 | 建议起点 | 目的 |
| --- | --- | --- |
| 用户 | [仓库首页](../README.md) | 安装 OPL、启动 GUI 或网页入口，并按任务选择 Codex 或 domain agent |
| 新机器 Codex bootstrap | [新机器 Codex 全家桶安装入口](./references/current-support/opl-new-machine-codex-bootstrap.md) | 一句话让 Codex 安装配置 OPL runtime、MAS/MAG/RCA/Book Forge/OMA、OPL Flow、OPL Doc 和 companion tools |
| 技术规划者、架构读者、方向同步读者 | [项目概览](./project.md)、[当前状态](./status.md)、[架构](./architecture.md)、[硬约束](./invariants.md)、[关键决策](./decisions.md)、[合同目录说明](../contracts/README.md) | 恢复当前边界、运行时模型和 admitted-domain split |
| 开发者与维护者 | [文档组合治理](./docs_portfolio_consolidation.md)、[活跃支撑文档](./active/README.md)、[公开支撑文档](./public/README.md)、[规格索引](./specs/README.md)、[参考级索引](./references/README.md)、[历史归档索引](./history/README.md) | 查看生命周期角色、活跃支撑、公开支撑、当前规格入口、参考材料和退役路线 |

## 技术工作集

开始改仓库状态前，先按职责读这三层，不再把历史 rollout、dated closeout 或参考材料平铺成同一条技术阅读清单：

1. 当前 truth：
- [项目概览](./project.md)
- [当前状态](./status.md)
- [架构](./architecture.md)
- [硬约束](./invariants.md)
- [关键决策](./decisions.md)
- [合同目录说明](../contracts/README.md)
2. 当前目标、差距和执行 owner：
- [文档组合治理](./docs_portfolio_consolidation.md)
- [OPL 系列项目开发主参考](./active/opl-family-development-reference.md)
- [OPL 当前开发线路](./active/current-development-lines.md)
- [OPL 开发文档组合整理](./active/development-document-portfolio.md)
- [OPL Family 当前状态与理想目标差距](./active/current-state-vs-ideal-gap.md)
- [OPL Foundry Agent 目标操作架构](./active/opl-foundry-agent-target-operating-architecture.md)
- [OPL 与 Foundry Agents 理想目标态](./references/runtime-substrate/opl-family-agent-ideal-state.md)
- [OPL 品牌模块理想态](./references/brand-modules/README.md)
- [OPL 品牌模块完成度对照](./references/brand-modules/current-maturity-against-workspace.md)
- [AI-first / executor-first 长期优化调研入口](./references/runtime-substrate/ai-first-executor-first-long-horizon-optimization.md)
3. 专题支撑，只在触及对应 owner 时读取：
- [OPL Runtime Manager 目标形态](./references/runtime-substrate/opl-runtime-manager-target.md)
- [Runtime Substrate 参考索引](./references/runtime-substrate/README.md)
- [OPL Stage-Led Agent Framework Roadmap](./references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md)
- [Family Domain Memory Governance](./references/operating-governance/family-domain-memory-governance.md)
- [GitHub CI 自动化巡检政策](./policies/github-ci-automation-policy.md)
- [规格索引](./specs/README.md)

OPL 系列项目开发的主参考是 [OPL 系列项目开发主参考](./active/opl-family-development-reference.md)：OPL 仓维护全局目标、全局差距、上收边界、shared primitives、App/workbench 目标和跨仓开发顺序；MAS/MAG/RCA/Book Forge 各仓维护本仓目标、差距、authority、direct/hosted 边界和本仓上收清单。`opl-aion-shell` 的上游 AionUI docs 不纳入这套目录治理。

旧的内容级收敛记录、Family Docs 生命周期治理 rollout、dated proof、line-count closeout 和外部学习记录继续保留在 `docs/references/` 或 `docs/history/`，但只按支撑参考或 provenance 阅读。若其中仍有 current rule，必须先提升到核心五件套、`docs/active/` owner 文档、policy/spec，或机器合同；不要把旧 reference 原文当成新的 active checklist。

## 生命周期组合

`docs/` 现在按生命周期状态管理，而不是继续平铺四层文件。
每份长期文档都必须说明 `owner`、`purpose`、`state` 和 `machine boundary`。
生命周期状态按内容角色判断，长期落点按 canonical 目录集合收敛。一个看起来仍在 active/reference 路径下的文件，如果内容是过时计划、旧 topology、旧入口或旧 provider 判断，就必须标成 superseded / retired / tombstone 语境，并指向当前 owner surface。

- `docs/` 根目录只保留文档索引、核心五件套和 [文档组合治理](./docs_portfolio_consolidation.md)。
- `docs/active/` 承接当前 runtime、activation、onboarding 和 shared-boundary 的人读支撑。
- `docs/public/` 承接仓库首页之后的公开产品方向支撑。
- `docs/product/` 承接 One Person Lab App/workbench、operator entry 和产品入口支撑。
- `docs/runtime/` 承接 OPL framework runtime、provider/executor、control plane 与 projection/read-model 支撑。
- `docs/delivery/` 承接通用 artifact/package/export lifecycle shell 支撑；domain 交付 authority 仍归 MAS/MAG/RCA。
- `docs/source/` 承接通用 workspace/source intake 和 source truth transport shell 支撑；domain source semantics 仍归各仓。
- `docs/policies/` 承接长期治理规则和 repo-local 运行纪律。
- `docs/specs/` 只承接仍然活跃的 runtime / product-boundary 规格；当前为空时，说明规格真相已经收敛到核心五件套、`docs/active/`、runtime-substrate roadmap 和机器可读合同。
- `docs/references/` 按用途承接支撑参考。
- `docs/history/` 承接 dated snapshot、退役路径、来源归档和 tombstone。

当前活跃公开模型写在 [项目概览](./project.md)、[当前状态](./status.md) 和 [架构](./architecture.md)。
当前活跃交互模型是 stage-led、以 Agent executor 为最小执行单位、runtime-first、skill-first。
已退役的 `gateway / federation / routed-action` 语料以及 `frontdoor` 时代材料，都应放在活跃层之下理解。

## 公开支撑

仓库首页首先面向潜在用户，必须保持安装优先、可读，并直接说明用户可以开始和交付什么工作。`docs/public/` 是仓库首页之后专门给外部读者继续阅读的公开文档入口，保持小而干净；维护过程、生成来源和支撑参考不从这里平铺给普通用户。

- [仓库首页](../README.md)
- [公开文档入口](./public/README.md)
- [OPL 系列仓库地图](./public/repo-map.md)
- [OPL 白皮书系列](https://gaofeng21cn.github.io/one-person-lab/latest/whitepapers/)：OPL Framework、OPL App、OPL Cloud 与 MAS 的设计理念和信任边界。
- [路线图](./public/roadmap.md)
- [任务版图](./public/task-map.md)
- [运行模型](./public/operating-model.md)
- [Unified Harness Engineering Substrate](./public/unified-harness-engineering-substrate.md)

## 活跃支撑

这些人读文档支撑当前 `Codex-default executor + explicit activation layer + provider-backed stage runtime + family skill sync/discovery` 主线。

- [项目概览](./project.md)
- [当前状态](./status.md)
- [架构](./architecture.md)
- [硬约束](./invariants.md)
- [关键决策](./decisions.md)
- [合同目录说明](../contracts/README.md)
- [OPL 公开界面索引](./product/opl-public-surface-index.md)
- [OPL 系列项目开发主参考](./active/opl-family-development-reference.md)
- [OPL Family 当前状态与理想目标差距](./active/current-state-vs-ideal-gap.md)
- [OPL 开发文档组合整理](./active/development-document-portfolio.md)
- [活跃支撑文档索引](./active/README.md)

## 参考与历史

参考文档承接审核、验收、推进板、基准、迁移说明、样例和 operating-governance 材料。
它们继续被仓库跟踪，但不是当前默认实现依据。

- [参考级索引](./references/README.md)
- [Runtime Substrate 参考索引](./references/runtime-substrate/README.md)
- [OPL Runtime Manager 目标形态](./references/runtime-substrate/opl-runtime-manager-target.md)
- [OPL stage-led agent framework roadmap](./references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md)
- [OPL 品牌模块理想态](./references/brand-modules/README.md)
- [OPL 品牌模块完成度对照](./references/brand-modules/current-maturity-against-workspace.md)
- [AI-first / executor-first 长期优化调研入口](./references/runtime-substrate/ai-first-executor-first-long-horizon-optimization.md)
- [当前支撑参考索引](./references/current-support/README.md)
- [Operating governance 参考索引](./references/operating-governance/README.md)
- [Docker WebUI 部署参考](./references/current-support/opl-docker-webui-deployment.md)
- [OPL GUI Shell Adapter 边界说明](./references/current-support/opl-gui-shell-adapter-boundary.md)
- [OPL Fresh Install 与 GUI 首启测试参考](./references/current-support/opl-fresh-install-and-gui-first-launch-testing.md)
- [OPL 新机器 Codex 全家桶安装入口](./references/current-support/opl-new-machine-codex-bootstrap.md)
- [OPL 默认 Skill 生态参考](./references/current-support/opl-default-skill-ecosystem.md)
- [OPL Release 与 Packages 模块化分发参考](./references/current-support/opl-release-packages-modular-distribution.md)
- [OPL 测试 Lane 治理参考](./references/current-support/opl-test-lane-governance.md)
- [共享运行时合同](./specs/shared-runtime-contract.md)、[共享领域合同](./specs/shared-domain-contract.md) 与 [OPL 运行时命名与边界合同](./runtime/opl-runtime-naming-and-boundary-contract.md) 是活跃 shared-boundary 支撑文档。原 `Shared Foundation` / `Shared Foundation Ownership` 已吸收到 [OPL Family 开发主参考](./active/opl-family-development-reference.md) 和公开 operating model，历史副本进入 [Shared Boundary 过程历史](./history/process/shared-boundary/README.md)。
- 已退役的 `gateway / federation / routed-action` 语料进入 [Gateway / Federation 来源归档](./history/compatibility/gateway-federation/README.md)。
- 已退役的 `frontdoor` 时代材料进入 [Frontdoor 历史资料](./history/frontdoor-legacy/README.md)。

## 历史

历史解释某次冻结和实现的来龙去脉；[当前状态](./status.md) 是当前基线面。

- [过程历史归档](./history/process/README.md)
- [历史归档索引](./history/README.md)

## 当前真相分别去哪看

- 公开角色、活跃边界、默认阅读顺序： [项目概览](./project.md)、[当前状态](./status.md)、[架构](./architecture.md)
- OPL 自己持有的机器可读产品资源： [合同目录说明](../contracts/README.md)
- 已收录 domain 的 capability surface：各 domain 仓自己的 repo-owned surface 与 `opl connect sync-skills`
- 活跃 framework 合同：`contracts/opl-framework/*.json`
- 当前 runtime / product-boundary 规格入口：[规格索引](./specs/README.md)
- 已退役 gateway/federation 来源语料：[Gateway / Federation 来源归档](./history/compatibility/gateway-federation/README.md)
- 参考级配套材料： [参考级索引](./references/README.md)
- 历史与退役路线： [历史归档索引](./history/README.md) 与 [过程历史归档](./history/process/README.md)

## 文档规则

- 继续把 [仓库首页](../README.md) 保持成安装优先、用户视角、医生/专家和其他非技术读者可读的公开入口。
- `docs/**` 是中文内部开发与维护参考。稳定文档路径优先使用无语言后缀 `.md` 承载中文 canonical 内容；不再维护 docs 层双语镜像。
- 文档治理按 OPL-family canonical docs taxonomy 执行；内容生命周期决定去向，
  但长期目录名统一为 `active/public/product/runtime/delivery/source/policies/specs/references/history`。
- 已被核心五件套或当前 framework roadmap 取代的一次性计划，应进入 history / tombstone 语境，不继续作为 active reference 扩写。
- 参考文档必须把 provenance surface 和 current truth 区分清楚。
- 历史继续作为仓库跟踪的 provenance 和 tombstone。
- `docs/**` 与 `README*` 默认是人读材料：脚本、合同、测试和 runtime dashboard 应使用 contract file、schema file、source file、CLI/API 行为或语义化 `human_doc:*` 标识，不应把叙述文档路径钉成机读约束。
- 新增或移动文档必须先按 [文档组合治理](./docs_portfolio_consolidation.md) 判断生命周期角色。
- Active 文档不得继续追加 receipt/proof 流水、workorder 瞬时计数、line-count split 或 worktree closeout；这些过程记录进入 `docs/history/**`，active 层只保留当前 owner、gap、完成口径和验证入口。
- 跨仓 docs 治理按 [文档组合治理](./docs_portfolio_consolidation.md)、[OPL Family 开发主参考](./active/opl-family-development-reference.md)、[OPL 开发文档组合整理](./active/development-document-portfolio.md) 和 [文档生命周期政策](./policies/docs-lifecycle-policy.md) 执行：默认巡检范围是 OPL、MAS、MAG、RCA、OMA、Book Forge 和 App 七仓；OPL/MAS/MAG/RCA/Book Forge 采用同名 canonical docs taxonomy；OMA 与 App 按 repo-specific 职责治理，只有出现长期职责时才新增对应目录索引。旧 `program/plans/capabilities` 等目录能物理迁移就直接迁移，仍暂留的旧路径只能是外部/上游支撑、历史 provenance 或 tombstone，不继续扩写成平行目录体系。`opl-aion-shell` 的 docs 属于上游 AionUI 依赖文档，不纳入这套目录治理。2026-05 的 lifecycle rollout 和内容级收敛记录已归入 [Convergence Governance 过程归档](./history/process/convergence-governance/README.md)，只作来源说明。
- 任何影响公开表述、合同或已收录领域状态的变更，都必须同步更新文档、合同与相关验证。
