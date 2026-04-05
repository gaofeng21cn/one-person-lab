# OPL Gateway 契约目录

这个目录是 `One Person Lab` 在当前仓库中的 `G1` federation contract materialization。

它**不是** runtime 实现。
它冻结的是后续 discovery 层与 routed-action 层可消费的 machine-readable gateway surface。

## 上位文档

- [OPL Federation Contract](../../docs/opl-federation-contract.md)
- [OPL Federation Contract（中文）](../../docs/opl-federation-contract.zh-CN.md)
- [OPL Read-Only Discovery Gateway](../../docs/opl-read-only-discovery-gateway.md)
- [OPL Read-Only Discovery Gateway（中文）](../../docs/opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](../../docs/opl-routed-action-gateway.md)
- [OPL Routed Action Gateway（中文）](../../docs/opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](../../docs/opl-domain-onboarding-contract.md)
- [OPL Domain Onboarding Contract（中文）](../../docs/opl-domain-onboarding-contract.zh-CN.md)
- [OPL Governance / Audit Operating Surface](../../docs/opl-governance-audit-operating-surface.md)
- [OPL Governance / Audit Operating Surface（中文）](../../docs/opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](../../docs/opl-publish-promotion-operating-surface.md)
- [OPL Publish / Promotion Operating Surface（中文）](../../docs/opl-publish-promotion-operating-surface.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](../../docs/opl-gateway-acceptance-test-spec.md)
- [OPL Gateway Acceptance Test Spec（中文）](../../docs/opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Gateway Rollout](../../docs/opl-gateway-rollout.md)
- [OPL Gateway Rollout（中文）](../../docs/opl-gateway-rollout.zh-CN.md)
- [OPL Public Surface Index](../../docs/opl-public-surface-index.md)
- [OPL Public Surface Index（中文）](../../docs/opl-public-surface-index.zh-CN.md)
- [English](./README.md)

## 配套示例集

- [OPL Gateway Example Corpus](../../docs/opl-gateway-example-corpus.zh-CN.md) — 展示当前已冻结 gateway layers 如何做 canonical、illustrative 的 contract-level composition
- [OPL Routed-Safety Example Corpus](../../docs/opl-routed-safety-example-corpus.zh-CN.md) — 展示显式非成功 G3 路由状态的 canonical、illustrative safety walkthrough
- [OPL Operating Example Corpus](../../docs/opl-operating-example-corpus.zh-CN.md) — 为已冻结 P5.M1 / P5.M2 surface 提供 canonical 的独立 operating-record example

这三组示例都只是配套参考，不替代本目录中的 governing contracts。

## 文件

- [`workstreams.json`](./workstreams.json) — machine-readable workstream registry
- [`domains.json`](./domains.json) — machine-readable domain registry
- [`routing-vocabulary.json`](./routing-vocabulary.json) — 共享 routing vocabulary 与已冻结的 routing rules
- [`handoff.schema.json`](./handoff.schema.json) — 已冻结的 G1 handoff payload JSON Schema
- [`routed-actions.schema.json`](./routed-actions.schema.json) — 已冻结的 G3 routed action contract JSON Schema
- [`domain-onboarding-readiness.schema.json`](./domain-onboarding-readiness.schema.json) — machine-readable domain onboarding readiness gate 的 JSON Schema
- [`governance-audit.schema.json`](./governance-audit.schema.json) — 已冻结的 P5.M1 governance / audit operating contract JSON Schema
- [`publish-promotion.schema.json`](./publish-promotion.schema.json) — 已冻结的 P5.M2 publish / promotion operating contract JSON Schema
- [`acceptance-matrix.json`](./acceptance-matrix.json) — 已冻结 gateway 与 operating surface 的 declarative acceptance matrix
- [`public-surface-index.json`](./public-surface-index.json) — 当前权威 OPL public surface 与链接 domain public entry 的 machine-readable index

## 已冻结的当前映射

- `research_ops` 路由到 `medautoscience`
- `presentation_ops` 路由到 `redcube`
- `ppt_deck` 直接映射到 `presentation_ops`
- `xiaohongshu` 可以路由到 `redcube`，但不自动等于 `presentation_ops`

## 边界规则

- `OPL` 仍是顶层 gateway 与 federation surface。
- 路由发生后，domain gateway 仍保持独立可用。
- domain harness 始终位于 domain gateway 之下。
- 这个目录不会把 canonical truth ownership 上收给 `OPL`。
- 这个目录不授权绕过 domain gateway 直达 harness。

## 当前范围

这个目录只包含那些在公开 G1 contract 中已经冻结边界的 workstream 与 domain。

`Grant Ops`、`Review Ops`、`Thesis Ops` 等 planned workstream，在对应 domain 边界明确冻结之前，不进入这里。

## Materialization 说明

上层 prose 文档用 `opl/...` 这样的 surface 名表达 canonical contract intent。
这个目录则是在当前仓库中的具体落地，同时保持同一 contract shape。
