[English](./opl-surface-lifecycle-map.md) | **中文**

# OPL Surface Lifecycle Map

## 目的

这份文档索引当前已冻结 `OPL Gateway` surface stack 的 derived machine-readable lifecycle map。

它的作用是：把 contract、routing、operating、discoverability 与 acceptance surfaces 集中串起来，同时不把这张 map 升格成 workflow engine、transition authority 或第二真相源。

## 机器可读工件

- [`../contracts/opl-gateway/surface-lifecycle-map.json`](../contracts/opl-gateway/surface-lifecycle-map.json)

## 非目标

这个 lifecycle map 不负责：

- 执行 transition
- 替 unresolved routing state 做决策
- 替代 governing docs、schemas 或 supporting corpora
- 把 canonical truth 上收给 `OPL`
- 绝不授权 `OPL` 执行 direct harness access、direct publish、direct release、direct export、direct submission 或 direct posting

## Lifecycle 字段

每个 entry 都保持 derived/reference-only，只携带：

- `surface_id`
- `layer_id`
- `control_mode`
- `truth_mode`
- `requires_surfaces`
- `enables_surfaces`
- `follow_on_route_surface`
- `governing_refs`

## 当前 Coverage

### Core gateway contract surfaces

- `opl_gateway_contract_hub`
- `opl_read_only_discovery_gateway`
- `opl_routed_action_gateway`
- `opl_domain_onboarding_contract`

### Operating surfaces

- `opl_governance_audit_operating_surface`
- `opl_publish_promotion_operating_surface`

### Supporting discoverability / acceptance surfaces

- `opl_gateway_example_corpus`
- `opl_routed_safety_example_corpus`
- `opl_operating_example_corpus`
- `opl_operating_record_catalog`
- `opl_public_surface_index_doc`
- `opl_gateway_acceptance_spec`

## 配套 Mapping Surface

- [OPL Surface Authority Matrix](./opl-surface-authority-matrix.zh-CN.md)

## 阅读规则

这张 lifecycle map 必须被理解成 **derived reference graph**，而不是 execution contract。

`requires_surfaces` 与 `enables_surfaces` 只暴露已冻结的 dependency / discoverability relationship。
它们不授权 automatic transition，也不替代 prose review。
只要某个 entry 还保留 follow-on route boundary，唯一允许的值就仍然是 `domain_gateway`。
如果某个 surface 本身不对应 follow-on action，map 就使用 `null`。

## 上位依据

- [OPL Federation Contract](./opl-federation-contract.zh-CN.md)
- [OPL 只读 Discovery Gateway](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.zh-CN.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.zh-CN.md)
- [OPL Public Surface Index](./opl-public-surface-index.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.zh-CN.md)

## 完成定义

只有当下面这些条件都成立时，lifecycle map 才算合格：

- 它覆盖当前顶层 traversal 所需的全部已冻结 gateway / operating / supporting surfaces
- 每个 `requires_surfaces` 与 `enables_surfaces` 目标都能在同一个 lifecycle map 中解析
- 每个 `governing_ref` 都能解析到存在的本地工件
- `follow_on_route_surface` 始终只能是 `null` 或 `domain_gateway`
- 它能与 derived surface authority matrix 一起被发现，但两者都不会升级成 execution surface
- 它保持 derived、reference-only、non-executing
