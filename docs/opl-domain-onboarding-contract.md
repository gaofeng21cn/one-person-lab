**English** | [中文](./opl-domain-onboarding-contract.zh-CN.md)

# OPL Domain Onboarding Contract

> Current-status note (`2026-05-03`): this document is retained for future or candidate-domain onboarding review. The active admitted-domain path is `Codex-default session/runtime -> explicit OPL activation -> selected domain agent entry`, with `MAS`, `MAG`, and `RCA` exposed as independent domain agents. Gateway / harness wording below is compatibility vocabulary for boundary review, not the current public first subject.

## Purpose

This document freezes the domain-onboarding contract for the `OPL Gateway`.

Its goal is to define when a new domain system may be formally admitted into the `OPL` federation without blurring ownership, routing, or truth boundaries.

The target is not to add domain names early and clarify them later.
The target is to require explicit boundary material before official inclusion.

## Relationship To G1, G2, And G3

Domain onboarding is downstream of the already frozen gateway layers:

- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Gateway Contract Surface](./opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md)
- [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.md)
- the machine-readable contract surfaces in [`../contracts/opl-gateway/README.md`](../contracts/opl-gateway/README.md)

If the top-level registry, discovery, and routed-action layers are not stable, domain onboarding should not proceed.

## Machine-Readable Companion

- [`../contracts/opl-gateway/domain-onboarding-readiness.schema.json`](../contracts/opl-gateway/domain-onboarding-readiness.schema.json)
- [`../examples/opl-gateway/domain-onboarding-readiness.json`](../examples/opl-gateway/domain-onboarding-readiness.json)
- [`../contracts/opl-gateway/candidate-domain-backlog.json`](../contracts/opl-gateway/candidate-domain-backlog.json)

This schema materializes the onboarding-readiness record as a non-executing contract surface.
It does not admit domains automatically, and it does not replace the prose review gate in this document.
The example record is illustrative only and does not count as a formal domain admission.
The candidate-domain backlog is the upstream blocker surface for under-definition workstreams; it records what is still missing before an onboarding-readiness record can even exist. For the human-readable companion, see [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.md).
`OPL` does not currently define a separate candidate-domain-definition contract between task topology, backlog, and onboarding; the existing three-layer composition is the current definition path unless a real missing boundary is proven.
Public scaffolds or domain-direction hints may clarify a candidate path, but they still count only as top-level signal / domain-direction evidence until the real boundary package lands.
This rule now applies to the remaining candidate workstreams only: `Grant Ops` has already moved onto the admitted `MedAutoGrant` domain gateway, while `IP Ops`, `Award Ops`, `Thesis Ops`, and `Review Ops` still require full onboarding packages before admission.

## Execution-Model Review Companions

When a reviewer checks whether an onboarding package really aligns with the current `OPL` execution direction, start with the current Codex-only execution wording:

- [Codex-default Host-Agent Runtime Contract](./references/host-agent-runtime-contract.md) — Chinese-only internal reference for the current local default runtime wording
- [Family Executor Adapter Defaults](./references/family-executor-adapter-defaults.md) — Chinese-only internal reference for the current family executor naming, default mode, default model, and Hermes-Agent experimental boundary

If historical migration context is still needed during review, use these historical references separately:

- [Development Operating Model](./references/development-operating-model.md) — Chinese-only internal reference for historical `Codex Host` / `OMX` migration discipline; not a current execution guide
- [Runtime Alignment Taskboard](./references/runtime-alignment-taskboard.md) — Chinese-only historical reference for the retired four-repo convergence checklist
- [OMX historical archive](./history/omx/README.md) — Chinese-only tombstone for retired OMX-era workflow material

The active execution path remains Codex-only; these companions help reviewers keep current execution-model wording separate from retained historical migration boundaries during onboarding.
They do **not** turn `OPL` into the runtime owner of a candidate domain.

## Core Promise

A new domain may be officially included in `OPL` only when:

- its registry identity is explicit
- its truth ownership is explicit
- its public gateway / harness boundary is explicit
- its review surfaces are explicit
- its execution model is explicitly aligned with `OPL`'s `Codex CLI + autonomous mode + shared-base substrate layering` direction
- top-level discovery and routing can point to it without prose-only guesswork

`OPL` must not accept “placeholder first, boundary later” onboarding.

## Non-Goals

This contract does not:

- turn `OPL` into the runtime owner of a new domain
- let a domain exist only as an internal implementation detail under `OPL`
- admit a domain based only on a product name, repository link, or future intent
- allow a family name to stand in for workstream semantics without an explicit top-level mapping
- admit a domain whose primary shape is `fixed-code-first` or whose long-term target is only a single execution mode

## Required Onboarding Package

### 1. Registry Material

A new domain must provide a complete registry package.

#### Required domain registry entry

The domain entry must define all `G1` domain fields:

- `domain_id`
- `label`
- `project`
- `role`
- `gateway_surface`
- `harness_surface`
- `standalone_allowed`
- `owned_workstreams`
- `non_opl_families`
- `canonical_truth_owner`

#### Required workstream registry entry

If the new domain owns a new OPL workstream, it must also provide a complete workstream entry with all `G1` workstream fields:

- `workstream_id`
- `label`
- `status`
- `description`
- `domain_id`
- `entry_mode`
- `primary_families`
- `top_level_intents`
- `notes`

If the new domain becomes the owner of an already defined workstream, that ownership transfer must still be made explicit in the workstream registry.

#### Required routing vocabulary impact

The onboarding package must state whether the new domain:

- reuses the existing routing vocabulary without extension
- requires new `intent_id`, `delivery_kind`, `review_kind`, or other top-level vocabulary entries

No vocabulary expansion may be implied only in prose.

### 2. Public Documentation Surface

A new domain must provide public, reviewable documentation that makes the boundary legible from outside the runtime.

At minimum, the onboarding package must provide:

- a public domain README or equivalent gateway entry document
- an explicit statement that the domain is a `domain gateway` above its own `harness`
- an explicit statement that the domain remains independently usable and is not merely an internal `OPL` module
- an explanation of the workstream(s), deliverable objects, and review semantics the domain owns
- an explanation of its stable agent runtime / gateway / tool / controller surface and the code-versus-Agent responsibility split
- enough public wording for `OPL` docs to link to the domain without inventing its identity

## 3. Truth Ownership Declaration

A new domain must explicitly declare what truth it owns.

That declaration must be precise enough that readers can tell:

- which runtime truth remains inside the domain
- which run / delivery / audit / review records belong to the domain
- what `OPL` may index or route across
- what `OPL` may not claim as canonical truth

No domain may be officially admitted while truth ownership remains ambiguous.

## 4. Review Surface Declaration

A new domain must expose explicit review surfaces, not just execution claims.

The onboarding package must identify:

- what human review surfaces exist
- what publish or release gates exist
- what quality-regression or comparable review hooks exist
- how top-level `OPL` discovery and routed handoff refer to those review semantics

If a domain cannot explain how work is reviewed, it is not ready for official federation admission.

## 5. Execution Model Declaration

A new domain must explicitly declare how its execution model aligns with `OPL`, not merely claim that it can run.

The onboarding package must identify:

- whether the default executor name is `Codex CLI`, whether the default mode is `autonomous`, whether the default model / reasoning inherit the local `Codex` default configuration, and what stable agent runtime surface it depends on
- whether the current repository mainline is `Auto-only`, and if so how any future `Human-in-the-loop` product would reuse the same substrate as a compatible sibling or upper-layer product rather than as same-repo dual-mode logic
- how its formal-entry matrix is expressed through `default_formal_entry`, `supported_protocol_layer`, and `internal_controller_surface`
- whether any `Hermes-Agent` executor route marked `experimental` is a full `Hermes AIAgent` loop rather than a single-step chat or chat relay
- which stable object / controller / tool / gate / review responsibilities stay in code
- which parts must not be described as a `fixed-code-first` mainline with the Agent reduced to prompt fill-ins

If a domain cannot explain how its execution model aligns with `OPL`'s shared operating pattern, it is not ready for official federation admission.

## 6. Discovery Readiness Declaration

A new domain must explicitly declare how `G2` read-only discovery reaches its public entry.

The onboarding package must identify:

- which `domain_gateway` surface discovery points to
- which workstream IDs become discoverable through that gateway entry
- which wording keeps discovery at the read-only / public-entry layer without implying handoff readiness

Top-level signal or domain-direction evidence alone does not satisfy this package.

## 7. Routing Readiness Declaration

A new domain must explicitly declare how `G3` routing would target the domain gateway once routing is actually activated.

The onboarding package must identify:

- which `domain_gateway` surface is the only allowed successful routing target
- which workstream IDs become routing-eligible
- which explicit routing / handoff evidence keeps the no-bypass rule intact

If the package cannot keep the only successful target at `domain_gateway`, it is not routing-ready.
Public scaffolds or direction hints alone do not satisfy this package.

## 8. Cross-Domain Wording Alignment

A new domain must expose enough linked OPL/domain wording that reviewers can verify the same top-level role language on both sides.

The onboarding package must identify:

- which OPL public surfaces carry the linked role wording
- which domain public surfaces carry the matching wording
- which boundary statement keeps any signal-only scaffold from being misread as admission, discovery readiness, routing readiness, or handoff readiness

If this wording cannot be reviewed explicitly, the domain remains below formal inclusion.

For the current candidate path, `IP Ops`, `Award Ops`, `Review Ops`, and `Thesis Ops` remain below formal inclusion.
`IP Ops` keeps patent truth and human/legal review gates outside `OPL` and outside `MedAutoGrant` until a future domain boundary package exists.
`Award Ops` keeps award truth and human expert review gates outside `OPL` and outside `MedAutoGrant` until a future domain boundary package exists.
`Review Ops` keeps `execution_model`, `discovery_readiness`, `routing_readiness`, and `cross_domain_wording` explicit as blocked packages, keeps review truth outside `OPL`, keeps no handoff-ready surface, and keeps any future successful handoff at `domain_gateway`-only / no-bypass.
`Thesis Ops` also keeps `execution_model`, `discovery_readiness`, `routing_readiness`, and `cross_domain_wording` explicit as blocked packages; it remains distinct from `Research Ops` manuscript/submission flow and from `Presentation Ops` / `RedCube AI` deck production, keeps no handoff-ready surface, and keeps any future successful handoff at `domain_gateway`-only / no-bypass.

## Formal Inclusion Gate

A domain is formally includable in `OPL` only when all of the following are true:

1. **Registry complete**  
   The required registry entries are present and internally consistent.

2. **Boundary explicit**  
   The domain README and top-level OPL docs can describe the domain without ambiguity.

3. **Truth ownership explicit**  
   Canonical truth remains inside the domain and is not silently rehomed to `OPL`.

4. **Discovery ready**  
   `G2` discovery can identify the domain, its owned workstream(s), and the correct entry surface.

5. **Routing ready**  
   `G3` routed action semantics can route into the domain gateway with explicit evidence and without bypassing the domain gateway.

6. **Review ready**  
   The domain exposes explicit review semantics and not just an execution path.

7. **Execution model aligned**
   The domain explicitly stays `Agent-first`, describes its current `Auto-only` mainline honestly, and gives a credible substrate-compatible layering path for any future `Human-in-the-loop` product instead of forcing same-repo dual-mode logic or drifting into a `fixed-code-first` mainline.

8. **Cross-domain wording aligned**
   `OPL`, the domain README, and any linked public surfaces use the same top-level role language.

If any of these fail, the domain may still be under discussion, but it is not yet formally included.

## Hard Prohibitions

The following are not allowed:

- adding a domain name to `OPL` navigation before the boundary package exists
- admitting a domain whose truth ownership is still “to be decided”
- treating an existing domain harness as if it automatically defines a new domain gateway
- treating a family or profile name as if it automatically defines a top-level workstream
- describing a domain as officially onboarded before discovery and routing surfaces are updated
- allowing a domain to dodge the `Agent-first` / current-`Auto-only` / future-`Human-in-the-loop` layering question or to present a `fixed-code-first` mainline at admission time

## Minimal Onboarding Review Questions

Before official inclusion, the top-level review should be able to answer:

- What workstream(s) does this domain own?
- What gateway surface does it expose?
- What harness surface sits below it?
- What truth remains canonical inside the domain?
- What families are inside the domain but not automatically equal to an OPL workstream?
- How does `OPL` discover and route into it?
- What stable agent runtime surface does it depend on?
- How does the current `Auto-only` repository stay compatible with any future `Human-in-the-loop` sibling or upper-layer product?
- Why is this a new domain rather than just a family inside an existing domain?

If these questions cannot be answered clearly, the onboarding is not ready.

## Completion Definition

The domain onboarding contract is satisfied only when future domain admissions can be reviewed against a stable top-level gate instead of ad hoc wording.
