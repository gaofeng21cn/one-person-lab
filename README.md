<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md"><strong>English</strong></a> | <a href="./README.zh-CN.md">中文</a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>One workbench for serious research, grant, and presentation work</strong></p>
<p align="center">Start expert work, keep progress visible, and collect deliverables in one trusted place.</p>

## Fast Start

For macOS desktop users:

```bash
curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh | bash
```

After installation, open `One Person Lab.app`, choose a workspace root, and start general work, medical research, grant writing, or presentation/PPT work from the same interface.

For Linux / Docker / server users:

- CLI installation uses the same one-line command.
- Browser access uses the OPL-branded AionUI WebUI; deployment, no-auth mode, Chinese defaults, and Codex configuration injection are documented in the [Docker WebUI deployment reference](./docs/references/opl-docker-webui-deployment.md).
- If the container or server does not already have Codex defaults, inject these variables before installing or starting the service:

```bash
export CODEX_HOME=/data/codex
export OPL_CODEX_MODEL=gpt-5.5
export OPL_CODEX_REASONING_EFFORT=xhigh
export OPL_CODEX_BASE_URL=https://your-provider.example/v1
export OPL_CODEX_API_KEY=sk-...
curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh | bash
```

One instruction for a Codex Agent:

> Install and configure this OPL repo: clone it, install the OPL CLI, run `opl install`, and ensure Codex CLI, Hermes-Agent, MAS/MDS/MAG/RCA, recommended skills, the One Person Lab App, and the WebUI entry are ready; if anything is missing, fix it or report the exact blocker.

`opl install` prepares the OPL CLI, Codex CLI, Hermes-Agent, active product-family modules, Codex skills, and the One Person Lab App in one pass. On macOS it opens or installs the desktop App first; Linux and Docker use the browser WebUI path.

## What New Users Can Do First

- **Medical research**: ask Research Foundry to move evidence organization, analysis, manuscript drafts, and deliverable packages forward.
- **Grant applications**: ask Grant Foundry to shape direction, structure a proposal, and prepare revision packages.
- **Presentations and PPT**: ask Presentation Foundry to prepare lectures, lab talks, defenses, and project reports.
- **General long-running work**: keep discussion, file reading, document editing, progress, and deliverables in one workbench.

## Common Commands After Installation

```bash
opl system initialize   # Inspect Codex, Hermes-Agent, modules, skills, GUI, and workspace-root state
opl modules             # Check MAS/MDS/MAG/RCA module installation and health
opl skill sync          # Sync OPL family skills into the Codex-visible skill path
opl help --text         # Human-readable help; use opl help --json for machine-readable output
```

## Current Product Families

| Product family | Current product | Best for | Typical deliverables |
| --- | --- | --- | --- |
| `Research Foundry` | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) + [`Med Deep Scientist`](https://github.com/gaofeng21cn/med-deepscientist) | Medical research, evidence organization, manuscript preparation, deep analysis | Analysis packages, evidence packages, manuscripts |
| `Grant Foundry` | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | Grant direction setting, proposal writing, revision work | Proposals, outlines, revision packs |
| `Presentation Foundry` | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | Lectures, lab talks, reports, defense materials | Slide decks, scripts, presentation packages |
| `Thesis Foundry` | Planned | Thesis assembly and defense preparation | Chapter drafts, defense materials |
| `Review Foundry` | Planned | Review, rebuttal, and revision work | Review comments, response drafts, revision plans |

## How The Workbench Is Organized

- General work for discussion, planning, reading, and common tasks.
- Workspace-based work for tasks that need a real directory and persistent file context.
- Specialized product families for domain-specific expert workflows.
- Progress and file views that stay attached to ongoing work.
- Central management for engines, modules, skills, GUI, and health status.

<p align="center">
  <img src="assets/branding/opl-workbench-overview.svg" alt="OPL workbench overview" width="100%" />
</p>

## Architecture And Product Plan

A higher-level map of the workbench, active foundries, and shared confidence surfaces.

<p align="center">
  <img src="assets/branding/opl-architecture-plan.svg" alt="OPL architecture and product plan" width="100%" />
</p>

## What This Repository Tracks

This repository tracks the shared OPL workbench layer, not the specialized domain-agent implementations. It keeps the product family coherent by providing:

- A common place to start and resume expert work.
- Module installation, skill sync, service setup, and health checks.
- Workspace, session, progress, and artifact discovery surfaces.
- Shared contracts that let Research, Grant, and Presentation Foundries stay visible from one workbench.

The desktop GUI source is maintained in [`opl-aion-shell`](https://github.com/gaofeng21cn/opl-aion-shell) as an internal OPL-branded app-shell build input. Users download One Person Lab App packages from this repository’s GitHub Releases, and this repository provides the shared workbench contracts and product surfaces consumed by the app and Codex.

## How To Read This Repository

1. Users should start with this README and the `opl install` path above.
2. Technical readers and planners should continue to [Docs Guide](./docs/README.md), then read [Project](./docs/project.md), [Status](./docs/status.md), [Architecture](./docs/architecture.md), [Invariants](./docs/invariants.md), and [Decisions](./docs/decisions.md).
3. Developers and maintainers should use [Contracts Overview](./contracts/README.md), [Reference Index](./docs/references/README.md), and the tracked records under `docs/specs/`, `docs/plans/`, and [History Archive](./docs/history/README.md).

## Agent And Operator Quick Start

<details>
  <summary><strong>If you are handing OPL to Codex or another general-purpose Agent, start here</strong></summary>

- Read the [Docs Guide](./docs/README.md) first. It already consolidates the current product model, technical working set, contract entry points, and document layering.
- Then read [Project](./docs/project.md), [Status](./docs/status.md), [Architecture](./docs/architecture.md), [Invariants](./docs/invariants.md), and [Decisions](./docs/decisions.md). This is the fastest way to recover the top-level boundary, the Codex-default runtime contract, the explicit activation layer, and the admitted domains.
- The default frontdoors are `opl`, `opl exec`, and `opl resume`. They inherit Codex-default semantics unless you explicitly switch runtime or activate a domain agent. `MCP` stays the supported protocol layer, and `controller` stays internal.
- The active interaction route is Codex-default first: local `opl`, direct `Codex` usage, and future external shells all consume the same session/runtime truth. `opl skill sync` auto-discovers sibling family repositories from the workspace layout by default, so local worktrees no longer need `OPL_FAMILY_WORKSPACE_ROOT` just to surface the family skill packs inside Codex.
- If one of the admitted domain repositories is not present yet, run `opl module install --module <module_id>`. The install path is a turnkey loop: clone into the OPL-managed modules root, run the repo-specific bootstrap, sync the matching Codex skill pack, then finish with a repo health check.
- The default local state directory is `~/Library/Application Support/OPL/state`. Override it with `OPL_STATE_DIR` when you need a non-default local state root.
- The current active domain agents are [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience), [`Med Deep Scientist`](https://github.com/gaofeng21cn/med-deepscientist), [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant), and [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai). They expose stable capability surfaces as local CLIs, programs/scripts, and repo-tracked contracts; continue into [Status](./docs/status.md), [Architecture](./docs/architecture.md), and the [OPL Public Surface Index](./docs/opl-public-surface-index.md) to recover the family mapping and public entry surfaces.
- Use `OPL` when the task needs the top-level session/runtime path, shared `workspaces / sessions / progress / artifacts` surfaces, or explicit domain activation. Use the corresponding domain repository when the task is already scoped to one domain and you want that repo's own CLI/scripts/contracts boundary.

</details>

## Further Reading

- [Roadmap](./docs/roadmap.md)
- [Task Map](./docs/task-map.md)
- [Operating Model](./docs/operating-model.md)
- [Unified Harness Engineering Substrate](./docs/unified-harness-engineering-substrate.md)
- [Docs Guide](./docs/README.md)
- [Project](./docs/project.md)
- [Status](./docs/status.md)
- [Contracts Overview](./contracts/README.md)
