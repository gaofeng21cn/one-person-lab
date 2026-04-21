**English** | [中文](./roadmap.zh-CN.md)

# OPL Roadmap

## Current Role

`OPL` is the top-level gateway and federation model for a one-person research lab.
Its current roadmap keeps the family-level control language stable while domain repositories continue to own their domain truth.

Today the public `OPL` surface centers on:

- a stable `TypeScript CLI`-first gateway contract baseline
- the local `opl` shell / TUI as the default front door
- the `opl web` pilot and `Product API` projection surface
- `AionUI` as the first external shell target
- explicit admitted-domain federation across `MedAutoScience`, `MedAutoGrant`, and `RedCube AI`

## Active Route

The active route for `OPL` is:

`ACP-native session runtime -> local opl shell / TUI -> AionUI first-shell cutover -> hosted / online projection`

Current work on that route stays focused on four priorities:

1. Keep `OPL Gateway -> domain gateway -> domain harness` as the stable control language.
2. Make the family-level session runtime the canonical truth rather than an API or GUI shell.
3. Land the local `opl` shell / TUI as a first-class entry, then validate the same runtime through `AionUI` as the first external shell.
4. Keep public docs, contracts, and admitted-domain wording aligned with the real family topology.

## Near-Term Priorities

- keep the gateway and federation wording frozen while promoting the runtime-first interaction model to the mainline
- keep `Unified Harness Engineering Substrate`, `Shared Runtime Contract`, and `Shared Domain Contract` scoped as shared-above-domain surfaces
- keep external-kernel packaging honest around upstream `Hermes-Agent` ownership
- keep future hosted and desktop entry work anchored to the same runtime truth that drives the local shell
- keep candidate domains moving through explicit definition and onboarding lanes

## Family Shape

The current family shape is already clear enough to guide the roadmap:

- `MedAutoScience` owns the `Research Ops` domain gateway and harness
- `MedAutoGrant` owns the admitted `Grant Ops` domain gateway and harness
- `RedCube AI` owns the visual-deliverable domain gateway and harness
- `ppt_deck` remains the clearest current bridge into `Presentation Ops`
- `Review Ops` and `Thesis Ops` stay on definition and onboarding lanes

## Historical Records And Reference Surfaces

Historical activation packages, phase freezes, convergence boards, and migration traces stay in `docs/references/` and `docs/history/`.
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

- `OPL` is the top-level product and gateway language for the family
- admitted domains keep their own authority under that shell
- the active front door is the local `opl` shell / TUI, with `AionUI` as the first external shell target and `Product API` as projection surface
- future hosted and desktop work continues the same runtime truth surfaces
- new workstreams are entering as explicit domain surfaces with clear boundaries
