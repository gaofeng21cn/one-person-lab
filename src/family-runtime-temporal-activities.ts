import { heartbeat } from '@temporalio/activity';

import type { TemporalStageAttemptWorkflowInput } from './family-runtime-temporal.ts';

export async function codexStageActivity(input: TemporalStageAttemptWorkflowInput) {
  heartbeat({
    stage_attempt_id: input.stage_attempt_id,
    stage_id: input.stage_id,
    checkpoint_refs: input.checkpoint_refs ?? [],
  });
  return {
    surface_kind: 'temporal_codex_stage_activity_receipt',
    activity_kind: 'codex_stage_activity',
    activity_status: 'completed',
    stage_attempt_id: input.stage_attempt_id,
    stage_id: input.stage_id,
    executor_kind: input.executor_kind,
    checkpoint_refs: input.checkpoint_refs ?? [],
    stage_packet_ref: input.stage_packet_ref ?? null,
    authority_boundary: {
      opl: 'activity_packet_and_receipt_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

export async function domainSidecarDispatchActivity(input: TemporalStageAttemptWorkflowInput) {
  heartbeat({
    stage_attempt_id: input.stage_attempt_id,
    stage_id: input.stage_id,
  });
  return {
    surface_kind: 'temporal_domain_sidecar_dispatch_receipt',
    activity_kind: 'domain_sidecar_dispatch_activity',
    activity_status: 'completed',
    stage_attempt_id: input.stage_attempt_id,
    domain_id: input.domain_id,
    closeout_refs: input.closeout_packet && Array.isArray(input.closeout_packet.closeout_refs)
      ? input.closeout_packet.closeout_refs
      : [`temporal://${input.workflow_id}/domain-sidecar-dispatch`],
    consumed_refs: [],
    rejected_writes: [],
    next_owner: input.domain_id,
    domain_ready_verdict: 'domain_gate_pending',
    authority_boundary: {
      opl: 'sidecar_transport_only',
      domain: 'sidecar_dispatch_and_receipt_owner',
    },
  };
}
