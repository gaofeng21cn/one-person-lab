<p align="center">
  <img src="assets/branding/opl-app-icon.png" alt="One Person Lab logo" width="128" />
</p>

<p align="center">
  <a href="./README.md"><strong>English</strong></a> | <a href="./README.zh-CN.md">中文</a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>An AI agent framework and workbench for complex knowledge work</strong></p>
<p align="center">Move papers, grants, presentations, patents, and other demanding projects through clear stages toward real delivery.</p>

<p align="center">
  <img src="assets/branding/opl-stage-led-delivery-overview-v2.png" alt="One Person Lab stage-led delivery model" width="100%" />
</p>

## Why One Person Lab

AI can already answer a question, generate code, or polish a document. The harder problem is finishing work that spans many sessions: a paper, a grant proposal, a defense deck, a patent package, or a research line that needs to keep moving for weeks.

These tasks raise the same practical questions:

- After many rounds of work, where exactly are we?
- Which sources were used, which files changed, and what evidence was left behind?
- Can preparation, execution, review, revision, and delivery stay separate instead of being buried in one long chat?
- Can work continue while the user is away, then report progress, blockers, and next steps?
- Can specialized agents share one runtime, file, progress, and delivery system instead of each rebuilding its own?

**One Person Lab is built around those questions.**

It breaks complex knowledge work into clear stages: prepare the material, do the work, review quality, revise, and close out delivery. Each stage carries a goal, inputs, outputs, progress, evidence, and next step, so AI agents work toward deliverables instead of disappearing into long conversations.

## Core Highlights

<table width="100%">
<tr>
<td width="50%" valign="top">

**Stage-led progress for complex work**

Papers, grants, presentations, and patents rarely finish in one prompt. OPL organizes them into task stages so it is clear what each step is meant to do, what finished, and what is still blocked.

</td>
<td width="50%" valign="top">

**Specialized agents for specialized work**

Medical research, grant writing, visual delivery, and agent building are handled by different Foundry Agents. Users see one workbench, while each agent keeps its own standards and delivery authority.

</td>
</tr>
<tr>
<td width="50%" valign="top">

**Progress, evidence, and files stay traceable**

You can see which sources were used, what results were produced, which files changed, and what report was left behind. When a task fails, the reason is visible: missing material, human approval, quality issue, or runtime problem.

</td>
<td width="50%" valign="top">

**Hosted long-running work**

OPL is not limited to one-shot chats. It is designed for multi-round work, background execution, periodic checks, failure recovery, and human review.

</td>
</tr>
</table>

## One-Sentence View

**One Person Lab makes AI agents behave like a hosted professional team: they move complex tasks forward by stage, produce files, leave evidence, report blockers, and close out deliverables.**

If ordinary AI tools answer "what should I say now?", One Person Lab answers "how does this complex work reach delivery?"

## Why It Is Different From Workflow-Style Agents

Workflow-style agents are useful for program automation: tool calls, function I/O, graph nodes, and deterministic routing. Complex knowledge delivery needs a different unit of work. A paper, grant, presentation, or patent does not move forward just because one node ran; it moves forward when an expert stage is scoped, grounded, executed, reviewed, revised, and shipped with visible evidence.

<p align="center">
  <img src="assets/branding/opl-stage-led-delivery-overview.png" alt="One Person Lab compared with workflow-style agents" width="100%" />
</p>

## Product Layers

One Person Lab has three user-visible layers:

| Layer | Audience | Role |
| --- | --- | --- |
| **OPL Framework** | Developers, technical operators, product integration | Runs long tasks, connects specialized agents, records progress and evidence, and supports recovery, retry, and human intervention. |
| **One Person Lab App** | End users | Desktop workbench for choosing tasks, watching progress, opening files, handling blockers, and receiving updates. |
| **Foundry Agents** | Specialized work | MAS, MAG, RCA, and later agents handle medical research, grant writing, visual delivery, and other high-value knowledge work. |

The chain is straightforward: host specialized agents with OPL Framework, then package the framework and agents into a desktop product users can run directly.

The repository split is deliberate. `one-person-lab` owns the framework, runtime, CLI, contracts, generated surfaces, and App-readable state/action interfaces. `one-person-lab-app` owns GUI product truth, App release gates, updater metadata, user guides, screenshots, first-run checks, and active-shell validation. `opl-aion-shell` is the current implementation carrier for the App-owned GUI contract. MAS, MAG, RCA, and other domain repositories own their domain app/runtime authority, domain truth, quality/export verdicts, artifact authority, owner receipts, and direct skill entries.

The ordinary desktop product is a Codex App wrapper: it uses `Codex CLI` as the fixed concrete executor and presents MAS, MAG, RCA, and later Foundry Agents as built-in task entries. AionUI upstream backend/agent selectors, non-default executor adapters, and shell implementation details belong in explicit developer/operator diagnostics, not in the normal user product surface.

<p align="center">
  <img src="assets/branding/opl-framework-ecosystem-map.png" alt="One Person Lab builds domain agents and packages them into the desktop product" width="100%" />
</p>

## Current Product Lines

| Product line | Current agent | Best for | Typical deliverables |
| --- | --- | --- | --- |
| `Agent Foundry` | [`OPL Meta Agent`](https://github.com/gaofeng21cn/opl-meta-agent) | Building new agents, taking over external-agent testing, mechanism self-evolution | Agent baselines, Agent Lab suites, mechanism patch proposals |
| `Research Foundry` | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) | Medical research, evidence organization, analysis, manuscript preparation | Analysis packages, evidence packages, manuscripts |
| `Grant Foundry` | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | Grant direction setting, proposal writing, revision preparation | Proposals, outlines, revision packs |
| `Presentation Foundry` | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | Lectures, lab talks, reports, defenses, project materials | Slide decks, scripts, presentation packages |
| `Patent Foundry` | Planned | Patent applications, invention disclosures, claims, embodiments | Invention disclosures, patent drafts, claim sets |
| `Award Foundry` | Planned | Awards, achievement summaries, evidence organization | Award applications, summaries, evidence packs |
| `Thesis Foundry` | Planned | Thesis assembly and defense preparation | Chapter drafts, defense materials |
| `Review Foundry` | Planned | Review, rebuttal, and revision work | Review comments, response drafts, revision plans |

## Getting Started

To use the desktop product, download One Person Lab App from the App repository:

[Download One Person Lab App](https://github.com/gaofeng21cn/one-person-lab-app/releases/latest)

The desktop product one-shot installer, complete first-install package, Docker/WebUI entry point, GitHub Releases, and user tutorials are maintained by the App repository. This repository maintains the CLI, initialization flow, runtime, contracts, module management, and machine-readable App interfaces behind those entries.

To develop a new domain agent, debug the CLI, or integrate runtime surfaces, open the technical entry below.

## For Codex / Agents

On a new machine, ask Codex to install the OPL runtime, MAS/MAG/RCA/OMA agent surfaces, OPL Flow, OPL Doc, and companion tools from the [new-machine Codex bootstrap guide](docs/references/current-support/opl-new-machine-codex-bootstrap.md):

```text
Please follow the official One Person Lab new-machine guide and set up this machine with the OPL agent runtime environment and the complete Codex workflow toolkit.
Source of truth: https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/references/current-support/opl-new-machine-codex-bootstrap.md
```

## Product Roadmap

- Improve the desktop App first-install package, update channel, and cross-platform release workflow.
- Expand the stage-led runtime with stronger recovery, retry, human approval, and progress projection.
- Use OPL Meta Agent as the Agent Foundry entry for building new domain agents, taking over testing for existing agents, and organizing Agent Lab mechanism evolution.
- Stabilize the Research, Grant, and Presentation Foundry user experience.
- Bring Patent, Award, Thesis, and Review work into the same product family.
- Unify module installation, skill sync, artifact browsing, and workspace recovery across domain agents.

## Technical Entry

<details>
  <summary><strong>Developer and agent notes</strong></summary>

### Common Commands

Source development entry:

```bash
git clone https://github.com/gaofeng21cn/one-person-lab.git
cd one-person-lab
npm install
npm link
```

Common framework commands:

```bash
opl help --text
opl modules
opl module exec --module medautoscience -- doctor entry-modes
opl skill sync
opl family-runtime status
opl family-runtime repair
opl family-runtime provider repair --provider temporal
opl family-runtime attempt list
```

Automation should prefer `opl help --json`, machine-readable contracts under `contracts/`, and projection data exported by the domain agents.

### Framework Responsibility

This repository maintains the One Person Lab framework layer:

- CLI entry points for installation, initialization, diagnostics, and repair.
- Explicit activation, stage control, handoff, receipts, human gates, and recovery.
- Runtime providers, typed queue, stage attempt ledger, runtime snapshots, and projection consumption.
- Machine-readable contracts, module discovery, `opl module exec`, and skill synchronization.

OPL follows an AI-first, contract-light surface model: the active framework narrative is `Minimal Trust Kernel + Readiness + Derived Diagnostic Lenses + Surface Budget + AI Capability Aperture`. The kernel admits stage packs and binds owner boundaries, permissions, expected receipts, audit, replay, and route-back evidence. Prompt/tool/knowledge/rubric refs are recommended AI strategy refs for inspectability and reuse, but their completeness is not an OPL launch hard gate. Readiness aggregates launch and evidence gaps without issuing domain verdicts. Diagnostic lenses can explain blockers, stale assumptions, replay gaps, or route-back evidence, but they do not become runtime planners, proof assistants, workflow compilers, or quality authorities. The surface budget keeps new default surfaces limited to launch safety, authority boundary, evidence/replay/audit/route-back, or repeated App/runtime consumption; other learning points stay as refs, warnings, diagnostics, or history. The AI Capability Aperture keeps open-ended expert work available to stronger executors while routing quality, publication, fundability, visual, and export judgment back to independent AI reviewer or domain-owner receipts.

Temporal-backed provider support is the production online runtime target. Local providers are used for development, testing, and offline diagnostics. Codex CLI is the current first-class executor; Hermes-Agent, Claude Code, and similar tools can enter as explicit executor adapters with receipts and auditability.

### Documentation

- [Documentation index](./docs/README.md)
- [Project overview](./docs/project.md)
- [Current status](./docs/status.md)
- [Architecture](./docs/architecture.md)
- [Invariants](./docs/invariants.md)
- [Decisions](./docs/decisions.md)
- [Contracts directory guide](./contracts/README.md)
- [Public roadmap](./docs/public/roadmap.md)

</details>
