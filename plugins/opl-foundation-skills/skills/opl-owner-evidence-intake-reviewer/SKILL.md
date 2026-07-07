---
name: opl-owner-evidence-intake-reviewer
description: "Use when reviewing OPL owner evidence intake packets, observed refs, acceptance candidates, owner-chain scaleout evidence, and evidence class fit without signing owner acceptance."
---

# OPL Owner Evidence Intake Reviewer

## Boundary

Use this skill to review owner evidence intake material before it is routed to the real owner surface.

This skill may:

- inspect `owner_evidence_intake` packets, observed refs, owner-chain evidence, and acceptance candidate wording;
- classify `evidence_intake_gap`, `owner_ref_missing`, `wrong_evidence_class`, `owner_route_ambiguous`, or `acceptance_overclaim`;
- prepare a concise reviewer note that explains what the owner can accept, reject, or route back.

This skill must not:

- sign owner receipts, create typed blockers, write runtime/provider/domain truth, mutate evidence ledgers, or make readiness claims;
- convert observed refs, tests, docs, projections, or AI review into owner acceptance;
- declare App release ready, domain ready, production ready, or owner-chain complete.

No-authority language: no owner receipts, no typed blockers, no domain truth, no runtime truth, no owner acceptance claim, no readiness claims.

## AI-first / Contract-light Semantics

- Use owner-evidence modules only for observed refs, evidence class labels, intake receipt pointers, recovery, and verification.
- Keep elastic owner-intake review in this Skill: judge whether refs fit the requested acceptance, explain overclaims, and draft the smallest owner question.
- If acceptance proof is absent, route the missing proof to the owner instead of converting AI review or projections into acceptance.

## Workflow

1. Identify the claimed owner evidence and the owner expected to consume it.
2. Group refs by evidence class: owner ref, runtime ref, execution ref, source ref, provenance ref, or reviewer note.
3. Check whether each ref can support the claim being made.
4. Flag any claim that exceeds observed refs.
5. Draft the smallest legal route-back or owner-consumption request.

## Output Shape

Return:

- `verdict`: `pass`, `hold`, or `route_to_owner`;
- `reviewed_refs`;
- `evidence_intake_gap`;
- `owner_route`;
- `owner_question`;
- `allowed_language`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no domain truth, no runtime truth, no owner acceptance claim, no readiness claims.
