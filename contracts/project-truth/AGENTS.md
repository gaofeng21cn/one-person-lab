# One Person Lab Project Truth Contract

This file is the project truth contract for `One Person Lab`.
It defines what `OPL` is, what it is not, and which boundaries must remain stable as the ecosystem grows.

## Scope

Apply this contract to the repository as a whole unless a deeper `AGENTS.md` explicitly overrides it.

## Project Identity

- `OPL` is the top-level gateway and federation model for a one-person research lab.
- `OPL` is not a synonym for any single domain project.
- `OPL` is not a monolithic runtime that replaces domain gateways.
- `OPL` is not itself a fourth `Domain Harness OS`.
- Humans define goals, provide data or context, review formal outputs, and decide continue/stop/reframe.
- Agents read state, call stable gateways, organize work, and write key traces back to auditable surfaces.
- Every `OPL` workstream must converge toward one shared base that supports both `Auto` and `Human-in-the-loop` execution.
- That shared base is now named the `Unified Harness Engineering Substrate`.
- The default executor is a `Codex`-class agent runtime; code exists to provide stable gateways, controllers, tools, gates, and auditable surfaces rather than to replace Agents as the primary driver.
- The current local default deployment shape is a `Codex`-default host-agent runtime, but future managed web runtimes may still sit on the same substrate.
- Domain systems such as `MedAutoScience` and `RedCube AI` remain independent domain gateways and `Domain Harness OS` implementations under the `OPL` umbrella.

## Architecture Priorities

- Prefer the chain `Human / Agent -> OPL Gateway -> Domain Gateway -> Domain Harness OS`.
- Keep the shared-foundation language above any one domain repository.
- Keep `Unified Harness Engineering Substrate` language above any one domain repository and do not imply that it already exists as a separate shared public code framework.
- Preserve independent domain gateways instead of collapsing everything into one runtime.
- Freeze `Agent-first` and `one base / two modes` semantics at the OPL layer before domains hydrate them.
- Freeze cross-domain task semantics at the OPL layer first, then let domains hydrate them.
- Do not allow any OPL workstream to drift into a fixed-code-first steady state with Agents reduced to prompt fillers.
- Do not reintroduce “OPL is only a static blueprint” as the primary product description.

## Stability Rules

- This repository is the documentation-first and contract-first public surface for the OPL gateway.
- This repository may define the shared substrate language, but it does not become the runtime owner for domain-local execution.
- Do not describe planned workstreams as already implemented.
- Do not describe domain projects as if they were the whole of `OPL`.
- Do not describe a fixed-code-first pipeline or a single-mode lane as the intended steady state for any OPL workstream.
- Current read-only control-plane phases may defer runtime build-out, but they must not weaken the long-term `Agent-first` / dual-mode architecture.
- Large structural changes should preserve the independence of existing domain surfaces.

## Documentation Layers

- `README.md` and `README.zh-CN.md` define the public top-level positioning.
- `docs/README.md` and `docs/README.zh-CN.md` define the docs gateway and the four-layer document taxonomy for this repository.
- Layer 1 and Layer 2 public docs must stay bilingual.
- Layer 3 reference-grade docs may remain repo-tracked, but they must not crowd the default reading path in the root README or be described as runtime-owning truth.
- `docs/specs/**` and `docs/plans/**` are historical design/planning records rather than living truth surfaces.
- Internal technical/planning docs default to Chinese unless there is an explicit reason to publish synchronized bilingual mirrors.
- Avoid unnecessary mixed-language prose; keep English for fixed terms, paths, commands, schemas, and code identifiers.
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
- `Med Auto Grant` is the current future medical `Grant Ops` domain harness direction, but it is not yet an admitted domain gateway and harness.
- `ppt_deck` maps directly to `Presentation Ops`; `xiaohongshu` shares the same RedCube harness but is not automatically equivalent to `Presentation Ops`.
- Future workstreams should be added as explicit domain surfaces rather than as scattered features inside existing domains.
- Future domains must expose an `Agent-first` execution story and a credible `Auto` / `Human-in-the-loop` convergence path before being treated as formally aligned with `OPL`.

## Conflict Handling

- User instructions override this file.
- Deeper `AGENTS.md` files override this file for narrower scopes.
- Repository execution rules govern how work is done.
- This file governs what `OPL` must remain.
