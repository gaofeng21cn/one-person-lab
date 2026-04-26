# OPL Gateway Contracts

This directory preserves the legacy gateway/federation contract corpus from the earlier gateway-first phase of `One Person Lab`.

It is still repo-tracked because parts of the corpus remain useful for:

- audit and historical tracing
- compatibility checks
- schema archaeology
- a small set of shared compatibility artifacts still referenced by repo-tracked tests or manifests

It is no longer the default public integration contract for today's `OPL`.
The current mainline is `Codex-default session/runtime + explicit activation layer + family skill sync/discovery`.

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
- `managed-runtime-three-layer-contract.json`, `runtime-manager-contract.json`, and `family-executor-adapter-defaults.json` remain useful as shared compatibility artifacts.
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

- treat this directory as legacy compatibility material unless a newer core doc explicitly says otherwise
- do not use it as the default implementation basis for today's `OPL`
- keep domain truth owned by the linked domain repositories, not by this directory
