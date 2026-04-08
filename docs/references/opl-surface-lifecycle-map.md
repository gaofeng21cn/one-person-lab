**English** | [中文](./opl-surface-lifecycle-map.zh-CN.md)

# OPL Surface Lifecycle Map

## Purpose

This document indexes the derived machine-readable lifecycle map for the frozen `OPL Gateway` surface stack.

Its job is to make contract, routing, operating, discoverability, and acceptance surfaces traversable from one place without turning the map into a workflow engine, transition authority, or second source of truth.

## Machine-Readable Artifact

- [`../../contracts/opl-gateway/surface-lifecycle-map.json`](../../contracts/opl-gateway/surface-lifecycle-map.json)

## Non-Goals

This lifecycle map does not:

- execute transitions
- decide unresolved routing states
- replace the governing docs, schemas, or supporting corpora
- move canonical truth into `OPL`
- authorize direct harness access, direct publish, direct release, direct export, direct submission, or direct posting by `OPL`

## Shared-Foundation Ownership Boundary

This lifecycle map sits in the shared-foundation reference layer only.
`OPL` may freeze dependency and traversal language here, but transition execution, runtime writeback, review truth, and publication truth still remain with human/domain-owned surfaces below the gateway boundary.
That keeps the map discoverable for review and acceptance alignment without turning it into a workflow control plane or shared truth store.
For the broader ownership split, see [Shared Foundation Ownership](../shared-foundation-ownership.md).

## Lifecycle Fields

Each entry stays derived/reference-only and carries only:

- `surface_id`
- `layer_id`
- `control_mode`
- `truth_mode`
- `requires_surfaces`
- `enables_surfaces`
- `follow_on_route_surface`
- `governing_refs`

## Current Coverage

### Shared-foundation boundary surfaces

- `opl_operating_model`
- `opl_shared_foundation`
- `opl_shared_foundation_ownership`

### Core gateway contract surfaces

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

## Companion Mapping Surfaces

- [OPL Surface Authority Matrix](./opl-surface-authority-matrix.md)
- [OPL Surface Review Matrix](./opl-surface-review-matrix.md)

## Reading Rule

Read this lifecycle map as a **derived reference graph**, not as an execution contract.

`requires_surfaces` and `enables_surfaces` expose frozen dependency and discoverability relationships only.
They do not authorize automatic transitions, and they do not replace prose review.
If the surface is `opl_operating_model`, `opl_shared_foundation`, or `opl_shared_foundation_ownership`, it remains a shared-foundation boundary document only and does not grant mutation, transition, review, or publication authority.
If the surface is the [OPL Phase 1 Exit Activation Package](./opl-phase-1-exit-activation-package.md) or the [OPL Minimal admitted-domain federation activation package](./opl-minimal-admitted-domain-federation-activation-package.md), it remains a reference-grade activation freeze only and does not authorize runtime execution, candidate admission, or runtime-owner promotion.
When an entry keeps a follow-on route boundary, the only allowed value is `domain_gateway`.
If no follow-on action belongs to the surface, the map uses `null`.
If the surface is `opl_candidate_domain_backlog`, the dependency chain remains blocker-oriented only; it does not authorize automatic promotion into onboarding, discovery, or routing.

## Governing Sources

- [OPL Federation Contract](../opl-federation-contract.md)
- [OPL Read-Only Discovery Gateway](../opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](../opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](../opl-domain-onboarding-contract.md)
- [OPL Candidate Domain Backlog](./opl-candidate-domain-backlog.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.md)
- [OPL Public Surface Index](../opl-public-surface-index.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.md)
- [OPL Gateway Contracts](../../contracts/opl-gateway/README.md)

## Completion Definition

The lifecycle map is acceptable only when:

- it covers the currently frozen shared-foundation / gateway / operating / supporting surfaces that matter for top-level traversal
- every `requires_surfaces` and `enables_surfaces` target resolves inside the same lifecycle map
- every `governing_ref` resolves to an existing local artifact
- `follow_on_route_surface` is always `null` or `domain_gateway`
- it remains discoverable alongside the derived surface authority matrix and derived surface review matrix without any of these maps becoming an execution surface
- it remains derived, reference-only, and non-executing
