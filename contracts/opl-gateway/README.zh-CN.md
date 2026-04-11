# OPL Gateway 合同

这个目录是 `One Person Lab` 当前 gateway-owned contract surface 在仓库内的物化层。

它**不**实现 runtime。
它冻结的是当前本地基线、review 流程和 acceptance 检查会读取的 machine-readable gateway surface。

## 所有权边界

这些合同工件只存在于 shared-foundation materialization layer。
`OPL` 持有这里冻结的顶层合同语言、索引与跨域复用规则；但一旦工作越过 gateway 边界，runtime execution、canonical truth、review truth 与 publication truth 仍由 domain gateway 与 domain harness 持有。

因此，这个目录物化的是便于 discoverability、reviewability 与 acceptance alignment 的 gateway surface，而不是：

- runtime
- 新 control plane
- canonical truth store
- 共享 execution framework

## 当前 formal entry 与 `S1` 冻结边界

截至 `2026-04-11`，`OPL` 层的 formal entry 仍然是本地 `TypeScript CLI`-first / read-only gateway baseline；它读取的就是这个目录里已经冻结的 contract 工件。
这条基线运行在当前 `Codex-default host-agent runtime` 之上，当前活跃执行口径仍是 Codex-only，用于规划、实现、验证与评审。

当前 repo-tracked follow-on 是 `S1 / shared runtime substrate v1 contract freeze`。
`S1` 冻结的共享语言包括：

- `runtime profile`
- `session substrate`
- `gateway runtime status`
- `memory provider hook`
- `delivery / cron substrate`
- `approval / interrupt / resume`

这套冻结当前先落在公开文档与 reference-grade 文档层。
它**不**直接进入 `contracts/opl-gateway/*.json`，因为目前还没有被严格证明属于 gateway-owned machine-readable surface，而更像 domain runtime truth。

因此，当前边界是：

- 这个目录冻结 gateway-owned machine-readable surface
- `S1` 先在 JSON 之外冻结顶层 runtime substrate 语言
- runtime 实现与 domain-local truth 继续留在各自的 domain 仓内

## `S1` 的 reference-grade 配套文档

下面这些文档用于说明当前 runtime 口径与下一步 adoption 顺序，但不会把这里升级成第二真相源：

- [OPL 运行模型](../../docs/operating-model.zh-CN.md)
- [Unified Harness Engineering Substrate](../../docs/unified-harness-engineering-substrate.zh-CN.md)
- [OPL Runtime 命名与边界合同](../../docs/opl-runtime-naming-and-boundary-contract.zh-CN.md)
- [Hermes Agent Runtime Substrate 对标与吸收清单](../../docs/references/hermes-agent-runtime-substrate-benchmark.md)
- [OPL 垂类在线 Agent 平台演进蓝图](../../docs/references/opl-vertical-online-agent-platform-roadmap.md)
- [Codex-default Host-Agent Runtime 合同](../../docs/references/host-agent-runtime-contract.md)
- [开发运行模型](../../docs/references/development-operating-model.md)
- [生态状态矩阵](../../docs/references/ecosystem-status-matrix.md)

## 历史 OMX 迁移参考

- [OMX 历史资料索引](../../docs/history/omx/README.zh-CN.md) — 仅历史参考，不是活跃执行入口

## 治理文档

- [OPL 联邦合同](../../docs/opl-federation-contract.zh-CN.md)
- [共享基础结构](../../docs/shared-foundation.zh-CN.md)
- [共享基础结构归属](../../docs/shared-foundation-ownership.zh-CN.md)
- [OPL 只读 Discovery Gateway](../../docs/opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](../../docs/opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](../../docs/opl-domain-onboarding-contract.zh-CN.md)
- [OPL 公开界面索引](../../docs/opl-public-surface-index.zh-CN.md)
- [English](./README.md)

## 文件

- [`workstreams.json`](./workstreams.json) — workstream registry 的 machine-readable 冻结面
- [`domains.json`](./domains.json) — domain registry 的 machine-readable 冻结面
- [`routing-vocabulary.json`](./routing-vocabulary.json) — 冻结的 routing vocabulary 与 routing rule
- [`handoff.schema.json`](./handoff.schema.json) — 冻结 `G1` handoff payload 的 JSON Schema
- [`routed-actions.schema.json`](./routed-actions.schema.json) — planning-level contract artifact，而不是 launcher
- [`domain-onboarding-readiness.schema.json`](./domain-onboarding-readiness.schema.json) — domain onboarding readiness gate 的 JSON Schema
- [`governance-audit.schema.json`](./governance-audit.schema.json) — governance / audit operating contract 的 JSON Schema
- [`publish-promotion.schema.json`](./publish-promotion.schema.json) — publish / promotion operating contract 的 JSON Schema
- [`acceptance-matrix.json`](./acceptance-matrix.json) — gateway 与 operating surface 的 declarative acceptance matrix
- [`public-surface-index.json`](./public-surface-index.json) — authoritative OPL public surface 与 linked domain public entry 的 machine-readable index
- [`task-topology.json`](./task-topology.json) — admitted 与 under-definition workstream 的 machine-readable task topology
- [`candidate-domain-backlog.json`](./candidate-domain-backlog.json) — 当前 under-definition workstream 的 admission-blocker backlog
- [`phase-1-exit-activation-package.json`](./phase-1-exit-activation-package.json) — 之前 `Phase 1` exit package 的 machine-readable 历史冻结面
- [`minimal-admitted-domain-federation-activation-package.json`](./minimal-admitted-domain-federation-activation-package.json) — minimal admitted-domain federation package 的 machine-readable 历史冻结面
- [`operating-record-catalog.json`](./operating-record-catalog.json) — operating record kind 的 machine-readable 参考目录
- [`surface-lifecycle-map.json`](./surface-lifecycle-map.json) — derived lifecycle map
- [`surface-authority-matrix.json`](./surface-authority-matrix.json) — derived authority matrix
- [`surface-review-matrix.json`](./surface-review-matrix.json) — derived review matrix

## 边界规则

- `OPL` 继续是顶层 gateway 与 federation surface。
- domain gateway 在完成 routing 后仍保持独立可用。
- domain harness 继续位于 domain gateway 之下。
- 这个目录不会在 domain 之上新建 canonical truth ownership。
- 这个目录不会授权绕过 domain gateway 直接命中 harness。
- 这个目录不会把 `OPL` 提升成 runtime owner。

## 当前范围

这个目录当前包含：

- 已冻结边界的 workstream 与 domain 的 admitted registry 和 gateway-owned contract artifact
- 可能提及 under-definition workstream 的 derived / reference-only topology material，但不会因此把它们吸收进 `G1`、`G2` 或 `G3`
- 在 gateway ownership 被证明之前，不直接物化 `shared runtime substrate v1` 的 machine-readable 面

`Grant Foundry -> Med Auto Grant` 继续只代表 top-level signal / future direction evidence。
它不是已 admitted 的 domain gateway，在 `OPL` 层也不满足 `G2` discovery readiness、`G3` routed-action readiness 或 handoff-ready surface。

## 物化说明

公开文档里的 `opl/...` surface name 描述的是规范合同语义。
这个目录是在当前仓库里的具体物化，同时保持相同的合同形状。
