# Family Orchestration 合同

[English](./README.md) | **中文**

Owner: `OPL Framework`
Purpose: `family_orchestration_contract_support_index`
State: `active_support`

本文帮助领域 Package 维护者定位共享 payload schema。Framework 持有交换形状，domain owner 保留底层内容、判断和已授权副作用。[共享领域合同](../../docs/specs/shared-domain-contract.md)解释这一分工。

## 发现入口

从 [family-product-entry-manifest-v2.schema.json](./family-product-entry-manifest-v2.schema.json) 阅读 product-entry discovery。manifest 定位 action catalog、generated Stage control plane、连续性投影和可选 companion surface。其 locator 定义限定可接受的 source kind 与路径；domain-owned Stage manifest 是 Framework compiler 的输入。

对应 consumer 是 [descriptor normalizer](../../src/read-models/catalog/domain-manifest/normalizers.ts) 和 [domain pack compiler](../../src/authority/packages/domain-pack-compiler/repo-contract-descriptor.ts)。公开检查入口为 `opl agents descriptors --json` 或 `opl agents descriptor --domain <domain> --json`；本页不维护固定 Agent 或仓库名单。

## Payload 导航

每行对应一种交换职责。required field、allowed value 和 authority flag 由链接的 schema 定义，不在文字清单中重复维护。

| 交换职责 | Schema 入口 |
| --- | --- |
| 可调用 action 与声明式拓扑 | [Action catalog](./family-action-catalog.schema.json)、[action graph](./family-action-graph.schema.json) |
| Stage descriptor 与静态 conformance | [Stage control plane](./family-stage-control-plane.schema.json)、[conformance](./family-stage-conformance.schema.json) |
| Stage pack 证据与 graph 投影 | [Proof bundle](./family-stage-proof-bundle.schema.json)、[graph projection](./family-stage-graph-projection.schema.json)、[integrity metadata](./family-stage-integrity-metadata.schema.json) |
| Stage pack source 与生命周期引用 | [Pack registry](./family-stage-pack-registry.schema.json)、[source spec](./family-stage-pack-source-spec.schema.json)、[replay certification](./family-stage-replay-certification.schema.json) |
| 建议性诊断 | [Assumption lifecycle](./family-stage-assumption-lifecycle.schema.json)、[cohort loop](./family-stage-cohort-loop.schema.json)、[runtime budget](./family-stage-runtime-budget.schema.json)、[candidate portfolio](./stage-candidate-portfolio.schema.json) |
| event、checkpoint 与 StageRun 证据引用 | [Event envelope](./family-event-envelope.schema.json)、[checkpoint lineage](./family-checkpoint-lineage.schema.json)、[StageRun evidence pack](./stage-run-evidence-pack.schema.json) |
| owner decision、human gate 与冲突交换 | [Owner route](./family-owner-route.schema.json)、[human gate](./family-human-gate.schema.json)、[conflict envelope](./family-conflict-envelope.schema.json) |
| persistence 角色与 lifecycle receipt | [Persistence policy](./family-persistence-policy.schema.json)、[lifecycle ledger](./family-lifecycle-ledger.schema.json) |
| 只读 runtime supervision | [Runtime supervision](./family-runtime-supervision.schema.json) |
| domain memory 引用与 writeback 交换 | [Memory ref](./family-domain-memory-ref.schema.json)、[memory writeback](./family-domain-memory-writeback.schema.json) |

## 结合运行时 owner 阅读

共享 graph、conformance report、proof bundle 或 supervision projection 本身不执行 Stage，也不决定专业路线。decisive Attempt、controller、质量债与启动边界见 [Stage graph 和路由运输](../../docs/runtime/stage-graph-route-transition-runtime.md)；机器 owner 是 [stage-route-transport-contract.json](../opl-framework/stage-route-transport-contract.json) 及 [Stage quality cycle contract](../opl-framework/stage-quality-cycle-contract.json)。

Temporal 执行与 state index 分工见[共享运行合同](../../docs/specs/shared-runtime-contract.md)。memory 交换遵循 [advisory knowledge boundary](../opl-framework/advisory-knowledge-boundary-contract.json)；引用和 writeback receipt 不把 memory body ownership 或 accept/reject authority 转移给 Framework。

实际接入遵循 [Standard Agent 接口](../../docs/specs/standard-agent-interface.md)和[实现指南](../../docs/specs/standard-domain-agent-implementation.md)。descriptor 可读、静态 conformance 和 provider completed 只证明各自范围；domain acceptance 和 App 发布决定仍需对应 owner。

runtime、Package、Workspace、App 和交付合同回到 [Framework 合同导航](../opl-framework/README.zh-CN.md)。本双语索引遵循[文档生命周期政策](../../docs/policies/docs-lifecycle-policy.md)。
