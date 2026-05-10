# OPL Gateway Contracts

This directory preserves the OPL gateway, runtime, and family control-plane contract corpus.

It is still repo-tracked because parts of the corpus remain useful for:

- audit and historical tracing
- compatibility checks
- schema archaeology
- a small set of shared compatibility artifacts still referenced by repo-tracked tests or manifests

Some gateway-first files remain compatibility material, but the Runtime Manager and family runtime contracts are active again for the Hermes-first online runtime line.
The current mainline is `Codex-default executor + explicit OPL activation + Hermes online runtime substrate + family skill sync/discovery`.

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

- `workstreams.json`, `domains.json`, `routing-vocabulary.json`, `handoff.schema.json`, `routed-actions.schema.json`, and `public-surface-index.json` are legacy gateway-first material.
- `family-runtime-online-substrate-contract.json`, `managed-runtime-three-layer-contract.json`, and `runtime-manager-contract.json` are active machine-readable runtime/control-plane contracts.
- `family-executor-adapter-defaults.json` remains useful as a shared executor compatibility artifact.
- onboarding, backlog, acceptance, example, and operating-record files remain reference-grade audit material.

Unless a newer core document explicitly promotes a file back into the active mainline, treat everything here as compatibility or historical support material.

## File Inventory

- `workstreams.json`
- `domains.json`
- `routing-vocabulary.json`
- `handoff.schema.json`
- `routed-actions.schema.json`
- `domain-onboarding-readiness.schema.json`
- `family-executor-adapter-defaults.json`
- `managed-runtime-three-layer-contract.json`
- `runtime-manager-contract.json`
- `family-runtime-online-substrate-contract.json`
- `fresh-install-test-matrix.json`
- `governance-audit.schema.json`
- `publish-promotion.schema.json`
- `acceptance-matrix.json`
- `public-surface-index.json`
- `task-topology.json`
- `candidate-domain-backlog.json`
- `phase-1-exit-activation-package.json`
- `minimal-admitted-domain-federation-activation-package.json`
- `operating-record-catalog.json`
- `surface-lifecycle-map.json`
- `surface-authority-matrix.json`
- `surface-review-matrix.json`

## Reading Rule

- treat gateway-first files as legacy compatibility material unless a newer core doc explicitly says otherwise
- treat Runtime Manager and family runtime contracts as active for the Hermes-first online runtime line
- keep domain truth owned by the linked domain repositories, not by this directory
