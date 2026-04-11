# OPL Gateway Contracts

This directory is the repository-local materialization of the current gateway-owned contract surface for `One Person Lab`.

It does **not** implement a runtime.
It freezes machine-readable gateway surfaces that the current local baseline, review flows, and acceptance checks can consume.

## Ownership Boundary

These contract artifacts live in the shared-foundation materialization layer only.
`OPL` owns the top-level contract language, indexing, and cross-domain reuse rules frozen here, but domain gateways and domain harnesses still own runtime execution, canonical truth, review truth, and publication truth once work crosses the gateway boundary.

This directory therefore materializes gateway surfaces for discoverability, reviewability, and acceptance alignment without becoming:

- a runtime
- a new control plane
- a canonical truth store
- a shared execution framework

## Current Formal Entry And `S1` Freeze Boundary

As of `2026-04-11`, the formal entry at the `OPL` layer still remains the local `TypeScript CLI`-first / read-only gateway baseline that reads the frozen contract artifacts in this directory.
That baseline runs on top of the current `Codex`-default host-agent runtime, with Codex-only active execution for planning, implementation, verification, and review.

The current repo-tracked follow-on is `S1 / shared runtime substrate v1 contract freeze`.
`S1` freezes shared language around:

- `runtime profile`
- `session substrate`
- `gateway runtime status`
- `memory provider hook`
- `delivery / cron substrate`
- `approval / interrupt / resume`

That freeze currently lives in public docs and reference-grade docs.
It does **not** enter `contracts/opl-gateway/*.json` yet, because it has not been strictly proven to be a gateway-owned machine-readable surface rather than domain runtime truth.

So the current boundary is:

- this directory freezes gateway-owned machine-readable surfaces
- `S1` freezes top-layer runtime-substrate language outside JSON first
- domain repositories still own runtime implementation and domain-local truth

## Reference-Grade Companions For `S1`

These companions clarify the current runtime wording and next-step adoption order without turning this directory into a second truth source:

- [OPL Operating Model](../../docs/operating-model.md)
- [Unified Harness Engineering Substrate](../../docs/unified-harness-engineering-substrate.md)
- [OPL Runtime Naming And Boundary Contract](../../docs/opl-runtime-naming-and-boundary-contract.md)
- [Hermes Agent Runtime Substrate Benchmark](../../docs/references/hermes-agent-runtime-substrate-benchmark.md)
- [OPL Vertical Online Agent Platform Roadmap](../../docs/references/opl-vertical-online-agent-platform-roadmap.md)
- [Codex-default Host-Agent Runtime Contract](../../docs/references/host-agent-runtime-contract.md)
- [Development Operating Model](../../docs/references/development-operating-model.md)
- [Ecosystem Status Matrix](../../docs/references/ecosystem-status-matrix.md)

## Historical OMX Migration Reference

- [OMX historical archive](../../docs/history/omx/README.md) — historical reference only, not an active execution entry

## Governing Documents

- [OPL Federation Contract](../../docs/opl-federation-contract.md)
- [Shared Foundation](../../docs/shared-foundation.md)
- [Shared Foundation Ownership](../../docs/shared-foundation-ownership.md)
- [OPL Read-Only Discovery Gateway](../../docs/opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](../../docs/opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](../../docs/opl-domain-onboarding-contract.md)
- [OPL Public Surface Index](../../docs/opl-public-surface-index.md)
- [中文说明](./README.zh-CN.md)

## Files

- [`workstreams.json`](./workstreams.json) — machine-readable workstream registry
- [`domains.json`](./domains.json) — machine-readable domain registry
- [`routing-vocabulary.json`](./routing-vocabulary.json) — shared routing vocabulary groups plus frozen routing rules
- [`handoff.schema.json`](./handoff.schema.json) — JSON Schema for the frozen G1 handoff payload
- [`routed-actions.schema.json`](./routed-actions.schema.json) — planning-level contract artifact rather than a launcher
- [`domain-onboarding-readiness.schema.json`](./domain-onboarding-readiness.schema.json) — JSON Schema for the machine-readable domain onboarding readiness gate
- [`governance-audit.schema.json`](./governance-audit.schema.json) — JSON Schema for the frozen governance / audit operating contract
- [`publish-promotion.schema.json`](./publish-promotion.schema.json) — JSON Schema for the frozen publish / promotion operating contract
- [`acceptance-matrix.json`](./acceptance-matrix.json) — declarative acceptance matrix for the frozen gateway and operating surfaces
- [`public-surface-index.json`](./public-surface-index.json) — machine-readable index of authoritative OPL public surfaces and linked domain public entries
- [`task-topology.json`](./task-topology.json) — machine-readable top-level task topology across admitted and under-definition OPL workstreams
- [`candidate-domain-backlog.json`](./candidate-domain-backlog.json) — machine-readable admission-blocker backlog for current under-definition workstreams
- [`phase-1-exit-activation-package.json`](./phase-1-exit-activation-package.json) — machine-readable historical freeze for the prior `Phase 1` exit package
- [`minimal-admitted-domain-federation-activation-package.json`](./minimal-admitted-domain-federation-activation-package.json) — machine-readable historical freeze for the minimal admitted-domain federation package
- [`operating-record-catalog.json`](./operating-record-catalog.json) — machine-readable reference catalog for operating record kinds
- [`surface-lifecycle-map.json`](./surface-lifecycle-map.json) — machine-readable derived lifecycle map
- [`surface-authority-matrix.json`](./surface-authority-matrix.json) — machine-readable derived authority matrix
- [`surface-review-matrix.json`](./surface-review-matrix.json) — machine-readable derived review matrix

## Boundary Rules

- `OPL` remains the top-level gateway and federation surface.
- Domain gateways remain independently usable after routing.
- Domain harnesses stay below domain gateways.
- This directory does not create canonical truth ownership above domains.
- This directory does not authorize bypassing a domain gateway to reach a harness.
- This directory does not make `OPL` the runtime owner.

## Current Scope

This directory includes:

- admitted registry and gateway-owned contract artifacts for workstreams and domains whose boundaries are already frozen
- derived / reference-only topology material that may mention under-definition workstreams without admitting them into `G1`, `G2`, or `G3`
- no direct machine-readable materialization of `shared runtime substrate v1` until gateway ownership is proven

`Grant Foundry -> Med Auto Grant` remains top-level signal / future direction evidence only.
It is not an admitted domain gateway and does not count as `G2` discovery readiness, `G3` routed-action readiness, or a handoff-ready surface at the `OPL` layer.

## Materialization Note

The prose docs describe canonical contract intent using `opl/...` surface names.
This directory is the concrete materialization for the current repository while preserving the same contract shape.
