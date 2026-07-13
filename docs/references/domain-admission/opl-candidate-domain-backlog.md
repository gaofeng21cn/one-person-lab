# OPL Candidate Domain Backlog

Owner: `One Person Lab`
Purpose: `references_domain_admission_opl_candidate_domain_backlog`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

> Currentness rule: 本文只保存 candidate workstream blocker 的人读索引，不冻结当前候选数量、active workstream 数量或 readiness 状态。使用本文前，先读取核心五件套、[OPL 任务版图](../../public/task-map.md)、[OPL Domain Onboarding Contract](../../specs/opl-domain-onboarding-contract.md)、`task-topology.json`、`workstreams.json`、`domains.json`、CLI/read-model 与相关测试；只有这些 live surfaces 能证明某个 workstream 是 registered、under-definition candidate、unknown domain、selected domain-agent entry 或仍位于 formal inclusion 之下。

## 目的

这份文档索引 live task topology 中仍在定义中的 `OPL` workstream 的 admission-blocker backlog。

它的作用是明确说明：凡 live topology 仍标记为 `under_definition` / `not_registered` / `candidate_domain_agent_pending` 的 workstream，在被正式收录为独立 domain-agent/capability boundary 之前，还缺哪些边界材料。当前机器面中的 `IP Ops`、`Award Ops`、`Thesis Ops`、`Review Ops` 是这类 blocker entry 的当前覆盖对象。

它不是预收录 registry。
它不是执行 surface。
它也不是 stage-discovery、domain handoff、routed-action 或 readiness surface。

## 与 Task Topology / Domain Onboarding 的关系

这份 backlog 位于两个已冻结层之间：

- [OPL 任务版图](../../public/task-map.md)
- [OPL Domain Onboarding Contract](../../specs/opl-domain-onboarding-contract.md)

Task map / task-topology 层负责把顶层语义写清楚。
Onboarding contract 负责定义正式收录门槛。
这份 backlog 负责记录这两层之间还缺什么边界材料。

在当前 live topology / onboarding 读法下，这三层已经足以表达 candidate-domain path：

- task topology 定义 workstream boundary
- backlog 记录仍缺哪些 boundary package
- onboarding 定义 formal inclusion gate

因此，`OPL` 当前**不会**再在 backlog 与 onboarding 之间额外插入一层独立的 candidate-domain-definition surface。

它**不会**创造 `G1` registry admission、`G2` discovery readiness 或 `G3` routed-action readiness。

## Machine Boundary

当前仓库没有发布 `candidate-domain-backlog.json` 机器可读合同。候选可见性来自 [`task-topology.json`](../../../contracts/opl-framework/task-topology.json)：凡 entry 仍读为 `under_definition` / `not_registered` / `candidate_domain_agent_pending`、没有 `current_domain_id`、没有 `entry_surface`，且 `formal_domain_required=true`，就仍处在 candidate / onboarding path。已注册 active workstream 只从 [`workstreams.json`](../../../contracts/opl-framework/workstreams.json) 读取；该文件不收录这些候选项。本文只是 derived human-readable blocker reference。

当前 active machine-readable topology 让候选 workstream 保持可见，但不会假装它们的 domain boundary 已经存在。
`opl stages list --json` 可以证明已收录 stage plane 可读，但不能把这些候选项提升为 admitted stage、discovery target、routing target、domain handoff 或 readiness 结论。

配套 tranche 总结：

- [OPL Candidate Workstream Tranche Closeout](../../history/process/domain-admission/opl-candidate-workstream-tranche-closeout.md)

## 非目标

这份 backlog 不负责：

- 分配未来的 domain identity 或 legacy route-surface metadata
- 把 `IP Ops`、`Award Ops`、`Thesis Ops`、`Review Ops` 改写成 `MedAutoScience`、`MedAutoGrant` 或 `RedCube AI` 的扩展分支
- 把候选项加入 `G1` registry
- 创造 discovery target 或 routed-action target
- 变成 approval queue、release plan 或 runtime planner
- 把 truth / review / publication authority 上收给 `OPL`

## Backlog 字段

每个 entry 都保持 reference-only，只携带：

- `workstream_id`
- `label`
- `task_topology_state`
- `top_level_signal_refs`
- `conformance_status`
- `readiness_flags`
- `required_onboarding_materials`
- `missing_boundary_materials`
- `formal_inclusion_gate`
- `notes`

## 当前候选覆盖

本节的具体 entry 必须与 live `task-topology.json` 中仍处于 candidate / onboarding path 的 workstream 对齐。新增或移除 candidate workstream 时，应在同一治理 tranche 中同时更新 topology / onboarding 证据、本文 entry 和相关 CLI/read-model 测试或 negative guard。

### IP Ops

`IP Ops` 在 task map / task topology 中已经有明确的顶层语义：它覆盖技术交底书、专利申请书草稿、权利要求、实施例和审查意见答复计划这类知识产权保护交付物。

但它仍然缺少未来 domain boundary package：包括 patent-specific registry material、public domain-agent/capability docs、专利申请书 / 权利要求 / 实施例 / 现有技术定位 / 审查意见答复的 truth ownership、人工/法律审阅 surface、显式的 execution-model declaration、discovery readiness、routing readiness，以及 cross-domain wording。
这份 execution-model declaration 还必须明确 stable agent runtime surface、说明 `Auto` 与 `Human-in-the-loop` 如何共享同一基座、解释 code-versus-Agent responsibility split，并明确排除 `fixed-code-first` 或长期单模的 framing。
routing readiness blocker 还必须证明专利请求不会被路由到 `MedAutoGrant`，除非该请求实际属于 Grant Ops 基金申请工作。

这里冻结下来的 negative conclusion 是：`IP Foundry` / `Med Auto Patent` 只是 candidate product-family signal；它不足以推出 formal admission、discovery readiness、routed-action readiness、handoff readiness，或把 patent truth ownership 上收到 OPL。

### Award Ops

`Award Ops` 在 task map / task topology 中已经有明确的顶层语义：它覆盖科技进步奖、自然科学奖、成果奖、人才/项目荣誉材料中的报奖书、成果总结、贡献排序、影响力佐证和推荐材料。

但它仍然缺少未来 domain boundary package：包括 award-specific registry material、public domain-agent/capability docs、报奖书 / 成果总结 / 贡献排序 / 影响力佐证 / 推荐材料的 truth ownership、人工专家审阅 surface、显式的 execution-model declaration、discovery readiness、routing readiness，以及 cross-domain wording。
这份 execution-model declaration 还必须明确 stable agent runtime surface、说明 `Auto` 与 `Human-in-the-loop` 如何共享同一基座、解释 code-versus-Agent responsibility split，并明确排除 `fixed-code-first` 或长期单模的 framing。
routing readiness blocker 还必须证明报奖请求不会作为基金申请工作路由到 `MedAutoGrant`，即使 Award Ops 可以复用 Grant Ops 的写作基座。

这里冻结下来的 negative conclusion 是：`Award Foundry` / `Med Auto Award` 只是 candidate product-family signal；它不足以推出 formal admission、discovery readiness、routed-action readiness、handoff readiness，或把 award truth ownership 上收到 OPL。

### Thesis Ops

`Thesis Ops` 在 task map / task topology 中已经有明确的顶层语义。`Thesis Foundry` / `Med Auto Thesis` 是这条 candidate lane 的规划产品表达。

当前路径里冻结下来的 negative conclusion 是：Thesis Ops 的 thesis assembly 确实增加了顶层边界语义，但这种边界只以 reference-only candidate boundary 的形式存在于现有 topology / backlog / onboarding 链路中；章节草稿集、跨章节同步、答辩准备协调，并不等同于 `Research Ops` 的 manuscript / submission flow，而下游可能派生出的 `defense_deck` 也不会把这个 workstream 压缩成 `Presentation Ops` / `RedCube AI`。

但它仍然缺少未来 domain boundary package：包括 thesis-specific registry material、public domain-agent/capability docs、truth ownership、review surfaces、显式的 execution-model declaration、discovery readiness、routing readiness，以及 cross-domain wording。
这份 execution-model declaration 还必须明确 stable agent runtime surface、说明 `Auto` 与 `Human-in-the-loop` 如何共享同一基座、解释 code-versus-Agent responsibility split，并明确排除 `fixed-code-first` 或长期单模的 framing。
其中 discovery readiness blocker 必须把只读 discovery 明确指向未来的 domain-owned capability entry，但不能提前暗示 handoff readiness，也不能把 Thesis Ops 静默塌缩成 `Research Ops` 或 `Presentation Ops`。
其中 routing readiness blocker 必须冻结显式 route evidence，把 successful target 限定为当前 domain-owned capability/action-route refs，继续遵守不得直达 harness 的 no-bypass 规则，并避免把这个 workstream 静默并入其他 admitted domain。
其中 cross-domain wording blocker 必须让 `OPL` 与未来 thesis domain 的 wording 保持对齐，同时不把 thesis assembly 等同于 `Research Ops` 的 manuscript flow 或 `Presentation Ops` / `RedCube AI` 的 deck production。
这些未来 package 只是 blocker，不代表 `Thesis Ops` 现在已经具备 `G2` discovery readiness 或 `G3` routed-action readiness。

### Review Ops

`Review Ops` 在 task map / task topology 中已经有明确的顶层语义：它把 reviewer-role work 与 response / rebuttal coordination 放在同一个 candidate semantic bundle 里。`Review Foundry` / `Med Auto Review` 是这条 candidate lane 的规划产品表达。

但它仍然缺少未来 domain boundary package：包括 review-specific registry material、review reports / comment structures / rebuttal plans / revision-route maps 的 truth ownership、public domain-agent/capability docs、review surfaces、显式的 execution-model declaration、discovery readiness、routing readiness，以及 cross-domain wording。
这份 execution-model declaration 还必须明确 stable agent runtime surface、说明 `Auto` 与 `Human-in-the-loop` 如何共享同一基座、解释 code-versus-Agent responsibility split，并明确排除 `fixed-code-first` 或长期单模的 framing。
其中 discovery readiness blocker 必须把只读 discovery 明确指向未来的 domain-owned capability entry，但不能提前暗示 review bundle 已具备 handoff readiness。
其中 routing readiness blocker 必须冻结显式 route evidence，把 successful target 限定为当前 domain-owned capability/action-route refs，并继续遵守不得直达 harness 的 no-bypass 规则。
其中 cross-domain wording blocker 必须让 `OPL` 与未来 review domain 的 reviewer-role wording 保持对齐，同时不把 review-truth ownership 上收到 `OPL`。

这里冻结下来的 negative conclusion 是：这种组合语义仍不足以推出 formal admission、discovery readiness、routed-action readiness、handoff readiness，或把 review truth ownership 上收到 OPL。

## 阅读规则

这份 surface 必须被理解成 **reference-only blocker index**。

只要某个 backlog entry 还存在，对应 workstream 就仍然位于 domain-onboarding gate 之下。
`blocked` 不代表“快收录了”。
它代表必需 boundary package 仍未完整。
如果 execution-model declaration 还缺失，该 workstream 就仍然只能停留在 under definition / deferred，而不能被写成 `ready`、`aligned` 或隐式 admitted。
如果当前只存在公开 scaffold 或 domain-direction hint，它也仍然只能被解释为顶层信号/证据，而不能代替真实 boundary package。

它也不允许 `OPL` 悄悄把这些仍在定义中的 workstream 吸收进 `MedAutoScience`、`MedAutoGrant` 或 `RedCube AI`。
这些已收录 domain 仍然保持独立的 domain-agent entry 与 domain-owned capability surface。

任何 backlog entry 都不授权 domain handoff、discovery target、routed-action target 或 harness access。

## 上位依据

- [OPL 任务版图](../../public/task-map.md)
- [OPL Domain Onboarding Contract](../../specs/opl-domain-onboarding-contract.md)
- [OPL Framework Contracts](../../../contracts/opl-framework/README.md)

历史 `Gateway` / routed-action / federation acceptance specs 只作为 provenance 或 tombstone 读取，不再作为 candidate-domain admission authority、machine-readable contract surface、readiness gate 或当前 stage handoff 规则。

## 完成定义

只有当下面这些条件都成立时，candidate backlog 才算合格：

- 每个当前候选 workstream 都有显式 backlog entry
- blocker package 与 onboarding-package 类别一一对齐
- blocker check 与 onboarding formal-inclusion gate 一一对齐
- discovery readiness blocker 与 routing readiness blocker 继续保持为两项独立 blocked check
- public companion wording 继续把 execution-model blocker 写明：stable agent runtime surface、共享同一基座的 `Auto` / `Human-in-the-loop`、以及 code-versus-Agent responsibility split 在显式回答前，都只能保持 under definition / deferred
- 没有任何 entry 分配未来 domain identity、legacy route-surface metadata 或 routed readiness state
- backlog 保持可发现、可审阅，但不变成 control plane
- backlog 仍然保持 reference-only、non-executing、non-admitting
