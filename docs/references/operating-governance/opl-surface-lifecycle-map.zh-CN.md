[English](./opl-surface-lifecycle-map.md) | **中文**

# OPL Surface Lifecycle Map

State: `support_reference_legacy_derived`
Current owner: `docs/references/operating-governance/README.zh-CN.md`
Machine boundary: 仅作为 legacy-derived 人读参考；当前仓库没有发布 `surface-lifecycle-map.json` 机器可读合同。

## 目的

这份文档保留历史 OPL surface stack 的 legacy-derived lifecycle 词汇。

它的作用是：把 contract、routing、operating、discoverability 与 acceptance surface 串成可遍历的关系图，同时不把这张 map 升格成 workflow engine、transition authority 或第二真相源。

当前 OPL topology 是 stage-led、以 Agent executor 为最小执行单位。Legacy `gateway` id 只作为已归档 traversal/reviewability 标签保留，不是 active compatibility interface。

## 当前机器边界

当前不存在 `contracts/opl-framework/surface-lifecycle-map.json`。当前机器可读行为必须使用 active contracts、source、CLI/API 行为、runtime ledger 和 domain-owned manifest。

## 非目标

这个 lifecycle map 不负责：

- 执行 transition
- 决定 unresolved routing state
- 替代 governing docs、schemas 或 supporting corpora
- 把 canonical truth 上收给 `OPL`
- 授权 `OPL` 直接执行 direct harness access、direct publish、direct release、direct export、direct submission 或 direct posting

## Shared-Foundation Ownership Boundary

这张 lifecycle map 只位于 shared-foundation 的 reference 层。
`OPL` 可以在这里冻结历史依赖与遍历语言，但 transition execution、runtime writeback、review truth 与 publication truth 仍然留在人类 / domain-owned surface 中。
因此，这张 map 可以服务于 review 与 acceptance alignment 的 discoverability，而不会升级成 workflow control plane 或共享 truth store。
更完整的 ownership split 可参考 [OPL Family 开发主参考](../../active/opl-family-development-reference.zh-CN.md)。
当前 topology 以[项目概览](../../project.md)、[当前状态](../../status.md)、[架构](../../architecture.md)和 [OPL stage-led agent framework roadmap](../runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md) 为准。

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

### Core framework contract surfaces

- `opl_gateway_contract_hub`
- `opl_read_only_discovery_gateway`
- `opl_routed_action_gateway`
- `opl_domain_onboarding_contract`

### Activation-package supporting surfaces

- `opl_phase_1_exit_activation_package`
- `opl_minimal_admitted_domain_federation_activation_package`

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
如果某个 surface 是 [OPL Phase 1 Exit Activation Package](../domain-admission/opl-phase-1-exit-activation-package.zh-CN.md) 或 [OPL Minimal admitted-domain federation activation package](../../history/compatibility/gateway-federation/opl-minimal-admitted-domain-federation-activation-package.zh-CN.md)，它也仍然只是 reference-grade activation freeze，不会因此授权 runtime execution、candidate admission，或把 `OPL` 提升成 runtime owner。
如果某个已归档 entry 仍保留 follow-on route boundary，legacy 示例仍可能出现 `domain_gateway`；当前 active surface 必须命名相关 domain-owned capability entry。
如果某个 surface 没有后续动作边界，map 就使用 `null`。
如果某个 surface 是 `opl_candidate_domain_backlog`，这里暴露的依赖链也仍然只是 blocker-oriented 参考关系；它不会授权自动晋升到 onboarding、discovery 或 routing。

## 上位依据

- [OPL Federation Contract](../../history/compatibility/gateway-federation/opl-federation-contract.zh-CN.md)
- [OPL Gateway 契约面](../../history/compatibility/gateway-federation/opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](../../history/compatibility/gateway-federation/opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](../../active/opl-domain-onboarding-contract.zh-CN.md)
- [OPL Candidate Domain Backlog](../domain-admission/opl-candidate-domain-backlog.zh-CN.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.zh-CN.md)
- [OPL Public Surface Index](../../active/opl-public-surface-index.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](../../history/compatibility/gateway-federation/opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Framework Contracts](../../../contracts/opl-framework/README.zh-CN.md)

## 完成定义

只有当下面这些条件都成立时，lifecycle map 才算合格：

- 它覆盖当前真正影响顶层遍历的已冻结 shared-foundation / gateway / operating / supporting surface
- 每个 `requires_surfaces` 与 `enables_surfaces` 目标都能在同一个 lifecycle map 内解析
- 每个 `governing_ref` 都能解析到本地存在的工件
- legacy `follow_on_route_surface` 示例只保留 provenance 语义，不定义 active compatibility value
- 它能与 derived surface authority matrix、derived surface review matrix 一起被发现，但这些 map 都不会升级成执行 surface
- 它保持 derived、reference-only、non-executing
