import { isRecord } from '../../kernel/contract-validation.ts';
import { stringValue } from '../../kernel/json-record.ts';

type JsonRecord = Record<string, unknown>;

export function buildStageAttemptTruePathProof(input: {
  stageAttemptId: string;
  taskId?: string | null;
  workflowId: string;
  providerKind: string;
  domainId: string;
  stageId: string;
  status: string;
  stageProgressLog: JsonRecord;
  temporalQuery?: JsonRecord | null;
}) {
  const temporalVisibility = isRecord(input.stageProgressLog.temporal_visibility)
    ? input.stageProgressLog.temporal_visibility
    : {};
  const temporalWebUiRef = isRecord(input.stageProgressLog.temporal_webui_ref)
    ? input.stageProgressLog.temporal_webui_ref
    : {};
  const runId =
    stringValue(temporalVisibility.run_id)
    ?? stringValue(input.temporalQuery?.run_id)
    ?? null;
  const temporalWorkflowStatus =
    stringValue(input.temporalQuery?.workflow_status)
    ?? stringValue(temporalVisibility.workflow_status)
    ?? null;
  const hasTemporalRefs =
    input.providerKind === 'temporal'
    && Boolean(stringValue(temporalVisibility.workflow_id))
    && Boolean(stringValue(temporalWebUiRef.url) || stringValue(temporalVisibility.temporal_cli_ref));
  return {
    surface_kind: 'opl_stage_attempt_true_path_proof',
    proof_status: hasTemporalRefs ? 'observed' : 'blocked',
    projection_policy: 'same_stage_attempt_refs_only_no_domain_truth_no_long_soak_claim',
    same_attempt_refs: {
      stage_attempt_id: input.stageAttemptId,
      task_id: input.taskId ?? null,
      workflow_id: input.workflowId,
      run_id: runId,
      provider_kind: input.providerKind,
      domain_id: input.domainId,
      stage_id: input.stageId,
      status: input.status,
    },
    surfaces: {
      attempt_query_ref: `/family_runtime_stage_attempt_query/${input.stageAttemptId}`,
      queue_inspect_ref: input.taskId
        ? `/family_runtime_task/${input.taskId}/stage_attempts/${input.stageAttemptId}`
        : null,
      app_drilldown_ref: `/runtime_tray_snapshot/app_operator_drilldown/stage_attempts/${input.stageAttemptId}`,
      stage_progress_log_ref: `/stage_attempt_workbench/attempts/${input.stageAttemptId}/stage_progress_log`,
      temporal_visibility_ref: stringValue(temporalVisibility.workflow_id)
        ? `/stage_attempt_workbench/attempts/${input.stageAttemptId}/temporal_visibility`
        : null,
      temporal_webui_ref: stringValue(temporalWebUiRef.url),
      temporal_cli_ref: stringValue(temporalVisibility.temporal_cli_ref),
    },
    provider_truth_refs: {
      temporal_query_status: stringValue(input.temporalQuery?.surface_kind),
      temporal_workflow_status: temporalWorkflowStatus,
      provider_status: stringValue(temporalVisibility.workflow_status),
      visibility_readiness_status: isRecord(temporalVisibility.visibility_readiness)
        ? stringValue(temporalVisibility.visibility_readiness.readiness_status)
        : null,
      search_attribute_refs: Array.isArray(temporalVisibility.search_attribute_refs)
        ? temporalVisibility.search_attribute_refs.filter((entry): entry is string => typeof entry === 'string')
        : [],
    },
    blocked_reason: hasTemporalRefs ? null : 'missing_temporal_attempt_refs',
    non_claims: [
      'does_not_claim_domain_ready',
      'does_not_claim_long_soak',
      'does_not_claim_artifact_authority',
      'does_not_claim_quality_verdict',
      'does_not_write_domain_truth',
    ],
    authority_boundary: {
      opl: 'attempt_true_path_refs_only_projection',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_claim_domain_ready: false,
      can_claim_long_soak: false,
      can_claim_artifact_authority: false,
      can_authorize_quality_verdict: false,
      provider_completion_is_domain_ready: false,
    },
  };
}
