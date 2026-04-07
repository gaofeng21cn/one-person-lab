[English](./opl-gateway-example-corpus.md) | **中文**

# OPL Gateway Example Corpus

## 目的

这份文档索引当前已冻结 `OPL Gateway` 合同体系的 canonical machine-readable examples。

它的目标是：在不把 example 做成 runtime 的前提下，让当前 gateway surface 更容易被发现和复用。
它是一个配套索引，而不是新的 contract layer。

## 非目标

这组 example 不负责：

- 实现 runtime
- 执行 domain harness
- 声称自己拥有 canonical domain truth
- 替代底层正式 contract

这些 example 只是 illustrative 的 contract composition。
在当前 `Phase 1 / G3 thin handoff planning freeze hardening` 中，这里出现的 routed-action 片段都只停留在 planning-level contract 层，不表示已激活 launcher 或 runtime。

## 当前 Example Set

### 1. Research submission flow

- 文件：[`../../examples/opl-gateway/research-ops-submission.json`](../../examples/opl-gateway/research-ops-submission.json)
- 展示一个 `research_ops` 请求如何组合：
  - `G3` routed action decision
  - `G1/G3` handoff payload
  - `P5.M1` governance / audit record
  - `P5.M2` publish / promotion record

### 2. Presentation publish / promotion flow

- 文件：[`../../examples/opl-gateway/presentation-ops-publish.json`](../../examples/opl-gateway/presentation-ops-publish.json)
- 展示一个 `presentation_ops` 请求如何组合：
  - `G3` routed action decision
  - `G1/G3` handoff payload
  - `P5.M1` governance / audit record
  - `P5.M2` publish / promotion record

## 阅读规则

这些 example 必须被理解成**contract-level walkthrough**，而不是 executable workflow。
这组 corpus 是 illustrative、non-governing 的配套参考。

只要 example 引用了某个 domain outcome，该 outcome 仍然是 domain-owned truth。
`OPL` 只携带已冻结合同中定义的顶层 routing、governance 与 publish/promotion index。

## 上位合同

- [OPL Federation Contract](../opl-federation-contract.zh-CN.md)
- [OPL Routed Action Gateway](../opl-routed-action-gateway.zh-CN.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Gateway Contracts](../../contracts/opl-gateway/README.zh-CN.md)

## 相关配套示例

- [OPL Routed-Safety Example Corpus](./opl-routed-safety-example-corpus.zh-CN.md)

## 完成定义

只有当下面这些条件都成立时，这组 example corpus 才算合格：

- 每个 example 都保持 machine-readable
- 受 schema 约束的子对象在适用处都能通过 frozen schema 校验
- example 不暗示 direct harness execution
- example 不把 canonical truth 上收给 `OPL`
