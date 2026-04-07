**English** | [中文](./opl-candidate-domain-backlog.zh-CN.md)

# OPL Candidate Domain Backlog

## Purpose

This document indexes the machine-readable admission-blocker backlog for the current under-definition `OPL` workstreams.

Its job is to show what boundary material is still missing before `Grant Ops`, `Thesis Ops`, or `Review Ops` can be formally admitted as independent domain gateways.

It is not a pre-admission registry.
It is not an execution surface.

## Relationship To Task Topology And Domain Onboarding

This backlog sits between two already frozen layers:

- [OPL Task Map](../task-map.md)
- [OPL Domain Onboarding Contract](../opl-domain-onboarding-contract.md)

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

- [`../../contracts/opl-gateway/candidate-domain-backlog.json`](../../contracts/opl-gateway/candidate-domain-backlog.json)

This artifact keeps candidate workstreams visible without pretending their domain boundaries already exist.

Companion tranche summary:

- [OPL Candidate Workstream Tranche Closeout](./opl-candidate-workstream-tranche-closeout.md)

## Non-Goals

This backlog does not:

- assign future domain identity or gateway/harness surface metadata
- reframe `Grant Ops`, `Thesis Ops`, or `Review Ops` as extensions of `MedAutoScience` or `RedCube AI`
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
- `required_onboarding_materials`
- `missing_boundary_materials`
- `formal_inclusion_gate`
- `notes`

## Current Candidate Coverage

### Grant Ops

`Grant Ops` already has explicit top-level semantics in the task map / task topology.

That frozen boundary is still proposal-facing: review-simulation and revision traces remain author-side grant-authoring artifacts rather than standalone reviewer-role outputs.

The current `Grant Foundry -> Med Auto Grant` public scaffold provides top-level signal / domain-direction evidence only.
It is not an admitted domain gateway and does not count as G2 discovery readiness, G3 routed-action readiness, or a handoff-ready surface.

What is still missing is a future domain boundary package that makes registry material, public gateway docs, truth ownership, review surfaces, an explicit execution-model declaration, a discovery readiness blocker, a routing readiness blocker, and cross-domain wording explicit.
That execution-model declaration must identify the stable agent runtime surface, show how `Auto` and `Human-in-the-loop` share one base, explain the code-versus-Agent responsibility split, and keep the workstream out of any `fixed-code-first` or permanently single-mode framing.
The discovery readiness blocker must point read-only discovery to the future `domain_gateway` entry without implying handoff readiness.
The routing readiness blocker must freeze explicit routing evidence, keep the only successful handoff target at `domain_gateway`, and preserve the no-bypass rule against direct harness targeting.
Those future packages are blockers only; they do not make `Grant Ops` currently `G2` discovery-ready or `G3` routed-action-ready.

### Thesis Ops

`Thesis Ops` already has explicit top-level semantics in the task map / task topology.

The negative conclusion frozen in the current path is that thesis assembly does add top-level boundary truth, but only as a reference-only candidate boundary inside the existing topology/backlog/onboarding chain: chapter-draft sets, cross-chapter synchronization, and defense-preparation coordination are not identical to `Research Ops` manuscript/submission flow, and a downstream `defense_deck` derivative does not collapse the workstream into `Presentation Ops` / `RedCube AI`.

What is still missing is a future domain boundary package that makes thesis-specific registry material, public gateway docs, truth ownership, review surfaces, an explicit execution-model declaration, discovery readiness, routing readiness, and cross-domain wording explicit.
That execution-model declaration must identify the stable agent runtime surface, show how `Auto` and `Human-in-the-loop` share one base, explain the code-versus-Agent responsibility split, and keep the workstream out of any `fixed-code-first` or permanently single-mode framing.
The discovery readiness blocker must keep read-only discovery pointed at the future `domain_gateway` entry without implying handoff readiness or collapsing Thesis Ops into `Research Ops` or `Presentation Ops`.
The routing readiness blocker must freeze explicit routing evidence, keep the only successful target at `domain_gateway`, preserve the no-bypass rule against direct harness targeting, and avoid silently collapsing the workstream into another admitted domain.
The cross-domain wording blocker must keep Thesis Ops wording aligned between `OPL` and any future thesis domain without equating thesis assembly to `Research Ops` manuscript flow or `Presentation Ops` / `RedCube AI` deck production.
Those future packages are blockers only; they do not make `Thesis Ops` currently `G2` discovery-ready or `G3` routed-action-ready.

### Review Ops

`Review Ops` already has explicit top-level semantics in the task map / task topology: it groups reviewer-role work plus response/rebuttal coordination under one candidate semantic bundle.

What is still missing is a future domain boundary package that makes review-specific registry material, public gateway docs, truth ownership for review reports / comment structures / rebuttal plans / revision-route maps, review surfaces, an explicit execution-model declaration, discovery readiness, routing readiness, and cross-domain wording explicit.
That execution-model declaration must identify the stable agent runtime surface, show how `Auto` and `Human-in-the-loop` share one base, explain the code-versus-Agent responsibility split, and keep the workstream out of any `fixed-code-first` or permanently single-mode framing.
The discovery readiness blocker must keep read-only discovery pointed at the future `domain_gateway` entry without implying handoff readiness for the review bundle.
The routing readiness blocker must freeze explicit routing evidence, keep the only successful target at `domain_gateway`, and preserve the no-bypass rule against direct harness targeting.
The cross-domain wording blocker must keep reviewer-role wording aligned between `OPL` and any future review domain without transferring review-truth ownership into `OPL`.

The negative conclusion frozen here is that this combined label still does not justify admission, discovery readiness, routed-action readiness, handoff readiness, or OPL ownership of review truth.

## Reading Rule

Read this surface as a **reference-only blocker index**.

If a backlog entry exists, the workstream is still below the domain-onboarding gate.
`blocked` does not mean “almost admitted.”
It means the required boundary package is still incomplete.
If the execution-model declaration is still missing, the workstream remains under definition / deferred rather than becoming “ready,” “aligned,” or implicitly admitted.
If a public scaffold or domain-direction hint exists, it still counts only as top-level signal/evidence until the real boundary package is present.

It also does not let `OPL` quietly absorb these under-definition workstreams into `MedAutoScience` or `RedCube AI`.
Those admitted domains remain independent gateway-and-harness surfaces.

No backlog entry authorizes a domain handoff, discovery target, routed-action target, or harness access.

## Governing Sources

- [OPL Task Map](../task-map.md)
- [OPL Domain Onboarding Contract](../opl-domain-onboarding-contract.md)
- [OPL Gateway Contracts](../../contracts/opl-gateway/README.md)
- [OPL Gateway Acceptance Test Spec](./opl-gateway-acceptance-test-spec.md)

## Completion Definition

The candidate backlog is acceptable only when:

- each current candidate workstream has an explicit backlog entry
- blocker packages align to the onboarding-package categories
- blocker checks align to the onboarding formal-inclusion gate
- discovery readiness blockers and routing readiness blockers remain explicit as separate blocked checks
- execution-model blockers stay explicit in the public companion wording: stable agent runtime surface, shared-base `Auto` / `Human-in-the-loop` convergence, and code-versus-Agent responsibility split must all be named before anything can move beyond under definition / deferred
- no entry allocates future domain identity, gateway/harness surface metadata, or any routed readiness state
- the backlog stays discoverable and reviewable without becoming a control plane
- the backlog remains reference-only, non-executing, and non-admitting
