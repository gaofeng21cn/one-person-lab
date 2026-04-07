[English](./opl-surface-lifecycle-map.md) | **中文**

# OPL Surface Lifecycle Map

## 目的

这份文档索引当前已冻结 `OPL Gateway` surface stack 的 derived machine-readable lifecycle map。

它的作用是：把 contract、routing、operating、discoverability 与 acceptance surface 串成可遍历的关系图，同时不把这张 map 升格成 workflow engine、transition authority 或第二真相源。

## 机器可读工件

- [`.../contracts/opl-gateway/surface-lifecycle-map.json`](.../contracts/opl-gateway/surface-lifecycle-map.json)

## 非目标

这个 lifecycle map 不负责：

- 执行 transition
- 决定 unresolved routing state
- 替代 governing docs、schemas 或 supporting corpora
- 把 canonical truth 上收给 `OPL`
- 授权 `OPL` 直接执行 direct harness access、direct publish、direct release、direct export、direct submission 或 direct posting

## Shared-Foundation Ownership Boundary

这张 lifecycle map 只位于 shared-foundation 的 reference 层。
`OPL` 可以在这里冻结依赖与遍历语言，但 transition execution、runtime writeback、review truth 与 publication truth 仍然留在 gateway 边界之下的人类 / domain-owned surface 中。
因此，这张 map 可以服务于 review 与 acceptance alignment 的 discoverability，而不会升级成 workflow control plane 或共享 truth store。
更完整的 ownership split 可参考[共享基础结构归属](../shared-foundation-ownership.zh-CN.md)。

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

### Shared-foundation boundary surfaces

- `opl_operating_model`
- `opl_shared_foundation`
- `opl_shared_foundation_ownership`

### Core gateway contract surfaces

- `opl_gateway_contract_hub`
- `opl_read_only_discovery_gateway`
- `opl_routed_action_gateway`
- `opl_domain_onboarding_contract`

### Operating surfaces

- `opl_governance_audit_operating_surface`
- `opl_publish_promotion_operating_surface`

### Supporting discoverability / acceptance surfaces

- `opl_candidate_domain_backlog`
- `opl_gateway_example_corpus`
- `opl_routed_safety_example_corpus`
- `opl_operating_example_corpus`
- `opl_operating_record_catalog`
- `opl_public_surface_index_doc`
- `opl_gateway_acceptance_spec`

## 配套 Mapping Surfaces

- [OPL Surface Authority Matrix](./opl-surface-authority-matrix.zh-CN.md)
- [OPL Surface Review Matrix](./opl-surface-review-matrix.zh-CN.md)

## 阅读规则

这张 lifecycle map 必须被理解成 **derived reference graph**，而不是 execution contract。

`requires_surfaces` 与 `enables_surfaces` 只暴露已经冻结的依赖与 discoverability 关系。
它们不会授权自动 transition，也不会替代 prose review。
如果某个 surface 是 `opl_operating_model`、`opl_shared_foundation` 或 `opl_shared_foundation_ownership`，它也仍然只是 shared-foundation boundary 文档，不会因此获得 mutation、transition、review 或 publication authority。
如果某个 entry 仍保留 follow-on route boundary，唯一允许值仍然是 `domain_gateway`。
如果某个 surface 没有后续动作边界，map 就使用 `null`。
如果某个 surface 是 `opl_candidate_domain_backlog`，这里暴露的依赖链也仍然只是 blocker-oriented 参考关系；它不会授权自动晋升到 onboarding、discovery 或 routing。

## 上位依据

- [OPL Federation Contract](../opl-federation-contract.zh-CN.md)
- [OPL 只读 Discovery Gateway](../opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](../opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](../opl-domain-onboarding-contract.zh-CN.md)
- [OPL Candidate Domain Backlog](./opl-candidate-domain-backlog.zh-CN.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.zh-CN.md)
- [OPL Public Surface Index](../opl-public-surface-index.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Gateway Contracts](.../contracts/opl-gateway/README.zh-CN.md)

## 完成定义

只有当下面这些条件都成立时，lifecycle map 才算合格：

- 它覆盖当前真正影响顶层遍历的已冻结 shared-foundation / gateway / operating / supporting surface
- 每个 `requires_surfaces` 与 `enables_surfaces` 目标都能在同一个 lifecycle map 内解析
- 每个 `governing_ref` 都能解析到本地存在的工件
- `follow_on_route_surface` 始终只可能是 `null` 或 `domain_gateway`
- 它能与 derived surface authority matrix、derived surface review matrix 一起被发现，但这些 map 都不会升级成执行 surface
- 它保持 derived、reference-only、non-executing
