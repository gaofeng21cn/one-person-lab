**English** | [中文](./operating-model.zh-CN.md)

# OPL Operating Model

## Core Judgment

The core judgment of `One Person Lab` is not “how to make an Agent finish one task in a single shot.” It is “how to let a research-oriented individual or a very small team carry out formal lab work on a continuing basis.”

As a result, `OPL` is not primarily concerned with one-off interaction performance. It is concerned with whether:

- assets are organized over time
- state can be read and traced
- key judgments have explicit gates
- outputs can be turned into formal deliveries
- humans have clear review surfaces

## Role Split

`OPL` keeps three roles distinct.

### Human

The human is primarily responsible for:

- defining research goals and task boundaries
- providing or authorizing access to data, references, and context
- reviewing key conclusions and formal deliverables
- making the final decision on continue, stop, reframe, and submit

### Agent

The Agent is primarily responsible for:

- reading current state
- calling stable interfaces to advance work
- organizing intermediate and formal outputs
- writing key execution traces back to auditable surfaces

### Implementation Surface / Runtime Surface

Each concrete implementation surface is responsible for:

- providing a stable entry point for a specific workstream
- defining the state and delivery protocol for that workstream
- constraining which actions are allowed to enter formal execution

## Operating Principles

At the top level, `OPL` follows these principles:

- read state before making changes
- leave auditable traces for important actions
- prefer stable entry points over temporary bypasses
- prefer shared assets over one-off duplication
- do not package weak results as if they were complete
- when a direction is clearly weak, allow stop, reframe, or side routes

## Scope Boundary

A system defined only as a collection of prompts usually lacks:

- a stable state surface
- a shared memory layer
- reusable delivery protocols
- explicit continue/stop gates

`OPL` is defined instead as a lab operating model that extracts the asset, memory, governance, and delivery layers behind recurring lab tasks, and then lets concrete workstreams implement them through stable runtime surfaces.

Therefore:

- `OPL` is not defined as a general-purpose assistant
- `OPL` is not defined as a manuscript generator
- `OPL` is not defined as one monolithic Agent

It is better understood as a structured lab operating model in which `Agent` provides one layer of execution.
