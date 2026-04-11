**English** | [中文](./opl-runtime-naming-and-boundary-contract.zh-CN.md)

# OPL Runtime Naming And Boundary Contract

## Purpose

This document freezes the runtime-related naming used across the current `OPL` ecosystem so the following layers stop being blurred together:

- top-level `Gateway / Federation`
- shared runtime substrate
- `Domain Gateway`
- `Domain Harness OS`
- `Execution Plane`
- `Deployment Shape`

It answers four questions:

1. Which layer each current repository actually belongs to.
2. How `Codex`-default host-agent runtime relates to a future managed runtime.
3. Which shared runtime-substrate objects are frozen at `S1`.
4. Which truths must stay inside domains rather than moving up into `OPL`.

## Scope

This contract governs unified public naming and boundary wording for the current `OPL` ecosystem, covering:

- `one-person-lab`
- `med-autoscience`
- `redcube-ai`
- `med-autogrant`

It freezes naming and boundaries only.
It does **not** claim that the ecosystem already has:

- one shared execution core
- one platform-managed shared execution layer
- one shared hosted product entry

## Canonical Control Chain

The control chain stays:

```text
Human / Agent
  -> OPL Gateway / Federation
      -> Domain Gateway
          -> Domain Harness OS
```

The layers below that chain are still real, but they are not extra routed hops:

- `shared runtime substrate`
  - the cross-domain contract layer that constrains runtime naming, migration compatibility, and shared invariants
- `Execution Plane`
  - the layer that actually runs sessions, runs, watch, stop, and resume for one domain runtime
- `Deployment Shape`
  - where that execution plane runs and who owns its lifecycle

So the substrate is a shared contract layer, not a separate routing layer between `OPL Gateway` and `Domain Gateway`.

## Canonical Terms

| Term | Frozen meaning | Current or future example | Explicitly not |
| --- | --- | --- | --- |
| `OPL Gateway / Federation` | top-level task semantics, cross-domain routing language, admission language, and boundary freeze | `one-person-lab` | domain-local runtime owner |
| `shared runtime substrate` | the cross-domain runtime contract layer that multiple domains can reuse | `runtime profile`, `session substrate`, `gateway runtime status` | shared execution kernel already implemented today |
| `Domain Gateway` | the stable formal entry and public contract surface for one domain | `MedAutoScience`, `RedCube AI` | execution engine |
| `Domain Harness OS` | the execution, governance, audit, and delivery system for one domain | `MedAutoScience`, `RedCube AI` | top-level federation |
| `Execution Plane` | the runtime layer that drives sessions, runs, stop, resume, watch, and recovery | current controlled runtimes inside domains | public product identity |
| `Host-Agent Runtime` | a local deployment shape for the execution plane driven by a host agent on the user-controlled machine | current `Codex`-default host-agent runtime | managed runtime |
| `Managed Runtime` | a platform-managed deployment shape for the execution plane where lifecycle, scheduling, isolation, and recovery are platform-owned | future managed `Web / API` runtime | current public mainline |

## Current Repository Roles

| Repository | Frozen current role | Runtime relationship |
| --- | --- | --- |
| `one-person-lab` | public explanation and contract-first surface for `OPL Gateway / Federation` | defines language and boundaries, not runtime ownership |
| `med-autoscience` | `Domain Gateway + Domain Harness OS` for medical `Research Ops` | owns medical domain contracts, governance, delivery, and future pilot absorption |
| `redcube-ai` | `Domain Gateway + Domain Harness OS` for visual delivery | owns visual-delivery contracts, governance, delivery, and later substrate absorption |
| `med-autogrant` | future `Domain Gateway + Domain Harness OS` direction for `Grant Ops` | currently still below admitted-domain runtime ownership |

## Shared Runtime Substrate v1

At `S1`, `OPL` freezes six shared object groups.
For each object, the top layer freezes definition and ownership boundary only.
It does not claim shared implementation.

### 1. `runtime profile`

- top-level unified definition:
  - the stable isolation envelope for one runtime context across local and future managed deployment shapes
- not part of `OPL` top-layer ownership:
  - domain-local canonical truth
  - domain-local credentials
  - domain-specific workflow objects
- truth that must stay inside domains:
  - how one profile maps to studies, proposals, deck families, artifact roots, or domain policy
- why only language is frozen now:
  - each domain still uses different local layouts and runtime internals

### 2. `session substrate`

- top-level unified definition:
  - the durable continuity contract for search, resume, audit, and cross-session linkage
- not part of `OPL` top-layer ownership:
  - domain-specific mutation rules
  - domain review truth
  - domain-specific conversation semantics
- truth that must stay inside domains:
  - what a session means for one workflow and which domain handles it may advance
- why only language is frozen now:
  - there is not yet one proven cross-domain session implementation

### 3. `gateway runtime status`

- top-level unified definition:
  - the minimal observable runtime-health surface for active, interrupted, resumable, or exiting runtime contexts
- not part of `OPL` top-layer ownership:
  - domain business metrics
  - domain gate outcomes
  - publication truth
- truth that must stay inside domains:
  - what counts as healthy or promotable runtime state for one domain workflow
- why only language is frozen now:
  - current status surfaces still differ by domain runtime

### 4. `memory provider hook`

- top-level unified definition:
  - the shared hook surface for prefetch, turn sync, delegation sync, and session-end sync
- not part of `OPL` top-layer ownership:
  - one global user-memory product
  - one canonical memory store
  - domain evidence truth
- truth that must stay inside domains:
  - object memory, evidence memory, decision memory, gate memory, and their retrieval policy
- why only language is frozen now:
  - the right memory shape is domain-centric rather than one global implementation

### 5. `delivery / cron substrate`

- top-level unified definition:
  - the shared contract for scheduled continuation, scheduled reporting, and durable delivery targeting
- not part of `OPL` top-layer ownership:
  - domain-specific delivery objects
  - approval thresholds
  - external publication semantics
- truth that must stay inside domains:
  - what counts as reportable output, deliverable completion, or scheduled promotion
- why only language is frozen now:
  - no domain-independent delivery engine has been proven yet

### 6. `approval / interrupt / resume`

- top-level unified definition:
  - the shared control contract for stop, pause, approval, interrupt, and resume across long-running execution
- not part of `OPL` top-layer ownership:
  - one global approval policy
  - one global dangerous-tool policy
  - one global tool catalog
- truth that must stay inside domains:
  - tool registry contents, approval scope, dangerous-action gates, output budgets, and escalation rules
- why only language is frozen now:
  - tool surfaces and approval semantics still depend on domain workflow reality

The tool registry sits inside this sixth object group:
the shared contract may freeze registry semantics, but actual tools remain domain-scoped.

## `Codex`-Default Host-Agent Runtime And Future Managed Runtime

### What the current reality is

The current public truth across the ecosystem is:

- the default local deployment shape is the `Codex`-default host-agent runtime
- active execution is currently Codex-only
- this is a real runtime, but it is not yet a managed runtime

Its exact meaning is:

- a `Codex`-class agent acts as the default host executor
- the execution plane still runs primarily on the user's machine or in a user-controlled local environment
- local filesystem, worktrees, tools, binaries, and machine constraints remain part of the runtime reality
- long-running work can be orchestrated, resumed, and audited, but lifecycle and operations are not yet platform-owned

### Why it is not the same as a managed runtime

To become a managed runtime in the sense used here, the key change is not “a stronger model” or “a longer-running Codex session.”
The key change is:

- the execution plane becomes platform-owned instead of primarily machine-owned
- lifecycle of sessions, runs, and recovery becomes platform-maintained
- sandboxing, tool connectivity, observability, scheduling, and recovery become formal managed capabilities

### Their relationship

`Host-Agent Runtime` and `Managed Runtime` are two deployment shapes of the execution plane:

- current shape: `host-agent runtime`
- future shape: `managed runtime`

What should remain shared across both shapes is:

- domain contracts
- the formal-entry matrix
- execution-handle semantics
- audit, review, and delivery contracts
- the shared runtime-substrate object language frozen at `S1`

## Boundary Rules

Do not describe the system as if:

- `OPL` is the runtime owner
- `shared runtime substrate v1` is already a shared implementation
- `Managed Runtime` only means “a longer-running Codex session”
- moving to a managed runtime removes domain gateways
- `contracts/opl-gateway/*.json` already materialize the whole substrate

Describe it as:

- `OPL` owns federation language and top-level boundary freeze
- each domain repository owns `Domain Gateway + Domain Harness OS`
- execution planes own runtime execution
- `host-agent runtime` and `managed runtime` are two deployment shapes of the execution plane
- `S1` freezes language first so later domain pilots can prove what belongs in shared implementation

## Further Reading

- [OPL Operating Model](./operating-model.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.md)
- [OPL Roadmap](./roadmap.md)
- [Hermes Agent Runtime Substrate Benchmark](./references/hermes-agent-runtime-substrate-benchmark.md)
