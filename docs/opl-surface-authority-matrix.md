**English** | [中文](./opl-surface-authority-matrix.zh-CN.md)

# OPL Surface Authority Matrix

## Purpose

This document indexes the derived machine-readable authority matrix for the frozen `OPL Gateway` surface stack.

Its job is to make routing, execution, truth, review, and publication ownership boundaries inspectable from one place without turning the matrix into an authorization engine, runtime control plane, or second source of truth.

## Machine-Readable Artifact

- [`../contracts/opl-gateway/surface-authority-matrix.json`](../contracts/opl-gateway/surface-authority-matrix.json)

## Non-Goals

This authority matrix does not:

- authorize actions
- replace governing contracts or schemas
- transfer domain-owned execution, truth, review, or publication authority into `OPL`
- turn domain public-entry surfaces into OPL internal modules

## Shared-Foundation Ownership Boundary

This authority matrix sits in the shared-foundation boundary-language layer only.
`OPL` owns the top-level vocabulary that names route, execution, truth, review, and publication splits here, but the underlying authorities remain where the matrix says they remain: domain gateways, domain harnesses, and humans/private surfaces outside `OPL`.
That makes the matrix an inspectable reference surface for ownership review, not a runtime control plane or shared truth store.
For the broader ownership split, see [Shared Foundation Ownership](./shared-foundation-ownership.md).

## Authority Fields

Each entry stays derived/reference-only and carries only:

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

## Current Coverage

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

## Reading Rule

Read this matrix as a **derived authority split**, not as an execution or authorization contract.

When `owner_scope = opl`, the matrix may still expose routing, indexing, discoverability, or acceptance responsibility, but execution authority and domain truth/review/publication authority stay outside `OPL`.
When `owner_scope = domain`, the entry marks where domain-local routing and harness execution begin behind the domain gateway boundary.
If a follow-on surface exists, the only allowed value remains `domain_gateway`.
If the surface is `opl_candidate_domain_backlog`, every authority field remains `none`; the backlog does not grant pre-admission authority over a future domain.

## Companion Mapping Surfaces

- [OPL Surface Lifecycle Map](./opl-surface-lifecycle-map.md)
- [OPL Surface Review Matrix](./opl-surface-review-matrix.md)

## Governing Sources

- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Read-Only Discovery Gateway](./opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md)
- [OPL Candidate Domain Backlog](./opl-candidate-domain-backlog.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.md)
- [OPL Public Surface Index](./opl-public-surface-index.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)

## Completion Definition

The authority matrix is acceptable only when:

- it covers the frozen OPL surfaces plus the linked domain public-entry surfaces needed for current authority review
- every `governing_ref` resolves to an existing local artifact
- `OPL` surfaces never claim domain execution, canonical-truth, review-truth, or publication-truth authority
- linked domain public-entry surfaces remain domain-owned and do not collapse into OPL internal modules
- it remains discoverable alongside the lifecycle map and surface review matrix without becoming an approval or execution surface
- it remains derived, reference-only, and non-executing
