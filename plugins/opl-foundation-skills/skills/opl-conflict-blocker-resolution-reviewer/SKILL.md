---
name: opl-conflict-blocker-resolution-reviewer
description: "Use when reviewing OPL family conflict/blocker envelopes, duplicate tasks, authority conflicts, evidence or quality blockers, human gates, retry/dead-letter outcomes, and operator next-action explanations."
---

# OPL Conflict Blocker Resolution Reviewer

Use this skill to review `opl_conflict_or_blocker.v1` envelopes against `contracts/family-orchestration/family-conflict-envelope.schema.json`. Keep the split strict: the envelope fail-closes unsafe work; this skill explains the blocker, owner route, allowed next action, and operator wording without resolving authority by itself.

## OPL Owner Boundary

- Treat `family-conflict-envelope.schema.json`, runtime queues, owner route refs, provider receipts, domain owner refs, human-gate refs, and conflict/blocker envelopes as the authority for recorded state.
- Treat this Skill as the AI-first reviewer for classification clarity, duplicate-task identity, authority routing, evidence/quality blocker explanation, human-gate burden, retry/dead-letter semantics, and operator next-action wording.
- Do not execute tasks, mutate queues, write domain truth, sign owner receipts, create typed blockers, create human gates, authorize quality verdicts, mutate artifacts, or declare readiness.
- A conflict/blocker review is route/project/audit only. It is not blocker resolution, owner acceptance, fallback completion, domain ready, runtime ready, production ready, typed blocker creation, human-gate creation, or owner receipt.

## Inputs

- `opl_conflict_or_blocker.v1` envelopes and readback refs.
- `contracts/family-orchestration/family-conflict-envelope.schema.json`.
- Subject identity refs, idempotency keys, owner route refs, evidence refs, provider/retry/dead-letter refs, human-gate refs, and closeout receipt refs when available.

## Workflow

1. Identify `subject`, optional `identity`, `classification`, `owner`, `authority`, `status`, `reason`, and authority boundary.
2. Check identity and duplicate-task handling:
   - `domain`, `stage_id`, `task_kind`, `source_fingerprint`, and `idempotency_key` are present;
   - duplicate or deduplicated tasks preserve the source refs needed to compare work units.
3. Review classification:
   - `duplicate_task` names the competing work and dedupe action;
   - `authority_conflict` names the owner surface that must decide;
   - `evidence_blocker` and `quality_blocker` name missing/failed refs without inventing a quality verdict;
   - `human_gate` names the human decision and why automation cannot proceed;
   - `execution_retryable` distinguishes retryable provider/runtime failure from domain acceptance;
   - `identity_incomplete` names the missing identity field;
   - `receipt_conflict` names the conflicting receipt refs.
4. Review status and retry/dead-letter semantics:
   - `retry_scheduled` has an allowed retry action and does not imply progress;
   - `dead_lettered` names the failed owner route and legal recovery path;
   - `conflict_fail_closed`, `blocked`, `waiting_for_human`, and `deduplicated` are explained as current control states, not completion.
5. Review operator explanation:
   - `allowed_next_actions` are concrete and legal;
   - `forbidden_actions` protect domain truth, fallback completion, queue mutation, owner receipts, typed blockers, human gates, and readiness claims;
   - `operator_label` and `operator_questions` explain the next decision in user-facing terms.
6. Recommend the smallest legal next action: dedupe, route to domain owner, request evidence, request human decision, retry through the runtime owner, dead-letter repair, identity repair, or hold fail-closed.

## Finding Classes

- `duplicate_task_identity_gap`;
- `authority_conflict_route_gap`;
- `evidence_blocker_ref_gap`;
- `quality_blocker_overclaim`;
- `human_gate_question_gap`;
- `retry_semantics_gap`;
- `dead_letter_route_gap`;
- `operator_next_action_gap`;
- `forbidden_action_gap`;
- `authority_boundary_overclaim`;
- `no_issue_found`.

## Output Shape

Return:

- `conflict_envelope_ref`;
- `subject_identity`;
- `classification_review`;
- `owner_route`;
- `evidence_refs_review`;
- `retry_or_dead_letter_review`;
- `operator_next_action`;
- `forbidden_action_review`;
- `recommended_delta`;
- `severity_recommendation`: `operator_attention`, `route_back`, or `owner_gate_needed`;
- `authority_boundary`: route/project/audit only, no queue mutation, no domain truth, no owner receipts, no typed blockers, no human-gate creation, no quality verdict, no fallback completion, no readiness claim.
