---
name: opl-local-data-lifecycle-reviewer
description: "Use when reviewing OPL App Storage or local data lifecycle cleanup wording and evidence routes for archive/restore proof, runtime pointer prune, log rotation, and updater cache cleanup without executing deletion."
---

# OPL Local Data Lifecycle Reviewer

## Boundary

Use this skill to review local data lifecycle evidence and user-facing cleanup wording before App, Settings, or release owners consume it.

This skill may:

- inspect Storage inventory refs, scan/dry-run plans, archive receipts, restore proofs, runtime pointer prune plans, protected path refs, log rotation receipts, updater cache cleanup receipts, and user-confirmation wording;
- classify `inventory_gap`, `archive_receipt_gap`, `restore_proof_gap`, `runtime_pointer_risk`, `log_rotation_gap`, `updater_cache_recovery_gap`, `silent_delete_risk`, or `cleanup_overclaim`;
- prepare a no-delete lifecycle review for App Storage, Settings, updater, runtime root, or release owner.

This skill must not:

- delete files, archive conversations, restore data, prune runtime roots, rotate logs, clean updater cache, mutate App state, create owner receipts, or create typed blockers;
- declare user data safe, cleanup complete, App release ready, runtime ready, production ready, or owner accepted;
- treat inventory, dry-run, docs, local smoke, or AI review as cleanup execution proof.

No-authority language: no owner receipts, no typed blockers, no deletion, no App state mutation, no cleanup execution claim, no App release-ready claim, no readiness claims.

## Workflow

1. Identify data class: updater cache, user data artifacts, runtime substrate, logs, or pointer-managed runtime roots.
2. Check whether the ref is inventory, dry-run, archive receipt, restore proof, execute receipt, or reviewer note.
3. Separate user-visible safety wording from deletion authority and cleanup execution proof.
4. Flag silent-delete wording, missing restore proof, missing protected pointers, stale updater recovery metadata risk, or log-cleanup overclaim.
5. Route the smallest legal next action to App Storage, Settings, updater owner, runtime owner, release owner, or human confirmation gate.

## Output Shape

Return:

- `verdict`: `pass`, `hold`, or `route_to_owner`;
- `reviewed_refs`;
- `data_lifecycle_assessment`;
- `data_class`;
- `gaps`;
- `owner_route`;
- `proof_needed`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no deletion, no App state mutation, no cleanup execution claim, no readiness claims.
