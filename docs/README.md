**English** | [中文](./README.zh-CN.md)

# OPL Docs Guide

This directory is the entry index for the repo-tracked docs surface of `One Person Lab`.
The repository home is written first for potential users and human experts.
This guide points readers to the core working set, layered doc structure, reference material, and historical records behind the current gateway and headless-adapter story.

## Start Here By Audience

| Audience | Start here | Why |
| --- | --- | --- |
| Potential users and human experts | [Repository Home](../README.md), [Roadmap](./roadmap.md), [Task Map](./task-map.md), [Operating Model](./operating-model.md) | Understand the `OPL` shell, product families, and current implementations before reading technical details |
| Technical readers and planners | [Project](./project.md), [Status](./status.md), [Architecture](./architecture.md), [Invariants](./invariants.md), [Decisions](./decisions.md), [Contracts Overview](../contracts/README.md) | Understand the current baseline, boundaries, and the active technical direction |
| Developers and maintainers | [Reference Index](./references/README.md), `docs/specs/`, `docs/plans/`, [History Archive](./history/README.md) | Inspect implementation support material, historical records, and tracked working notes |

## Fast Technical Working Set

These files give the fastest read on the current repo-tracked truth before you change anything:

- [Project](./project.md)
- [Status](./status.md)
- [Architecture](./architecture.md)
- [Invariants](./invariants.md)
- [Decisions](./decisions.md)
- [Contracts Overview](../contracts/README.md)

## The Existing Four-Layer Docs System

The repository still uses the four-layer `OPL` docs system.
Use it like this:

- human experts enter through the repository home and Layer 1
- technical planners combine the technical working set with Layer 2
- developers treat Layers 3 and 4 as supporting material
- the public product mental model is `family entry surface -> family -> implementation`
- [Status](./status.md) and [Architecture](./architecture.md) hold the live public boundary
- [Reference Index](./references/README.md) and the history indexes hold supporting context and retired lanes

## Layer 1. Default Public Mainline

These are the first documents for external readers who want the public narrative.
They must stay bilingual and easy to read.

- [Repository Home](../README.md)
- [Roadmap](./roadmap.md)
- [Task Map](./task-map.md)
- [Operating Model](./operating-model.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.md)

## Layer 2. Public Contract And Technical Companion Docs

These documents are still public and bilingual, but they are meant for technical understanding.

- [OPL Federation Contract](./opl-federation-contract.md)
- [Shared Foundation](./shared-foundation.md)
- [Shared Foundation Ownership](./shared-foundation-ownership.md)
- [Shared Runtime Contract](./shared-runtime-contract.md)
- [Shared Domain Contract](./shared-domain-contract.md)
- [OPL Runtime Naming And Boundary Contract](./opl-runtime-naming-and-boundary-contract.md)
- [OPL Gateway Contract Surface](./opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md)
- [OPL Public Surface Index](./opl-public-surface-index.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)

## Layer 3. Reference-Grade Supporting Docs

Layer 3 holds review, audit, rollout, benchmark, and supporting reference material.
It is repo-tracked supporting material.

- [Reference Index](./references/README.md)
- `docs/references/contract-convergence-v1-execution-board.md`
- `docs/references/hermes-agent-runtime-substrate-benchmark.md`
- `docs/references/family-orchestration-contract-absorb-crewai.md`
- `docs/references/family-lightweight-direct-entry-rollout-board.md`
- `docs/references/opl-hosted-web-frontdesk-benchmark.md`
- `docs/references/opl-product-entry-and-hermes-kernel-integration.md`
- `docs/references/family-product-entry-and-domain-handoff-architecture.md`
- `docs/references/family-executor-adapter-defaults.md`
- `docs/references/hermes-native-executor-proof-lane.md`
- `docs/references/mas-top-level-cutover-board.md`
- admitted-domain sync and delta-intake reference records
- `docs/references/opl-gateway-rollout*`
- `docs/references/opl-gateway-acceptance-test-spec*`
- `docs/references/opl-candidate-domain-backlog*`
- `docs/references/opl-surface-lifecycle-map*`
- `docs/references/opl-surface-authority-matrix*`
- `docs/references/opl-surface-review-matrix*`
- `docs/references/opl-governance-audit-operating-surface*`
- `docs/references/opl-publish-promotion-operating-surface*`
- `docs/references/opl-gateway-example-corpus*`
- `docs/references/opl-routed-safety-example-corpus*`
- `docs/references/opl-operating-example-corpus*`
- `docs/references/opl-operating-record-catalog*`

## Layer 4. Historical Specs And Plans

Layer 4 is working history.
It explains how or why a freeze happened, while [Status](./status.md) remains the active baseline surface.

- `docs/specs/`
- `docs/plans/`
- [History Archive](./history/README.md)

## Where Current Truth Lives

- Public role, active boundary, and default reading order: [Project](./project.md), [Status](./status.md), [Architecture](./architecture.md)
- Machine-readable gateway and admission surfaces: [Contracts Overview](../contracts/README.md) and `contracts/opl-gateway/*.json`
- Reference-grade supporting material: [Reference Index](./references/README.md)
- Historical and retired lanes: [History Archive](./history/README.md)

## Documentation Rules

- Keep [Repository Home](../README.md) user-facing and readable for potential users, clinicians, and other non-technical experts.
- Keep Layers 1 and 2 bilingual, because they are part of the public surface.
- Keep Layer 3 reference-grade and detailed.
- Keep Layer 4 as tracked working history.
- When a change affects public wording, contracts, or admitted-domain state, update docs, contracts, and related verification together.

## Governance

- Governance notes live in [series-doc-governance-checklist.md](./references/series-doc-governance-checklist.md), the technical working set, and the repo-tracked contract/doc surfaces.
- The current four-repo alignment snapshot lives in [four-repo-doc-series-sync-summary-2026-04-14.md](./references/four-repo-doc-series-sync-summary-2026-04-14.md).
- The reusable intake starting point lives in [four-repo-doc-intake-template.md](./references/four-repo-doc-intake-template.md).
- Cross-repo doc rounds should be reviewed directly in the affected repositories, using each repo's current public positioning, contracts, and admitted-domain state as the source of truth.
