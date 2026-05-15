<p align="center">
  <img src="assets/branding/opl-app-icon.png" alt="One Person Lab logo" width="128" />
</p>

<p align="center">
  <a href="./README.md"><strong>English</strong></a> | <a href="./README.zh-CN.md">中文</a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>A stage-led agent framework for high-value knowledge delivery.</strong></p>
<p align="center">Organize agent work like expert service delivery: scope, ground, execute, review, revise, and ship traceable outcomes.</p>

<p align="center">
  <img src="assets/branding/opl-stage-led-delivery-overview.png" alt="One Person Lab stage-led delivery model" width="100%" />
</p>

## Why One Person Lab

Papers, grants, patents, reviews, awards, and high-end presentations are difficult because the system must know which expert stage the work is in, what evidence is sufficient, how quality is judged, and which result can move forward.

One Person Lab uses the expert stage as the core runtime unit. Each stage carries a goal, source material, quality criteria, handoff, receipt, and authority boundary. Inside a stage, a domain agent can read, reason, write, compute, review, and revise before returning a domain-owned verdict and deliverable. The framework keeps those stages visible, recoverable, auditable, and ready for continuation.

This is the architectural advantage: One Person Lab productizes the delivery logic of professional knowledge work and makes agents operate around stages, evidence, quality, and deliverables.

## Architectural Advantages

- **Expert-stage execution**: work advances through define, ground, execute, review, revise, and ship phases, matching tasks that require repeated quality judgment.
- **Quality as part of the workflow**: each stage carries goals, source material, criteria, and receipts, so progress and revision points stay explicit.
- **Domain authority stays with domain agents**: medical research, grant writing, and visual delivery are judged by the owning agents, while One Person Lab provides shared runtime, discovery, recovery, and presentation.
- **Recoverable and auditable long runs**: attempts, handoffs, receipts, progress, and artifacts are organized as traceable state.
- **One framework, many product lines**: Research Foundry, Grant Foundry, and Presentation Foundry share the same stage-led foundation, with Patent, Award, Thesis, and Review lines planned.

<p align="center">
  <img src="assets/branding/opl-framework-ecosystem-map.png" alt="One Person Lab builds domain agents and packages them into the desktop product" width="100%" />
</p>

## Product Layers

One Person Lab is both the technical framework and the product family built around it:

| Layer | Audience | Role |
| --- | --- | --- |
| **One Person Lab** | Developers, technical operators, product integration | CLI, activation, stage control, runtime providers, queue, contracts, module discovery, skill sync, runtime snapshots, and progress projections. |
| **Domain agents** | Specialized work | MAS, MAG, RCA, and future agents own domain judgment, quality verdicts, stage semantics, and deliverables. |
| **One Person Lab App** | End users | Desktop workbench for packaging the framework, domain agents, and companion tools with download, first-run, progress, files, runtime status, and update flows. |

The chain is straightforward: build and run domain agents with One Person Lab, then package the framework and agents into a desktop product for users.

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

To install the framework, use the CLI path from this repository:

```bash
curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh | bash
opl system initialize
```

After installation, use the App for general work, medical research, grant writing, and presentation preparation, or use the CLI to manage modules, skills, runtime state, and stage attempts.

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
