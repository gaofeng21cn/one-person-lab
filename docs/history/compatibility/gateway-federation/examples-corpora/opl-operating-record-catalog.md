# OPL Operating Record Catalog

## 目的

这份文档索引已冻结 `P5.M1` / `P5.M2` 顶层 operating record kind 的 machine-readable catalog。

它的作用是：在不把 catalog 升格成 runtime manifest 或第二真相源的前提下，把 operating-stage 语义、schema ownership、canonical example ref 与 follow-on routing boundary 集中暴露出来。

## Machine Boundary

当前仓库没有发布 `operating-record-catalog.json` 机器可读合同。本文只是基于 operating examples 与当前 framework contracts 的人读 derived reference。

## 非目标

这个 catalog 不负责：

- 实现执行
- 替代正式 schema 或 prose 文档
- 复述完整的 field-level schema truth
- 拥有 review、publish、promotion 或 public-channel truth
- 授权 `OPL` 直接执行 publish、release、export、submission 或 posting

## Catalog 字段

每个 record-kind entry 都保持 reference-level，只携带：

- `record_kind`
- `surface_layer`
- `governing_surface_id`
- `stage_boundary`
- `truth_mode`
- `schema_ref`
- `example_refs`
- `domain_truth_required`
- `follow_on_route_surface`

## Reference Catalog Coverage

### P5.M1 governance / audit kinds

- `routing_audit`
- `governance_decision`
- `publish_readiness_signal`
- `cross_domain_review_index`

### P5.M2 publish / promotion kinds

- `publish_outcome_index`
- `promotion_candidate_signal`
- `promotion_surface_index`

## 阅读规则

这份 catalog 必须被理解成 **derived reference map**，而不是 governing execution contract。

真正的权威仍然是 governing schema 与 operating-surface prose 文档。
catalog 只是回指这些工件，并记录每种 record kind 何时才算进入有效 stage boundary。
如果后续还存在 action，它必须指向当前 domain-owned capability entry 或 action-route ref。历史 entry 可以为了 provenance 保留 legacy literal `domain_gateway`，但这份 catalog 不把它定义成 active compatibility route。

## 上位依据

- [OPL Governance / Audit Operating Surface](../operating-governance/opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](../operating-governance/opl-publish-promotion-operating-surface.md)
- [OPL Operating Example Corpus](./opl-operating-example-corpus.md)
- [OPL Surface Lifecycle Map](../operating-governance/opl-surface-lifecycle-map.md)
- [OPL Framework Contracts](../../../../../contracts/opl-framework/README.md)
- [OPL Gateway Acceptance Test Spec](../opl-gateway-acceptance-test-spec.md)

## 完成定义

只有当下面这些条件都成立时，operating-record catalog 才算合格：

- 它覆盖全部已冻结 `P5.M1` / `P5.M2` record kind
- 每个 `schema_ref` 与 `example_ref` 都能解析到存在的本地工件
- 它保持 non-executing、reference-only
- 它不把 truth ownership 上收给 `OPL`
- 它让 follow-on route value 对齐当前 domain-owned capability/action-route refs，并且只把 legacy `domain_gateway` 当作 provenance
- 它能被 derived surface lifecycle map 正确发现，但不会因此升级成 execution stage
