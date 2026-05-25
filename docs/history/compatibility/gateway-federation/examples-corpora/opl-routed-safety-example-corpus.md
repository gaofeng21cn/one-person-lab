# OPL Routed-Safety Example Corpus

Owner: `One Person Lab`
Purpose: `legacy_routed_safety_example_corpus_provenance`
State: `history_only`
Machine boundary: 本文只保存旧 routed-safety examples 的人读 provenance。当前仓库不再发布这组 examples 的 active machine-readable artifact；当前机器真相继续归 active contracts、source、CLI/API 行为、runtime ledger、provider receipts 与 domain-owned manifests / receipts。本文不得作为 active routing behavior、fallback mechanism、test oracle 或 compatibility interface。

## 目的

这份文档索引来自已归档 `OPL Routed Action Gateway` 语料的显式非成功路由状态历史 machine-readable examples。

它的目标是：在不把 failure example 变成 runtime 的前提下，让顶层 routing safety 更容易被发现和审核。

## 非目标

这组 corpus 不负责：

- 实现 runtime
- 发明 fallback routing
- 在路由未决时构造 handoff payload
- 把 canonical truth 上收给 `OPL`

这些 example 只是 illustrative 的 safety composition。
在当前 `Phase 1 / G3 thin handoff planning freeze hardening` 中，它们仍只是 planning-level contract 示例，而不是 runtime 行为。

## Former Example Set

### 1. Ambiguous task

- Former artifact：`examples/opl-framework/ambiguous-task-routing.json`（已从 active repo artifact set 退役）
- 展示当一个请求同时混合 `research_ops` 与 `presentation_ops` 语义、且缺少关键信息时，`OPL` 如何保持 routing unresolved。

### 2. Unknown domain

- Former artifact：`examples/opl-framework/unknown-domain-routing.json`（已从 active repo artifact set 退役）
- 展示当一个 candidate workstream 的顶层语义已经可识别、但当前没有任何 domain-owned capability entry 正式拥有它时，`OPL` 如何返回 `unknown_domain`。

### 3. Refusal

- Former artifact：`examples/opl-framework/refusal-routing.json`（已从 active repo artifact set 退役）
- 展示当一个顶层请求试图绕过 domain-owned action boundary 时，`OPL` 如何直接拒绝。

## 阅读规则

这些 example 必须被理解成 **contract-level safety walkthroughs**，而不是 executable workflow。

只要 routing 仍然 unresolved 或被 refused，就不会生成 handoff payload，也不会由 `OPL` 创建任何 domain truth。
这些 example 只是展示已冻结 G3 与 P5.M1 层如何安全记录这条边界。

## 上位合同

- [OPL Routed Action Gateway](../opl-routed-action-gateway.md)
- [OPL Governance / Audit Operating Surface](../operating-governance/opl-governance-audit-operating-surface.md)
- [OPL Framework Contracts](../../../../../contracts/opl-framework/README.md)
- [OPL Gateway Acceptance Test Spec](../opl-gateway-acceptance-test-spec.md)

## 完成定义

只有当下面这些条件都成立时，这组 routed-safety corpus 才算合格：

- former artifact 名称只保留 provenance 语义，不再作为可点击 active repo path
- examples 不暗示 hidden best-effort routing 或 direct harness fallback
- examples 不把 canonical truth 上收给 `OPL`
- 当前 routing 行为必须从 active contracts/source/CLI 行为读取，而不是从这组历史 corpus 读取
