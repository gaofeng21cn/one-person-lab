**English** | [中文](./shared-foundation.zh-CN.md)

# Shared Foundation

`OPL` groups multiple workstreams into one system not simply because they all involve Agents, but because they reuse the same foundational layers through a federation model.

The shared foundation does not imply one monolithic runtime.
It means different domain gateways must speak compatible asset, memory, governance, delivery, and execution language.
That compatibility does not make `OPL` the canonical truth store for every shared object; canonical truth still stays with domain-owned surfaces or with human/private materials that remain below domain admission.

## One Base, Two Modes

At the top level, `OPL` treats `Auto` and `Human-in-the-loop` as two execution modes on top of the same shared base rather than as two unrelated systems.

- `Auto`: the autonomous primary lane for end-to-end loops, base testing, evaluation, and optimization
- `Human-in-the-loop`: the same foundational layers with high-judgment gates returned to humans while Agents handle repetitive and composable work

That means what must be reusable across workstreams is not limited to data, references, and templates. It also includes:

- reusable judgment memory
- continue/stop/reframe gates
- review surfaces
- audit writeback language
- the stable route/controller/tool surface that Agent runtimes depend on

## Asset Layer

The `Asset Layer` holds objects that are repeatedly consumed across workstreams:

- data assets
- references and literature
- figures and templates
- completed formal deliverables

Without this layer, every workstream duplicates its own factual base.

## Memory Layer

The `Memory Layer` holds structured judgment that should survive beyond transient sessions:

- topic memory
- dataset-question mappings
- venue preferences
- funder preferences
- review experience
- teaching material structures

Its purpose is not to save every conversation. It is to preserve reusable judgment.

## Governance Layer

The `Governance Layer` answers when work may continue and when it should stop.

It covers:

- continue/stop gates
- evidence sufficiency
- reframe conditions
- promotion into formal delivery

Without this layer, execution loses explicit control.

## Delivery Layer

The `Delivery Layer` turns process artifacts into formal outputs.

It defines:

- which files constitute a delivery package
- which surfaces humans should review
- how upstream assets sync into downstream formal materials

Each workstream may use a different delivery protocol, but the need for a delivery layer stays the same.

## Agent Execution Layer

The `Agent Execution Layer` makes Agent work controllable rather than free-floating.

It focuses on:

- stable entry surfaces
- routes or controllers
- runtime monitoring
- audit writeback

This layer is not about removing humans. It is about letting humans review key outputs instead of babysitting low-level execution.
It also means `OPL` defaults to an `Agent-first` execution model rather than designing the main workstream as a rigid code pipeline with the Agent left to fill a few prompt slots.

## Federation Consumption Model

In the intended `OPL` structure:

- the `OPL Gateway` declares the shared-foundation language
- each `domain gateway` hydrates that language for its own workstream
- each `domain harness` persists, audits, and delivers according to domain rules

That is why the shared foundation should stay above any single domain repository.

## What Is Already Clear Today

Today, the clearest embodiment of these layers in `Research Ops` is:

- `MedAutoScience` as the active research domain gateway and harness

The clearest emerging embodiment in visual delivery is:

- `RedCube AI` as the visual-deliverable domain gateway and harness, with `ppt_deck` as the family that most directly maps to `Presentation Ops`

This is why `OPL` is no longer only conceptual.
It already has one active domain surface and one emerging second surface.

## Further Reading

- [Shared Foundation Ownership](./shared-foundation-ownership.md)
