import { stringValue as optionalString } from '../../kernel/json-record.ts';
import type {
  StageCloseoutPacketRejection,
  TypedStageCloseoutPacket,
} from './family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
import type { JsonRecord } from './family-runtime-codex-stage-runner-parts/shared.ts';

export type StructuredCloseoutRepairClass =
  | 'closeout_materialization'
  | 'closeout_identity_mismatch'
  | 'closeout_semantics_missing'
  | 'closeout_execution_stalled'
  | 'executor_protocol_violation'
  | 'provider_unavailable'
  | 'sandbox_preflight_blocked'
  | 'activity_cancelled'
  | 'provider_runtime_blocker';

export function structuredCloseoutRepairClassFor(input: {
  blockedReason?: string | null;
  rejectionReason?: StageCloseoutPacketRejection['reason'] | null;
}): StructuredCloseoutRepairClass | null {
  const reason = input.blockedReason ?? (
    input.rejectionReason ? `typed_closeout_${input.rejectionReason}` : null
  );
  if (!reason) {
    return null;
  }
  if (
    reason === 'codex_cli_typed_closeout_not_materialized'
    || reason === 'typed_closeout_packet_required'
    || reason === 'temporal_stage_attempt_completed_missing_typed_closeout'
  ) {
    return 'closeout_materialization';
  }
  if (
    reason === 'typed_closeout_stage_attempt_id_mismatch'
    || reason === 'typed_closeout_idempotency_key_mismatch'
    || reason.includes('_mismatch')
  ) {
    return 'closeout_identity_mismatch';
  }
  if (reason === 'typed_closeout_domain_route_user_stage_log_missing') {
    return 'closeout_semantics_missing';
  }
  if (
    reason.startsWith('typed_closeout_')
    && (reason.includes('rejection') || reason.includes('_rejected'))
  ) {
    return 'closeout_semantics_missing';
  }
  if (
    reason === 'codex_cli_command_execution_no_progress'
    || reason === 'codex_cli_closeout_enforcement_command_no_progress'
  ) {
    return 'closeout_execution_stalled';
  }
  if (
    reason === 'codex_cli_unsupported_function_call'
    || reason === 'codex_cli_closeout_enforcement_unsupported_function_call'
  ) {
    return 'executor_protocol_violation';
  }
  if (reason === 'codex_cli_provider_unavailable') {
    return 'provider_unavailable';
  }
  if (reason === 'codex_cli_activity_cancelled' || reason === 'codex_cli_closeout_enforcement_activity_cancelled') {
    return 'activity_cancelled';
  }
  if (reason.startsWith('local_sandbox_')) {
    return 'sandbox_preflight_blocked';
  }
  return 'provider_runtime_blocker';
}

export function buildStructuredCloseoutGate(input: {
  attempt: JsonRecord;
  closeoutPacket: TypedStageCloseoutPacket | null;
  blockedReason: string | null;
  closeoutRejection: StageCloseoutPacketRejection | null;
  outputSchema: {
    enabled: boolean;
    policy: string;
    provider: string | null;
  };
  outputLastMessageCaptureEnabled: boolean;
  sessionRecoveryStatus: string | null;
  sessionRecoveryAttempts: number;
  closeoutEnforcementStatus: string | null;
  domainReceiptRecoveryStatus: string | null;
}) {
  const repairClass = structuredCloseoutRepairClassFor({
    blockedReason: input.blockedReason,
    rejectionReason: input.closeoutRejection?.reason ?? null,
  });
  const closeoutMaterializationRequired = repairClass === 'closeout_materialization';
  const stageAttemptId = optionalString(input.attempt.stage_attempt_id) ?? null;
  const stageId = optionalString(input.attempt.stage_id) ?? null;
  const gateStatus: 'accepted_typed_closeout' | 'missing_typed_closeout' | 'provider_runtime_blocker_materialized' = repairClass
    ? 'provider_runtime_blocker_materialized'
    : input.closeoutPacket
      ? 'accepted_typed_closeout'
      : 'missing_typed_closeout';

  return {
    surface_kind: 'opl_structured_closeout_gate' as const,
    gate_version: 'structured-closeout-gate.v1' as const,
    gate_owner: 'one-person-lab' as const,
    gate_status: gateStatus,
    stage_attempt_id: stageAttemptId,
    stage_id: stageId,
    accepted_closeout: !repairClass && input.closeoutPacket
      ? {
          surface_kind: input.closeoutPacket.surface_kind,
          closeout_ref_count: input.closeoutPacket.closeout_refs.length,
          provider_runtime_blocker_ref_only:
            optionalString(input.closeoutPacket.authority_boundary.opl)
              === 'provider_runtime_closeout_transport_only',
        }
      : null,
    capture_pipeline: {
      terminal_message_json_scan: true as const,
      free_text_closeout_accepted: false as const,
      terminal_json_exact_object_required: true as const,
      parse_failure_is_stage_progression: false as const,
      output_last_message_capture_enabled: input.outputLastMessageCaptureEnabled,
      output_schema: input.outputSchema,
      session_recovery_status: input.sessionRecoveryStatus,
      session_recovery_attempts: input.sessionRecoveryAttempts,
      same_session_enforcement_status: input.closeoutEnforcementStatus,
      domain_receipt_recovery_status: input.domainReceiptRecoveryStatus,
    },
    ...(repairClass
      ? {
          failure: {
            repair_class: repairClass,
            blocked_reason: input.blockedReason,
            closeout_rejection_reason: input.closeoutRejection?.reason ?? null,
            provider_completion_is_domain_ready: false as const,
            output_protocol_drift: closeoutMaterializationRequired,
            materialization_required: closeoutMaterializationRequired
              ? 'terminal_typed_closeout_json_object' as const
              : null,
          },
          repair_action: {
            action_id: 'structured_closeout_repair_redrive_decision' as const,
            owner: 'opl_runway' as const,
            repair_kind: closeoutMaterializationRequired
              ? 'output_protocol_drift' as const
              : 'typed_closeout_repair' as const,
            reason: input.blockedReason ?? `typed_closeout_${input.closeoutRejection?.reason}`,
            materialization_required: closeoutMaterializationRequired
              ? 'terminal_typed_closeout_json_object' as const
              : null,
            command: stageAttemptId
              ? `opl family-runtime attempt query ${stageAttemptId} --json`
              : 'opl family-runtime attempt list --status blocked --json',
            mutation: false as const,
            blocks_runtime_execution: true as const,
            blocks_domain_progress_claim: true as const,
          },
        }
      : {
          failure: null,
          repair_action: null,
        }),
    authority_boundary: {
      opl: 'structured_closeout_transport_gate_only' as const,
      domain: 'truth_quality_artifact_gate_owner' as const,
      can_write_domain_truth: false as const,
      can_create_owner_receipt: false as const,
      can_create_typed_blocker: false as const,
      can_authorize_domain_ready: false as const,
      provider_completion_is_domain_ready: false as const,
    },
  };
}
