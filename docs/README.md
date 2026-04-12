**English** | [中文](./README.zh-CN.md)

# OPL Docs Index

This directory carries the public and repo-tracked documents for `One Person Lab`.
To keep the public surface stable while still giving AI and maintainers a compact working set, `OPL` now uses two simultaneous views:

1. a fixed AI / maintainer core working set
2. the public four-layer documentation system

If you only need the current public truth and active mainline, stop at the core working set plus Layers 1 and 2.
Layer 3 should now be entered through the dedicated [reference index](./references/README.md) instead of being treated as a flat default reading path.

## AI / Maintainer Core Working Set

These are the first files an AI or maintainer should read before touching the repository state:

- [Project](./project.md)
- [Status](./status.md)
- [Architecture](./architecture.md)
- [Invariants](./invariants.md)
- [Decisions](./decisions.md)
- [Contracts overview](../contracts/README.md)

## Current Baseline And Task Ladder

- Current baseline: `OPL` is the top-level gateway / federation / shared substrate contract surface, while domain runtime ownership stays with the admitted domain repositories.
- Current focus: truth reset, central sync, surface-authority convergence, and admitted-domain state alignment.
- Current truth: the family is no longer at one uniform integration depth. `Med Auto Grant` has landed a real upstream `Hermes-Agent` substrate, `Med Auto Science` has completed external runtime bring-up and is entering real adapter cutover, `RedCube AI` remains in upstream pilot prep, and `OPL` now owns a local direct product-entry shell above the top-level gateway.
- Current product-entry truth: `OPL` now exposes a local direct product-entry shell through `opl doctor`, `opl ask`, and `opl chat`, backed by an external Hermes kernel. Hosted / web entry is still not landed.
- Family product-entry truth: product-entry maturity is still uneven across the four repositories. `OPL` now has a family-level local shell, while the domain repositories still mostly expose operator / agent entry surfaces and need further lightweight direct-entry hardening.
- Frozen integration choice: `Hermes Kernel Integration` follows `external kernel, managed by OPL product packaging` rather than a long-term fork or a user-managed Hermes prerequisite.
- Long-line target: move the shared runtime layer toward upstream `Hermes-Agent` (or an explicitly approved equivalent substrate) while keeping `OPL` as the top-level coordination, discovery, and contract layer.
- Historical execution surface: OMX is retired and survives only as migration / audit reference material.

## Layer 1. Default Public Mainline

These are the first documents a human expert should read to understand what `OPL` is today.
They are part of the default public storyline and must stay bilingual.

- [Repository Home](../README.md)
- [Roadmap](./roadmap.md)
- [Task Map](./task-map.md)
- [Gateway Federation](./gateway-federation.md)
- [Operating Model](./operating-model.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.md)

## Layer 2. Public Contract And Gateway Companion Docs

These documents are still public and bilingual, but they are more technical.
They define gateway semantics, shared-foundation boundaries, and formal contract surfaces rather than the first-reading narrative.

- [OPL Federation Contract](./opl-federation-contract.md)
- [Shared Foundation](./shared-foundation.md)
- [Shared Foundation Ownership](./shared-foundation-ownership.md)
- [Shared Runtime Contract](./shared-runtime-contract.md)
- [Shared Domain Contract](./shared-domain-contract.md)
- [OPL Runtime Naming And Boundary Contract](./opl-runtime-naming-and-boundary-contract.md)
- [OPL Read-Only Discovery Gateway](./opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md)
- [OPL Public Surface Index](./opl-public-surface-index.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)

## Layer 3. Reference-Grade Supporting Docs

These documents stay repo-tracked and serve review, acceptance, indexing, examples, or boundary inspection.
The main storyline continues to live in the core working set plus Layers 1 and 2.
All Layer 3 docs now live under `docs/references/`, with a dedicated index so the docs root stays readable.

### Default entry

- [Reference index](./references/README.md)
- `references/contract-convergence-v1-execution-board.md` (Chinese-only internal reference)
- `references/ecosystem-status-matrix.md` (Chinese-only internal reference)
- `references/hermes-agent-runtime-substrate-benchmark.md` (Chinese-only internal reference)
- `references/hermes-agent-truth-reset-and-target-state.md` (Chinese-only internal reference)
- `references/family-product-entry-and-domain-handoff-architecture.md` (Chinese-only internal reference)
- `references/opl-product-entry-and-hermes-kernel-integration.md` (Chinese-only internal reference)
- `references/opl-phase-2-central-reference-sync-board.md` (Chinese-only internal reference)
- `references/opl-phase-2-admitted-domain-delta-intake-refresh.md` (Chinese-only internal reference)

### Common reference bundles

- `references/opl-gateway-rollout*`
- `references/opl-gateway-acceptance-test-spec*`
- `references/opl-candidate-domain-backlog*`
- `references/opl-candidate-workstream-tranche-closeout*`
- `references/opl-surface-lifecycle-map*`
- `references/opl-surface-authority-matrix*`
- `references/opl-surface-review-matrix*`
- `references/opl-governance-audit-operating-surface*`
- `references/opl-publish-promotion-operating-surface*`
- `references/opl-gateway-example-corpus*`
- `references/opl-routed-safety-example-corpus*`
- `references/opl-operating-example-corpus*`
- `references/opl-operating-record-catalog*`
- `references/managed-runtime-migration-readiness-checklist.md` (Chinese-only internal reference)
- `references/contract-convergence-v1-decision-note.md` (Chinese-only internal reference)
- `references/opl-phase2-ecosystem-sync-owner-line.md` (Chinese-only internal reference)
- `references/opl-vertical-online-agent-platform-roadmap.md` (Chinese-only internal reference)

### Historical migration archives

- [OMX historical archive](history/omx/README.md) (historical reference only)
- `references/development-operating-model.md` (Chinese-only historical migration reference)
- `references/runtime-alignment-taskboard.md` (Chinese-only historical migration reference)

## Layer 4. Historical Specs And Plans

These are internal design and planning records.
They explain why a freeze happened, but they are not the living truth surface for the current repository state.

- `docs/specs/`
- `docs/plans/`

## Documentation Rules

- The AI / maintainer core working set exists to answer project goal, current state, boundaries, and key decisions quickly without forcing readers through the entire public surface.
- Layers 1 and 2 are public surfaces, so every document there must have synchronized English `.md` and Chinese `.zh-CN.md` mirrors.
- Layer 3 may remain public or repo-tracked, but it is always reference-grade and must not crowd the default reading path in the root README or `docs/README*`.
- Historical migration references stay readable, but they must never be presented as the default current workflow.
- Historical runbooks, prompt templates, and worktree discipline for the retired execution surface must now be entered only through `docs/history/omx/`.
- Layer 4 is internal working history and should default to Chinese-only unless there is an explicit reason to publish a bilingual mirror.
- Avoid unnecessary mixed-language prose: keep narrative in one language, and reserve English for fixed terms, file paths, command names, schemas, and code identifiers.

## Governance

- Documentation governance lives in [AGENTS.md](../AGENTS.md) and the core maintainer working set.
