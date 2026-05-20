# Convergence Governance 参考

Owner: `One Person Lab`
Purpose: `references_convergence_governance_index`
State: `support_reference`
Machine boundary: 本文是人读 reference 索引。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

本目录只保留当前仍可复用的收敛治理规则、文档生命周期方法、跨仓 intake 模板、shared release 维护规则和 stage control plane 支撑。一次性 rollout、dated execution board、closeout evidence、历史产品分层落地记录和已经被当前 taxonomy 吸收的同步快照，不再留在 reference 默认阅读面。

## 当前参考

- [文档分层与生命周期管理 Playbook](./docs-lifecycle-management-playbook.md)：新增、更新、归档文档时的 lifecycle 判断清单。
- [四仓文档 intake 模板](./four-repo-doc-intake-template.md)：跨 OPL / MAS / MAG / RCA 文档轮次的范围、验证和吸收记录模板。
- [Family shared release 维护参考](./family-shared-release-maintenance.md)：OPL shared modules owner commit、contract 与 consumer pin 的维护流程。
- [OPL 定位演化与收敛经验参考](./opl-positioning-convergence-lessons.md)：旧入口、旧术语、旧 runtime 假设和旧 UI/API 形态的反污染方法。
- [OPL Family stage control plane adoption plan](./family-stage-control-plane-adoption-plan.md)：stage descriptor、prompt / skill / evaluation refs、handoff 与 authority boundary 的支撑说明。

## 已归档记录

下面这些记录已经退出 active/reference 层，只作为历史来源和 closeout provenance：

- [GUI 主线切换到 AionUI，2026-04-21](../../history/process/convergence-governance/gui-mainline-pivot-to-aionui-2026-04-21.md)
- [Contract Convergence v1 决策记录，2026-04-08](../../history/process/convergence-governance/contract-convergence-v1-decision-note-2026-04-08.md)
- [Contract Convergence v1 执行板，2026-04-11](../../history/process/convergence-governance/contract-convergence-v1-execution-board-2026-04-11.md)
- [Family Docs 生命周期治理落地记录，2026-05-09](../../history/process/convergence-governance/family-docs-lifecycle-governance-rollout-2026-05-09.md)
- [OPL Family 内容级文档收敛，2026-05-11](../../history/process/convergence-governance/family-content-level-docs-consolidation-2026-05-11.md)
- [OPL 产品分层与 Foundry Agent 发布形态落地记录，2026-05-12](../../history/process/convergence-governance/opl-product-layer-foundry-agent-rollout-2026-05-12.md)

这些历史记录不得作为当前 roadmap、default provider、frontdoor / Gateway / federation 语义、manifest 要求、compatibility surface 或 active checklist 使用。仍有效的规则应先提升到核心五件套、`docs/active/` owner 文档、`docs/policies/`、`docs/specs/` 或机器合同。
