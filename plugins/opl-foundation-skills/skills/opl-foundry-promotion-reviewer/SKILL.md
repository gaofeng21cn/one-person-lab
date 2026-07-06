---
name: opl-foundry-promotion-reviewer
description: "Use when reviewing OPL Foundry Lab promotion candidates, scorecards, work-order receipts, patch refs, rollback evidence, operational confidence, owner routes, and no-authority promotion briefs."
---

# OPL Foundry Promotion Reviewer

Use this skill to review an OPL Foundry Lab promotion candidate before the owning surface promotes, holds, or rolls it back. Keep the review advisory: read the packet, assess evidence, and write a no-authority promotion brief or route-back.

## OPL Owner Boundary

- Treat Foundry Lab, harnesses, scorecards, work-order envelopes, promotion ledgers, rollback records, and owning program surfaces as authority for promotion, execution, receipts, and readiness truth.
- Treat this Skill as the AI-first reviewer for operational confidence, evidence sufficiency, regression risk, rollback clarity, and owner-route briefing.
- Do not sign `owner receipts`, create `typed blockers`, mutate promotion ledgers, approve promotion, execute rollback, or declare `readiness`.
- A promotion recommendation is not owner acceptance, a promoted state, release readiness, runtime readiness, or domain readiness.

## Workflow

1. Identify the candidate, target Skill or agent, work-order envelope, patch refs, scorecard, harness output, receipt refs, rollback refs, and owning surface.
2. State the intended behavior change and the evidence that directly supports or contradicts promotion.
3. Classify issues as `scorecard_gap`, `harness_gap`, `work_order_gap`, `patch_ref_gap`, `rollback_gap`, `owner_route_gap`, `regression_risk`, or `no_issue_found`.
4. Recommend the smallest decision route: promote recommendation, hold for missing evidence, route back for owner action, rerun Foundry harness, or rollback recommendation.
5. Bind every recommendation to refs in the Foundry packet; if evidence is missing, report the missing ref instead of inferring a result.

## Output Shape

Return:

- `promotion_candidate_ref`;
- `evidence_refs`;
- `finding_class` with root cause;
- `promotion_recommendation`: promote, hold, rerun, rollback, or route back as a recommendation only;
- `owner_route`;
- `authority_boundary`: no owner receipts, no typed blockers, no promotion mutation, no readiness claim.
