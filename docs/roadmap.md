**English** | [中文](./roadmap.zh-CN.md)

# OPL Roadmap

## Current Role

`OPL` is the Codex-default session/runtime layer, the explicit activation layer, and the owner of family-level shared modules, contracts, and indexes for a one-person research lab.
Its current roadmap keeps the family-level boundary language stable while domain repositories continue to own their domain truth.

Today the public `OPL` surface centers on:

- `Codex CLI` as the default executor path for `opl`, `opl exec`, and `opl resume`
- explicit `OPL` activation for family-level semantics, domain discovery, and runtime switching
- shared modules, contracts, and indexes above `MedAutoScience`, `MedAutoGrant`, and `RedCube AI`
- `OPL Runtime Manager` as a thin product-managed adapter over external `Hermes-Agent`
- Rust native helper / index work limited to native assistance and indexed discovery, not domain truth or execution ownership

## Active Route

The active route for `OPL` is:

`Codex-default session/runtime -> explicit OPL activation -> selected domain agent entry -> optional product-managed runtime adapter`

Current work on that route stays focused on four priorities:

1. Keep `Codex CLI` as the default executor unless a user explicitly activates a different runtime.
2. Make family-level sessions, progress, artifacts, and shared indexes the current `OPL` truth surface rather than a web/API shell.
3. Treat `OPL Runtime Manager` as a thin adapter over external `Hermes-Agent`, not as a scheduler, session store, memory owner, domain truth owner, or concrete executor owner.
4. Keep public docs, contracts, and admitted-domain wording aligned with the real family topology.

## Near-Term Priorities

- keep legacy gateway and federation wording available only as compatibility/reference material while promoting the runtime/activation model to the mainline
- keep `Unified Harness Engineering Substrate`, `Shared Runtime Contract`, and `Shared Domain Contract` scoped as shared-above-domain surfaces
- keep external-kernel packaging honest around upstream `Hermes-Agent` ownership and `OPL Runtime Manager` as a product-managed adapter
- keep future hosted and desktop entry work anchored to the same runtime truth that drives the Codex-default executor path
- keep candidate domains moving through explicit definition and onboarding lanes

## Family Shape

The current family shape is already clear enough to guide the roadmap:

- `MedAutoScience` owns the `Research Ops` domain entry, workflow, runtime truth, and harness
- `MedAutoGrant` owns the admitted `Grant Ops` domain entry, workflow, runtime truth, and harness
- `RedCube AI` owns the visual-deliverable domain entry, workflow, runtime truth, and harness
- `ppt_deck` remains the clearest current bridge into `Presentation Ops`
- `IP Ops` stays on the definition and onboarding lane for `IP Foundry` / `Med Auto Patent`
- `Award Ops` stays on the definition and onboarding lane for `Award Foundry` / `Med Auto Award`
- `Thesis Ops` stays on the definition and onboarding lane for `Thesis Foundry` / `Med Auto Thesis`
- `Review Ops` stays on the definition and onboarding lane for `Review Foundry` / `Med Auto Review`

## Historical Records And Reference Surfaces

Historical activation packages, gateway/federation material, phase freezes, convergence boards, and migration traces stay in `docs/references/` and `docs/history/`.
The root roadmap keeps only the current family route and the reading path for active readers.

Use these reference surfaces when you need deeper context:

- [OPL Gateway Rollout](./references/opl-gateway-rollout.md)
- [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.md)
- [OPL Gateway Acceptance Test Spec](./references/opl-gateway-acceptance-test-spec.md)
- [OPL Governance / Audit Operating Surface](./references/opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](./references/opl-publish-promotion-operating-surface.md)
- [Ecosystem Status Matrix](./references/ecosystem-status-matrix.md)
- [OPL Vertical Online Agent Platform Roadmap](./references/opl-vertical-online-agent-platform-roadmap.md)
- [OPL Gateway Example Corpus](./references/opl-gateway-example-corpus.md)

## Evaluation Criteria

The roadmap is healthy when readers can immediately understand:

- `OPL` is the Codex-default session/runtime layer, explicit activation layer, and shared modules/contracts/indexes owner for the family
- admitted domains keep their own authority under that shell
- the default executor remains `Codex CLI`, while `OPL Runtime Manager` is only a thin product-managed adapter over external `Hermes-Agent`
- legacy `OPL Gateway`, `opl web`, `Product API`, and AionUI-first-shell material is read as compatibility or reference context unless a current core document promotes it
- future hosted and desktop work continues the same runtime/activation truth surfaces
- new workstreams are entering as explicit domain surfaces with clear boundaries
