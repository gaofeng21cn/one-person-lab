**English** | [中文](./roadmap.zh-CN.md)

# OPL Roadmap

## Current Phase

The priority of the current phase is not to launch every workstream at once.
It is to freeze the `OPL Gateway` language and stabilize the domain federation around the workstreams that are already real.

What is already clear today:

- `OPL` is the top-level gateway and federation model for a one-person research lab
- [`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience) is the active `Research Ops` domain gateway and harness
- [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) is the emerging visual-deliverable domain gateway and harness
- `ppt_deck` is the family that currently maps most directly to `Presentation Ops`
- `Grant Ops`, `Thesis Ops`, and `Review Ops` remain under definition

What this phase does not do:

- collapse all workstreams into one runtime
- describe domain projects as if they were the whole of `OPL`
- describe `OPL` as only a static blueprint
- claim that planned workstreams are already implemented

## Next Phase

The next phase should prioritize:

- freezing the `OPL Gateway -> domain gateway -> domain harness` control language
- keeping `MedAutoScience` explicit as the `Research Ops` domain surface
- keeping `RedCube AI` explicit as the visual-deliverable domain surface
- defining the next candidate domains through clear task boundaries and delivery objects
- progressively turning the `OPL Gateway` from a documentation-first surface into a real entry surface

Among the still-undefined workstreams, the more natural priority order is usually:

- `Grant Ops`
- `Review Ops`
- `Thesis Ops`

## Later Phase

Only after at least two domain surfaces are truly stable should `OPL` move toward a fuller ecosystem expression, such as:

- more formal cross-domain status maintenance
- a stronger public entry surface for the top-level gateway
- clearer shared protocols across domains

The condition for this phase is not “many ideas.”
It is “multiple domain surfaces with clear independent boundaries.”

For the detailed gateway rollout path, see:

- [OPL Gateway Rollout](opl-gateway-rollout.md)
- [OPL Federation Contract](opl-federation-contract.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)
- [OPL Routed Action Gateway](opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](opl-domain-onboarding-contract.md)
- [OPL Gateway Acceptance Test Spec](opl-gateway-acceptance-test-spec.md)
- [OPL Governance / Audit Operating Surface](opl-governance-audit-operating-surface.md)

## Current Evaluation Criteria

To judge whether `OPL` is moving in the right direction, these checks matter:

- can readers understand that `OPL` is the top-level product and gateway language rather than just a static blueprint?
- can readers understand that `OPL` is not a monolithic runtime?
- can readers understand that `MedAutoScience` remains the independent `Research Ops` domain gateway and harness?
- can readers understand that `RedCube AI` remains the independent visual-deliverable domain gateway and harness?
- can readers understand that `ppt_deck` maps directly to `Presentation Ops` while `xiaohongshu` does not automatically equal `Presentation Ops`?
- are new workstreams being defined as domain surfaces instead of scattered features?
