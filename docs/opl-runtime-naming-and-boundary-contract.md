**English** | [中文](./opl-runtime-naming-and-boundary-contract.zh-CN.md)

# OPL Runtime Naming And Boundary Contract

## Purpose

This document freezes the core runtime-related naming in the `OPL` ecosystem so the following layers stop being blurred together:

- top-level `Gateway / Federation`
- `Unified Harness Engineering Substrate`
- `Shared Runtime Contract`
- `Shared Domain Contract`
- `domain gateway`
- `Domain Harness OS`
- `execution plane`
- `deployment shape`

It answers three questions:

1. Which layer each current repository actually belongs to.
2. How `Codex-default host-agent runtime` relates to a future `managed runtime`.
3. How a `domain harness + controlled execution engine` pair such as `MedAutoScience` and `MedDeepScientist` should be described without collapsing their boundary.

## Scope

This contract governs the unified public naming and boundary wording for the current `OPL` ecosystem, covering:

- `one-person-lab`
- `med-autoscience`
- `redcube-ai`
- `med-autogrant`

It also governs how `OPL` describes lower-layer execution engines such as `MedDeepScientist`.

This document freezes naming and boundaries. It does not claim that the ecosystem already has:

- one shared execution core
- a platform-managed shared execution layer
- a future `Human-in-the-loop` product

## Canonical Control Chain

The recommended long-term chain is:

```text
Human / Agent
  -> OPL Gateway / Federation
      -> Unified Harness Engineering Substrate
          -> Shared Runtime Contract
          -> Shared Domain Contract
              -> Domain Gateway
                  -> Domain Harness OS
                      -> Execution Plane
                          -> Deployment Shape
```

Each layer answers a different question:

- `OPL Gateway / Federation`
  - top-level task semantics, cross-domain routing, admission language, and boundary contracts
- `Unified Harness Engineering Substrate`
  - the shared top-level Harness Engineering umbrella language across domains
- `Shared Runtime Contract`
  - the shared cross-domain contract for long-running runtime behavior
- `Shared Domain Contract`
  - the shared cross-domain contract for formal product behavior
- `Domain Gateway`
  - the stable formal entry and public contract surface for one domain
- `Domain Harness OS`
  - the orchestration, governance, review, and delivery system for one domain
- `Execution Plane`
  - the layer that actually runs sessions, quests, runs, worktrees, watch, and resume
- `Deployment Shape`
  - where the execution plane runs and who owns its lifecycle

## Canonical Terms

| Term | Frozen meaning | Current or future example | Explicitly not |
| --- | --- | --- | --- |
| `OPL Gateway / Federation` | top-level task semantics, cross-domain routing, boundary freeze, and admission language | `one-person-lab` | domain-local runtime owner |
| `Unified Harness Engineering Substrate` | shared top-level Harness Engineering umbrella language across domains | layering rules, shared principles, contract family name | shared execution core |
| `Shared Runtime Contract` | shared cross-domain contract for long-running runtime behavior | `runtime profile`, `session substrate`, `gateway runtime status` | domain truth |
| `Shared Domain Contract` | shared cross-domain contract for formal product behavior | formal-entry matrix, the `per-run handle`, durable report, gate semantics | domain object model |
| `Domain Gateway` | stable formal entry and public contract surface for one domain | `MedAutoScience`, `RedCube AI` | execution engine |
| `Domain Harness OS` | execution, governance, audit, and delivery system for one domain | `MedAutoScience`, `RedCube AI` | top-level federation |
| `Execution Plane` | the runtime layer that drives quests, runs, sessions, worktrees, watch, and resume | the layer currently carried by `MedDeepScientist` for `MedAutoScience` | top-level public product surface |
| `Host-Agent Runtime` | a local deployment shape for the execution plane driven by a host agent on the user's machine | current `Codex-default host-agent runtime` | managed runtime |
| `Managed Runtime` | a platform-managed deployment shape for the execution plane where lifecycle, scheduling, isolation, and recovery are platform-owned | future `managed web runtime` | domain gateway |
| `Managed Execution Plane` | an internal architecture term for the platform-managed execution plane itself | a future shared managed execution layer | the already-implemented public mainline |

## Current Repository Roles

| Repository | Frozen current role | Runtime relationship |
| --- | --- | --- |
| `one-person-lab` | public explanation and contract-first surface for `OPL Gateway / Federation` | defines language and boundaries, not runtime ownership |
| `med-autoscience` | `Domain Gateway + Domain Harness OS` for medical `Research Foundry` | owns medical domain contracts, governance, delivery, and external formal entry |
| `redcube-ai` | `Domain Gateway + Domain Harness OS` for visual delivery | owns visual-delivery contracts, governance, delivery, and external formal entry |
| `med-autogrant` | future `Domain Gateway + Domain Harness OS` direction for `Grant Foundry` | currently still below admitted-domain runtime ownership |

`MedDeepScientist` is not one more top-level peer `domain repo` inside `OPL`.
The more accurate wording today is:

- it is a `controlled quest runtime` under `MedAutoScience`
- it carries the main implementation of the current `Execution Plane` for `MedAutoScience`
- it is not a fifth top-level `Domain Harness OS`
- it is not the system identity or public entrypoint of `MedAutoScience`

## `Codex-default host-agent runtime` And `managed runtime`

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

- top-level `OPL` federation semantics
- the shared invariants in `Unified Harness Engineering Substrate`
- the shared runtime objects in the `Shared Runtime Contract`
- the shared formal behavior objects in the `Shared Domain Contract`
- the boundary between `domain gateway` and `Domain Harness OS`
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

If the ecosystem later adopts a `Hermes`-backed runtime substrate, the accurate description should still be:

- it is an implementation direction for the `Shared Runtime Contract`
- it is not the whole `UHS`
- it does not replace the `OPL Gateway`, any `Domain Gateway`, or any `Domain Harness OS`

### Main benefits of the migration

If a future `managed runtime` becomes real, the main benefits should come from:

- lower dependence on local machine state
- cleaner lifecycle management for long-running work
- more stable watch, status, resume, and replay semantics
- lower operator burden
- easier support for future `Human-in-the-loop` sibling or upper-layer products

### What the migration is not for

This migration should not be described as:

- removing domain gateways
- turning `OPL` into the runtime owner
- collapsing multiple domains into one monolithic runtime
- claiming that the current public truth already includes a unified platform runtime

## Frozen Boundary Between `MedAutoScience` And `MedDeepScientist`

The more accurate current structure is:

```text
Human / Agent
  -> MedAutoScience
      -> runtime protocol / runtime transport
          -> MedDeepScientist
              -> quest runtime / daemon / worktrees
```

Within that structure:

- `MedAutoScience`
  - is the `Domain Gateway + Domain Harness OS` for medical `Research Foundry`
  - is the formal public entry, domain-contract owner, governance owner, and delivery owner
- `MedDeepScientist`
  - is the main current implementation of the `Execution Plane` under `MedAutoScience`
  - is a `controlled quest runtime`
  - is not the system identity of `MedAutoScience`
  - is not a top-level peer domain under `OPL`
  - is not the owner of future public product naming

### Current five-plane split

| Plane | Frozen responsibility of `MedAutoScience` | Frozen responsibility of `MedDeepScientist` |
| --- | --- | --- |
| `Asset Layer` | medical study, workspace, artifact contracts, and canonical asset truth | runtime working copies, imported runtime materials, quest-local files |
| `Memory Layer` | reusable medical research memory, controller summaries, decision history | runtime memory and local quest continuation state |
| `Governance Layer` | continue, stop, reframe, `publication_eval`, `controller_decisions`, fail-closed gates | quest, session, and run operational guards and state machines |
| `Delivery Layer` | manuscript, submission, formal reports, and delivery contracts | runtime summaries, handoffs, escalation, and completion hooks |
| `Execution Layer` | external formal entry, runtime-protocol adapter, handle mapping, and controller orchestration | the actual implementation of daemon, quest, run, worktree, watch, resume, and runtime audit |

So `MedDeepScientist` should not be described as the top-level owner of all five planes.
The more accurate reading is:

- `MedAutoScience` owns the medical domain semantics and external contracts across the five planes
- `MedDeepScientist` mainly carries the concrete implementation of the execution plane

## Frozen Rules For Ingesting `MedDeepScientist` Into A `MedAutoScience` Monorepo

If the system later enters `monorepo / runtime core ingest / controlled cutover`, the following rules should stay fixed:

1. What gets absorbed is the execution engine, not the public identity of `MedAutoScience`.
2. The ingested `MedDeepScientist` should live as part of an internal `runtime` module inside `MedAutoScience`, rather than reclaiming the public entrypoint role.
3. The stable `MedAutoScience -> MedDeepScientist` runtime protocol should remain semantically equivalent across the cutover instead of being rewritten mid-migration.
4. Handle semantics, durable surfaces, gate semantics, and compatibility regression should be stabilized before physical migration.
5. Only after domain contracts are stable should the external controlled runtime repository be ingested as an internal runtime module.

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
- monorepo ingest means the boundary between domain gateway and execution engine disappears
- a future `managed runtime` is already part of current repo-tracked reality

Describe it as:

- `OPL` owns federation language
- each domain repository owns `domain gateway + Domain Harness OS`
- execution engines own the execution plane
- `host-agent runtime` and `managed runtime` are two deployment shapes of the execution plane
- a future migration changes how the execution plane is hosted, not the domain contract

## Further Reading

- [OPL Operating Model](./operating-model.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.md)
- [Shared Foundation](./shared-foundation.md)
- [Codex-default Host-Agent Runtime Contract](./references/host-agent-runtime-contract.md)
- [Ecosystem Status Matrix](./references/ecosystem-status-matrix.md)
