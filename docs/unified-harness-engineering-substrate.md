**English** | [中文](./unified-harness-engineering-substrate.zh-CN.md)

# Unified Harness Engineering Substrate

## Purpose

This document defines the shared Harness Engineering language reused across the current `OPL` ecosystem.
It exists so that `OPL` can present a coherent system family without pretending that every domain already lives inside one monolithic runtime or one shared public codebase.

## What It Is

`Unified Harness Engineering Substrate` is the shared Harness Engineering umbrella language under `OPL`.
It describes the reusable rules that multiple domain systems should inherit while keeping their own domain contracts, domain gateways, and `Domain Harness OS` implementations.

The more accurate current reading is:

- `UHS` is the shared umbrella term
- the long-running runtime part inside it is converging into the [Shared Runtime Contract](./shared-runtime-contract.md)
- the cross-domain product-behavior part inside it is converging into the [Shared Domain Contract](./shared-domain-contract.md)

In the current ecosystem, it is the shared substrate below:

- `Med Auto Science`
- `RedCube AI`
- `Med Auto Grant`

## What It Is Not

The substrate is not:

- a claim that every domain already uses one identical object model
- a claim that every domain already runs on one shared code repository
- a replacement for any domain gateway
- a replacement for any `Domain Harness OS`
- a license for `OPL` to bypass a domain gateway and touch domain-local harness execution directly
- a claim that `UHS` is just a wrapper around `Hermes` or any other runtime project

## Layering

The intended architecture stays:

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

The layers mean different things:

- `OPL Gateway / Federation`
  - owns top-level task semantics, routing language, and cross-domain boundary contracts
- `Unified Harness Engineering Substrate`
  - owns the shared Harness Engineering umbrella language reused across domains
- `Shared Runtime Contract`
  - owns the cross-domain contract for long-running runtime behavior
- `Shared Domain Contract`
  - owns the cross-domain contract for formal product behavior
- `Domain Gateway`
  - owns domain-local task entry, routing, and contract hydration
- `Domain Harness OS`
  - owns domain-local execution logic, audit surfaces, and delivery semantics
- `Execution Plane`
  - owns the actual session, run, watch, resume, and delivery execution layer
- `Deployment Shape`
  - owns where and how the harness is hosted, without redefining the domain contract

## Shared Invariants

The substrate freezes these shared expectations:

- `Agent-first` is the default execution posture
- current domain repositories are `Auto-only` mainlines on one shared substrate
- future `Human-in-the-loop` products should reuse the same substrate as compatible sibling or upper-layer products rather than forcing same-repo dual-mode logic
- formal entry should stay explicit through one matrix: default formal entry `CLI`, supported protocol layer `MCP`, and `controller` as an internal control surface
- state transitions, review surfaces, and delivery boundaries should remain auditable
- deployment shape may change without redefining the domain contract

The two contract families that now need the clearest alignment are:

- `Shared Runtime Contract`
  - `runtime profile`
  - `session substrate`
  - `gateway runtime status`
  - `memory provider hook`
  - `delivery / cron`
  - `approval / interrupt / resume`
- `Shared Domain Contract`
  - the formal-entry matrix
  - the `per-run handle`
  - the durable report surface
  - the audit trail surface
  - gate semantics
  - the no-bypass rule to `Domain Gateway`

## Deployment Shapes

At the current stage:

- the active development host is Codex-only local sessions
- the public OPL formal entry remains the local `TypeScript CLI`-first / read-only gateway surface

That split matters: Codex names today's development host, not the identity of the substrate.
The same substrate should remain compatible with:

- future managed web runtimes
- future platform-hosted execution surfaces

If the ecosystem later proves a true upstream `Hermes-Agent` integration inside a domain repository, the accurate place for that choice is:

- an implementation mode for the `Shared Runtime Contract`

not:

- the identity of the whole `UHS`
- a replacement for `OPL`
- an owner of domain truth

Changing the hosting location should not require rewriting the substrate or collapsing domain boundaries.

## From Shared Substrate To A Vertical Online Agent Platform Family

The long-term product meaning of this substrate is not to rewrite `OPL` into a general long-running agent platform.
It is to let the `OPL` ecosystem evolve toward a family of vertical online agent products.

In that structure:

- `OPL`
  - remains the top-level `Gateway / Federation`
- `UHS`
  - remains the shared Harness Engineering umbrella language
- `Shared Runtime Contract`
  - gradually owns shared runtime contracts such as `runtime profile`, `session substrate`, `gateway runtime status`, `memory hook`, `delivery / cron`, and `approval / interrupt`
- `Shared Domain Contract`
  - gradually owns shared cross-domain product-behavior contracts such as the formal-entry matrix, the `per-run handle`, the durable report surface, the audit trail, and gate semantics
- each `Domain Harness OS`
  - keeps its own formal entry, domain objects, gates, audit surfaces, delivery semantics, and canonical truth

That means the more honest direction is not “force all three domain repositories into one execution kernel now.”
It is:

- freeze the shared runtime and shared domain contract language inside `UHS` first
- build a mature local product-runtime pilot in the right domain
- then pull reusable substrate implementation back out of the pilot

This remains a future direction.
It does not mean a unified platform runtime already exists today, and it does not make `OPL` the current runtime owner.

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

## Practical Implication

This shared substrate is meant to make future domain work faster:

- new domain systems should inherit the same execution philosophy
- domain-specific contracts should stay local to the domain
- `OPL` should explain how the family fits together without swallowing domain-local runtime ownership

That is how the ecosystem can grow as one coherent system family instead of drifting into unrelated projects.
