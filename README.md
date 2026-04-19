<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md"><strong>English</strong></a> | <a href="./README.zh-CN.md">中文</a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>A unified workbench and module manager for one-person labs</strong></p>
<p align="center">Research work · Grant writing · Presentation deliverables</p>

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>Who It Serves</strong><br/>
      Clinicians, researchers, PIs, educators, and small teams who want one place for long-running work, file delivery, and specialized workflows
    </td>
    <td width="33%" valign="top">
      <strong>What It Solves</strong><br/>
      How research work keeps moving, how grant packages are organized, how presentation materials are delivered, and how progress stays visible
    </td>
    <td width="33%" valign="top">
      <strong>Current Role</strong><br/>
      `OPL` is the unified workbench that organizes workflows, modules, progress feedback, and deliverable files
    </td>
  </tr>
</table>

<p align="center">
  <img src="assets/branding/opl-architecture-blueprint.svg" alt="OPL architecture blueprint" width="100%" />
</p>

> `OPL` is a unified workbench for a one-person lab. It brings everyday collaboration, specialized workflows, execution visibility, and file delivery into one place.

## What People Use It For

- Discuss ideas, break work into steps, and keep ongoing tasks moving.
- Run research workflows and see recent progress, current status, and produced files.
- Organize grant directions, proposal drafts, revision material, and supporting documents.
- Produce lecture decks, lab talks, reports, defense materials, and other deliverables.
- Manage tasks, files, and installed modules inside the same workspace.

## Current Product Families

| Product family | Current implementation | Best for | Typical deliverables |
| --- | --- | --- | --- |
| `Research Foundry` | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) | Medical research, evidence organization, manuscript preparation | Analysis packages, evidence packages, manuscripts |
| `Grant Foundry` | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | Grant direction setting, proposal writing, author-side revision work | Proposals, outlines, revision packs |
| `Presentation Ops` | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | Lectures, lab talks, reports, defense materials | Slide decks, scripts, presentation packages |
| `Thesis Ops` | Planned | Thesis assembly and defense preparation | Chapter drafts, defense materials |
| `Review Ops` | Planned | Review, rebuttal, and revision work | Review comments, response drafts, revision plans |

## What Lives In One Workbench

| Area | What the user sees | Current status |
| --- | --- | --- |
| Everyday collaboration | Discussion, reading, planning, quick clarification | Default entry |
| General tasks | Multi-step task progress, file handling, result checks | Default execution area |
| Specialized workflows | Research, grant, and presentation product families | Expanding |

## Progress And Files

The workspace side rail should make long-running work easy to follow with clear execution visibility:

- Human-readable progress such as accepted, gathering material, drafting, running, waiting for review, and delivered.
- Task- and workspace-level file organization for reports, decks, tables, and other outputs.
- Recent progress, current status, and produced files in one place so work can be resumed naturally.
- Module status, versioning, upgrades, and installation state from settings.

## OPL In Plain Language

`OPL` owns the unified workbench itself.
Product families define the kind of work, and current implementations carry the specialized capability and delivery surface.

```text
Human
  -> OPL Workspace
      -> Everyday Collaboration
      -> General Tasks
      -> Research Foundry -> Med Auto Science
      -> Grant Foundry -> Med Auto Grant
      -> Presentation Ops -> RedCube AI
      -> Progress / Files / Settings
```

That means:

- `OPL` owns the entry surface, workspace, module catalog, progress feedback, and file-delivery area.
- Product families keep research, grant, presentation, thesis, and review work legible.
- Current implementations carry the real workflow and deliverables for each domain.

## How To Read This Repository

1. Potential users and human experts should start here, then continue to [Roadmap](./docs/roadmap.md), [Task Map](./docs/task-map.md), and [Operating Model](./docs/operating-model.md).
2. Technical readers and planners should continue to [Docs Guide](./docs/README.md), then read [Project](./docs/project.md), [Status](./docs/status.md), [Architecture](./docs/architecture.md), [Invariants](./docs/invariants.md), and [Decisions](./docs/decisions.md).
3. Developers and maintainers should use [Contracts Overview](./contracts/README.md), [Reference Index](./docs/references/README.md), and the tracked records under `docs/specs/`, `docs/plans/`, and `docs/history/omx/`.

<details>
  <summary><strong>Technical Reading Path</strong></summary>

Implementation details, runtime truth, interface boundaries, and historical decisions live in:

- [Docs Guide](./docs/README.md)
- [Project](./docs/project.md)
- [Status](./docs/status.md)
- [Architecture](./docs/architecture.md)

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
