**English** | [中文](./unified-harness-engineering-substrate.zh-CN.md)

# Unified Harness Engineering Substrate

## Purpose

This document defines the shared Harness Engineering language reused across the current `OPL` ecosystem.
Its job is to keep the system family coherent without pretending that every domain already lives inside one monolithic runtime or one shared public codebase.

## What It Is

`Unified Harness Engineering Substrate` is the shared cross-domain contract layer under `OPL`.
It freezes the reusable rules that multiple domain systems should inherit while keeping their own domain contracts, domain gateways, and `Domain Harness OS` implementations.

It is not a new routed hop.
It is the shared contract layer that spans:

- `OPL Gateway / Federation`
- `Domain Gateway`
- `Domain Harness OS`
- the future `Execution Plane / Deployment Shape` migration boundary

## What It Is Not

The substrate is not:

- a claim that every domain already uses one identical object model
- a claim that every domain already runs on one shared code repository
- a replacement for any domain gateway
- a replacement for any `Domain Harness OS`
- a license for `OPL` to bypass a domain gateway and touch domain-local execution directly
- proof that `OPL` already owns the runtime

## Position In The Architecture

The control chain stays:

```text
Human / Agent
  -> OPL Gateway / Federation
      -> Domain Gateway
          -> Domain Harness OS
              -> Review / Audit / Delivery Surfaces
```

The substrate sits across that chain.
It constrains shared language and migration compatibility, but it does not replace routing or domain ownership.

## Shared Invariants

The substrate freezes these shared expectations:

- `Agent-first` is the default execution posture
- current domain repositories are `Auto-only` mainlines on one shared substrate
- any future `Human-in-the-loop` product should reuse the same substrate-compatible contracts as a sibling or upper-layer product rather than forcing same-repo dual-mode logic
- the formal-entry matrix stays explicit: default formal entry `CLI`, supported protocol layer `MCP`, and `controller` as an internal control surface
- state transitions, review surfaces, and delivery boundaries remain auditable
- deployment shape may change without redefining the domain contract

## Shared Runtime Substrate v1

At `S1`, the top layer freezes six shared object groups.
What gets frozen now is language and ownership boundary, not shared implementation.

### 1. `runtime profile`

- top-level definition: the stable isolation envelope for one runtime context across local host-agent and future managed deployment shapes
- not owned by `OPL` top layer: domain-local canonical truth, domain credentials, and domain-specific workflow objects
- truth that stays domain-local: how one profile maps to study, proposal, deck, artifact, or policy objects inside a domain

### 2. `session substrate`

- top-level definition: the durable session / run continuity contract used for search, resume, audit, and cross-session linkage
- not owned by `OPL` top layer: domain-specific conversation semantics, domain object mutation rules, or domain review truth
- truth that stays domain-local: what a session means for one domain workflow and which domain handles it is allowed to advance

### 3. `gateway runtime status`

- top-level definition: the minimal observable status surface for whether one runtime context is healthy, active, interrupted, resumable, or exiting
- not owned by `OPL` top layer: domain-specific business metrics, domain gate outcomes, or publication truth
- truth that stays domain-local: what counts as a healthy or promotable run for one domain workflow

### 4. `memory provider hook`

- top-level definition: the shared hook surface for prefetch, turn sync, delegation sync, and session-end sync
- not owned by `OPL` top layer: one global user-memory product, one canonical memory store, or domain evidence truth
- truth that stays domain-local: object memory, evidence memory, decision memory, and gate memory semantics

### 5. `delivery / cron substrate`

- top-level definition: the shared contract for scheduled continuation, scheduled reporting, and durable delivery targeting
- not owned by `OPL` top layer: domain-specific delivery objects, approval thresholds, or external publication semantics
- truth that stays domain-local: what counts as reportable output, deliverable completion, or scheduled promotion in one domain

### 6. `approval / interrupt / resume`

- top-level definition: the shared control contract for stop, pause, approval, interrupt, and resume across long-running execution
- not owned by `OPL` top layer: one global tool catalog or one global approval policy
- truth that stays domain-local: tool registry contents, dangerous-action policy, budget limits, and escalation rules

## Why `S1` Freezes Language Instead Of Claiming Implementation

`S1` stops at top-level contract freeze because:

- the current domains still carry different runtime internals and different product rhythms
- there is not yet one proven gateway-owned machine-readable surface for these substrate objects
- `OPL` should not claim a shared execution kernel before domain pilots prove what is truly reusable

That is why `S1` belongs in public docs and reference-grade docs first, not directly in `contracts/opl-gateway/*.json`.

## Deployment Shapes

The current default local deployment shape is:

- `Codex`-default host-agent runtime

That is a deployment choice, not the identity of the substrate.
The same substrate should remain compatible with:

- future managed `Web / API` runtimes
- future platform-hosted execution surfaces

Changing the hosting location should not require rewriting the substrate or collapsing domain boundaries.

## From Shared Substrate To A Vertical Online Agent Product Family

The long-term product meaning of this substrate is not to rewrite `OPL` into a general long-running agent platform.
It is to let the `OPL` ecosystem evolve toward a family of vertical online agent products.

In that structure:

- `OPL`
  - remains the top-level `Gateway / Federation`
- the shared runtime substrate
  - gradually owns the cross-domain runtime contracts required for long-running execution
- each `Domain Harness OS`
  - keeps its own product entry, domain objects, gates, audit surfaces, delivery semantics, and canonical truth

The honest order is:

1. freeze the shared runtime substrate language
2. prove a mature local product-runtime pilot in the right domain
3. pull reusable implementation back out of that pilot

## Current Domain Mapping

The current `OPL` family can be read as:

- `Med Auto Science`
  - medical `Research Ops` `Domain Harness OS`
- `RedCube AI`
  - visual-deliverable `Domain Harness OS`
- `Med Auto Grant`
  - future medical `Grant Ops` `Domain Harness OS` direction

`OPL` itself is not one more `Domain Harness OS`.
It remains the top-level gateway and federation layer above those domain systems.

## Further Reading

- [OPL Operating Model](./operating-model.md)
- [OPL Runtime Naming And Boundary Contract](./opl-runtime-naming-and-boundary-contract.md)
- [OPL Roadmap](./roadmap.md)
- [Hermes Agent Runtime Substrate Benchmark](./references/hermes-agent-runtime-substrate-benchmark.md)
