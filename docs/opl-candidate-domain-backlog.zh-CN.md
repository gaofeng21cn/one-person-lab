[English](./opl-candidate-domain-backlog.md) | **中文**

# OPL Candidate Domain Backlog

## 目的

这份文档索引当前仍在定义中的 `OPL` workstream 的 machine-readable admission-blocker backlog。

它的作用是明确说明：`Grant Ops`、`Thesis Ops`、`Review Ops` 在被正式收录为独立 domain gateway 之前，还缺哪些边界材料。

它不是预收录 registry。
它不是执行 surface。

## 与 Task Topology / Domain Onboarding 的关系

这份 backlog 位于两个已冻结层之间：

- [OPL 任务版图](./task-map.zh-CN.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.zh-CN.md)

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

- [`../contracts/opl-gateway/candidate-domain-backlog.json`](../contracts/opl-gateway/candidate-domain-backlog.json)

这个工件让候选 workstream 保持可见，但不会假装它们的 domain boundary 已经存在。

## 非目标

这份 backlog 不负责：

- 分配未来的 domain identity 或 gateway / harness surface metadata
- 把 `Grant Ops`、`Thesis Ops`、`Review Ops` 改写成 `MedAutoScience` 或 `RedCube AI` 的扩展分支
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
- `candidate_domain_boundary`
- `required_onboarding_materials`
- `missing_boundary_materials`
- `formal_inclusion_gate`
- `notes`

## 当前候选覆盖

### Grant Ops

`Grant Ops` 在 task map / task topology 中已经有明确的顶层语义。

当前冻结下来的边界仍然是 proposal-facing：模拟评审与修订轨迹仍是作者侧的基金写作工件，而不是独立的 reviewer-role output。

但它仍然缺少未来 domain boundary package：包括 registry material、public gateway docs、truth ownership、review surfaces、discovery readiness、routing readiness，以及 cross-domain wording。
这些未来 package 只是 blocker，不代表 `Grant Ops` 现在已经具备 `G2` discovery readiness 或 `G3` routed-action readiness。

### Thesis Ops

`Thesis Ops` 在 task map / task topology 中已经有明确的顶层语义。

但它仍然缺少未来 domain boundary package：包括 thesis-specific registry material、public gateway docs、truth ownership、review surfaces、discovery readiness、routing readiness，以及 cross-domain wording。

### Review Ops

`Review Ops` 在 task map / task topology 中已经有明确的顶层语义。

但它仍然缺少未来 domain boundary package：包括 review-specific registry material、public gateway docs、truth ownership、review surfaces、discovery readiness、routing readiness，以及 cross-domain wording。

## 阅读规则

这份 surface 必须被理解成 **reference-only blocker index**。

只要某个 backlog entry 还存在，对应 workstream 就仍然位于 domain-onboarding gate 之下。
`blocked` 不代表“快收录了”。
它代表必需 boundary package 仍未完整。

它也不允许 `OPL` 悄悄把这些仍在定义中的 workstream 吸收进 `MedAutoScience` 或 `RedCube AI`。
这两个已收录 domain 仍然保持独立的 gateway / harness surface。

任何 backlog entry 都不授权 domain handoff、discovery target、routed-action target 或 harness access。

## 上位依据

- [OPL 任务版图](./task-map.zh-CN.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.zh-CN.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.zh-CN.md)

## 完成定义

只有当下面这些条件都成立时，candidate backlog 才算合格：

- 每个当前候选 workstream 都有显式 backlog entry
- blocker package 与 onboarding-package 类别一一对齐
- blocker check 与 onboarding formal-inclusion gate 一一对齐
- 没有任何 entry 分配未来 domain identity、gateway / harness surface metadata 或 routed readiness state
- backlog 保持可发现、可审阅，但不变成 control plane
- backlog 仍然保持 reference-only、non-executing、non-admitting
