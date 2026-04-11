**English** | [中文](./roadmap.zh-CN.md)

# OPL Roadmap

## Current Phase

The priority of the current phase is not to launch every workstream at once.
It is to freeze the `OPL Gateway` language and stabilize the domain federation around the workstreams that are already real.

As of `2026-04-10`, the public `OPL` mainline remains at the absorbed `Phase 2 / Minimal admitted-domain federation activation package`.

What is already clear today:

- `OPL` is the top-level gateway and federation model for a one-person research lab
- the shared Harness Engineering umbrella language under `OPL` is now named the `Unified Harness Engineering Substrate`
- the most important shared pieces inside `UHS` are now converging into a `Shared Runtime Contract` and a `Shared Domain Contract`
- [`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience) is the active `Research Ops` domain gateway and harness
- [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) is the currently admitted visual-deliverable domain gateway and harness
- `ppt_deck` is the family that currently maps most directly to `Presentation Ops`
- `Grant Ops`, `Thesis Ops`, and `Review Ops` remain under definition
- `Grant Foundry -> Med Auto Grant` currently provides the public scaffold / top-level signal / domain-direction evidence for a future medical `Grant Ops` domain; its next milestones are registry material, `G2` discovery readiness, `G3` routed-action readiness, and domain-onboarding evidence
- the shared target operating pattern is `Agent-first`: current domain repositories stay `Auto-only`, while any future `Human-in-the-loop` product should reuse the same substrate as a compatible sibling or upper-layer product rather than forcing same-repo dual-mode logic
- the current active development host is Codex-only local sessions, while the preferred future product-runtime substrate direction remains a true upstream `Hermes-Agent` integration proved inside a domain repository first
- no domain repository has landed a true upstream `Hermes-Agent` integration yet; the ecosystem is still in a truth-reset and migration-design phase rather than a landed shared-runtime phase
- the current repository already has a runnable local `TypeScript CLI`-first / read-only gateway baseline
- that repo-tracked CLI-first / read-only baseline remains the current `OPL` `Phase 1` formal entry contract and public system surface
- the current top-level formal entry at the OPL layer remains that local `TypeScript CLI`-first / read-only gateway surface rather than a launcher or runtime-owner entry
- the absorbed `Phase 1 exit + next-stage activation package freeze` now acts as the predecessor gate for the current `Minimal admitted-domain federation activation package`
- `MedAutoScience` and `RedCube AI` now provide the two admitted domain surfaces that are stable enough for this minimum stronger federation activation, while the activation still applies to already admitted domains only
- no new active follow-on tranche is currently open: the honest top-level state is a central-sync stop until an admitted-domain repository lands a new absorbed delta or the central reference surfaces drift

Current phase boundaries:

- keep each workstream on an explicit domain boundary
- keep `OPL` at the gateway / federation layer
- keep planned workstreams on their definition and onboarding lanes until their domain evidence is ready
- keep shared execution-core extraction downstream of domain maturity and contract convergence

## Next Phase

The next phase should prioritize:

- keeping the completed `Phase 1 / G2 release-closeout` frozen as the `G2 stable public baseline`, while keeping the completed repo-tracked `Phase 1 / G3 thin handoff planning freeze hardening` closed at the planning-contract boundary
- freezing the `OPL Gateway -> domain gateway -> domain harness` control language
- freezing `route_request`, `build_handoff_payload`, and `audit_routing_decision` as planning-level contract operations only
- keeping the only allowed successful handoff target at `domain_gateway`, with a hard no-bypass rule against direct domain-harness targeting
- freezing the `UHS` language above the current domain repositories while keeping shared-code extraction decisions downstream of domain maturity
- freezing the `Shared Runtime Contract` v1 object set clearly, at least around `runtime profile`, `session substrate`, `gateway runtime status`, `memory hook`, `delivery / cron`, and `approval / interrupt`
- freezing the `Shared Domain Contract` v1 object set clearly, at least around the formal-entry matrix, the `per-run handle`, the durable report surface, the audit trail, gate semantics, and the no-bypass rule
- keeping `MedAutoScience` explicit as the `Research Ops` domain surface
- keeping `RedCube AI` explicit as the visual-deliverable domain surface
- proving at least one honest upstream `Hermes-Agent` pilot inside a domain repository before promoting any shared-runtime claim
- carrying the `Agent-first` plus `Auto-only current repo + future HITL layering` doctrine into future candidate-domain definitions
- keeping the absorbed `Phase 1 exit + next-stage activation package freeze` explicit as the predecessor gate for the current `Minimal admitted-domain federation activation package`, with every candidate path staying in explicit admission, discovery, routing, and handoff review lanes
- defining the next candidate domains through clear task boundaries and delivery objects, using the current `task-topology + candidate-domain-backlog + domain-onboarding` path
- progressively turning the `OPL Gateway` from a documentation-first surface into a real entry surface while keeping routed action at the planning-contract layer

The `Phase 1` candidate-domain closeout order is frozen as:

- `Review Ops`
- `Thesis Ops`

This ordering is a boundary-definition sequence that has now been frozen into the current `Phase 1 exit + next-stage activation package freeze`.
`Grant Ops` already has a frozen signal-and-scaffold lane through `Grant Foundry -> Med Auto Grant`, and its next visible milestones are registry material, discovery readiness, routing readiness, and onboarding evidence.
`Review Ops` remains an under-definition semantic bundle, keeps review truth domain-owned, and continues through the explicit `execution_model`, `discovery_readiness`, `routing_readiness`, and `cross_domain_wording` packages.
`Thesis Ops` follows the same package set while keeping its dissertation / defense role distinct from `Research Ops` manuscript flow and from `Presentation Ops` / `RedCube AI` deck production.
The absorbed predecessor follow-on is `Phase 1 exit + next-stage activation package freeze`; that predecessor gate is what allowed the current `Minimal admitted-domain federation activation package` to activate once the two-admitted-domain threshold turned green.
Any future successful handoff remains `domain_gateway`-only and subject to the no-bypass rule against direct harness targeting.

At the current `2026-04-10` reassessment, that predecessor freeze has already done its job, and the `Minimal admitted-domain federation activation package` is already absorbed into the current top-level truth.
The honest current top-level state is a central-sync stop: unless an admitted-domain repository lands a new absorbed delta or the central reference surfaces drift, no new active follow-on tranche is open.
That absorbed federation package still strengthens top-level federation wording for `MedAutoScience` + `RedCube AI`, keeps the formal entry at the same local `TypeScript CLI`-first / read-only gateway surface, and keeps `Grant Ops`, `Review Ops`, and `Thesis Ops` on their candidate-definition lanes.

## Later Phase

Only after at least two domain surfaces are truly stable, and at least one domain has proven a real upstream `Hermes-Agent` pilot, should `OPL` move toward a fuller ecosystem expression, such as:

- more formal cross-domain status maintenance
- a stronger public entry surface for the top-level gateway
- clearer shared protocols across domains
- pulling back a shared runtime substrate
- pulling back shared cross-domain formal behavior contracts
- online product entry surfaces for vertical scenarios

The entrance condition for this phase is multiple domain surfaces with clear independent boundaries.

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
- [OPL Vertical Online Agent Platform Roadmap](./references/opl-vertical-online-agent-platform-roadmap.md)

For canonical contract-level compositions across these frozen layers, see [OPL Gateway Example Corpus](./references/opl-gateway-example-corpus.md).

## Current Evaluation Criteria

To judge whether `OPL` is moving in the right direction, these checks matter:

- can readers understand that `OPL` is the top-level product and gateway language for the ecosystem?
- can readers understand the gateway / federation role of `OPL` and the independent domain role of each admitted surface?
- can readers understand that `MedAutoScience` remains the independent `Research Ops` domain gateway and harness?
- can readers understand that `RedCube AI` remains the independent visual-deliverable domain gateway and harness?
- can readers understand that `ppt_deck` maps directly to `Presentation Ops` while `xiaohongshu` stays a separate visual family at the OPL layer?
- are new workstreams being defined as domain surfaces instead of scattered features?
