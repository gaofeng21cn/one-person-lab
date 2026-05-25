# Superpowers Plans 归档

Owner: `One Person Lab`
Purpose: `history_process_superpowers_plans_index`
State: `history_only`
Machine boundary: 本目录是人读历史计划归档。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、App/operator read model 和真实验证 evidence。

本目录中的 implementation plans 是早期 Superpowers worker 任务包。正文保留当时的步骤、文件列表、checkbox、命令和预期结果，只用于追溯某条实现 lane 的来源；不得按整份继续执行，也不得用其中的通过/完成措辞声明当前 readiness、domain ready、App release ready 或 production ready。

| 文件 | 历史主题 | 当前 owner |
| --- | --- | --- |
| `2026-04-13-medautoscience-action-graph-plan.md` | MAS action graph fixture / CLI consumer coverage plan | 当前 action/stage/domain projection 边界回到核心五件套、domain-owned MAS surfaces 和 OPL machine read models。 |
| `2026-04-14-opl-frontdoor-readiness-plan.md` | 旧 frontdoor-readiness surface plan | 当前 App/operator drilldown 与 product/workbench 边界回到 `docs/product/`、runtime read model 和 App repo；旧 frontdoor 只作历史。 |
| `2026-04-17-multica-family-reuse-program-implementation.md` | Multica-inspired shared family helper implementation plan | 当前 shared boundary 回到 `docs/specs/shared-runtime-contract.md`、`docs/specs/shared-domain-contract.md` 和 active gap。 |
| `2026-04-18-family-runtime-task-skill-automation-full-absorb-implementation.md` | shared runtime/task/skill/automation absorb plan | 当前 generated/hosted surface、domain pack 和 retirement tail 回到 active gap、runtime boundary 和 machine contracts。 |
| `2026-04-22-domain-agent-entry-spec-v1-implementation.md` | domain-agent entry spec v1 implementation plan | 当前 domain-agent admission / descriptor owner 是 `docs/specs/opl-domain-onboarding-contract.md` 与 `opl agents descriptors`. |

任何有用结论若仍有效，应已经提升到当前 owner；未提升内容只代表当时 worker plan provenance。
