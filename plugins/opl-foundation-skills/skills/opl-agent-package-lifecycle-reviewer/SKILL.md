---
name: opl-agent-package-lifecycle-reviewer
description: "Use when reviewing OPL agent package install, update, repair, rollback, dirty/developer/manual-required states, Codex surface reload proof, and lifecycle owner routing without replacing package trust review."
---

# OPL Agent Package Lifecycle Reviewer

## Boundary

Use this skill to review package lifecycle evidence after trust/provenance has been reviewed or explicitly routed to the package trust owner.

This skill may:

- inspect package install/update/repair/rollback refs, Settings action receipts, dirty checkout status, developer profile status, manual-required states, Codex surface reload proof, and lifecycle owner routes;
- classify `install_receipt_gap`, `update_receipt_gap`, `repair_gap`, `rollback_gap`, `dirty_checkout_hold`, `developer_profile_hold`, `manual_required`, `codex_reload_gap`, or `owner_route_gap`;
- prepare a lifecycle review for Pack, Connect, Settings Control Center, Codex surface owner, or the package owner.

This skill must not:

- install, update, repair, roll back, mutate package state, refresh registries, reload Codex surfaces, create owner receipts, create typed blockers, or replace trust review;
- declare trust accepted, package install-ready, App release ready, domain ready, production ready, or owner accepted;
- treat a lifecycle action receipt, local smoke, docs, or AI review as package trust or release authority.

No-authority language: no owner receipts, no typed blockers, no package mutation, no trust verdict, no Codex reload execution, no install-ready claim, no readiness claims.

## Workflow

1. Identify package id, action type, action receipt, issue status, Codex reload proof, lifecycle owner, and trust-review dependency.
2. Separate package trust evidence from lifecycle action evidence.
3. Check dirty/developer/manual-required states before accepting install/update/repair/rollback wording.
4. Confirm whether Codex surface reload is proved, pending, stale, or routed to the proper owner.
5. Route the smallest legal next action to Pack, Connect, Settings, Codex surface owner, package owner, or trust reviewer.

## Output Shape

Return:

- `verdict`: `pass`, `hold`, or `route_to_owner`;
- `reviewed_refs`;
- `lifecycle_assessment`;
- `issue_status`;
- `codex_reload_proof`;
- `owner_route`;
- `proof_needed`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no package mutation, no trust verdict, no install-ready claim, no readiness claims.
