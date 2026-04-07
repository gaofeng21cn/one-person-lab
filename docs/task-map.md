**English** | [中文](./task-map.zh-CN.md)

# OPL Task Map

## Overview

`OPL` divides the formal work of a one-person research lab into five workstreams:

- `Research Ops`
- `Grant Ops`
- `Thesis Ops`
- `Review Ops`
- `Presentation Ops`

This split defines top-level task semantics.
At runtime, those semantics should route through the `OPL Gateway` into independent domain gateways rather than being collapsed into one runtime.

At the operating level, these workstreams also share one target doctrine:

- use `Agent-first` domain systems rather than fixed-code workflow engines
- support both `Auto` and `Human-in-the-loop` modes on the same shared foundation

The task map freezes workstream boundaries and delivery objects.
It does not require one UI, one model provider, or one fixed-code orchestration stack.

## Machine-Readable Companions

- [`../contracts/opl-gateway/task-topology.json`](../contracts/opl-gateway/task-topology.json)
- [`../contracts/opl-gateway/candidate-domain-backlog.json`](../contracts/opl-gateway/candidate-domain-backlog.json)

These companions materialize:

- the top-level task topology as a machine-readable semantic surface
- the missing admission-boundary materials for the current under-definition workstreams

They may describe under-definition workstreams such as `Grant Ops`, `Thesis Ops`, and `Review Ops`, but they do **not** admit new domains, create `G2` discovery readiness, or create `G3` routed-action readiness for them.

At the current baseline, `candidate-domain definition` is the composition of:

- task boundaries and delivery objects in `task-topology`
- missing boundary packages in the candidate-domain backlog
- formal admission rules in the domain-onboarding contract

`OPL` does **not** currently add a separate intermediate candidate-domain-definition surface above those layers, because doing so would risk duplicating semantic, blocker, or admission truth.

For the human-readable companion to that backlog, see [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.md).

## Research Ops

`Research Ops` covers the main chain from data to paper delivery.

Typical tasks include:

- data governance
- research question formation
- analysis and validation progression
- evidence packaging
- manuscript and submission delivery

Typical delivery objects include:

- analysis packages
- evidence packages
- manuscripts
- submission packages

The current domain gateway for this workstream is:

- [`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience)

## Grant Ops

`Grant Ops` covers grant-direction / proposal authoring plus proposal-side reviewer simulation and revision inside the grant-writing loop.

Typical tasks include:

- feasibility assessment for grant directions and topics
- proposal structure generation
- organizing background, innovation claims, and technical routes
- simulating reviewer comments
- proposal iteration

These simulation and revision steps remain proposal-authoring aids; they do not by themselves create a reviewer-role surface.

This workstream clearly reuses:

- literature assets
- research memory
- review memory
- existing study results and figures

Typical delivery objects include:

- grant-direction assessments
- proposal outlines and drafts
- reviewer-simulation packs
- proposal revision plans

Current boundary status:

- still under definition
- not yet an admitted domain
- not yet a registered `G1` workstream/domain mapping
- not yet a `G2` discovery target
- not yet a `G3` routed-action target
- not eligible for domain handoff
- the current `Grant Foundry -> Med Auto Grant` public scaffold provides top-level signal / domain-direction evidence only; it is not an admitted domain gateway and does not count as G2 discovery readiness, G3 routed-action readiness, or a handoff-ready surface
- admission blockers are tracked in [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.md)
- `Grant Foundry -> Med Auto Grant` currently contributes public scaffold / top-level signal / domain-direction evidence only; it does not yet satisfy registry material, discovery readiness, routing readiness, or domain handoff eligibility
- any future successful handoff may target only `domain_gateway`; direct harness bypass remains forbidden
- clear top-level requests may surface only as `unknown_domain`, without building a handoff payload, until a real domain owner is admitted

## Thesis Ops

`Thesis Ops` covers dissertation writing and defense preparation.

Typical tasks include:

- chapter structure organization
- reuse of existing papers and figures
- terminology and narrative synchronization across chapters
- organization of abstract, introduction, and discussion layers
- defense preparation

It remains closely coupled with `Research Ops`, but it should still retain its own task boundary.
The current negative boundary is that dissertation assembly and defense-preparation coordination are not the same as `Research Ops` manuscript/submission delivery, and they are not reducible to `Presentation Ops` / `RedCube AI` deck production either.
Those admitted surfaces may supply reusable evidence or downstream derivatives, but they do not yet own a Thesis Ops domain boundary.

Typical delivery objects include:

- chapter-structure plans
- chapter draft sets
- cross-chapter synchronization packs
- defense-preparation packs

Current boundary status:

- still under definition
- not yet an admitted domain
- not yet a registered `G1` workstream/domain mapping
- not yet a `G2` discovery target
- not yet a `G3` routed-action target
- not eligible for domain handoff
- admission blockers are tracked in [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.md)
- explicit blocker packages remain `execution_model`, `discovery_readiness`, `routing_readiness`, and `cross_domain_wording`
- thesis-specific canonical truth remains outside `OPL` and outside the currently admitted domains until a real Thesis Ops domain boundary is frozen
- no handoff-ready surface exists yet for this workstream
- any future successful handoff may target only `domain_gateway`; direct harness bypass remains forbidden
- explicit discovery, routing, and cross-domain wording declarations must exist before Thesis Ops can move above the onboarding gate or become handoff-ready
- clear top-level requests may surface only as `unknown_domain`, without building a handoff payload, until a real domain owner is admitted

## Review Ops

`Review Ops` covers both “standing in the reviewer role” and “responding to reviewers.”

This combined label remains a top-level semantic bundle only; it does not by itself admit a distinct review domain or make OPL the canonical truth owner of review artifacts.

Typical tasks include:

- peer review
- grant review
- structuring reviewer comments
- organizing rebuttal and revision routes

This workstream also accumulates review standards and feedback patterns that should remain reusable across domains.

Typical delivery objects include:

- review reports
- reviewer-comment structures
- rebuttal plans
- revision-route maps

Current boundary status:

- still under definition
- not yet an admitted domain
- not yet a registered `G1` workstream/domain mapping
- not yet a `G2` discovery target
- not yet a `G3` routed-action target
- not eligible for domain handoff
- admission blockers are tracked in [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.md)
- explicit blocker packages remain `execution_model`, `discovery_readiness`, `routing_readiness`, and `cross_domain_wording`
- review truth remains outside `OPL`; this semantic bundle does not make `OPL` the canonical truth owner of review artifacts
- no handoff-ready surface exists yet for this bundle
- any future successful handoff may target only `domain_gateway`; direct harness bypass remains forbidden
- clear top-level requests may surface only as `unknown_domain`, without building a handoff payload, until a real domain owner is admitted
- explicit discovery, routing, and cross-domain wording declarations must exist before Review Ops can move above the onboarding gate or become handoff-ready

## Presentation Ops

`Presentation Ops` covers lectures, lab talks, project reports, and defense materials.

Typical tasks include:

- extracting a teaching or presentation storyline from research materials
- generating figure-ready narrative structures for reports
- organizing lecture and defense slide decks
- reusing paper figures, abstracts, and conclusions

Typical delivery objects include:

- lecture decks
- lab-talk decks
- project-report decks
- defense decks

The current domain gateway for this workstream is:

- [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai)

Within that surface:

- `ppt_deck` is the family that most directly maps to `Presentation Ops`
- distinctions such as `lecture_student`, `lecture_peer`, `executive_briefing`, and `defense_deck` should be controlled through `profile pack`
- `xiaohongshu` shares the same RedCube harness but should not be treated as identical to `Presentation Ops` at the OPL level

## How These Workstreams Reuse One Another

These workstreams belong in one `OPL` federation because they share:

- the same datasets and figures
- the same references and external evidence
- the same research questions and judgments
- the same formal delivery surfaces
- the same shared-foundation language

That is why the `OPL` task map is not a feature list.
It is a division of labor above domain gateways and harnesses.
