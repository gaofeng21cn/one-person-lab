**English** | [中文](./task-map.zh-CN.md)

# OPL Task Map

## Overview

`OPL` starts by dividing the formal work of a one-person research lab into five parallel workstreams:

- `Research Ops`
- `Grant Ops`
- `Thesis Ops`
- `Review Ops`
- `Presentation Ops`

This split is not meant to create five unrelated task surfaces. It is meant to make clear what each task surface is actually responsible for.

## Research Ops

`Research Ops` covers the main chain from data to paper delivery.

Typical tasks include:

- data governance
- research question formation
- analysis and validation progression
- evidence packaging
- manuscript and submission delivery

The clearest implementation surface for this workstream today is:

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

## Thesis Ops

`Thesis Ops` covers dissertation writing and defense preparation.

Typical tasks include:

- chapter structure organization
- reuse of existing papers and figures
- terminology and narrative synchronization across chapters
- organization of abstract, introduction, and discussion layers
- defense preparation

Its relationship with `Research Ops` is especially close, because dissertations often reuse the same research assets.

## Review Ops

`Review Ops` covers both “standing in the reviewer role” and “responding to reviewers.”

Typical tasks include:

- peer review
- grant review
- structuring reviewer comments
- organizing rebuttal and revision routes

This workstream also accumulates review standards and feedback patterns that can feed back into research and grant work.

## Presentation Ops

`Presentation Ops` covers lectures, lab talks, project reports, and defense materials.

Typical tasks include:

- extracting a teaching or presentation storyline from research materials
- generating figure-ready narrative structures for reports
- organizing lecture and defense slide decks
- reusing paper figures, abstracts, and conclusions

This workstream keeps presentation materials aligned with upstream research assets.

## How These Workstreams Reuse One Another

These five workstreams belong in one blueprint because they share:

- the same datasets and figures
- the same references and external evidence
- the same research questions and judgments
- the same formal delivery surfaces
- the same Agent execution layer

That is why the OPL task map is not a feature list. It is a division of labor for lab work.
