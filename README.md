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
      Define the OPL gateway, the Unified Harness Engineering Substrate, and its Shared Runtime Contract / Shared Domain Contract layers
    </td>
    <td width="33%" valign="top">
      <strong>Federation State</strong><br/>
      <code>Research Foundry -> Med Auto Science</code> is the active Research Ops line; <code>Grant Foundry -> Med Auto Grant</code> remains a public top-level signal / domain-direction scaffold for a future medical Grant Ops surface; <code>RedCube AI</code> is now the admitted visual-deliverable surface
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
      Shared Harness Engineering umbrella language; its runtime portion is converging into a <code>Shared Runtime Contract</code> and its product-behavior portion is converging into a <code>Shared Domain Contract</code>
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
      public scaffold / top-level signal via <code>Grant Foundry -> Med Auto Grant</code>
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
      <code>Active</code><br/>
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

Under `OPL`, the shared top-level architectural language is named the `Unified Harness Engineering Substrate`, or `UHS`.
It does not collapse all domain systems into one monolithic runtime, and it is not a thin wrapper around any existing runtime project.
It also does not mean a shared public code framework already exists today.
More precisely, `UHS` is the shared Harness Engineering umbrella language beneath `OPL`, and its most important shared pieces are now converging into two contract families:

- [Shared Runtime Contract](docs/shared-runtime-contract.md)
- [Shared Domain Contract](docs/shared-domain-contract.md)

Those two contracts split the shared layer more clearly:

- `Shared Runtime Contract`
  - freezes the long-running runtime objects that should stay shared, such as `runtime profile`, `session substrate`, `gateway runtime status`, `memory provider hook`, `delivery / cron`, and `approval / interrupt / resume`
- `Shared Domain Contract`
  - freezes the upper-layer behavior semantics that multiple `Domain Harness OS` implementations should keep aligned, such as the formal-entry matrix, the `per-run handle`, the durable report surface, the audit trail, gate semantics, and the no-bypass rule

That means:

- `UHS` is not “a Hermes wrapper”
- but a `Hermes`-backed runtime substrate is a preferred future implementation direction for the `Shared Runtime Contract`
- `Hermes` would not replace the `OPL Gateway`, any `Domain Gateway`, or any `Domain Harness OS`

In long-term product terms, the more accurate structure is:

- `OPL`
  - continues to own the top-level `Gateway / Federation`
- `UHS`
  - remains the shared Harness Engineering umbrella language
- `Shared Runtime Contract`
  - progressively owns the shared runtime contract for long-running execution
- `Shared Domain Contract`
  - progressively owns the shared cross-domain product-behavior contract
- each domain repository
  - continues to own its own product entry, domain workflow, and delivery truth

That is an evolution direction, not a claim that a unified platform runtime, hosted entry surface, or landed `Hermes` runtime already exists today.

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
The active execution path is Codex-only: planning, implementation, verification, and review are all handled through standard Codex sessions.
That deployment choice is not the same thing as the architecture itself: the same substrate can later support a managed web runtime without changing the top-level domain contract.

Today, the current domain repositories should be understood as `Auto-only` product mainlines.
That means the repository itself optimizes for autonomous end-to-end execution, evaluation, hardening, and auditability.

If a higher-judgment `Human-in-the-loop` product is built later, it should sit above or beside those repositories as a compatible sibling or upper-layer product that reuses stable substrate contracts, object semantics, audit surfaces, and execution modules rather than splitting the current repositories into two top-level judgment models.

This is the shared `OPL` target operating pattern now frozen at the architecture layer.

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

- `Grant Ops` -> `Grant Foundry` -> `Med Auto Grant` as a future medical surface, currently only as public scaffold / top-level signal / domain-direction evidence

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

[`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) is the current future medical `Grant Ops` domain harness direction under the `OPL` umbrella; inside its own repository it already has a local runtime baseline, but at the `OPL` federation layer it still remains signal-only / domain-direction evidence.

Its current role is:

- the public scaffold and top-level signal for the medical implementation of `Grant Foundry`
- domain-direction evidence for the future author-side, proposal-facing `Grant Ops` medical surface
- the place where the first medical `NSFC` generic application mainline and local runtime baseline are being frozen
- not yet an admitted `OPL` domain gateway and harness
- not yet a `G2` discovery target or a `G3` routed-action target

### RedCube AI

[`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) is the currently admitted visual-deliverable domain gateway under the `OPL` umbrella.

Its correct boundary is:

- the domain gateway for visual deliverables
- the harness surface that most directly carries `Presentation Ops` through `ppt_deck`
- a runtime family surface that can also host families not identical to `Presentation Ops`


## Current Federation Activation State

As of `2026-04-10`, `Phase 1 exit + next-stage activation package freeze` remains the absorbed predecessor gate, and `Phase 2 / Minimal admitted-domain federation activation package` is already absorbed into the current top-level federation truth.

That activation is justified by two admitted domain surfaces that are now repo-tracked as stable enough for stronger top-level federation wording:

- `MedAutoScience` for `research_ops`
- `RedCube AI` for `presentation_ops`

That absorbed federation package still applies to already admitted domains only.
`Grant Foundry -> Med Auto Grant` remains signal-only / domain-direction evidence only, while `Review Ops` and `Thesis Ops` remain under-definition bundles below onboarding.
The top-level formal entry still remains the local `TypeScript CLI`-first / read-only gateway surface, and `OPL` still does not become a runtime owner.
No new active follow-on tranche is currently open: the honest top-level state is a central-sync stop until an admitted-domain repository lands a new absorbed delta or the central reference surfaces drift.


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

The current public mainline remains the absorbed `Phase 2 / Minimal admitted-domain federation activation package`, built on top of the frozen `Phase 1` local `TypeScript CLI` + read-only gateway baseline:

- turn the frozen OPL gateway contracts into a CLI-first, read-only discovery surface for humans and agents
- keep `Research Foundry -> Med Auto Science` explicit as the current `Research Ops` line
- keep `RedCube AI` explicit as the visual-deliverable domain gateway and harness
- keep `Grant Ops`, `Review Ops`, and `Thesis Ops` below the admitted gateway surface until their domain boundaries are explicitly frozen

As of `2026-04-10`, the repository still has a runnable local `TypeScript CLI`-first / read-only gateway baseline.
The completed `Phase 1 / G2 release-closeout` has already closed the `G2 stable public baseline` into the single stable repo-tracked public entry.
That baseline therefore remains the current `OPL` `Phase 1` formal entry contract and public system surface.
The repo-tracked `Phase 1 / G3 thin handoff planning freeze hardening` has already frozen `G3` at a planning-only gate, so it still does not open a mutation entry, turn `OPL` into a unified runtime owner, or pull a shared execution core forward.
The repo-tracked `Phase 1` candidate-domain closeout order is frozen as `Review Ops` then `Thesis Ops`: both candidate paths remain below admission / discovery / routing / handoff readiness, while `Grant Foundry -> Med Auto Grant` stays signal-only.
The absorbed predecessor gate is `Phase 1 exit + next-stage activation package freeze`, and the absorbed current federation package is `Minimal admitted-domain federation activation package`, which strengthens federation wording for `MedAutoScience` + `RedCube AI` only without activating routed action, admitting `Grant Ops` / `Review Ops` / `Thesis Ops`, or turning `OPL` into a runtime owner.
The current repo-tracked truth is therefore an honest central-sync stop rather than an open-ended same-package continuation line.

The current delivery target uses a local `TypeScript CLI` as the Phase 1 entry transport on top of the current `Codex-default host-agent runtime`.
The active development-control path is Codex-only and does not require a separate `Codex Host / OMX` split.
That baseline reads frozen contracts, lists workstreams/domains, and explains routing boundaries without claiming web/server runtime behavior or mutating domain state.

For the public phase view and the full document layering:

- [OPL Roadmap](docs/roadmap.md)
- [Docs Index](docs/README.md)

## Further Reading

- [Docs Index](docs/README.md)
- [Gateway Federation](docs/gateway-federation.md)
- [OPL Federation Contract](docs/opl-federation-contract.md)
- [Unified Harness Engineering Substrate](docs/unified-harness-engineering-substrate.md)
- [Shared Runtime Contract](docs/shared-runtime-contract.md)
- [Shared Domain Contract](docs/shared-domain-contract.md)
- [OPL Operating Model](docs/operating-model.md)
- [OPL Task Map](docs/task-map.md)
- [OPL Roadmap](docs/roadmap.md)
- [OPL Gateway Contracts](contracts/opl-gateway/README.md)

Deeper contract companions, reference-grade surfaces, and historical design records are organized through `docs/README.md` rather than being flattened into the root README.
