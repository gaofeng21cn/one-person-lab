[English](./opl-candidate-workstream-tranche-closeout.md) | **中文**

# OPL Candidate Workstream Tranche Closeout

## 范围

这份 closeout 冻结当前有限 tranche 中三个仍处于 under-definition 状态的 `OPL` workstream：

- `Grant Ops`
- `Review Ops`
- `Thesis Ops`

它只是一份总结 surface。
它不会收录任何 domain。
它不会创造 `G2` discovery readiness。
它不会创造 `G3` routed-action readiness。
它不会新增 candidate-definition layer。

当前有效路径仍然只有：

1. task topology
2. candidate-domain backlog
3. domain onboarding

## 为什么这轮 tranche 有价值

这轮 tranche 的价值不是“又多写了一层 prose”。
而是把三条可能误导后续 onboarding 的捷径冻结掉：

- `Grant Ops` **不是**隐藏的 reviewer-owned surface。
- `Review Ops` **不是**已经收录的 review domain。
- `Thesis Ops` **不能**被压缩成 `Research Ops` 的 manuscript/submission flow，也**不能**被压缩成 `Presentation Ops` / `RedCube AI` 的 deck production。

这些 negative boundary 现在已经冻结进 tracked 的 topology / backlog / acceptance path。

## 各 workstream 的冻结结果

| Workstream | 这轮 tranche 已冻结 | 仍然缺少什么 | 绝不能提前宣称什么 |
| --- | --- | --- | --- |
| `Grant Ops` | 只冻结 proposal-facing boundary：模拟评审与修订仍是作者侧的 grant-authoring aids / artifacts。 | 真正的 domain boundary package：registry material、public gateway docs、truth ownership、review surfaces、readiness evidence、cross-domain wording。 | 独立 admission、reviewer-role ownership、`G2` discovery readiness、`G3` routed-action readiness、未来 domain metadata。 |
| `Review Ops` | 只冻结为一个 under-definition semantic bundle：reviewer-role work + response/rebuttal coordination。 | 真正的 review-domain boundary package：review-specific truth ownership、public docs、review surfaces、readiness evidence、cross-domain wording。 | 已收录 review domain、`OPL` 拥有 review truth、`G2` discovery readiness、`G3` routed-action readiness。 |
| `Thesis Ops` | 只冻结 thesis assembly 的 reference-only candidate boundary：chapter-draft sets、cross-chapter synchronization、defense-preparation packs 仍然区别于 `Research Ops` 的 manuscript/submission flow，也不等于 `Presentation Ops` / `RedCube AI` 的 deck production。 | 真正的 thesis-domain boundary package：thesis-specific registry material、public docs、truth ownership、review surfaces、readiness evidence、cross-domain wording。 | 被折叠进已收录 domain、`G2` discovery readiness、`G3` routed-action readiness、未来 domain metadata、直接 domain handoff。 |

## 仍然冻结不变的共享规则

对这三个 workstream，以下规则仍然成立：

- 不新增独立 candidate-definition surface
- 不预先分配未来 `domain_id`、`gateway_surface`、`harness_surface`
- 不把任何 workstream 自动折叠进 `MedAutoScience` 或 `RedCube AI`
- 在 onboarding evidence 出现前，不让任何 workstream 变成 discovery target 或 routed-action target
- 不给任何 workstream 直接 harness access
- 所有当前 surface 仍保持 reference-only、non-executing、non-admitting

## 这轮 tranche 没有做什么

这轮 tranche **没有**：

- 把 `OPL` 扩张成 monolithic runtime
- 把 canonical domain truth 上收到 `OPL`
- 绕过 domain gateway 直达 harness
- 收录任何新的 domain gateway
- 证明任何 candidate workstream 已经具备 discovery 或 routing 条件

## 当前冻结真相实际落在哪里

当前冻结下来的边界真相，并不只存在于这份 closeout 文档里，而是落在已有 tracked path 中：

- [OPL 任务版图](./task-map.zh-CN.md)
- [OPL Candidate Domain Backlog](./opl-candidate-domain-backlog.zh-CN.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.zh-CN.md)

这轮 tranche 对应的 checkpoint commit：

- `dc16aa3` — `Grant Ops`
- `5b254fc` — `Review Ops`
- `0d2c48b` — `Thesis Ops`

## 下一道决策边界

只有当下一轮 program 能提供这轮 tranche 之外的新增边界真相时，才值得继续推进，例如：

- 某个 candidate workstream 拿出真实的 domain boundary package
- 出现明确的 public-domain ownership surfaces
- 出现能经受 admission / discovery / routing review 的 readiness evidence

在那之前，正确姿态仍然是：让这些 workstream 保持可见，但继续 blocked。
