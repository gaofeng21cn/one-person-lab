<p align="center">
  <img src="assets/branding/opl-app-icon.png" alt="One Person Lab logo" width="128" />
</p>

<p align="center">
  <a href="./README.md"><strong>English</strong></a> | <a href="./README.zh-CN.md">中文</a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>A stage-led agent framework for high-value knowledge delivery</strong></p>
<p align="center">Organize research, grants, presentations, patents, and other complex work into expert stages that are traceable, recoverable, and auditable.</p>

<p align="center">
  <img src="assets/branding/opl-stage-led-delivery-overview.png" alt="One Person Lab stage-led delivery model" width="100%" />
</p>

## Why One Person Lab

Papers, grants, patents, reviews, awards, and high-end presentations all require the same high-stakes judgments: whether the goal is clear, whether the evidence is sufficient, whether the reasoning is sound, whether the quality bar is met, and whether the result can move forward.

One Person Lab turns those judgments into runnable expert stages. Each stage carries a goal, source material, quality criteria, handoff, receipt, and authority boundary. Inside a stage, a domain agent can read, reason, write, compute, review, and revise before returning a domain-owned verdict and deliverable. One Person Lab keeps those stages visible, recoverable, auditable, and ready for continuation.

That is the architectural advantage: One Person Lab productizes the delivery logic of professional knowledge work and makes agents operate around stages, evidence, quality, and deliverables.

## Architectural Advantages

- **Stages are the delivery unit**: the system tracks what each expert stage should produce across definition, preparation, execution, review, revision, and delivery.
- **Evidence and quality gates are built in**: source material, criteria, and receipts make progress, rework points, and delivery rationale explicit.
- **Domain agents carry domain judgment**: medical research, grant writing, and visual delivery are owned by specialized agents, while One Person Lab provides shared runtime, discovery, recovery, and presentation.
- **Long tasks can continue**: attempts, handoffs, receipts, progress, and artifacts are organized as traceable state across sessions.
- **The product family can expand**: Research, Grant, and Presentation Foundry share the same stage-led foundation, with Patent, Award, Thesis, and Review lines planned.

## Product Layers

One Person Lab is both the technical stage-led agent framework and the product family built around it:

| Layer | Audience | Role |
| --- | --- | --- |
| **One Person Lab** | Developers, technical operators, product integration | Shared foundation for building and running domain agents: stage control, runtime providers, contracts, module discovery, skill sync, runtime snapshots, and progress projections. |
| **Domain agents** | Specialized work | MAS, MAG, RCA, and future agents carry domain judgment, quality verdicts, stage semantics, and deliverables. |
| **One Person Lab App** | End users | Desktop workbench that packages One Person Lab, domain agents, and companion tools with download, first-run checks, progress, files, runtime status, and updates. |

The chain is straightforward: build and run domain agents with One Person Lab, then package One Person Lab and the agents into a desktop product for users.

<p align="center">
  <img src="assets/branding/opl-framework-ecosystem-map.png" alt="One Person Lab builds domain agents and packages them into the desktop product" width="100%" />
</p>

## Current Product Lines

| Product line | Current agent | Best for | Typical deliverables |
| --- | --- | --- | --- |
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

The one-shot installer, initialization flow, runtime/contracts, module management, and machine-readable App interfaces are maintained by this framework repository. Desktop DMGs, complete first-install DMGs, updater metadata, GUI smoke, GitHub Releases, and user tutorials are maintained by the App repository.

To develop a new domain agent, debug the CLI, or integrate runtime surfaces, open the technical entry below.

## Product Roadmap

- Improve the desktop App first-install package, update channel, and cross-platform release workflow.
- Expand the stage-led runtime with stronger recovery, retry, human approval, and progress projection.
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
opl family-runtime attempt list
```

Automation should prefer `opl help --json`, machine-readable contracts under `contracts/`, and projection data exported by the domain agents.

### Framework Responsibility

This repository maintains the One Person Lab framework layer:

- CLI entry points for installation, initialization, diagnostics, and repair.
- Explicit activation, stage control, handoff, receipts, human gates, and recovery.
- Runtime providers, typed queue, stage attempt ledger, runtime snapshots, and projection consumption.
- Machine-readable contracts, module discovery, `opl module exec`, and skill synchronization.

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
