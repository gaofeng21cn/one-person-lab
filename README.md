<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md"><strong>English</strong></a> | <a href="./README.zh-CN.md">中文</a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>A family gateway and headless adapter for one-person labs</strong></p>
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
      `OPL` tracks the contract-first family gateway, module catalog, and headless adapter/API surfaces behind the one-person-lab product surface
    </td>
  </tr>
</table>

<p align="center">
  <img src="assets/branding/opl-workbench-overview.svg" alt="OPL workbench overview" width="100%" />
</p>

> `OPL` keeps family entry, progress surfaces, module catalog, and domain handoff contracts aligned. External overlays or the CLI consume these surfaces, while domain repositories own specialized runtime and deliverables.

## What People Use It For

- Start research, grant, and presentation work from one family-level entry.
- See recent progress, current status, produced files, and module state through shared adapter surfaces.
- Keep grant packages, proposal drafts, lecture decks, and other deliverables routed through the same family gateway.
- Hand off into domain products without losing family-level context.
- Track module installs, upgrades, and workspace bindings across the same product surface.

## Current Product Families

| Product family | Current implementation | Best for | Typical deliverables |
| --- | --- | --- | --- |
| `Research Foundry` | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) | Medical research, evidence organization, manuscript preparation | Analysis packages, evidence packages, manuscripts |
| `Grant Foundry` | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | Grant direction setting, proposal writing, author-side revision work | Proposals, outlines, revision packs |
| `Presentation Foundry` | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | Lectures, lab talks, reports, defense materials | Slide decks, scripts, presentation packages |
| `Thesis Foundry` | Planned | Thesis assembly and defense preparation | Chapter drafts, defense materials |
| `Review Foundry` | Planned | Review, rebuttal, and revision work | Review comments, response drafts, revision plans |

## What OPL Connects

| Area | What the user sees | Current status |
| --- | --- | --- |
| Family entry and routing | External GUI overlays or the CLI start work, pick a family, and hand off into domain products | Default public entry |
| Progress and file surfaces | Shared adapter/API surfaces expose status, deliverables, session context, and module health | Repo-tracked headless truth |
| Specialized workflows | Research, grant, and presentation product families route into domain-owned implementations | Active |

## Progress, Files, And Modules

The repo-tracked adapter surfaces keep long-running work legible:

- Human-readable progress such as accepted, gathering material, drafting, running, waiting for review, and delivered.
- Task- and workspace-level file organization for reports, decks, tables, and other outputs.
- Recent progress, current status, and produced files in one place so work can be resumed naturally.
- Module status, versioning, upgrades, and installation state from the same family surfaces.
- External overlays can project the same surfaces into richer GUI shells without changing repo-tracked truth.

## OPL In Plain Language

`OPL` tracks the family gateway and headless truth surfaces.
External overlays or the CLI provide the user-facing shell, and current implementations carry domain runtime and deliverables.

```text
Human / External GUI Overlay / CLI
  -> OPL Family Gateway + Headless Adapter
      -> Research Foundry -> Med Auto Science
      -> Grant Foundry -> Med Auto Grant
      -> Presentation Foundry -> RedCube AI
      -> Progress / Files / Modules / Session Surfaces
```

That means:

- This repo tracks the family gateway, module catalog, progress/file/session surfaces, and machine-readable contracts.
- External GUI overlays consume the same adapter/API surfaces when a richer shell is needed.
- Current implementations own domain product entry, runtime, and deliverables.

## How To Read This Repository

1. Potential users and human experts should start here, then continue to [Roadmap](./docs/roadmap.md), [Task Map](./docs/task-map.md), and [Operating Model](./docs/operating-model.md).
2. Technical readers and planners should continue to [Docs Guide](./docs/README.md), then read [Project](./docs/project.md), [Status](./docs/status.md), [Architecture](./docs/architecture.md), [Invariants](./docs/invariants.md), and [Decisions](./docs/decisions.md).
3. Developers and maintainers should use [Contracts Overview](./contracts/README.md), [Reference Index](./docs/references/README.md), and the tracked records under `docs/specs/`, `docs/plans/`, and [History Archive](./docs/history/README.md).

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
