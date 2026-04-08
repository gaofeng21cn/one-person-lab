**English** | [中文](./unified-harness-engineering-substrate.zh-CN.md)

# Unified Harness Engineering Substrate

## Purpose

This document defines the shared Harness Engineering language reused across the current `OPL` ecosystem.
It exists so that `OPL` can present a coherent system family without pretending that every domain already lives inside one monolithic runtime or one shared public codebase.

## What It Is

`Unified Harness Engineering Substrate` is the shared architectural substrate under `OPL`.
It describes the reusable rules that multiple domain systems should inherit while keeping their own domain contracts, domain gateways, and `Domain Harness OS` implementations.

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

## Layering

The intended architecture stays:

```text
Human / Agent
  -> OPL Gateway / Federation
      -> Unified Harness Engineering Substrate
          -> Domain Gateway
              -> Domain Harness OS
                  -> Deployment Shape
```

The layers mean different things:

- `OPL Gateway / Federation`
  - owns top-level task semantics, routing language, and cross-domain boundary contracts
- `Unified Harness Engineering Substrate`
  - owns the shared Harness Engineering principles reused across domains
- `Domain Gateway`
  - owns domain-local task entry, routing, and contract hydration
- `Domain Harness OS`
  - owns domain-local execution logic, audit surfaces, and delivery semantics
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

## Deployment Shapes

The current default local deployment shape is:

- `Codex`-default host-agent runtime

That is a deployment choice, not the identity of the substrate.
The same substrate should remain compatible with:

- future managed web runtimes
- future platform-hosted execution surfaces

Changing the hosting location should not require rewriting the substrate or collapsing domain boundaries.

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
