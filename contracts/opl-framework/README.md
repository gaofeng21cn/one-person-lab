# OPL Framework Contracts

This directory preserves the active OPL framework, runtime, and family control-plane contract corpus.

It is repo-tracked because the current framework needs stable machine-readable inputs for:

- stage-led task selection
- admitted domain-agent catalog projection
- provider-backed runtime attempts
- Runtime Manager readiness and state projection
- optional native-helper lifecycle checks

The current mainline is `Codex-default executor + explicit OPL activation + configured family runtime provider + family skill sync/discovery`.

## Current Truth Lives Elsewhere

Start here for the active `OPL` model:

- `README*`
- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/decisions.md`
- `contracts/README.md`

Read the linked domain repositories when you need the current repo-owned capability surfaces that `opl skill sync` activates.

## How To Read This Directory

- `workstreams.json`, `domains.json`, `routing-vocabulary.json`, `task-topology.json`, and `public-surface-index.json` define the active stage-led framework selection surface.
- `family-runtime-online-substrate-contract.json`, `family-runtime-attempt-contract.json`, `standard-domain-agent-skeleton-contract.json`, `managed-runtime-three-layer-contract.json`, and `runtime-manager-contract.json` are active provider-backed runtime/control-plane contracts.
- `family-executor-adapter-defaults.json` remains useful as a shared executor contract.
- retired gateway, federation, routed-action, onboarding, acceptance, governance, and example corpora live outside this active contract root.

## File Inventory

- `workstreams.json`
- `domains.json`
- `routing-vocabulary.json`
- `family-executor-adapter-defaults.json`
- `managed-runtime-three-layer-contract.json`
- `runtime-manager-contract.json`
- `family-runtime-online-substrate-contract.json`
- `family-runtime-attempt-contract.json`
- `standard-domain-agent-skeleton-contract.json`
- `fresh-install-test-matrix.json`
- `public-surface-index.json`
- `task-topology.json`

## Reading Rule

- treat this directory as the active OPL framework contract set
- treat Runtime Manager, family runtime attempt, and standard domain-agent skeleton contracts as active for the provider-backed family runtime line
- keep domain truth owned by the linked domain repositories, not by this directory
