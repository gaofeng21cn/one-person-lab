**English** | [中文](./README.zh-CN.md)

# OPL Docs Guide

This directory is the entry index for the repo-tracked docs surface of `One Person Lab`.
The repository home is written first for users who want to install and start working.
This guide is for readers who need the current product model, the active runtime/activation mainline, and the supporting reference and history layers.

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

The canonical truth is the `Codex-default` session/runtime plus the explicit activation layer that sits above it.
Admitted domain repositories keep their own agent logic, runtime rules, progress truth, and deliverables.

## Start Here By Audience

| Audience | Start here | Why |
| --- | --- | --- |
| Users | [Repository Home](../README.md) | Install OPL, start the GUI or web entry, and choose Codex or a domain agent for work |
| Technical readers and planners | [Project](./project.md), [Status](./status.md), [Architecture](./architecture.md), [Invariants](./invariants.md), [Decisions](./decisions.md), [Contracts Overview](../contracts/README.md) | Recover the active boundary, the runtime model, and the admitted-domain split |
| Developers and maintainers | [Reference Index](./references/README.md), `docs/specs/`, `docs/plans/`, [History Archive](./history/README.md) | Inspect supporting material, compatibility notes, and retired lanes |

## Fast Technical Working Set

These files give the fastest read on the current repo-tracked truth before you change anything:

- [Project](./project.md)
- [Status](./status.md)
- [Architecture](./architecture.md)
- [Invariants](./invariants.md)
- [Decisions](./decisions.md)
- [Contracts Overview](../contracts/README.md)
- [OPL Runtime Manager Target](./references/opl-runtime-manager-target.md)

## The Four-Layer Docs System

The repository still uses the four-layer `OPL` docs system.
Use it like this:

- Layer 1 explains the user-facing install, start, and product narrative.
- Layer 2 explains the active runtime/activation mainline.
- Layer 3 keeps reference, compatibility, audit, and migration material.
- Layer 4 keeps tracked history.

The live public model stays in [Project](./project.md), [Status](./status.md), and [Architecture](./architecture.md).
The live interaction model is runtime-first and skill-first.
Retired `gateway / federation / routed-action` corpus and retired `frontdesk`-era material stay below the active layers.

## Layer 1. Default Public Mainline

These are the first documents for external readers. The repository home is the user quick-start and must stay install-first, bilingual, and easy to read. Roadmap and operating-model documents explain product direction after the user knows how to start.

- [Repository Home](../README.md)
- [Roadmap](./roadmap.md)
- [Task Map](./task-map.md)
- [Operating Model](./operating-model.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.md)

## Layer 2. Active Runtime / Activation Docs

These documents are still public and bilingual.
They define the current `OPL` mainline: `Codex-default session/runtime + explicit activation layer + family skill sync/discovery`.

- [Project](./project.md)
- [Status](./status.md)
- [Architecture](./architecture.md)
- [Invariants](./invariants.md)
- [Decisions](./decisions.md)
- [Contracts Overview](../contracts/README.md)
- [Shared Foundation](./shared-foundation.md)
- [Shared Foundation Ownership](./shared-foundation-ownership.md)
- [OPL Public Surface Index](./opl-public-surface-index.md)

## Layer 3. Reference / Compatibility Docs

Layer 3 holds review, audit, rollout, benchmark, migration, and retired contract material.
It is repo-tracked supporting material, not the default implementation basis.

- [Reference Index](./references/README.md)
- [OPL Runtime Manager target](./references/opl-runtime-manager-target.md)
- [Docker WebUI deployment reference](./references/opl-docker-webui-deployment.md)
- [OPL default skill ecosystem reference](./references/opl-default-skill-ecosystem.md)
- product-runtime and executor reference notes
- [Shared Runtime Contract](./shared-runtime-contract.md), [Shared Domain Contract](./shared-domain-contract.md), and [OPL Runtime Naming And Boundary Contract](./opl-runtime-naming-and-boundary-contract.md) are retained as shared-boundary reference documents; their `gateway / harness` wording is compatibility language under the current domain-agent model.
- domain alignment and delta-intake records
- benchmark and rollout boards
- retired `gateway / federation / routed-action` contract corpus kept for audit, compatibility, and schema archaeology
- retired `frontdesk`-era reference material kept for audit only

## Layer 4. Historical Specs And Plans

Layer 4 is tracked working history.
It explains how or why a freeze happened, while [Status](./status.md) remains the active baseline surface.

- `docs/specs/`
- `docs/plans/`
- [History Archive](./history/README.md)

## Where Current Truth Lives

- Public role, active boundary, and default reading order: [Project](./project.md), [Status](./status.md), [Architecture](./architecture.md)
- OPL-owned machine-readable product surfaces: [Contracts Overview](../contracts/README.md)
- Linked domain capability surfaces: the admitted domain repositories plus `opl skill sync`
- Legacy gateway/federation compatibility corpus: `contracts/opl-gateway/*.json` and the paired gateway docs
- Reference-grade supporting material: [Reference Index](./references/README.md)
- Historical and retired lanes: [History Archive](./history/README.md)

## Documentation Rules

- Keep [Repository Home](../README.md) install-first, user-facing, and readable for potential users, clinicians, and other non-technical experts.
- Keep active public docs bilingual.
- Keep Layer 3 reference-grade and explicit about compatibility vs current truth.
- Keep Layer 4 as tracked working history.
- When a change affects public wording, contracts, or admitted-domain state, update docs, contracts, and related verification together.
