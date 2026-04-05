**English** | [中文](./opl-gateway-rollout.zh-CN.md)

# OPL Gateway Rollout

## Purpose

This document describes how the `OPL Gateway` should move from a documentation-first public surface into a real entry surface without collapsing domain boundaries.

The target is not a monolithic runtime.
The target is a real top-level gateway that can route work into independent domain systems.

## Target Shape

The long-term control chain remains:

```text
Human / Agent
  -> OPL Gateway
      -> Domain Gateway
          -> Domain Harness OS
```

Current mapped domains:

- `Research Ops` -> `MedAutoScience`
- `Presentation Ops` -> `RedCube AI`

## Non-Goals

This rollout is not for:

- moving all runtime code into `one-person-lab`
- deleting domain gateways
- hiding domain-specific governance inside a vague top-level prompt
- pretending every planned workstream already exists

## Rollout Principles

- keep domain gateways independently usable
- move top-level semantics upward before moving execution upward
- prefer routing contracts before shared runtime code
- keep shared truth indexes above domains, but keep canonical truth inside domains
- add a real top-level gateway only when it reduces duplication without flattening domain boundaries

## Phase G0: Positioning Freeze

Goal:

- freeze the public language for `OPL Gateway`, `domain gateway`, and `domain harness`

Evidence:

- public README and core docs aligned
- domain projects positioned as independent gateways under `OPL`

Status:

- in progress / largely completed by current documentation convergence

## Phase G1: Federation Contract Freeze

Goal:

- define the minimum machine-readable federation contract for the `OPL Gateway`

Should include:

- workstream registry
- domain registry
- gateway routing vocabulary
- shared identity for task, run, deliverable, and review verbs
- rules for when a request stays top-level versus when it must enter a domain

Completion signal:

- domain routing can be specified without reading prose docs

Current materialization target:

- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)

## Phase G2: Read-Only Entry Surface

Goal:

- make `OPL Gateway` real as a discovery and read-only entry surface before it becomes a mutation surface

Should support:

- listing workstreams
- listing registered domain gateways
- showing which families map directly to which workstreams
- linking users and agents to the right domain entry path

Completion signal:

- an agent can ask “what system should I use for this task?” and receive a stable top-level answer
- the current G1 materialization is discoverable at [OPL Gateway Contracts](../contracts/opl-gateway/README.md)

Detailed contract:

- [OPL Read-Only Discovery Gateway](opl-read-only-discovery-gateway.md)
- [OPL Public Surface Index](opl-public-surface-index.md)

## Phase G3: Routed Action Entry

Goal:

- let the `OPL Gateway` accept top-level task intents and route them into the right domain gateway

Should support:

- task classification into workstream semantics
- stable handoff payloads
- explicit domain routing
- top-level audit traces of routing decisions

Must not do:

- bypass domain gateways and talk directly to domain harness internals

Completion signal:

- an agent can start from `OPL` and still land inside the correct domain gateway with explicit routing evidence

Contract extension needed before adding more domains:

- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md)
- [OPL Candidate Domain Backlog](./opl-candidate-domain-backlog.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.md)

At the current baseline, candidate-domain definition remains the composition of `task-topology`, `candidate-domain backlog`, and `domain-onboarding`.
Do not insert a separate intermediate candidate-definition control surface unless those layers first prove insufficient to express a real missing boundary.

Detailed contract:

- [OPL Routed Action Gateway](opl-routed-action-gateway.md)

## Phase G4: Candidate Shared Cross-Domain Indexes

Goal:

- freeze the boundary for future shared indexes that may later make cross-domain work easier without creating a second truth source

Candidate indexes:

- shared asset index
- shared memory index
- shared domain registry
- shared publication / delivery catalog

Current status:

- all four G4 indexes remain roadmap-only, future-only, reference-only, and non-admitting candidates
- none of them is currently a public-entry, discovery-ready, routed-action-ready, execution, truth-owner, approval, publish-control, or release-control surface
- later explicit contracts and acceptance alignment must freeze readiness before any of these candidates appears as a current surface

Rule:

- candidate indexes may aggregate only after a later explicit contract freezes the readiness boundary
- canonical truth stays in the owning domain

Completion signal:

- cross-domain discovery becomes easier while truth ownership remains unambiguous without weakening MedAutoScience or RedCube AI independence

Detailed contract:

- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.md)

## Phase G5: Real Public Product Surface

Detailed contract:

- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.md)

Goal:

- make the `OPL Gateway` a stable public product entry for humans and agents

Possible surfaces:

- docs site
- MCP-style top-level tool surface
- CLI-style top-level routing surface

Rule:

- the first real gateway surface should still be thin
- top-level orchestration should route, not swallow domain logic

Completion signal:

- users and agents can begin from `OPL` as a real entry point while domain systems remain first-class

Current companion reference:

- [OPL Gateway Example Corpus](./opl-gateway-example-corpus.md)

Use the corpus as an illustrative contract-level walkthrough, not as an execution runtime.

## Readiness Gates

Do not advance the rollout if any of these are still unresolved:

- unclear domain boundaries
- top-level vocabulary that conflicts with domain vocabulary
- duplicate truth sources
- attempts to bypass domain gateways

## Ideal End State

The ideal end state is:

- `OPL` is a real top-level gateway
- `MedAutoScience` remains the `Research Ops` domain gateway
- `RedCube AI` remains the visual-deliverable domain gateway
- future workstreams gain their own domain gateways instead of being forced into existing ones
