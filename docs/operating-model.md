**English** | [中文](./operating-model.zh-CN.md)

# OPL Operating Model

## Core Judgment

The core judgment of `OPL` is not “how to make one Agent finish one task once.”
It is “how to let a research-oriented individual or a very small team continuously carry formal lab work through stable surfaces.”

That is why `OPL` should be understood as the top-level gateway and federation model for continuous lab work.

## Top-Level Chain

The intended chain is:

```text
Human / Agent
  -> OPL Gateway
      -> Domain Gateway
          -> Domain Harness OS
              -> Review Surfaces / Deliveries / Audit Truth
```

Today, the clearest mapped domains are:

- `Research Foundry` -> `MedAutoScience`
- `Presentation Foundry` -> `RedCube AI` through `ppt_deck`

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

### OPL Gateway

The top-level `OPL Gateway` is responsible for:

- expressing top-level task semantics
- routing work into the correct domain surface
- defining shared foundation expectations across domains
- owning shared-foundation control language without taking over domain-owned canonical truth
- keeping cross-domain identity, governance, and delivery language aligned

The current repository is the documentation-first public surface for this role.

### Domain Gateway And Harness

Each domain is expected to keep two distinct layers:

- a `domain gateway` that serves as the stable workstream entry surface
- a `Domain Harness OS` that executes, records, gates, and delivers domain work

For example:

- `MedAutoScience` is the `Research Foundry` domain gateway and harness
- `RedCube AI` is the visual-deliverable domain gateway and harness

## Agent-First Execution

`OPL` defaults to `Agent-first` execution.
Domains can choose their model interfaces, but the primary workstream driver is an Agent runtime that reads state, calls tools and gateways, organizes intermediate artifacts, advances gates, and writes key traces back to auditable surfaces.

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

## Product Entry And Online Runtime

The current repo-tracked formal entry still remains the local `TypeScript CLI`-first / gateway contract baseline.
That is the real entry today, but it should not be read as “the product will always depend on `Codex` as its only entry.”

The more durable direction is:

- keep local `CLI-first` as the current formal entry
- keep `MCP` as the supported protocol layer
- progressively add domain-owned product entry surfaces such as local product CLIs and future `Web / API / gateway` surfaces

On that path:

- top-level `OPL` continues to define the system family and federation language
- `UHS` remains the shared Harness Engineering umbrella language
- the `Shared Runtime Contract` gradually owns the shared contracts required for long-running online execution
- the `Shared Domain Contract` gradually owns the cross-domain contracts for formal entry, run identity, report surfaces, audit surfaces, and gate semantics
- each domain repository continues to own its product entry, domain workflow, and delivery truth

That is how the ecosystem can grow into multiple vertical online agent products on one substrate rather than one giant runtime that swallows every domain.
The full direction is not implemented yet, but it is the right structure to keep tightening toward.

If the ecosystem later adopts the upstream `Hermes-Agent` as a runtime substrate, that choice belongs more accurately to the implementation layer of the `Shared Runtime Contract`, not as a synonym for `UHS`, `OPL`, or domain truth.
As of today, none of the domain repositories has landed that integration yet.

## Operating Principles

At the top level, `OPL` follows these principles:

- read state before making changes
- keep important actions auditable
- prefer stable gateways over ad hoc bypasses
- prefer shared assets over duplicated context
- preserve domain boundaries instead of collapsing everything into one runtime
- keep humans at the review and decision surfaces rather than at low-level execution details

## Boundary Rules

Use the following scope for `OPL`:

- the top-level product and control language for the lab
- the place where cross-domain semantics are frozen first
- the federation layer above independent domain gateways and harnesses
- the gateway surface that links domain-owned runtimes without absorbing their identities

## Why Domain Gateways Must Stay

Even with an `OPL Gateway`, domain gateways should remain because they provide:

- a standalone surface for independent use
- domain-specific validation, governance, and delivery contracts
- independent release and maintenance boundaries
- a place where one workstream can evolve without destabilizing the whole federation

That means the right direction is:

- `OPL Gateway` above domains
- thinner but explicit domain gateways
- explicit domain harnesses underneath

## Further Reading

- [Shared Foundation](./shared-foundation.md)
- [Shared Foundation Ownership](./shared-foundation-ownership.md)
