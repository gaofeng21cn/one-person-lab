# Runtime Substrate History Archive

**English** | [中文](./README.zh-CN.md)

Status: `historical_archive`
Owner: `One Person Lab`
Machine boundary: human-readable history archive only. Machine-readable behavior must use `contracts/`, source code, CLI/API behavior, runtime ledgers, provider receipts, domain-owned manifests, or semantic `human_doc:*` ids.

This directory contains runtime / product-entry / migration documents whose useful content has been absorbed or superseded by the 2026-05-11 framework-first reset. They remain useful provenance, but they are no longer current backlog, roadmap, runtime contract, or product-entry plans.

Current entries:

- [OPL Current Development Lines](../../active/current-development-lines.md)
- [OPL Development Document Portfolio](../../active/development-document-portfolio.md)
- [OPL Runtime Naming And Boundary Contract](../../active/opl-runtime-naming-and-boundary-contract.md)
- [OPL Domain-Agent Admission Contract](../../active/opl-domain-onboarding-contract.md)
- [OPL stage-led agent framework roadmap](../../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md)
- [Temporal family runtime provider plan](../../references/runtime-substrate/temporal-family-runtime-provider-plan.zh-CN.md)

## Absorbed Content

| Historical document | Absorbed content | Current owner |
| --- | --- | --- |
| `host-agent-runtime-contract.md` | Codex-default host-agent runtime, formal-entry matrix, execution handles, durable truth, fail-closed rules | Runtime naming and boundary contract, Domain-Agent Admission Contract, family executor defaults |
| `managed-runtime-migration-readiness-checklist.md` | host-agent -> managed runtime migration object, R1-R8 readiness dimensions, and the rule not to present future managed runtime as current reality | Runtime naming and boundary contract |
| `family-product-entry-and-domain-handoff-architecture.md` | operator / agent / product entry taxonomy, handoff envelope, domain authority boundary | Domain-Agent Admission Contract, public docs, current development lines |
| `family-lightweight-direct-entry-rollout-board.md` | `frontdoor_surface` / `operator_loop_surface` split, direct path and OPL handoff alignment, and no drift across domain entry vocabularies | Domain-Agent Admission Contract, current development lines |
| `opl-product-entry-and-hermes-kernel-integration.md` | no fork/vendor of an external runtime, do not expose users to low-level runtime assembly, and Hermes-first miswording prohibitions | Runtime naming and boundary contract, Temporal provider plan, stage-led roadmap |
| `opl-vertical-online-agent-platform-roadmap.md` | vertical product family, shared runtime/domain contracts, and future managed runtime vs current reality split | Runtime naming and boundary contract, public roadmap, stage-led roadmap |
| `mas-top-level-cutover-board.md` | OPL -> MAS handoff fields, MAS display/research separation, and transition-seam honesty | OPL current development lines, MAS program portfolio/current development lines |

## Tombstone Rules

- Hermes-first, Gateway/frontdoor, direct-entry, host-agent-only, and online-agent-platform plans in these files are no longer executed as whole documents.
- Useful content has been absorbed into current owners; reuse current owners first instead of copying historical prose.
- Old filenames, commands, and states in these paths are provenance, migration review, and audit material only.
- If a historical paragraph becomes current again, promote it to an active owner or machine-readable contract before citing the historical source.
