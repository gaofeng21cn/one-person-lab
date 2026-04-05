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

## Machine-Readable Companion

- [`../contracts/opl-gateway/task-topology.json`](../contracts/opl-gateway/task-topology.json)

This companion materializes the task topology as a machine-readable top-level surface.
It may describe under-definition workstreams such as `Grant Ops`, `Thesis Ops`, and `Review Ops`, but it does **not** admit new domains, create `G2` discovery readiness, or create `G3` routed-action readiness for them.

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

`Grant Ops` covers both grant writing and the reverse side of grant review.

Typical tasks include:

- feasibility assessment for grant directions and topics
- proposal structure generation
- organizing background, innovation claims, and technical routes
- simulating reviewer comments
- proposal iteration

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
- not eligible for domain handoff
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
- not eligible for domain handoff
- clear top-level requests may surface only as `unknown_domain`, without building a handoff payload, until a real domain owner is admitted

## Review Ops

`Review Ops` covers both “standing in the reviewer role” and “responding to reviewers.”

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
- not eligible for domain handoff
- clear top-level requests may surface only as `unknown_domain`, without building a handoff payload, until a real domain owner is admitted

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
