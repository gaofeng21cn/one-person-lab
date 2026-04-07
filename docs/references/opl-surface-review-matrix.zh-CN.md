[English](./opl-surface-review-matrix.md) | **中文**

# OPL Surface Review Matrix

## 目的

这份文档索引当前已冻结 `OPL Gateway` public / contract / supporting surfaces 的 derived machine-readable review matrix。

它的作用是：把 human-review obligation、acceptance coverage、配套 review surface，以及 publishability-stage boundary 集中暴露出来，同时不把这张 matrix 升格成 approval engine、publish controller、release engine 或第二真相源。

## 机器可读工件

- [`.../contracts/opl-gateway/surface-review-matrix.json`](.../contracts/opl-gateway/surface-review-matrix.json)

## 非目标

这个 review matrix 不负责：

- 批准发布
- 自动化 review 决策
- 替代 governing contracts、docs 或 acceptance gates
- 把 domain-owned review 或 publication authority 上收给 `OPL`
- 授权 `OPL` 直接执行 direct publish、direct release、direct export、direct submission、direct posting 或 direct harness access

## Shared-Foundation Ownership Boundary

这张 review matrix 只位于 shared-foundation 的 reviewability 层。
`OPL` 可以在这里索引 human-review 义务与 companion-surface 关系，但 domain review truth、publication truth，以及最终的 continue/stop/reframe authority 仍然留在人类与 domain-owned surface 手中。
因此，这张 matrix 能服务于 discoverability 与 acceptance alignment，而不会升级成 approval control plane 或共享 truth store。
更完整的 ownership split 可参考[共享基础结构归属](../shared-foundation-ownership.zh-CN.md)。

## Review 字段

每个 entry 都保持 derived/reference-only，只携带：

- `surface_id`
- `owner_scope`
- `surface_role`
- `human_review_required`
- `required_acceptance_gates`
- `required_companion_surfaces`
- `cross_domain_wording_check`
- `publishability_stage`
- `governing_refs`

## Cross-Domain Wording Check 模式

- `shared_gate_required` — 这个 surface 直接纳入共享 `cross_domain_wording_consistency` gate。
- `local_review_required` — 这个 surface 仍然需要 cross-domain wording review，但该检查通过本地 governing/companion review 承担，而不是直接列进共享 gate 文件列表。

## Publishability Stage 取值

这些取值只描述 documentation-readiness stage，不是 workflow state。

- `top_level_positioning_aligned`
- `contract_boundary_aligned`
- `supporting_reference_aligned`
- `acceptance_reference_aligned`

## 当前 Coverage

### Top-level public-entry surfaces

- `opl_public_readme`
- `opl_roadmap`
- `opl_gateway_rollout`
- `opl_task_map`

### Shared-foundation boundary surfaces

- `opl_operating_model`
- `opl_shared_foundation`
- `opl_shared_foundation_ownership`

### Governing contract surfaces

- `opl_federation_contract`
- `opl_gateway_contract_hub`
- `opl_read_only_discovery_gateway`
- `opl_routed_action_gateway`
- `opl_domain_onboarding_contract`
- `opl_governance_audit_operating_surface`
- `opl_publish_promotion_operating_surface`

### Supporting review / discoverability surfaces

- `opl_candidate_domain_backlog`
- `opl_gateway_example_corpus`
- `opl_routed_safety_example_corpus`
- `opl_operating_example_corpus`
- `opl_operating_record_catalog`
- `opl_surface_lifecycle_map`
- `opl_surface_authority_matrix`
- `opl_public_surface_index_doc`
- `opl_gateway_acceptance_spec`

## 配套 Review / Mapping Surfaces

- [OPL Surface Lifecycle Map](./opl-surface-lifecycle-map.zh-CN.md)
- [OPL Surface Authority Matrix](./opl-surface-authority-matrix.zh-CN.md)
- [OPL Public Surface Index](../opl-public-surface-index.zh-CN.md)

## 阅读规则

这张 matrix 必须被理解成 **derived review-boundary index**，而不是 approval contract 或 publication contract。

`human_review_required` 只是在告诉 reviewer：这个 surface 要被当成当前 public gateway material 之前，是否仍需要显式 human review。
`required_acceptance_gates` 只引用已经冻结的 acceptance gate。
`required_companion_surfaces` 只指向已经被索引的 supporting 或 governing surface。
`publishability_stage` 只说明：一个 surface 在被当成当前 public material 之前，需要先满足哪一类 gateway-surface alignment。
如果被覆盖的 surface 是 `opl_operating_model`、`opl_shared_foundation` 或 `opl_shared_foundation_ownership`，那么这些 review coverage 也仍然只是 reference-only，不会把它们升级成 approval layer、publish controller，或 domain-truth owner。
如果被覆盖的 surface 是 `opl_task_map`，那么其中仍在定义中的 workstream 也只保持语义候选身份，不会因为被纳入 review coverage 就自动变成正式收录 domain 或 routed target。
如果被覆盖的 surface 是 `opl_candidate_domain_backlog`，那么它也只是一张位于 onboarding gate 之下的 blocker index，不会把 candidate workstream 升格成 domain，也不会批准 onboarding 或创造 routed readiness。
这些字段都不会把 domain review 或 publication authority 上收给 `OPL`。

## 上位依据

- [OPL Gateway Contracts](.../contracts/opl-gateway/README.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Public Surface Index](../opl-public-surface-index.zh-CN.md)
- [OPL Candidate Domain Backlog](./opl-candidate-domain-backlog.zh-CN.md)
- [OPL Federation Contract](../opl-federation-contract.zh-CN.md)
- [OPL Gateway 落地路线](./opl-gateway-rollout.zh-CN.md)
- [OPL 任务版图](../task-map.zh-CN.md)

## 完成定义

只有当下面这些条件都成立时，review matrix 才算合格：

- 它覆盖当前 human review 与 publishability inspection 所需的全部已冻结 OPL public / shared-foundation boundary / contract / supporting surface
- 每个 `required_acceptance_gate` 都能在 `.../contracts/opl-gateway/acceptance-matrix.json` 中解析
- 每个 `required_companion_surface` 都能在 `.../contracts/opl-gateway/public-surface-index.json` 中解析
- 每个 `governing_ref` 都能解析到存在的本地工件
- 它保持 derived、reference-only、non-executing
- 它不会升级成 approval engine、publish controller、release engine 或第二真相源
