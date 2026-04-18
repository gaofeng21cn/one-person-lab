**English** | [中文](./opl-public-surface-index.zh-CN.md)

# OPL Public Surface Index

## Purpose

This document indexes the current authoritative public surfaces for the `OPL Gateway`.

Its job is to make the top-level gateway easier to discover across README, roadmap, rollout, contracts, acceptance, examples, and linked domain gateway entries.

Read it as the current public surface map for a two-layer OPL entry: the active user-facing front door is the local `opl` shell plus the `opl web` pilot, while the underlying formal entry still remains the CLI-first / gateway contract surface map built on the frozen Phase 1 gateway baseline and reused by the absorbed `Minimal admitted-domain federation activation package`.
The completed `G2` closeout keeps the single repo-tracked top-level `G2` CLI-first / gateway contract baseline stable.
That baseline remains the current `OPL` `Phase 1` formal entry contract and public system surface.
The completed repo-tracked `Phase 1 / G3 thin handoff planning freeze hardening` remains closed at the planning-contract layer, and `G3` remains planning-only rather than an activated routed-action runtime.
The repo-tracked `Phase 1` candidate-domain closeout order is frozen as `Review Ops` then `Thesis Ops`, the absorbed predecessor gate remains `Phase 1 exit + next-stage activation package freeze`, and the `Minimal admitted-domain federation activation package` is already absorbed into repo-tracked top-level truth. No new active follow-on tranche is open until an admitted-domain absorbed delta or central reference drift justifies another central sync.
The current top-level formal entry therefore remains the CLI-first / gateway contract surface indexed here, even though the active public mainline above it is now the family-level front desk and hosted-entry hardening line.
Use the [Ecosystem Status Matrix](./references/ecosystem-status-matrix.md) as the internal reference-sync anchor for the current four-repo stage and maturity snapshot.

For repository-wide document layering and reference-grade handling, see [Docs Index](./README.md).

## Machine-Readable Artifact

- [`../contracts/opl-gateway/public-surface-index.json`](../contracts/opl-gateway/public-surface-index.json)

The current CLI-first gateway contract baseline can expose this same artifact through:

- `list-surfaces`
- `get-surface`

## Coverage

This index focuses on:

- public-entry surfaces for the top-level gateway
- the user-facing front door layered above the formal gateway contract
- contract surfaces that freeze federation boundaries
- supporting reference surfaces used for review and discoverability
- linked domain public-entry surfaces that remain domain-owned

## Shared-Foundation Ownership Boundary

This index sits in the shared-foundation discoverability layer only.
`OPL` owns the top-level surface language, indexing, and cross-domain navigation hints collected here, but domain gateways still own runtime execution, canonical truth, review truth, and publication truth once work crosses the domain boundary.
That makes this index a reference surface for discoverability and acceptance alignment.
For the broader ownership split, see [Shared Foundation Ownership](./shared-foundation-ownership.md).

## Indexed Surface Categories

### 1. OPL public-entry surfaces

These surfaces position and navigate the top-level gateway:

- [README](../README.md)
- [Roadmap](./roadmap.md)
- [OPL Task Map](./task-map.md)
- [Gateway Rollout](./references/opl-gateway-rollout.md)

At the current public layer, those surfaces should be read together with the landed local `opl` shell and `opl web` pilot: they provide the active front door above the unchanged formal-entry contract.

### 2. OPL contract surfaces

These surfaces freeze the gateway and federation boundary:

- [Gateway Federation](./gateway-federation.md)
- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)
- [OPL Operating Model](./operating-model.md)
- [Shared Foundation](./shared-foundation.md)
- [Shared Foundation Ownership](./shared-foundation-ownership.md)
- [Shared Runtime Contract](./shared-runtime-contract.md)
- [Shared Domain Contract](./shared-domain-contract.md)
- [OPL Gateway Contract Surface](./opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md) (planning-level contract only; repo-tracked `Phase 1 / G3 thin handoff planning freeze hardening` is already closed, the `Review Ops -> Thesis Ops` candidate-domain closeout remains below admission / discovery / routing readiness, the absorbed predecessor gate is `Phase 1 exit + next-stage activation package freeze`, and the current `Minimal admitted-domain federation activation package` is already absorbed into repo-tracked top-level truth)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md) + `domain-onboarding-readiness.schema.json`
- [OPL Governance / Audit Operating Surface](./references/opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](./references/opl-publish-promotion-operating-surface.md)

### 3. OPL reference-grade supporting surfaces

These surfaces improve review and discoverability without becoming execution layers:

- [OPL Gateway Acceptance Test Spec](./references/opl-gateway-acceptance-test-spec.md)
- [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.md)
- [OPL Phase 1 Exit Activation Package](./references/opl-phase-1-exit-activation-package.md)
- [OPL Minimal Admitted-Domain Federation Activation Package](./references/opl-minimal-admitted-domain-federation-activation-package.md)
- [OPL Gateway Example Corpus](./references/opl-gateway-example-corpus.md)
- [OPL Routed-Safety Example Corpus](./references/opl-routed-safety-example-corpus.md)
- [OPL Operating Example Corpus](./references/opl-operating-example-corpus.md)
- [OPL Operating Record Catalog](./references/opl-operating-record-catalog.md)
- [OPL Surface Lifecycle Map](./references/opl-surface-lifecycle-map.md)
- [OPL Surface Authority Matrix](./references/opl-surface-authority-matrix.md)
- [OPL Surface Review Matrix](./references/opl-surface-review-matrix.md)
- [OPL Public Surface Index](./opl-public-surface-index.md)

Related positioning companion:

- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.md) — a top-level shared umbrella-language explanation, not a shared public code framework, and it remains outside the current machine-readable indexed surface set
- [Shared Runtime Contract](./shared-runtime-contract.md) — the cross-domain runtime contract surface
- [Shared Domain Contract](./shared-domain-contract.md) — the cross-domain formal product-behavior contract surface

### 4. Linked domain public-entry surfaces

These are indexed from `OPL`, but remain domain-owned:

- `MedAutoScience` for `research_ops`
- `RedCube AI` for `presentation_ops`

Important boundary:

- `ppt_deck` directly maps to `presentation_ops`
- `xiaohongshu` may still route to `redcube` and stays a separate visual family at the OPL layer
- the current `Minimal admitted-domain federation activation package` applies to the already admitted domain surfaces only, namely `MedAutoScience` and `RedCube AI`
- `Grant Ops`, `Review Ops`, and `Thesis Ops` currently appear here as under-definition workstreams on candidate/onboarding lanes
- `Grant Foundry -> Med Auto Grant` currently points to an active grant-domain repository line, while its top-level federation admission / handoff wording remains separately gated
- the current admission blockers for those under-definition workstreams live in the candidate-domain backlog and remain below the onboarding gate

## Reading Rule

Read this index as a **surface map**.

If a surface is domain-owned, `OPL` indexes its public entry role while runtime, review, release, and submission truth stay in the owning domain.
If a surface is `opl_operating_model`, `opl_shared_foundation`, or `opl_shared_foundation_ownership`, it serves the shared-foundation boundary/reference layer.
If a surface is `opl_task_map`, under-definition workstreams stay on candidate/onboarding lanes until their registry and onboarding evidence land.
If a surface is `opl_candidate_domain_backlog`, it serves as the admission-blocker reference for those lanes.
If `Grant Foundry -> Med Auto Grant` is mentioned in public wording, it should be framed as an active grant-domain repository line whose top-level federation admission / handoff wording is still separately gated.
Any future follow-on route remains `domain_gateway`-only and follows the no-bypass rule against direct harness targeting.
If a surface is the routed-action prose or schema layer, it stays at the planning-contract / planning-dependency layer after the completed repo-tracked `Phase 1 / G3 thin handoff planning freeze hardening`.
If a surface is the acceptance, matrix, or example layer, it stays in the discoverability/review companion layer.

## Governing Gateway Documents

- [Gateway Federation](./gateway-federation.md)
- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Operating Model](./operating-model.md)
- [Shared Foundation](./shared-foundation.md)
- [Shared Foundation Ownership](./shared-foundation-ownership.md)
- [Shared Runtime Contract](./shared-runtime-contract.md)
- [Shared Domain Contract](./shared-domain-contract.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)
- [OPL Gateway Contract Surface](./opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md) (planning-level contract only; repo-tracked `Phase 1 / G3 thin handoff planning freeze hardening` is already closed, the `Review Ops -> Thesis Ops` candidate-domain closeout remains below admission / discovery / routing readiness, the absorbed predecessor gate is `Phase 1 exit + next-stage activation package freeze`, and the current `Minimal admitted-domain federation activation package` is already absorbed into repo-tracked top-level truth)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md)
- [OPL Governance / Audit Operating Surface](./references/opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](./references/opl-publish-promotion-operating-surface.md)

## Supporting Example / Review / Mapping Surfaces

These supporting surfaces improve discoverability and reviewability only.
They do not become governing gateway surfaces.
They also do not become a runtime controller, authority matrix for execution, or blanket promotion gate just because they are indexed here.

- [OPL Gateway Acceptance Test Spec](./references/opl-gateway-acceptance-test-spec.md)
- [OPL Gateway Example Corpus](./references/opl-gateway-example-corpus.md)
- [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.md)
- [OPL Phase 1 Exit Activation Package](./references/opl-phase-1-exit-activation-package.md)
- [OPL Routed-Safety Example Corpus](./references/opl-routed-safety-example-corpus.md)
- [OPL Operating Example Corpus](./references/opl-operating-example-corpus.md)
- [OPL Operating Record Catalog](./references/opl-operating-record-catalog.md)
- [OPL Surface Lifecycle Map](./references/opl-surface-lifecycle-map.md)
- [OPL Surface Authority Matrix](./references/opl-surface-authority-matrix.md)
- [OPL Surface Review Matrix](./references/opl-surface-review-matrix.md)

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
- it keeps launcher/runtime authority and domain truth ownership scoped to the correct owning surfaces
