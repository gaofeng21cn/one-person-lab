**English** | [中文](./README.zh-CN.md)

# Family Orchestration Contracts

This directory freezes the machine-readable companion schemas for the family-level orchestration surfaces shared across the current active four-repository line: `one-person-lab`, `med-autoscience`, `med-autogrant`, and `redcube-ai`.

These contracts absorb useful orchestration ideas from tools such as `CrewAI` in a contract-first way, but they do not make `CrewAI` a required runtime dependency and they do not replace the existing ownership split:

- `Hermes-Agent` remains an external runtime substrate direction
- `Codex CLI` remains the default family executor name and `autonomous` remains the default route mode
- domain repositories remain the owners of durable truth, audit truth, and review truth

## Ownership Boundary

`one-person-lab` owns:

- the top-level contract language
- schema naming and indexing
- cross-domain reuse rules

Domain repositories continue to own:

- actual runtime event emission
- actual checkpoint materialization
- actual action-graph semantics
- actual human-review surfaces
- actual product-entry truth

These schemas therefore freeze interoperability surfaces, not a monolithic runtime implementation.

## Current Companion Contract Set

### Runtime-oriented

- `family-event-envelope.schema.json`
  - shared event correlation, producer, session, and audit-reference envelope
- `family-checkpoint-lineage.schema.json`
  - shared checkpoint ancestry, resume, and state-reference envelope

### Domain-oriented

- `family-action-graph.schema.json`
  - shared action-graph topology, node, edge, human-gate, and checkpoint-policy surface
- `family-human-gate.schema.json`
  - shared human-review gate request / decision / resume surface
- `family-product-entry-manifest-v2.schema.json`
  - shared product-entry discovery surface that can point at graphs, gates, resume contracts, runtime continuity companions, and repo-owned runtime control projections

## Runtime Continuity Freeze

`family-product-entry-manifest-v2.schema.json` now freezes the shared runtime continuity discovery layer that `OPL` consumes across the three domain repositories.

The shared family-level surface names are:

- `runtime_inventory`
- `task_lifecycle`
- `session_continuity`
- `progress_projection`
- `artifact_inventory`

The shared control references that close the loop are:

- `runtime_control`
- `runtime_loop_closure`
- a repo-owned `research_runtime_control_projection` companion carried inside a shared projection surface

This means `OPL` can keep consuming one family contract for session / progress / artifact / restore-point continuity, while each domain repository still owns the underlying runtime truth and any extra repo-specific projection fields.

## What This Directory Does Not Freeze

This directory does not:

- standardize one LLM wrapper
- standardize one `Crew` / `Agent` / `Memory` runtime object model
- pin a specific model family
- redefine `OPL` as the runtime owner of domain-owned truth
- imply cross-repo runtime-core ingest has already happened

## Intended Adoption Path

- `one-person-lab`
  - publishes the contract language, schemas, and reference wording
- `med-autoscience`
  - adopts `family event envelope`, `family checkpoint lineage`, and `family human gate`
- `med-autogrant`
  - adopts `family action graph`, `family human gate`, and `family product-entry manifest v2`
- `redcube-ai`
  - adopts `family product-entry manifest v2` plus the aligned action-graph / gate semantics around operator-loop continuity

## Related Docs

- [Shared Runtime Contract](../../docs/shared-runtime-contract.md)
- [Shared Runtime Contract（中文）](../../docs/shared-runtime-contract.zh-CN.md)
- [Shared Domain Contract](../../docs/shared-domain-contract.md)
- [Shared Domain Contract（中文）](../../docs/shared-domain-contract.zh-CN.md)
- [CrewAI absorb note](../../docs/references/family-orchestration-contract-absorb-crewai.md)

## Files

- [`family-event-envelope.schema.json`](./family-event-envelope.schema.json)
- [`family-checkpoint-lineage.schema.json`](./family-checkpoint-lineage.schema.json)
- [`family-action-graph.schema.json`](./family-action-graph.schema.json)
- [`family-human-gate.schema.json`](./family-human-gate.schema.json)
- [`family-product-entry-manifest-v2.schema.json`](./family-product-entry-manifest-v2.schema.json)
