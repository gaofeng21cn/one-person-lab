[English](./README.md) | **中文**

# OPL 参考级文档索引

这个索引管理 `docs/references/` 下的支撑参考文档。
这些文档用于审计、验收、对齐、样例、迁移与历史追踪，不是 `OPL` 当前公开主线的默认阅读面。

如果你要理解“`OPL` 现在是什么”，先回到：

- [docs/README.zh-CN.md](../README.zh-CN.md)
- [project.md](../project.md)
- [status.md](../status.md)
- [architecture.md](../architecture.md)
- [invariants.md](../invariants.md)
- [decisions.md](../decisions.md)
- [docs_portfolio_consolidation.md](../docs_portfolio_consolidation.md)
- 通过[规格索引](../specs/README.zh-CN.md)查看当前仍生效或因路径稳定暂时保留的 runtime / product-boundary 规格

## 目录分区

| 目录 | 角色 |
| --- | --- |
| `current-support/` | 当前操作支撑参考。 |
| `runtime-substrate/` | Runtime substrate、product-entry、Hermes 与 Runtime Manager 参考。 |
| `convergence-governance/` | Family 收敛、文档生命周期、intake 模板与状态对齐。 |
| `domain-admission/` | 候选 / 已收录 domain backlog 与 tranche records。 |
| `examples-corpora/` | 样例语料与操作记录。 |
| `operating-governance/` | 质量、operator projection、surface governance、review 与 publish 参考。 |

除 README 或经 [文档组合治理](../docs_portfolio_consolidation.md) 明确承认的新顶层生命周期索引外，不再在 `docs/references/` 根目录新增 loose Markdown。

## 一、统一收敛与状态对齐

- [GUI 主线切换到 AionUI](./convergence-governance/2026-04-21-gui-mainline-pivot-to-aionui.md)
- [Contract convergence v1 决策记录](./convergence-governance/contract-convergence-v1-decision-note.md)
- [文档分层与生命周期管理 Playbook](./convergence-governance/docs-lifecycle-management-playbook.zh-CN.md)
- [Family Docs 生命周期治理落地记录，2026-05-09](./convergence-governance/family-docs-lifecycle-governance-rollout-2026-05-09.zh-CN.md)
- [OPL Family 内容级文档收敛，2026-05-11](./convergence-governance/family-content-level-docs-consolidation-2026-05-11.zh-CN.md)
- [系列项目文档治理清单](./convergence-governance/series-doc-governance-checklist.md)
- [四仓文档 intake 模板](./convergence-governance/four-repo-doc-intake-template.md)
- [Contract convergence v1 执行看板](./convergence-governance/contract-convergence-v1-execution-board.md)
- [生态状态矩阵](./convergence-governance/ecosystem-status-matrix.md)
- [四仓 executor follow-up 与 Hermes 评估](./convergence-governance/four-repo-executor-follow-up-and-hermes-evaluation.md)
- [Family shared release 维护参考](./convergence-governance/family-shared-release-maintenance.md)
- [Family 用户侧成熟度路线图](./convergence-governance/family-user-facing-maturity-roadmap.md)
- [四仓文档同步摘要，2026-04-14](./convergence-governance/four-repo-doc-series-sync-summary-2026-04-14.md)
- [OPL 定位演化与收敛经验参考](./convergence-governance/opl-positioning-convergence-lessons.zh-CN.md)
- [Family external orchestration learning board，2026-04-30](./convergence-governance/family-external-orchestration-learning-board-2026-04-30.md)
- [OPL Family stage control plane adoption plan](./convergence-governance/family-stage-control-plane-adoption-plan.zh-CN.md)

## 二、当前支撑参考

- [当前支撑参考索引](./current-support/README.zh-CN.md)
- [OPL GUI Shell Adapter 边界说明](./current-support/opl-gui-shell-adapter-boundary.zh-CN.md)
- [OPL Fresh Install 与 GUI 首启测试参考](./current-support/opl-fresh-install-and-gui-first-launch-testing.zh-CN.md)
- [Docker WebUI 部署参考](./current-support/opl-docker-webui-deployment.zh-CN.md)
- [OPL 默认 Skill 生态参考](./current-support/opl-default-skill-ecosystem.zh-CN.md)
- [OPL Release 与 Packages 模块化分发参考](./current-support/opl-release-packages-modular-distribution.zh-CN.md)
- [OPL quality details 参考](./current-support/opl-quality-details.md)
- [OPL 测试 Lane 治理参考](./current-support/opl-test-lane-governance.zh-CN.md)

## 三、运行时 / 底座 / 迁移参考

当前 owner surfaces：

- [OPL 开发文档组合整理](../active/development-document-portfolio.zh-CN.md)：旧 runtime / product-entry / migration 文档按内容吸收、保留、降级、退役或归档的当前入口。
- [OPL stage-led agent framework roadmap](./runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md)：完整 Codex-first、stage-led 智能体运行框架、domain-agent 边界、语言/runtime 取舍和旧面退役的总入口。
- [Temporal family runtime provider 落地计划](./runtime-substrate/temporal-family-runtime-provider-plan.zh-CN.md)：provider-backed 生产 substrate 候选的当前支撑计划。
- [OPL Runtime Manager 目标形态](./runtime-substrate/opl-runtime-manager-target.md)：Runtime Manager、provider readiness、native helper 和 state index 边界的当前支撑目标。
- [Family executor adapter defaults](./runtime-substrate/family-executor-adapter-defaults.md)、[Family runtime attempt contract](./runtime-substrate/family-runtime-attempt-contract.md) 和 [CrewAI 吸收说明](./runtime-substrate/family-orchestration-contract-absorb-crewai.md)：只有当正文仍与 roadmap 和核心五件套一致时，才作为 active support 参考。

保留给迁移回顾和 tombstone 语境的 superseded / legacy references。复用任何内容前，先按 [OPL 开发文档组合整理](../active/development-document-portfolio.zh-CN.md) 判断内容块当前归属：

- [Runtime Substrate 历史归档](../history/runtime-substrate/README.zh-CN.md)：已吸收的早期 direct-entry、Hermes-first、host-agent-only、managed-runtime checklist、vertical online-agent platform 与 MAS cutover 整文档。
- [Hermes-Agent truth reset 与目标状态](./runtime-substrate/hermes-agent-truth-reset-and-target-state.md)、[Hermes-Agent runtime substrate benchmark](./runtime-substrate/hermes-agent-runtime-substrate-benchmark.md) 和 [Hermes-Agent executor evaluation](./runtime-substrate/hermes-agent-executor-evaluation.md)：只作为 Hermes 评估背景；Hermes 当前是 `hermes_legacy` / optional provider 或显式 executor/proof lane。
- [OPL managed runtime 三层合同](./runtime-substrate/opl-managed-runtime-three-layer-contract.zh-CN.md)：较早的 managed runtime 三层参考；有效内容以 runtime 命名与边界合同为准。

## 四、Domain admission 参考

- [OPL candidate domain backlog](./domain-admission/opl-candidate-domain-backlog.md)
- [OPL candidate domain backlog 中文](./domain-admission/opl-candidate-domain-backlog.zh-CN.md)
- [Candidate workstream tranche closeout](./domain-admission/opl-candidate-workstream-tranche-closeout.md)
- [Candidate workstream tranche closeout 中文](./domain-admission/opl-candidate-workstream-tranche-closeout.zh-CN.md)
- [Phase 1 exit activation package](./domain-admission/opl-phase-1-exit-activation-package.md)
- [Phase 1 exit activation package 中文](./domain-admission/opl-phase-1-exit-activation-package.zh-CN.md)
- [中央 federation 参考面对齐看板](./domain-admission/opl-phase-2-central-reference-sync-board.md)
- [已收录 domain 增量 intake 刷新记录](./domain-admission/opl-phase-2-admitted-domain-delta-intake-refresh.md)
- [生态同步 owner line 记录](./domain-admission/opl-phase2-ecosystem-sync-owner-line.md)

## 五、样例、语料与操作记录

- [OPL gateway example corpus](./examples-corpora/opl-gateway-example-corpus.md)
- [OPL gateway example corpus 中文](./examples-corpora/opl-gateway-example-corpus.zh-CN.md)
- [OPL routed-safety example corpus](./examples-corpora/opl-routed-safety-example-corpus.md)
- [OPL routed-safety example corpus 中文](./examples-corpora/opl-routed-safety-example-corpus.zh-CN.md)
- [OPL operating example corpus](./examples-corpora/opl-operating-example-corpus.md)
- [OPL operating example corpus 中文](./examples-corpora/opl-operating-example-corpus.zh-CN.md)
- [OPL operating record catalog](./examples-corpora/opl-operating-record-catalog.md)
- [OPL operating record catalog 中文](./examples-corpora/opl-operating-record-catalog.zh-CN.md)

## 六、Operating governance 参考

- [Operating governance 参考索引](./operating-governance/README.zh-CN.md)
- [Family domain memory governance](./operating-governance/family-domain-memory-governance.zh-CN.md)
- [Family domain quality projection contract](./operating-governance/family-domain-quality-projection-contract.md)
- [Family incident learning loop](./operating-governance/family-incident-learning-loop.md)
- [Family product operator projection](./operating-governance/family-product-operator-projection.md)
- [OPL family 目录治理](./operating-governance/opl-family-directory-governance.zh-CN.md)
- [OPL governance audit operating surface](./operating-governance/opl-governance-audit-operating-surface.md)
- [OPL publish promotion operating surface](./operating-governance/opl-publish-promotion-operating-surface.md)
- [OPL surface authority matrix](./operating-governance/opl-surface-authority-matrix.md)
- [OPL surface lifecycle map](./operating-governance/opl-surface-lifecycle-map.md)
- [OPL surface review matrix](./operating-governance/opl-surface-review-matrix.md)

## 七、退役兼容与 frontdoor 参考

- [Gateway / federation 兼容语料归档](../history/compatibility/gateway-federation/README.zh-CN.md)
- [Runtime Substrate 历史归档](../history/runtime-substrate/README.zh-CN.md)
- [Frontdoor 历史资料索引](../history/frontdoor-legacy/README.md)
- [OMX 历史资料索引](../history/omx/README.zh-CN.md)
- [过程历史归档](../history/process/README.zh-CN.md)

已退役叙述文件进入 `docs/history/`。机器可读合同、测试、脚本和 runtime dashboard 应引用 contract/schema/source surface 或语义化 `human_doc:*` 标识，不应把这些叙述文档路径钉成稳定机读接口。

## 使用规则

- 2026-05-11 架构收敛后，OPL framework 工作、执行语言决策、Temporal provider 落地、domain-agent 边界调整与旧面退役清理，统一先读 [OPL 开发文档组合整理](../active/development-document-portfolio.zh-CN.md) 与 [OPL stage-led agent framework roadmap](./runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md)。
- 讨论 MAS/MAG/RCA 的论文套路、基金策略、视觉模式、图表模板、prompt 经验或 reviewer 经验应放进自然语言 memory、强 contract 还是暂缓时，统一先读 [Family domain memory governance](./operating-governance/family-domain-memory-governance.zh-CN.md)。
- 这些文档可以解释“为什么会这样冻结”，但不能反过来改写 `README*`、`docs/README*` 与核心五件套。
- `family-content-level-docs-consolidation-2026-05-11.zh-CN.md` 是当前 OPL/MAS/MAG/RCA/MDS 内容级文档整理的跨仓 owner map。
- `series-doc-governance-checklist.md` 是当前仓与 family 系列项目保持一致时使用的仓级治理清单；带日期的同步摘要负责记录某一次具体跨仓梳理与对齐结果。
- `four-repo-doc-intake-template.md` 是可复用的中央协调表单，用来记录跨仓文档轮次的范围、受影响仓、验证结果与清理状态。
- 新参考文档优先按上面的目录分区归档。
- `docs/**` 与 `README*` 默认是人读材料。不要让脚本、合同、测试或 runtime dashboard 依赖它们的具体路径；需要跨层引用时使用稳定合同文件或语义 surface id。
- 已完成的一次性计划、生成型过程 specs 和被取代的设计草稿应迁入 [过程历史归档](../history/process/README.zh-CN.md)，不要继续留在 active reference 或 specs 层。
- 已退役的 gateway / federation 语料只用于历史审计、兼容性检查和 schema 追溯，不能再作为当前实现依据。
- 已退役的 `frontdoor` 时代材料只用于历史审计，不能再作为当前实现依据。
- 已退役的 OMX 时代提示词、长跑与 worktree 材料已经从活跃参考面删除；历史索引只作为墓碑页，不作为执行手册。
