**English** | [中文](./gateway-federation.zh-CN.md)

# OPL Gateway Federation

## Purpose

This document defines the intended relationship between:

- the top-level `OPL Gateway`
- independent `domain gateways`
- independent `domain harnesses`

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
Each domain owns its own formal execution and delivery surface.

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

## Domain Harness Responsibilities

Each `domain harness OS` is responsible for:

- execution
- truth persistence
- governance hooks
- replay and rerun
- audit writeback
- delivery production

The harness is the internal execution base, not the top-level product surface.

## Current Mapping

### Research Ops

- `OPL workstream`: `Research Ops`
- `domain gateway`: `MedAutoScience`
- `domain harness`: the research harness controlled by `MedAutoScience`

### Presentation Ops

- `OPL workstream`: `Presentation Ops`
- `domain gateway`: `RedCube AI`
- `direct family`: `ppt_deck`
- note: `xiaohongshu` shares the RedCube harness but is not automatically identical to `Presentation Ops`

## Boundary Rules

Do not describe the system as:

- `OPL` replacing all domain gateways
- domain projects becoming private implementation details with no standalone role
- a single runtime owning all workstreams

Describe it as:

- a top-level gateway above domains
- independent domain gateways below it
- independent harnesses below those gateways

## Next Contract Layer

The next concrete layer after this conceptual boundary document is:

- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)
