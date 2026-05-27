import type { TemporalStageAttemptWorkflowInput } from '../family-runtime-temporal.ts';

export function temporalProductionProbeInput(
  suffix: string,
  closeoutPacket: Record<string, unknown> | null,
): TemporalStageAttemptWorkflowInput {
  return {
    stage_attempt_id: `sat_temporal_production_${suffix}`,
    workflow_id: `wf_temporal_production_${suffix}`,
    domain_id: 'medautoscience',
    stage_id: 'production-residency-proof',
    workspace_locator: {
      workspace_root: '/tmp/opl-temporal-production-residency-proof',
      artifact_root: '/tmp/opl-temporal-production-residency-proof/artifacts',
    },
    source_fingerprint: `sha256:temporal-production-residency-${suffix}`,
    executor_kind: 'codex_cli',
    retry_budget: {
      max_attempts: 3,
    },
    task_id: `task-temporal-production-residency-${suffix}`,
    stage_packet_ref: `packet:temporal-production-residency:${suffix}`,
    checkpoint_refs: [`checkpoint:temporal-production-residency:${suffix}`],
    closeout_packet: closeoutPacket,
  };
}

export function temporalProductionTypedCloseoutPacket() {
  return {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:temporal-production-residency-domain-closeout'],
    consumed_refs: ['evidence:temporal-production-residency'],
    consumed_memory_refs: ['memory:publication-route-production-residency'],
    writeback_receipt_refs: ['memory-writeback:temporal-production-residency-receipt'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      decision: 'production_residency_transport_probe',
      next_owner: 'med-autoscience',
    },
  };
}
