---
name: opl-console-operator-copilot
description: "Use when interpreting OPL Console/App operator projections, current_owner_delta, action catalogs, first-run readiness wording, Settings IA, Runtime page task awareness, user workbench actions, release evidence refs, and forbidden claims without executing actions or claiming App, domain, runtime, release, or readiness status."
---

# OPL Console Operator Copilot

## Boundary

- Treat Console/App projections, Settings Control Center, first-run/onboarding refs, Runtime page projections, user workbench action catalogs, release evidence refs, current_owner_delta, runtime/readback surfaces, and domain owners as the authorities for their own facts.
- Use this skill only to interpret current projections, compare legal next actions, review operator-facing wording, and explain forbidden claims to an operator.
- Do not execute actions, enqueue work, mutate runtime state, sign owner receipts, create typed blockers, change domain truth, assert artifact authority, or make App release/domain/runtime readiness claims.
- If projection evidence and owner/runtime evidence disagree, classify the mismatch and route to the owning surface instead of choosing a truth source.

## Workflow

1. Identify the operator question: `current_owner_delta`, `action_catalog`, `projection_readback`, `next_action_choice`, `first_run_or_onboarding`, `settings_ia`, `runtime_task_awareness`, `user_workbench_action`, `release_evidence_ref`, `forbidden_claim_review`, or `route_back`.
2. Read the current projection refs and any linked owner/runtime refs. Do not infer beyond the refs provided.
3. Classify available actions:
   - `safe_read`: inspect or explain state;
   - `candidate_prepare`: prepare a packet or evidence brief;
   - `owner_route`: requires domain, runtime, App, or human owner action;
   - `forbidden`: would mutate authority, execute an action, or overclaim readiness.
4. For each plausible next action, state owner, required input, expected output ref, forbidden side effects, and proof needed after execution by the real owner.
5. For App/operator UX questions, separate `Core safe to enter`, `Full/background pending`, `secondary/deep-link/advanced route`, `release evidence candidate`, and `not proven` so ordinary navigation is not blocked by deep diagnostics or unproved release claims.
6. Prefer the smallest legal operator move. If no legal move exists from the current projection, produce a route-back or missing-evidence note.
7. Keep wording claim-safe: distinguish `projection says`, `owner ref proves`, `runtime readback proves`, and `not proven`.

## Output Shape

Return:

- `operator_question`;
- `projection_refs`;
- `owner_or_runtime_refs`;
- `current_interpretation`;
- `action_options`: grouped as `safe_read`, `candidate_prepare`, `owner_route`, and `forbidden`;
- `operator_ux_review`: first-run, Settings IA, Runtime page, workbench action, or release evidence wording when relevant;
- `recommended_next_action`;
- `proof_needed_after_owner_action`;
- `forbidden_claims`: no action execution, no owner receipts, no typed blockers, no domain truth, no artifact authority, no App release/domain/runtime readiness claims.
