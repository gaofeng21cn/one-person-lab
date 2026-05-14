**English** | [中文](./unified-harness-engineering-substrate.zh-CN.md)

# Unified Harness Engineering Substrate

## Purpose

This document defines the shared Harness Engineering language reused across the current `OPL` ecosystem.
It exists so that `OPL` can present a coherent system family without pretending that every domain already lives inside one monolithic runtime or one shared public codebase.

## What It Is

`Unified Harness Engineering Substrate` is the shared Harness Engineering umbrella language under `OPL`.
It describes the reusable rules that multiple domain systems should inherit while keeping their own domain contracts, domain-agent entries, and internal harness/controller implementations.

The more accurate current reading is:

- `UHS` is the shared umbrella term
- the long-running runtime part inside it is converging into the [Shared Runtime Contract](../active/shared-runtime-contract.md)
- the cross-domain product-behavior part inside it is converging into the [Shared Domain Contract](../active/shared-domain-contract.md)

In the current ecosystem, it is the shared substrate below:

- `Med Auto Science`
- `RedCube AI`
- `Med Auto Grant`

## What It Is Not

The substrate is not:

- a claim that every domain already uses one identical object model
- a claim that every domain already runs on one shared code repository
- a replacement for any domain-agent entry
- a replacement for any `Domain Harness OS`
- a license for `OPL` to bypass a public domain-agent entry and touch domain-local harness execution directly
- a claim that `UHS` is just a wrapper around `Hermes` or any other runtime project

## Layering

The intended architecture stays:

```text
Human / Agent
  -> OPL stage-led Agent executor framework
      -> Unified Harness Engineering Substrate
          -> Shared Runtime Contract
          -> Shared Domain Contract
              -> Domain-agent entry
                  -> Domain harness/controller
                      -> Execution Plane
                          -> Deployment Shape
```

The layers mean different things:

- `OPL stage-led Agent executor framework`
  - owns top-level task semantics, stage decomposition, activation, and cross-domain boundary contracts
- `Unified Harness Engineering Substrate`
  - owns the shared Harness Engineering umbrella language reused across domains
- `Shared Runtime Contract`
  - owns the cross-domain contract for long-running runtime behavior
- `Shared Domain Contract`
  - owns the cross-domain contract for formal product behavior
- `Domain-agent entry`
  - owns the public domain-local task entry and product-entry surface
- `Domain harness/controller`
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
  - stage runtime status
  - `memory provider hook`
  - `delivery / cron`
  - `approval / interrupt / resume`
- `Shared Domain Contract`
  - the formal-entry matrix
  - the `per-run handle`
  - the durable report surface
  - the audit trail surface
  - gate semantics
  - the no-bypass rule to the public domain-agent entry

## Deployment Shapes

At the current stage:

- the active concrete executor is the Codex-default local execution path, with `Codex CLI` as the minimum execution unit inside a stage
- the public OPL formal entry remains the local `TypeScript CLI`-first / framework contract surface
- provider-backed stage runtime is the production online carrier for long-running attempts, recovery, human gates, and projection, with the Temporal-backed provider as the required substrate

That split matters: Codex names the default concrete executor, not the identity of the substrate.
The same substrate should support:

- future managed web runtimes
- future platform-hosted execution surfaces

If the ecosystem retains upstream `Hermes-Agent` integration evidence inside a domain repository, the accurate place for that choice is:

- historical provenance, diagnostic vocabulary, or a negative guard

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
  - remains the stage-led framework with Agent executors as the minimum execution unit and activation layer
- `UHS`
  - remains the shared Harness Engineering umbrella language
- `Shared Runtime Contract`
  - gradually owns shared runtime contracts such as `runtime profile`, `session substrate`, stage runtime status, `memory hook`, `delivery / cron`, and `approval / interrupt`
- `Shared Domain Contract`
  - gradually owns shared cross-domain product-behavior contracts such as the formal-entry matrix, the `per-run handle`, the durable report surface, the audit trail, and gate semantics
- each domain agent
  - keeps its own formal entry, domain objects, gates, audit surfaces, delivery semantics, harness/controller boundary, and canonical truth

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
  - medical research domain agent
- `RedCube AI`
  - visual-deliverable domain agent
- `Med Auto Grant`
  - grant-authoring domain agent

`OPL` itself is not one more domain agent.
It remains the stage-led framework with Agent executors as the minimum execution unit and activation layer above those domain systems.

## Practical Implication

This shared substrate is meant to make future domain work faster:

- new domain systems should inherit the same execution philosophy
- domain-specific contracts should stay local to the domain
- `OPL` should explain how the family fits together without swallowing domain-local runtime ownership

That is how the ecosystem can grow as one coherent system family instead of drifting into unrelated projects.
