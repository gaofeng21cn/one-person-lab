# Active Specs

Status: `spec_index`
Owner: `One Person Lab`
Machine boundary: human-readable index only; machine-readable behavior must use contracts, schemas, source, CLI/API behavior, runtime ledgers, generated artifacts, or semantic `human_doc:*` ids.

This directory is intentionally small. It only holds active specs that still define the current runtime or product boundary.

Current truth starts in:

- [Docs Guide](../README.md)
- [Project](../project.md)
- [Status](../status.md)
- [Architecture](../architecture.md)
- [Invariants](../invariants.md)
- [Decisions](../decisions.md)
- [OPL Current Development Lines](../active/current-development-lines.md)
- [OPL Development Document Portfolio](../active/development-document-portfolio.md)
- [OPL stage-led agent framework roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md)

## Contents

| File | Lifecycle state | Current owner | Reading rule |
| --- | --- | --- | --- |
| No active specs currently live here | `empty_active_spec_set` | Core five, `docs/active/`, runtime-substrate roadmap, and machine-readable contracts | Do not revive Product API / ACP / frontdoor semantics from old specs; historical specs start in the [process specs archive](../history/process/specs/). |

## Admission Rule

New active specs belong here only when they still define the current runtime or product boundary and cannot be better represented by the core five, `docs/active/`, `docs/references/`, or machine-readable contracts.

When a spec is completed, absorbed, or replaced, move it to `docs/history/process/specs/` with the current owner and archive reason.
