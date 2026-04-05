[English](./opl-surface-authority-matrix.md) | **中文**

# OPL Surface Authority Matrix

## 目的

这份文档索引当前已冻结 `OPL Gateway` surface stack 的 derived machine-readable authority matrix。

它的作用是：把 routing、execution、truth、review 与 publication ownership boundary 集中暴露出来，同时不把这张 matrix 升格成 authorization engine、runtime control plane 或第二真相源。

## 机器可读工件

- [`../contracts/opl-gateway/surface-authority-matrix.json`](../contracts/opl-gateway/surface-authority-matrix.json)

## 非目标

这个 authority matrix 不负责：

- 授权动作执行
- 替代 governing contracts 或 schemas
- 把 domain-owned execution、truth、review 或 publication authority 上收给 `OPL`
- 把 domain public-entry surface 写成 OPL internal module

## Authority 字段

每个 entry 都保持 derived/reference-only，只携带：

- `surface_id`
- `owner_scope`
- `surface_role`
- `route_authority`
- `execution_authority`
- `truth_authority`
- `review_authority`
- `publication_authority`
- `allowed_follow_on_surface`
- `forbidden_actions`
- `governing_refs`

## 当前 Coverage

### OPL contract / operating / supporting surfaces

- `opl_gateway_contract_hub`
- `opl_read_only_discovery_gateway`
- `opl_routed_action_gateway`
- `opl_domain_onboarding_contract`
- `opl_governance_audit_operating_surface`
- `opl_publish_promotion_operating_surface`
- `opl_gateway_example_corpus`
- `opl_routed_safety_example_corpus`
- `opl_operating_example_corpus`
- `opl_operating_record_catalog`
- `opl_surface_lifecycle_map`
- `opl_public_surface_index_doc`
- `opl_gateway_acceptance_spec`

### Linked domain public-entry surfaces

- `medautoscience_public_gateway`
- `redcube_public_gateway`

## 阅读规则

这张 matrix 必须被理解成 **derived authority split**，而不是 execution contract 或 authorization contract。

只要 `owner_scope = opl`，它最多只是暴露 routing、indexing、discoverability 或 acceptance 责任，execution authority 与 domain truth/review/publication authority 仍然留在 `OPL` 之外。
只要 `owner_scope = domain`，这个 entry 就是在标记：domain-local routing 与 harness execution 从 domain gateway 边界之后开始。
如果某个 surface 还保留 follow-on surface，唯一允许的值仍然是 `domain_gateway`。

## 配套 Mapping Surface

- [OPL Surface Lifecycle Map](./opl-surface-lifecycle-map.zh-CN.md)

## 上位依据

- [OPL Federation Contract](./opl-federation-contract.zh-CN.md)
- [OPL 只读 Discovery Gateway](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.zh-CN.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.zh-CN.md)
- [OPL Public Surface Index](./opl-public-surface-index.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.zh-CN.md)

## 完成定义

只有当下面这些条件都成立时，authority matrix 才算合格：

- 它覆盖当前 authority review 所需的已冻结 OPL surface 与 linked domain public-entry surface
- 每个 `governing_ref` 都能解析到存在的本地工件
- `OPL` surfaces 不会声称自己拥有 domain execution、canonical-truth、review-truth 或 publication-truth authority
- linked domain public-entry surfaces 仍保持 domain-owned，不会坍缩成 OPL internal module
- 它保持 derived、reference-only、non-executing
