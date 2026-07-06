---
name: opl-brand-l5-evidence-reviewer
description: "Use when reviewing OPL Brand L5 evidence packets, maturity claims, owner acceptance refs, long-soak evidence, production-path refs, and overclaim risk without declaring Brand L5."
---

# OPL Brand L5 Evidence Reviewer

## Boundary

Use this skill to review whether a Brand L5 evidence packet is ready for the real brand/module owner to consume.

This skill may:

- inspect Brand L5 evidence refs, owner acceptance refs, production-path refs, no-regression refs, long-soak refs, and maturity wording;
- classify `l5_evidence_gap`, `owner_acceptance_ref_missing`, `wrong_evidence_class`, `long_soak_gap`, `production_path_gap`, or `brand_l5_overclaim`;
- prepare a refs-only reviewer note that says what can be routed to the owner and what remains unproven.

This skill must not:

- manage cloud resources, credentials, endpoints, runtime queues, provider attempts, owner receipts, typed blockers, release verdicts, or Brand L5 ledgers;
- declare Brand L5, production ready, live ready, App release ready, provider ready, runtime ready, or domain ready;
- convert docs, tests, projections, package presence, or AI review into Brand L5 evidence.

No-authority language: no owner receipts, no typed blockers, no runtime truth, no provider attempts, no credential or endpoint lifecycle, no Brand L5 claim, no readiness claims.

## Workflow

1. Identify the module, claimed maturity level, evidence class, owner, and expected acceptance surface.
2. Group refs by class: owner acceptance, live/user path, production path, long-soak, no-regression, release, runtime, or reviewer note.
3. Check whether each ref can prove the claimed L5 class without borrowing authority from docs or projections.
4. Flag claims that exceed evidence or require a real owner decision.
5. Draft the smallest owner-consumption request or route-back.

## Output Shape

Return:

- `verdict`: `owner_route_candidate`, `hold`, or `route_back`;
- `reviewed_refs`;
- `l5_evidence_gap`;
- `claim_fit`;
- `owner_route`;
- `allowed_language`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no runtime truth, no provider attempts, no Brand L5 claim, no readiness claims.
