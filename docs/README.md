**English** | [中文](./README.zh-CN.md)

# OPL Docs Index

This directory carries the public and repo-tracked documents for `One Person Lab`.
To keep the public surface stable and stop reference material from crowding the main narrative, `OPL` uses one fixed four-layer document system.

## Layer 1. Default Public Mainline

These are the first documents a human expert should read to understand what `OPL` is today.
They are part of the default public storyline and must stay bilingual.

- [Repository Home](../README.md)
- [Roadmap](./roadmap.md)
- [Task Map](./task-map.md)
- [Gateway Federation](./gateway-federation.md)
- [Operating Model](./operating-model.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.md)

## Layer 2. Public Contract And Gateway Companion Docs

These documents are still public and bilingual, but they are more technical.
They define gateway semantics, shared-foundation boundaries, and formal contract surfaces rather than the first-reading narrative.

- [OPL Federation Contract](./opl-federation-contract.md)
- [Shared Foundation](./shared-foundation.md)
- [Shared Foundation Ownership](./shared-foundation-ownership.md)
- [OPL Read-Only Discovery Gateway](./opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md)
- [OPL Public Surface Index](./opl-public-surface-index.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)

## Layer 3. Reference-Grade Supporting Docs

These documents stay repo-tracked, but they are not the default public reading path.
They support review, acceptance, indexing, examples, or boundary inspection and must not be allowed to redefine the main storyline.

- `opl-gateway-rollout*`
- `opl-gateway-acceptance-test-spec*`
- `opl-candidate-domain-backlog*`
- `opl-candidate-workstream-tranche-closeout*`
- `opl-gateway-example-corpus*`
- `opl-routed-safety-example-corpus*`
- `opl-operating-example-corpus*`
- `opl-operating-record-catalog*`
- `opl-surface-lifecycle-map*`
- `opl-surface-authority-matrix*`
- `opl-surface-review-matrix*`
- `opl-governance-audit-operating-surface*`
- `opl-publish-promotion-operating-surface*`

## Layer 4. Historical Specs And Plans

These are internal design and planning records.
They explain why a freeze happened, but they are not the living truth surface for the current repository state.

- `docs/specs/`
- `docs/plans/`

## Documentation Rules

- Layers 1 and 2 are public surfaces, so every document there must have synchronized English `.md` and Chinese `.zh-CN.md` mirrors.
- Layer 3 may remain public or repo-tracked, but it is always reference-grade and must not crowd the default reading path in the root README.
- Layer 4 is internal working history and should default to Chinese-only unless there is an explicit reason to publish a bilingual mirror.
- Avoid unnecessary mixed-language prose: keep narrative in one language, and reserve English for fixed terms, file paths, command names, schemas, and code identifiers.

## Governance

- [Documentation Governance](./documentation-governance.md) (Chinese only)
