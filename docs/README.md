**English** | [中文](./README.zh-CN.md)

# OPL Docs Guide

This directory is the entry index for the repo-tracked docs surface of `One Person Lab`.
The repository home is written first for potential users and human experts.
This guide points readers to the current product model, the core working set, and the supporting reference and history layers.

## Current Product Model

The current public `OPL` model is:

- `System`
- `Engines`
- `Modules`
- `Agents`
- `Workspaces`
- `Sessions`
- `Progress`
- `Artifacts`

GUI shells and the CLI consume these same product surfaces.
Domain repositories keep their own agent logic, runtime rules, and deliverables.

## Start Here By Audience

| Audience | Start here | Why |
| --- | --- | --- |
| Potential users and human experts | [Repository Home](../README.md), [Roadmap](./roadmap.md), [Task Map](./task-map.md), [Operating Model](./operating-model.md) | Understand what `OPL` is used for and how the product families fit together |
| Technical readers and planners | [Project](./project.md), [Status](./status.md), [Architecture](./architecture.md), [Invariants](./invariants.md), [Decisions](./decisions.md), [Contracts Overview](../contracts/README.md) | Understand the product boundary, resource model, and active technical direction |
| Developers and maintainers | [Reference Index](./references/README.md), `docs/specs/`, `docs/plans/`, [History Archive](./history/README.md) | Inspect implementation support material, migration notes, and retired lanes |

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
- the live public product model stays in [Project](./project.md), [Status](./status.md), and [Architecture](./architecture.md)
- retired `frontdesk`-era material stays in reference or history layers only

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

Layer 3 holds review, audit, rollout, benchmark, and migration reference material.
It is repo-tracked supporting material.

- [Reference Index](./references/README.md)
- product-runtime and executor reference notes
- domain alignment and delta-intake records
- benchmark and rollout boards
- retired `frontdesk`-era reference material kept for audit only

## Layer 4. Historical Specs And Plans

Layer 4 is working history.
It explains how or why a freeze happened, while [Status](./status.md) remains the active baseline surface.

- `docs/specs/`
- `docs/plans/`
- [History Archive](./history/README.md)

## Where Current Truth Lives

- Public role, active boundary, and default reading order: [Project](./project.md), [Status](./status.md), [Architecture](./architecture.md)
- Machine-readable product surfaces: [Contracts Overview](../contracts/README.md) and `contracts/opl-gateway/*.json`
- Reference-grade supporting material: [Reference Index](./references/README.md)
- Historical and retired lanes: [History Archive](./history/README.md)

## Documentation Rules

- Keep [Repository Home](../README.md) user-facing and readable for potential users, clinicians, and other non-technical experts.
- Keep Layers 1 and 2 bilingual, because they are part of the public surface.
- Keep Layer 3 reference-grade and detailed.
- Keep Layer 4 as tracked working history.
- When a change affects public wording, contracts, or admitted-domain state, update docs, contracts, and related verification together.
