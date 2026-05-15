# OPL Surface Authority Matrix

State: `support_reference_legacy_derived`
Current owner: `docs/references/operating-governance/README.md`
Machine boundary: 仅作为 legacy-derived 人读参考；当前仓库没有发布 `surface-authority-matrix.json` 机器可读合同。

## 目的

这份文档保留历史 OPL surface stack 的 legacy-derived authority matrix 词汇。

它的作用是：把 routing、execution、truth、review 与 publication ownership boundary 集中暴露出来，同时不把这张 matrix 升格成 authorization engine、runtime control plane 或第二真相源。

当前 OPL topology 是 stage-led、以 Agent executor 为最小执行单位。仍包含 `gateway` 或 `domain_gateway` 的 surface id 是来自已归档 compatibility corpus 的历史/reviewability 标签。请只按 legacy-derived vocabulary 阅读，不要理解成 active compatibility interface。

## 当前机器边界

当前不存在 `contracts/opl-framework/surface-authority-matrix.json`。当前机器可读行为必须使用 active contracts、source、CLI/API 行为、runtime ledger 和 domain-owned manifest。

## 非目标

这个 authority matrix 不负责：

- 授权动作执行
- 替代 governing contracts 或 schemas
- 把 domain-owned execution、truth、review 或 publication authority 上收给 `OPL`
- 把 domain public-entry surface 写成 OPL 的内部模块

## Shared-Foundation Ownership Boundary

这张 authority matrix 只位于 shared-foundation 的 boundary-language 层。
`OPL` 在这里拥有的是命名 route、execution、truth、review 与 publication 分工的顶层词汇；但底层 authority 仍然留在 domain-owned capability entry、domain harness 与 `OPL` 之外的人类 / private surface 中。
因此，这张 matrix 只是供 ownership review 使用的 inspectable reference surface，而不是 runtime control plane 或共享 truth store。
更完整的 ownership split 可参考 [OPL Family 开发主参考](../../active/opl-family-development-reference.md)。
当前 topology 以[项目概览](../../project.md)、[当前状态](../../status.md)、[架构](../../architecture.md)和 [OPL stage-led agent framework roadmap](../runtime-substrate/opl-stage-led-agent-framework-roadmap.md) 为准。

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
- `opl_phase_1_exit_activation_package`
- `opl_minimal_admitted_domain_federation_activation_package`
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

- `medautogrant_public_gateway`
- `medautoscience_public_gateway`
- `redcube_public_gateway`

## 阅读规则

这张 matrix 必须被理解成 **derived authority split**，而不是 execution contract 或 authorization contract。

当 `owner_scope = opl` 时，这张 matrix 可以暴露 routing、indexing、discoverability 或 acceptance 责任，但 execution authority 与 domain truth/review/publication authority 仍留在 `OPL` 之外。
如果某个 surface 是 `opl_operating_model`、`opl_shared_foundation` 或 `opl_shared_foundation_ownership`，那么其中全部 authority 字段也都只能表达 boundary 约束，而不会把 canonical truth、mutation、review truth 或 publication truth 上收到 `OPL`。
如果某个 surface 是 [OPL Phase 1 Exit Activation Package](../domain-admission/opl-phase-1-exit-activation-package.md) 或 [OPL Minimal admitted-domain federation activation package](../../history/compatibility/gateway-federation/opl-minimal-admitted-domain-federation-activation-package.md)，那么其中全部 authority 字段也同样只能保持 `none`；这些 package 不会 admission candidate domain、不会授权 handoff bypass，也不会把 `OPL` 提升成 runtime owner。
当 `owner_scope = domain` 时，对应 entry 只是在标记：domain-local routing 与 harness execution 从哪个 domain-owned capability entry 开始。
Legacy 示例仍可能出现 `domain_gateway`，但新增 active surface 必须命名当前 domain-owned capability entry，不能继续把这个值保留成 compatibility interface。
如果某个 surface 是 `opl_candidate_domain_backlog`，那么所有 authority 字段都仍然只能是 `none`；这份 backlog 不会给未来 domain 预分配 authority。

## 配套 Mapping Surfaces

- [OPL Surface Lifecycle Map](./opl-surface-lifecycle-map.md)
- [OPL Surface Review Matrix](./opl-surface-review-matrix.md)

## 上位依据

- [OPL Federation Contract](../../history/compatibility/gateway-federation/opl-federation-contract.md)
- [OPL Gateway 契约面](../../history/compatibility/gateway-federation/opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](../../history/compatibility/gateway-federation/opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](../../specs/opl-domain-onboarding-contract.md)
- [OPL Candidate Domain Backlog](../domain-admission/opl-candidate-domain-backlog.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.md)
- [OPL Public Surface Index](../../product/opl-public-surface-index.md)
- [OPL Gateway Acceptance Test Spec](../../history/compatibility/gateway-federation/opl-gateway-acceptance-test-spec.md)
- [OPL Framework Contracts](../../../contracts/opl-framework/README.md)

## 完成定义

只有当下面这些条件都成立时，authority matrix 才算合格：

- 它覆盖当前 authority review 所需的已冻结 OPL shared-foundation / historical gateway / operating / supporting surface，加上 linked domain public-entry surface
- 每个 `governing_ref` 都能解析到本地存在的工件
- `OPL` surface 从不宣称 domain execution authority、canonical-truth authority、review-truth authority 或 publication-truth authority
- linked domain public-entry surface 仍保持 domain-owned，不会塌缩成 OPL 内部模块
- 它能与 lifecycle map、surface review matrix 一起被发现，但不会升级成 approval surface 或 execution surface
- 它保持 derived、reference-only、non-executing
