**English** | [中文](./README.zh-CN.md)

# OPL Docs Guide

This directory is the entry index for the repo-tracked docs surface of `One Person Lab`.
The repository home is written first for users who want to install and start working.
This guide is for readers who need the current product model, the active runtime/activation mainline, and the documentation lifecycle map.

## Current Product Model

`OPL` is a complete stage-led family agent runtime framework with Agent executors as the minimum execution unit for high-value knowledge work. Its default minimum execution unit inside a stage is `Codex CLI`; its orchestration unit is the domain `stage`; its product target is fully automated, auditable delivery through recoverable stage attempts, human gates, receipts, projections, and artifact lifecycle.

The current public `OPL` resource model is:

- `System`
- `Engines`
- `Modules`
- `Agents`
- `Workspaces`
- `Sessions`
- `Progress`
- `Artifacts`

The canonical truth is the `Codex-default` session/runtime plus the explicit activation layer and provider-backed family runtime control plane that sit above it.
Admitted domain repositories keep their own agent logic, runtime rules, progress truth, and deliverables.

## Start Here By Audience

| Audience | Start here | Why |
| --- | --- | --- |
| Users | [Repository Home](../README.md) | Install OPL, start the GUI or web entry, and choose Codex or a domain agent for work |
| Technical readers and planners | [Project](./project.md), [Status](./status.md), [Architecture](./architecture.md), [Invariants](./invariants.md), [Decisions](./decisions.md), [Contracts Overview](../contracts/README.md) | Recover the active boundary, the runtime model, and the admitted-domain split |
| Developers and maintainers | [Documentation Portfolio](./docs_portfolio_consolidation.md), [Active Docs](./active/README.md), [Public Docs](./public/README.md), [Specs Index](./specs/README.md), [Reference Index](./references/README.md), [History Archive](./history/README.md) | Inspect lifecycle roles, active support docs, public support docs, the current spec entry, references, and retired lanes |

## Fast Technical Working Set

These files give the fastest read on the current repo-tracked truth before you change anything:

- [Project](./project.md)
- [Status](./status.md)
- [Architecture](./architecture.md)
- [Invariants](./invariants.md)
- [Decisions](./decisions.md)
- [Contracts Overview](../contracts/README.md)
- [Documentation Portfolio](./docs_portfolio_consolidation.md)
- [OPL Family Development Reference](./active/opl-family-development-reference.zh-CN.md)
- [OPL Family Content-Level Docs Consolidation](./references/convergence-governance/family-content-level-docs-consolidation-2026-05-11.zh-CN.md)
- [OPL Current Development Lines](./active/current-development-lines.md)
- [OPL Development Document Portfolio](./active/development-document-portfolio.md)
- [Family Docs Lifecycle Governance Rollout](./references/convergence-governance/family-docs-lifecycle-governance-rollout-2026-05-09.zh-CN.md)
- [OPL Runtime Manager Target](./references/runtime-substrate/opl-runtime-manager-target.md)
- [Runtime Substrate References](./references/runtime-substrate/README.md)
- [OPL Stage-Led Agent Framework Roadmap](./references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md)
- [Family Domain Memory Governance](./references/operating-governance/family-domain-memory-governance.zh-CN.md)
- [Specs Index](./specs/README.md)

For OPL-family development after the 2026-05-14 layered-planning reset, use
[OPL Family Development Reference](./active/opl-family-development-reference.zh-CN.md)
as the main reference. OPL keeps global target state, global gaps, shared
primitive absorption, App/workbench targets, domain admission, and cross-repo
execution order. MAS/MAG/RCA repos keep their own target states, gaps,
authority boundaries, direct/hosted paths, and repo-specific absorption lists.
`opl-aion-shell` upstream AionUI docs are outside this directory-governance
scope.

For OPL framework development after the 2026-05-11 architecture reset, use
[OPL Family Development Reference](./active/opl-family-development-reference.zh-CN.md),
[OPL Current Development Lines](./active/current-development-lines.md),
[OPL Development Document Portfolio](./active/development-document-portfolio.md), and
[OPL Stage-Led Agent Framework Roadmap](./references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md).
The family content-level consolidation entry records how the same rule applies
across `OPL`, `MAS`, `MAG`, `RCA`, and `MDS`: keep OPL as framework owner,
keep domain truth in domain repos, and classify old material by paragraph-level
content before moving or archiving files.
The first gives the framework-first execution order. The portfolio classifies old development content as merge, retain, downgrade, retire, or archive. The roadmap owns the current TypeScript control-plane decision,
Temporal provider plan, domain-agent boundary, and retirement discipline for
Hermes-first / Gateway / legacy local-runtime surfaces.
For MAS/MAG/RCA domain experience memory, route patterns, visual patterns, or
template boundaries, read
[Family Domain Memory Governance](./references/operating-governance/family-domain-memory-governance.zh-CN.md).
That entry governs framework/domain ownership without moving domain content into OPL.

## Lifecycle Portfolio

`docs/` is now managed by lifecycle state instead of a flat four-layer pile.
Each long-lived document must have a clear `owner`, `purpose`, `state`, and `machine boundary`.
Lifecycle state is judged by content role, while durable placement converges on the canonical directory set. A file with an active-looking name can still be a superseded plan; a reference file can remain useful only as migration background; a history file can contain command examples that are provenance rather than current guidance.

- `docs/` root keeps only the docs index, core five, and [Documentation Portfolio](./docs_portfolio_consolidation.md).
- `docs/active/` keeps current human-readable runtime, activation, onboarding, and shared-boundary support.
- `docs/public/` keeps public product-direction support read after the repository home.
- `docs/product/` keeps One Person Lab App/workbench, operator-entry, and product-entry support.
- `docs/runtime/` keeps OPL framework runtime, provider/executor, control-plane, and projection/read-model support.
- `docs/delivery/` keeps generic artifact/package/export lifecycle-shell support; domain delivery authority remains in MAS/MAG/RCA.
- `docs/source/` keeps generic workspace/source intake and source-truth transport-shell support; domain source semantics remain in domain repos.
- `docs/policies/` keeps long-lived governance rules and repo-local operating discipline.
- `docs/specs/` only keeps active runtime / product-boundary specs; when it is empty, spec truth has converged into the core five, `docs/active/`, the runtime-substrate roadmap, and machine-readable contracts.
- `docs/references/` keeps support references grouped by purpose.
- `docs/history/` keeps dated snapshots, retired paths, provenance archives, and tombstones.

The live public model stays in [Project](./project.md), [Status](./status.md), and [Architecture](./architecture.md).
The live interaction model is stage-led, runtime-first, skill-first, and built around Agent executors as the minimum execution unit.
Retired `gateway / federation / routed-action` corpus and old local Product API / UI-adapter material stay below the active layers.

## Public Support

The repository home is for potential users first. It must stay install-first, bilingual, readable, and focused on what work OPL can help them start and deliver.
Roadmap and operating-model documents explain product direction after the user knows how to start.

- [Repository Home](../README.md)
- [Roadmap](./public/roadmap.md)
- [Task Map](./public/task-map.md)
- [Operating Model](./public/operating-model.md)
- [Unified Harness Engineering Substrate](./public/unified-harness-engineering-substrate.md)

## Active Support

These human-readable documents support the current `OPL` mainline: `Codex-default executor + explicit activation layer + provider-backed stage runtime + family skill sync/discovery`.

- [Project](./project.md)
- [Status](./status.md)
- [Architecture](./architecture.md)
- [Invariants](./invariants.md)
- [Decisions](./decisions.md)
- [Contracts Overview](../contracts/README.md)
- [OPL Public Surface Index](./active/opl-public-surface-index.md)
- [OPL Family Development Reference](./active/opl-family-development-reference.zh-CN.md)
- [OPL Development Document Portfolio](./active/development-document-portfolio.md)
- [Active Docs Index](./active/README.md)

## References And History

References hold review, audit, rollout, benchmark, migration, examples, and operating-governance material.
They are repo-tracked support, not the default implementation basis.

- [Reference Index](./references/README.md)
- [Runtime Substrate Reference Index](./references/runtime-substrate/README.md)
- [OPL Runtime Manager target](./references/runtime-substrate/opl-runtime-manager-target.md)
- [OPL stage-led agent framework roadmap](./references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md)
- [Current support references](./references/current-support/README.md)
- [Operating governance references](./references/operating-governance/README.md)
- [Docker WebUI deployment reference](./references/current-support/opl-docker-webui-deployment.md)
- [OPL GUI shell adapter boundary](./references/current-support/opl-gui-shell-adapter-boundary.zh-CN.md)
- [OPL fresh install and GUI first-launch testing](./references/current-support/opl-fresh-install-and-gui-first-launch-testing.zh-CN.md)
- [OPL default skill ecosystem reference](./references/current-support/opl-default-skill-ecosystem.md)
- [OPL release and Packages modular distribution reference](./references/current-support/opl-release-packages-modular-distribution.zh-CN.md)
- [OPL test lane governance reference](./references/current-support/opl-test-lane-governance.zh-CN.md)
- [Shared Runtime Contract](./active/shared-runtime-contract.md), [Shared Domain Contract](./active/shared-domain-contract.md), and [OPL Runtime Naming And Boundary Contract](./active/opl-runtime-naming-and-boundary-contract.md) are active shared-boundary support docs. The former Shared Foundation / Shared Foundation Ownership docs have been absorbed into the [OPL Family Development Reference](./active/opl-family-development-reference.zh-CN.md) and public operating model, with historical copies under [Shared Boundary Process History](./history/process/shared-boundary/README.md).
- Retired `gateway / federation / routed-action` material lives in [Gateway / Federation Provenance Archive](./history/compatibility/gateway-federation/README.md).
- Retired frontdoor-era material lives in [Frontdoor Legacy Notes](./history/frontdoor-legacy/README.md).

## History

History explains how or why a freeze happened, while [Status](./status.md) remains the active baseline surface.

- [Process History](./history/process/README.md)
- [History Archive](./history/README.md)

## Where Current Truth Lives

- Public role, active boundary, and default reading order: [Project](./project.md), [Status](./status.md), [Architecture](./architecture.md)
- OPL-owned machine-readable product surfaces: [Contracts Overview](../contracts/README.md)
- Linked domain capability surfaces: the admitted domain repositories plus `opl skill sync`
- Active framework contracts: `contracts/opl-framework/*.json`
- Current runtime / product-boundary spec entry: [Specs Index](./specs/README.md)
- Retired gateway/federation provenance corpus: [Gateway / Federation Provenance Archive](./history/compatibility/gateway-federation/README.md)
- Reference-grade supporting material: [Reference Index](./references/README.md)
- Historical and retired lanes: [History Archive](./history/README.md) and [Process History](./history/process/README.md)

## Documentation Rules

- Keep [Repository Home](../README.md) install-first, user-facing, and readable for potential users, clinicians, and other non-technical experts.
- Keep active public docs bilingual.
- Govern docs through the OPL-family canonical docs taxonomy. Content lifecycle
  decides placement, but the long-lived directory names converge on
  `active/public/product/runtime/delivery/source/policies/specs/references/history`.
- Archive or tombstone superseded plans once their decision has moved into the core five or the current framework roadmap.
- Keep reference-grade docs explicit about provenance vs current truth.
- Keep history as tracked provenance and tombstone material.
- Treat `docs/**` and `README*` as human-readable surfaces: scripts, contracts, tests, and runtime dashboards should use contract files, schema files, source files, CLI/API behavior, or semantic `human_doc:*` ids instead of pinning prose document paths.
- New or moved documents must follow [Documentation Portfolio](./docs_portfolio_consolidation.md) before they become long-lived surfaces.
- Cross-repo docs governance follows the [OPL Family Development Reference](./active/opl-family-development-reference.zh-CN.md), the [Family Docs Lifecycle Governance Rollout](./references/convergence-governance/family-docs-lifecycle-governance-rollout-2026-05-09.zh-CN.md), and the [OPL Family Content-Level Docs Consolidation](./references/convergence-governance/family-content-level-docs-consolidation-2026-05-11.zh-CN.md): OPL, MAS, MAG, and RCA converge on the same canonical docs taxonomy. Older `program/plans/capabilities` directories should be physically migrated when possible; any retained old path is external/upstream support, history/provenance, or tombstone context, not a parallel long-term taxonomy. `opl-aion-shell` docs are upstream AionUI dependency docs and are outside this directory-governance scope.
- When a change affects public wording, contracts, or admitted-domain state, update docs, contracts, and related verification together.
