**English** | [中文](./README.zh-CN.md)

# Family Orchestration Contracts

This directory freezes the machine-readable companion schemas for the family-level orchestration surfaces shared across the current active four-repository line: `one-person-lab`, `med-autoscience`, `med-autogrant`, and `redcube-ai`.

These contracts absorb useful orchestration ideas from tools such as `CrewAI` in a contract-first way, but they do not make `CrewAI` a required runtime dependency and they do not replace the existing ownership split:

- Hermes provider/readiness/compatibility semantics are limited to historical provenance, reference material, diagnostic vocabulary, or a negative guard; `hermes_agent` remains available only as an explicit non-default executor adapter with independent receipt, audit, and fail-closed gates; Temporal is the required online runtime substrate for Full readiness and durable orchestration, while local providers are dev/CI/offline diagnostics only
- `Codex CLI` remains the default concrete executor name and `autonomous` remains the default route mode unless a domain route explicitly selects another executor
- `one-person-lab` owns the typed family queue and product control plane over the Temporal-backed family runtime provider, not a replacement runtime kernel
- domain repositories remain the owners of durable truth, audit truth, and review truth

They also absorb the useful `Ageniti` idea of deriving CLI, MCP, Skill, OpenAI, AI SDK, and product-entry descriptors from one app-action definition. OPL adopts that pattern as a family contract, not as a `@ageniti/core` runtime dependency.

They also absorb the useful GraphFlow / GFL pattern of admitting a statically checkable stage-pack core, composing stages through `requires` / `ensures`, and keeping AI, human, external-system, artifact, memory, and domain-verdict effects behind runtime-enforced boundaries. OPL adopts this as contract vocabulary only; GraphFlow / GFL is not an OPL runtime, provider, executor, planner, stage runner, or domain authority dependency.

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
  - shared stage descriptor companion for stage goal, domain stage refs, skill / prompt / evaluation refs, handoff refs, runtime-assumption monitor refs, cohort / trigger / metric refs, and authority boundary
- `family-stage-admission.schema.json`
  - OPL-owned stage admission read model for stage contracts, trust lanes, effect-boundary runtime-event requirements, composition obligations, admission findings, and OPL non-authority boundaries
- `family-stage-proof-bundle.schema.json`
  - lightweight proof-carrying stage-pack bundle for OPL scheduling / admission consumption, carrying composition obligations, assumptions, receipt refs, runtime-event requirements, test / proof refs, generated artifact manifest, blockers, and OPL non-authority boundaries
- `family-stage-graph-projection.schema.json`
  - graph projection of one family stage pack for scheduler/App consumption, carrying nodes, handoff edges, admission state, guarantee modes, integrity digest, and OPL non-authority boundaries
- `family-stage-cohort-loop.schema.json`
  - refs-only source scope / cohort query / trigger / monitor-metric loop projection for one stage pack, with typed blockers when the same source set cannot be traced from launch to operator monitoring; OPL does not evaluate source truth or introduce a GraphFlow runtime
- `family-stage-pack-registry.schema.json`
  - stage-pack library / registry projection keyed by integrity hash, including reusable pack refs, active attempt binding, migration policy, and migration blockers
- `family-stage-replay-certification.schema.json`
  - stage-pack replay certification projection that checks append-only event log refs, attempt ledger refs, runtime event refs, and closeout receipt refs without re-querying AI, humans, or external systems
- `family-stage-assumption-lifecycle.schema.json`
  - runtime-assumption lifecycle projection that turns stale assumptions, missing monitor refs, or missing owner refs into typed blockers with minimal counterexamples
- `family-stage-integrity-metadata.schema.json`
  - shared stage-level integrity / citation-support / evidence-handoff / data-access / human-checkpoint metadata companion, inspired by academic workflow integrity patterns but kept as OPL-owned framework metadata projection only
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

`family-product-entry-manifest-v2.schema.json` only adds optional discovery refs for these surfaces. Stage attempt query now also projects a locator-only lifecycle primitive: workspace/runtime/artifact roots, indexed closeout or consumed refs, declared restore refs, and the cleanup gate. `OPL` may index refs, show missing restore proof, and use `family-runtime lifecycle apply --mode dry-run|apply|verify` for controlled ledger apply over OPL-owned runtime/index/provenance/tombstone refs. That apply writes only lifecycle index, cleanup receipt, and restore-proof refs under the OPL state root. Domain truth, memory bodies, artifact bodies, source repo active files, and real artifact mutation remain fail-closed; domain artifact mutation can only be recorded as a domain owner receipt ref. It does not require `MAG` or `RCA` to migrate runtime state into SQLite, and it does not move `MAS` publication evaluation, AI review, paper package, or readiness authority out of `MAS`. Likewise, `domain_memory_descriptor` exposes locator / freshness / receipt refs only; it does not move memory content or writeback authority into `OPL`.

`family-runtime-lifecycle-index` is the OPL-owned refs-only SQLite sidecar index for this boundary. It may record domain id, surface id, source ref, receipt ref, checksum, and opaque payload refs under the OPL state root. It is not a domain truth store, memory body store, quality verdict store, artifact authority, or package/export readiness store. MAS-style runtime lifecycle SQLite implementations must be classified as domain sidecar reference adapters or file-authority refs once this replacement exists; domain repositories must not claim long-term ownership of a generic persistence engine.

`functional_privatization_audit` is the OPL-owned read model that normalizes domain-declared functional-looking code paths. OPL accepts the repo-local shapes used by MAS (`functional_consumer_boundary`), MAG (`mag_consumer_thinning_contract.privatized_functional_module_audit`), RCA (`runtime_framework.rca_thin_surface_policy.privatized_functional_module_audit`), and the standard scaffold (`functional_privatization_audit`). Each module is still classified as `opl_hosted_surface`, `opl_generated_surface`, `declarative_pack`, `minimal_authority_function`, `refs_only_domain_adapter`, `temporary_migration_bridge`, `diagnostic_cleanup_path`, `provenance_or_fixture`, `domain_authority`, or legacy `retire_tombstone`; MAS-style `legacy_cleanup_physical_retired` is normalized into `diagnostic_cleanup_path` and remains hidden when it has no active caller. Code-path inventories may also provide `code_paths`, `active_callers`, `active_caller_status`, `migration_action`, `retention_reason`, `cannot_absorb_reason`, `standardization_layer`, and `standardization_layer_reason`. The standardization layer splits the full inventory into `standard_domain_pack_inventory` (not private platform residue), `authority_function_inventory` (standard domain authority behind the OPL ABI), and `private_platform_residue_inventory` (the only layer that needs OPL generated/hosted replacement, refs-only thinning, diagnostic cleanup, or tombstone retirement). The clean target is zero `opl_owned_replacement`, zero active `temporary_migration_bridge`, zero legacy `retire_tombstone`, and zero active private generic residue. Day-to-day structural audits should read `default_watchlist_count` and `default_watchlist_module_ids`; cleared or stable boundary entries remain in the full module inventory but are folded as `hidden_by_default`. Semantic equivalence audits should read `semantic_equivalence_review_count` and `semantic_equivalence_review_module_ids` to track whether active callers have truly moved to OPL primitives or generated surfaces. Blockers are raised when a domain claims generic runtime ownership or production soak beyond the evidence.

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

The contract records stage goal, domain-owned stage refs, input/output refs, knowledge refs, skill refs, prompt refs, evaluation refs, handoff metadata, allowed action refs, runtime assumptions, monitor refs, source/artifact/workspace scope refs, and authority boundaries. `OPL` owns schema, manifest discovery, parity checks, and read-only `opl stages list|inspect` commands. Domain repositories continue to own their actual route contracts, stage execution, memory content, review verdicts, quality authority, and artifacts.

The GraphFlow / GFL absorption maps here as stage-pack admission vocabulary. `family-stage-control-plane` plus `family-stage-admission` form the `verified_static_core` read model: stage identity, owner, goal, input/output refs, `requires`, `ensures`, knowledge refs, skill / prompt / evaluation refs, allowed action refs, handoff, trust lane, authority boundary, scope refs, composition findings, and effect-boundary findings. `opl stages list|inspect` projects this admission state plus a `guarantee_mode` summary. Passing admission only means the stage pack can become a launch candidate for the OPL queue / provider / executor path.

The GraphFlow / GFL operational-assumption monitor pattern lands here as two lightweight fields plus one lifecycle projection: `runtime_assumptions` declares assumptions that must remain visible during launch and runtime, such as source freshness, provider SLO, boundary failure rate, or artifact locator freshness; `monitor_refs` points at domain-owned or OPL-owned monitor projections so App/operator surfaces can see auditable monitor sources. Legacy string assumptions remain valid, while machine-readable assumption objects can carry owner, monitor refs, freshness / observed refs, invalidation refs, and repair actions. `family-stage-assumption-lifecycle` turns stale assumptions, missing monitor refs, or missing owners into launch blockers with minimal counterexamples. OPL projects refs, status, and blockers only; it does not turn monitor results into domain truth, quality verdicts, publication / fundability / visual verdicts, or artifact authority.

The scope refs make launch scope explicit: `source_scope_refs` freeze the source cohort, `artifact_scope_refs` freeze the artifact set, and `workspace_scope_refs` freeze the workspace/runtime scope that the stage is allowed to use. OPL projects these refs and counts only. The `guarantee_mode` projection distinguishes `static_admission_only`, `runtime_enforced`, `domain_owned_judgment`, and `observability_only`; it is an operator/scheduler read model, not a proof assistant result or domain verdict.

GraphFlow / GFL's cohort search / trigger / dashboard closed-loop pattern maps to the refs-only `family-stage-cohort-loop` projection. `source_scope_refs` freezes the source cohort or source set, `cohort_query_refs` points to the auditable query, `trigger_refs` points to the queue / launch / schedule trigger, and `monitor_refs`, `metric_refs`, or `dashboard_metric_refs` point to post-launch observation for the same cohort. Missing links become typed blockers with minimal counterexamples. The projection is a scheduler/App launch-readiness and operator drilldown input only; it does not execute queries, write source truth, or authorize domain readiness or quality verdicts.

`family-stage-proof-bundle.schema.json`, `family-stage-graph-projection.schema.json`, `family-stage-pack-registry.schema.json`, and `family-stage-replay-certification.schema.json` are the machine-readable OPL projections over that stage pack. The proof bundle carries composition, receipt, runtime-event, proof-ref, and integrity metadata; the graph projection carries nodes, edges, guarantee modes, graph summary, and the same integrity digest; the registry exposes reusable library refs, active attempt binding, and hash migration blockers; replay certification checks proof-bundle obligations against append-only event log refs, attempt ledger refs, runtime event refs, and closeout receipt refs. These surfaces are read-only scheduler/App inputs and do not execute stages, re-query AI / human / external sources, verify external signatures, write domain truth, mutate artifacts, or authorize domain readiness.

GraphFlow / GFL's diagram-as-spec / generated-artifacts pattern lands inside the proof bundle as `generated_artifact_manifest`. OPL records code / test / proof / schema / artifact refs derived from the same stage pack plus `source_stage_pack_ref`, `graph_projection_ref`, and `stage_pack_hash`. A hash change means generated refs must be regenerated, migrated, or gated by a human decision. The manifest is a build/review input only; it does not execute the stage, write artifact bodies, or turn generated refs into domain readiness or quality verdicts.

Runtime effects remain in the `runtime_enforced_boundary`: executor output, human approval, external-system responses, artifact mutation, memory writeback, domain quality / publication / fundability / visual verdicts, and owner receipts. Unsatisfied composition, stale evidence, owner conflicts, receipt conflicts, or missing executor binding must become a conflict envelope, human gate, or route-back. `Codex CLI` remains the default executor; non-default adapters require explicit selection plus independent receipt and audit evidence.

GraphFlow / GFL's agent-invocation pattern maps to the `opl_stage_launch_invocation` activity event. An agent/operator selects an admitted or explicitly marked stage pack, binds source fingerprint, workspace locator, idempotency key, and selected executor, then hands launch to the OPL provider/executor path. The default `codex_cli` records `default_codex_cli`; non-default executors such as `hermes_agent` or `claude_code` must carry an `executor_binding_ref` when `--require-stage-admission` is used, or launch fails closed with `non_default_executor_binding_ref_missing`. This gate proves launch binding and audit refs only; it does not claim behavioral or quality equivalence with Codex CLI.

For `MAS`, this means inventory and descriptor projection over the existing `scout`, `idea`, `baseline`, `experiment`, `analysis-campaign`, `write`, `review`, and `decision/finalize` route contract. It does not rename or replace those routes. For `RCA` and `MAG`, first adoption should stay as light stage-pack projection over existing deliverable and grant-authoring surfaces.

## Stage Integrity Metadata Freeze

`family-stage-integrity-metadata.schema.json` absorbs the useful academic-research workflow pattern of explicit integrity checks, citation-support audit refs, evidence handoff, verified data-access metadata, and human checkpoints. It is a companion metadata surface for stage packets and product-entry manifests; it is not a paper-reviewer, publication gate, fundability gate, visual-quality gate, or runtime dependency on `academic-research-skills`.

`OPL` owns the schema, discovery, transport, projection, and fail-closed routing vocabulary. `MAS`, `MAG`, `RCA`, and future Foundry Agents may expose thin domain projections or adapters into this shape. The domain repositories keep the underlying truth, audit bodies, evidence ledgers, review judgments, quality verdicts, publication / fundability / visual authority, artifact authority, owner receipts, and direct skill paths.

The required authority boundary is explicit: OPL can index refs, show missing support, route a human checkpoint, and carry handoff receipts, but it cannot write domain truth, mutate artifact bodies, accept publication readiness, replace a domain direct skill path, or authorize any domain verdict.

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
- introduce a GraphFlow / GFL runtime, graph engine, planner, stage runner, or executor
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
- [`family-stage-admission.schema.json`](./family-stage-admission.schema.json)
- [`family-stage-proof-bundle.schema.json`](./family-stage-proof-bundle.schema.json)
- [`family-stage-graph-projection.schema.json`](./family-stage-graph-projection.schema.json)
- [`family-stage-cohort-loop.schema.json`](./family-stage-cohort-loop.schema.json)
- [`family-stage-integrity-metadata.schema.json`](./family-stage-integrity-metadata.schema.json)
- [`family-domain-memory-ref.schema.json`](./family-domain-memory-ref.schema.json)
- [`family-domain-memory-writeback.schema.json`](./family-domain-memory-writeback.schema.json)
- [`family-human-gate.schema.json`](./family-human-gate.schema.json)
- [`family-runtime-supervision.schema.json`](./family-runtime-supervision.schema.json)
- [`family-persistence-policy.schema.json`](./family-persistence-policy.schema.json)
- [`family-lifecycle-ledger.schema.json`](./family-lifecycle-ledger.schema.json)
- [`family-owner-route.schema.json`](./family-owner-route.schema.json)
- [`family-conflict-envelope.schema.json`](./family-conflict-envelope.schema.json)
- [`family-product-entry-manifest-v2.schema.json`](./family-product-entry-manifest-v2.schema.json)
