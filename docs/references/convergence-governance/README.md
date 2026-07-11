# Convergence Governance 参考

Owner: `One Person Lab`
Purpose: `references_convergence_governance_index`
State: `support_reference`
Machine boundary: 本文是人读 reference 索引。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

本目录只保留当前仍可复用的收敛治理规则、文档生命周期方法、跨仓 intake 模板和 stage control plane 支撑。一次性 rollout、dated execution board、closeout evidence、历史产品分层落地记录和已经被当前 taxonomy 吸收的同步快照，不再留在 reference 默认阅读面。

Currentness policy：本目录仍是 support reference，不是 active truth owner，也不冻结任何一次 CLI/read-model 计数。使用本目录材料判断 conformance、stage discovery/readiness、generated/default caller、framework readiness、family-runtime evidence worklist 或 App/operator projection 时，必须回到 fresh `opl agents conformance --family-defaults --json`、`opl stages list|readiness --family-defaults --json`、`opl agents default-callers --family-defaults --json`、`opl framework readiness --family-defaults --json`、`opl family-runtime evidence-worklist ... --json` 与 `opl runtime app-operator-drilldown --json`。历史 frozen counters、旧 fail-closed 状态和单轮 App/worklist projection 只能作为 process provenance 写入 ledger；本文档组只保留 lifecycle、定位收敛、stage descriptor adoption 和文档 intake 支撑，不授权 domain ready、production ready、App release ready、quality/export verdict、artifact authority、memory body/apply、owner receipt closeout 或 physical delete。

## 当前参考

- [文档分层与生命周期管理 Playbook](./docs-lifecycle-management-playbook.md)：新增、更新、归档文档时的 lifecycle 判断清单。
- [OPL series 文档 intake 模板](./series-doc-intake-template.md)：跨 OPL / MAS / MAG / RCA / OMA / App 文档轮次的范围、验证和吸收记录模板。
- [OPL 定位演化与收敛经验参考](./opl-positioning-convergence-lessons.md)：旧入口、旧术语、旧 runtime 假设和旧 UI/API 形态的反污染方法。
- [OPL Family stage control plane adoption plan](./family-stage-control-plane-adoption-plan.md)：已落地 stage descriptor、prompt / skill / evaluation refs、handoff、只读 discovery 与 authority boundary 的支撑说明。
- [OPL Series README 叙事刷新对照记录，2026-05-30](./readme-narrative-refresh-2026-05-30.md)：六仓根层中英文 README 的新旧表达对照、英文润色口径和 overview 视觉资产状态。

## 已归档记录

下面这些记录已经退出 active/reference 层，只作为历史来源和 closeout provenance：

- [GUI 主线切换到 AionUI，2026-04-21](../../history/process/convergence-governance/gui-mainline-pivot-to-aionui-2026-04-21.md)
- [Contract Convergence v1 决策记录，2026-04-08](../../history/process/convergence-governance/contract-convergence-v1-decision-note-2026-04-08.md)
- [Contract Convergence v1 执行板，2026-04-11](../../history/process/convergence-governance/contract-convergence-v1-execution-board-2026-04-11.md)
- [Family Docs 生命周期治理落地记录，2026-05-09](../../history/process/convergence-governance/family-docs-lifecycle-governance-rollout-2026-05-09.md)
- [OPL Family 内容级文档收敛，2026-05-11](../../history/process/convergence-governance/family-content-level-docs-consolidation-2026-05-11.md)
- [OPL 产品分层与 Foundry Agent 发布形态落地记录，2026-05-12](../../history/process/convergence-governance/opl-product-layer-foundry-agent-rollout-2026-05-12.md)

这些历史记录不得作为当前 roadmap、default provider、frontdoor / Gateway / federation 语义、manifest 要求、compatibility surface 或 active checklist 使用。仍有效的规则应先提升到核心五件套、`docs/active/` owner 文档、`docs/policies/`、`docs/specs/` 或机器合同。
