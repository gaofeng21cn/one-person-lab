import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import type { JsonRecord } from './shared.ts';
import { normalizeTypedStageCloseoutPacket } from './closeout-normalization.ts';
import { closeoutExecutionScopeFromAttempt } from './provider-result.ts';

export function buildRawArtifactProgressCloseoutPacket(input: {
  attempt: JsonRecord;
  stagePacketRef: string;
  rawArtifact: {
    output_ref: string;
    metadata_ref: string;
    sha256: string;
    size_bytes: number;
  };
  normalizationFindings: string[];
}) {
  const stageAttemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const idempotencyKey = optionalString(input.attempt.idempotency_key);
  const domainId = optionalString(input.attempt.domain_id);
  return normalizeTypedStageCloseoutPacket({
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: stageAttemptId,
    ...(optionalString(input.attempt.stage_run_id)
      ? { stage_run_id: optionalString(input.attempt.stage_run_id) }
      : {}),
    ...closeoutExecutionScopeFromAttempt(input.attempt),
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    closeout_refs: [{
      ref: input.rawArtifact.output_ref,
      ref_kind: 'raw_executor_output',
      sha256: input.rawArtifact.sha256,
      size_bytes: input.rawArtifact.size_bytes,
    }],
    consumed_refs: [input.stagePacketRef],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: domainId ?? null,
    domain_ready_verdict: 'completed_with_quality_debt',
    route_impact: {
      transition_outcome: 'completed_with_quality_debt',
      consumable_artifact_refs: [input.rawArtifact.output_ref],
      artifact_metadata_refs: [input.rawArtifact.metadata_ref],
      quality_debt_refs: input.normalizationFindings.map(
        (finding) => `opl://stage-attempts/${encodeURIComponent(stageAttemptId)}/quality-debt/${encodeURIComponent(finding)}`,
      ),
      normalization_findings: input.normalizationFindings,
      next_stage_may_start: true,
      route_back_selection_owner: 'codex_cli',
      route_back_may_target_any_declared_stage: true,
      negative_or_partial_output_counts_as_progress: true,
      framework_generated_envelope: true,
    },
    authority_boundary: {
      opl: 'raw_executor_output_progress_envelope_only',
      domain: 'truth_quality_route_back_and_artifact_authority_owner',
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      provider_completion_is_domain_ready: false,
    },
  });
}
