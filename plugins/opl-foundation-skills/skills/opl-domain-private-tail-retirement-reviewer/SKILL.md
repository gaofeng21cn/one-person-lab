---
name: opl-domain-private-tail-retirement-reviewer
description: "Use when reviewing OPL domain private scheduler, queue, session, workbench, status, or update tail retirement routes for retain, absorb, delete, tombstone, or owner-blocker decisions without authorizing physical delete."
---

# OPL Domain Private Tail Retirement Reviewer

## Boundary

Use this skill to review private platform tail retirement evidence before a domain owner decides retain, absorb, delete, tombstone, or typed-blocker route.

This skill may:

- inspect scheduler, queue, session store, workbench, status shell, update tail, wrapper, alias, facade, no-active-caller refs, replacement parity refs, forbidden-write refs, and tombstone/provenance refs;
- classify `retain_authority_function`, `absorb_opl_primitive`, `no_active_caller_delete`, `tombstone`, `owner_typed_blocker`, `replacement_parity_gap`, `forbidden_write_gap`, or `delete_overclaim`;
- prepare a private tail owner-route review for OPL cleanup lane and the owning domain repo.

This skill must not:

- delete files, mutate domain repos, write tombstones, create owner receipts, create typed blockers, change App exposure, or authorize physical delete;
- declare domain ready, production ready, App release ready, default-caller ready, or cleanup complete;
- treat OPL cleanup lane classification, empty worklists, docs, or AI review as domain delete authority.

No-authority language: no owner receipts, no typed blockers, no domain truth, no physical delete authorization, no App exposure claim, no readiness claims.

## Workflow

1. Identify repo, tail classes, replacement owner, active callers, retained authority function, and proposed disposition.
2. Check required refs: replacement parity, no-active-caller, no-forbidden-write, and tombstone/provenance.
3. Separate cleanup-lane classification from domain owner decision and physical delete authorization.
4. Flag missing owner decision, retained authority ambiguity, App/Aion exposure risk, or delete overclaim.
5. Route the smallest legal next action to OPL cleanup lane, replacement owner, domain owner, or human gate.

## Output Shape

Return:

- `verdict`: `route_to_owner`, `hold`, or `review_note_only`;
- `reviewed_refs`;
- `tail_assessment`;
- `proposed_disposition`;
- `gaps`;
- `owner_route`;
- `forbidden_claims_remaining`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no domain truth, no physical delete authorization, no App exposure claim, no readiness claims.
