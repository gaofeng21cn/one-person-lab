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
      <code>Research Foundry -> Med Auto Science</code> is the active Research Ops line; <code>Grant Foundry -> Med Auto Grant</code> is the active medical Grant Ops repository line and already runs on a real upstream <code>Hermes-Agent</code> substrate, while its top-level federation admission / handoff wording remains separately gated at the OPL layer; <code>RedCube AI</code> is the admitted visual-deliverable surface and currently runs its delivery mainline on local <code>Codex CLI</code> host-agent runtime
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
      <code>Active Repo Line</code><br/>
      via <code>Grant Foundry -> Med Auto Grant</code>; its in-repo runtime substrate is landed, while top-level federation admission / handoff wording remains separately gated
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
      <strong>Med Auto Grant</strong><br/>
      <a href="https://github.com/gaofeng21cn/med-autogrant"><code>Repository</code></a><br/>
      Medical grant-authoring domain line on real upstream `Hermes-Agent` substrate, with top-level admission / handoff wording still separately gated at `OPL`
    </td>
    <td width="20%" valign="top">
      <strong>RedCube AI</strong><br/>
      <a href="https://github.com/gaofeng21cn/redcube-ai"><code>Repository</code></a><br/>
      Visual-deliverable domain gateway and harness on the current local `Codex CLI` host-agent runtime mainline
    </td>
    <td width="20%" valign="top">
      <strong>FengGaoLab</strong><br/>
      <a href="https://fenggaolab.org"><code>Website</code></a><br/>
      Public academic website
    </td>
  </tr>
</table>

> `OPL` is the public top-level gateway language for the lab. It federates `Research Foundry -> Med Auto Science`, `Grant Foundry -> Med Auto Grant`, and sibling domain systems such as `RedCube AI` through shared task semantics, contracts, and boundary rules.

## Repository Position

`One Person Lab`, or `OPL`, is the top-level working surface for a one-person research lab.
It defines how formal workstreams map into domain gateways and how shared substrate language is carried across the federation.

At the architecture level, `OPL` is responsible for four things:

- define the top-level task topology for formal lab work
- define the shared foundation and shared Harness Engineering substrate that multiple workstreams must reuse
- define the gateway semantics that route work into the correct domain surface
- define which domain gateways currently carry each workstream

This repository therefore acts as a documentation-first and contract-first public surface for the `OPL` gateway.
Domain runtimes, delivery truth, and execution surfaces continue to live in their respective domain repositories.
The current `OPL` front desk can also bridge to an existing downstream `Paperclip` control plane for issue / approval UI and audit trails, without turning `Paperclip` into the runtime owner.
`Paperclip` is optional: without it, `OPL` still runs through its own natural-language front desk, dashboard, session ledger, and handoff surfaces; with it configured, `paperclip-bootstrap / paperclip-open-task / paperclip-open-gate / paperclip-sync / paperclip-operator-loop` add an external issue / approval / audit UI, pull approval decisions back into OPL-tracked gate state, and keep audit snapshots synced automatically.
For the operator loop, see [Paperclip Control Plane Operator Guide](docs/references/paperclip-control-plane-operator-guide.md).

## Unified Harness Engineering Substrate

Under `OPL`, the shared top-level architectural language is named the `Unified Harness Engineering Substrate`, or `UHS`.
`UHS` provides the common Harness Engineering vocabulary for runtime structure, product behavior, and cross-domain reuse beneath `OPL`.
Its most important shared pieces are now converging into two contract families:

- [Shared Runtime Contract](docs/shared-runtime-contract.md)
- [Shared Domain Contract](docs/shared-domain-contract.md)

Those two contracts split the shared layer more clearly:

- `Shared Runtime Contract`
  - freezes the long-running runtime objects that should stay shared, such as `runtime profile`, `session substrate`, `gateway runtime status`, `memory provider hook`, `delivery / cron`, and `approval / interrupt / resume`
- `Shared Domain Contract`
  - freezes the upper-layer behavior semantics that multiple `Domain Harness OS` implementations should keep aligned, such as the formal-entry matrix, the `per-run handle`, the durable report surface, the audit trail, gate semantics, and the no-bypass rule

In practice:

- the preferred long-line implementation direction for the shared runtime layer is the upstream `Hermes-Agent`, with repo-local "Hermes"-named packages serving as transition scaffolds and pilots today
- the four repositories are no longer at the same integration depth: `Med Auto Grant` has landed a real upstream `Hermes-Agent` runtime substrate, `Med Auto Science` has completed external runtime bring-up and is moving toward real adapter cutover, `RedCube AI` has converged route / managed execution onto local `Codex CLI` host-agent runtime while landing repo-verified `product frontdesk / federated product entry / session continuity / family-orchestration companion` surfaces, and `OPL` itself stays above domain runtime ownership
- the current repo states are still transitional:
  - `Med Auto Science` uses a repo-side seam while real long-running execution still stays in the controlled `MedDeepScientist` backend
  - `RedCube AI` now uses local `Codex CLI` host-agent runtime as its current delivery run surface, while a service-safe domain-entry adapter plus repo-verified `product frontdesk / manifest / federated entry / session continuity` surfaces keep the family contract honest
  - `Med Auto Grant` now runs on a real upstream `Hermes-Agent` runtime substrate while repo-side domain / entry adapters preserve author-side grant truth, route semantics, and its lightweight product-entry shell
- when the ecosystem later adopts upstream `Hermes-Agent`, it should sit in the runtime-substrate layer while the `OPL Gateway`, each `Domain Gateway`, and each `Domain Harness OS` keep their own responsibilities

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

This is the direction of convergence for the ecosystem.
The shared runtime layer, hosted entry surfaces, and any real `Hermes-Agent` rollout are still progressing inside their respective repositories and contracts.

For the current truth reset, the true-integration criteria, and the target-state tradeoffs, see [Hermes-Agent Truth Reset And Target State](docs/references/hermes-agent-truth-reset-and-target-state.md).

Under that substrate, the current domain systems should be understood as separate `Domain Harness OS` implementations with distinct product scopes:

- `Med Auto Science` for medical `Research Ops`
- `Med Auto Grant` for the active medical `Grant Ops` repository line, with top-level federation admission and handoff wording still tracked separately
- `RedCube AI` for visual deliverables and the current `Presentation Ops` family entry

`OPL` itself stays at the top-level gateway and federation layer above those domain gateways and `Domain Harness OS` implementations.

## What OPL Means Publicly

For an external reader, the simplest way to understand `OPL` is:

- it is the top-level product surface for how one-person lab work is organized
- it defines how workstreams map to domain systems
- it keeps cross-domain semantics stable while letting each domain stay independently usable

## Product Entry And Hermes Kernel Integration

The current truth is still transitional, but it has moved forward:

- `OPL` now ships a local direct product-entry shell whose default front door is `opl`
- `opl` seeds or resumes an `OPL Front Desk` session on top of the external Hermes kernel
- `opl "<request...>"` now acts as the fast natural-language path for a one-shot routed ask
- `opl start --project <project_id> [--mode <mode_id>]` now resolves one admitted domain's `product_entry_start` surface into the exact next entry mode `OPL` recommends
- `opl doctor`, `opl ask`, `opl chat`, `opl resume`, `opl sessions`, `opl logs`, `opl repair-hermes-gateway`, `opl frontdesk-manifest`, `opl frontdesk-hosted-bundle`, `opl frontdesk-hosted-package`, `opl frontdesk-librechat-package`, `opl session-ledger`, `opl handoff-envelope`, `opl domain-manifests`, `paperclip-*`, and the `frontdesk-service-*` commands now form the explicit product-entry and runtime-ops command surface; the `paperclip-*` family remains optional and only activates the downstream external control-plane bridge when configured
- `opl frontdesk-manifest`, `opl frontdesk-hosted-bundle`, `opl frontdesk-hosted-package`, and `opl frontdesk-librechat-package` now freeze the hosted-friendly shell contract, the hosted-ready bundle surface, the self-hostable front-desk package, and the actual LibreChat-first hosted shell pilot package without overstating managed hosted-runtime readiness
- `opl projects`, `opl workspace-status`, `opl workspace-catalog`, `opl workspace-bind|activate|archive`, `opl domain-manifests`, `opl runtime-status`, `opl session-ledger`, and `opl dashboard` now add a writable top-level management surface for project, workspace, session, runtime, and handoff visibility; `workspace-catalog` stays registry-only, while `domain-manifests` actually resolves the active bound domain-owned `manifest_command` into a machine-readable discovery surface so family wiring can consume the honest product-entry manifest without inventing domain shell capability; the same surface now also preserves each domain's `product_entry_start`, `product_entry_shell`, `shared_handoff`, and optional `family_orchestration.action_graph` companion instead of flattening everything back into guesswork
- `opl web` now lands a local web front desk pilot for browser-based direct entry, routed start resolution, quick ask, workspace inspection, workspace binding, runtime visibility, managed session-ledger review, and hosted-friendly `health / manifest / domain-manifests / hosted-bundle / hosted-package / librechat-package / start / sessions / resume / logs / handoff-envelope` surfaces
- `opl frontdesk-service-install|status|start|stop|open|uninstall` now add a service-safe local packaging layer for the OPL web front desk on top of launchd
- users no longer need to start from `Codex` just to reach the top-level `OPL` surface locally
- this landed product entry now includes both the local CLI-first shell and a local web front desk pilot; a self-hostable hosted pilot package and a real LibreChat-first hosted shell pilot package are both landed, but the actual managed hosted runtime is still not landed
- the hosted / web benchmark is now frozen: the shortest-path pilot is `LibreChat-first`, while the long-line target remains an `OPL`-owned web front desk; `Chatbot UI` is too thin to act as the main hosted base
- the domain maturity gap is now narrower but still real: `Med Auto Grant` already has a grant-facing structured shell plus read-only direct-product projections, `Med Auto Science` now has a research-only shell plus shared-envelope `build-product-entry`, and `RedCube AI` now has a repo-verified `redcube product frontdesk` with direct / federated / session entry surfaces plus family-orchestration companions; none of the three should yet be overstated as a mature hosted or end-user front desk
- the four repositories are no longer at the same integration depth: `Med Auto Grant` has landed a real upstream `Hermes-Agent` runtime substrate, `Med Auto Science` has completed external runtime bring-up and is moving toward real adapter cutover, `RedCube AI` has converged route / managed execution onto local `Codex CLI` host-agent runtime while landing repo-verified product-entry federation, and `OPL` itself stays above domain runtime ownership while now owning the local family-level entry shell

The target product chain is:

`User -> OPL Product Entry -> OPL Gateway -> Hermes Kernel -> Domain Adapter -> Domain Gateway -> Domain Harness OS -> Executor Adapter -> Concrete Executor`

That top-level chain is only half of the real target.
The domain repositories should not remain internal-only runtime surfaces forever.
The intended family structure is:

- top level: `User -> OPL Product Entry -> OPL Gateway -> Hermes Kernel -> Domain Handoff -> Domain Product Entry / Domain Gateway`
- per domain: `User -> Domain Product Entry -> Domain Gateway -> Hermes Kernel -> Domain Harness OS`

So `OPL` becomes the family-level direct entry, while each domain repository also grows a lightweight direct entry for users who already know they want a research, grant, or visual-deliverable workflow.

What landed in this repository is the first local shell of that idea:

- `opl`
  - enters the `OPL Front Desk`, seeds a Hermes session, and resumes it directly when running interactively
- `opl "<request...>"`
  - treats a plain-language request as a routed quick ask without requiring the explicit `ask` verb
- `opl start --project <project_id> [--mode <mode_id>]`
  - resolves one admitted domain's `product_entry_start` surface and emits the exact recommended mode, available modes, resume surface, and human-gate summary before handoff
- `opl doctor`
  - checks the local product-entry shell, Hermes kernel visibility, and gateway-service readiness
- `opl ask "<request...>"`
  - routes a plain-language request through `OPL`, builds a handoff prompt, and runs a one-shot Hermes query
- `opl chat "<request...>"`
  - seeds a routed Hermes session through `OPL`, then resumes it interactively
- `opl resume <session_id>`
  - resumes a known Hermes-backed OPL session
- `opl sessions`, `opl logs`, `opl repair-hermes-gateway`
  - expose machine-readable session and runtime-ops surfaces for the landed local shell
- `opl session-ledger`
  - shows OPL-managed session events together with honest runtime resource samples captured at event time
- `opl handoff-envelope`
  - builds the machine-readable family handoff bundle that connects the OPL front desk to a domain direct entry or domain gateway
- `opl frontdesk-service-install|status|start|stop|open|uninstall`
  - install and manage a launchd-backed local OPL web front desk so the browser entry can stay long-running without manual terminal babysitting
- `opl frontdesk-manifest`
  - exposes the hosted-friendly front-desk contract for future web shells while keeping hosted packaging status honest
- `opl frontdesk-hosted-bundle`
  - freezes the hosted-pilot-ready shell bundle, including base-path-aware entry and API endpoints, without claiming an actual hosted runtime
- `opl frontdesk-hosted-package`
  - exports a self-hostable hosted pilot package with app snapshot, run script, env template, `systemd` unit, service-install / healthcheck helpers, and reverse-proxy assets, without claiming an actual hosted runtime
- `opl frontdesk-librechat-package`
  - exports the real LibreChat-first hosted shell pilot package, combining the OPL front-desk package, same-origin reverse-proxy assets, and LibreChat deployment files while keeping managed hosted runtime claims honest
- `opl projects`
  - lists the current family-level project surfaces exposed through OPL
- `opl workspace-status`
  - inspects one workspace path for git/worktree state and file-surface visibility
- `opl workspace-catalog`
  - shows the file-backed workspace registry for OPL and admitted domain project surfaces
- `opl domain-manifests`
  - resolves the current active admitted-domain `manifest_command` bindings into machine-readable product-entry discovery surfaces, including `product_entry_start`
- `opl workspace-bind|activate|archive`
  - bindings can now also carry a `manifest_command` for the routed domain workspace
  - manage project workspace bindings and optional direct-entry locators so top-level handoff can stay machine-readable and honest
- `opl runtime-status`
  - reports Hermes runtime health, recent sessions, and runtime-level process resource usage
- `opl dashboard`
  - aggregates the current front-desk management view across projects, workspace, workspace catalog, resolved domain manifests, session ledger, and runtime
- `opl web`
  - starts the local web front desk pilot so users can open OPL in a browser, resolve one routed domain `product_entry_start`, run quick ask, inspect and bind workspaces, review managed session ledger state, inspect resolved domain manifests, export both the self-hostable front-desk package and the LibreChat-first hosted shell pilot package, and consume hosted-friendly `health / manifest / domain-manifests / hosted-bundle / hosted-package / librechat-package / start / sessions / resume / logs / handoff-envelope` APIs without going through Codex

This new shell does not erase the existing `Phase 1` gateway contract.
The machine-readable gateway contracts remain the stable top-level contract surface for federation truth.
The product-entry shell is the first user-facing launcher layer above that contract surface.

The integration choice is now frozen as:

- not forking or vendoring `Hermes-Agent` kernel code into `OPL`
- not requiring users to manually install and understand `Hermes-Agent` before they can use `OPL`
- using `Hermes-Agent` as an external kernel while letting `OPL` own the product-facing bootstrap, launcher, version pinning, runtime wiring, and user entry

The short name for that choice is:

- `external kernel, managed by OPL product packaging`

For the open-source local shape, that means `OPL` should provision and manage a supported `Hermes` runtime for the user instead of pushing runtime assembly work onto them.
For the future hosted shape, that means the platform can run the `Hermes` kernel internally while users interact only with the `OPL` entry surface.
`Codex` therefore remains a development host and local operator brain, not the future product prerequisite.
The same logic should later apply to the admitted domain repositories as lightweight direct-entry products at their own domain scope.

For the detailed comparison between fork / user-managed install / managed external-kernel integration, see [OPL Product Entry And Hermes Kernel Integration](docs/references/opl-product-entry-and-hermes-kernel-integration.md).
For the family-level entry stack and the `OPL -> domain` handoff architecture, see [Family Product Entry And Domain Handoff Architecture](docs/references/family-product-entry-and-domain-handoff-architecture.md).
For the current hosted / web front-desk benchmark and why `LibreChat-first` beats `Chatbot UI` for the first pilot, see [OPL Hosted / Web Front Desk Benchmark](docs/references/opl-hosted-web-frontdesk-benchmark.md).
For the family-level rollout order of `OPL` plus the three domain direct-entry surfaces, see [Family Lightweight Direct Entry Rollout Board](docs/references/family-lightweight-direct-entry-rollout-board.md).
For the current front-desk implementation progress, see [OPL Front Desk Delivery Board](docs/references/opl-frontdesk-delivery-board.md).

## Shared Operating Pattern

At the top level, `OPL` adopts `Agent-first` as its default operating pattern.
The Agent serves as the default executor: it reads state, calls stable gateways, composes steps, organizes intermediate artifacts, and writes key traces back to auditable surfaces, while code provides stable objects, controllers, tool wrappers, gate rules, and delivery surfaces.

The current active development host is Codex-only local sessions: planning, implementation, verification, and review are all still handled through standard Codex sessions.
That host choice is not the product-runtime truth of `OPL`.
At the product/runtime layer, the preferred future substrate direction is a true upstream `Hermes-Agent` integration proved inside a domain repository first, while `OPL` itself remains the top-level gateway and federation layer.
When that direction is realized, the preferred integration mode is still `external kernel, managed by OPL product packaging` rather than a long-term fork or a user-managed prerequisite install.

Today, the current domain repositories should be understood as `Auto-only` product mainlines.
They optimize for autonomous end-to-end execution, evaluation, hardening, and auditability.

Any future higher-judgment `Human-in-the-loop` product should sit above or beside those repositories as a compatible sibling or upper-layer product that reuses the same stable substrate contracts, object semantics, audit surfaces, and execution modules.

This is the shared `OPL` target operating pattern now frozen at the architecture layer.

## Why A Gateway Federation

The same datasets, references, figures, and judgments are reused across:

- research progression and paper delivery
- grant writing and grant review
- dissertation drafting and defense preparation
- peer review, rebuttal, and revision
- lectures, lab presentations, and defense slides

`OPL` uses a gateway federation so the same context can stay reusable across workstreams while domain boundaries, ownership, and maintenance stay clear.

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

Current public candidate scaffold:

- `Grant Ops` -> `Grant Foundry` -> `Med Auto Grant` as the active medical grant-domain repository line, with top-level federation admission / handoff wording still separately gated

Important boundary:

- `RedCube AI` is the current admitted visual-deliverable domain surface for `Presentation Ops`, with `ppt_deck` as its most direct family mapping
- `xiaohongshu` shares the same RedCube harness and remains a separate visual family at the OPL layer
- future `Grant Ops`, `Review Ops`, and `Thesis Ops` are being defined as their own domain boundaries

## Current Domain Surfaces

### Med Auto Science

[`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) is the mature medical implementation on the active `Research Ops` line under the `OPL` umbrella.

Its current role is:

- the formal medical implementation of `Research Foundry`
- the formal entry surface for medical research operations
- the domain-specific governance and delivery surface for research work
- the top-level controller above its research harness and controlled runtimes

### Med Auto Grant

[`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) is the active medical `Grant Ops` repository line under the `OPL` umbrella.
Its own repository has already landed a real upstream `Hermes-Agent` runtime substrate and a lightweight product-entry shell, while the `OPL` federation layer still keeps its top-level admission / handoff wording separately gated.

Its current role is:

- the active author-side, proposal-facing medical `Grant Ops` repository line
- the place where the medical `NSFC` generic application mainline, real upstream substrate, and lightweight product-entry shell are currently being frozen
- the domain surface whose top-level federation admission / handoff wording still remains separately gated at the `OPL` layer
- the current bridge between repo-real grant runtime progress and future family-level federation wording

### RedCube AI

[`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) is the currently admitted visual-deliverable domain gateway under the `OPL` umbrella.

Its correct boundary is:

- the domain gateway for visual deliverables
- the harness surface that most directly carries `Presentation Ops` through `ppt_deck`
- the repo-verified direct-entry surface whose current route / managed execution runs on local `Codex CLI` host-agent runtime
- a runtime family surface that can also host families not identical to `Presentation Ops`


## Current Federation Activation State

As of `2026-04-13`, the admitted domain surfaces at the top layer still remain:

- `MedAutoScience` for `research_ops`
- `RedCube AI` for `presentation_ops`

`Grant Foundry -> Med Auto Grant` remains tracked as an active grant-domain repository line whose top-level federation admission / handoff wording is still separately gated, while `Review Ops` and `Thesis Ops` stay in under-definition onboarding lanes.
The top-level formal entry is no longer only the historical read-only gateway baseline: the current front door is the local `opl` CLI shell plus the `opl web` pilot and their machine-readable discovery / handoff surfaces.
The active top-level mainline is now `family-level front desk / hosted runtime hardening / domain lightweight direct-entry alignment`.
`central sync` is no longer the default active tranche; it only reopens when an admitted-domain repository lands a new absorbed delta or the central reference surfaces drift.
At the same time, the completed `Phase 1 / G2 release-closeout` still freezes the `G2 stable public baseline`, and the absorbed `Minimal admitted-domain federation activation package` remains the latest top-level activation package for the already admitted `MedAutoScience` and `RedCube AI` surfaces only.
Beneath the current front desk, the machine-readable formal-entry contract still remains the local `TypeScript CLI`-first / read-only gateway surface; the next truth-bearing work now sits in the shared runtime layer, hosted entry surfaces, and any real `Hermes-Agent` rollout that domain repositories can honestly absorb.


## Scope Boundary

Describe this repository as:

- the authoritative public spec surface for the OPL gateway
- the place where cross-domain boundaries are frozen first
- the federation entry that links independent domain systems
- the place where readers learn how the ecosystem is supposed to fit together

## Roadmap

The current public mainline is now the family-level front desk and direct-entry alignment work that sits on top of the already landed local `opl` shell and `opl web` pilot:

- keep public docs, gateway contracts, and admitted-domain wording aligned with the current repo-tracked truth
- continue hardening the family-level front desk, hosted/web shell contract, and managed session / handoff surfaces
- keep `Research Foundry -> Med Auto Science`, `Grant Foundry -> Med Auto Grant`, and `RedCube AI` aligned around `product frontdesk + operator loop + shared handoff envelope`
- keep `Review Ops` and `Thesis Ops` below admitted-domain status until their domain boundaries and onboarding evidence are explicitly frozen
- reopen `central sync` only when an admitted-domain repository lands new absorbed delta or when the central reference surfaces drift

The current delivery target is no longer a read-only `TypeScript CLI` gateway alone.
It is a family-level direct entry made of the local `opl` shell, the `opl web` pilot, hosted-friendly bundle surfaces, and domain-manifest discovery above the external kernel managed by `OPL` product packaging.
The active development-control path remains a single Codex-only flow across planning, implementation, verification, and review, but that should not be confused with product runtime ownership.
At this layer, `OPL` only exposes the gateway surface and shared contracts; any honest `Hermes-Agent` runtime rollout still has to happen in a domain repository before it can be promoted into top-level truth, and the intended product-facing shape remains a direct `OPL` entry backed by an external kernel managed through `OPL` product packaging.

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
