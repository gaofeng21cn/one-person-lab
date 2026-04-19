[English](./opl-candidate-domain-backlog.md) | **中文**

# OPL Candidate Domain Backlog

## 目的

这份文档索引当前仍在定义中的 `OPL` workstream 的 machine-readable admission-blocker backlog。

它的作用是明确说明：`Thesis Ops`、`Review Ops` 在被正式收录为独立 domain gateway 之前，还缺哪些边界材料。

它不是预收录 registry。
它不是执行 surface。

## 与 Task Topology / Domain Onboarding 的关系

这份 backlog 位于两个已冻结层之间：

- [OPL 任务版图](../task-map.zh-CN.md)
- [OPL Domain Onboarding Contract](../opl-domain-onboarding-contract.zh-CN.md)

Task map / task-topology 层负责把顶层语义写清楚。
Onboarding contract 负责定义正式收录门槛。
这份 backlog 负责记录这两层之间还缺什么边界材料。

在当前基线上，这三层已经足以表达 candidate-domain path：

- task topology 定义 workstream boundary
- backlog 记录仍缺哪些 boundary package
- onboarding 定义 formal inclusion gate

因此，`OPL` 当前**不会**再在 backlog 与 onboarding 之间额外插入一层独立的 candidate-domain-definition surface。

它**不会**创造 `G1` registry admission、`G2` discovery readiness 或 `G3` routed-action readiness。

## 机器可读工件

- [`../../contracts/opl-gateway/candidate-domain-backlog.json`](../../contracts/opl-gateway/candidate-domain-backlog.json)

这个工件让候选 workstream 保持可见，但不会假装它们的 domain boundary 已经存在。

配套 tranche 总结：

- [OPL Candidate Workstream Tranche Closeout](./opl-candidate-workstream-tranche-closeout.zh-CN.md)

## 非目标

这份 backlog 不负责：

- 分配未来的 domain identity 或 gateway / harness surface metadata
- 把 `Thesis Ops`、`Review Ops` 改写成 `MedAutoScience`、`MedAutoGrant` 或 `RedCube AI` 的扩展分支
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
- `admission_status`
- `readiness_flags`
- `required_onboarding_materials`
- `missing_boundary_materials`
- `formal_inclusion_gate`
- `notes`

## 当前候选覆盖

### Thesis Ops

`Thesis Ops` 在 task map / task topology 中已经有明确的顶层语义。

当前路径里冻结下来的 negative conclusion 是：Thesis Ops 的 thesis assembly 确实增加了顶层边界语义，但这种边界只以 reference-only candidate boundary 的形式存在于现有 topology / backlog / onboarding 链路中；章节草稿集、跨章节同步、答辩准备协调，并不等同于 `Research Ops` 的 manuscript / submission flow，而下游可能派生出的 `defense_deck` 也不会把这个 workstream 压缩成 `Presentation Ops` / `RedCube AI`。

但它仍然缺少未来 domain boundary package：包括 thesis-specific registry material、public gateway docs、truth ownership、review surfaces、显式的 execution-model declaration、discovery readiness、routing readiness，以及 cross-domain wording。
这份 execution-model declaration 还必须明确 stable agent runtime surface、说明 `Auto` 与 `Human-in-the-loop` 如何共享同一基座、解释 code-versus-Agent responsibility split，并明确排除 `fixed-code-first` 或长期单模的 framing。
其中 discovery readiness blocker 必须把只读 discovery 明确指向未来的 `domain_gateway` 入口，但不能提前暗示 handoff readiness，也不能把 Thesis Ops 静默塌缩成 `Research Ops` 或 `Presentation Ops`。
其中 routing readiness blocker 必须冻结显式 route evidence，保持 `domain_gateway` 仍是唯一 allowed successful target，继续遵守不得直达 harness 的 no-bypass 规则，并避免把这个 workstream 静默并入其他 admitted domain。
其中 cross-domain wording blocker 必须让 `OPL` 与未来 thesis domain 的 wording 保持对齐，同时不把 thesis assembly 等同于 `Research Ops` 的 manuscript flow 或 `Presentation Ops` / `RedCube AI` 的 deck production。
这些未来 package 只是 blocker，不代表 `Thesis Ops` 现在已经具备 `G2` discovery readiness 或 `G3` routed-action readiness。

### Review Ops

`Review Ops` 在 task map / task topology 中已经有明确的顶层语义：它把 reviewer-role work 与 response / rebuttal coordination 放在同一个 candidate semantic bundle 里。

但它仍然缺少未来 domain boundary package：包括 review-specific registry material、review reports / comment structures / rebuttal plans / revision-route maps 的 truth ownership、public gateway docs、review surfaces、显式的 execution-model declaration、discovery readiness、routing readiness，以及 cross-domain wording。
这份 execution-model declaration 还必须明确 stable agent runtime surface、说明 `Auto` 与 `Human-in-the-loop` 如何共享同一基座、解释 code-versus-Agent responsibility split，并明确排除 `fixed-code-first` 或长期单模的 framing。
其中 discovery readiness blocker 必须把只读 discovery 明确指向未来的 `domain_gateway` 入口，但不能提前暗示 review bundle 已具备 handoff readiness。
其中 routing readiness blocker 必须冻结显式 route evidence，保持 `domain_gateway` 仍是唯一 allowed successful target，并继续遵守不得直达 harness 的 no-bypass 规则。
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
这些已收录 domain 仍然保持独立的 gateway / harness surface。

任何 backlog entry 都不授权 domain handoff、discovery target、routed-action target 或 harness access。

## 上位依据

- [OPL 任务版图](../task-map.zh-CN.md)
- [OPL Domain Onboarding Contract](../opl-domain-onboarding-contract.zh-CN.md)
- [OPL Gateway Contracts](../../contracts/opl-gateway/README.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.zh-CN.md)

## 完成定义

只有当下面这些条件都成立时，candidate backlog 才算合格：

- 每个当前候选 workstream 都有显式 backlog entry
- blocker package 与 onboarding-package 类别一一对齐
- blocker check 与 onboarding formal-inclusion gate 一一对齐
- discovery readiness blocker 与 routing readiness blocker 继续保持为两项独立 blocked check
- public companion wording 继续把 execution-model blocker 写明：stable agent runtime surface、共享同一基座的 `Auto` / `Human-in-the-loop`、以及 code-versus-Agent responsibility split 在显式回答前，都只能保持 under definition / deferred
- 没有任何 entry 分配未来 domain identity、gateway / harness surface metadata 或 routed readiness state
- backlog 保持可发现、可审阅，但不变成 control plane
- backlog 仍然保持 reference-only、non-executing、non-admitting
