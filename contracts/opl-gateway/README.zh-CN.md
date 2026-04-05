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
- [OPL Governance / Audit Operating Surface](../../docs/opl-governance-audit-operating-surface.md)
- [OPL Governance / Audit Operating Surface（中文）](../../docs/opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Gateway Rollout](../../docs/opl-gateway-rollout.md)
- [OPL Gateway Rollout（中文）](../../docs/opl-gateway-rollout.zh-CN.md)
- [English](./README.md)

## 文件

- [`workstreams.json`](./workstreams.json) — machine-readable workstream registry
- [`domains.json`](./domains.json) — machine-readable domain registry
- [`routing-vocabulary.json`](./routing-vocabulary.json) — 共享 routing vocabulary 与已冻结的 routing rules
- [`handoff.schema.json`](./handoff.schema.json) — 已冻结的 G1 handoff payload JSON Schema
- [`routed-actions.schema.json`](./routed-actions.schema.json) — 已冻结的 G3 routed action contract JSON Schema
- [`governance-audit.schema.json`](./governance-audit.schema.json) — 已冻结的 P5.M1 governance / audit operating contract JSON Schema

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
