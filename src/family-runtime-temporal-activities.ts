import { heartbeat } from '@temporalio/activity';

import type { TemporalStageAttemptWorkflowInput } from './family-runtime-temporal.ts';
import {
  buildCodexStageRunnerReceipt,
  normalizeTypedStageCloseoutPacket,
} from './family-runtime-codex-stage-runner.ts';

export async function codexStageActivity(input: TemporalStageAttemptWorkflowInput) {
  const observedAt = new Date().toISOString();
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
    ...buildCodexStageRunnerReceipt({
      attempt: input as unknown as Record<string, unknown>,
      stagePacketRef: input.stage_packet_ref,
      runnerMode: input.codex_stage_runner?.runner_mode,
      observedAt,
    }),
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
  const closeout = input.closeout_packet
    ? normalizeTypedStageCloseoutPacket(input.closeout_packet)
    : null;
  return {
    surface_kind: 'temporal_domain_sidecar_dispatch_receipt',
    activity_kind: 'domain_sidecar_dispatch_activity',
    activity_status: 'completed',
    stage_attempt_id: input.stage_attempt_id,
    domain_id: input.domain_id,
    closeout_refs: closeout?.closeout_refs ?? [`temporal://${input.workflow_id}/domain-sidecar-dispatch`],
    consumed_refs: closeout?.consumed_refs ?? [],
    consumed_memory_refs: closeout?.consumed_memory_refs ?? [],
    writeback_receipt_refs: closeout?.writeback_receipt_refs ?? [],
    rejected_writes: closeout?.rejected_writes ?? [],
    next_owner: closeout?.next_owner ?? input.domain_id,
    domain_ready_verdict: closeout?.domain_ready_verdict ?? 'domain_gate_pending',
    route_impact: closeout?.route_impact ?? {},
    closeout_packet_surface_kind: closeout?.surface_kind ?? null,
    authority_boundary: {
      opl: 'sidecar_transport_only',
      domain: 'sidecar_dispatch_and_receipt_owner',
    },
  };
}
