<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md"><strong>English</strong></a> | <a href="./README.zh-CN.md">中文</a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>A Codex-default session runtime and unified workbench for research, grant, and presentation work</strong></p>
<p align="center">Start work through Codex-default sessions, activate domain agents when needed, and let optional shells share the same runtime truth</p>

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

## Fast Start On A New Mac

Use this path when you want OPL, its runtime dependencies, the active domain agents, and the OPL GUI prepared in one pass.

For a human user:

```bash
git clone https://github.com/gaofeng21cn/one-person-lab.git
cd one-person-lab
npm install
npm link
opl install
```

Then open the user-facing entry:

```bash
open /Applications/OPL.app
```

If the OPL desktop app is not installed yet, use the web entry while the branded GUI package is being prepared:

```bash
open http://127.0.0.1:8787/
```

What `opl install` is responsible for:

- Install or configure the required runtime dependencies: `Codex CLI` and `Hermes-Agent`.
- Install the active family modules: `MAS`, `MAG`, and `RCA`.
- Sync short Codex skills so `MAS`, `MAG`, and `RCA` can be called directly from Codex or through OPL.
- Install and open the local OPL Product API service.
- Open the installed OPL-branded desktop GUI when `/Applications/OPL.app` is present.
- If the OPL GUI is missing, report the matching `opl-aion-shell` OPL release package or source-build fallback.

For an Agent in Codex, the intended instruction is:

> Install and configure this OPL repo on this Mac. Clone the repo if needed, install the OPL CLI, run `opl install`, ensure Codex CLI and Hermes-Agent are installed, install MAS/MAG/RCA, sync their skills, start the local Product API service, and open the OPL GUI or report the exact missing GUI release/build step.

The OPL GUI is an OPL-branded shell built from `opl-aion-shell` on top of the AionUI codebase. The upstream AionUI application is not itself the OPL GUI.

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

This repository is the OPL product/runtime gateway, not the GUI shell and not a domain-agent implementation. It tracks:

- The Codex-default session/runtime path used by `opl`, direct Codex usage, and external shells.
- The activation layer that makes `MAS`, `MAG`, and `RCA` callable as short skills.
- Module installation, skill sync, service setup, and health surfaces.
- Workspace, session, progress, and artifact discovery surfaces.
- Machine-readable contracts for the shared product layer.

The desktop GUI is maintained by [`opl-aion-shell`](https://github.com/gaofeng21cn/opl-aion-shell) as an OPL-branded shell built on the AionUI codebase. OPL provides the local Product API and runtime truth consumed by that GUI, by the web entry, and by Codex.

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
- The active interaction route is Codex-default first: local `opl`, direct `Codex` usage, and future external shells all consume the same session/runtime truth. `opl skill sync` now auto-discovers sibling family repositories from the workspace layout by default, so local worktrees no longer need `OPL_FAMILY_WORKSPACE_ROOT` just to surface the family skill packs inside Codex.
- The shortest first-run command is `opl install`. It installs/configures `Codex CLI` and `Hermes-Agent`, installs the default family modules (`MAS`, `MAG`, `RCA`), syncs their Codex skills, installs/opens the local Product API service, and only opens an installed OPL-branded desktop app; upstream AionUI is not treated as the OPL GUI.
- If one of the admitted domain repositories is not present yet, run `opl module install --module <module_id>`. The install path is now a turnkey loop: clone into the OPL-managed modules root, run the repo-specific bootstrap, sync the matching Codex skill pack, then finish with a repo health check.
- For a first-run install surface, run `opl system initialize`. It exposes runtime dependencies, domain modules, the recommended companion skill bundle (`superpowers`, `officecli`, and native Office skills when present), and the OPL-branded GUI shell strategy in one machine-readable payload.
- GUI packaging is owned by the sibling `opl-aion-shell` repository. A valid prebuilt GUI package means an OPL-branded Electron-builder release asset uploaded to GitHub Releases (`.dmg`, `.exe`, or `.deb`) plus updater metadata (`latest*.yml`); source build is the fallback when no asset matches the local platform and architecture.
- The default local state directory is `~/Library/Application Support/OPL/state`. Override it with `OPL_STATE_DIR` when you need a non-default local state root.
- The current active domain agents are [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience), [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant), and [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai). They expose stable capability surfaces as local CLIs, programs/scripts, and repo-tracked contracts; continue into [Status](./docs/status.md), [Architecture](./docs/architecture.md), and the [OPL Public Surface Index](./docs/opl-public-surface-index.md) to recover the family mapping and public entry surfaces.
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
