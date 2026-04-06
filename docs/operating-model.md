**English** | [中文](./operating-model.zh-CN.md)

# OPL Operating Model

## Core Judgment

The core judgment of `OPL` is not “how to make one Agent finish one task once.”
It is “how to let a research-oriented individual or a very small team continuously carry formal lab work through stable surfaces.”

That is why `OPL` should be understood as a top-level gateway and federation model rather than as a static blueprint and not as a monolithic runtime.

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

- `Research Ops` -> `MedAutoScience`
- `Presentation Ops` -> `RedCube AI` through `ppt_deck`

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
- a `domain harness OS` that executes, records, gates, and delivers domain work

For example:

- `MedAutoScience` is the `Research Ops` domain gateway and harness
- `RedCube AI` is the visual-deliverable domain gateway and harness

## Agent-First Execution

`OPL` defaults to `Agent-first` execution rather than `fixed-code-first`.
That does not require every domain to bind itself to one direct LLM API; it requires the primary workstream driver to be an Agent runtime that reads state, calls tools and gateways, organizes intermediate artifacts, advances gates, and writes key traces back to auditable surfaces.

In that model, code mainly exists to provide:

- stable object models
- routes or controllers
- tool wrappers
- gate rules
- audit persistence
- review surfaces and delivery protocols

`OPL` should avoid collapsing domain workstreams back into “rigid code pipelines with prompt slots,” because that keeps a shared foundation in name while weakening composability and portability across `Ops`.

## Dual Execution Modes

Workstreams in `OPL` should in principle share one base while supporting two execution modes:

- `Auto`: the autonomous primary lane for end-to-end loops, base testing, evaluation, and optimization
- `Human-in-the-loop`: the same base with high-judgment gates returned to humans while Agents handle repetitive and composable work

The difference between these modes is not two separate systems. It is who clears high-judgment gates and who signs off on key conclusions and formal deliveries.
Different domain surfaces may sit at different maturity levels today; `OPL` only freezes the shared execution direction and does not claim that every planned workstream already has both modes fully realized.

## Operating Principles

At the top level, `OPL` follows these principles:

- read state before making changes
- keep important actions auditable
- prefer stable gateways over ad hoc bypasses
- prefer shared assets over duplicated context
- preserve domain boundaries instead of collapsing everything into one runtime
- keep humans at the review and decision surfaces rather than at low-level execution details

## Boundary Rules

`OPL` is not:

- a general-purpose assistant
- a synonym for any single domain project
- a claim that all runtime code already lives in one repository
- a reason to remove domain gateways

`OPL` is:

- the top-level product and control language for the lab
- the place where cross-domain semantics are frozen first
- the federation layer above independent domain gateways and harnesses

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

Not:

- one giant runtime that swallows all workstreams

## Further Reading

- [Shared Foundation](./shared-foundation.md)
- [Shared Foundation Ownership](./shared-foundation-ownership.md)
