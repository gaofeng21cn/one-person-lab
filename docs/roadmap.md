**English** | [中文](./roadmap.zh-CN.md)

# OPL Roadmap

## Current Phase

The priority of the current phase is not to launch every workstream at once.
It is to freeze the `OPL Gateway` language and stabilize the domain federation around the workstreams that are already real.

As of `2026-04-07`, the public `OPL` mainline remains `Phase 1`.

What is already clear today:

- `OPL` is the top-level gateway and federation model for a one-person research lab
- the shared Harness Engineering base under `OPL` is now described as the `Unified Harness Engineering Substrate`, which remains a shared architectural substrate rather than a shared public code framework
- [`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience) is the active `Research Ops` domain gateway and harness
- [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) is the emerging visual-deliverable domain gateway and harness
- `ppt_deck` is the family that currently maps most directly to `Presentation Ops`
- `Grant Ops`, `Thesis Ops`, and `Review Ops` remain under definition
- `Grant Foundry -> Med Auto Grant` currently provides top-level signal / domain-direction evidence for a future medical `Grant Ops` domain only; it is not an admitted domain gateway and does not count as G2 discovery readiness or G3 routed-action readiness
- the shared target operating pattern is `Agent-first`, with `Auto` and `Human-in-the-loop` running on one common base; this is an architectural rule, not a claim that every domain surface already has both modes fully implemented
- the current local default deployment shape is a `Codex`-default host-agent runtime, but the same substrate should remain compatible with future managed web runtimes
- the current repository already has a runnable local `TypeScript CLI`-first / read-only gateway baseline
- that repo-tracked CLI-first / read-only baseline remains the current `OPL` `Phase 1` formal entry contract and public system surface
- the current top-level formal entry at the OPL layer remains that local `TypeScript CLI`-first / read-only gateway surface rather than a launcher or runtime-owner entry

What this phase does not do:

- collapse all workstreams into one runtime
- describe domain projects as if they were the whole of `OPL`
- describe `OPL` as only a static blueprint
- claim that planned workstreams are already implemented
- turn `OPL` into a unified runtime owner
- pull a shared execution core forward before the domains are ready

## Next Phase

The next phase should prioritize:

- keeping the completed `Phase 1 / G2 release-closeout` frozen as the `G2 stable public baseline`, while keeping the completed repo-tracked `Phase 1 / G3 thin handoff planning freeze hardening` closed at the planning-contract boundary
- freezing the `OPL Gateway -> domain gateway -> domain harness` control language
- freezing `route_request`, `build_handoff_payload`, and `audit_routing_decision` as planning-level contract operations only
- keeping the only allowed successful handoff target at `domain_gateway`, with a hard no-bypass rule against direct domain-harness targeting
- freezing the `Unified Harness Engineering Substrate` language above the current domain repositories without pretending that a shared public code framework already exists
- keeping `MedAutoScience` explicit as the `Research Ops` domain surface
- keeping `RedCube AI` explicit as the visual-deliverable domain surface
- carrying the `Agent-first` plus dual-mode doctrine into future candidate-domain definitions instead of drifting toward fixed-code-first product lines
- hardening the current `Phase 1 / Grant Ops candidate-domain backlog and onboarding-package hardening` follow-on: tighten the `task-topology + candidate-domain-backlog + domain-onboarding` path without admitting a domain, discovery target, or routed-action target
- defining the next candidate domains through clear task boundaries and delivery objects, using the current `task-topology + candidate-domain-backlog + domain-onboarding` path rather than inventing a redundant intermediate control surface
- progressively turning the `OPL Gateway` from a documentation-first surface into a real entry surface without activating a routed-action runtime yet

Among the still-undefined workstreams, the more natural priority order is usually:

- `Grant Ops`
- `Review Ops`
- `Thesis Ops`

This priority ordering is only a boundary-definition sequence.
`Grant Ops` is the current candidate-domain hardening focus, but `Grant Foundry -> Med Auto Grant` still contributes only public scaffold / top-level signal / domain-direction evidence.
That does **not** satisfy registry material, discovery readiness, or routing readiness, and it does **not** make `Grant Ops` an admitted domain gateway, a `G2` discovery target, a `G3` routed-action target, or a handoff-ready surface before its domain-onboarding evidence exists.
Any future successful handoff remains `domain_gateway`-only and subject to the no-bypass rule against direct harness targeting.

## Later Phase

Only after at least two domain surfaces are truly stable should `OPL` move toward a fuller ecosystem expression, such as:

- more formal cross-domain status maintenance
- a stronger public entry surface for the top-level gateway
- clearer shared protocols across domains

The condition for this phase is not “many ideas.”
It is “multiple domain surfaces with clear independent boundaries.”

For the detailed gateway rollout path, see:

- [OPL Gateway Rollout](./references/opl-gateway-rollout.md)
- [OPL Federation Contract](opl-federation-contract.md)
- [OPL Public Surface Index](opl-public-surface-index.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)
- [OPL Routed Action Gateway](opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](opl-domain-onboarding-contract.md)
- [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.md)
- [OPL Gateway Acceptance Test Spec](./references/opl-gateway-acceptance-test-spec.md)
- [OPL Governance / Audit Operating Surface](./references/opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](./references/opl-publish-promotion-operating-surface.md)
- [Ecosystem Status Matrix](./references/ecosystem-status-matrix.md)

For canonical contract-level compositions across these frozen layers, see [OPL Gateway Example Corpus](./references/opl-gateway-example-corpus.md).

## Current Evaluation Criteria

To judge whether `OPL` is moving in the right direction, these checks matter:

- can readers understand that `OPL` is the top-level product and gateway language rather than just a static blueprint?
- can readers understand that `OPL` is not a monolithic runtime?
- can readers understand that `MedAutoScience` remains the independent `Research Ops` domain gateway and harness?
- can readers understand that `RedCube AI` remains the independent visual-deliverable domain gateway and harness?
- can readers understand that `ppt_deck` maps directly to `Presentation Ops` while `xiaohongshu` does not automatically equal `Presentation Ops`?
- are new workstreams being defined as domain surfaces instead of scattered features?
