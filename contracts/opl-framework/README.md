# OPL Framework Contracts

This directory preserves the active `OPL Framework` runtime and family control-plane contract corpus. `One Person Lab App` and Foundry Agents may consume these contracts, but this directory does not define a second runtime truth for the App or any domain agent.

It is repo-tracked because the current framework needs stable machine-readable inputs for:

- stage-led task selection
- product-layer ownership for `OPL Framework`, `One Person Lab App`, and `Foundry Agents`
- admitted domain-agent / Foundry package catalog projection
- provider-backed runtime attempts
- domain-neutral transition table runner and matrix evaluation
- functional agent runtime harness coverage for queue, typed closeout, refs-only memory writeback, human gate, retry, dead-letter, and repair transitions
- domain pack compiler read model that compiles admitted domain packs into OPL-owned CLI / MCP / product-entry / sidecar / status / workbench / harness generated-surface handoff projections
- generic workspace/source/artifact/memory substrate projection and App/operator workbench grouping without moving domain truth/body/verdict/authority into OPL
- framework runtime dependency location for OPL-compatible agents
- Runtime Manager readiness and state projection
- optional native-helper lifecycle checks

The current product model is `OPL Framework -> One Person Lab App / CLI -> Foundry Agents`. The execution chain remains `Codex CLI first-class executor + explicit OPL activation + configured family runtime provider + family skill sync/discovery`.

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

- `workstreams.json`, `domains.json`, `stage-selection-vocabulary.json`, `task-topology.json`, and `public-surface-index.json` define the active stage-led framework selection surface, the Framework / App / Foundry product-layer owner split, and the `opl_framework_locator` surface used by OPL-compatible agents to locate their external framework runtime dependency.
- `family-runtime-online-substrate-contract.json`, `family-runtime-attempt-contract.json`, `family-transition-runner-contract.json`, `functional-agent-runtime-harness-contract.json`, `domain-pack-compiler-contract.json`, `generic-substrate-projection-contract.json`, `standard-domain-agent-skeleton-contract.json`, `managed-runtime-three-layer-contract.json`, and `runtime-manager-contract.json` are active provider-backed runtime/control-plane and generated-surface contracts. `functional-agent-runtime-harness-contract.json` proves constructed and domain-declared functional chains without authorizing live soak or domain readiness. `domain-pack-compiler-contract.json` defines `opl agents pack-compiler` as a read-only compiler from descriptors, stage/action/memory/transition surfaces, runtime surfaces, and `functional_privatization_audit` into OPL-owned generated-surface handoff projections; it does not generate domain handlers, write domain truth or memory body, mutate artifacts, or authorize quality/export verdicts. `generic-substrate-projection-contract.json` defines OPL-owned locator/index/lifecycle projection and App/operator drilldown workbench grouping over domain-declared workspace, source, artifact, and memory refs without reading or writing domain truth/body/verdict/authority. `family-runtime-online-substrate-contract.json` also declares the Temporal provider SLO cadence action envelope used to route supervised production proof execution without authorizing domain readiness.
- `contracts/family-orchestration/family-stage-integrity-metadata.schema.json` is the companion contract for stage integrity, citation-support, evidence-handoff, data-access, and human-checkpoint metadata. It belongs to family orchestration because MAS/MAG/RCA publish domain projections or adapters into it while keeping domain truth and verdict authority in their own repositories.
- `family-executor-adapter-defaults.json` remains useful as a shared executor contract.
- retired gateway, federation, routed-action, onboarding, acceptance, governance, and example corpora live outside this active contract root.

## File Inventory

- `workstreams.json`
- `domains.json`
- `stage-selection-vocabulary.json`
- `family-executor-adapter-defaults.json`
- `managed-runtime-three-layer-contract.json`
- `runtime-manager-contract.json`
- `family-runtime-online-substrate-contract.json`
- `family-runtime-attempt-contract.json`
- `family-transition-runner-contract.json`
- `functional-agent-runtime-harness-contract.json`
- `domain-pack-compiler-contract.json`
- `generic-substrate-projection-contract.json`
- `standard-domain-agent-skeleton-contract.json`
- `fresh-install-test-matrix.json`
- `public-surface-index.json`
- `task-topology.json`

## Reading Rule

- treat this directory as the active OPL framework contract set
- treat `opl framework locate` / `opl_framework_locator` as the stable way for standalone OPL-compatible agents to find their external OPL Framework dependency
- treat Runtime Manager, family runtime attempt, family transition runner, functional agent runtime harness, domain pack compiler, and standard domain-agent skeleton contracts as active for the provider-backed family runtime and generated-surface line
- keep domain truth owned by the linked domain repositories, not by this directory
- Foundry Agents should declare and adapt to these framework contracts instead of vendoring or forking their own OPL runtime truth
- treat One Person Lab App as a projection consumer and workbench surface, not as a runtime provider or domain authority
