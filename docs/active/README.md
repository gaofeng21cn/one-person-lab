# 活跃支撑文档

Status: `active_support`
Owner: `One Person Lab`
Purpose: `active_docs_index`
State: `active_support`
Machine boundary: 本文是人读索引。机器真相继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 App/workspace evidence。

本目录只收纳当前仍决定执行顺序、差距闭环、开发组合治理和当前完成门槛的人读支撑文档。dated closeout、receipt/proof 流水、line-count closeout、worktree/branch 过程、workorder 瞬时计数和历史演变进入 `docs/history/**`。

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

- `opl-family-development-reference.md`：OPL 系列项目开发主参考；固定全局计划放 OPL、单仓计划回各 repo、通用能力上收 OPL、过时兼容面直接退役、docs 目录按同名 canonical taxonomy 对齐。
- `current-development-lines.md`：当前 framework-first 内容级开发线路图。
- `production-framework-closure-gap-matrix.md`：当前 OPL 距离完整生产级智能体框架的 production closure 差距矩阵、证据门与功能/结构 follow-through owner；不承载 dated proof ledger。
- `current-state-vs-ideal-gap.md`：OPL family 当前目标、完成进度、功能/结构差距、测试/证据差距和下一轮 baton 的唯一 active owner；只保留当前结论和完成口径，历史 proof、dated closeout、receipt 流水和长清单回到 `docs/history/**` 或动态 CLI/read-model。
- `opl-family-purpose-first-current-design-audit.md`：按当前 repo head 和 `TASTE.md` 做的 OPL family purpose-first 顶层设计审计；它是 active support，不替代 `current-state-vs-ideal-gap.md`、各 domain active plan 或 live machine truth。
- `opl-foundry-agent-mvp-friction-audit.md`：按 MVP / Progress-First 原则审计 MAS/MAG/RCA/OMA 的默认推进阻力，并结合外部成熟工程经验重设理想默认循环、三层 delivery/control/audit 架构、`current_owner_delta` 基座 primitive、stop-loss 和 OPL/App 默认读面优化；区分必须保留的 stage/runtime/authority gate 与应下沉为 audit / diagnostic / cleanup / production lane 的 receipt、replay、worklist 和 private-residue 面。
- `standard-agent-private-platform-inventory.md`：跨 MAS/MAG/RCA/opl-meta-agent 的私有平台化 inventory，按 owner subdomain、agent、surface group 和 migration gate 分类；不记录逐日拆文件流水或 line-count ledger。
- `development-document-portfolio.md`：当前开发文档组合整理入口；按内容判断旧文档应吸收、保留、降级、退役还是归档。

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
