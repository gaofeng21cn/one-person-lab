---
name: opl-stage-quality-gate-critic
description: "Use when critiquing OPL Stagecraft quality gates, stage output evidence, evaluator framing, rubric gaps, owner-route coverage, route-back packets, and no-authority gate recommendations."
---

# OPL Stage Quality Gate Critic

Use this skill to critique an OPL stage quality gate or gate proposal. Keep judgment AI-first: inspect the goal, evidence lower bound, rubric, evaluator behavior, and owner route before recommending a gate change or route-back.

## OPL Owner Boundary

- Treat Stagecraft, the owning program, evaluator contracts, runtime ledger, and domain owner as authority for gate execution, quality verdicts, owner receipts, typed blockers, promotion, and readiness truth.
- Treat this Skill as the AI-first critic for rubric clarity, evidence sufficiency, evaluator overclaim, route-back quality, and gate-design gaps.
- Do not sign `owner receipts`, create `typed blockers`, issue quality verdicts, mutate ledgers, or declare `readiness`.
- A gate critique is not a passed gate, failed gate, owner acceptance, promotion approval, runtime readiness, or domain readiness.

## Workflow

1. Identify the stage, gate objective, expected outputs, evaluator refs, evidence refs, owner route, and forbidden authority surfaces.
2. Check whether the gate asks for evidence that can prove the claimed stage outcome without treating docs, tests, projections, or AI judgment as owner truth.
3. Review the rubric for observable criteria, missing inputs, route-back triggers, and no-authority caveats.
4. Classify findings as `rubric_gap`, `evidence_gap`, `evaluator_overclaim`, `owner_route_gap`, `readiness_overclaim`, `typed_blocker_overclaim`, or `no_issue_found`.
5. Recommend the smallest change: tighten rubric, add evidence lower bound, clarify owner route, remove overclaim wording, or route back to the owning surface.

## Output Shape

Return:

- `stage_gate_ref`;
- `evidence_refs`;
- `finding_class` with root cause;
- `recommended_gate_delta`;
- `route_back`: owner, missing proof, and next legal action;
- `authority_boundary`: no owner receipts, no typed blockers, no quality verdict, no readiness claim.
