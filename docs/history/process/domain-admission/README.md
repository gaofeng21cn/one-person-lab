# Domain Admission 过程归档

Owner: `One Person Lab`
Purpose: `historical_domain_admission_process_archive`
State: `history_only`
Machine boundary: 本目录只保存已完成或已被当前 OPL Framework 目标态取代的 domain admission 过程记录。当前机器真相继续归 `contracts/opl-framework/`、核心五件套、`docs/active/opl-family-development-reference.md` 和 domain-owned manifests / receipts。

本目录中的 Phase 1、Phase 2、central reference sync、candidate workstream closeout 与 ecosystem owner-line 文档，只解释当时如何冻结候选 domain、admitted-domain delta 和 reference-sync 过程。它们不再作为当前 active plan、runtime activation package、gateway/federation 兼容面或 recurring material 默认落点。

当前 owner 跳转：

| 当前问题 | 当前 owner |
| --- | --- |
| OPL 当前产品角色、runtime 边界、不能声明项 | [OPL 当前状态](../../../status.md) |
| OPL family 当前完成进度、功能/结构差距、证据差距和下一轮 baton | [OPL Family 当前状态与理想目标差距](../../../active/current-state-vs-ideal-gap.md) |
| 标准 Foundry Agent / OPL Agent 目标形态 | [OPL 与 Foundry Agents 理想目标态](../../../references/runtime-substrate/opl-family-agent-ideal-state.md) |
| 新 domain-agent 准入规则 | [OPL Domain-Agent Admission Contract](../../../specs/opl-domain-onboarding-contract.md) |
| 候选 domain / workstream backlog | [OPL Candidate Domain Backlog](../../../references/domain-admission/opl-candidate-domain-backlog.md) |
| 文档组合生命周期和下一批治理范围 | [OPL 开发文档组合整理](../../../active/development-document-portfolio.md) |

当前入口补充：

- [OPL 系列项目开发主参考](../../../active/opl-family-development-reference.md)
- [OPL 与 Foundry Agents 理想目标态](../../../references/runtime-substrate/opl-family-agent-ideal-state.md)
- [OPL 当前状态](../../../status.md)
- [OPL 文档组合治理](../../../docs_portfolio_consolidation.md)
- [OPL Candidate Domain Backlog](../../../references/domain-admission/opl-candidate-domain-backlog.md)

归档文件：

| 文件 | 历史角色 | 当前 owner |
| --- | --- | --- |
| [OPL Candidate Workstream Tranche Closeout](./opl-candidate-workstream-tranche-closeout.md) | 冻结 Grant Ops、Review Ops、Thesis Ops 当时没有达到正式收录、discovery 或 routed-action readiness 的 negative boundary。 | candidate backlog 与 active domain onboarding contract。 |
| [OPL Phase 1 Exit Activation Package](./opl-phase-1-exit-activation-package.md) | 记录早期离场门槛、deferred 项和 external readiness blocker。 | 核心五件套、current gap plan 与 active runtime/domain specs。 |
| [OPL Phase 2 Admitted-Domain Delta Intake Refresh](./opl-phase-2-admitted-domain-delta-intake-refresh.md) | 记录当时 admitted-domain delta intake 到中央 reference surface 的一次 package。 | 核心五件套、current gap plan、domain-owned manifests/receipts。 |
| [OPL Phase 2 Central Reference Sync Board](./opl-phase-2-central-reference-sync-board.md) | 记录早期中央 reference sync tranche board 与 honest stop 条件。 | current gap plan、docs portfolio ledger 与 convergence history。 |
| [OPL Phase 2 Ecosystem Sync Owner Line](./opl-phase2-ecosystem-sync-owner-line.md) | 记录当时 ecosystem sync owner line、scope、hard boundaries 和 recommended verification。 | current OPL stage-led framework truth、domain onboarding spec 与 convergence history。 |

读取规则：

- 旧 `gateway`、`federation`、`G2/G3`、`Phase 1/2` 和 OMX long-run wording 只作为过程来源阅读。
- 旧 `docs/references/opl-phase-*` 与 `contracts/opl-framework/phase-*` 路径若在历史文件中出现，只是当时路径引用；不得据此恢复 reference 层 active owner 或 machine-readable contract surface。
- 已被当前 OPL stage-led framework、Temporal provider、standard domain-agent skeleton 或 domain-owned descriptor/receipt surface 替代的接口和测试，不保留兼容面。
- 如果本目录历史记录仍包含有用的边界判断，先吸收到当前 owner 文档，再保留原文作为 provenance。
