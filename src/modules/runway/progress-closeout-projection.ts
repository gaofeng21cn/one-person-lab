import { stringValue as optionalString } from '../../kernel/json-record.ts';
import type {
  StageCloseoutPacketRejection,
  TypedStageCloseoutPacket,
} from './family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
import type { JsonRecord } from './family-runtime-codex-stage-runner-parts/shared.ts';

export function buildProgressCloseoutProjection(input: {
  attempt: JsonRecord;
  closeoutPacket: TypedStageCloseoutPacket | null;
  blockedReason: string | null;
  closeoutRejection: StageCloseoutPacketRejection | null;
  rawArtifactRef: string | null;
  outputLastMessageCaptureEnabled: boolean;
  sessionRecoveryStatus: string | null;
  sessionRecoveryAttempts: number;
  domainReceiptRecoveryStatus: string | null;
}) {
  const stageAttemptId = optionalString(input.attempt.stage_attempt_id) ?? null;
  const stageId = optionalString(input.attempt.stage_id) ?? null;
  const derivedFromRawArtifact = Boolean(
    input.rawArtifactRef
    && optionalString(input.closeoutPacket?.authority_boundary.opl) === 'raw_executor_output_progress_envelope_only',
  );
  const infrastructureBlocked = Boolean(input.blockedReason && !input.rawArtifactRef);
  const projectionStatus = infrastructureBlocked
    ? 'infrastructure_blocked' as const
    : derivedFromRawArtifact
      ? 'derived_progress_envelope' as const
      : input.closeoutPacket
        ? 'typed_closeout_observed' as const
        : 'no_artifact_observed' as const;

  return {
    surface_kind: 'opl_progress_closeout_projection' as const,
    version: 'progress-closeout-projection.v1' as const,
    projection_owner: 'one-person-lab' as const,
    projection_status: projectionStatus,
    stage_attempt_id: stageAttemptId,
    stage_id: stageId,
    accepted_progress: input.closeoutPacket
      ? {
          surface_kind: input.closeoutPacket.surface_kind,
          closeout_ref_count: input.closeoutPacket.closeout_refs.length,
          derived_from_raw_artifact: derivedFromRawArtifact,
          raw_artifact_ref: input.rawArtifactRef,
        }
      : null,
    capture_pipeline: {
      terminal_message_json_scan_is_best_effort: true as const,
      free_text_or_partial_output_is_progress: true as const,
      terminal_json_exact_object_required: false as const,
      parse_failure_is_stage_progression_when_raw_artifact_exists: true as const,
      output_last_message_capture_enabled: input.outputLastMessageCaptureEnabled,
      output_schema_control_plane_enabled: false as const,
      same_session_closeout_enforcement_enabled: false as const,
      framework_generates_minimal_progress_envelope: true as const,
      session_recovery_status: input.sessionRecoveryStatus,
      session_recovery_attempts: input.sessionRecoveryAttempts,
      domain_receipt_recovery_status: input.domainReceiptRecoveryStatus,
    },
    quality_debt: input.closeoutRejection
      ? {
          finding: `typed_closeout_${input.closeoutRejection.reason}`,
          blocks_next_stage: false as const,
          route_back_selection_owner: 'codex_cli' as const,
        }
      : null,
    infrastructure_blocker: infrastructureBlocked
      ? {
          reason: input.blockedReason,
          raw_artifact_observed: false as const,
          blocks_runtime_execution: true as const,
        }
      : null,
    authority_boundary: {
      opl: 'raw_artifact_persistence_envelope_hash_lineage_and_projection_only' as const,
      domain: 'truth_quality_artifact_and_route_back_owner' as const,
      can_write_domain_truth: false as const,
      can_create_owner_receipt: false as const,
      can_create_typed_blocker: false as const,
      can_authorize_domain_ready: false as const,
      provider_completion_is_domain_ready: false as const,
    },
  };
}
