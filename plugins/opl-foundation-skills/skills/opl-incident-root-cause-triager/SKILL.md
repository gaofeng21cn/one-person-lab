---
name: opl-incident-root-cause-triager
description: "Use when triaging OPL stalls, currentness drift, runtime/readback mismatch, heartbeat alerts, provider failures, owner-route gaps, repeated blocker loops, or false progress/readiness incidents. Applies L0-L4 root-cause depth and routes repair without writing authority surfaces."
---

# OPL Incident Root Cause Triager

Use this skill to move an incident report from surface status to an owner-routable root-cause brief. It is for diagnosis and routing only.

## Boundary

- Treat runtime/readback, provider receipts, owner receipts, typed blockers, domain truth, artifact authority, and release authority as owned by their real surfaces.
- Use this skill only to classify evidence, identify the failing boundary, and prepare repair or owner-route options.
- Do not write owner receipts, typed blockers, domain truth, artifact authority, runtime queues, provider state, readiness claims, release claims, or production claims.
- Do not close an incident by restating labels such as `blocked`, `idle`, `queue_empty`, `no_live_session`, or `stale` without the boundary and owner route.

Optional helper: `kernel.py` provides stdlib-only deterministic incident-ref normalization, L0-L4 triage skeleton/checklist builders, and authority-phrase linting. It is local support only: no file/network/subprocess use and no owner receipt, typed blocker, runtime queue, release, readiness, or production authority.

## Depth Ladder

- `L0_symptom`: visible state, alert, failure message, stalled lane, stale projection, or missing heartbeat.
- `L1_direct_boundary`: command, gate, queue, provider, projection, owner route, contract, dependency, artifact, or evaluator that emitted the symptom.
- `L2_cross_surface_evidence`: neighboring source that proves whether the boundary is current, stale, conflicting, or missing.
- `L3_owner_repair_path`: owner surface, allowed and forbidden write set, legal next action, verification/readback, and stop condition.
- `L4_prevention`: prompt, runbook, skill, contract, validator, automation, or workflow change that would prevent recurrence.

## Workflow

1. Classify incident kind: `stall`, `currentness_drift`, `runtime_mismatch`, `heartbeat_alert`, `provider_failure`, `owner_route_gap`, `blocker_loop`, or `false_progress_claim`.
2. Record the L0 symptom exactly, then find the L1 boundary that produced it.
3. Check at least one L2 neighboring surface when the incident concerns currentness, runtime, owner route, readiness, repeated stalls, or heartbeat behavior.
4. Classify root cause as one or more of:
   - `target_artifact_gap`;
   - `gate_or_evaluator_defect`;
   - `read_model_currentness_drift`;
   - `owner_route_or_authority_gap`;
   - `runtime_or_control_plane_defect`;
   - `provider_or_environment_failure`;
   - `legitimate_human_gate`.
5. For L3, name the next owner, legal action, expected artifact or readback, verification command/ref, and stopping condition.
6. Add L4 prevention only when the incident is repeated, caused a false claim, or exposed a reusable workflow gap.

## Output Shape

Return:

- `incident_kind`;
- `root_cause_depth`: L0 through reached level;
- `evidence_refs`;
- `root_cause_class`;
- `blocker_to_owner_map`;
- `legal_next_action`;
- `verification_or_readback`;
- `stop_condition`;
- `prevention_delta`;
- `no_authority_caveat`: no owner receipts, no typed blockers, no domain truth, no artifact authority, no runtime queues, no readiness/release/production claims.
