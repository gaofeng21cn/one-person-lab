---
name: opl-stage-pack-source-replay-reviewer
description: "Use when reviewing OPL family stage-pack source specs and replay certifications, including body-free source diffs, visual-equivalent spec gaps, replay blockers, missing runtime event refs, missing receipt refs, and owner-route workorders."
---

# OPL Stage Pack Source Replay Reviewer

Use this skill to explain whether a body-free stage-pack source spec and replay certification are understandable, reviewable, and routable. Keep the machine layer light: source-spec and replay schemas hold refs and counts; this skill produces the AI-first operator review and route-back brief.

## OPL Owner Boundary

- Treat source-spec projections, replay-certification projections, append-only event logs, attempt ledgers, runtime events, owner receipts, and domain owners as authority for recorded facts.
- Treat this Skill as the AI-first reviewer for diff readability, replay blocker interpretation, missing receipt workorder quality, owner-route clarity, and overclaim prevention.
- Do not execute replay, re-query AI/human/external outcomes, write ledgers, sign owner receipts, create typed blockers, mutate source specs, mutate artifacts, or declare readiness.
- A review recommendation is not replay certification, owner acceptance, domain readiness, production readiness, or stage admission.

## AI-first / Contract-light Semantics

- Use source-spec and replay modules only for hashes, refs, event indexes, receipt pointers, recovery, and verification.
- Keep elastic replay review in this Skill: interpret source diffs, replay blockers, missing receipt workorders, owner routes, and route-back wording.
- If replay evidence is incomplete, name the missing runtime event or receipt ref instead of asking contracts to recompute outcomes.

## Cross-Domain Failure Patterns

Use these MAS/MAG/RCA/BookForge-derived patterns as replay review heuristics,
not new schema requirements:

- `critique_as_repair_hint`: a replay/source-spec critique can name a repair
  hint or owner workorder; it does not repair the pack, certify replay, or close
  the stage.
- `source_or_receipt_stale`: source-spec hashes, runtime events, owner receipts,
  visual export refs, grant package refs, or book artifact refs must match the
  current stage-pack identity before they can support replay evidence.
- `owner_route_overclaim`: owner-routed workorders, connector receipts, and
  replay-success refs are not domain owner acceptance, publication/grant/visual
  readiness, or production readiness.
- `candidate_body_reconstruction_forbidden`: body-free diffs and
  visual-equivalent claims must not be used to reconstruct clinical data, grant
  text, visual artifact body, manuscript body, prompt body, or candidate body.

## Inputs

- `opl_family_stage_pack_source_spec` refs.
- `opl_family_stage_replay_certification` refs.
- Related control-plane, proof-bundle, graph-projection, registry, assumption-lifecycle, cohort-loop, action-catalog, runtime-event, attempt-ledger, and receipt refs.

## Workflow

1. Identify the `stage_pack_id`, `target_domain_id`, `plane_id`, source-spec hash, stage-pack hash, and replay status.
2. Check source-spec reviewability:
   - required refs are present and body-free;
   - `diff_keys` explain what changed without leaking bodies;
   - `visual_equivalent` and `body_free` claims match the provided refs;
   - admission, registry, assumption, cohort, and replay signals are not overclaimed as domain readiness.
3. Check replay certification:
   - every stage has required runtime event refs and recorded event refs;
   - missing receipt refs are paired with owner-routed workorders;
   - blockers name missing proof instead of asking replay to recompute outcomes;
   - success paths close replay evidence only, not domain or production readiness.
4. Classify the primary finding:
   - `source_spec_ref_gap`;
   - `source_spec_diff_gap`;
   - `body_policy_overclaim`;
   - `replay_event_gap`;
   - `replay_receipt_gap`;
   - `critique_as_repair_hint_overclaim`;
   - `source_or_receipt_stale`;
   - `candidate_body_reconstruction_forbidden`;
   - `missing_workorder_route`;
   - `owner_route_gap`;
   - `readiness_overclaim`;
   - `no_issue_found`.
5. Recommend the smallest legal repair: add missing ref, tighten diff key, repair body policy, request owner receipt, add missing receipt workorder, route to domain owner, or hold replay review.

## Output Shape

Return:

- `stage_pack_source_spec_ref`;
- `replay_certification_ref`;
- `reviewed_stage_ids`;
- `finding_class`;
- `source_spec_review`;
- `replay_review`;
- `missing_evidence`;
- `owner_route`;
- `recommended_delta`;
- `authority_boundary`: no replay execution, no ledger writes, no owner receipts, no typed blockers, no artifact mutation, no domain truth, no readiness claim.
