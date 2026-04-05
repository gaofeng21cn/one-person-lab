<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md"><strong>English</strong></a> | <a href="./README.zh-CN.md">中文</a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>The top-level gateway for how a one-person research lab works with domain systems</strong></p>
<p align="center">Task Topology · Shared Foundation · Gateway Federation</p>

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>Who It Serves</strong><br/>
      Research-oriented individuals, PIs, and small labs
    </td>
    <td width="33%" valign="top">
      <strong>Product Role</strong><br/>
      Define the OPL gateway, task semantics, and cross-domain shared foundation
    </td>
    <td width="33%" valign="top">
      <strong>Federation State</strong><br/>
      <code>MedAutoScience</code> is the active Research Ops surface; <code>RedCube AI</code> is the emerging visual-deliverable surface
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
      Top-level gateway and federation surface
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
      <strong>Current Domain Carriers</strong>
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
      Authoritative public spec surface for the top-level gateway
    </td>
    <td width="20%" valign="top">
      <strong>MedAutoScience</strong><br/>
      <a href="https://github.com/gaofeng21cn/med-autoscience"><code>Repository</code></a><br/>
      Research Ops domain gateway and harness
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
      Visual-deliverable domain gateway and harness
    </td>
  </tr>
</table>

> `OPL` is the public top-level gateway language for the lab. It federates domain systems such as `MedAutoScience` and `RedCube AI`; it does not replace them.

## Agent 合同分层

<!-- AGENT-CONTRACT-BASELINE:START -->
- 根目录 `AGENTS.md` 仅用于本仓库开发环境中的 Codex/OMX 协作，不单独承载项目真相合同
- 项目真相合同位于 `contracts/project-truth/AGENTS.md`
- OMX project-scope 编排层位于 `.codex/AGENTS.md`，只供 OMX / CODEX_HOME 会话加载
- 可选本机私有覆盖层约定为 `.omx/local/AGENTS.local.md`，保持未跟踪
- 本地工具运行态目录 `.omx/` 与 `.codex/` 必须保持未跟踪，不进入版本库
<!-- AGENT-CONTRACT-BASELINE:END -->

## Repository Position

`One Person Lab`, or `OPL`, is centered on the working object of a one-person research lab rather than on any single task or single domain runtime.

At the architecture level, `OPL` is responsible for four things:

- define the top-level task topology for formal lab work
- define the shared foundation that multiple workstreams must reuse
- define the gateway semantics that route work into the correct domain surface
- define which domain gateways currently carry each workstream

This repository therefore acts as a documentation-first and contract-first public surface for the `OPL` gateway. It does not claim that every runtime capability already lives here.

## What OPL Means Publicly

For an external reader, the simplest way to understand `OPL` is:

- it is the top-level product surface for how one-person lab work is organized
- it defines how workstreams map to domain systems
- it keeps cross-domain semantics stable while letting each domain stay independently usable

## Why A Gateway Federation

The same datasets, references, figures, and judgments are reused across:

- research progression and paper delivery
- grant writing and grant review
- dissertation drafting and defense preparation
- peer review, rebuttal, and revision
- lectures, lab presentations, and defense slides

If those tasks are implemented as isolated products, they duplicate context and fail to accumulate shared memory, governance, and review surfaces.

If they are all collapsed into one monolithic runtime, domain boundaries blur and maintenance becomes harder.

That is why `OPL` should be understood as a gateway federation:

- `OPL` holds the top-level task semantics and shared foundation
- each workstream keeps an independent domain gateway
- each domain gateway is driven by its own domain harness

## Top-Level Control Chain

The intended high-level chain is:

```text
Human / Agent
  -> OPL Gateway
      -> Domain Gateway
          -> Domain Harness OS
              -> Review Surfaces / Deliveries / Audit Truth
```

Current mapped surfaces:

- `Research Ops` -> `MedAutoScience`
- `Presentation Ops` -> `RedCube AI` through `ppt_deck`

Important boundary:

- `RedCube AI` is not the whole of `Presentation Ops`
- `xiaohongshu` shares the same RedCube harness, but it is not identical to `Presentation Ops` at the OPL level
- future `Grant Ops`, `Review Ops`, and `Thesis Ops` should also keep domain boundaries rather than being forced into one runtime

## Current Domain Surfaces

### MedAutoScience

[`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience) is the active `Research Ops` domain gateway under the `OPL` umbrella.

Its current role is:

- the formal entry surface for medical research operations
- the domain-specific governance and delivery surface for research work
- the top-level controller above its research harness and controlled runtimes

### RedCube AI

[`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) is the emerging visual-deliverable domain gateway under the `OPL` umbrella.

Its correct boundary is:

- the domain gateway for visual deliverables
- the harness surface that most directly carries `Presentation Ops` through `ppt_deck`
- a runtime family surface that can also host families not identical to `Presentation Ops`

## Scope Boundary

This repository should not be described as:

- the one place where all runtime behavior already lives
- a replacement for `MedAutoScience` or `RedCube AI`
- a synonym for every domain workstream
- proof that every planned workstream is already implemented

It should be described as:

- the authoritative public spec surface for the OPL gateway
- the place where cross-domain boundaries are frozen first
- the place where readers learn how the federation is supposed to fit together

## Roadmap

The current phase has four priorities:

- freeze the OPL gateway and domain-federation language
- keep `MedAutoScience` explicit as the `Research Ops` domain gateway and harness
- keep `RedCube AI` explicit as the visual-deliverable domain gateway and harness
- progressively define the boundaries for `Grant Ops`, `Review Ops`, and `Thesis Ops`

For a more detailed phase breakdown:

- [OPL Roadmap](docs/roadmap.md)
- [OPL Gateway Rollout](docs/opl-gateway-rollout.md)

## Further Reading

- [Gateway Federation](docs/gateway-federation.md)
- [OPL Federation Contract](docs/opl-federation-contract.md)
- [OPL Public Surface Index](docs/opl-public-surface-index.md)
- [OPL Gateway Contracts](contracts/opl-gateway/README.md)
- [OPL Gateway Example Corpus](docs/opl-gateway-example-corpus.md)
- [OPL Read-Only Discovery Gateway](docs/opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](docs/opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](docs/opl-domain-onboarding-contract.md)
- [OPL Gateway Acceptance Test Spec](docs/opl-gateway-acceptance-test-spec.md)
- [OPL Governance / Audit Operating Surface](docs/opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](docs/opl-publish-promotion-operating-surface.md)
- [OPL Gateway Rollout](docs/opl-gateway-rollout.md)
- [OPL Operating Model](docs/operating-model.md)
- [OPL Task Map](docs/task-map.md)
- [Shared Foundation](docs/shared-foundation.md)
- [OPL Roadmap](docs/roadmap.md)
