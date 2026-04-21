[English](./README.md) | **中文**

# OPL 参考级文档索引

这个索引只管理 `docs/references/` 下的第三层参考文档。
这些文档用于审计、验收、对齐、样例、迁移与历史追踪，不是 `OPL` 当前公开主线的默认阅读面。

如果你要理解“`OPL` 现在是什么”，先回到：

- [docs/README.zh-CN.md](../README.zh-CN.md)
- [project.md](../project.md)
- [status.md](../status.md)
- [architecture.md](../architecture.md)
- [invariants.md](../invariants.md)
- [decisions.md](../decisions.md)
- [2026-04-20 产品接口边界设计](../specs/2026-04-20-opl-product-api-and-domain-agent-boundary-design.md)

## 一、统一收敛与状态对齐

- [GUI 主线切换到 AionUI](./2026-04-21-gui-mainline-pivot-to-aionui.md)
- `series-doc-governance-checklist.md`
- `four-repo-doc-series-sync-summary-2026-04-14.md`
- `four-repo-doc-intake-template.md`
- `contract-convergence-v1-execution-board.md`
- `ecosystem-status-matrix.md`
- `family-user-facing-maturity-roadmap.md`
- `four-repo-executor-follow-up-and-hermes-evaluation.md`
- [中央 federation 参考面对齐看板](./opl-phase-2-central-reference-sync-board.md)
- [已收录 domain 增量 intake 刷新记录](./opl-phase-2-admitted-domain-delta-intake-refresh.md)
- [生态同步 owner line 记录](./opl-phase2-ecosystem-sync-owner-line.md)

## 二、运行时 / 底座 / 迁移参考

- `family-shared-release-maintenance.md`
- `host-agent-runtime-contract.md`
- `managed-runtime-migration-readiness-checklist.md`
- `hermes-agent-runtime-substrate-benchmark.md`
- `family-executor-adapter-defaults.md`
- `hermes-agent-executor-evaluation.md`
- `family-orchestration-contract-absorb-crewai.md`
- `family-product-entry-and-domain-handoff-architecture.md`
- `family-lightweight-direct-entry-rollout-board.md`
- `mas-top-level-cutover-board.md`
- `opl-product-entry-and-hermes-kernel-integration.md`
- `opl-vertical-online-agent-platform-roadmap.md`
- `contract-convergence-v1-decision-note.md`

## 三、网关 / 收录 / 接口审计参考

- `opl-gateway-rollout.md`
- `opl-gateway-rollout.zh-CN.md`
- `opl-gateway-acceptance-test-spec.md`
- `opl-gateway-acceptance-test-spec.zh-CN.md`
- `opl-candidate-domain-backlog.md`
- `opl-candidate-domain-backlog.zh-CN.md`
- `opl-candidate-workstream-tranche-closeout.md`
- `opl-candidate-workstream-tranche-closeout.zh-CN.md`
- `opl-surface-lifecycle-map.md`
- `opl-surface-lifecycle-map.zh-CN.md`
- `opl-surface-authority-matrix.md`
- `opl-surface-authority-matrix.zh-CN.md`
- `opl-surface-review-matrix.md`
- `opl-surface-review-matrix.zh-CN.md`
- `opl-governance-audit-operating-surface.md`
- `opl-governance-audit-operating-surface.zh-CN.md`
- `opl-publish-promotion-operating-surface.md`
- `opl-publish-promotion-operating-surface.zh-CN.md`
- `opl-minimal-admitted-domain-federation-activation-package.md`
- `opl-minimal-admitted-domain-federation-activation-package.zh-CN.md`

## 四、样例、语料与操作记录

- `opl-gateway-example-corpus.md`
- `opl-gateway-example-corpus.zh-CN.md`
- `opl-routed-safety-example-corpus.md`
- `opl-routed-safety-example-corpus.zh-CN.md`
- `opl-operating-example-corpus.md`
- `opl-operating-example-corpus.zh-CN.md`
- `opl-operating-record-catalog.md`
- `opl-operating-record-catalog.zh-CN.md`

## 五、已退役 frontdesk 时代与历史迁移参考

- `development-operating-model.md`
- `runtime-alignment-taskboard.md`
- `opl-frontdesk-delivery-board.md`
- `opl-hosted-web-frontdesk-benchmark.md`
- [Frontdesk 历史资料索引](../history/frontdesk-legacy/README.md)
- [OMX 历史资料索引](../history/omx/README.zh-CN.md)

## 使用规则

- 这些文档可以解释“为什么会这样冻结”，但不能反过来改写 `README*`、`docs/README*` 与核心五件套。
- `series-doc-governance-checklist.md` 是当前仓与四仓系列项目保持一致时使用的仓级治理清单；带日期的同步摘要负责记录某一次具体跨仓梳理与对齐结果。
- `four-repo-doc-intake-template.md` 是可复用的中央协调表单，用来记录跨仓文档轮次的范围、受影响仓、验证结果与清理状态。
- 新参考文档优先按上面的五类归档。
- 已退役的 `frontdesk` 时代材料只用于历史审计，不能再作为当前实现依据。
