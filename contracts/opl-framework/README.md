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
- owner-delta-first readiness projection that lets default App/operator surfaces answer current safe action, waiting owner, required delta / receipt / typed blocker, and readiness blocker before exposing raw refs-only audit counters
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

## How To Read This Directory

- `workstreams.json`, `domains.json`, `stage-selection-vocabulary.json`, `task-topology.json`, `public-surface-index.json`, `surface-budget-policy.json`, and `operating-loop-adoption-policy.json` define the active stage-led framework selection surface, the Framework / App / Foundry product-layer owner split, the default-surface promotion budget, the external operating-loop adoption boundary, and the `opl_framework_locator` surface used by OPL-compatible agents to locate their external framework runtime dependency. `operating-loop-adoption-policy.json` treats Codex-maxxing as reference-only input and folds durable thread/workstream, goal oracle, heartbeat/steering, artifact-first review, and explicit memory patterns into existing OPL refs/read-model/receipt surfaces; it does not create a second runtime, scheduler, memory store, artifact authority, quality verdict, or production-ready path. `public-surface-index.json` binds every active public surface to the surface budget through a per-surface `surface_budget` envelope, including default-state reasons, promotion evidence refs, consumer refs, and authority-boundary false flags.
- `family-product-operator-projection.json` also declares the GUI runtime boundary: `opl app state --profile fast --json` for default page state, `opl app state --profile full --json` for explicit refresh, `opl app action execute ... --json` for App mutations, and `opl runtime app-operator-drilldown --detail full --json` as the on-demand full runtime drilldown exception. OPL Framework is only the GUI-ready state/action producer; GUI product truth, release gates, page-state policy, and active-shell validation remain in `one-person-lab-app`; `opl-aion-shell` is the current implementation carrier for that App-owned contract and must not use raw full drilldown as normal GUI state.
- `family-runtime-online-substrate-contract.json`, `family-runtime-attempt-contract.json`, `stage-route-scheduler-contract.json`, `stage-artifact-runtime-contract.json`, `state-index-kernel-contract.json`, `family-transition-runner-contract.json`, `functional-agent-runtime-harness-contract.json`, `domain-pack-compiler-contract.json`, `generic-substrate-projection-contract.json`, `foundry-agent-series-contract.json`, `standard-domain-agent-skeleton-contract.json`, `functional-privatization-audit-envelope-contract.json`, `managed-runtime-three-layer-contract.json`, and `runtime-manager-contract.json` are active provider-backed runtime/control-plane and generated-surface contracts. `foundry-agent-series-contract.json` is the family-level Progress-First series contract for MAS/MAG/RCA/OMA/new agents: every Foundry Agent declares shared identity, stage authority, progress/currentness/closeout packets, typed blocker lineage, and App projection boundaries while keeping domain truth and verdict authority in the domain repo. `stage-route-scheduler-contract.json` freezes the graph/reconciliation/read-model scheduling boundary: OPL owns the stage graph, route hydration, attempt ledger, and reconciliation loop; domain owners retain route semantics, owner receipts, typed blockers, truth, quality verdicts, and artifact authority. `stage-artifact-runtime-contract.json` freezes the Stage Folder Contract for `runtime-state/domains/<domain>/deliverables/<program>/<topic>/<deliverable>/stages/<nn-stage>/attempts/<attempt_id>`, including required attempt entries, `opl stage open`, receipt-backed `opl stage commit`, physical-folder-first `status` / `explain`, rebuildable index semantics, latest/current pointer maintenance, refs-only canonical pointer promotion, sha256 content hashes, lineage events, strict conformance, artifact-native workbench projection, and dry-run-first retention/restore boundaries. `state-index-kernel-contract.json` freezes the SQLite sidecar split: file/Stage Folder remains portable truth, SQLite stores rebuildable queue/attempt/lifecycle/artifact/lineage/outbox/read-model indexes with bounded payload envelopes, and Temporal remains the production durable execution substrate; SQLite never stores domain truth, memory body, artifact blob, owner receipt authority, quality/export verdict, or production readiness authority. `family-transition-runner-contract.json` and `runtime-manager-contract.json` participate only at the route-as-transition / operator projection layer and must not turn a route into a nested stage. `functional-agent-runtime-harness-contract.json` proves constructed and domain-declared functional chains without authorizing live soak or domain readiness. `functional-privatization-audit-envelope-contract.json` defines the AI-first, contract-light envelope consumed by descriptors and App/operator drilldown to normalize MAS, MAG, RCA, and standard scaffold private functional audit shapes without claiming domain truth or readiness. `domain-pack-compiler-contract.json` defines `opl agents pack-compiler`, `opl agents interfaces`, and `opl agents conformance` as read-only OPL projections from descriptors, standard repo action/stage contracts, runtime surfaces, and `functional_privatization_audit` into OPL-owned generated-surface, generated interface bundles, and family-wide standard-agent conformance reports, with a `generated_artifact_drift_manifest` on pack compiler list/inspect that records the domain pack/source input fingerprint, generated bundle fingerprint, `generated_from` refs, and `aligned` / `drift_detected` state. `agents conformance` separates scaffold validation, canonical `agent/` pack root, README-only path guards, generated-surface ownership, generated interface readiness, private-surface generic-owner guards, Foundry series contract, and production evidence tail into a machine-readable report; it proves structural placement only and does not claim live soak, App user-path proof, or domain readiness. These commands can project CLI, MCP, Skill, product-entry, OpenAI, and AI SDK descriptors from the same canonical action/stage metadata; they do not generate domain handlers, write domain truth or memory body, mutate artifacts, or authorize quality/export verdicts. `generic-substrate-projection-contract.json` defines OPL-owned locator/index/lifecycle projection and App/operator drilldown workbench grouping over domain-declared workspace, source, artifact, and memory refs without reading or writing domain truth/body/verdict/authority. `family-runtime-online-substrate-contract.json` also declares the Temporal provider SLO cadence action envelope used to route supervised production proof execution without authorizing domain readiness.
- `family-runtime-attempt-contract.json` also defines `current_provider_readiness` and `stage_progress_log` as canonical OPL family-runtime attempt/progress projections. `current_provider_readiness` is exposed on the top-level `attempt query` wrapper, nested `stage_attempt_query`, and operator visibility; it is the fresh provider inspection and explicitly marks the creation-time `provider_receipt` as a snapshot. `stage_progress_log` has `surface_kind=opl_stage_progress_log` and projects intended work, actual work, timeline, usage, Temporal visibility refs, evidence refs, authority boundary, provider status refs, and domain receipt refs into `attempt query`, operator visibility, Agent Lab improvement inputs, and runtime-tray workbench summaries. Its `user_stage_log` sub-surface is the user-facing summary for stage name, problem, work done, duration, token/cost status, outcome, blockers, and evidence refs; OPL owns timing/usage/refs and explicit missing/null states, while human-readable domain semantics must come from domain typed closeout fields such as `user_stage_log`, `stage_log_summary`, `human_stage_log`, `human_summary`, or `paper_stage_log`. The same contract now includes clean-room PilotDeck-inspired `memory_trace_projection` and `model_route_cost_projection`: the memory trace surface projects consumed memory refs, recall/retrieval trace refs, writeback receipt refs, rejected-write refs, and source refs without memory body access; the route/cost surface links selected model/executor route refs and route reason/tier/fallback refs to observed token/cost telemetry without changing executor route, auto-degrading, or replacing quality gates. Standard OPL Agents should prefer `stage_work_done` / `changed_stage_surfaces` for domain deliverable changes; `paper_work_done` / `changed_paper_surfaces` remain MAS manuscript aliases. Temporal provider owns durable workflow history, activity heartbeat, workflow query, and searchable visibility; OPL projects `temporal_visibility` / `temporal_webui_ref` as refs-only metadata, and the Web UI ref is operator-debug-only rather than the primary App state surface. Agent Lab consumes these refs as evidence for evaluation, root-cause, candidate fix, and follow-up read models; it does not own the runtime log, execute domain actions, write domain truth, or authorize quality/domain-ready verdicts. The retired execution-log wording may appear only in tombstone/provenance contexts.
- `attempt_true_path_proof` is the refs-only proof surface that binds the same stage attempt across `attempt query`, `queue inspect`, App full drilldown, `stage_progress_log`, Temporal visibility, and Temporal Web UI debug refs. It is current-path traceability evidence only and does not claim long-soak, domain readiness, artifact authority, or quality verdicts.
- `contracts/family-orchestration/family-stage-proof-bundle.schema.json`, `contracts/family-orchestration/family-stage-graph-projection.schema.json`, and `contracts/family-orchestration/family-stage-integrity-metadata.schema.json` are companion contracts for stage-pack proof, graph, integrity, citation-support, evidence-handoff, data-access, and human-checkpoint metadata. They belong to family orchestration because MAS/MAG/RCA publish domain projections or adapters into them while keeping domain truth and verdict authority in their own repositories.
- `family-executor-adapter-defaults.json` remains useful as a shared executor contract.
- retired gateway, federation, routed-action, onboarding, acceptance, governance, and example corpora live outside this active contract root.

## File Inventory

- `workstreams.json`
- `domains.json`
- `stage-selection-vocabulary.json`
- `agent-lab-contract.json`
- `agent-lab-mag-live-acceptance-suite.json`
- `agent-platform-surface-ownership-contract.json`
- `codex-default-profile.json`
- `family-executor-adapter-defaults.json`
- `managed-runtime-three-layer-contract.json`
- `runtime-manager-contract.json`
- `family-runtime-online-substrate-contract.json`
- `family-runtime-attempt-contract.json`
- `stage-route-scheduler-contract.json`
- `stage-artifact-runtime-contract.json`
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
