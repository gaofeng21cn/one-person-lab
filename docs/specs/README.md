# Active And Retained Specs

Status: `spec_index`
Owner: `One Person Lab`
Machine boundary: human-readable index only; machine-readable behavior must use contracts, schemas, source, CLI/API behavior, runtime ledgers, generated artifacts, or semantic `human_doc:*` ids.

This directory is intentionally small. It holds path-stable runtime / product-boundary design documents that are still useful during maintenance, even when their active content has been absorbed into newer owner surfaces.

Current truth starts in:

- [Docs Guide](../README.md)
- [Project](../project.md)
- [Status](../status.md)
- [Architecture](../architecture.md)
- [Invariants](../invariants.md)
- [Decisions](../decisions.md)
- [Documentation Portfolio](../docs_portfolio_consolidation.md)
- [OPL stage-led agent framework roadmap](../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md)

## Contents

| File | Lifecycle state | Current owner | Reading rule |
| --- | --- | --- | --- |
| `2026-04-20-opl-product-api-and-domain-agent-boundary-design.md` | `support_reference_retained_path` | Core five plus the stage-led framework roadmap | The eight-resource product model was absorbed. Do not revive the historical local Product API service, `frontdoor`, or `opl web` as the current user entry. |
| `2026-04-21-opl-acp-native-runtime-and-shell-projection-design.md` | `support_reference_retained_path` | Core five plus the stage-led framework roadmap | The session-runtime-first pivot was absorbed. ACP/Product API language is projection support unless current contracts restate it. |

## Admission Rule

New active specs belong here only when they still define the current runtime or product boundary and cannot be better represented by the core five, `docs/active/`, `docs/references/`, or machine-readable contracts.

When a spec is completed, absorbed, or replaced, either move it to `docs/history/process/specs/` or mark it here as a retained path with a current owner and explicit reading rule.
