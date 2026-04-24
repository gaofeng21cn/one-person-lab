**English** | [中文](./gateway-federation.zh-CN.md)

# OPL Gateway Federation

> Historical note (`2026-04-24`): this document is retained as legacy boundary wording from the gateway-first phase. The current `OPL` mainline is runtime-first and skill-first. Read it only as historical or compatibility context.

## Purpose

This document defines the intended relationship between:

- the top-level `OPL Gateway`
- `domain gateways` inside independent domain-agent repositories
- `domain harnesses` inside independent domain-agent repositories

It exists to prevent two common mistakes:

- treating `OPL` as only a static blueprint
- treating `OPL` as a monolithic runtime that should swallow every domain

## Core Judgment

The right control shape is:

```text
Human / Agent
  -> OPL Gateway
      -> Domain Gateway
          -> Domain Harness OS
```

`OPL` owns the top-level product language and routing semantics.
Each independent domain-agent repository owns its own formal execution and delivery surface.

Under the current positioning, the public identities are:

- `OPL`: family-level session/runtime/projection plus shared modules/contracts/indexes
- `MAS`, `MAG`, `RCA`: independent domain agents
- `domain gateway / domain harness`: internal boundary and execution layers within those domain-agent repositories

## OPL Gateway Responsibilities

The `OPL Gateway` is responsible for:

- top-level task intake semantics
- routing into the correct domain
- expressing the shared-foundation language
- aligning cross-domain governance and delivery vocabulary
- serving as the top-level public product surface

The current repository is the documentation-first and contract-first public surface for this role.

## Domain Gateway Responsibilities

Each `domain gateway` is responsible for:

- stable entry surfaces for its workstream
- domain-specific validation and contract hydration
- domain-specific review and delivery semantics
- independent standalone use when needed

This is why domain gateways must stay even if `OPL` exists above them.
They remain the stable boundary layer inside each domain-agent repository, not a discarded historical naming artifact.

## Domain Harness Responsibilities

Each `Domain Harness OS` is responsible for:

- execution
- truth persistence
- governance hooks
- replay and rerun
- audit writeback
- delivery production

The harness is the internal execution base, not the top-level product surface.

## Current Mapping

### Research Foundry

- `OPL workstream`: `Research Foundry`
- `domain agent`: `MedAutoScience`
- `domain gateway`: the research gateway inside `MedAutoScience`
- `domain harness`: the research harness controlled by `MedAutoScience`

### Presentation Foundry

- `OPL workstream`: `Presentation Foundry`
- `domain agent`: `RedCube AI`
- `domain gateway`: the visual gateway inside `RedCube AI`
- `direct family`: `ppt_deck`
- note: `xiaohongshu` shares the RedCube harness but is not automatically identical to `Presentation Foundry`

### Grant Foundry

- `OPL workstream`: `Grant Foundry`
- `domain agent`: `MedAutoGrant`
- `domain gateway`: the grant gateway inside `MedAutoGrant`
- `domain harness`: the grant harness controlled by `MedAutoGrant`

## Boundary Rules

Do not describe the system as:

- `OPL` replacing all domain gateways
- domain-agent repositories becoming private implementation details with no standalone role
- a single runtime owning all workstreams

Describe it as:

- a top-level gateway above domains
- domain gateways inside independent domain-agent repositories below it
- independent harnesses below those gateways

## Next Contract Layer

The next concrete layer after this conceptual boundary document is:

- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Public Surface Index](./opl-public-surface-index.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)
