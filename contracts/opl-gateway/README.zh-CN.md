# OPL Gateway 契约目录

这个目录是 `One Person Lab` 在当前仓库中的 `G1` federation contract materialization。

它**不是** runtime 实现。
它冻结的是后续 discovery 层与 routed-action 层可消费的 machine-readable gateway surface。

## Shared-foundation ownership boundary

这些 contract 与 reference 工件只位于 shared-foundation 的 materialization 层。
`OPL` 在这里拥有的是顶层 contract 语言、索引方式与跨域复用规则；一旦 routed request 跨过 gateway 边界，runtime execution、canonical truth、review truth 与 publication truth 仍然由各 domain gateway / harness 持有。
因此，这个目录只是在做 discoverability / reviewability / acceptance alignment 所需的 gateway surface materialization，而不会变成新的 control plane 或共享 truth store。
更完整的 ownership split 可参考[共享基础结构](../../docs/shared-foundation.zh-CN.md)与[共享基础结构归属](../../docs/shared-foundation-ownership.zh-CN.md)。

## 当前 Phase 1 对齐

当前 `opl-mainline` 的 `Phase 1` 目标，是一条本地 `TypeScript CLI`-first、read-only gateway 基线；它只读取这个目录中已经冻结的 contract 工件。
这个交付目标**不会**把当前目录提升成 runtime、routed-action control plane 或 canonical truth store；它只是把已有的顶层 contract language 通过本地 CLI surface 变成可执行入口。

## 上位文档

- [OPL Gateway Federation](../../docs/gateway-federation.md)
- [OPL Gateway Federation（中文）](../../docs/gateway-federation.zh-CN.md)
- [OPL Federation Contract](../../docs/opl-federation-contract.md)
- [OPL Federation Contract（中文）](../../docs/opl-federation-contract.zh-CN.md)
- [OPL Operating Model](../../docs/operating-model.md)
- [OPL Operating Model（中文）](../../docs/operating-model.zh-CN.md)
- [Shared Foundation](../../docs/shared-foundation.md)
- [Shared Foundation（中文）](../../docs/shared-foundation.zh-CN.md)
- [Shared Foundation Ownership](../../docs/shared-foundation-ownership.md)
- [Shared Foundation Ownership（中文）](../../docs/shared-foundation-ownership.zh-CN.md)
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
- [OPL Task Map](../../docs/task-map.md)
- [OPL Task Map（中文）](../../docs/task-map.zh-CN.md)
- [English](./README.md)

## 配套示例集

- [OPL Gateway Example Corpus](../../docs/opl-gateway-example-corpus.zh-CN.md) — 展示当前已冻结 gateway layers 如何做 canonical、illustrative 的 contract-level composition
- [OPL Routed-Safety Example Corpus](../../docs/opl-routed-safety-example-corpus.zh-CN.md) — 展示显式非成功 G3 路由状态的 canonical、illustrative safety walkthrough
- [OPL Operating Example Corpus](../../docs/opl-operating-example-corpus.zh-CN.md) — 为已冻结 P5.M1 / P5.M2 surface 提供 canonical 的独立 operating-record example

这三组示例都只是配套参考，不替代本目录中的 governing contracts。

## 配套参考 Surfaces

- [OPL Candidate Domain Backlog](../../docs/opl-candidate-domain-backlog.zh-CN.md) — 当前 under-definition workstream 的 reference-only machine-readable admission-blocker backlog
- [OPL Surface Lifecycle Map](../../docs/opl-surface-lifecycle-map.zh-CN.md) — 对当前已冻结 gateway / operating / supporting surfaces 的 derived machine-readable lifecycle 视图
- [OPL Surface Authority Matrix](../../docs/opl-surface-authority-matrix.zh-CN.md) — 对当前已冻结 OPL surfaces 与 linked domain public-entry surfaces 的 derived machine-readable authority split
- [OPL Surface Review Matrix](../../docs/opl-surface-review-matrix.zh-CN.md) — 对当前已冻结 OPL public / contract / supporting surfaces 的 derived machine-readable review obligation

这些 backlog 与 mapping surfaces 都只是 reference-only surface。它们不会变成 workflow engine、transition authority、authorization engine、approval engine、publish controller，也不替代本目录中的 governing contracts。

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
- [`task-topology.json`](./task-topology.json) — 覆盖已收录与仍在定义中的 OPL workstream 的 machine-readable 顶层任务版图
- [`candidate-domain-backlog.json`](./candidate-domain-backlog.json) — 当前 under-definition workstream 的 machine-readable admission-blocker backlog
- [`operating-record-catalog.json`](./operating-record-catalog.json) — 已冻结 P5.M1 / P5.M2 operating record kind 的 machine-readable reference catalog
- [`surface-lifecycle-map.json`](./surface-lifecycle-map.json) — 当前已冻结 gateway / operating / supporting surfaces 的 machine-readable derived lifecycle map
- [`surface-authority-matrix.json`](./surface-authority-matrix.json) — 当前已冻结 OPL surfaces 与 linked domain public-entry surfaces 的 machine-readable derived authority matrix
- [`surface-review-matrix.json`](./surface-review-matrix.json) — 当前已冻结 OPL public / contract / supporting surfaces 的 machine-readable derived review matrix

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

这个目录包含两类内容：

- 在公开 G1 contract 中已经冻结边界、并已正式收录的 workstream / domain registry 与 contract 工件
- derived / reference-only 的 task-topology 工件；它们可以提到仍在定义中的 workstream，但不会把这些 workstream 自动纳入 `G1`、`G2` 或 `G3`
- derived / reference-only 的 candidate-domain backlog 工件；它们只记录 admission boundary 还缺什么，不会虚构 placeholder domain 或 routed target
- 在先证明存在真实缺失边界之前，不额外新增独立的 candidate-domain-definition contract surface；当前 `task-topology + candidate-domain-backlog + domain-onboarding` 的组合就是现行定义路径

`Grant Ops`、`Review Ops`、`Thesis Ops` 等 planned workstream，在对应 domain 边界明确冻结之前，不进入正式收录的 registry / discovery / routing surface。

## Materialization 说明

上层 prose 文档用 `opl/...` 这样的 surface 名表达 canonical contract intent。
这个目录则是在当前仓库中的具体落地，同时保持同一 contract shape。
