**English** | [中文](./opl-public-surface-index.zh-CN.md)

# OPL Public Surface Index

## Purpose

This document indexes the current authoritative public surfaces for the `OPL Gateway`.

Its job is to make the top-level gateway easier to discover across README, roadmap, rollout, contracts, acceptance, examples, and linked domain gateway entries.

It is not a runtime registry.
It should be read as a CLI-first, read-only discoverability aid for the current Phase 1 gateway baseline.

For repository-wide document layering and reference-grade handling, see [Docs Index](./README.md).

## Machine-Readable Artifact

- [`../contracts/opl-gateway/public-surface-index.json`](../contracts/opl-gateway/public-surface-index.json)

The current CLI-first read-only baseline can expose this same artifact through:

- `list-surfaces`
- `get-surface`

## Non-Goals

This index does not:

- launch execution
- register harness internals
- move canonical truth into `OPL`
- turn domain systems into internal modules

## Shared-Foundation Ownership Boundary

This index sits in the shared-foundation discoverability layer only.
`OPL` owns the top-level surface language, indexing, and cross-domain navigation hints collected here, but domain gateways still own runtime execution, canonical truth, review truth, and publication truth once work crosses the domain boundary.
That makes this index a reference surface for discoverability and acceptance alignment, not a control plane, execution registry, or shared truth store.
For the broader ownership split, see [Shared Foundation Ownership](./shared-foundation-ownership.md).

## Indexed Surface Categories

### 1. OPL public-entry surfaces

These surfaces position and navigate the top-level gateway:

- [README](../README.md)
- [Roadmap](./roadmap.md)
- [OPL Task Map](./task-map.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.md)

### 2. OPL contract surfaces

These surfaces freeze the gateway and federation boundary:

- [Gateway Federation](./gateway-federation.md)
- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)
- [OPL Operating Model](./operating-model.md)
- [Shared Foundation](./shared-foundation.md)
- [Shared Foundation Ownership](./shared-foundation-ownership.md)
- [OPL Read-Only Discovery Gateway](./opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md) + `domain-onboarding-readiness.schema.json`

### 3. OPL reference-grade supporting surfaces

These surfaces improve review and discoverability without becoming execution layers:

- [Gateway Rollout](./opl-gateway-rollout.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.md)
- [OPL Candidate Domain Backlog](./opl-candidate-domain-backlog.md)
- [OPL Gateway Example Corpus](./opl-gateway-example-corpus.md)
- [OPL Routed-Safety Example Corpus](./opl-routed-safety-example-corpus.md)
- [OPL Operating Example Corpus](./opl-operating-example-corpus.md)
- [OPL Operating Record Catalog](./opl-operating-record-catalog.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.md)
- [OPL Surface Lifecycle Map](./opl-surface-lifecycle-map.md)
- [OPL Surface Authority Matrix](./opl-surface-authority-matrix.md)
- [OPL Surface Review Matrix](./opl-surface-review-matrix.md)
- [OPL Public Surface Index](./opl-public-surface-index.md)

### 4. Linked domain public-entry surfaces

These are indexed from `OPL`, but remain domain-owned:

- `MedAutoScience` for `research_ops`
- `RedCube AI` for `presentation_ops`

Important boundary:

- `ppt_deck` directly maps to `presentation_ops`
- `xiaohongshu` may still route to `redcube`, but does not automatically equal `presentation_ops`
- `Grant Ops`, `Review Ops`, and `Thesis Ops` may appear in the task map as under-definition workstreams, but that does not make them admitted domains or routed targets
- the current admission blockers for those under-definition workstreams live in the candidate-domain backlog and remain below the onboarding gate

## Reading Rule

Read this index as a **surface map**, not as an execution registry.

If a surface is domain-owned, `OPL` only indexes its public entry role.
Canonical runtime truth, review truth, release truth, and submission truth remain inside the owning domain system.
If a surface is `opl_operating_model`, `opl_shared_foundation`, or `opl_shared_foundation_ownership`, it remains a shared-foundation boundary/reference surface only and does not transfer canonical truth, mutation, review truth, or publication truth into `OPL`.
If a surface is `opl_task_map`, under-definition workstreams remain top-level semantic candidates only until the onboarding and registry gates are satisfied.
If a surface is `opl_candidate_domain_backlog`, it remains an admission-blocker reference only and does not count as onboarding readiness, discovery readiness, or routed-action readiness.
If a surface is the rollout, acceptance, matrix, or example layer, it remains a discoverability/review companion only; it does not become a runtime authority engine or automatically promote every listed artifact into a gate.

## Governing Gateway Documents

- [Gateway Federation](./gateway-federation.md)
- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Operating Model](./operating-model.md)
- [Shared Foundation](./shared-foundation.md)
- [Shared Foundation Ownership](./shared-foundation-ownership.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)
- [OPL Read-Only Discovery Gateway](./opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md)

## Supporting Example / Review / Mapping Surfaces

These supporting surfaces improve discoverability and reviewability only.
They do not become governing gateway surfaces.
They also do not become a runtime controller, authority matrix for execution, or blanket promotion gate just because they are indexed here.

- [Gateway Rollout](./opl-gateway-rollout.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.md)
- [OPL Gateway Example Corpus](./opl-gateway-example-corpus.md)
- [OPL Candidate Domain Backlog](./opl-candidate-domain-backlog.md)
- [OPL Routed-Safety Example Corpus](./opl-routed-safety-example-corpus.md)
- [OPL Operating Example Corpus](./opl-operating-example-corpus.md)
- [OPL Operating Record Catalog](./opl-operating-record-catalog.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.md)
- [OPL Surface Lifecycle Map](./opl-surface-lifecycle-map.md)
- [OPL Surface Authority Matrix](./opl-surface-authority-matrix.md)
- [OPL Surface Review Matrix](./opl-surface-review-matrix.md)

## Completion Definition

The public surface index is acceptable only when:

- it stays machine-readable
- it distinguishes OPL-owned surfaces from domain-owned public entries
- it exposes the derived surface lifecycle map as a supporting/reference surface
- it exposes the derived surface authority matrix as a supporting/reference surface
- it exposes the derived surface review matrix as a supporting/reference surface
- it exposes the candidate-domain backlog as a supporting/reference surface below the onboarding gate
- it exposes `opl_operating_model`, `opl_shared_foundation`, and `opl_shared_foundation_ownership` as OPL-owned contract/reference surfaces only
- it exposes the task-map / task-topology surface without turning under-definition workstreams into admitted domains
- it does not imply a launcher, runtime, or harness bypass
- it does not move canonical truth into `OPL`
