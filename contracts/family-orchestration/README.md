**English** | [中文](./README.zh-CN.md)

# Family Orchestration Contracts

This directory freezes the machine-readable companion schemas for the family-level orchestration surfaces shared across the current active four-repository line: `one-person-lab`, `med-autoscience`, `med-autogrant`, and `redcube-ai`.

These contracts absorb useful orchestration ideas from tools such as `CrewAI` in a contract-first way, but they do not make `CrewAI` a required runtime dependency and they do not replace the existing ownership split:

- Hermes provider/readiness/compatibility semantics are limited to historical provenance, reference material, diagnostic vocabulary, or a negative guard; `hermes_agent` remains available only as an explicit non-default executor adapter with independent receipt, audit, and fail-closed gates; Temporal is the required online runtime substrate for Full readiness and durable orchestration, while local providers are dev/CI/offline diagnostics only
- `Codex CLI` remains the default concrete executor name and `autonomous` remains the default route mode unless a domain route explicitly selects another executor
- `one-person-lab` owns the typed family queue and product control plane over the Temporal-backed family runtime provider, not a replacement runtime kernel
- domain repositories remain the owners of durable truth, audit truth, and review truth

They also absorb the useful `Ageniti` idea of deriving CLI, MCP, Skill, OpenAI, AI SDK, and product-entry descriptors from one app-action definition. OPL adopts that pattern as a family contract, not as a `@ageniti/core` runtime dependency.

## Ownership Boundary

`one-person-lab` owns:

- the top-level contract language
- schema naming and indexing
- cross-domain reuse rules

Domain repositories continue to own:

- actual domain dispatch acceptance or rejection
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
- `family-stage-control-plane.schema.json`
  - shared stage descriptor companion for stage goal, domain stage refs, skill / prompt / evaluation refs, handoff refs, and authority boundary
- `family-domain-memory-ref.schema.json`
  - locator-only reference for domain-owned memory packs, including memory family, pack ref, stage applicability, retrieval/writeback/receipt/recall refs, freshness, and forbidden OPL authority
- `family-domain-memory-writeback.schema.json`
  - proposal / receipt shape for stage closeout writeback into a domain memory router; OPL carries proposal and receipt refs only, while the domain router accepts or rejects the write
- `family-human-gate.schema.json`
  - shared human-review gate request / decision / resume surface
- `family-product-entry-manifest-v2.schema.json`
  - shared product-entry discovery surface that can point at graphs, action catalogs, domain memory descriptors, gates, resume contracts, runtime continuity companions, repo-owned runtime control projections, and family persistence / lifecycle / owner-route refs

### Control-plane-oriented

- `../opl-framework/family-runtime-online-substrate-contract.json`
  - provider-backed family runtime contract; the active Full-readiness substrate is the Temporal-backed provider, `local_sqlite` is dev/CI/offline diagnostics only, and Hermes is not a provider
- `family-runtime-supervision.schema.json`
  - shared read-only wakeup / supervision projection for adapter id, cadence, last success / tick, lease freshness, SLO state, repair command, safe reconcile hint, domain-owned source refs, and authority boundary
- `family-persistence-policy.schema.json`
  - shared policy that separates `file_authority`, `sqlite_sidecar_index`, `projection_cache`, and `source_provenance_only`
- `family-lifecycle-ledger.schema.json`
  - shared lifecycle receipt surface for dry-run / apply / verify actions, manifest refs, checksums, and restore proof
- `family-owner-route.schema.json`
  - shared owner-route envelope for `route_epoch`, `source_fingerprint`, next owner, allowed actions, idempotency key, and handoff / projection refs
- `family-conflict-envelope.schema.json`
  - shared Conflict / Blocker Envelope for duplicate tasks, owner conflicts, evidence blockers, quality blockers, human gates, retry/dead-letter, incomplete identity, and closeout receipt conflicts; OPL routes, projects, and audits fail-closed while domain agents keep ready / quality / artifact verdict authority

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

## Unified Domain-Agent Descriptor Read Model

`opl agents descriptors --json` and `opl agents descriptor --domain <domain> --json` are the unified machine-readable entry points for admitted domain agents. They do not add another schema family; they aggregate the manifest surfaces already frozen in this directory and in `contracts/opl-framework/standard-domain-agent-skeleton-contract.json`:

- `domain_agent_entry_spec`
- `standard_domain_agent_skeleton`
- `family_action_catalog`
- `family_stage_control_plane`
- `family_transition_spec` / `family_transition_matrix_cases` / `family_transition_spec_descriptor`
- `domain_memory_descriptor`
- `skill_catalog`
- `runtime_inventory` / `session_continuity` / `progress_projection` / `artifact_inventory`
- `descriptor_refs`, parity, readiness, and authority boundaries

This read model is for CLI/App discovery, maintainer inspection, admission gates, and operator drilldown. It carries only refs, status, locators, parity, and forbidden-authority flags. It does not carry memory body text, long prompt/skill bodies, domain route judgments, quality verdicts, publication/fundability/visual verdicts, or artifact authority.

For MAS, this means `mas_publication_route_memory` can be discovered as a `domain_memory_descriptor` through the unified descriptor, while the actual paper-route memory body remains Markdown-first in MAS. OPL only routes operators and agents to the right refs.

`family_transition_spec` and `family_transition_matrix_cases` are the machine entry points for domain-declared transitions. `OPL` may run the matrix runner and emit transition receipt/projection, fail-closed blocker, or dead-letter envelopes. If a domain manifest exposes only `family_transition_spec_descriptor`, the unified descriptor reports `descriptor_only` / `refresh_required` plus locator refs rather than inventing a complete spec. Domain repositories still own the transition table, guards/oracle fixtures, owner actions, quality verdicts, artifact authority, and owner receipts.

## Persistence / Lifecycle / Owner-Route Freeze

The family-level persistence and lifecycle surfaces are shared control-plane contracts only. They let domain repositories expose durable state roles, lifecycle receipts, and next-owner routing in one shape without moving domain truth into `OPL`.

The shared control surfaces are:

- `family_persistence_policy`
  - marks which surfaces are file authorities, SQLite sidecar indexes, projection caches, or legacy diagnostics
- `family_lifecycle_ledger`
  - records dry-run / apply / verify lifecycle receipts with manifest, checksum, and restore-proof references
- `family_owner_route`
  - records route epoch, source fingerprint, next owner, allowed actions, idempotency key, and handoff / projection refs

`family-product-entry-manifest-v2.schema.json` only adds optional discovery refs for these surfaces. Stage attempt query now also projects a locator-only lifecycle primitive: workspace/runtime/artifact roots, indexed closeout or consumed refs, declared restore refs, and the cleanup gate. That projection is intentionally read-only; `OPL` may index refs and show missing restore proof, but it cannot apply retention, delete artifacts, restore workspace contents, or write domain truth. It does not require `MAG` or `RCA` to migrate runtime state into SQLite, and it does not move `MAS` publication evaluation, AI review, paper package, or readiness authority out of `MAS`. Likewise, `domain_memory_descriptor` exposes locator / freshness / receipt refs only; it does not move memory content or writeback authority into `OPL`.

`family-runtime-lifecycle-index` is the OPL-owned refs-only SQLite sidecar index for this boundary. It may record domain id, surface id, source ref, receipt ref, checksum, and opaque payload refs under the OPL state root. It is not a domain truth store, memory body store, quality verdict store, artifact authority, or package/export readiness store. MAS-style runtime lifecycle SQLite implementations must be classified as domain sidecar reference adapters or file-authority refs once this replacement exists; domain repositories must not claim long-term ownership of a generic persistence engine.

`functional_privatization_audit` is the OPL-owned read model that normalizes domain-declared non-knowledge functional modules. OPL accepts the repo-local shapes used by MAS (`functional_consumer_boundary`), MAG (`mag_consumer_thinning_contract.privatized_functional_module_audit`), RCA (`runtime_framework.rca_thin_surface_policy.privatized_functional_module_audit`), and the standard scaffold (`functional_privatization_audit`). Each module is classified as `opl_owned_replacement`, `domain_thin_adapter`, `domain_authority`, or `retire_tombstone`; blockers are raised when a domain claims generic runtime ownership or production soak beyond the evidence.

## Conflict / Blocker Envelope Freeze

`family-conflict-envelope.schema.json` is the single blocker and conflict vocabulary for queue, stage attempt, closeout, and App/operator projection. Anything that cannot continue, cannot confirm completion, or has conflicting claims is projected as `kind=opl_conflict_or_blocker.v1` rather than letting each layer invent local status terms.

The canonical classifications are `duplicate_task`, `authority_conflict`, `evidence_blocker`, `quality_blocker`, `human_gate`, `execution_retryable`, `identity_incomplete`, and `receipt_conflict`. Attempt outcomes are projected into the small set `completed_with_receipt`, `blocked`, `waiting_for_human`, `retry_scheduled`, `dead_lettered`, and `conflict_fail_closed`.

`provider completed` and `executor completed` mean only that the runtime substrate or selected executor finished. Domain progress still requires a domain owner receipt / accepted verdict. App/operator surfaces consume `operator_conflicts[]` directly and show whether the task is a duplicate, what is blocked, who owns resolution, whether retry is available, and what user action is needed.

## Runtime Supervision Freeze

`family-runtime-supervision.schema.json` freezes the shared family-level runtime wakeup / supervision projection. It lets `MAS`, `MAG`, `RCA`, and future admitted domains expose one read-only surface for adapter id, cadence, latest tick, latest success, lease freshness, SLO state, repair command, safe reconcile hint, and domain-owned source references.

This surface is not a domain scheduler contract. The configured family runtime provider supplies the OPL-managed online wakeup / queue / attempt substrate; `OPL` may discover, export, compare, enqueue, tick, and project the surface for parity and operator visibility, but it must not become the domain scheduler, session store, memory owner, quality verdict owner, or artifact authority. `repair_command` and `safe_reconcile_hint` are route hints back to the domain-owned repair / supervision surface.

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

## Stage Control Plane Freeze

`family-stage-control-plane.schema.json` is the family stage descriptor companion raised from the MAS Stage-Led Autonomy experience. It is intentionally a descriptor and projection surface, not a workflow engine.

The contract records stage goal, domain-owned stage refs, input/output refs, knowledge refs, skill refs, prompt refs, evaluation refs, handoff metadata, allowed action refs, and authority boundaries. `OPL` owns schema, manifest discovery, parity checks, and read-only `opl stages list|inspect` commands. Domain repositories continue to own their actual route contracts, stage execution, memory content, review verdicts, quality authority, and artifacts.

For `MAS`, this means inventory and descriptor projection over the existing `scout`, `idea`, `baseline`, `experiment`, `analysis-campaign`, `write`, `review`, and `decision/finalize` route contract. It does not rename or replace those routes. For `RCA` and `MAG`, first adoption should stay as light stage-pack projection over existing deliverable and grant-authoring surfaces.

## Domain Memory Ref / Writeback Freeze

`family-domain-memory-ref.schema.json` and `family-domain-memory-writeback.schema.json` add the memory-reference layer needed by the stage-led agent framework. They describe only domain-owned memory pack locators, freshness, stage targeting, proposal refs, and router receipt refs.

`OPL` may:

- discover and index domain memory refs;
- carry `knowledge_refs` into stage-attempt packets;
- project consumed refs, writeback proposal refs, and accepted/rejected receipt refs in operator workbenches;
- check freshness and forbidden authority.

`OPL` must not:

- store or rewrite domain memory body text;
- promote memory cards into evidence, review, grant, visual, or artifact truth;
- accept or reject memory writebacks;
- infer publication, fundability, visual-quality, or artifact-readiness verdicts from memory refs.

MAS `publication_route_memory`, MAG grant strategy memory, and RCA visual pattern memory should expose locator/receipt refs through their domain manifests. Memory content, route judgment, quality gates, and artifact authority remain with the domain repository.

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

- [Shared Runtime Contract](../../docs/specs/shared-runtime-contract.md)
- [Shared Runtime Contract（中文）](../../docs/specs/shared-runtime-contract.md)
- [Shared Domain Contract](../../docs/specs/shared-domain-contract.md)
- [Shared Domain Contract（中文）](../../docs/specs/shared-domain-contract.md)
- [CrewAI absorb note](../../docs/references/runtime-substrate/family-orchestration-contract-absorb-crewai.md)

## Files

- [`family-event-envelope.schema.json`](./family-event-envelope.schema.json)
- [`family-checkpoint-lineage.schema.json`](./family-checkpoint-lineage.schema.json)
- [`family-action-graph.schema.json`](./family-action-graph.schema.json)
- [`family-action-catalog.schema.json`](./family-action-catalog.schema.json)
- [`family-stage-control-plane.schema.json`](./family-stage-control-plane.schema.json)
- [`family-domain-memory-ref.schema.json`](./family-domain-memory-ref.schema.json)
- [`family-domain-memory-writeback.schema.json`](./family-domain-memory-writeback.schema.json)
- [`family-human-gate.schema.json`](./family-human-gate.schema.json)
- [`family-runtime-supervision.schema.json`](./family-runtime-supervision.schema.json)
- [`family-persistence-policy.schema.json`](./family-persistence-policy.schema.json)
- [`family-lifecycle-ledger.schema.json`](./family-lifecycle-ledger.schema.json)
- [`family-owner-route.schema.json`](./family-owner-route.schema.json)
- [`family-conflict-envelope.schema.json`](./family-conflict-envelope.schema.json)
- [`family-product-entry-manifest-v2.schema.json`](./family-product-entry-manifest-v2.schema.json)
