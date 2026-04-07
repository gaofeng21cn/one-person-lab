[English](./opl-operating-record-catalog.md) | **中文**

# OPL Operating Record Catalog

## 目的

这份文档索引已冻结 `P5.M1` / `P5.M2` 顶层 operating record kind 的 machine-readable catalog。

它的作用是：在不把 catalog 升格成 runtime manifest 或第二真相源的前提下，把 operating-stage 语义、schema ownership、canonical example ref 与 follow-on routing boundary 集中暴露出来。

## 机器可读工件

- [`../../contracts/opl-gateway/operating-record-catalog.json`](../../contracts/opl-gateway/operating-record-catalog.json)

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

## 当前 Catalog Coverage

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
如果后续还存在 action，它仍然只能通过 `domain_gateway` 路由。

## 上位依据

- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.zh-CN.md)
- [OPL Operating Example Corpus](./opl-operating-example-corpus.zh-CN.md)
- [OPL Surface Lifecycle Map](./opl-surface-lifecycle-map.zh-CN.md)
- [OPL Gateway Contracts](../../contracts/opl-gateway/README.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.zh-CN.md)

## 完成定义

只有当下面这些条件都成立时，operating-record catalog 才算合格：

- 它覆盖全部已冻结 `P5.M1` / `P5.M2` record kind
- 每个 `schema_ref` 与 `example_ref` 都能解析到存在的本地工件
- 它保持 non-executing、reference-only
- 它不把 truth ownership 上收给 `OPL`
- 它把 `domain_gateway` 保持为唯一 follow-on route surface
- 它能被 derived surface lifecycle map 正确发现，但不会因此升级成 execution stage
