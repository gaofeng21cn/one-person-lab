**English** | [中文](./task-map.zh-CN.md)

# OPL Task Map

## Overview

`OPL` divides the formal work of a one-person research lab into seven workstreams:

- `Research Ops`
- `Grant Ops`
- `IP Ops`
- `Award Ops`
- `Thesis Ops`
- `Review Ops`
- `Presentation Ops`

This split defines top-level task semantics.
At runtime, those semantics route through the `OPL Gateway` into independent domain gateways with explicit ownership and handoff boundaries.

At the operating level, these workstreams also share one target doctrine:

- use `Agent-first` domain systems with explicit gateway/harness layering
- keep the current admitted domain repositories `Auto-only`
- let any future `Human-in-the-loop` product reuse the same substrate as a sibling or upper-layer product

The task map freezes workstream boundaries and delivery objects.
It preserves shared semantics while allowing different interfaces, model providers, and orchestration stacks across domains.

## Machine-Readable Companions

- [`../contracts/opl-gateway/task-topology.json`](../contracts/opl-gateway/task-topology.json)
- [`../contracts/opl-gateway/candidate-domain-backlog.json`](../contracts/opl-gateway/candidate-domain-backlog.json)

These companions materialize:

- the top-level task topology as a machine-readable semantic surface
- the missing admission-boundary materials for the current under-definition workstreams

They may describe under-definition workstreams such as `IP Ops`, `Award Ops`, `Thesis Ops`, and `Review Ops`, while keeping them on an explicit candidate/onboarding path.
`Grant Ops` is already registered to the admitted `MedAutoGrant` domain gateway, while formal admission, `G2` discovery readiness, and `G3` routed-action readiness for the remaining under-definition workstreams still come from dedicated onboarding evidence.

At the current baseline, `candidate-domain definition` is the composition of:

- task boundaries and delivery objects in `task-topology`
- missing boundary packages in the candidate-domain backlog
- formal admission rules in the domain-onboarding contract

The current definition path is therefore the three-layer composition above.

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

- current lifecycle state: registered workstream mapped directly to the admitted `MedAutoGrant` domain gateway
- formal mapping: `grant_ops -> medautogrant` is already frozen in the `G1` workstream/domain registry
- public entry: the top-level domain entry is `MedAutoGrant`, and grant-direction, proposal authoring, proposal-side reviewer simulation, and revision truth remain domain-owned there
- routing rule: successful handoff remains `domain_gateway`-only, with no direct harness bypass
- top-level handling: clear requests resolve to `medautogrant` through the frozen routing vocabulary and domain manifest surfaces

## IP Ops

`IP Ops` covers intellectual-property protection around research outputs.

Typical tasks include:

- patentability framing
- technical disclosure organization
- claim and embodiment drafting
- prior-art and novelty positioning
- office-action response planning

It may reuse research evidence, grant narratives, figures, and technical routes, while keeping patent-specific truth separate from grant proposal truth and research publication truth.

Typical delivery objects include:

- invention disclosures
- patent application drafts
- claim sets
- embodiment packs
- office-action response plans

Current boundary status:

- current lifecycle state: under-definition candidate workstream
- planned family/product wording: `IP Foundry` with `Med Auto Patent` as the first planned product
- admission path: waiting for formal domain admission and registered `G1` workstream/domain mapping
- discovery and routing path: waiting for `G2` discovery readiness, `G3` routed-action readiness, and domain handoff eligibility
- tracked blocker packages: `truth_ownership`, `review_surfaces`, `execution_model`, `discovery_readiness`, `routing_readiness`, and `cross_domain_wording`
- truth boundary: patent canonical truth and human/legal review gates must be owned by the future IP Ops domain boundary
- routing rule: clear patent requests may surface as `unknown_domain`; they must not route to `MedAutoGrant` as grant proposal work

## Award Ops

`Award Ops` covers award applications and achievement-promotion materials.

Typical tasks include:

- award category and fit assessment
- achievement storyline organization
- contribution and innovation ranking
- impact and adoption evidence packaging
- award-review response planning

It may reuse Research Ops evidence and Grant Ops authoring substrate, while keeping award-specific contribution, impact, and recommendation truth separate from grant proposal truth.

Typical delivery objects include:

- award application drafts
- achievement summaries
- contribution-ranking packs
- impact-evidence packs
- recommendation materials

Current boundary status:

- current lifecycle state: under-definition candidate workstream
- planned family/product wording: `Award Foundry` with `Med Auto Award` as the first planned product
- admission path: waiting for formal domain admission and registered `G1` workstream/domain mapping
- discovery and routing path: waiting for `G2` discovery readiness, `G3` routed-action readiness, and domain handoff eligibility
- tracked blocker packages: `truth_ownership`, `review_surfaces`, `execution_model`, `discovery_readiness`, `routing_readiness`, and `cross_domain_wording`
- truth boundary: award canonical truth and human expert review gates must be owned by the future Award Ops domain boundary
- routing rule: clear award requests may surface as `unknown_domain`; they must not route to `MedAutoGrant` as grant proposal work

## Thesis Ops

`Thesis Ops` covers dissertation writing and defense preparation.

Typical tasks include:

- chapter structure organization
- reuse of existing papers and figures
- terminology and narrative synchronization across chapters
- organization of abstract, introduction, and discussion layers
- defense preparation

It remains closely coupled with `Research Ops`, while focusing on dissertation assembly and defense preparation as its own workstream.
Existing admitted surfaces can contribute reusable evidence and downstream derivatives, and thesis-specific domain ownership will be frozen through a dedicated onboarding path.

Typical delivery objects include:

- chapter-structure plans
- chapter draft sets
- cross-chapter synchronization packs
- defense-preparation packs

Current boundary status:

- current lifecycle state: under-definition candidate workstream
- planned family/product wording: `Thesis Foundry` with `Med Auto Thesis` as the first planned product
- admission path: waiting for formal domain admission and registered `G1` workstream/domain mapping
- discovery and routing path: waiting for `G2` discovery readiness, `G3` routed-action readiness, and domain handoff eligibility
- tracked blocker packages: `execution_model`, `discovery_readiness`, `routing_readiness`, and `cross_domain_wording`
- truth boundary: thesis-specific canonical truth will be frozen with the future Thesis Ops domain boundary
- routing rule: any future successful handoff may target only `domain_gateway`, with no direct harness bypass
- current top-level handling: clear requests surface as `unknown_domain` with no handoff payload until a real domain owner is admitted

## Review Ops

`Review Ops` covers both “standing in the reviewer role” and “responding to reviewers.”

This combined label currently stays at the top-level semantic-bundle stage.
Review artifacts keep their domain-owned truth until a dedicated review domain boundary is frozen.

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

- current lifecycle state: under-definition candidate workstream
- planned family/product wording: `Review Foundry` with `Med Auto Review` as the first planned product
- admission path: waiting for formal domain admission and registered `G1` workstream/domain mapping
- discovery and routing path: waiting for `G2` discovery readiness, `G3` routed-action readiness, and domain handoff eligibility
- tracked blocker packages: `execution_model`, `discovery_readiness`, `routing_readiness`, and `cross_domain_wording`
- truth boundary: review truth will remain domain-owned when a dedicated Review Ops boundary is frozen
- routing rule: any future successful handoff may target only `domain_gateway`, with no direct harness bypass
- current top-level handling: clear requests surface as `unknown_domain` with no handoff payload until a real domain owner is admitted

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
- `xiaohongshu` shares the same RedCube harness and stays a separate visual family at the OPL layer

## How These Workstreams Reuse One Another

These workstreams belong in one `OPL` federation because they share:

- the same datasets and figures
- the same references and external evidence
- the same research questions and judgments
- the same formal delivery surfaces
- the same shared-foundation language

That is why the `OPL` task map is not a feature list.
It is a division of labor above domain gateways and harnesses.
