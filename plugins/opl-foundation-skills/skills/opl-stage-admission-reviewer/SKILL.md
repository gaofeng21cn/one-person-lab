---
name: opl-stage-admission-reviewer
description: "Use when reviewing OPL family stage admission projections, schema fit, trust lanes, composition obligations, human-review burden, failure localization, and no-authority route-back recommendations."
---

# OPL Stage Admission Reviewer

Use this skill to review `family_stage_admission_review` projections against `contracts/family-orchestration/family-stage-admission.schema.json`. Keep the split strict: the projection records contract/check status; this skill explains whether the stage is understandable, localized, and legally routable before an owner surface treats it as admitted.

## OPL Owner Boundary

- Treat `family-stage-admission.schema.json`, stage packs, Stagecraft contracts, domain owner refs, runtime event refs, human-review refs, and admission projections as the authority for recorded state.
- Treat this Skill as the AI-first reviewer for projection/schema readability, trust-lane clarity, composition obligations, failure localization, human-review burden, and route-back language.
- Do not execute stages, mutate admission projections, write domain truth, sign owner receipts, create typed blockers, authorize quality verdicts, mutate artifacts, or declare readiness.
- A stage admission review is not stage execution, owner acceptance, domain ready, runtime ready, production ready, quality verdict, typed blocker, or owner receipt.

## Inputs

- `family_stage_admission_review` projection packets or readback refs.
- `contracts/family-orchestration/family-stage-admission.schema.json`.
- Stage pack, Stagecraft, owner route, runtime event, tool-affordance, human-review burden, and failure-localization refs when available.

## Workflow

1. Identify `plane_id`, `target_domain_id`, admission `status`, stage count, and authority boundary.
2. Check schema-facing shape first:
   - each `stage_result` names `stage_id`, `status`, `trust_lane`, `effect_boundary`, `mode_tags`, runtime event refs, tool-affordance boundary, and finding counts;
   - `findings` carry severity, code, message, and enough stage/action/assumption/source refs to route the issue;
   - `failure_localization` uses a concrete lane and minimal counterexample instead of a generic blocked label;
   - `human_review_burden_budget` names gates, owners, missing refs, and budget status.
3. Review trust lanes:
   - `opl_framework`, `domain_agent`, `codex_executor`, `ai_decision`, `human_gate`, `external_system`, and `app_projection` are used as provenance/control lanes, not as readiness claims;
   - domain-owned truth, quality, artifact mutation, and owner receipt decisions remain outside OPL admission projection authority.
4. Review composition obligations:
   - stage dependencies, action refs, assumptions, mode tags, tool-affordance boundaries, and runtime-event obligations are visible enough for the next owner to repair;
   - missing contracts are reported as `needs_contracts`, not silently admitted.
5. Review human-review burden:
   - required human gates have owner refs and missing-ref explanations;
   - the projection does not turn human-review load into an AI approval or typed blocker.
6. Recommend the smallest legal next action: add missing ref, refresh projection, clarify trust lane, fix Stagecraft contract, route to domain owner, route to human owner, or leave as operator attention.

## Finding Classes

- `schema_shape_gap`;
- `trust_lane_gap`;
- `composition_obligation_gap`;
- `failure_localization_gap`;
- `human_review_burden_gap`;
- `owner_route_gap`;
- `authority_boundary_overclaim`;
- `readiness_overclaim`;
- `no_issue_found`.

## Output Shape

Return:

- `stage_admission_review_ref`;
- `reviewed_stage_refs`;
- `finding_class`;
- `missing_or_stale_refs`;
- `trust_lane_review`;
- `composition_obligation_review`;
- `failure_localization_review`;
- `human_review_burden_review`;
- `owner_route`;
- `recommended_delta`;
- `severity_recommendation`: `operator_attention`, `route_back`, or `owner_gate_needed`;
- `authority_boundary`: no stage execution, no domain truth, no owner receipts, no typed blockers, no quality verdict, no artifact mutation, no readiness claim.
