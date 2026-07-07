---
name: opl-stage-quality-gate-critic
description: "Use when critiquing OPL Stagecraft quality gates, stage admission projections, stage output evidence, evaluator framing, rubric gaps, trust lanes, composition obligations, failure localization, human-review burden, owner-route coverage, route-back packets, and no-authority gate recommendations."
---

# OPL Stage Quality Gate Critic

Use this skill to critique an OPL stage quality gate, admission projection, or gate proposal. Keep judgment AI-first: inspect the goal, evidence lower bound, rubric, evaluator behavior, trust lane, composition obligations, failure localization, human-review burden, and owner route before recommending a gate change or route-back.

## OPL Owner Boundary

- Treat Stagecraft, the owning program, evaluator contracts, runtime ledger, and domain owner as authority for gate execution, quality verdicts, owner receipts, typed blockers, promotion, and readiness truth.
- Treat this Skill as the AI-first critic for rubric clarity, evidence sufficiency, evaluator overclaim, route-back quality, and gate-design gaps.
- Do not sign `owner receipts`, create `typed blockers`, issue quality verdicts, mutate ledgers, or declare `readiness`.
- A gate critique is not a passed gate, failed gate, owner acceptance, promotion approval, runtime readiness, or domain readiness.

## AI-first / Contract-light Semantics

- Use contracts and modules only as light guardrails for gate identity, refs, receipts, recovery, and verification.
- Keep elastic gate critique in this Skill: judge evidence fit, rubric quality, evaluator overclaim, owner route, and route-back wording.
- If a deterministic surface lacks the needed ref, report the missing proof or owner route instead of hardening a new contract rule.

## Workflow

1. Identify the stage, admission projection when present, gate objective, expected outputs, evaluator refs, evidence refs, trust lane, owner route, and forbidden authority surfaces.
2. Check whether the gate asks for evidence that can prove the claimed stage outcome without treating docs, tests, projections, or AI judgment as owner truth.
3. Review the rubric for observable criteria, missing inputs, route-back triggers, and no-authority caveats.
4. For stage admission packets, check `trust_lane`, `effect_boundary`, `mode_tags`, runtime event refs, tool-affordance boundary, failure localization, and `human_review_burden_budget` without treating admission projection as owner acceptance.
5. Classify findings as `rubric_gap`, `evidence_gap`, `evaluator_overclaim`, `stage_admission_shape_gap`, `trust_lane_gap`, `composition_obligation_gap`, `failure_localization_gap`, `human_review_burden_gap`, `owner_route_gap`, `readiness_overclaim`, `typed_blocker_overclaim`, or `no_issue_found`.
6. Recommend the smallest change: tighten rubric, add evidence lower bound, clarify trust lane, fix admission refs, clarify owner route, remove overclaim wording, or route back to the owning surface.

## Legacy Coverage

This critic covers the retired `opl-stage-admission-reviewer` entry. Stage admission projections are reviewed here as quality-gate, trust-lane, evidence, and owner-route questions.

## Output Shape

Return:

- `stage_gate_ref`;
- `evidence_refs`;
- `finding_class` with root cause;
- `recommended_gate_delta`;
- `route_back`: owner, missing proof, and next legal action;
- `authority_boundary`: no owner receipts, no typed blockers, no quality verdict, no readiness claim.
