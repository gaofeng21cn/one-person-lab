**English** | [中文](./operating-model.zh-CN.md)

# OPL Operating Model

## Core Judgment

The core judgment of `OPL` is not “how to make one Agent finish one task once.”
It is “how to let a research-oriented individual or a very small team continuously carry formal lab work through stable surfaces.”

That is why `OPL` should be understood as the Codex-default session/runtime layer, explicit activation layer, and owner of shared modules, contracts, and indexes for continuous lab work.

## Top-Level Chain

The intended chain is:

```text
Human / Agent
  -> Codex-default session/runtime
      -> explicit OPL activation
          -> selected domain agent entry
              -> Domain Harness OS / Review Surfaces / Deliveries / Audit Truth
```

Today, the clearest mapped domains are:

- `Research Foundry` -> independent domain agent `MedAutoScience`
- `Grant Foundry` -> independent domain agent `MedAutoGrant`
- `Presentation Foundry` -> independent domain agent `RedCube AI` through `ppt_deck`

## Role Split

### Human

The human is primarily responsible for:

- defining goals and task boundaries
- providing or authorizing access to data, references, and context
- reviewing key conclusions and formal deliveries
- deciding continue, stop, reframe, or submit

### Agent

The Agent is primarily responsible for:

- reading current state before acting
- calling stable interfaces to advance work
- organizing intermediate and formal outputs
- writing key execution traces back to auditable surfaces

### OPL Activation And Shared Foundation

The top-level `OPL` layer is responsible for:

- expressing top-level task semantics
- activating work into the correct domain surface only when explicitly requested
- defining shared foundation expectations across domains
- owning shared-foundation control language without taking over domain-owned canonical truth
- keeping cross-domain identity, governance, and delivery language aligned
- maintaining family-level shared modules, contracts, and indexes

The current repository is the documentation-first public surface for this role.

### Domain Agent, Entry, And Harness

Each independent domain-agent repository is expected to keep three distinct layers:

- a `domain agent` as the public identity of the repository
- a domain-owned entry surface that serves as the stable workstream boundary
- a `Domain Harness OS` that executes, records, gates, and delivers domain work

For example:

- `MedAutoScience` is the independent domain agent for `Research Foundry`, with its own domain entry, runtime truth, and harness underneath
- `RedCube AI` is the independent domain agent for visual delivery, with its own domain entry, runtime truth, and harness underneath

## Agent-First Execution

`OPL` defaults to `Agent-first` execution.
Domains can choose their model interfaces, but the default executor path at the `OPL` layer is `Codex CLI`.
The primary workstream driver reads state, calls stable domain-owned tools, organizes intermediate artifacts, advances gates, and writes key traces back to auditable surfaces.

In that model, code mainly exists to provide:

- stable object models
- routes or controllers
- tool wrappers
- gate rules
- audit persistence
- review surfaces and delivery protocols

`OPL` should avoid collapsing domain workstreams back into “rigid code pipelines with prompt slots,” because that keeps a shared foundation in name while weakening composability and portability across `Ops`.

## Auto Mainlines And Future HITL Layering

At the `OPL` layer, the frozen rule is no longer “one repository should expose two top-level modes.”
The current aligned rule is:

- admitted domain repositories should be treated as `Auto-only` mainlines
- any future `Human-in-the-loop` product should reuse the same substrate-compatible contracts and execution modules as a sibling or upper-layer product
- the shared base is the substrate contract, not a same-repository mode toggle

The key distinction is the layering rule: a future higher-judgment product sits above the current `Auto-only` mainline while reusing the same stable contracts, objects, audit surfaces, and execution modules.
`OPL` freezes that layering rule now and keeps the current mainline definition clean.

## Product Entry And Runtime Manager

The current repo-tracked formal entry is the `Codex CLI`-default path exposed through `opl`, `opl exec`, and `opl resume`.
That is the real default entry today, while explicit activation can still select a domain agent or a non-default runtime.

The more durable direction is:

- keep `Codex CLI` as the current formal executor
- keep `MCP` as the supported protocol layer
- keep domain-owned product entry surfaces as the ownership boundary for domain workflow, runtime truth, and delivery truth
- keep `OPL Runtime Manager` as a thin product-managed adapter over external `Hermes-Agent`

On that path:

- top-level `OPL` continues to define the system family, explicit activation semantics, and shared indexes
- `UHS` remains the shared Harness Engineering umbrella language
- the `Shared Runtime Contract` gradually owns the shared contracts required for long-running online execution
- the `Shared Domain Contract` gradually owns the cross-domain contracts for formal entry, run identity, report surfaces, audit surfaces, and gate semantics
- each independent domain-agent repository continues to own its product entry, domain workflow, and delivery truth

That is how the ecosystem can grow into multiple vertical online agent products on one substrate rather than one giant runtime that swallows every domain.
The full direction is not implemented yet, but it is the right structure to keep tightening toward.

`Hermes-Agent` is an upstream external runtime project/service.
`OPL Runtime Manager` may adapt product-managed runtime operations over that external project, but it must not be described as a scheduler, session store, memory owner, domain truth owner, or concrete executor owner.
Rust native helper / index-only work may support native assistance and indexed discovery, but it must not become the owner of domain execution or truth.

## Operating Principles

At the top level, `OPL` follows these principles:

- read state before making changes
- keep important actions auditable
- prefer stable domain-owned entry contracts over ad hoc bypasses
- prefer shared assets over duplicated context
- preserve domain boundaries instead of collapsing everything into one runtime
- keep humans at the review and decision surfaces rather than at low-level execution details

## Boundary Rules

Use the following scope for `OPL`:

- the top-level product and control language for the lab
- the place where cross-domain semantics are frozen first
- the explicit activation layer above independent domain-agent repositories
- the shared modules/contracts/indexes owner that links domain-owned runtimes without absorbing their identities

## Why Domain Entries Must Stay

Even with shared `OPL` activation, domain-owned entries should remain because they provide:

- a standalone surface for independent use
- domain-specific validation, governance, and delivery contracts
- independent release and maintenance boundaries
- a place where one workstream can evolve without destabilizing the whole federation

That means the right direction is:

- Codex-default `OPL` runtime plus explicit activation above domains
- thinner but explicit domain-owned entries
- explicit domain harnesses underneath

## Further Reading

- [Shared Foundation](./shared-foundation.md)
- [Shared Foundation Ownership](./shared-foundation-ownership.md)
