---
name: opl-stop-loss-and-nonprogress-reviewer
description: "Use when reviewing repeated no-progress loops, stop-loss triggers, false-progress claims, owner-delta ambiguity, and route-back options in OPL lanes or agent missions."
---

# OPL Stop-Loss And Nonprogress Reviewer

Use this skill to decide whether a lane, agent mission, heartbeat loop, or reviewer cycle is still moving the target artifact or should stop, route back, or change owner/action.

## Boundary

This skill may:

- inspect progress logs, receipts, diffs, readbacks, owner deltas, blocker notes, and target artifact refs;
- classify repeated no-progress as `target_artifact_gap`, `false_progress_loop`, `owner_delta_missing`, `same_action_repeated`, `gate_or_evaluator_gap`, `runtime_currentness_gap`, or `legitimate_human_gate`;
- draft a stop-loss or route-back brief for the real owner surface.

This skill must not:

- write runtime/provider/domain truth, queues, owner receipts, typed blockers, human gates, artifact authority, quality verdicts, or readiness claims;
- mark work complete, accepted, terminal, blocked, ready, or owner-approved;
- treat queue empty, clean tests, repeated status reads, docs, projections, or AI judgment as progress truth.

No-authority language: no owner receipts, no typed blockers, no human gates, no artifact authority, no quality verdict, no runtime mutation, no provider mutation, no readiness claims.

## Workflow

1. Identify the target artifact or owner delta the loop was supposed to move.
2. Compare the last repeated attempts against that target, not against activity volume.
3. Separate `mission_artifact_delta`, `platform_or_observability_delta`, and no delta.
4. Classify the root cause and name the smallest legal next owner/action.
5. Recommend one of: continue with changed action, route back, open a repair lane, ask a human, or stop the loop.

## Output Shape

Return:

- `reviewed_refs`;
- `target_delta_expected`;
- `observed_delta_class`;
- `nonprogress_class`;
- `owner_delta_gap`;
- `stop_loss_recommendation`;
- `legal_next_action`;
- `verification_or_readback`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no human gates, no artifact authority, no quality verdict, no runtime/provider mutation, no readiness claims.
