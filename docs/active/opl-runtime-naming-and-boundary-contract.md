**English** | [中文](./opl-runtime-naming-and-boundary-contract.zh-CN.md)

# OPL Runtime Naming And Boundary Contract

> Current-status note (`2026-05-11`): this document is the active runtime naming boundary for the stage-led OPL framework with Agent executors as the minimum execution unit. Current default public wording is `Codex-default executor -> explicit OPL activation -> provider-backed stage runtime -> MAS/MAG/RCA domain-agent entry`. After the MAS monolith closeout, `MedDeepScientist` is no longer a MAS default operation, diagnostic, runtime-root, or WebUI dependency; it appears only through MAS-declared optional backend-audit, source-provenance, historical-fixture, explicit archive-import, upstream-intake, and parity-oracle references.

## Purpose

This document freezes the core runtime-related naming in the `OPL` ecosystem so the following layers stop being blurred together:

- top-level `Codex-default executor`, explicit activation, and provider-backed stage runtime
- `Unified Harness Engineering Substrate`
- `Shared Runtime Contract`
- `Shared Domain Contract`
- domain-agent entry
- domain-owned authority / runtime controller / delivery system
- `execution plane`
- `deployment shape`

It answers three questions:

1. Which layer each current repository actually belongs to.
2. How retained `host-agent runtime` deployment-shape vocabulary relates to provider-backed stage runtime and a future `managed runtime`.
3. How a domain that has retired an external companion, such as `MedAutoScience` after the MAS monolith closeout, should describe the remaining provenance/audit/parity references without reviving a second public owner.

## Scope

This contract governs the unified public naming and boundary wording for the current `OPL` ecosystem, covering:

- `one-person-lab`
- `med-autoscience`
- `redcube-ai`
- `med-autogrant`

It also governs how `OPL` describes former lower-layer execution companions such as `MedDeepScientist` after they have been retired from default domain operation.

This document freezes naming and boundaries. It does not claim that the ecosystem already has:

- one shared execution core
- a platform-managed shared execution layer
- a future `Human-in-the-loop` product

## Canonical Control Chain

The recommended long-term chain is:

```text
Human / Agent
  -> OPL stage-led Agent executor framework
      -> Unified Harness Engineering Substrate
          -> Shared Runtime Contract
          -> Shared Domain Contract
              -> Domain-agent entry
                  -> Domain-owned authority / runtime controller / delivery system
                      -> Execution Plane
                          -> Deployment Shape
```

Each layer answers a different question:

- `OPL stage-led Agent executor framework`
  - default session/runtime semantics, stage decomposition, explicit domain-agent activation, admission language, and boundary contracts
- `Unified Harness Engineering Substrate`
  - the shared top-level Harness Engineering umbrella language across domains
- `Shared Runtime Contract`
  - the shared cross-domain contract for long-running runtime behavior
- `Shared Domain Contract`
  - the shared cross-domain contract for formal product behavior
- `Domain-agent entry`
  - the stable formal app-skill, CLI, MCP, or product-entry surface for one domain agent
- `Domain-owned authority / runtime controller / delivery system`
  - the domain truth, runtime control, governance, review, and delivery system inside one domain agent
- `Execution Plane`
  - the layer that actually runs sessions, quests, runs, worktrees, watch, and resume
- `Deployment Shape`
  - where the execution plane runs and who owns its lifecycle

## Canonical Terms

| Term | Frozen meaning | Current or future example | Explicitly not |
| --- | --- | --- | --- |
| `OPL framework runtime + activation` | Codex-default executor, explicit domain-agent activation, provider-backed stage runtime, boundary freeze, and admission language | `one-person-lab` | domain-local runtime owner |
| `Unified Harness Engineering Substrate` | shared top-level Harness Engineering umbrella language across domains | layering rules, shared principles, contract family name | shared execution core |
| `Shared Runtime Contract` | shared cross-domain contract for long-running runtime behavior | `runtime profile`, `session substrate`, stage runtime status | domain truth |
| `Shared Domain Contract` | shared cross-domain contract for formal product behavior | formal-entry matrix, the `per-run handle`, durable report, gate semantics | domain object model |
| `Domain Agent Entry` | stable public app-skill, CLI, MCP, or product-entry surface for one domain agent | `MedAutoScience`, `MedAutoGrant`, `RedCube AI` | execution engine |
| `Domain-Owned Truth Surface` | execution, governance, audit, and delivery truth for one domain agent | `MedAutoScience`, `MedAutoGrant`, `RedCube AI` | top-level OPL runtime |
| `Execution Plane` | the runtime layer that drives quests, runs, sessions, worktrees, watch, and resume | MAS-owned runtime surfaces for `MedAutoScience` after monolith closeout | top-level public product surface |
| `Host-Agent Runtime` | a local deployment shape for the execution plane driven by a host agent on the user's machine | current `Codex-default host-agent runtime` | managed runtime |
| `Managed Runtime` | a platform-managed deployment shape for the execution plane where lifecycle, scheduling, isolation, and recovery are platform-owned | future `managed web runtime` | domain-agent entry |
| `Managed Execution Plane` | an internal architecture term for the platform-managed execution plane itself | a future shared managed execution layer | the already-implemented public mainline |

## Current Repository Roles

| Repository | Frozen current role | Runtime relationship |
| --- | --- | --- |
| `one-person-lab` | public explanation and contract-first surface for OPL session/runtime, activation, and shared indexes | defines language and boundaries without taking domain truth ownership |
| `med-autoscience` | independent medical research domain agent | owns medical domain contracts, governance, delivery, and external formal entry |
| `redcube-ai` | independent visual-deliverable domain agent | owns visual-delivery contracts, governance, delivery, and external formal entry |
| `med-autogrant` | independent grant-writing domain agent | owns grant-domain contracts, governance, delivery, and external formal entry |

`MedDeepScientist` is not one more top-level peer `domain repo` inside `OPL`.
The more accurate wording today is:

- it is not a MAS default operation, diagnostic, runtime-root, or WebUI dependency
- it is a MAS-declared optional source-provenance, historical-fixture, explicit archive-import, backend-audit, upstream-intake, and parity-oracle reference
- it is not a fifth top-level domain agent or runtime authority
- it is not the system identity or public entrypoint of `MedAutoScience`

## `Codex-default host-agent runtime` And `managed runtime`

`Host-agent runtime` is retained deployment-shape vocabulary. Current target runtime wording is `Codex CLI concrete executor + provider-backed stage runtime`; this section explains the older local-vs-managed deployment axis without replacing the current target path.

### What the current reality is

The current public truth across the ecosystem is:

- the default local deployment shape is `Codex-default host-agent runtime`
- this is a real runtime
- it is not yet a `managed runtime` in the sense frozen by this contract

Its exact meaning is:

- a `Codex`-class agent acts as the default host executor
- the execution plane still runs primarily on the user's machine or in a user-controlled local environment
- the local filesystem, worktrees, tools, binaries, and machine constraints are still part of the runtime reality
- long-running work can be orchestrated, resumed, and audited, but lifecycle and operations have not yet been fully absorbed by a platform-owned runtime layer

### Why it is not the same as `managed runtime`

If a local `Codex` session is packaged better and can run longer, it is still first a `host-agent runtime`.

To become a `managed runtime` in the sense used here, the key change is not “a stronger model” or “a longer-running Codex session.”
The key change is:

- the execution plane is platform-owned instead of primarily machine-owned
- the lifecycle of sessions, quests, and runs is maintained and restored by the platform
- sandboxing, tool connection, observability, scheduling, and recovery become formal managed capabilities
- users and operators no longer need to personally babysit low-level process, tmux, daemon, path, or recovery details

So `managed runtime` can be understood loosely as:

> a platform-managed long-running agent runtime

But it should not be reduced to:

> just a more persistent Codex session

What is managed is the execution plane, not the model brand.

### Their relationship

`Host-Agent Runtime` and `Managed Runtime` are two deployment shapes for the same execution plane:

- current shape: `host-agent runtime`
- future shape: `managed runtime`

What should stay shared across both shapes is:

- domain contracts
- the formal-entry matrix
- execution-handle semantics
- audit, review, and delivery contracts

Only the way the execution plane is run and owned should change.

## What migration to a future `managed runtime` actually means

This migration should not be understood as “switching domains” or “replacing Codex with some other model.”

The more precise meaning is:

- from: an execution plane primarily carried by the user's machine and driven by a local host agent
- to: an execution plane primarily carried by a platform and managed through a platform-owned lifecycle

### What should stay unchanged

When the ecosystem later moves to a future `managed runtime`, the following should not be rewritten:

- top-level `OPL` framework semantics
- the shared invariants in `Unified Harness Engineering Substrate`
- the shared runtime objects in the `Shared Runtime Contract`
- the shared formal behavior objects in the `Shared Domain Contract`
- the boundary between public domain-agent entry and domain-owned authority / runtime controller
- the formal-entry matrix semantics such as `CLI / MCP / controller`
- the semantic boundary of execution handles such as `program_id / study_id / quest_id / active_run_id`
- ownership of domain-owned audit, review, delivery, and canonical truth

### What may change

What may actually change is the execution plane and deployment shape:

- whether long-running processes sit on a local machine or on a platform
- who owns session, quest, and run lifecycle
- who manages sandboxing, tool connectivity, and credential injection
- whether watch, status, resume, and replay become platform-level capabilities
- whether operators still need to care about local daemons, machine paths, and manual recovery

If a future domain retains upstream `Hermes-Agent` evidence or an explicit `hermes_agent` executor adapter, the accurate description should still be:

- it is an explicit non-default executor adapter, diagnostic evidence, or provenance reference
- it is not the family runtime provider, the production substrate, or the whole `UHS`
- it does not replace the `OPL` framework, any public domain-agent entry, or any domain-owned authority / runtime controller

### Managed Runtime Readiness Dimensions

The useful content from the old `managed-runtime-migration-readiness-checklist` has been absorbed here. Future managed-runtime or runtime-provider migration reviews should use these eight dimensions instead of executing that old checklist as a whole document:

| Dimension | Question | Current owner |
| --- | --- | --- |
| `R1 / naming and ontology` | Are legacy federation vocabulary, domain, execution plane, and deployment shape separated? | This document and the core five |
| `R2 / formal entry` | Are `CLI`, `MCP`, `controller`, app skill, and product entry layered? | Domain onboarding contract and domain owner docs |
| `R3 / execution handle` | Are run, quest, topic, draft, workspace, and program handles stable? | Domain owner docs and machine contracts |
| `R4 / durable surface` | Are audit, review, delivery, status, and report surfaces durable? | Domain owner docs / artifacts / contracts |
| `R5 / hosted-friendly contract extraction` | Can local/runtime surfaces be exported as a future-host-compatible contract bundle? | OPL framework plus domain repo |
| `R6 / runtime protocol narrowness` | Is the execution plane reduced to a stable, auditable, verifiable protocol? | provider / hosted-integration contracts |
| `R7 / external dependency clearance` | Are external runtime, workspace, and human-gate dependencies cleared before cutover? | Domain repo owner |
| `R8 / platform-owned lifecycle` | Are session, watch, resume, replay, and sandbox lifecycle owned by the platform/provider? | Provider-backed framework / future managed runtime |

The current migration order is only a content principle: freeze the OPL framework and provider-backed stage runtime first, migrate domain skeletons / handoff / receipts next, clear external dependencies and legacy residue after that, and validate the result with real domain soak. The per-repository progress judgments in the old checklist are dated snapshots, not current backlog.

### Main benefits of the migration

If a future `managed runtime` becomes real, the main benefits should come from:

- lower dependence on local machine state
- cleaner lifecycle management for long-running work
- more stable watch, status, resume, and replay semantics
- lower operator burden
- easier support for future `Human-in-the-loop` sibling or upper-layer products

### What the migration is not for

This migration should not be described as:

- removing domain-agent entries
- turning `OPL` into the runtime owner
- collapsing multiple domains into one monolithic runtime
- claiming that the current public truth already includes a unified platform runtime

## Superseded Boundary Between `MedAutoScience` And `MedDeepScientist`

This section originally described the migration-era split between `MedAutoScience` and an external `MedDeepScientist` execution plane. The current MAS monolith closeout supersedes that split for default operation.

The more accurate current structure is:

```text
Human / Agent
  -> MedAutoScience
      -> MAS-owned runtime / artifact / quality / progress surfaces
          -> optional source-provenance, historical-fixture, archive-import, backend-audit, upstream-intake, or parity-oracle reference
```

Within that structure:

- `MedAutoScience`
  - is the independent medical research domain agent and MAS app-skill owner
  - is the formal public entry, domain-contract owner, governance owner, runtime/progress owner, and delivery owner
  - owns the default operation, diagnostic, progress, artifact, quality, and OPL handoff surfaces
- `MedDeepScientist`
  - is not a default execution plane under `MedAutoScience`
  - is not a default MAS runtime dependency, diagnostic dependency, runtime root, or WebUI dependency
  - is a source-provenance, historical-fixture, explicit archive-import, backend-audit, upstream-intake, and parity-oracle reference only when MAS declares that reference explicitly
  - is not the system identity of `MedAutoScience`
  - is not a top-level peer domain under `OPL`

### Current five-plane split

| Plane | Current responsibility of `MedAutoScience` | Remaining `MedDeepScientist` role |
| --- | --- | --- |
| `Asset Layer` | medical study, workspace, artifact contracts, canonical asset truth, and artifact discovery | historical fixture or explicit archive-import reference |
| `Memory Layer` | reusable medical research memory, controller summaries, decision history, and calibration evidence | source-provenance or upstream-intake reference |
| `Governance Layer` | continue, stop, reframe, `publication_eval`, `controller_decisions`, fail-closed gates, and owner-route truth | no quality, publication, or controller authority |
| `Delivery Layer` | manuscript, submission, formal reports, delivery contracts, package locators, and rebuild proof | historical behavior fixture only |
| `Execution Layer` | default runtime operation, runtime status/progress, controller orchestration, diagnostics, and OPL handoff | parity oracle / backend-audit reference only |

So `MedDeepScientist` should not be described as the current implementation of MAS default execution.
The more accurate reading is:

- `MedAutoScience` owns the medical domain semantics, external contracts, and default runtime/progress/diagnostic surfaces across the five planes
- `MedDeepScientist` remains outside the default path and only appears as an explicit MAS-declared reference

## Frozen Rules For Past `MedDeepScientist` Monolith Absorb

The MAS monolith closeout has already completed the default-dependency retirement. The rules that remain fixed are:

1. The absorbed capability never changes the public identity of `MedAutoScience`.
2. Default MAS operation must not require an external `MedDeepScientist` checkout, daemon, runtime root, or WebUI.
3. Retained behavior must land in MAS-owned runtime / artifact / quality / progress / diagnostic surfaces, or remain as fixture/provenance/reference material.
4. Compatibility regression and parity proof may cite MDS fixtures, but MDS fixtures never grant medical quality, publication, controller, or artifact authority.
5. Any future upstream intake must use no-history, MAS-authored capability proof and must not import upstream contributor footprint into MAS.

That means the long-term shape is closer to:

```text
MedAutoScience
  -> controller_charter
  -> runtime
       -> ingested execution engine
  -> eval_hygiene
```

Not:

```text
MedAutoScience == MedDeepScientist
```

## Boundary Rules

Do not describe the system as if:

- `OPL` is the runtime owner
- `Managed Runtime` only means “a longer-running Codex”
- `MedDeepScientist` is the system identity of `MedAutoScience`
- monorepo ingest means the boundary between domain-owned authority / runtime controller and execution engine disappears
- a future `managed runtime` is already part of current repo-tracked reality

Describe it as:

- `OPL` owns stage-led framework language
- each domain repository owns domain authority, runtime control, delivery systems, and artifact truth
- execution engines own the execution plane
- `host-agent runtime` and `managed runtime` are two deployment shapes of the execution plane
- a future migration changes how the execution plane is hosted, not the domain contract

## Further Reading

- [OPL Operating Model](../public/operating-model.md)
- [Unified Harness Engineering Substrate](../public/unified-harness-engineering-substrate.md)
- [OPL Family Development Reference](./opl-family-development-reference.zh-CN.md)
- [Shared Runtime Contract](./shared-runtime-contract.md)
- [Shared Domain Contract](./shared-domain-contract.md)
- [Codex-default Host-Agent Runtime Contract historical draft](../history/runtime-substrate/host-agent-runtime-contract.md)
- [Ecosystem Status Matrix](../references/convergence-governance/ecosystem-status-matrix.md)
