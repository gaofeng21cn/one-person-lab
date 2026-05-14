**English** | [中文](./opl-surface-authority-matrix.zh-CN.md)

# OPL Surface Authority Matrix

State: `support_reference_legacy_derived`
Current owner: `docs/references/operating-governance/README.md`
Machine boundary: human-readable legacy-derived reference only; no current machine-readable `surface-authority-matrix.json` contract is published in this repo.

## Purpose

This document preserves the legacy-derived authority matrix vocabulary for the historical OPL surface stack.

Its job is to make routing, execution, truth, review, and publication ownership boundaries inspectable from one place without turning the matrix into an authorization engine, runtime control plane, or second source of truth.

The current OPL topology is stage-led with Agent executors as the minimum execution unit. Surface IDs that still contain `gateway` or `domain_gateway` are historical/reviewability labels from the archived compatibility corpus. Read them as legacy-derived vocabulary only, not as active compatibility interfaces.

## Current Machine Boundary

No current `contracts/opl-framework/surface-authority-matrix.json` exists. Current machine-readable behavior must use the active contracts, source, CLI/API behavior, runtime ledgers, and domain-owned manifests.

## Non-Goals

This authority matrix does not:

- authorize actions
- replace governing contracts or schemas
- transfer domain-owned execution, truth, review, or publication authority into `OPL`
- turn domain public-entry surfaces into OPL internal modules

## Shared-Foundation Ownership Boundary

This authority matrix sits in the shared-foundation boundary-language layer only.
`OPL` owns the top-level vocabulary that names route, execution, truth, review, and publication splits here, but the underlying authorities remain with domain-owned capability entries, domain harnesses, and humans/private surfaces outside `OPL`.
That makes the matrix an inspectable reference surface for ownership review, not a runtime control plane or shared truth store.
For the broader ownership split, see the [OPL Family Development Reference](../../active/opl-family-development-reference.zh-CN.md).
For current topology, read [Project](../../project.md), [Status](../../status.md), [Architecture](../../architecture.md), and the [OPL stage-led agent framework roadmap](../runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md).

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

## Reading Rule

Read this matrix as a **derived authority split**, not as an execution or authorization contract.

When `owner_scope = opl`, the matrix may still expose routing, indexing, discoverability, or acceptance responsibility, but execution authority and domain truth/review/publication authority stay outside `OPL`.
If the surface is `opl_operating_model`, `opl_shared_foundation`, or `opl_shared_foundation_ownership`, every authority field remains boundary-only and does not shift canonical truth, mutation, review truth, or publication truth into `OPL`.
If the surface is the [OPL Phase 1 Exit Activation Package](../domain-admission/opl-phase-1-exit-activation-package.md) or the [OPL Minimal admitted-domain federation activation package](../../history/compatibility/gateway-federation/opl-minimal-admitted-domain-federation-activation-package.md), every authority field also remains `none`; these packages do not admit candidate domains, do not authorize handoff bypass, and do not promote `OPL` into a runtime owner.
When `owner_scope = domain`, the entry marks where domain-local routing and harness execution begin behind a domain-owned capability entry.
Legacy examples may still show `domain_gateway`, but new active surfaces must name the current domain-owned capability entry instead of retaining that value as a compatibility interface.
If the surface is `opl_candidate_domain_backlog`, every authority field remains `none`; the backlog does not grant pre-admission authority over a future domain.

## Companion Mapping Surfaces

- [OPL Surface Lifecycle Map](./opl-surface-lifecycle-map.md)
- [OPL Surface Review Matrix](./opl-surface-review-matrix.md)

## Governing Sources

- [OPL Federation Contract](../../history/compatibility/gateway-federation/opl-federation-contract.md)
- [OPL Gateway Contract Surface](../../history/compatibility/gateway-federation/opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](../../history/compatibility/gateway-federation/opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](../../active/opl-domain-onboarding-contract.md)
- [OPL Candidate Domain Backlog](../domain-admission/opl-candidate-domain-backlog.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.md)
- [OPL Public Surface Index](../../active/opl-public-surface-index.md)
- [OPL Gateway Acceptance Test Spec](../../history/compatibility/gateway-federation/opl-gateway-acceptance-test-spec.md)
- [OPL Framework Contracts](../../../contracts/opl-framework/README.md)

## Completion Definition

The authority matrix is acceptable only when:

- it covers the frozen OPL shared-foundation / historical gateway / operating / supporting surfaces plus the linked domain public-entry surfaces needed for current authority review
- every `governing_ref` resolves to an existing local artifact
- `OPL` surfaces never claim domain execution, canonical-truth, review-truth, or publication-truth authority
- linked domain public-entry surfaces remain domain-owned and do not collapse into OPL internal modules
- it remains discoverable alongside the lifecycle map and surface review matrix without becoming an approval or execution surface
- it remains derived, reference-only, and non-executing
