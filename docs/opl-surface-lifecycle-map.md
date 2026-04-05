**English** | [中文](./opl-surface-lifecycle-map.zh-CN.md)

# OPL Surface Lifecycle Map

## Purpose

This document indexes the derived machine-readable lifecycle map for the frozen `OPL Gateway` surface stack.

Its job is to make contract, routing, operating, discoverability, and acceptance surfaces traversable from one place without turning the map into a workflow engine, transition authority, or second source of truth.

## Machine-Readable Artifact

- [`../contracts/opl-gateway/surface-lifecycle-map.json`](../contracts/opl-gateway/surface-lifecycle-map.json)

## Non-Goals

This lifecycle map does not:

- execute transitions
- decide unresolved routing states
- replace the governing docs, schemas, or supporting corpora
- move canonical truth into `OPL`
- never authorize direct harness access, direct publish, direct release, direct export, direct submission, or direct posting by `OPL`

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

### Core gateway contract surfaces

- `opl_gateway_contract_hub`
- `opl_read_only_discovery_gateway`
- `opl_routed_action_gateway`
- `opl_domain_onboarding_contract`

### Operating surfaces

- `opl_governance_audit_operating_surface`
- `opl_publish_promotion_operating_surface`

### Supporting discoverability / acceptance surfaces

- `opl_gateway_example_corpus`
- `opl_routed_safety_example_corpus`
- `opl_operating_example_corpus`
- `opl_operating_record_catalog`
- `opl_public_surface_index_doc`
- `opl_gateway_acceptance_spec`

## Reading Rule

Read this lifecycle map as a **derived reference graph**, not as an execution contract.

`requires_surfaces` and `enables_surfaces` expose frozen dependency and discoverability relationships only.
They do not authorize automatic transitions, and they do not replace prose review.
When an entry keeps a follow-on route boundary, the only allowed value is `domain_gateway`.
If no follow-on action belongs to the surface, the map uses `null`.

## Governing Sources

- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Read-Only Discovery Gateway](./opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.md)
- [OPL Public Surface Index](./opl-public-surface-index.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)

## Completion Definition

The lifecycle map is acceptable only when:

- it covers the currently frozen gateway / operating / supporting surfaces that matter for top-level traversal
- every `requires_surfaces` and `enables_surfaces` target resolves inside the same lifecycle map
- every `governing_ref` resolves to an existing local artifact
- `follow_on_route_surface` is always `null` or `domain_gateway`
- it remains derived, reference-only, and non-executing
