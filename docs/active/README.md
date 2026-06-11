# Active 文档线

Status: `active_support`
Owner: `One Person Lab`
Purpose: `active_docs_index`
State: `active_support`
Machine boundary: 本文是人读索引。机器真相继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 App/workspace evidence。

本目录只收纳唯一 active owner 以及支撑标准、矩阵、索引和组合治理文档。执行顺序、差距闭环和当前完成门槛只由 `current-state-vs-ideal-gap.md` 维护；dated closeout、receipt/proof 流水、line-count closeout、worktree/branch 过程、workorder 瞬时计数和历史演变进入 `docs/history/**`。

## 统一读法

`docs/active/current-state-vs-ideal-gap.md` 是 OPL family 当前目标、差距、完成口径和下一轮 baton 的唯一 active owner。其他 active/support 文件只提供标准、矩阵、审计或路线支撑；它们不能独立声明新主线、live readiness、domain ready、App release ready、production ready 或物理删除授权。

当前 active 文档线统一收敛到一个目标：

```text
OPL Framework current_owner_delta root
  -> One Person Lab App cockpit
  -> Foundry Agent single ordinary golden path
  -> Stage Artifact Unit progress truth
  -> domain owner receipt / typed blocker / human gate
```

`ordinary-progress-spine-and-audit-sidecar-plan.md` 是 active_support 完整治理规划：把 MAS/OPL 当前卡住问题收敛为普通推进主干与审计证据旁路分层，定义 `ProgressDeltaReceipt`、artifact tiering、readiness JIT、sidecar hard-gate upgrade 条件和 P0-P5 实施顺序。它不维护 live counters 或第二 backlog；当前 gap、next action 和完成口径仍回 `current-state-vs-ideal-gap.md`。

`foundry-agent-os-family-target-implementation-plan.md` 是 active_support family-level 目标实施规划：把 MAS 的 Agent OS 方案抽象为 `OPL Agent OS + Domain Declarative Pack + Domain Minimal Authority Kernel + Domain Capability Registry`，并说明十个品牌模块、Capability Registry、MAS/MAG/RCA/OMA target delta 和 cross-agent conformance gate 如何落地。它不维护第二 active backlog；当前执行顺序仍回 `current-state-vs-ideal-gap.md`。

`opl-family-ideal-operating-model-redesign.md` 是 active_reference / north-star 标准：后续审计只按 `meets_target`、`needs_demotion`、`needs_retirement` 判断。2026-06-10 refresh 把 MAS/OPL 理想态重设为 `multi-plane operating system`：ordinary progress、durable runtime、Stage Artifact Unit、authority decision、telemetry、reconciler、App cockpit 和 improvement 平面分离；这只提供设计标准和外部成熟模式吸收分类，不维护第二 active backlog。`opl-foundry-agent-target-operating-architecture.md` 是该标准的目标架构支撑。路线图、production closure matrix、purpose-first audit 和 private-platform inventory 都必须折回唯一 active owner，不再像平行计划一样追加 long list 或 dated proof。

`opl-stage-native-kernel-rollout-plan.md` 是 Stage Native 设计支撑：它只保留 StageRun Kernel、stage manifest、role artifact、owner receipt / typed blocker、owner split、admission 分层和 anti-bloat 约束。当前落地状态、domain canary、App StageRun cockpit 和 compensation retirement tail 只回到 `current-state-vs-ideal-gap.md` 与 live machine surfaces。

OPL 品牌模块的 L4 rollout 计划已退出 active path：当前十模块 `L4_structural_baseline` 与 L5 evidence-required 状态由 `docs/references/brand-modules/current-maturity-against-workspace.md`、`contracts/opl-framework/brand-module-registry.json`、`contracts/opl-framework/brand-module-surfaces.json`、`contracts/opl-framework/brand-module-l5-operating-evidence.json` 和 fresh `opl brand-modules maturity|validate|l5-validate --json` 持有。已完成计划的来龙去脉进入 history/provenance，不在 active 目录保留第二计划。

## Active Planning Inventory

按单一真相原则，`docs/active` 里只有一份 `active_plan`：

| 文档 | 当前角色 | 是否仍有未落地规划 | 缺口归位 |
| --- | --- | --- | --- |
| `current-state-vs-ideal-gap.md` | 唯一 active owner / gap register | 是，但只维护当前 live gap，不维护 dated closeout。 | 本文的 `Active Planning Gap Register`、`测试 / 证据差距`、`下一轮 Agent prompt`。 |
| `ordinary-progress-spine-and-audit-sidecar-plan.md` | ordinary/audit 分层目标规划支撑 | 不作为独立 backlog。P0-P5 只作设计标准和验收词表。 | 已落地与未落地状态折回 `current-state-vs-ideal-gap.md` 的 operating-model / owner-evidence / production-tail gap。 |
| `foundry-agent-os-family-target-implementation-plan.md` | Foundry Agent OS family target 支撑 | 不作为独立 backlog。W0-W6 structural landing 已折回；W7 只剩 live owner evidence / production evidence。 | `current-state-vs-ideal-gap.md#active-planning-gap-register`。 |
| `opl-family-ideal-operating-model-redesign.md` | north-star / audit standard | 不作为 active backlog。 | 用 `meets_target` / `needs_demotion` / `needs_retirement` 审计；当前缺口只由唯一 active owner 维护。 |
| `opl-foundry-agent-target-operating-architecture.md` | 目标架构支撑 | 不作为执行队列。 | 机器落地状态回 `current-state-vs-ideal-gap.md`，长期架构边界仍可作为 review 标准。 |
| `opl-stage-native-kernel-rollout-plan.md` | Stage Native Kernel 设计支撑 | 不作为独立 rollout。 | StageRun / controlled canary / closeout-binding 状态回唯一 active owner；live domain progression 仍归 domain owner evidence。 |
| `production-framework-closure-gap-matrix.md` | production closure evidence 矩阵 | 不维护 dated proof ledger。 | 只解释 evidence lane；真实缺口回 active gap register。 |
| `current-development-lines.md` | owner map 支撑 | 不维护路线图。 | 各工作线回对应 owner；当前下一步仍看唯一 active owner。 |
| `opl-family-purpose-first-current-design-audit.md` | purpose-first audit 来源 | 不维护新计划。 | 审计分类折回 active gap register 或 history/provenance。 |
| `standard-agent-private-platform-inventory.md` | private-platform 分类台账 | 不维护拆文件流水。 | cleanup / physical delete 只作为 refs-only owner decision lane 回 active gap register。 |
| `opl-family-development-reference.md` | 系列开发参考 | 不维护 backlog。 | 新增/迁移按 owner 分层执行；当前 open gap 不在本文冻结。 |
| `development-document-portfolio.md` | 文档组合治理支撑 | 不维护执行顺序。 | 只管文档归位、降级、归档规则；当前 active 缺口回唯一 active owner。 |

因此，“active 规划未落地”只能按唯一 active owner 的 live gap 读取：domain owner answer / typed blocker、Brand L5 真实运营证据、provider long-soak、App release verdict、memory/artifact lifecycle receipt、private-platform physical-delete owner decision 等。support 文档里残留的 P0-P5、W0-W7、audit lanes、rollout phases、matrix rows 或 external-practice checklist 都不是第二 backlog。

当前真相仍然先看：

- [文档索引](../README.md)
- [项目概览](../project.md)
- [当前状态](../status.md)
- [架构](../architecture.md)
- [硬约束](../invariants.md)
- [关键决策](../decisions.md)
- [合同目录说明](../../contracts/README.md)

这里的文档支持当前模型，但不是机器可读 authority。代码、测试、runtime dashboard 与 contracts 应读取 `contracts/`、schema、source、生成产物、CLI/API 行为或语义化 `human_doc:*` id。

## 内容

- `current-state-vs-ideal-gap.md`：唯一 active owner；维护当前目标、完成进度、功能/结构差距、测试/证据差距、下一轮 baton 和验证入口；承接 Stage Native Kernel rollout 的当前落地状态和仍未闭合的 App/domain canary/cleanup tail。
- `ordinary-progress-spine-and-audit-sidecar-plan.md`：active_support 完整治理规划；定义 ordinary progress spine、audit sidecar、artifact tiering、readiness JIT、MDS / DeepScientist smoothness learning、OPL 基座优化和 P0-P5 验收门；不声明 implementation landed。
- `foundry-agent-os-family-target-implementation-plan.md`：active_support 目标实施规划；把 MAS Agent OS 方案提升为 family-level Foundry Agent OS pattern，固定 OPL / domain 分权、Capability Registry 边界、cross-agent target delta 和后续实施 lanes；不声明 domain ready、Brand L5 或 production ready。
- `opl-family-ideal-operating-model-redesign.md`：active_reference / north-star 标准；提供 `目的反推必要性，MVP 检查阻碍性` 的统一 operating model、`multi-plane operating system` 顶层重设、外部成熟工程经验吸收分类和三类审计结论。
- `opl-foundry-agent-target-operating-architecture.md`：active_support 目标架构；解释 Foundry Agent / OPL primitive、stage artifact、owner delta、passive evidence 和 App cockpit 的长期结构。
- `opl-stage-native-kernel-rollout-plan.md`：active_support；记录 OPL family Stage Native Kernel 的 owner split、对象模型、admission 分层、conformance shape 和 forbidden claims；不能维护当前执行路线、落地清单或 live readiness。
- `current-development-lines.md`：active_support 路线支撑；只把当前开发线路映射到唯一 active owner，不维护独立路线图或冻结 live counters。
- `production-framework-closure-gap-matrix.md`：active_support 差距矩阵；只解释 production closure 证据门如何被唯一 active owner 消费，不维护 dated proof ledger。
- `opl-family-purpose-first-current-design-audit.md`：active_support 审计来源；保留目的优先审计结论，不替代 active gap owner、domain active plan 或 live machine truth。
- `opl-family-development-reference.md`：OPL 系列项目开发主参考；固定全局计划放 OPL、单仓计划回各 repo、通用能力上收 OPL、过时兼容面直接退役、docs 目录按同名 canonical taxonomy 对齐。
- `standard-agent-private-platform-inventory.md`：private-platform inventory；按 owner subdomain、agent、surface group 和 migration gate 分类，不记录逐日拆文件流水或 line-count ledger。
- `development-document-portfolio.md`：开发文档组合整理入口；按内容判断旧文档应吸收、保留、降级、退役还是归档。

当前 runtime 命名与边界说明在 [runtime/](../runtime/README.md)。
Domain onboarding、shared runtime/domain contract 等当前规格支撑在 [specs/](../specs/README.md)。
公开 surface 与 App/workbench 读法在 [product/](../product/README.md)。

已吸收 / 归档材料：

- `shared-foundation*` 和 `shared-foundation-ownership*` 已迁入 `docs/history/process/shared-boundary/`；其中仍有效的 owner split 由 OPL 系列项目开发主参考、公开 operating model 以及当前 shared runtime/domain contracts 承接。
- 2026-05 dated proof、receipt 流水和一次性 production functional closure 过程已迁入 `docs/history/process/plans/`；当前 follow-through owner 是 `production-framework-closure-gap-matrix.md`。
- 2026-05-15 One Person Lab App 仓库拆分 closeout 已迁入 `docs/history/process/plans/2026-05-15-one-person-lab-app-repo-split-closeout.md`；当前 App/workbench 边界由 `docs/product/`、`docs/references/current-support/opl-gui-shell-adapter-boundary.md`、App 仓合同和真实 release artifact 承接。
- 2026-05-22 OPL active proof ledger / private-platform line-count ledger 已收敛到 [Active Ledger Consolidation](../history/process/plans/2026-05-22-opl-doc-lifecycle-active-ledger-consolidation.md)；当前 active 文档只保留 gap、owner、完成口径和验证入口。
- 2026-06-01 标准 Agent 同源审计已迁入 [Standard Agent Design Consistency Audit](../history/process/plans/2026-06-01-standard-agent-design-consistency-audit.md)；当前结构同源由 live `opl agents conformance` / descriptors / default-caller surfaces 和 `standard-agent-private-platform-inventory.md` 守门。
- 2026-06-03 OPL family purpose-first 设计审计已迁入 [OPL Family Purpose-First Design Audit](../history/process/plans/2026-06-03-opl-family-purpose-first-design-audit.md)；当前 owner、gap 和下一步回到 `current-state-vs-ideal-gap.md`、`production-framework-closure-gap-matrix.md` 和核心五件套。
- 2026-06-03 OPL active gap plan 已完成 lifecycle cleanup：[Active Gap Plan Lifecycle Cleanup](../history/process/plans/2026-06-03-opl-active-gap-plan-lifecycle-cleanup.md) 记录了从 `current-state-vs-ideal-gap.md` 折出的 dated evidence / receipt ledger / worktree closeout 语义；当前 gap plan 只保留目标态、差距、baton 和验证入口。
- 2026-06-04 OPL Foundry Agent MVP friction 诊断已迁入 [OPL Foundry Agent MVP Friction Audit](../history/process/plans/2026-06-04-opl-foundry-agent-mvp-friction-audit.md)；当前目标操作架构、迁移阶段和验收门由 `opl-foundry-agent-target-operating-architecture.md` 承接，当前差距和下一棒由 `current-state-vs-ideal-gap.md` 承接。
