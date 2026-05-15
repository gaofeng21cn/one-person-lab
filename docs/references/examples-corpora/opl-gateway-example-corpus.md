# OPL Gateway Example Corpus

State: `support_reference_legacy_derived`
Current owner: `docs/references/README.md`
Machine boundary: 只作为 legacy/provenance 人读配套。当前仓库不再发布这组 corpus 的 active `examples/opl-framework/*.json` artifact。

## 目的

这份文档索引早期 `OPL Gateway` 合同体系留下的 former historical / legacy-derived machine-readable examples。

它的目标是：在不把 example 做成 runtime 或当前 topology 的前提下，让 legacy gateway examples 可以继续用于 review、migration 与 schema archaeology。
它是一个配套索引，而不是新的 contract layer。
当前 OPL topology 是 stage-led、以 Agent executor 为最小执行单位；这些 examples 是合同 walkthrough 和 evidence material。

## 非目标

这组 example 不负责：

- 实现 runtime
- 执行 domain harness
- 声称自己拥有 canonical domain truth
- 替代底层正式 contract

这些 example 只是 illustrative 的 contract composition。
在当前 `Phase 1 / G3 thin handoff planning freeze hardening` 中，这里出现的 routed-action 片段都只停留在 planning-level contract 层，不表示已激活 launcher 或 runtime。

## Former Example Set

### 1. Research submission flow

- Former artifact：`examples/opl-framework/research-ops-submission.json`（已从 active repo artifact set 退役）
- 展示一个 `research_ops` 请求如何组合：
  - `G3` routed action decision
  - `G1/G3` handoff payload
  - `P5.M1` governance / audit record
  - `P5.M2` publish / promotion record

### 2. Presentation publish / promotion flow

- Former artifact：`examples/opl-framework/presentation-ops-publish.json`（已从 active repo artifact set 退役）
- 展示一个 `presentation_ops` 请求如何组合：
  - `G3` routed action decision
  - `G1/G3` handoff payload
  - `P5.M1` governance / audit record
  - `P5.M2` publish / promotion record

## 阅读规则

这些 example 必须被理解成**contract-level walkthrough**，而不是 executable workflow。
这组 corpus 是 illustrative、non-governing 的配套参考。

只要 example 引用了某个 domain outcome，该 outcome 仍然是 domain-owned truth。
`OPL` 只携带这些已归档 provenance 示例中展示的顶层 routing、governance 与 publish/promotion index。当前行为必须使用 active contracts、source、CLI/API 行为、runtime ledger 和 domain-owned manifest。

## 上位合同

- [OPL Federation Contract](../../history/compatibility/gateway-federation/opl-federation-contract.md)
- [OPL Routed Action Gateway](../../history/compatibility/gateway-federation/opl-routed-action-gateway.md)
- [OPL Governance / Audit Operating Surface](../operating-governance/opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](../operating-governance/opl-publish-promotion-operating-surface.md)
- [OPL Gateway Acceptance Test Spec](../../history/compatibility/gateway-federation/opl-gateway-acceptance-test-spec.md)
- [OPL Framework Contracts](../../../contracts/opl-framework/README.md)

## 相关配套示例

- [OPL Routed-Safety Example Corpus](./opl-routed-safety-example-corpus.md)

## 完成定义

只有当下面这些条件都成立时，这组 example corpus 才算合格：

- former artifact 名称只保留 provenance 语义，不再作为可点击 active repo path
- corpus 不暗示 direct harness execution
- corpus 不把 canonical truth 上收给 `OPL`
- corpus 引导读者回到当前 contracts/source/CLI 行为读取 active machine truth
