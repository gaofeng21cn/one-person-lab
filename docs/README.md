**English** | [中文](./README.zh-CN.md)

# OPL Docs Index

This directory carries the public and repo-tracked documents for `One Person Lab`.
To keep the public surface stable while still giving AI and maintainers a compact working set, `OPL` now uses two simultaneous views:

1. a fixed AI / maintainer core working set
2. the public four-layer documentation system

## AI / Maintainer Core Working Set

These are the first files an AI or maintainer should read before touching the repository state:

- [Project](./project.md)
- [Status](./status.md)
- [Architecture](./architecture.md)
- [Invariants](./invariants.md)
- [Decisions](./decisions.md)
- [Contracts overview](../contracts/README.md)

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
- [OPL Runtime Naming And Boundary Contract](./opl-runtime-naming-and-boundary-contract.md)
- [OPL Read-Only Discovery Gateway](./opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md)
- [OPL Public Surface Index](./opl-public-surface-index.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)

## Layer 3. Reference-Grade Supporting Docs

These documents stay repo-tracked, but they are not the default public reading path.
They support review, acceptance, indexing, examples, or boundary inspection and must not be allowed to redefine the main storyline.
All Layer 3 docs now live under `docs/references/` so the docs root stays readable.

- `references/opl-gateway-rollout*`
- `references/opl-gateway-acceptance-test-spec*`
- `references/opl-candidate-domain-backlog*`
- `references/opl-candidate-workstream-tranche-closeout*`
- `references/opl-gateway-example-corpus*`
- `references/opl-routed-safety-example-corpus*`
- `references/opl-operating-example-corpus*`
- `references/opl-operating-record-catalog*`
- `references/ecosystem-status-matrix.md` (Chinese-only internal reference)
- `references/contract-convergence-v1-execution-board.md` (Chinese-only internal reference)
- `references/host-agent-runtime-contract.md` (Chinese-only internal reference)
- `references/managed-runtime-migration-readiness-checklist.md` (Chinese-only internal reference)
- `references/hermes-agent-runtime-substrate-benchmark.md` (Chinese-only internal reference)
- `references/development-operating-model.md` (Chinese-only internal reference)
- `references/contract-convergence-v1-decision-note.md` (Chinese-only internal reference)
- `references/opl-phase2-ecosystem-sync-owner-line.md` (Chinese-only internal reference)
- `references/opl-phase-2-central-reference-sync-board.md` (Chinese-only internal reference)
- `references/opl-phase-2-admitted-domain-delta-intake-refresh.md` (Chinese-only internal reference)
- `references/runtime-alignment-taskboard.md` (Chinese-only internal reference)
- `references/opl-surface-lifecycle-map*`
- `references/opl-surface-authority-matrix*`
- `references/opl-surface-review-matrix*`
- `references/opl-governance-audit-operating-surface*`
- `references/opl-publish-promotion-operating-surface*`

### Historical OMX archive

- [OMX historical archive](history/omx/README.md) (historical reference only)

## Layer 4. Historical Specs And Plans

These are internal design and planning records.
They explain why a freeze happened, but they are not the living truth surface for the current repository state.

- `docs/specs/`
- `docs/plans/`

## Documentation Rules

- The AI / maintainer core working set exists to answer project goal, current state, boundaries, and key decisions quickly without forcing readers through the entire public surface.
- Layers 1 and 2 are public surfaces, so every document there must have synchronized English `.md` and Chinese `.zh-CN.md` mirrors.
- Layer 3 may remain public or repo-tracked, but it is always reference-grade and must not crowd the default reading path in the root README.
- OMX-prefixed reference docs are retained as historical migration artifacts; they are not active execution entry docs.
- Layer 4 is internal working history and should default to Chinese-only unless there is an explicit reason to publish a bilingual mirror.
- Avoid unnecessary mixed-language prose: keep narrative in one language, and reserve English for fixed terms, file paths, command names, schemas, and code identifiers.

## Governance

- Documentation governance lives in [AGENTS.md](../AGENTS.md) and the core maintainer working set.
