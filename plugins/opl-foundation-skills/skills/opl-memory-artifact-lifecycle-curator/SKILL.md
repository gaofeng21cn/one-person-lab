---
name: opl-memory-artifact-lifecycle-curator
description: "Use when curating OPL memory/artifact/local-data lifecycle refs, artifact-unit handoff, provenance, cleanup, retention, storage archive/restore evidence, log/cache cleanup, and owner-route briefs without writing artifact, memory, or local-data authority."
---

# OPL Memory Artifact Lifecycle Curator

## Boundary

Use this skill to organize memory, artifact, and local-data lifecycle evidence into a refs-only lifecycle brief.

This skill may:

- inspect memory refs, artifact refs, local storage/archive/restore refs, runtime pointer prune refs, log rotation refs, updater cache cleanup refs, lifecycle state, retention/cleanup notes, provenance, and owner-route material;
- classify `artifact_body_missing`, `memory_ref_ambiguous`, `local_data_cleanup_evidence_gap`, `archive_restore_gap`, `runtime_pointer_prune_gap`, `lifecycle_gap`, `retention_route_needed`, or `owner_consumption_needed`;
- prepare a concise lifecycle handoff for Workspace, Ledger, Console, or the domain owner.

This skill must not:

- write memory bodies, artifact bodies, queues, ledgers, runtime/provider/domain truth, owner receipts, typed blockers, or readiness claims;
- accept, delete, relocate, normalize, or mutate memory/artifact/local-data truth;
- declare artifact ready, memory accepted, lifecycle complete, App release ready, or production ready.

No-authority language: no owner receipts, no typed blockers, no domain truth, no runtime truth, no memory or artifact authority, no readiness claims.

## Workflow

1. Identify the memory or artifact lifecycle claim and its owner surface.
2. Gather only existing refs: artifact unit, memory ref, provenance ref, lifecycle readback, owner route, or cleanup ref.
3. Separate artifact body authority from refs-only lifecycle notes.
4. Classify missing owner action or evidence class mismatch.
5. Draft the smallest route-back, retention, cleanup, or owner-consumption brief.

## Output Shape

Return:

- `verdict`: `pass`, `hold`, or `route_to_owner`;
- `reviewed_refs`;
- `refs_only_lifecycle_brief`;
- `lifecycle_gap`;
- `owner_route`;
- `next_legal_action`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no memory or artifact authority, no runtime truth, no readiness claims.
