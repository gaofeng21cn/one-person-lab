# OPL Gateway Contracts

This directory is the repository-local materialization of the `G1` federation contract for `One Person Lab`.

It does **not** implement a runtime.
It freezes machine-readable gateway surfaces that later discovery and routed-action layers can consume.

## Shared-foundation ownership boundary

These contract and reference artifacts live in the shared-foundation materialization layer only.
`OPL` owns the top-level contract language, indexing, and cross-domain reuse rules frozen here, but domain gateways and domain harnesses still own runtime execution, canonical truth, review truth, and publication truth once a routed request crosses the gateway boundary.
This directory therefore materializes gateway surfaces for discoverability / reviewability / acceptance alignment without becoming a new control plane or shared truth store.
For the broader ownership split, see [Shared Foundation](../../docs/shared-foundation.md) and [Shared Foundation Ownership](../../docs/shared-foundation-ownership.md).

## Current Phase 1 alignment

The current `opl-mainline` Phase 1 target is a local `TypeScript CLI`-first, read-only gateway baseline that reads the frozen contract artifacts in this directory.
That transport sits on top of the current `Codex-default host-agent runtime`, while `Codex Host` freezes planning/truth and `OMX` handles long-running execution inside those frozen boundaries.
That delivery target does **not** promote this directory into a runtime, routed-action control plane, or canonical truth store; it only makes the existing top-level contract language executable through a local CLI surface.

## Current four-repo alignment companions

These reference-grade companions freeze the current four-repo status, runtime wording, and development-control split without turning this directory into a runtime owner or second source of truth.

- [Ecosystem Status Matrix](../../docs/references/ecosystem-status-matrix.md) — Chinese-only internal reference for the current four-repo stage/status picture
- [Codex-default Host-Agent Runtime Contract](../../docs/references/host-agent-runtime-contract.md) — Chinese-only internal reference for the current local default runtime wording
- [Development Operating Model](../../docs/references/development-operating-model.md) — Chinese-only internal reference for the `Codex Host` / `OMX` planning-vs-longrun split
- [Runtime Alignment Taskboard](../../docs/references/runtime-alignment-taskboard.md) — Chinese-only internal reference for the current P0/P1 alignment checks
- [OMX Stage-Gated Longrun Guide](../../docs/references/omx-stage-gated-longrun-guide.md) — Chinese-only internal reference for stage-gated long-running execution rules

## Governing documents

- [OPL Gateway Federation](../../docs/gateway-federation.md)
- [OPL Gateway Federation（中文）](../../docs/gateway-federation.zh-CN.md)
- [OPL Federation Contract](../../docs/opl-federation-contract.md)
- [OPL Federation Contract（中文）](../../docs/opl-federation-contract.zh-CN.md)
- [OPL Operating Model](../../docs/operating-model.md)
- [OPL Operating Model（中文）](../../docs/operating-model.zh-CN.md)
- [Shared Foundation](../../docs/shared-foundation.md)
- [Shared Foundation（中文）](../../docs/shared-foundation.zh-CN.md)
- [Shared Foundation Ownership](../../docs/shared-foundation-ownership.md)
- [Shared Foundation Ownership（中文）](../../docs/shared-foundation-ownership.zh-CN.md)
- [OPL Read-Only Discovery Gateway](../../docs/opl-read-only-discovery-gateway.md)
- [OPL Read-Only Discovery Gateway（中文）](../../docs/opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](../../docs/opl-routed-action-gateway.md)
- [OPL Routed Action Gateway（中文）](../../docs/opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](../../docs/opl-domain-onboarding-contract.md)
- [OPL Domain Onboarding Contract（中文）](../../docs/opl-domain-onboarding-contract.zh-CN.md)
- [OPL Governance / Audit Operating Surface](../../docs/references/opl-governance-audit-operating-surface.md)
- [OPL Governance / Audit Operating Surface（中文）](../../docs/references/opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](../../docs/references/opl-publish-promotion-operating-surface.md)
- [OPL Publish / Promotion Operating Surface（中文）](../../docs/references/opl-publish-promotion-operating-surface.zh-CN.md)
- [OPL Candidate Domain Backlog](../../docs/references/opl-candidate-domain-backlog.md)
- [OPL Candidate Domain Backlog（中文）](../../docs/references/opl-candidate-domain-backlog.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](../../docs/references/opl-gateway-acceptance-test-spec.md)
- [OPL Gateway Acceptance Test Spec（中文）](../../docs/references/opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Gateway Rollout](../../docs/references/opl-gateway-rollout.md)
- [OPL Gateway Rollout（中文）](../../docs/references/opl-gateway-rollout.zh-CN.md)
- [OPL Public Surface Index](../../docs/opl-public-surface-index.md)
- [OPL Public Surface Index（中文）](../../docs/opl-public-surface-index.zh-CN.md)
- [OPL Task Map](../../docs/task-map.md)
- [OPL Task Map（中文）](../../docs/task-map.zh-CN.md)
- [中文说明](./README.zh-CN.md)

## Companion examples

- [OPL Gateway Example Corpus](../../docs/references/opl-gateway-example-corpus.md) — canonical illustrative contract-level compositions across the frozen gateway layers
- [OPL Routed-Safety Example Corpus](../../docs/references/opl-routed-safety-example-corpus.md) — canonical illustrative safety walkthroughs for the explicit non-success G3 routing states
- [OPL Operating Example Corpus](../../docs/references/opl-operating-example-corpus.md) — canonical standalone operating-record examples for the frozen P5.M1 / P5.M2 surfaces

These corpora are companion references only. They do not replace the governing contracts in this directory.

## Companion reference surfaces

- [OPL Candidate Domain Backlog](../../docs/references/opl-candidate-domain-backlog.md) — reference-only machine-readable admission-blocker backlog for the current under-definition workstreams
- [OPL Surface Lifecycle Map](../../docs/references/opl-surface-lifecycle-map.md) — derived machine-readable lifecycle view across the frozen gateway / operating / supporting surfaces
- [OPL Surface Authority Matrix](../../docs/references/opl-surface-authority-matrix.md) — derived machine-readable authority split across the frozen OPL surfaces and linked domain public-entry surfaces
- [OPL Surface Review Matrix](../../docs/references/opl-surface-review-matrix.md) — derived machine-readable review obligations across the frozen OPL public, contract, and supporting surfaces

These backlog and mapping surfaces are reference-only. They do not become a workflow engine, transition authority, authorization engine, approval engine, publish controller, or replacement for the governing contracts in this directory.

## Files

- [`workstreams.json`](./workstreams.json) — machine-readable workstream registry
- [`domains.json`](./domains.json) — machine-readable domain registry
- [`routing-vocabulary.json`](./routing-vocabulary.json) — shared routing vocabulary groups plus frozen routing rules
- [`handoff.schema.json`](./handoff.schema.json) — JSON Schema for the frozen G1 handoff payload
- [`routed-actions.schema.json`](./routed-actions.schema.json) — JSON Schema for the frozen G3 routed action contract
- [`domain-onboarding-readiness.schema.json`](./domain-onboarding-readiness.schema.json) — JSON Schema for the machine-readable domain onboarding readiness gate
- [`governance-audit.schema.json`](./governance-audit.schema.json) — JSON Schema for the frozen P5.M1 governance / audit operating contract
- [`publish-promotion.schema.json`](./publish-promotion.schema.json) — JSON Schema for the frozen P5.M2 publish / promotion operating contract
- [`acceptance-matrix.json`](./acceptance-matrix.json) — declarative acceptance matrix for the frozen gateway and operating surfaces
- [`public-surface-index.json`](./public-surface-index.json) — machine-readable index of current authoritative OPL public surfaces and linked domain public entries
- [`task-topology.json`](./task-topology.json) — machine-readable top-level task topology across admitted and under-definition OPL workstreams
- [`candidate-domain-backlog.json`](./candidate-domain-backlog.json) — machine-readable admission-blocker backlog for the current under-definition workstreams
- [`operating-record-catalog.json`](./operating-record-catalog.json) — machine-readable reference catalog for the frozen P5.M1 / P5.M2 operating record kinds
- [`surface-lifecycle-map.json`](./surface-lifecycle-map.json) — machine-readable derived lifecycle map for the frozen gateway / operating / supporting surfaces
- [`surface-authority-matrix.json`](./surface-authority-matrix.json) — machine-readable derived authority matrix for the frozen OPL surfaces and linked domain public-entry surfaces
- [`surface-review-matrix.json`](./surface-review-matrix.json) — machine-readable derived review matrix for the frozen OPL public, contract, and supporting surfaces

## Frozen current mappings

- `research_ops` routes to `medautoscience`
- `presentation_ops` routes to `redcube`
- `ppt_deck` directly maps to `presentation_ops`
- `xiaohongshu` may route to `redcube`, but does not automatically equal `presentation_ops`

## Boundary rules

- `OPL` remains the top-level gateway and federation surface.
- Domain gateways remain independently usable after routing.
- Domain harnesses stay below domain gateways.
- This directory does not create canonical truth ownership above domains.
- This directory does not authorize bypassing a domain gateway to reach a harness.

## Current scope

This directory includes:

- admitted registry / contract artifacts for the workstreams and domains whose boundaries are already frozen in the public G1 contract
- derived / reference-only task-topology material that may mention under-definition workstreams without admitting them into `G1`, `G2`, or `G3`
- derived / reference-only candidate-domain backlog material that records missing admission boundaries without inventing placeholder domains or routed targets
- no separate candidate-domain-definition contract surface beyond the current `task-topology + candidate-domain-backlog + domain-onboarding` composition unless a real missing boundary is first proven

Planned workstreams such as `Grant Ops`, `Review Ops`, and `Thesis Ops` remain outside the admitted registry / discovery / routing surfaces until their domain boundaries are explicitly frozen.

## Materialization note

The prose docs describe canonical contract intent using `opl/...` surface names.
This directory is the concrete materialization for the current repository while preserving the same contract shape.
