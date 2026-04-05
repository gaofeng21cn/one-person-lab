**English** | [中文](./opl-surface-review-matrix.zh-CN.md)

# OPL Surface Review Matrix

## Purpose

This document indexes the derived machine-readable review matrix for the frozen `OPL Gateway` public, contract, and supporting surfaces.

Its job is to make human-review obligations, acceptance coverage, companion review surfaces, and publishability-stage boundaries inspectable from one place without turning the matrix into an approval engine, publish controller, release engine, or second source of truth.

## Machine-Readable Artifact

- [`../contracts/opl-gateway/surface-review-matrix.json`](../contracts/opl-gateway/surface-review-matrix.json)

## Non-Goals

This review matrix does not:

- approve publication
- automate review decisions
- replace governing contracts, docs, or acceptance gates
- transfer domain-owned review or publication authority into `OPL`
- authorize direct publish, direct release, direct export, direct submission, direct posting, or direct harness access by `OPL`

## Shared-Foundation Ownership Boundary

This review matrix sits in the shared-foundation reviewability layer only.
`OPL` may index human-review and companion-surface obligations here, but domain review truth, publication truth, and final continue/stop/reframe authority still remain with humans and domain-owned surfaces.
That keeps the matrix useful for discoverability and acceptance alignment without turning it into an approval control plane or shared truth store.
For the broader ownership split, see [Shared Foundation Ownership](./shared-foundation-ownership.md).

## Review Fields

Each entry stays derived/reference-only and carries only:

- `surface_id`
- `owner_scope`
- `surface_role`
- `human_review_required`
- `required_acceptance_gates`
- `required_companion_surfaces`
- `cross_domain_wording_check`
- `publishability_stage`
- `governing_refs`

## Cross-Domain Wording Check Modes

- `shared_gate_required` — the surface is directly covered by the shared `cross_domain_wording_consistency` gate.
- `local_review_required` — the surface still requires cross-domain wording review, but that check is carried through local governing/companion review rather than by listing the surface directly in the shared gate.

## Publishability Stage Values

These values describe documentation-readiness stage only. They are not workflow states.

- `top_level_positioning_aligned`
- `contract_boundary_aligned`
- `supporting_reference_aligned`
- `acceptance_reference_aligned`

## Current Coverage

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

## Companion Review / Mapping Surfaces

- [OPL Surface Lifecycle Map](./opl-surface-lifecycle-map.md)
- [OPL Surface Authority Matrix](./opl-surface-authority-matrix.md)
- [OPL Public Surface Index](./opl-public-surface-index.md)

## Reading Rule

Read this matrix as a **derived review-boundary index**, not as an approval or publication contract.

`human_review_required` tells reviewers whether explicit human review remains mandatory before the surface is treated as current public gateway material.
`required_acceptance_gates` only references already frozen acceptance gates.
`required_companion_surfaces` only points to already indexed supporting or governing surfaces.
`publishability_stage` tells you which kind of gateway-surface alignment must already exist before the surface is publishable as current public material.
If the covered surface is `opl_operating_model`, `opl_shared_foundation`, or `opl_shared_foundation_ownership`, review coverage stays reference-only and does not turn those surfaces into an approval layer, publish controller, or domain-truth owner.
If the covered surface is `opl_task_map`, under-definition workstreams remain semantic candidates only; they do not become admitted domains or routed targets through review coverage alone.
If the covered surface is `opl_candidate_domain_backlog`, the surface remains a blocker index below the onboarding gate; it does not promote a candidate workstream into a domain, approve onboarding, or create routed readiness.
None of these fields transfer domain review or publication authority into `OPL`.

## Governing Sources

- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.md)
- [OPL Public Surface Index](./opl-public-surface-index.md)
- [OPL Candidate Domain Backlog](./opl-candidate-domain-backlog.md)
- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Gateway Rollout](./opl-gateway-rollout.md)
- [OPL Task Map](./task-map.md)

## Completion Definition

The review matrix is acceptable only when:

- it covers the frozen OPL public, shared-foundation boundary, contract, and supporting surfaces that currently matter for human review and publishability inspection
- every `required_acceptance_gate` resolves inside `../contracts/opl-gateway/acceptance-matrix.json`
- every `required_companion_surface` resolves inside `../contracts/opl-gateway/public-surface-index.json`
- every `governing_ref` resolves to an existing local artifact
- it remains derived, reference-only, and non-executing
- it does not become an approval engine, publish controller, release engine, or second source of truth
