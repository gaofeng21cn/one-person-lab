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

## 一、统一收敛与状态对齐

- `contract-convergence-v1-execution-board.md`
- `ecosystem-status-matrix.md`
- `opl-phase-2-central-reference-sync-board.md`
- `opl-phase-2-admitted-domain-delta-intake-refresh.md`
- `opl-phase2-ecosystem-sync-owner-line.md`

## 二、runtime / substrate / 平台迁移参考

- `host-agent-runtime-contract.md`
- `managed-runtime-migration-readiness-checklist.md`
- `hermes-agent-runtime-substrate-benchmark.md`
- `family-product-entry-and-domain-handoff-architecture.md`
- `family-lightweight-direct-entry-rollout-board.md`
- `mas-top-level-cutover-board.md`
- `opl-frontdesk-delivery-board.md`
- `opl-hosted-web-frontdesk-benchmark.md`
- `opl-product-entry-and-hermes-kernel-integration.md`
- `opl-vertical-online-agent-platform-roadmap.md`
- `contract-convergence-v1-decision-note.md`

## 三、gateway / admission / surface 审计参考

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

## 五、历史迁移与旧执行口径

- `development-operating-model.md`
- `runtime-alignment-taskboard.md`
- [OMX 历史资料索引](../history/omx/README.zh-CN.md)

## 使用规则

- 这些文档可以解释“为什么会这样冻结”，但不能反过来改写 `README*`、`docs/README*` 与核心五件套。
- 新参考文档优先按上面的五类归档；如果只是历史 closeout 或迁移痕迹，也应继续留在第三层，不要回灌到公开主线。
- 退役执行面的 runbook、长线提示词模板和 worktree 规程，不再作为 `docs/references/` 的默认阅读入口；统一从 `docs/history/omx/` 进入。
