<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md"><strong>English</strong></a> | <a href="./README.zh-CN.md">中文</a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>A session runtime and unified workbench for research, grant, and presentation work</strong></p>
<p align="center">Start work, follow progress, collect delivered files, and let multiple shells share the same runtime truth</p>

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>Who It Serves</strong><br/>
      Clinicians, researchers, PIs, educators, and small teams who want one entry point for long-running expert work
    </td>
    <td width="33%" valign="top">
      <strong>What It Helps Manage</strong><br/>
      Conversations, workspace-based tasks, progress updates, delivered files, and specialized workflows
    </td>
    <td width="33%" valign="top">
      <strong>Current Scope</strong><br/>
      <code>OPL</code> is the top-level workbench for the product family, with active coverage in medical research, grant work, and presentation delivery
    </td>
  </tr>
</table>

<p align="center">
  <img src="assets/branding/opl-workbench-overview.svg" alt="OPL workbench overview" width="100%" />
</p>

> `OPL` gives one place to start work, keep progress legible, and collect outputs, while each specialized product family keeps its own methods and deliverables.

## What People Use It For

- Start a general conversation or a multi-step task from the same workbench.
- Open workspace-based work when a task needs a fixed directory and file context.
- Run specialized product families for research, grant, and presentation work.
- Keep long-running progress visible in plain language.
- Gather manuscripts, proposals, slide decks, tables, review files, and other deliverables in one place.

## Current Product Families

| Product family | Current product | Best for | Typical deliverables |
| --- | --- | --- | --- |
| `Research Foundry` | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) | Medical research, evidence organization, manuscript preparation | Analysis packages, evidence packages, manuscripts |
| `Grant Foundry` | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | Grant direction setting, proposal writing, revision work | Proposals, outlines, revision packs |
| `Presentation Foundry` | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | Lectures, lab talks, reports, defense materials | Slide decks, scripts, presentation packages |
| `Thesis Foundry` | Planned | Thesis assembly and defense preparation | Chapter drafts, defense materials |
| `Review Foundry` | Planned | Review, rebuttal, and revision work | Review comments, response drafts, revision plans |

## How The Workbench Is Organized

- General work for discussion, planning, reading, and common tasks.
- Workspace-based work for tasks that need a real directory and persistent file context.
- Specialized product families for domain-specific expert workflows.
- Progress and file views that stay attached to ongoing work.
- Central management for engines, modules, and health status.

## What This Repository Tracks

- The shared workbench runtime and public API surfaces behind the product family.
- The family-level session runtime shared by the local `opl` shell / TUI and external shells.
- Engine and module management.
- Workspace, session, progress, and artifact discovery surfaces.
- Machine-readable contracts for the shared product layer.

The full GUI shell is maintained in an external overlay repository.
This repository tracks the shared session runtime and contract truth consumed by that shell, the local `opl` shell, and the CLI.

## How To Read This Repository

1. Potential users and human experts should start here, then continue to [Roadmap](./docs/roadmap.md), [Task Map](./docs/task-map.md), and [Operating Model](./docs/operating-model.md).
2. Technical readers and planners should continue to [Docs Guide](./docs/README.md), then read [Project](./docs/project.md), [Status](./docs/status.md), [Architecture](./docs/architecture.md), [Invariants](./docs/invariants.md), and [Decisions](./docs/decisions.md).
3. Developers and maintainers should use [Contracts Overview](./contracts/README.md), [Reference Index](./docs/references/README.md), and the tracked records under `docs/specs/`, `docs/plans/`, and [History Archive](./docs/history/README.md).

## Agent And Operator Quick Start

<details>
  <summary><strong>If you are handing OPL to Codex or another general-purpose Agent, start here</strong></summary>

- Read the [Docs Guide](./docs/README.md) first. It already consolidates the current product model, technical working set, contract entry points, and document layering.
- Then read [Project](./docs/project.md), [Status](./docs/status.md), [Architecture](./docs/architecture.md), [Invariants](./docs/invariants.md), and [Decisions](./docs/decisions.md). This is the fastest way to recover the top-level boundary, default execution host, and admitted domains.
- The current top-level `OPL` formal-entry matrix stays explicit: default formal entry `CLI`, supported protocol layer `MCP`, and `controller` only as an internal control surface. The default executor name is `Codex CLI`.
- The active interaction route is runtime-first: the local `opl` shell / TUI, explicit `OPL` invocation from `Codex`, and future external shells that consume the same compatibility surface.
- The current active domain agents are [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience), [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant), and [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai). They carry medical research, grant writing, and visual delivery respectively; continue into [Status](./docs/status.md), [Architecture](./docs/architecture.md), and the [OPL Public Surface Index](./docs/opl-public-surface-index.md) to recover the family mapping and public entry surfaces.
- Use `OPL` when the task needs the top-level session runtime or shared `workspaces / sessions / progress / artifacts` surfaces. Use the corresponding domain repository when the task is already scoped to one domain and you want that domain's own public entry surface, operator path, and delivery boundary.

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
