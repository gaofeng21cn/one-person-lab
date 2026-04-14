<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md"><strong>English</strong></a> | <a href="./README.zh-CN.md">中文</a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>The public front door for one-person-lab work across research, grants, review, and presentations</strong></p>
<p align="center">Human Expert Friendly · Domain-Aware · Gateway First</p>

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>Who It Serves</strong><br/>
      Clinicians, researchers, PIs, and small labs who want a clear top-level way to work across multiple expert systems
    </td>
    <td width="33%" valign="top">
      <strong>What It Helps With</strong><br/>
      Research progression, grant writing, review work, and presentation preparation without mixing their boundaries
    </td>
    <td width="33%" valign="top">
      <strong>Public Role</strong><br/>
      `OPL` is the top-level gateway that explains where each workflow lives and how domain systems hand work off cleanly
    </td>
  </tr>
</table>

> `OPL` is the public top-level gateway for a one-person lab. It helps a human expert or agent find the right domain system, preserve handoff boundaries, and keep work understandable across the lab.

## What People Use OPL For

- Start from one public front door instead of learning every repository before asking for help.
- See which workstream belongs to medical research, grant writing, review work, or presentation production.
- Keep shared context reusable across the lab without turning every workflow into one monolithic tool.
- Understand what is already active today and what is still being defined.

## Current Live Paths

| Need | Current path | Status | Notes |
| --- | --- | --- | --- |
| Medical research | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) | Active | Current `Research Ops` carrier |
| Grant writing | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | Active repository line | Top-level federation admission and handoff wording are still separately gated at `OPL` |
| Presentations and visual deliverables | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | Active | Current `Presentation Ops` carrier; `ppt_deck` is the most direct family mapping |
| Thesis preparation | Planned | Not yet admitted | Still being defined as its own domain boundary |
| Review and rebuttal work | Planned | Not yet admitted | Still being defined as its own domain boundary |

## How To Read This Repository

1. Potential users and human experts should start here, then continue to [Roadmap](./docs/roadmap.md), [Task Map](./docs/task-map.md), and [Gateway Federation](./docs/gateway-federation.md).
2. Technical readers and planners should continue to [Docs Guide](./docs/README.md), then read [Project](./docs/project.md), [Status](./docs/status.md), [Architecture](./docs/architecture.md), [Invariants](./docs/invariants.md), and [Decisions](./docs/decisions.md).
3. Developers and maintainers should use [Contracts Overview](./contracts/README.md), [Reference Index](./docs/references/README.md), and the tracked records under `docs/specs/`, `docs/plans/`, and `docs/history/omx/`.

## Plain-Language Architecture

`OPL` is not the same thing as every downstream project.
Its job is to stay above them and route work to the right place.

```text
Human / Agent
  -> OPL Gateway
      -> Domain Gateway
          -> Domain Harness OS
```

In plain language:

- `OPL` explains the top-level workstreams and their boundaries.
- Each domain repository keeps its own domain workflow and delivery truth.
- Shared language can stay aligned across the lab without forcing every domain into one runtime.

## What OPL Is Not

- It is not a single monolithic runtime that should swallow every domain repository.
- It is not a claim that all domain paths are equally mature today.
- It is not a replacement for the domain repositories that actually own research, grant, or presentation delivery truth.

<details>
  <summary><strong>Technical Notes And Current Implementation Truth</strong></summary>

`OPL` keeps the top-level `Gateway / Federation` role, while admitted domain repositories keep domain runtime ownership.

The shared architectural language under `OPL` is the `Unified Harness Engineering Substrate`, with its most important shared pieces converging into the [Shared Runtime Contract](./docs/shared-runtime-contract.md) and the [Shared Domain Contract](./docs/shared-domain-contract.md).

Current top-level entry surfaces already include a local `opl` shell and a local web front desk pilot.
Current family management surfaces include `workspace-catalog`, `workspace-bind|activate|archive`, `domain-manifests`, `session-ledger`, and `dashboard`.
`workspace-bind` can now derive family `entry_command` plus `manifest_command` from structured workspace locators such as `--profile`, `--input`, and `--workspace-root`, instead of forcing every project onto handwritten raw commands.

Current family state is intentionally uneven and should be described honestly:

- `Med Auto Science` is the active medical `Research Ops` carrier and is still in transitional runtime alignment.
- `Med Auto Grant` is the active medical `Grant Ops` repository line and already runs on a real upstream `Hermes-Agent` substrate, while top-level admission and handoff wording remain separately gated at `OPL`.
- `RedCube AI` is the active visual-deliverable carrier and currently runs its delivery mainline on local `Codex CLI` host-agent runtime.

If you need the full technical reading path, continue to the [Docs Guide](./docs/README.md).
</details>

## Further Reading

- [Roadmap](./docs/roadmap.md)
- [Task Map](./docs/task-map.md)
- [Gateway Federation](./docs/gateway-federation.md)
- [Operating Model](./docs/operating-model.md)
- [Unified Harness Engineering Substrate](./docs/unified-harness-engineering-substrate.md)
- [Docs Guide](./docs/README.md)
- [Project](./docs/project.md)
- [Status](./docs/status.md)
- [Contracts Overview](./contracts/README.md)
