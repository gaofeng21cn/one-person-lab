[English](./opl-surface-authority-matrix.md) | **中文**

# OPL Surface Authority Matrix

## 目的

这份文档索引当前已冻结 `OPL Gateway` surface stack 的 derived machine-readable authority matrix。

它的作用是：把 routing、execution、truth、review 与 publication ownership boundary 集中暴露出来，同时不把这张 matrix 升格成 authorization engine、runtime control plane 或第二真相源。

## 机器可读工件

- [`../../contracts/opl-gateway/surface-authority-matrix.json`](../../contracts/opl-gateway/surface-authority-matrix.json)

## 非目标

这个 authority matrix 不负责：

- 授权动作执行
- 替代 governing contracts 或 schemas
- 把 domain-owned execution、truth、review 或 publication authority 上收给 `OPL`
- 把 domain public-entry surface 写成 OPL 的内部模块

## Shared-Foundation Ownership Boundary

这张 authority matrix 只位于 shared-foundation 的 boundary-language 层。
`OPL` 在这里拥有的是命名 route、execution、truth、review 与 publication 分工的顶层词汇；但底层 authority 仍然留在 matrix 已明确标出的 domain gateway、domain harness 与 `OPL` 之外的人类 / private surface 中。
因此，这张 matrix 只是供 ownership review 使用的 inspectable reference surface，而不是 runtime control plane 或共享 truth store。
更完整的 ownership split 可参考[共享基础结构归属](../shared-foundation-ownership.zh-CN.md)。

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

### Shared-foundation boundary surfaces

- `opl_operating_model`
- `opl_shared_foundation`
- `opl_shared_foundation_ownership`

### OPL contract / operating / supporting surfaces

- `opl_gateway_contract_hub`
- `opl_read_only_discovery_gateway`
- `opl_routed_action_gateway`
- `opl_domain_onboarding_contract`
- `opl_candidate_domain_backlog`
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

当 `owner_scope = opl` 时，这张 matrix 可以暴露 routing、indexing、discoverability 或 acceptance 责任，但 execution authority 与 domain truth/review/publication authority 仍留在 `OPL` 之外。
如果某个 surface 是 `opl_operating_model`、`opl_shared_foundation` 或 `opl_shared_foundation_ownership`，那么其中全部 authority 字段也都只能表达 boundary 约束，而不会把 canonical truth、mutation、review truth 或 publication truth 上收到 `OPL`。
当 `owner_scope = domain` 时，对应 entry 只是在标记：domain-local routing 与 harness execution 从哪里开始，且它们都位于 domain gateway 边界之后。
如果存在 follow-on surface，允许值也仍然只有 `domain_gateway`。
如果某个 surface 是 `opl_candidate_domain_backlog`，那么所有 authority 字段都仍然只能是 `none`；这份 backlog 不会给未来 domain 预分配 authority。

## 配套 Mapping Surfaces

- [OPL Surface Lifecycle Map](./opl-surface-lifecycle-map.zh-CN.md)
- [OPL Surface Review Matrix](./opl-surface-review-matrix.zh-CN.md)

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
- [OPL Gateway Contracts](../../contracts/opl-gateway/README.zh-CN.md)

## 完成定义

只有当下面这些条件都成立时，authority matrix 才算合格：

- 它覆盖当前 authority review 所需的已冻结 OPL shared-foundation / gateway / operating / supporting surface，加上 linked domain public-entry surface
- 每个 `governing_ref` 都能解析到本地存在的工件
- `OPL` surface 从不宣称 domain execution authority、canonical-truth authority、review-truth authority 或 publication-truth authority
- linked domain public-entry surface 仍保持 domain-owned，不会塌缩成 OPL 内部模块
- 它能与 lifecycle map、surface review matrix 一起被发现，但不会升级成 approval surface 或 execution surface
- 它保持 derived、reference-only、non-executing
