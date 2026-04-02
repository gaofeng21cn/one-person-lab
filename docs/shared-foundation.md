**English** | [中文](./shared-foundation.zh-CN.md)

# Shared Foundation

`OPL` defines different lab tasks as belonging to one system not simply because they all involve Agents, but because they share the same foundational layers.

## Asset Layer

The `Asset Layer` holds objects that are repeatedly consumed across multiple workstreams.

Typical objects include:

- data assets
- references and literature
- figures and templates
- completed formal deliverables

Without this layer, papers, grants, dissertations, and defense materials would each duplicate their own context and drift apart.

## Memory Layer

The `Memory Layer` holds long-lived knowledge that should not remain only in transient conversations.

Typical objects include:

- topic memory
- dataset-question mappings
- venue preferences
- funder preferences
- review experience
- teaching material structures

The goal of this layer is not to save every conversation. It is to preserve structured judgment that later workstreams can still reuse.

## Governance Layer

The `Governance Layer` answers: when is work allowed to continue, and when should it stop?

It focuses on:

- when formal execution is allowed
- when more evidence is needed
- when a direction should be stopped or reframed
- when a workstream can enter formal delivery

Without this layer, continuity and reviewability weaken because execution loses explicit stop and continue conditions.

## Delivery Layer

The `Delivery Layer` turns process artifacts into formal outputs.

It focuses on:

- which files constitute a delivery package
- which surfaces humans should review
- how upstream research assets sync into downstream formal materials

This layer applies to papers, grants, dissertations, and slides alike, even though the delivery protocol differs in each case.

## Agent Execution Layer

The `Agent Execution Layer` makes Agent execution controllable rather than free-floating.

It focuses on:

- stable entry surfaces
- controllers or routes
- runtime monitoring
- audit writeback

This layer does not remove humans. It makes it possible for humans to review key outputs without having to monitor every low-level execution detail.

## What Is Already Clear Today

In the current ecosystem, the earliest mature embodiment of these five layers is `Research Ops`, namely:

- `MedAutoScience` has already established clear boundaries around data assets, runtime governance, delivery synchronization, and Agent entry

That is why `OPL` already has a concrete reference surface today. It already has a clear starting point.
