<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md"><strong>English</strong></a> | <a href="./README.zh-CN.md">中文</a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>A framework for the formal organization of a one-person research lab</strong></p>
<p align="center">Task Topology · Shared Foundation · Workstream Status</p>

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>Who It Serves</strong><br/>
      Research-oriented individuals, PIs, and small labs
    </td>
    <td width="33%" valign="top">
      <strong>What It Covers</strong><br/>
      Research, writing, review, defense, and teaching workstreams
    </td>
    <td width="33%" valign="top">
      <strong>Current Reference Surface</strong><br/>
      Top-level blueprint; <code>MedAutoScience</code> is the current active implementation, and <code>RedCube AI</code> is the current emerging implementation
    </td>
  </tr>
</table>

<p align="center">
  <strong>OPL Structure</strong>
</p>

<table>
  <tr>
    <td colspan="5" align="center" valign="top">
      <strong>One Person Lab (OPL)</strong><br/>
      A top-level blueprint for organizing a one-person research lab
    </td>
  </tr>
  <tr>
    <td colspan="5" align="center" valign="top">
      <strong>Shared Foundation</strong>
    </td>
  </tr>
  <tr>
    <td width="20%" valign="top">
      <strong>Asset</strong><br/>
      Data, references, templates, delivery assets
    </td>
    <td width="20%" valign="top">
      <strong>Memory</strong><br/>
      Topic memory, review memory, venue memory
    </td>
    <td width="20%" valign="top">
      <strong>Governance</strong><br/>
      Go, stop, reframe, gate
    </td>
    <td width="20%" valign="top">
      <strong>Delivery</strong><br/>
      Review surfaces, package sync, final outputs
    </td>
    <td width="20%" valign="top">
      <strong>Agent Execution</strong><br/>
      Stable interfaces, runtime monitoring, audit trails
    </td>
  </tr>
  <tr>
    <td colspan="5" align="center" valign="top">
      <strong>Workstreams</strong>
    </td>
  </tr>
  <tr>
    <td width="20%" valign="top">
      <strong>Research Ops</strong><br/>
      Data to paper
    </td>
    <td width="20%" valign="top">
      <strong>Grant Ops</strong><br/>
      Proposal and review
    </td>
    <td width="20%" valign="top">
      <strong>Thesis Ops</strong><br/>
      Dissertation and defense
    </td>
    <td width="20%" valign="top">
      <strong>Review Ops</strong><br/>
      Review, rebuttal, revision
    </td>
    <td width="20%" valign="top">
      <strong>Presentation Ops</strong><br/>
      Lecture, report, slides
    </td>
  </tr>
  <tr>
    <td colspan="5" align="center" valign="top">
      <strong>Current Established Workstream</strong><br/>
      <a href="https://github.com/gaofeng21cn/med-autoscience"><code>MedAutoScience</code></a>
    </td>
  </tr>
  <tr>
    <td colspan="5" align="center" valign="top">
      <strong>Workstream Status</strong>
    </td>
  </tr>
  <tr>
    <td width="20%" valign="top">
      <strong>Research Ops</strong><br/>
      <code>Active</code><br/>
      via <code>MedAutoScience</code>
    </td>
    <td width="20%" valign="top">
      <strong>Grant Ops</strong><br/>
      <code>Planned</code>
    </td>
    <td width="20%" valign="top">
      <strong>Thesis Ops</strong><br/>
      <code>Planned</code>
    </td>
    <td width="20%" valign="top">
      <strong>Review Ops</strong><br/>
      <code>Planned</code>
    </td>
    <td width="20%" valign="top">
      <strong>Presentation Ops</strong><br/>
      <code>Emerging</code><br/>
      via <code>RedCube AI</code> and its <code>ppt_deck</code> family
    </td>
  </tr>
  <tr>
    <td colspan="5" align="center" valign="top">
      <strong>Public References</strong>
    </td>
  </tr>
  <tr>
    <td width="20%" valign="top">
      <strong>OPL</strong><br/>
      This repository<br/>
      Top-level blueprint
    </td>
    <td width="20%" valign="top">
      <strong>MedAutoScience</strong><br/>
      <a href="https://github.com/gaofeng21cn/med-autoscience"><code>Repository</code></a><br/>
      Active research-ops implementation
    </td>
    <td width="20%" valign="top">
      <strong>FengGaoLab</strong><br/>
      <a href="https://fenggaolab.org"><code>Website</code></a><br/>
      Public academic website
    </td>
    <td width="20%" valign="top">
      <strong>Profile</strong><br/>
      <a href="https://github.com/gaofeng21cn"><code>GitHub</code></a><br/>
      Public project entry
    </td>
    <td width="20%" valign="top">
      <strong>RedCube AI</strong><br/>
      <a href="https://github.com/gaofeng21cn/redcube-ai"><code>Repository</code></a><br/>
      Emerging visual-deliverable surface
    </td>
  </tr>
</table>

> This repository defines the task topology, shared foundation, and workstream relationships of `OPL`. It is not the unified runtime surface, and it is not a single-product repository.

## Repository Position

`One Person Lab`, or `OPL`, is not centered on a single task. It is centered on the working object of a one-person research lab.

Here, a one-person lab means a research-oriented individual or a very small team that uses `Agent` assistance to carry out formal lab work while preserving clear human review surfaces. `OPL` is concerned with how that work should be organized as a system, rather than how to automate one isolated task.

From that perspective, `OPL` has three responsibilities:

- define a lab-level task topology
- explain what different workstreams share underneath
- make clear which workstreams already have an established implementation surface and which remain under definition

This repository itself does not act as a runtime system or as the direct entry point for every workstream.

## Why A Top-Level Blueprint

Small labs and research-oriented individuals usually do more than produce papers.

The same datasets, references, figures, and research judgments are reused across:

- research progression and paper delivery
- grant writing and grant review
- dissertation drafting and defense preparation
- peer review, rebuttal, and revision
- lectures, lab presentations, and defense slides

If those tasks are implemented as isolated toolchains, they will repeatedly duplicate context, duplicate materials, and fail to accumulate shared memory or consistent review surfaces.

That is why `OPL` uses a top-level blueprint plus workstream status plus shared foundation model, rather than continuously piling heterogeneous functions into one product repository.

## Reference Context

The current reference implementation grows out of a medical research lab, because that is where the current established workstream was first built.

That reference workstream is [`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience), which focuses on medical research operations from data governance to manuscript and submission delivery.

But `OPL` is not intended to be medical-only. The model remains extensible beyond medicine and can be adapted by PIs in other disciplines.

## Workstreams

`OPL` currently defines five core workstreams:

- `Research Ops`
  from data governance and study progression to evidence packaging and paper delivery
- `Grant Ops`
  from proposal planning and writing to review simulation
- `Thesis Ops`
  from dissertation drafting to defense preparation
- `Review Ops`
  from peer review to rebuttal and revision organization
- `Presentation Ops`
  from lectures and lab talks to defense slides

This split defines task boundaries. It does not imply that every workstream is already an established implementation surface.

## Shared Foundation

`OPL` currently describes the shared foundation in five layers:

| Layer | Main Objects | Role |
| --- | --- | --- |
| `Asset Layer` | data, references, templates, figures, deliveries | shared factual base across workstreams |
| `Memory Layer` | topic memory, review memory, venue and funder preferences | reusable structured judgment across workstreams |
| `Governance Layer` | gates, stop rules, reframing conditions | determines when formal execution is allowed |
| `Delivery Layer` | review surfaces, output directories, package sync rules | turns process artifacts into formal outputs |
| `Agent Execution Layer` | stable interfaces, runtime monitoring, audit writeback | makes Agent execution controllable and reviewable |

Further reading:

- [OPL Operating Model](docs/operating-model.md)
- [OPL Task Map](docs/task-map.md)
- [Shared Foundation](docs/shared-foundation.md)

## Workstream Status

| Workstream / Surface | What It Covers | Current Status |
| --- | --- | --- |
| [`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience) | medical research operations, from data to paper delivery | Active |
| `Grant Ops` | grant writing and grant review workflows | Planned |
| `Thesis Ops` | dissertation and defense workflows | Planned |
| `Review Ops` | peer review, response, and revision workflows | Planned |
| `Presentation Ops` | lecture, report, and defense material workflows; currently surfaced through the [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) `ppt_deck` family | Emerging |

- `Active` means a workstream already has a stable implementation surface that can be explained independently.
- `Emerging` means a real implementation surface already exists, but its boundary, protocols, and family split are still converging.
- `Planned` means the workstream is part of the formal blueprint but remains under definition.

## Current Established Workstream: MedAutoScience

[`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience) is the current established research-ops implementation within the `OPL` umbrella.

It currently provides a clear implementation surface for:

- disease-workspace organization
- data asset governance
- study progression and runtime monitoring
- evidence packaging
- manuscript and submission delivery

For readers who are primarily interested in moving medical research data toward paper-grade delivery, `MedAutoScience` is the current implementation entry point.

## Current Emerging Surface: RedCube AI

[`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) is the current emerging visual-deliverable implementation surface under the `OPL` umbrella.

Its correct boundary is not “the whole of `Presentation Ops`.” It is:

- an Agent-first runtime for visual deliverables
- the current most direct implementation surface for `Presentation Ops` through the `ppt_deck` family
- a place where formal quality protocols diverge through `profile pack` rather than through ad hoc prompt phrasing

At the same time:

- `RedCube AI` is not the whole of `OPL`
- `RedCube AI` is not synonymous with all of `Presentation Ops`
- `xiaohongshu` shares the same runtime, but should not be treated as identical to `Presentation Ops` at the OPL level

## Scope Boundary

This repository is primarily a public blueprint surface. It does not serve as:

- the unified runtime entry point
- the implementation repository for every workstream
- a place where `MedAutoScience` or `RedCube AI` are treated as synonyms for `OPL`
- a place where workstreams under definition are presented as finished implementations

Its purpose is to let readers understand the overall operating idea first, and then enter the relevant implementation surface for a specific workstream.

## Roadmap

The current phase has three main priorities:

- continue to advance `MedAutoScience` as the current established research-ops implementation
- continue to stabilize `RedCube AI` as the emerging implementation surface for `Presentation Ops`
- progressively define the boundaries and shared protocols for `Grant Ops`, `Review Ops`, and `Thesis Ops`

For a more detailed phase breakdown:

- [OPL Roadmap](docs/roadmap.md)

## Further Reading

- [OPL Operating Model](docs/operating-model.md)
- [OPL Task Map](docs/task-map.md)
- [Shared Foundation](docs/shared-foundation.md)
- [OPL Roadmap](docs/roadmap.md)
