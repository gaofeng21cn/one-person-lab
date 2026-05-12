**English** | [中文](./opl-domain-onboarding-contract.zh-CN.md)

# OPL Domain-Agent Admission Contract

> Current-status note (`2026-05-11`): this document is active human-readable support for candidate domain-agent admission review. The active admitted-domain paths are direct Codex/domain-skill activation and durable OPL stage-attempt hosting: `Codex-default executor -> explicit OPL activation -> provider-backed stage runtime -> selected domain-agent entry`, with `MAS`, `MAG`, and `RCA` exposed as independent domain agents.

## Purpose

This document defines the current review contract for admitting a new domain agent into the OPL framework.

Its goal is to define when a new domain-agent system may be selected by the `OPL` stage-led framework without blurring ownership, stage selection, or truth boundaries.

The target is not to add domain names early and clarify them later.
The target is to require explicit boundary material before official inclusion.

## Relationship To Active Framework Contracts

Domain-agent admission is reviewed against the active framework contract set:

- [OPL Candidate Domain Backlog](../references/domain-admission/opl-candidate-domain-backlog.md)
- the machine-readable contract surfaces in [`../contracts/opl-framework/README.md`](../../contracts/opl-framework/README.md)

If the domain-agent identity, stage capability package, truth ownership, and product entry surfaces are not stable, admission should not proceed.

For runtime dependencies, a candidate domain agent must treat `OPL Framework` as an external dependency environment: use `opl framework locate` / `opl_framework_locator` to resolve the framework root, CLI, contracts, state dir, and modules root before calling OPL-owned runtime, contract, or projection surfaces. It must not vendor or fork an OPL runtime, and it must not treat `One Person Lab App` as a required runtime entry; the App is only an optional workbench and projection consumer.

## Machine-Readable Companion

- [`../contracts/opl-framework/domains.json`](../../contracts/opl-framework/domains.json)
- [`../contracts/opl-framework/workstreams.json`](../../contracts/opl-framework/workstreams.json)
- [`../contracts/opl-framework/task-topology.json`](../../contracts/opl-framework/task-topology.json)
- [`../contracts/opl-framework/public-surface-index.json#opl_framework_locator`](../../contracts/opl-framework/public-surface-index.json)

These contracts materialize the admitted domain-agent catalog and stage topology as non-executing framework surfaces.
They do not grant OPL domain truth, and they do not admit candidate workstreams automatically.
Public scaffolds or domain-direction hints may clarify a candidate path, but they still count only as top-level signal until the real domain-agent boundary package lands.
This rule now applies to the remaining candidate workstreams only: `Grant Ops` has moved onto the admitted `MedAutoGrant` domain-agent entry, while `IP Ops`, `Award Ops`, `Thesis Ops`, and `Review Ops` still require full admission packages.

## Execution-Model Review Companions

When a reviewer checks whether an onboarding package really aligns with the current `OPL` execution direction, start with the current Codex-default executor and provider-backed stage-runtime wording:

- [OPL Runtime Naming And Boundary Contract](./opl-runtime-naming-and-boundary-contract.md) — current Codex-default executor, provider-backed stage runtime, and host-agent / managed-runtime deployment-shape wording
- [Family Executor Adapter Defaults](../references/runtime-substrate/family-executor-adapter-defaults.md) — Chinese-only internal reference for the current family executor naming, default mode, default model, and Hermes-Agent experimental boundary

If historical migration context is still needed during review, use these historical references separately:

- [Codex-default Host-Agent Runtime Contract](../history/runtime-substrate/host-agent-runtime-contract.md) — historical local host-agent runtime contract; current useful wording has been absorbed into the runtime naming and boundary contract
- [Development Operating Model](../history/frontdoor-legacy/development-operating-model.md) — Chinese-only internal reference for historical `Codex Host` / `OMX` migration discipline; not a current execution guide
- [Runtime Alignment Taskboard](../history/frontdoor-legacy/runtime-alignment-taskboard.md) — Chinese-only historical reference for the retired four-repo convergence checklist
- [OMX historical archive](../history/omx/README.md) — Chinese-only tombstone for retired OMX-era workflow material

The active execution path remains Codex-default at the concrete executor layer and provider-backed at the framework runtime layer. These companions help reviewers keep current execution-model wording separate from retained historical migration boundaries during onboarding.
They do **not** turn `OPL` into the runtime owner of a candidate domain.

## Core Promise

A new domain may be officially included in `OPL` only when:

- its registry identity is explicit
- its truth ownership is explicit
- its public domain-agent entry and internal harness boundary are explicit
- its review surfaces are explicit
- its execution model is explicitly aligned with `OPL`'s `Codex CLI + autonomous mode + shared-base substrate layering` direction
- top-level stage selection can point to it without prose-only guesswork

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

#### Required domain-agent registry entry

The domain entry must define all active domain-agent fields:

- `domain_id`
- `label`
- `project`
- `independent_domain_agent`
- `single_app_skill`
- `domain_truth_owner`
- `opl_projection_role`
- `runtime_dependency_boundary`
- `standalone_allowed`
- `owned_workstreams`
- `non_opl_families`

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

#### Required stage vocabulary impact

The onboarding package must state whether the new domain:

- reuses the existing stage vocabulary without extension
- requires new `intent_id`, `delivery_kind`, `review_kind`, or other top-level vocabulary entries

No vocabulary expansion may be implied only in prose.

### 2. Public Documentation Surface

A new domain must provide public, reviewable documentation that makes the boundary legible from outside the runtime.

At minimum, the onboarding package must provide:

- a public domain README or equivalent domain-agent entry document
- an explicit statement of the public domain-agent entry and the internal harness/controller boundary below it
- an explicit statement that the domain remains independently usable and is not merely an internal `OPL` module
- an explanation of the workstream(s), deliverable objects, and review semantics the domain owns
- an explanation of its stable agent runtime / tool / controller surface and the code-versus-Agent responsibility split
- enough public wording for `OPL` docs to link to the domain without inventing its identity

The public surface must also absorb the still-valid content from the old product-entry and direct-entry plans without inheriting their Hermes-first or Gateway-first route.

Every domain onboarding package must explicitly distinguish three entry types:

| Entry type | Frozen meaning | OPL review focus |
| --- | --- | --- |
| `operator_entry` | commands, scripts, diagnostics, or operations entrypoints for engineers | May exist, but must not be presented as a normal user product entry. |
| `agent_entry` | CLI, MCP, controller, or app-skill callable surfaces for Codex or another host agent | Must be structured, auditable, and fail-closed; it cannot be just a prompt. |
| `product_entry` | launch, recovery, session, routing, and interaction entrypoint for an end user | Must state whether it is mature today; future hosted/web targets cannot be written as current reality. |

If the domain exposes `frontdoor_surface`, `operator_loop_surface`, or equivalent fields, the package must state:

- whether `frontdoor_surface` is a real user entry or only a product-entry shell;
- whether `operator_loop_surface` still owns the real runtime / controller loop;
- how the direct domain path and OPL-hosted path share owner receipts, artifact locators, and return surfaces;
- which entries are historical, diagnostic, or compatibility routes rather than defaults.

The `OPL -> domain` handoff envelope must at minimum express:

- `target_domain_id`
- `task_intent`
- `entry_mode`
- `workspace_locator`
- `runtime_session_contract`
- `return_surface_contract`
- `domain_truth_authority_refs`
- `artifact_locator_refs`

These fields route stage selection and handoff to the correct domain-agent entry. They do not move domain truth, quality verdicts, artifact authority, or user-facing delivery ownership into OPL.

## 3. Truth Ownership Declaration

A new domain must explicitly declare what truth it owns.

That declaration must be precise enough that readers can tell:

- which runtime truth remains inside the domain
- which run / delivery / audit / review records belong to the domain
- what `OPL` may index, project, or select at stage boundaries
- what `OPL` may not claim as canonical truth

No domain may be officially admitted while truth ownership remains ambiguous.

## 4. Review Surface Declaration

A new domain must expose explicit review surfaces, not just execution claims.

The onboarding package must identify:

- what human review surfaces exist
- what publish or release gates exist
- what quality-regression or comparable review hooks exist
- how top-level `OPL` stage selection and projection refer to those review semantics

If a domain cannot explain how work is reviewed, it is not ready for official domain-agent admission.

## 5. Execution Model Declaration

A new domain must explicitly declare how its execution model aligns with `OPL`, not merely claim that it can run.

The onboarding package must identify:

- whether the default executor name is `Codex CLI`, whether the default mode is `autonomous`, whether the default model / reasoning inherit the local `Codex` default configuration, and what stable agent runtime surface it depends on
- whether the current repository mainline is `Auto-only`, and if so how any future `Human-in-the-loop` product would reuse the same substrate as a compatible sibling or upper-layer product rather than as same-repo dual-mode logic
- how its formal-entry matrix is expressed through `default_formal_entry`, `supported_protocol_layer`, and `internal_controller_surface`
- whether any `Hermes-Agent` executor route marked `experimental` is a full `Hermes AIAgent` loop rather than a single-step chat or chat relay
- which stable object / controller / tool / gate / review responsibilities stay in code
- which parts must not be described as a `fixed-code-first` mainline with the Agent reduced to prompt fill-ins

If a domain cannot explain how its execution model aligns with `OPL`'s shared operating pattern, it is not ready for official domain-agent admission.

## 6. Stage Selection Readiness Declaration

A new domain must explicitly declare how OPL stage selection reaches its public entry.

The onboarding package must identify:

- which domain-agent entry surface stage selection points to
- which workstream IDs become selectable through that entry
- which wording keeps selection at the framework layer without implying OPL ownership of domain truth

Top-level signal or domain-direction evidence alone does not satisfy this package.

## 7. Stage Execution Readiness Declaration

A new domain must explicitly declare how a selected stage enters the domain agent.

The onboarding package must identify:

- which domain-agent entry is the only allowed successful stage target
- which workstream IDs become stage-eligible
- which explicit stage / handoff evidence keeps the no-bypass-to-internal-harness rule intact

If the package cannot keep the only successful target at the public domain-agent entry, it is not stage-execution ready.
Public scaffolds or direction hints alone do not satisfy this package.

## 8. Cross-Domain Wording Alignment

A new domain must expose enough linked OPL/domain wording that reviewers can verify the same top-level role language on both sides.

The onboarding package must identify:

- which OPL public surfaces carry the linked role wording
- which domain public surfaces carry the matching wording
- which boundary statement keeps any signal-only scaffold from being misread as admission, stage-selection readiness, stage-execution readiness, or handoff readiness

If this wording cannot be reviewed explicitly, the domain remains below formal inclusion.

For the current candidate path, `IP Ops`, `Award Ops`, `Review Ops`, and `Thesis Ops` remain below formal inclusion.
`IP Ops` keeps patent truth and human/legal review gates outside `OPL` and outside `MedAutoGrant` until a future domain boundary package exists.
`Award Ops` keeps award truth and human expert review gates outside `OPL` and outside `MedAutoGrant` until a future domain boundary package exists.
`Review Ops` keeps `execution_model`, `stage_selection_readiness`, `stage_execution_readiness`, and `cross_domain_wording` explicit as blocked packages, keeps review truth outside `OPL`, and keeps no handoff-ready domain-agent entry.
`Thesis Ops` also keeps `execution_model`, `stage_selection_readiness`, `stage_execution_readiness`, and `cross_domain_wording` explicit as blocked packages; it remains distinct from `Research Ops` manuscript/submission flow and from `Presentation Ops` / `RedCube AI` deck production, and keeps no handoff-ready domain-agent entry.

## Formal Inclusion Gate

A domain is formally includable in `OPL` only when all of the following are true:

1. **Registry complete**  
   The required registry entries are present and internally consistent.

2. **Boundary explicit**  
   The domain README and top-level OPL docs can describe the domain without ambiguity.

3. **Truth ownership explicit**  
   Canonical truth remains inside the domain and is not silently rehomed to `OPL`.

4. **Stage selection ready**
   OPL stage selection can identify the domain, its owned workstream(s), and the correct public entry surface.

5. **Stage execution ready**
   Stage execution can enter the public domain-agent entry with explicit evidence and without bypassing the domain-owned harness/controller boundary.

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
- treating an existing domain harness as if it automatically defines a new domain-agent entry
- treating a family or profile name as if it automatically defines a top-level workstream
- describing a domain as officially onboarded before stage selection and execution surfaces are updated
- allowing a domain to dodge the `Agent-first` / current-`Auto-only` / future-`Human-in-the-loop` layering question or to present a `fixed-code-first` mainline at admission time

## Minimal Onboarding Review Questions

Before official inclusion, the top-level review should be able to answer:

- What workstream(s) does this domain own?
- What public domain-agent entry does it expose?
- What harness/controller surface sits below it?
- What truth remains canonical inside the domain?
- What families are inside the domain but not automatically equal to an OPL workstream?
- How does `OPL` select and enter it at stage boundaries?
- What stable agent runtime surface does it depend on?
- How does the current `Auto-only` repository stay compatible with any future `Human-in-the-loop` sibling or upper-layer product?
- Why is this a new domain rather than just a family inside an existing domain?

If these questions cannot be answered clearly, the onboarding is not ready.

## Completion Definition

The domain onboarding contract is satisfied only when future domain admissions can be reviewed against a stable top-level gate instead of ad hoc wording.
