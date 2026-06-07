# OPL Framework Contracts

Owner: `One Person Lab`
Purpose: `opl_framework_contract_support_index`
State: `active_support`
Machine boundary: This document is a human-readable support index for OPL Framework contracts. Machine truth remains in JSON contract files, source, tests, CLI/read-model output, runtime ledgers, and provider/domain receipts.

This directory preserves the active `OPL Framework` runtime and family control-plane contract corpus. `One Person Lab App` and Foundry Agents may consume these contracts, but this directory does not define a second runtime truth for the App or any domain agent.

It is repo-tracked because the current framework needs stable machine-readable inputs for:

- stage-led task selection
- product-layer ownership for `OPL Framework`, `One Person Lab App`, and `Foundry Agents`
- admitted domain-agent / Foundry package catalog projection
- provider-backed runtime attempts
- domain-neutral transition table runner and matrix evaluation
- stage graph / route-as-transition runtime support for complex domain agents where route is a domain transition recommendation and stage attempt lifecycle remains OPL-owned
- stage graph / owner-route hydration / reconciliation / attempt-ledger boundaries for complex domain agents, where stage is the OPL attempt unit and route is a domain-owner semantic rather than a small stage
- functional agent runtime harness coverage for queue, typed closeout, refs-only memory writeback, human gate, retry, dead-letter, and repair transitions
- domain pack compiler and generated interface read model that compiles admitted domain packs or standard agent repo contracts into OPL-owned CLI / MCP / Skill / product-entry / OpenAI / AI SDK / sidecar / status / workbench / harness generated-surface handoff projections
- surface-budget governance that keeps new default surfaces limited to launch safety, authority boundary, evidence/replay/audit/route-back, or repeated App/runtime consumption
- operating-loop adoption governance that maps external Codex work-loop patterns into OPL workstream/thread continuity, goal oracle, heartbeat/steering, artifact-first review, memory refs, receipt, and read-model boundaries without importing an external runtime or authority
- brand-module governance that keeps Charter, Atlas, Workspace, Stagecraft, Runway, Vault, Console, Foundry Lab, and Connect at the Workspace-level structural baseline through one registry, CLI/read-model projection, validation gate, and false-authority boundary
- owner-delta-first readiness projection that lets default App/operator surfaces answer current safe action, waiting owner, required delta / receipt / typed blocker, and readiness blocker before exposing raw refs-only audit counters
- target architecture contract kernels for current owner delta, stage artifact unit, owner answer, passive evidence vault, ordinary golden path, stop-loss, guardrail tiers, progress truth, wrapper retirement, and default surface budget without moving domain truth into OPL
- cognitive computation kernel governance that lets each Stage declare generation, reflection, comparative selection, evolution, meta-review, tool affordance boundaries, knowledge, and independent quality-gate strategy refs without turning tools into a workflow script, Route into a small Stage, or domain truth into OPL-owned state
- generic workspace/source/artifact/memory substrate projection and App/operator workbench grouping without moving domain truth/body/verdict/authority into OPL
- framework runtime dependency location for OPL-compatible agents
- Runtime Manager readiness and state projection
- App runtime state/action CLI boundary for GUI implementations
- optional native-helper lifecycle checks

The current product model is `OPL Framework -> One Person Lab App / CLI -> Foundry Agents`. `one-person-lab` owns the framework/runtime/CLI/contracts layer, `one-person-lab-app` owns GUI product truth and release validation, `opl-aion-shell` is the current shell implementation carrier, and MAS/MAG/RCA own their domain app/runtime authority. The execution chain remains `Codex CLI first-class executor + explicit OPL activation + configured family runtime provider + family skill sync/discovery`.

## Current Truth Lives Elsewhere

Start here for the active `OPL Framework / App / Foundry Agents` model:

- `README*`
- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/decisions.md`
- `contracts/README.md`

Read the linked domain repositories when you need the current repo-owned capability surfaces that `opl skill sync` activates.

## Target Architecture Contract Groups

These schema files are the machine-readable OPL target architecture surface. Their machine boundary is framework-owned shape, refs, launch / audit / fail-closed semantics, and App/operator projection only. They do not copy domain truth, artifact bodies, memory bodies, owner receipt authority, quality verdicts, production readiness, or App release authority into OPL.

### Owner Delta Kernel

- `current-owner-delta.schema.json`: compact default owner / delta / hard-gate / action payload and ordinary next-action root.
- `owner-answer.schema.json`: unified return shape for owner receipt, typed blocker, human decision, and route-back.
- `stop-loss-policy.schema.json`: lineage repeat, receipt-only, platform-repair-only, read-model-reconcile-only, and stale-route freeze/release policy.

### Stage Artifact Unit

- `stage-run-kernel-contract.json`: refs-only StageRun spec/status/event-log/read-model substrate, observed_generation, retry budget, hold scope, execution authorization, closeout receipt binding, and domain adoption boundary.
- `stage-manifest.schema.json`: Stage Folder manifest shape for required roles, produced role artifacts, input/output refs, receipt/blocker refs, content hashes, current pointer, lineage, and authority boundary.
- `role-artifact-ref.schema.json`: refs-only semantic role artifact pointer with content hash and lineage; role is the interface, not file name.
- `stage-owner-receipt.schema.json`: owner-signed stage receipt shape consumed by OPL for success or route handoff, including optional StageRun / manifest / current-pointer / source-fingerprint binding refs, without granting OPL receipt authority.
- `stage-typed-blocker.schema.json`: owner-signed typed blocker shape for blocked/deferred StageRun closeout and next safe action.
- `stage-artifact-unit.schema.json`: physical output, manifest, content hashes, owner answer, current pointer, lineage, and progress truth boundary.
- `stage-artifact-progress-truth-policy.json`: family-level rule that deliverable progress requires physical output, valid manifest, owner answer, and current pointer.
- `workspace-topology-profile.schema.json`: Workspace Group -> Project Unit -> Stage Artifact Unit -> Owner Receipt / Typed Blocker profile schema with `workspace_modes=one_off|series|portfolio`, default `deliverables/<project-id>`, RCA series `deliverables/<deck-id>`, MAS portfolio `studies/<study-id>`, `project_stage_outputs_root=artifacts/stage_outputs`, and runtime-state-as-provider-backing/provenance boundary.
- `workspace-index.schema.json`: workspace-local `workspace_index.json` instance schema for the canonical topology layer, domain display labels, shared resource roles / manifest refs, indexed project roots, stage outputs root manifest refs, project lifecycle, generated map / health refs, user inspection roots, and authority false flags materialized by `opl workspace init|ensure|adopt --apply|upgrade --apply` and checked by `opl workspace validate|doctor`.
- `agent-workspace-norm-contract.json`: executable OPL Agent workspace norm that binds `opl workspace ensure`, App `workspace_ensure`, descriptor-only MCP/Skill/OpenAI/AI SDK delegates, workspace registry writes, user inspection paths, runtime-state boundary, and conformance anti-overclaim flags.

### Evidence Vault

- `evidence-vault-event.schema.json`: passive audit-only event envelope for raw evidence, provider trace, replay, receipt ledger, typed blocker groups, soak, no-regression, cleanup, and diagnostic refs.

### Golden Path

- `golden-path-profile.schema.json`: one ordinary Foundry Agent route plus explicit proof/diagnostic/cleanup/replay/debug variants.
- `default-surface-budget.schema.json`: default / diagnostic / audit / production / cleanup visibility and promotion gate with false authority flags.
- `guardrail-tier-policy.json`: launch-hard, runtime-enforced, domain/human, and audit-only guardrail tier boundary.
- `wrapper-retirement-gate-policy.json`: replacement parity, no-active-caller, no-forbidden-write, and tombstone/provenance static retirement prerequisites, plus the separate domain owner delete/keep/blocker decision shapes.

### Cognitive Computation Kernel

- `cognitive-computation-kernel.json`: Stage-internal strategy kernel for candidate generation, grounded reflection, comparative selection, evolution/revision, meta-review learning, tool affordance boundaries, knowledge binding, and independent quality gates. Tool refs are available affordances with safety/permission/credential/write-scope/forbidden-authority boundaries, not a prescribed workflow. It keeps Route as domain-owner next-step semantics and keeps OPL as refs-only runtime/control-plane owner. Standard Foundry Agents must also declare `contracts/stage_run_canary_evidence.json` as a controlled fixture proving the refs-only closeout shape for candidate, reflection, ranking, revision, meta-review, and independent-gate role artifacts. The fixture can close only as an owner receipt or typed blocker and cannot turn controlled evidence, provider completion, file presence, read-model refresh, or conformance pass into live domain progress. `opl agents conformance` derives an `operator_summary` from this fixture so App/operator surfaces can show the candidate, reflection, comparison, revision, and independent-gate refs; the same gate blocks overclaims such as domain-ready, quality/export-ready, artifact-ready, production-ready, or live-progress fields.

## How To Read This Directory

- `workstreams.json`, `domains.json`, `stage-selection-vocabulary.json`, `task-topology.json`, `public-surface-index.json`, `brand-module-registry.json`, `brand-cli-governance.json`, `surface-budget-policy.json`, and `operating-loop-adoption-policy.json` define the active stage-led framework selection surface, the Framework / App / Foundry product-layer owner split, the nine OPL brand-module registry, the module-owned brand CLI frontdoors, the default-surface promotion budget, the external operating-loop adoption boundary, and the `opl_framework_locator` surface used by OPL-compatible agents to locate their external framework runtime dependency. `brand-module-registry.json` is consumed by `opl brand-modules list|inspect|maturity|validate|interfaces --json`; `brand-cli-governance.json` is consumed by non-Workspace `opl <brand-module> status|inspect|interfaces|validate|doctor --json`, Workspace `opl workspace status|inspect --json`, and `opl agents modules list|inspect|interfaces|validate|doctor --json`. Together they prove only `L4_structural_baseline` structure; they cannot claim domain ready, quality verdict, artifact authority, production ready, domain truth write, owner receipt, typed blocker, or App release truth. `operating-loop-adoption-policy.json` treats Codex-maxxing as reference-only input and folds durable thread/workstream, goal oracle, heartbeat/steering, artifact-first review, and explicit memory patterns into existing OPL refs/read-model/receipt surfaces; it does not create a second runtime, scheduler, memory store, artifact authority, quality verdict, or production-ready path. `public-surface-index.json` binds every active public surface to the surface budget through a per-surface `surface_budget` envelope, including default-state reasons, promotion evidence refs, consumer refs, and authority-boundary false flags.
- `family-product-operator-projection.json` also declares the GUI runtime boundary: `opl app state --profile fast --json` for default page state, `opl app state --profile full --json` for explicit refresh, `opl app action execute ... --json` for App mutations, and `opl runtime app-operator-drilldown --detail full --json` as the on-demand full runtime drilldown exception. OPL Framework is only the GUI-ready state/action producer; GUI product truth, release gates, page-state policy, and active-shell validation remain in `one-person-lab-app`; `opl-aion-shell` is the current implementation carrier for that App-owned contract and must not use raw full drilldown as normal GUI state.
- `family-runtime-online-substrate-contract.json`, `family-runtime-attempt-contract.json`, `stage-run-kernel-contract.json`, `stage-route-scheduler-contract.json`, `cognitive-computation-kernel.json`, `stage-artifact-runtime-contract.json`, `state-index-kernel-contract.json`, `family-transition-runner-contract.json`, `functional-agent-runtime-harness-contract.json`, `domain-pack-compiler-contract.json`, `generic-substrate-projection-contract.json`, `foundry-agent-series-contract.json`, `standard-domain-agent-skeleton-contract.json`, `agent-workspace-norm-contract.json`, `functional-privatization-audit-envelope-contract.json`, `managed-runtime-three-layer-contract.json`, and `runtime-manager-contract.json` are active provider-backed runtime/control-plane and generated-surface contracts. `foundry-agent-series-contract.json` is the family-level Progress-First series contract for MAS/MAG/RCA/OMA/new agents: every Foundry Agent declares shared identity, stage authority, progress/currentness/closeout packets, typed blocker lineage, and App projection boundaries while keeping domain truth and verdict authority in the domain repo. `agent-workspace-norm-contract.json` is the executable workspace norm consumed by `contract validate`, `opl workspace interfaces`, real `workspace_index.json`, App workspace actions, and `opl agents conformance`; `workspace-index.schema.json` freezes the instance-level canonical topology/display/shared-resource projection that `workspace validate|doctor` checks. It keeps `workspace ensure` as the default pre-task workspace gate and keeps MCP/Skill/OpenAI/AI SDK as descriptor-only delegates. `stage-run-kernel-contract.json` freezes the refs-only StageRun substrate: OPL owns StageRun spec/status/event log/read-model rebuild, observed_generation, retry budget, hold scope projection, execution authorization decisions, attempt lease checks, and closeout receipt binding checks; domain agents own stage semantics, owner receipts, typed blockers, publication or quality verdicts, artifact bodies, and memory bodies. The companion schemas `stage-manifest.schema.json`, `role-artifact-ref.schema.json`, `stage-owner-receipt.schema.json`, and `stage-typed-blocker.schema.json` freeze the Stage Native manifest / role artifact / receipt / blocker object shapes consumed by StageRun and Stage Folder projections. `stage-route-scheduler-contract.json` freezes the graph/reconciliation/read-model scheduling boundary: OPL owns the stage graph, route hydration, attempt ledger, and reconciliation loop; domain owners retain route semantics, owner receipts, typed blockers, truth, quality verdicts, and artifact authority. `cognitive-computation-kernel.json` defines the Stage-internal strategy layer: generation, reflection, comparative selection, evolution, meta-review, available tool affordances, knowledge use, and independent quality gates are stage-pack declarations and refs, not OPL-held domain truth, route execution semantics, or prescribed tool workflows. `stage-artifact-runtime-contract.json` freezes the Stage Folder Contract for `runtime-state/domains/<domain>/deliverables/<program>/<topic>/<deliverable>/stages/<nn-stage>/attempts/<attempt_id>`, including required attempt entries, `opl stage open`, receipt-backed `opl stage commit`, physical-folder-first `status` / `explain`, `opl stage validate`, rebuildable index semantics, latest/current pointer maintenance, refs-only canonical pointer promotion, sha256 content hashes, lineage events, strict conformance, artifact-native workbench projection, and dry-run-first retention/restore boundaries. `state-index-kernel-contract.json` freezes the SQLite sidecar split: file/Stage Folder remains portable truth, SQLite stores rebuildable queue/attempt/lifecycle/artifact/lineage/outbox/read-model indexes with bounded payload envelopes, and Temporal remains the production durable execution substrate; SQLite never stores domain truth, memory body, artifact blob, owner receipt authority, quality/export verdict, or production readiness authority. `opl index doctor|rebuild|checkpoint|integrity-check|backup --json` is the executable maintenance surface for this split and initializes or maintains the four OPL sidecar databases under `${OPL_STATE_DIR}/family-runtime`. Standard Foundry Agents declare the domain-side adoption in `contracts/stage_run_kernel_profile.json`, `contracts/stage_run_canary_evidence.json`, and `contracts/state_index_kernel_adoption.json`; `opl agents conformance` blocks missing StageRun profile, missing controlled canary evidence, SQLite truth-store, large body, owner receipt, verdict, workspace-norm drift, and generic persistence ownership claims. `family-transition-runner-contract.json` and `runtime-manager-contract.json` participate only at the route-as-transition / operator projection layer and must not turn a route into a nested stage. `functional-agent-runtime-harness-contract.json` proves constructed and domain-declared functional chains without authorizing live soak or domain readiness. `functional-privatization-audit-envelope-contract.json` defines the AI-first, contract-light envelope consumed by descriptors and App/operator drilldown to normalize MAS, MAG, RCA, and standard scaffold private functional audit shapes without claiming domain truth or readiness. `domain-pack-compiler-contract.json` defines `opl agents pack-compiler`, `opl agents interfaces`, and `opl agents conformance` as read-only OPL projections from descriptors, standard repo action/stage contracts, runtime surfaces, and `functional_privatization_audit` into OPL-owned generated-surface, generated interface bundles, and family-wide standard-agent conformance reports, with a `generated_artifact_drift_manifest` on pack compiler list/inspect that records the domain pack/source input fingerprint, generated bundle fingerprint, `generated_from` refs, and `aligned` / `drift_detected` state. `agents conformance` separates scaffold validation, canonical `agent/` pack root, README-only path guards, generated-surface ownership, generated interface readiness, private-surface generic-owner guards, StageRun profile, controlled StageRun canary evidence, Stage Artifact adoption, State Index adoption, workspace norm, Foundry series contract, and production evidence tail into a machine-readable report; it proves structural placement and controlled fixture evidence shape only and does not claim live soak, App user-path proof, or domain readiness. These commands can project CLI, MCP, Skill, product-entry, OpenAI, and AI SDK descriptors from the same canonical action/stage metadata; they do not generate domain handlers, write domain truth or memory body, mutate artifacts, or authorize quality/export verdicts. `generic-substrate-projection-contract.json` defines OPL-owned locator/index/lifecycle projection and App/operator drilldown workbench grouping over domain-declared workspace, source, artifact, and memory refs without reading or writing domain truth/body/verdict/authority. `family-runtime-online-substrate-contract.json` also declares the Temporal provider SLO cadence action envelope used to route supervised production proof execution without authorizing domain readiness.
- `family-runtime-attempt-contract.json` also defines `current_provider_readiness` and `stage_progress_log` as canonical OPL family-runtime attempt/progress projections. `current_provider_readiness` is exposed on the top-level `attempt query` wrapper, nested `stage_attempt_query`, and operator visibility; it is the fresh provider inspection and explicitly marks the creation-time `provider_receipt` as a snapshot. `stage_progress_log` has `surface_kind=opl_stage_progress_log` and projects intended work, actual work, timeline, usage, Temporal visibility refs, evidence refs, authority boundary, provider status refs, and domain receipt refs into `attempt query`, operator visibility, Agent Lab improvement inputs, and runtime-tray workbench summaries. Its `user_stage_log` sub-surface is the user-facing summary for stage name, problem, work done, duration, token/cost status, outcome, blockers, and evidence refs; OPL owns timing/usage/refs and explicit missing/null states, while human-readable domain semantics must come from domain typed closeout fields `user_stage_log`, `stage_log_summary`, or `human_stage_log`. The same contract now includes clean-room PilotDeck-inspired `memory_trace_projection` and `model_route_cost_projection`: the memory trace surface projects consumed memory refs, recall/retrieval trace refs, writeback receipt refs, rejected-write refs, and source refs without memory body access; the route/cost surface links selected model/executor route refs and route reason/tier/fallback refs to observed token/cost telemetry without changing executor route, auto-degrading, or replacing quality gates. Standard OPL Agents use `stage_work_done` / `changed_stage_surfaces` for domain deliverable changes. Temporal provider owns durable workflow history, activity heartbeat, workflow query, and searchable visibility; OPL projects `temporal_visibility` / `temporal_webui_ref` as refs-only metadata, and the Web UI ref is operator-debug-only rather than the primary App state surface. Agent Lab consumes these refs as evidence for evaluation, root-cause, candidate fix, and follow-up read models; it does not own the runtime log, execute domain actions, write domain truth, or authorize quality/domain-ready verdicts. The retired execution-log wording may appear only in tombstone/provenance contexts.
- `attempt_true_path_proof` is the refs-only proof surface that binds the same stage attempt across `attempt query`, `queue inspect`, App full drilldown, `stage_progress_log`, Temporal visibility, and Temporal Web UI debug refs. It is current-path traceability evidence only and does not claim long-soak, domain readiness, artifact authority, or quality verdicts.
- `contracts/family-orchestration/family-stage-proof-bundle.schema.json`, `contracts/family-orchestration/family-stage-graph-projection.schema.json`, and `contracts/family-orchestration/family-stage-integrity-metadata.schema.json` are companion contracts for stage-pack proof, graph, integrity, citation-support, evidence-handoff, data-access, and human-checkpoint metadata. They belong to family orchestration because MAS/MAG/RCA publish domain projections or adapters into them while keeping domain truth and verdict authority in their own repositories.
- `family-executor-adapter-defaults.json` remains useful as a shared executor contract.
- retired gateway, federation, routed-action, onboarding, acceptance, governance, and example corpora live outside this active contract root.

## File Inventory

- `workstreams.json`
- `domains.json`
- `stage-selection-vocabulary.json`
- `brand-module-registry.json`
- `agent-lab-contract.json`
- `agent-lab-mag-live-acceptance-suite.json`
- `agent-platform-surface-ownership-contract.json`
- `codex-default-profile.json`
- `family-executor-adapter-defaults.json`
- `managed-runtime-three-layer-contract.json`
- `runtime-manager-contract.json`
- `family-runtime-online-substrate-contract.json`
- `family-runtime-attempt-contract.json`
- `stage-run-kernel-contract.json`
- `stage-manifest.schema.json`
- `role-artifact-ref.schema.json`
- `stage-owner-receipt.schema.json`
- `stage-typed-blocker.schema.json`
- `stage-route-scheduler-contract.json`
- `cognitive-computation-kernel.json`
- `stage-artifact-runtime-contract.json`
- `current-owner-delta.schema.json`
- `stage-artifact-unit.schema.json`
- `stage-artifact-progress-truth-policy.json`
- `workspace-topology-profile.schema.json`
- `workspace-index.schema.json`
- `agent-workspace-norm-contract.json`
- `owner-answer.schema.json`
- `evidence-vault-event.schema.json`
- `golden-path-profile.schema.json`
- `stop-loss-policy.schema.json`
- `guardrail-tier-policy.json`
- `wrapper-retirement-gate-policy.json`
- `default-surface-budget.schema.json`
- `state-index-kernel-contract.json`
- `family-transition-runner-contract.json`
- `family-domain-quality-projection-contract.json`
- `family-incident-learning-loop.json`
- `family-product-operator-projection.json`
- `functional-agent-runtime-harness-contract.json`
- `domain-pack-compiler-contract.json`
- `generic-substrate-projection-contract.json`
- `foundry-agent-series-contract.json`
- `standard-domain-agent-skeleton-contract.json`
- `functional-privatization-audit-envelope-contract.json`
- `fresh-install-test-matrix.json`
- `native-helper-contract.json`
- `surface-budget-policy.json`
- `operating-loop-adoption-policy.json`
- `public-surface-index.json`
- `task-topology.json`

## Reading Rule

- treat this directory as the active OPL framework contract set
- treat `opl framework locate` / `opl_framework_locator` as the stable way for standalone OPL-compatible agents to find their external OPL Framework dependency
- treat Runtime Manager, family runtime attempt, family transition runner, functional agent runtime harness, domain pack compiler, generated interface bundle, and standard domain-agent skeleton contracts as active for the provider-backed family runtime and generated-surface line
- keep domain truth owned by the linked domain repositories, not by this directory
- Foundry Agents should declare and adapt to these framework contracts instead of vendoring or forking their own OPL runtime truth
- treat One Person Lab App as a projection consumer and workbench surface, not as a runtime provider or domain authority
- treat `open_worklist=0`, selected cohorts, verified typed blockers, provider SLO, conformance, descriptor readiness, and refs-only ledger receipts as bounded operator evidence, not as domain ready, App release ready, artifact authority, physical delete authorization, or production ready
