**English** | [中文](./README.zh-CN.md)

# Family Orchestration Contracts

This directory freezes the machine-readable companion schemas for the family-level orchestration surfaces shared across the current active four-repository line: `one-person-lab`, `med-autoscience`, `med-autogrant`, and `redcube-ai`.

These contracts absorb useful orchestration ideas from tools such as `CrewAI` in a contract-first way, but they do not make `CrewAI` a required runtime dependency and they do not replace the existing ownership split:

- `Hermes-Agent` remains an explicit optional hosted/runtime provider adapter direction, not a family default runtime dependency
- `Codex CLI` remains the default family executor name and `autonomous` remains the default route mode
- domain repositories remain the owners of durable truth, audit truth, and review truth

They also absorb the useful `Ageniti` idea of deriving CLI, MCP, Skill, OpenAI, AI SDK, and product-entry descriptors from one app-action definition. OPL adopts that pattern as a family contract, not as a `@ageniti/core` runtime dependency.

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
- `family-action-catalog.schema.json`
  - shared callable-action catalog for action id, owner, effect, input/output schema refs, source command, supported surfaces, human gates, workspace locator fields, and authority boundary
- `family-human-gate.schema.json`
  - shared human-review gate request / decision / resume surface
- `family-product-entry-manifest-v2.schema.json`
  - shared product-entry discovery surface that can point at graphs, action catalogs, gates, resume contracts, runtime continuity companions, repo-owned runtime control projections, and family persistence / lifecycle / owner-route refs

### Control-plane-oriented

- `family-runtime-supervision.schema.json`
  - shared read-only wakeup / supervision projection for adapter id, cadence, last success / tick, lease freshness, SLO state, repair command, safe reconcile hint, domain-owned source refs, and authority boundary
- `family-persistence-policy.schema.json`
  - shared policy that separates `file_authority`, `sqlite_sidecar_index`, `projection_cache`, and `source_provenance_only`
- `family-lifecycle-ledger.schema.json`
  - shared lifecycle receipt surface for dry-run / apply / verify actions, manifest refs, checksums, and restore proof
- `family-owner-route.schema.json`
  - shared owner-route envelope for `route_epoch`, `source_fingerprint`, next owner, allowed actions, idempotency key, and handoff / projection refs

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

For `MAS` v2, the consumable projection anchors are domain-owned `study_charter`, `evidence_ledger`, `review_ledger`, `publication_eval/latest.json`, AI reviewer artifacts, and `StudyTruthKernel` / `RuntimeHealthKernel` or truth health reducers / runtime health reducers. OPL only consumes projections, does not issue MAS ready verdicts, and does not hold publication judgment.

## Persistence / Lifecycle / Owner-Route Freeze

The family-level persistence and lifecycle surfaces are shared control-plane contracts only. They let domain repositories expose durable state roles, lifecycle receipts, and next-owner routing in one shape without moving domain truth into `OPL`.

The shared control surfaces are:

- `family_persistence_policy`
  - marks which surfaces are file authorities, SQLite sidecar indexes, projection caches, or legacy diagnostics
- `family_lifecycle_ledger`
  - records dry-run / apply / verify lifecycle receipts with manifest, checksum, and restore-proof references
- `family_owner_route`
  - records route epoch, source fingerprint, next owner, allowed actions, idempotency key, and handoff / projection refs

`family-product-entry-manifest-v2.schema.json` only adds optional discovery refs for these surfaces. It does not require `MAG` or `RCA` to migrate runtime state into SQLite, and it does not move `MAS` publication evaluation, AI review, paper package, or readiness authority out of `MAS`.

## Runtime Supervision Freeze

`family-runtime-supervision.schema.json` freezes the shared family-level runtime wakeup / supervision projection. It lets `MAS`, `MAG`, `RCA`, and future admitted domains expose one read-only surface for adapter id, cadence, latest tick, latest success, lease freshness, SLO state, repair command, safe reconcile hint, and domain-owned source references.

This surface is not a scheduler contract. `OPL` may discover, export, compare, and project the surface for parity and operator visibility, but it must not become the domain scheduler, session store, memory owner, quality verdict owner, artifact authority, or daemon owner. `repair_command` and `safe_reconcile_hint` are route hints back to the domain-owned repair / supervision surface.

## Action Catalog Freeze

`family-action-catalog.schema.json` is the family callable-action metadata contract. It is intentionally separate from `family-action-graph.schema.json`:

- `family-action-graph` describes workflow topology, gates, and checkpoint policy.
- `family-action-catalog` describes callable actions and the descriptors that can be derived from those actions.

The catalog can project one domain-owned action into:

- CLI command descriptor
- MCP tool catalog descriptor
- Skill command contract descriptor
- product-entry operator-loop action descriptor
- OpenAI function tool descriptor
- AI SDK tool descriptor

OPL owns the schema, TypeScript and Python mirror helpers, manifest discovery, parity checks, and read-only `opl actions list|inspect|export` commands. Domain repositories own the actual handlers, runtime truth, review truth, quality authority, publication or deliverable gates, and any write effects.

`MAG` may expose an MCP-compatible descriptor with `descriptor_only=true` and `public_runtime=false` until a verified public MCP runtime entry exists.

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
  - adopts `family event envelope`, `family checkpoint lineage`, `family human gate`, the full persistence / lifecycle / owner-route reference adapter, and the full action-catalog reference adapter
- `med-autogrant`
  - adopts `family action graph`, `family action catalog`, `family human gate`, `family product-entry manifest v2`, and a light persistence / lifecycle / owner-route adapter over existing runtime-control and grant-progress surfaces
- `redcube-ai`
  - adopts `family product-entry manifest v2` plus the aligned action-catalog / action-graph / gate semantics and a managed-run/session/review projection adapter around operator-loop continuity

## Related Docs

- [Shared Runtime Contract](../../docs/active/shared-runtime-contract.md)
- [Shared Runtime Contract（中文）](../../docs/active/shared-runtime-contract.zh-CN.md)
- [Shared Domain Contract](../../docs/active/shared-domain-contract.md)
- [Shared Domain Contract（中文）](../../docs/active/shared-domain-contract.zh-CN.md)
- [CrewAI absorb note](../../docs/references/runtime-substrate/family-orchestration-contract-absorb-crewai.md)

## Files

- [`family-event-envelope.schema.json`](./family-event-envelope.schema.json)
- [`family-checkpoint-lineage.schema.json`](./family-checkpoint-lineage.schema.json)
- [`family-action-graph.schema.json`](./family-action-graph.schema.json)
- [`family-action-catalog.schema.json`](./family-action-catalog.schema.json)
- [`family-human-gate.schema.json`](./family-human-gate.schema.json)
- [`family-runtime-supervision.schema.json`](./family-runtime-supervision.schema.json)
- [`family-persistence-policy.schema.json`](./family-persistence-policy.schema.json)
- [`family-lifecycle-ledger.schema.json`](./family-lifecycle-ledger.schema.json)
- [`family-owner-route.schema.json`](./family-owner-route.schema.json)
- [`family-product-entry-manifest-v2.schema.json`](./family-product-entry-manifest-v2.schema.json)
