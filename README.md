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
      Define the OPL gateway, the Unified Harness Engineering Substrate, and the cross-domain shared foundation
    </td>
    <td width="33%" valign="top">
      <strong>Federation State</strong><br/>
      <code>Research Foundry -> Med Auto Science</code> is the active Research Ops line; <code>Grant Foundry -> Med Auto Grant</code> is now publicly scaffolded as a future medical Grant Ops surface; <code>RedCube AI</code> is the emerging visual-deliverable surface
    </td>
  </tr>
</table>

<p align="center">
  <strong>OPL Structure</strong>
</p>

<p align="center">
  <img src="assets/branding/opl-architecture-blueprint.svg" alt="OPL architecture blueprint" width="100%" />
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
      <strong>Unified Harness Engineering Substrate</strong><br/>
      Shared Harness Engineering base reused by multiple Domain Harness OS implementations
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
      Stable interfaces, execution visibility, audit trails
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
      via <code>Research Foundry -> Med Auto Science</code>
    </td>
    <td width="20%" valign="top">
      <strong>Grant Ops</strong><br/>
      <code>Planned</code><br/>
      public scaffold via <code>Grant Foundry -> Med Auto Grant</code>
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
      <a href="https://github.com/gaofeng21cn/one-person-lab"><code>Repository</code></a><br/>
      Authoritative public spec surface for the top-level gateway
    </td>
    <td width="20%" valign="top">
      <strong>Med Auto Science</strong><br/>
      <a href="https://github.com/gaofeng21cn/med-autoscience"><code>Repository</code></a><br/>
      Medical implementation of `Research Foundry`, and the current domain gateway and harness for the active Research Ops line
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

> `OPL` is the public top-level gateway language for the lab. It federates `Research Foundry -> Med Auto Science` and sibling domain systems such as `RedCube AI`; it does not replace them.

## Repository Position

`One Person Lab`, or `OPL`, is centered on the working object of a one-person research lab rather than on any single task or single domain runtime.

At the architecture level, `OPL` is responsible for four things:

- define the top-level task topology for formal lab work
- define the shared foundation and shared Harness Engineering substrate that multiple workstreams must reuse
- define the gateway semantics that route work into the correct domain surface
- define which domain gateways currently carry each workstream

This repository therefore acts as a documentation-first and contract-first public surface for the `OPL` gateway. It does not claim that every runtime capability already lives here.

## Unified Harness Engineering Substrate

Under the `OPL` umbrella, the shared architectural base is now described as the `Unified Harness Engineering Substrate`.
It is the common Harness Engineering language reused by multiple domain systems without collapsing them into one monolithic runtime.

The substrate does **not** claim that every domain already shares one code repository, one object model, or one identical execution graph.
It freezes a narrower and more durable set of shared rules:

- `Agent-first` execution as the default product posture
- one shared base that supports both `Auto` and `Human-in-the-loop`
- stable formal entry surfaces such as `MCP`, `CLI`, and domain controllers
- auditable state transitions, review surfaces, and delivery boundaries
- deployment portability from the current local host-agent shape to future managed web runtimes

Under that substrate, the current domain systems should be understood as separate `Domain Harness OS` implementations rather than as unrelated projects:

- `Med Auto Science` for medical `Research Ops`
- `RedCube AI` for visual deliverables and the current `Presentation Ops` family entry
- `Med Auto Grant` as the future medical `Grant Ops` domain harness direction

`OPL` itself is therefore **not** a fourth `Domain Harness OS`.
Its role remains the top-level gateway and federation surface above domain gateways and `Domain Harness OS` implementations.

## What OPL Means Publicly

For an external reader, the simplest way to understand `OPL` is:

- it is the top-level product surface for how one-person lab work is organized
- it defines how workstreams map to domain systems
- it keeps cross-domain semantics stable while letting each domain stay independently usable

## Shared Operating Pattern

At the top level, `OPL` defaults to an `Agent-first` design direction rather than reducing each `Ops` lane to a rigid fixed-code pipeline.
That does not mean every domain must bind itself to one direct LLM API; it means the Agent should act as the default executor that reads state, calls stable gateways, composes steps, organizes intermediate artifacts, and writes key traces back to auditable surfaces, while code mainly provides stable objects, controllers, tool wrappers, gate rules, and delivery surfaces.

The current local default deployment shape for this substrate is a `Codex`-default host-agent runtime.
That deployment choice is not the same thing as the architecture itself: the same substrate can later support a managed web runtime without changing the top-level domain contract.

Under that model, each workstream should in principle support two execution modes on top of the same shared base:

- `Auto`: the autonomous primary lane for end-to-end loops, base evaluation, testing, and optimization
- `Human-in-the-loop`: the same shared base with high-judgment gates returned to humans while Agents handle repetitive and composable work

This is a shared `OPL` target operating pattern. It does not imply that every domain surface already exposes both modes at the same maturity today.

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

- `Research Ops` -> `Research Foundry` -> `Med Auto Science`
- `Presentation Ops` -> `RedCube AI` through `ppt_deck`

Current public but not-yet-admitted scaffold:

- `Grant Ops` -> `Grant Foundry` -> `Med Auto Grant` as a future medical surface

Important boundary:

- `RedCube AI` is not the whole of `Presentation Ops`
- `xiaohongshu` shares the same RedCube harness, but it is not identical to `Presentation Ops` at the OPL level
- future `Grant Ops`, `Review Ops`, and `Thesis Ops` should also keep domain boundaries rather than being forced into one runtime

## Current Domain Surfaces

### Med Auto Science

[`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) is the mature medical implementation on the active `Research Ops` line under the `OPL` umbrella.

Its current role is:

- the formal medical implementation of `Research Foundry`
- the formal entry surface for medical research operations
- the domain-specific governance and delivery surface for research work
- the top-level controller above its research harness and controlled runtimes

### Med Auto Grant

[`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) is the newly opened document-first scaffold for the future medical `Grant Ops` surface under the `OPL` umbrella.

Its current role is:

- the public scaffold for the medical implementation of `Grant Foundry`
- the future author-side, proposal-facing `Grant Ops` medical surface
- the place where the first medical `NSFC` generic application MVP is being frozen
- not yet an admitted `OPL` domain gateway and harness

### RedCube AI

[`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) is the emerging visual-deliverable domain gateway under the `OPL` umbrella.

Its correct boundary is:

- the domain gateway for visual deliverables
- the harness surface that most directly carries `Presentation Ops` through `ppt_deck`
- a runtime family surface that can also host families not identical to `Presentation Ops`

## Scope Boundary

This repository should not be described as:

- the one place where all runtime behavior already lives
- a replacement for `Med Auto Science` or `RedCube AI`
- a synonym for every domain workstream
- proof that every planned workstream is already implemented

It should be described as:

- the authoritative public spec surface for the OPL gateway
- the place where cross-domain boundaries are frozen first
- the place where readers learn how the federation is supposed to fit together

## Roadmap

The current phase has four priorities, led by a Phase 1 local `TypeScript CLI` + read-only gateway baseline:

- turn the frozen OPL gateway contracts into a CLI-first, read-only discovery surface for humans and agents
- keep `Research Foundry -> Med Auto Science` explicit as the current `Research Ops` line
- keep `RedCube AI` explicit as the visual-deliverable domain gateway and harness
- keep `Grant Ops`, `Review Ops`, and `Thesis Ops` below the admitted gateway surface until their domain boundaries are explicitly frozen

The current delivery target is a local CLI baseline that reads frozen contracts, lists workstreams/domains, and explains routing boundaries without claiming web/server runtime behavior or mutating domain state.

For the public phase view and the full document layering:

- [OPL Roadmap](docs/roadmap.md)
- [Docs Index](docs/README.md)

## Further Reading

- [Docs Index](docs/README.md)
- [Gateway Federation](docs/gateway-federation.md)
- [OPL Federation Contract](docs/opl-federation-contract.md)
- [Unified Harness Engineering Substrate](docs/unified-harness-engineering-substrate.md)
- [OPL Operating Model](docs/operating-model.md)
- [OPL Task Map](docs/task-map.md)
- [OPL Roadmap](docs/roadmap.md)
- [OPL Gateway Contracts](contracts/opl-gateway/README.md)

Deeper contract companions, reference-grade surfaces, and historical design records are organized through `docs/README.md` rather than being flattened into the root README.
