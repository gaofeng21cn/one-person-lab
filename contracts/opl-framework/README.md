# OPL Framework Contracts

This directory preserves the active `OPL Framework` runtime and family control-plane contract corpus. `One Person Lab App` and Foundry Agents may consume these contracts, but this directory does not define a second runtime truth for the App or any domain agent.

It is repo-tracked because the current framework needs stable machine-readable inputs for:

- stage-led task selection
- product-layer ownership for `OPL Framework`, `One Person Lab App`, and `Foundry Agents`
- admitted domain-agent / Foundry package catalog projection
- provider-backed runtime attempts
- domain-neutral transition table runner and matrix evaluation
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
- `family-runtime-online-substrate-contract.json`, `family-runtime-attempt-contract.json`, `family-transition-runner-contract.json`, `standard-domain-agent-skeleton-contract.json`, `managed-runtime-three-layer-contract.json`, and `runtime-manager-contract.json` are active provider-backed runtime/control-plane contracts. `family-runtime-online-substrate-contract.json` also declares the Temporal provider SLO cadence action envelope used to route supervised production proof execution without authorizing domain readiness.
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
- `standard-domain-agent-skeleton-contract.json`
- `fresh-install-test-matrix.json`
- `public-surface-index.json`
- `task-topology.json`

## Reading Rule

- treat this directory as the active OPL framework contract set
- treat `opl framework locate` / `opl_framework_locator` as the stable way for standalone OPL-compatible agents to find their external OPL Framework dependency
- treat Runtime Manager, family runtime attempt, family transition runner, and standard domain-agent skeleton contracts as active for the provider-backed family runtime line
- keep domain truth owned by the linked domain repositories, not by this directory
- Foundry Agents should declare and adapt to these framework contracts instead of vendoring or forking their own OPL runtime truth
- treat One Person Lab App as a projection consumer and workbench surface, not as a runtime provider or domain authority
