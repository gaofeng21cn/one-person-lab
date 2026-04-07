[English](./opl-routed-safety-example-corpus.md) | **中文**

# OPL Routed-Safety Example Corpus

## 目的

这份文档索引当前已冻结 `OPL Routed Action Gateway` 中显式非成功路由状态的 canonical machine-readable examples。

它的目标是：在不把 failure example 变成 runtime 的前提下，让顶层 routing safety 更容易被发现和审核。

## 非目标

这组 corpus 不负责：

- 实现 runtime
- 发明 fallback routing
- 在路由未决时构造 handoff payload
- 把 canonical truth 上收给 `OPL`

这些 example 只是 illustrative 的 safety composition。

## 当前 Example Set

### 1. Ambiguous task

- 文件：[`../../examples/opl-gateway/ambiguous-task-routing.json`](../../examples/opl-gateway/ambiguous-task-routing.json)
- 展示当一个请求同时混合 `research_ops` 与 `presentation_ops` 语义、且缺少关键信息时，`OPL` 如何保持 routing unresolved。

### 2. Unknown domain

- 文件：[`../../examples/opl-gateway/unknown-domain-routing.json`](../../examples/opl-gateway/unknown-domain-routing.json)
- 展示当一个 candidate workstream 的顶层语义已经可识别、但当前没有任何已注册 domain gateway 正式拥有它时，`OPL` 如何返回 `unknown_domain`。

### 3. Refusal

- 文件：[`../../examples/opl-gateway/refusal-routing.json`](../../examples/opl-gateway/refusal-routing.json)
- 展示当一个顶层请求试图绕过 domain gateway 边界时，`OPL` 如何直接拒绝。

## 阅读规则

这些 example 必须被理解成 **contract-level safety walkthroughs**，而不是 executable workflow。

只要 routing 仍然 unresolved 或被 refused，就不会生成 handoff payload，也不会由 `OPL` 创建任何 domain truth。
这些 example 只是展示已冻结 G3 与 P5.M1 层如何安全记录这条边界。

## 上位合同

- [OPL Routed Action Gateway](../opl-routed-action-gateway.zh-CN.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Gateway Contracts](../../contracts/opl-gateway/README.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.zh-CN.md)

## 完成定义

只有当下面这些条件都成立时，这组 routed-safety corpus 才算合格：

- 每个 example 都保持 machine-readable
- 受约束的 routed-action 与 governance-audit 子对象在适用处都能通过 frozen schema 校验
- examples 不暗示 hidden best-effort routing 或 direct harness fallback
- examples 不把 canonical truth 上收给 `OPL`
