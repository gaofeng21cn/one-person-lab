# 过程历史归档

Owner: `One Person Lab`
Purpose: `history_process_archive_index`
State: `history_only`
Machine boundary: 本目录是人读过程历史索引。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、App/operator read model 和真实验证 evidence。

本目录收纳已经完成或被取代的实施计划、设计草稿和 Superpowers 生成的过程材料。

这些文件只用于审计、迁移回顾和来源追溯，不是 `OPL` 当前实现合同。旧双语计划、旧路径和旧命令保留为历史证据；`docs/**` 当前只维护中文 canonical 内容。

当前真相统一回到：

- [文档索引](../../README.md)
- [项目概览](../../project.md)
- [当前状态](../../status.md)
- [架构](../../architecture.md)
- [硬约束](../../invariants.md)
- [关键决策](../../decisions.md)
- [活跃规格](../../specs/)；当前无活跃 specs 时回到核心五件套和 `docs/active/`

## 归档分区

- [Plans](./plans/)：已经完成或被取代的 implementation plans、planning freeze、closeout brief 和过程归档；其中 `Goal`、`current`、`next` 和 checkbox task 均按历史文件日期阅读。
- [Specs](./specs/)：已被当前产品边界取代的历史设计规格，包括 Product API / ACP native 形成过程。
- [Convergence Governance](./convergence-governance/)：已退出 active/reference 层的四仓同步、executor 评估、用户面成熟度和外部 orchestration learning 快照。
- [Domain Admission](./domain-admission/)：已完成的 candidate workstream closeout、Phase 1/2 activation package、central reference sync board 和 ecosystem owner-line 过程记录。
- [Shared Boundary](./shared-boundary/)：已吸收的 shared-foundation framing 页面；其中 owner split 已迁入当前 active owner surface。
- [Superpowers](./superpowers/)：早期 worker flow 生成的 plan/spec 过程材料。

## 边界

当前仍留在 `docs/specs/` 的只有活跃 runtime / product-boundary 规格；如果 specs 索引为空，说明当前规格真相已经收敛到核心五件套、`docs/active/`、runtime-substrate roadmap 和机器可读合同。
新增一次性规划材料在完成、被取代或退出活跃工作面后，应迁入本目录。

近期归档：

- [2026-06-08 OPL frontdoor machine field retirement closeout](./plans/2026-06-08-opl-frontdoor-machine-field-retirement-closeout.md)：记录 active `frontdoor` 机器字段迁移为 `command_surface` contract/source/test payload，并用 focused tests 阻止旧 key 作为兼容面复活；当前机器真相仍回 contracts、source、tests 和 CLI/read-model。
- [2026-06-08 OPL public whitepaper and command surface docs closeout](./plans/2026-06-08-opl-public-whitepaper-command-surface-closeout.md)：记录公开白皮书 lifecycle header 补齐，以及 active/current 文档中当前命令面从旧 Gateway/frontdoor route 词汇中分离；当前命令面机器真相仍回 contracts、source、tests 和 CLI/read-model。
- [2026-06-07 OPL family retirement cleanup closeout](./plans/2026-06-07-opl-family-retirement-cleanup-closeout.md)：记录 App release-boundary docs-prose oracle 和 Homebrew tap PR compatibility 两条已落地退役线；当前 App release truth 回到 App repo contracts、workflows、validators、release-boundary tests 和真实 release evidence。
- [2026-06-07 OPL broader docs portfolio SSOT closeout](./plans/2026-06-07-opl-broader-docs-portfolio-ssot-closeout.md)：记录 root `README*`、`docs/*.md` 与 `docs/**/*.md` 的 broader portfolio currentness / stale-surface routing 覆盖；当前 docs lifecycle 回到 `docs/docs_portfolio_consolidation.md`，唯一 active truth 回到 `docs/active/current-state-vs-ideal-gap.md`。
- [2026-06-06 OPL series docs governance SSOT tranche ledger](./plans/2026-06-06-opl-series-doc-governance-ssot-tranche-ledger.md)：压缩记录 2026-06-06 跨六仓 OPL Doc governance tranche 的 covered themes、remaining scope、SSOT owner 和 no-resurrection boundary；逐条执行细节回各 repo-local closeout 与 git history。
- [2026-06-08 OPL series ledger compression closeout](./plans/2026-06-08-opl-series-ledger-compression-closeout.md)：记录上述 long ledger 从逐条命令/commit/worktree 长清单压缩为 compact provenance 的本轮收口。
- [2026-06-08 OPL MVP friction history compression closeout](./plans/2026-06-08-opl-mvp-friction-history-compression-closeout.md)：记录 2026-06-04 OPL Foundry Agent MVP friction audit 从 fresh readout / P0-P1 展开 / 实施 lane 长清单压缩为 compact provenance；当前目标架构回 active target architecture，当前 gap 回 active gap plan。
- [2026-06-08 OPL purpose-first history compression closeout](./plans/2026-06-08-opl-purpose-first-history-compression-closeout.md)：记录 2026-06-03 OPL family purpose-first 设计审计从跨仓 snapshot / dirty-state caveat / dynamic counters / 逐仓长表压缩为 compact provenance；当前 purpose-first 标准回 active support，当前 gap 回 active gap plan。
- [2026-06-06 OPL owner map retired vocabulary SSOT closeout](./plans/2026-06-06-opl-owner-map-retired-vocabulary-ssot-closeout.md)：记录 active owner map 中退役路线词汇从 literal list 收敛为 semantic class + history/provenance pointer 的过程；当前 owner map 回到 `docs/active/current-development-lines.md`，active plan 回到 `docs/active/current-state-vs-ideal-gap.md`。
- [2026-05-15 One Person Lab App 仓库拆分 Closeout](./plans/2026-05-15-one-person-lab-app-repo-split-closeout.md)：记录 Framework repo、clean App repo 与 upstream-backed GUI shell repo 的拆分 closeout；当前 App/workbench 边界回到 `docs/product/`、App 仓合同和真实 release artifact。
- [2026-05-22 OPL Active Ledger Consolidation](./plans/2026-05-22-opl-doc-lifecycle-active-ledger-consolidation.md)：记录 active proof ledger 与 private-platform line-count ledger 收敛；当前 gap matrix 和 inventory 只保留 owner、gap、分类和完成口径。
- [2026-06-01 Standard Agent Design Consistency Audit](./plans/2026-06-01-standard-agent-design-consistency-audit.md)：记录 MAS/MAG/RCA/OMA 同源设计和历史残留审计快照；当前结构同源与 production tail 由 live OPL read models 和 active owner docs 接管。
- [2026-06-03 OPL Family Purpose-First Design Audit](./plans/2026-06-03-opl-family-purpose-first-design-audit.md)：压缩记录 OPL family 目的优先顶层设计审计；当前 gap、owner 和下一步回到 `docs/active/` owner docs。
- [2026-06-03 OPL Active Gap Plan Lifecycle Cleanup](./plans/2026-06-03-opl-active-gap-plan-lifecycle-cleanup.md)：记录 `current-state-vs-ideal-gap.md` 从 dated proof / receipt ledger / worktree closeout 回收为 compact active gap plan 的过程；当前动态事实回到 live CLI/read-model、runtime ledger、App evidence 和 domain owner refs。
- [2026-06-04 OPL Foundry Agent MVP Friction Audit](./plans/2026-06-04-opl-foundry-agent-mvp-friction-audit.md)：压缩记录 MAS/MAG/RCA/OMA ordinary path 的 MVP friction 诊断和证据快照；当前目标操作架构、迁移阶段和验收门回到 active target architecture。
