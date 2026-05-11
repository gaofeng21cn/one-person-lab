**English** | [中文](./README.zh-CN.md)

# OPL Docs Guide

This directory is the entry index for the repo-tracked docs surface of `One Person Lab`.
The repository home is written first for users who want to install and start working.
This guide is for readers who need the current product model, the active runtime/activation mainline, and the documentation lifecycle map.

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
| Developers and maintainers | [Documentation Portfolio](./docs_portfolio_consolidation.md), [Active Docs](./active/README.md), [Public Docs](./public/README.md), [Reference Index](./references/README.md), current specs under `docs/specs/`, [History Archive](./history/README.md) | Inspect lifecycle roles, active support docs, public support docs, references, specs, and retired lanes |

## Fast Technical Working Set

These files give the fastest read on the current repo-tracked truth before you change anything:

- [Project](./project.md)
- [Status](./status.md)
- [Architecture](./architecture.md)
- [Invariants](./invariants.md)
- [Decisions](./decisions.md)
- [Contracts Overview](../contracts/README.md)
- [Documentation Portfolio](./docs_portfolio_consolidation.md)
- [Family Docs Lifecycle Governance Rollout](./references/convergence-governance/family-docs-lifecycle-governance-rollout-2026-05-09.zh-CN.md)
- [OPL Runtime Manager Target](./references/runtime-substrate/opl-runtime-manager-target.md)
- [OPL Stage-Led Agent Framework Roadmap](./references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md)

For OPL framework development after the 2026-05-11 architecture reset, use
[OPL Stage-Led Agent Framework Roadmap](./references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md)
as the master entry. It owns the current TypeScript control-plane decision,
Temporal provider plan, domain-agent boundary, and retirement discipline for
Hermes-first / Gateway / legacy local-runtime surfaces.

## Lifecycle Portfolio

`docs/` is now managed by lifecycle state instead of a flat four-layer pile.
Each long-lived document must have a clear `owner`, `purpose`, `state`, and `machine boundary`.

- `docs/` root keeps only the docs index, core five, and [Documentation Portfolio](./docs_portfolio_consolidation.md).
- `docs/active/` keeps current human-readable runtime, activation, onboarding, and shared-boundary support.
- `docs/public/` keeps public product-direction support read after the repository home.
- `docs/specs/` keeps active runtime / product-boundary specs.
- `docs/references/` keeps support references grouped by purpose.
- `docs/history/` keeps dated snapshots, retired routes, compatibility archives, and tombstones.

The live public model stays in [Project](./project.md), [Status](./status.md), and [Architecture](./architecture.md).
The live interaction model is runtime-first and skill-first.
Retired `gateway / federation / routed-action` corpus and old local Product API / UI-adapter material stay below the active layers.

## Public Support

The repository home is the user quick-start and must stay install-first, bilingual, and easy to read.
Roadmap and operating-model documents explain product direction after the user knows how to start.

- [Repository Home](../README.md)
- [Roadmap](./public/roadmap.md)
- [Task Map](./public/task-map.md)
- [Operating Model](./public/operating-model.md)
- [Unified Harness Engineering Substrate](./public/unified-harness-engineering-substrate.md)

## Active Support

These human-readable documents support the current `OPL` mainline: `Codex-default session/runtime + explicit activation layer + family skill sync/discovery`.

- [Project](./project.md)
- [Status](./status.md)
- [Architecture](./architecture.md)
- [Invariants](./invariants.md)
- [Decisions](./decisions.md)
- [Contracts Overview](../contracts/README.md)
- [OPL Public Surface Index](./active/opl-public-surface-index.md)
- [Active Docs Index](./active/README.md)

## References And Compatibility

References hold review, audit, rollout, benchmark, migration, examples, and operating-governance material.
They are repo-tracked support, not the default implementation basis.

- [Reference Index](./references/README.md)
- [OPL Runtime Manager target](./references/runtime-substrate/opl-runtime-manager-target.md)
- [OPL stage-led agent framework roadmap](./references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md)
- [Docker WebUI deployment reference](./references/current-support/opl-docker-webui-deployment.md)
- [OPL GUI shell adapter boundary](./references/current-support/opl-gui-shell-adapter-boundary.zh-CN.md)
- [OPL fresh install and GUI first-launch testing](./references/current-support/opl-fresh-install-and-gui-first-launch-testing.zh-CN.md)
- [OPL default skill ecosystem reference](./references/current-support/opl-default-skill-ecosystem.md)
- [OPL release and Packages modular distribution reference](./references/current-support/opl-release-packages-modular-distribution.zh-CN.md)
- [OPL test lane governance reference](./references/current-support/opl-test-lane-governance.zh-CN.md)
- [Shared Foundation](./active/shared-foundation.md), [Shared Foundation Ownership](./active/shared-foundation-ownership.md), [Shared Runtime Contract](./active/shared-runtime-contract.md), [Shared Domain Contract](./active/shared-domain-contract.md), and [OPL Runtime Naming And Boundary Contract](./active/opl-runtime-naming-and-boundary-contract.md) are active support docs.
- Retired `gateway / federation / routed-action` material lives in [Gateway / Federation Compatibility Archive](./history/compatibility/gateway-federation/README.md).
- Retired frontdoor-era material lives in [Frontdoor Legacy Notes](./history/frontdoor-legacy/README.md).

## History

History explains how or why a freeze happened, while [Status](./status.md) remains the active baseline surface.

- [Process History](./history/process/README.md)
- [History Archive](./history/README.md)

## Where Current Truth Lives

- Public role, active boundary, and default reading order: [Project](./project.md), [Status](./status.md), [Architecture](./architecture.md)
- OPL-owned machine-readable product surfaces: [Contracts Overview](../contracts/README.md)
- Linked domain capability surfaces: the admitted domain repositories plus `opl skill sync`
- Legacy gateway/federation compatibility corpus: `contracts/opl-gateway/*.json` and [Gateway / Federation Compatibility Archive](./history/compatibility/gateway-federation/README.md)
- Reference-grade supporting material: [Reference Index](./references/README.md)
- Historical and retired lanes: [History Archive](./history/README.md) and [Process History](./history/process/README.md)

## Documentation Rules

- Keep [Repository Home](../README.md) install-first, user-facing, and readable for potential users, clinicians, and other non-technical experts.
- Keep active public docs bilingual.
- Keep reference-grade docs explicit about compatibility vs current truth.
- Keep history as tracked provenance and tombstone material.
- Treat `docs/**` and `README*` as human-readable surfaces: scripts, contracts, tests, and runtime dashboards should use contract files, schema files, source files, CLI/API behavior, or semantic `human_doc:*` ids instead of pinning prose document paths.
- New or moved documents must follow [Documentation Portfolio](./docs_portfolio_consolidation.md) before they become long-lived surfaces.
- Cross-repo docs governance follows the [Family Docs Lifecycle Governance Rollout](./references/convergence-governance/family-docs-lifecycle-governance-rollout-2026-05-09.zh-CN.md): keep lifecycle roles equivalent across OPL, MAS, MAG, and RCA without forcing identical directory names.
- When a change affects public wording, contracts, or admitted-domain state, update docs, contracts, and related verification together.
