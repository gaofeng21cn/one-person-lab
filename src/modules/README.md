# OPL Framework Source Modules

Owner: `OPL Framework`
Purpose: `source_module_physical_index`
State: `active_source_index`
Machine boundary: This directory is the physical entrypoint index for OPL brand modules. Runtime truth, domain truth, artifact bodies, owner receipts, typed blockers, and production readiness stay with their owning runtime, domain, contract, or ledger surfaces.

## Read Order

Use this directory to find the source owner for new framework work:

1. Pick the matching brand module directory.
2. Read that module's `index.ts` for the contract ref and current legacy source globs.
3. Add new module-owned code under `src/modules/<module_id>/` unless an existing legacy file is the smaller, clearer edit.

The canonical machine map is `contracts/opl-framework/source-module-map.json`.

## Modules

- `charter`: contracts, naming, governance, shared type spine.
- `atlas`: descriptors, catalogs, domain discovery, metadata graph.
- `workspace`: project topology, files, workspace validation.
- `pack`: domain packs, capability ABI, generated surfaces, skills.
- `stagecraft`: stages, cognitive computation, policies, handoff.
- `runway`: runtime execution, queues, providers, recovery.
- `ledger`: refs-only evidence, receipts, provenance, lineage.
- `console`: App/operator projections, actions, drilldown.
- `foundry-lab`: agent creation, conformance, evaluation, promotion.
- `connect`: adapters, connectors, install/update, plugin/skill sync.

