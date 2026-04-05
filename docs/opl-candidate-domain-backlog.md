**English** | [中文](./opl-candidate-domain-backlog.zh-CN.md)

# OPL Candidate Domain Backlog

## Purpose

This document indexes the machine-readable admission-blocker backlog for the current under-definition `OPL` workstreams.

Its job is to show what boundary material is still missing before `Grant Ops`, `Thesis Ops`, or `Review Ops` can be formally admitted as independent domain gateways.

It is not a pre-admission registry.
It is not an execution surface.

## Relationship To Task Topology And Domain Onboarding

This backlog sits between two already frozen layers:

- [OPL Task Map](./task-map.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md)

The task map / task-topology layer makes top-level semantics explicit.
The onboarding contract defines the formal admission gate.
This backlog records what is still missing between those two layers.

At the current baseline, that is enough to define the candidate-domain path:

- task topology defines the workstream boundary
- the backlog records missing boundary packages
- onboarding defines the formal inclusion gate

`OPL` therefore does **not** currently add a separate candidate-domain-definition surface between backlog and onboarding.

It does **not** create `G1` registry admission, `G2` discovery readiness, or `G3` routed-action readiness.

## Machine-Readable Artifact

- [`../contracts/opl-gateway/candidate-domain-backlog.json`](../contracts/opl-gateway/candidate-domain-backlog.json)

This artifact keeps candidate workstreams visible without pretending their domain boundaries already exist.

## Non-Goals

This backlog does not:

- assign a future `domain_id`
- add candidate entries to the `G1` registry
- create a discovery target or routed-action target
- become an approval queue, release plan, or runtime planner
- transfer truth, review, or publication authority into `OPL`

## Backlog Fields

Each entry stays reference-only and carries only:

- `workstream_id`
- `label`
- `task_topology_state`
- `top_level_signal_refs`
- `admission_status`
- `readiness_flags`
- `candidate_domain_boundary`
- `required_onboarding_materials`
- `missing_boundary_materials`
- `formal_inclusion_gate`
- `notes`

## Current Candidate Coverage

### Grant Ops

`Grant Ops` already has explicit top-level semantics in the task map / task topology.

What is still missing is a future domain boundary package that makes registry material, public gateway docs, truth ownership, review surfaces, discovery readiness, routing readiness, and cross-domain wording explicit.
Those future packages are blockers only; they do not make `Grant Ops` currently `G2` discovery-ready or `G3` routed-action-ready.

### Thesis Ops

`Thesis Ops` already has explicit top-level semantics in the task map / task topology.

What is still missing is a future domain boundary package that makes thesis-specific registry material, public gateway docs, truth ownership, review surfaces, discovery readiness, routing readiness, and cross-domain wording explicit.

### Review Ops

`Review Ops` already has explicit top-level semantics in the task map / task topology.

What is still missing is a future domain boundary package that makes review-specific registry material, public gateway docs, truth ownership, review surfaces, discovery readiness, routing readiness, and cross-domain wording explicit.

## Reading Rule

Read this surface as a **reference-only blocker index**.

If a backlog entry exists, the workstream is still below the domain-onboarding gate.
`blocked` does not mean “almost admitted.”
It means the required boundary package is still incomplete.

No backlog entry authorizes a domain handoff, discovery target, routed-action target, or harness access.

## Governing Sources

- [OPL Task Map](./task-map.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.md)

## Completion Definition

The candidate backlog is acceptable only when:

- each current candidate workstream has an explicit backlog entry
- blocker packages align to the onboarding-package categories
- blocker checks align to the onboarding formal-inclusion gate
- no entry allocates a future domain identity or routed readiness state
- the backlog stays discoverable and reviewable without becoming a control plane
- the backlog remains reference-only, non-executing, and non-admitting
