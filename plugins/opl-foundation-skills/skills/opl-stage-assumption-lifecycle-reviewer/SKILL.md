---
name: opl-stage-assumption-lifecycle-reviewer
description: "Use when reviewing OPL family stage assumption lifecycle projections, stale or missing assumptions, monitor gaps, owner gaps, minimal counterexamples, repair actions, and no-authority route-back recommendations."
---

# OPL Stage Assumption Lifecycle Reviewer

Use this skill to turn `family-stage-assumption-lifecycle` projections into an AI-readable review brief. Keep the split strict: the projection counts freshness and monitor state; this skill explains which assumption matters, what it breaks, who owns the next repair, and what evidence would clear the warning.

## OPL Owner Boundary

- Treat the stage pack, domain owner, runtime ledger, monitor refs, and assumption lifecycle projection as the authority for recorded state.
- Treat this Skill as the AI-first reviewer for assumption meaning, stage impact, monitor completeness, owner-route clarity, and repair recommendation quality.
- Do not execute stages, mutate lifecycle projections, write domain truth, sign owner receipts, create typed blockers, authorize quality verdicts, mutate artifacts, or declare readiness.
- A lifecycle review is not an assumption status update, owner acceptance, domain ready claim, runtime ready claim, quality verdict, or production ready claim.

## AI-first / Contract-light Semantics

- Use projections and modules only for assumption identity, owner refs, monitor refs, lifecycle counts, recovery, and verification.
- Keep elastic review in this Skill: explain why the assumption matters, what stage path it affects, who owns repair, and what route-back clears it.
- If the projection is too thin, name the missing ref or owner route instead of turning assumption meaning into a deterministic module.

## Inputs

- `opl_family_stage_assumption_lifecycle` projection refs.
- Stage pack, plane, stage graph, monitor, owner route, runtime/readback, and evidence refs when available.
- Related stage gate, source-spec, replay-certification, cohort-loop, or proof-bundle refs when the assumption affects them.

## Workflow

1. Identify the target `plane_id`, `target_domain_id`, stage ids, and lifecycle projection ref.
2. Read each non-current assumption before summarizing counts. Counts are triage hints, not impact analysis.
3. Classify each finding:
   - `stale_assumption`: observed evidence is older than the declared freshness window;
   - `missing_monitor`: no monitor ref can show whether the assumption still holds;
   - `missing_owner`: no owner can repair or waive the assumption;
   - `invalidated_by_ref`: the projection names evidence that contradicts the assumption;
   - `repair_action_gap`: the proposed repair is too vague to execute;
   - `no_issue_found`: no lifecycle action is needed.
4. Map every material finding to stage impact: launch safety, evidence freshness, owner route, replay, cohort loop, quality gate, artifact mutation, or operator attention only.
5. Recommend the smallest legal next action: add monitor ref, refresh observed evidence, clarify owner, route to domain owner, route to Stagecraft, or leave as warning.
6. Keep warnings fail-open unless the owning contract binds the assumption to a claim gate or authority gate.

## Output Shape

Return:

- `assumption_lifecycle_ref`;
- `reviewed_stage_refs`;
- `finding_class`;
- `stage_impact`;
- `owner_route`;
- `recommended_repair_action`;
- `evidence_needed`;
- `severity_recommendation`: `operator_attention`, `route_back`, or `owner_gate_needed`;
- `authority_boundary`: no owner receipts, no typed blockers, no lifecycle mutation, no domain truth, no quality verdict, no readiness claim.
