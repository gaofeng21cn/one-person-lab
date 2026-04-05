# One Person Lab Project Truth Contract

This file is the project truth contract for `One Person Lab`.
It defines what `OPL` is, what it is not, and which boundaries must remain stable as the ecosystem grows.

## Scope

Apply this contract to the repository as a whole unless a deeper `AGENTS.md` explicitly overrides it.

## Project Identity

- `OPL` is the top-level gateway and federation model for a one-person research lab.
- `OPL` is not a synonym for any single domain project.
- `OPL` is not a monolithic runtime that replaces domain gateways.
- Humans define goals, provide data or context, review formal outputs, and decide continue/stop/reframe.
- Agents read state, call stable gateways, organize work, and write key traces back to auditable surfaces.
- Domain systems such as `MedAutoScience` and `RedCube AI` remain independent domain gateways and harnesses under the `OPL` umbrella.

## Architecture Priorities

- Prefer the chain `Human / Agent -> OPL Gateway -> Domain Gateway -> Domain Harness OS`.
- Keep the shared-foundation language above any one domain repository.
- Preserve independent domain gateways instead of collapsing everything into one runtime.
- Freeze cross-domain task semantics at the OPL layer first, then let domains hydrate them.
- Do not reintroduce “OPL is only a static blueprint” as the primary product description.

## Stability Rules

- This repository is the documentation-first and contract-first public surface for the OPL gateway.
- Do not describe planned workstreams as already implemented.
- Do not describe domain projects as if they were the whole of `OPL`.
- Large structural changes should preserve the independence of existing domain surfaces.

## Documentation Layers

- `README.md` and `README.zh-CN.md` define the public top-level positioning.
- `docs/` contains stable public documents for the OPL operating model, federation model, task map, and roadmap.
- `.omx/` and `.codex/` remain local tooling state and must stay untracked.

## Data And State Mutation

- This repository primarily freezes definitions and boundaries rather than serving as the main runtime mutation surface.
- Cross-domain contracts should be documented here before domain implementations diverge.
- Do not silently blur task boundaries to make inconsistent domains appear unified.

## Review Surface

- Humans should review the public positioning, gateway boundaries, task-map semantics, and roadmap language in this repository.
- Runtime truth, audit trails, and deliverable state remain owned by the relevant domain repositories rather than by `OPL`.

## Domain-Specific Direction

- `MedAutoScience` is the active `Research Ops` domain gateway and harness.
- `RedCube AI` is the emerging visual-deliverable domain gateway and harness.
- `ppt_deck` maps directly to `Presentation Ops`; `xiaohongshu` shares the same RedCube harness but is not automatically equivalent to `Presentation Ops`.
- Future workstreams should be added as explicit domain surfaces rather than as scattered features inside existing domains.

## Conflict Handling

- User instructions override this file.
- Deeper `AGENTS.md` files override this file for narrower scopes.
- Repository execution rules govern how work is done.
- This file governs what `OPL` must remain.
