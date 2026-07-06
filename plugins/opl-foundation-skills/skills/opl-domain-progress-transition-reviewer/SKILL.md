---
name: opl-domain-progress-transition-reviewer
description: "Use when reviewing OPL domain progress transition packets, DomainProgressTransitionRuntime refs, owner delta transport, route-back candidates, and progress wording for no-authority boundary drift."
---

# OPL Domain Progress Transition Reviewer

## Boundary

Use this skill to review whether a domain progress transition packet is clear, evidence-bound, and routed to the right owner surface.

This skill may:

- inspect DomainProgressTransitionRuntime refs, current owner delta, transition candidates, and route-back packets;
- classify gaps as `missing_transition_ref`, `owner_delta_ambiguous`, `wrong_evidence_class`, `route_back_needed`, or `forbidden_progress_claim`;
- draft a `transition_recommendation` for the real runtime or domain owner to consume.

This skill must not:

- write runtime/provider/domain truth, queues, provider state, owner receipts, typed blockers, or readiness claims;
- mark domain progress accepted, terminal, complete, ready, or owner-approved;
- turn provider completion, clean read models, docs, tests, or refs-only transport into domain progress truth.

No-authority language: no owner receipts, no typed blockers, no domain truth, no runtime truth, no provider state, no domain progress claim, no readiness claims.

## Workflow

1. Identify the proposed transition: target domain, work unit, source refs, owner delta, and intended progress claim.
2. Separate transport evidence from authority evidence.
3. Check that the transition points back to the domain owner for acceptance, route-back, human gate, or typed blocker creation.
4. Classify missing or mismatched evidence without filling it with AI judgment.
5. Return the smallest legal next step: accept as reviewer note, route-back, request owner evidence, or hold the claim.

## Output Shape

Return:

- `verdict`: `pass`, `hold`, or `route_back`;
- `reviewed_refs`;
- `transition_recommendation`;
- `gaps`;
- `owner_route`;
- `forbidden_claims_remaining`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no domain truth, no runtime truth, no provider state, no domain progress claim, no readiness claims.
