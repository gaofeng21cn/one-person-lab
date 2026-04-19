**English** | [中文](./README.zh-CN.md)

# OPL Docs Guide

This directory is the technical reading layer for `One Person Lab`.
The repository home is written first for potential users and human experts.
This guide points readers to the architecture, contracts, planning surfaces, and implementation references behind the current product-shell story.

## Start Here By Audience

| Audience | Start here | Why |
| --- | --- | --- |
| Potential users and human experts | [Repository Home](../README.md), [Roadmap](./roadmap.md), [Task Map](./task-map.md), [Operating Model](./operating-model.md) | Understand the `OPL` shell, product families, and current implementations before reading technical details |
| Technical readers and planners | [Project](./project.md), [Status](./status.md), [Architecture](./architecture.md), [Invariants](./invariants.md), [Decisions](./decisions.md), [Contracts Overview](../contracts/README.md) | Understand current truth, boundaries, and the active technical direction |
| Developers and maintainers | [Reference Index](./references/README.md), `docs/specs/`, `docs/plans/`, `docs/history/omx/` | Inspect implementation support material, historical records, and tracked working notes |

## Current Baseline

- `OPL` is the Codex-native GUI product shell and module manager for one-person-lab agents.
- The public reading model uses three layers: product shell -> product families -> current implementations.
- The GUI presents three peer work modes: ordinary Codex conversation, general Codex task, and specialized domain agents.
- `Research Foundry`, `Grant Foundry`, and `Presentation Foundry` are the current active product families; `Thesis Foundry` and `Review Foundry` stay in definition.
- `MAS`, `MAG`, and `RCA` are the current active implementations under those product families.
- Settings own module management, module upgrades, version pins, module health, default mode, and online gateway configuration.
- The workspace side rail owns human-readable progress, running-task status, and deliverable files.
- `Hermes-Agent` is the explicit backup mode and online gateway for remote or alternate runtime paths.
- Domain-agent repositories remain the source of truth for their specialized capabilities and readiness.

## Technical Working Set

These are the fastest files for understanding the live technical truth before changing repo state:

- [Project](./project.md)
- [Status](./status.md)
- [Architecture](./architecture.md)
- [Invariants](./invariants.md)
- [Decisions](./decisions.md)
- [Contracts Overview](../contracts/README.md)

## The Existing Four-Layer Docs System

The repository still uses the four-layer `OPL` docs system.
The current entry order is:

- human experts enter through the repository home and Layer 1
- technical planners combine the technical working set with Layer 2
- developers treat Layers 3 and 4 as supporting material
- the public product mental model is `shell -> family -> implementation`
- live product-shell, module, settings, and online-gateway truth is read from [Status](./status.md)
- `opl frontdesk bootstrap --path <workspace>` prepares the local `OPL Atlas` Desktop shell and binds the active workspace into the module registry
- the default `OPL Cortex` bridge stays small: `project progress`, `execute request`, `task status`, `recent sessions`, `resume session`, `runtime logs`, `projects`, and `activate workspace`
- front-door execution requests use async acceptance for real work: the shell returns a `task_id`, then the user-facing shell follows progress through `task status`
- Codex remains the default engine for ordinary conversation and general local tasks
- `Hermes-Agent` remains the explicit backup online gateway

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
- `docs/references/opl-phase-2-central-reference-sync-board.md`
- `docs/references/opl-phase-2-admitted-domain-delta-intake-refresh.md`
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
It explains how or why a freeze happened, while [Status](./status.md) remains the current truth surface.

- `docs/specs/`
- `docs/plans/`
- `docs/history/omx/`

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
- Cross-repo doc rounds should be reviewed directly in the affected repositories and verified with their normal verification lanes.
