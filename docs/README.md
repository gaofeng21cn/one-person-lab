**English** | [中文](./README.zh-CN.md)

# OPL Docs Guide

This directory is the technical reading layer for `One Person Lab`.
The repository home is written first for potential users and human experts.
This guide is for readers who need the architecture, contracts, planning surfaces, and implementation references behind that public story.

## Start Here By Audience

| Audience | Start here | Why |
| --- | --- | --- |
| Potential users and human experts | [Repository Home](../README.md), [Roadmap](./roadmap.md), [Task Map](./task-map.md), [Gateway Federation](./gateway-federation.md) | Understand what `OPL` is for before reading technical details |
| Technical readers and planners | [Project](./project.md), [Status](./status.md), [Architecture](./architecture.md), [Invariants](./invariants.md), [Decisions](./decisions.md), [Contracts Overview](../contracts/README.md) | Understand current truth, boundaries, and the active technical direction |
| Developers and maintainers | [Reference Index](./references/README.md), `docs/specs/`, `docs/plans/`, `docs/history/omx/` | Inspect implementation support material, historical records, and tracked working notes |

## Current Baseline

- `OPL` is the top-level gateway, federation, and shared-boundary surface for the family.
- Domain runtime ownership stays with admitted domain repositories rather than moving into `OPL`.
- `frontdesk-entry-guide` is now the family-level machine-readable entry layer for AI / GUI shells; if the user-facing shell is branded as `OPL Cortex`, that naming sits above the repo-internal `frontdesk_*` contract ids.
- The repository home should stay readable for non-technical human experts; this docs guide may be technical.
- The active public carriers today are `Med Auto Science` for `Research Ops`, `RedCube AI` for `Presentation Ops`, and the active `Med Auto Grant` repository line for medical `Grant Ops`, with top-level admission and handoff wording still separately gated at `OPL`.

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
The important change is both how readers enter it and which technical truth is currently frozen:

- human experts should enter through the repository home and Layer 1
- technical planners should combine the technical working set with Layer 2
- developers should treat Layers 3 and 4 as supporting material, not the public front page
- live front-desk, hosted, and domain-entry truth should still be read from [Status](./status.md)
- `opl frontdesk-bootstrap --path <workspace>` is now the shortest user-facing bootstrap for the local GUI stack: it lands `OPL Atlas`, `OPL Agent`, and the built-in `OPL Cortex` MCP bridge while inheriting the current local Codex defaults
- the default `OPL Cortex` bridge is now intentionally small: `project progress`, `execute request`, `task status`, `recent sessions`, `resume session`, `runtime logs`, `projects`, and `activate workspace`
- front-door execution requests now use async acceptance for real work: the shell returns a `task_id` quickly, then the user-facing shell follows progress through `task status` instead of waiting for a single long blocking tool call
- `Codex CLI autonomous` remains the frozen family executor default; model and reasoning inherit the local Codex profile rather than a repo-pinned version
- the shortest usable web path is currently the `LibreChat-first` hosted shell pilot, while the long-line target remains an `OPL`-owned web front desk and managed hosted runtime is still not landed

## Layer 1. Default Public Mainline

These are the first documents for external readers who want the public narrative.
They must stay bilingual and easy to read.

- [Repository Home](../README.md)
- [Roadmap](./roadmap.md)
- [Task Map](./task-map.md)
- [Gateway Federation](./gateway-federation.md)
- [Operating Model](./operating-model.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.md)

## Layer 2. Public Contract And Technical Companion Docs

These documents are still public and bilingual, but they are meant for technical understanding rather than first-read storytelling.

- [OPL Federation Contract](./opl-federation-contract.md)
- [Shared Foundation](./shared-foundation.md)
- [Shared Foundation Ownership](./shared-foundation-ownership.md)
- [Shared Runtime Contract](./shared-runtime-contract.md)
- [Shared Domain Contract](./shared-domain-contract.md)
- [OPL Runtime Naming And Boundary Contract](./opl-runtime-naming-and-boundary-contract.md)
- [OPL Read-Only Discovery Gateway](./opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md)
- [OPL Public Surface Index](./opl-public-surface-index.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)

## Layer 3. Reference-Grade Supporting Docs

Layer 3 holds review, audit, rollout, benchmark, and supporting reference material.
It is repo-tracked, but it should not crowd the public front page.

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
It explains how or why a freeze happened, but it is not the living truth surface.

- `docs/specs/`
- `docs/plans/`
- `docs/history/omx/`

## Documentation Rules

- Keep [Repository Home](../README.md) user-facing and readable for potential users, clinicians, and other non-technical experts.
- Keep Layers 1 and 2 bilingual, because they are part of the public surface.
- Keep Layer 3 reference-grade; it can be detailed, but it should not replace the public entry path.
- Keep Layer 4 as tracked working history rather than current truth.
- When a change affects public wording, gateway contracts, or admitted-domain state, update docs, contracts, and related verification together.

## Governance

- Governance rules now live in [series-doc-governance-checklist.md](./references/series-doc-governance-checklist.md), the technical working set, and the repo-tracked contract/doc surfaces rather than in `AGENTS.md` alone.
- The current four-repo alignment snapshot lives in [four-repo-doc-series-sync-summary-2026-04-14.md](./references/four-repo-doc-series-sync-summary-2026-04-14.md).
- The reusable intake starting point lives in [four-repo-doc-intake-template.md](./references/four-repo-doc-intake-template.md).
- The default central drift audit command is `npm run audit:doc-series`.
