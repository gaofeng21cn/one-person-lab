import {
  STANDARD_PROGRESS_DELTA_POLICY,
  STANDARD_STAGE_COMPLETION_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
  STANDARD_USER_STAGE_LOG_CONTRACT,
} from '../standard-domain-agent-scaffold-constants.ts';
import { isPlainRecord, readOptionalString, readRecordArray, readStringArray } from './shared.ts';

export function validateUserStageLogContracts(stageControlPlane: unknown) {
  const stages = isPlainRecord(stageControlPlane) ? readRecordArray(stageControlPlane.stages) : [];
  const stageStatuses = stages.map((stage) => {
    const stageId = readOptionalString(stage.stage_id) ?? 'unknown_stage';
    const stageContract = isPlainRecord(stage.stage_contract) ? stage.stage_contract : null;
    const userStageLogContract = isPlainRecord(stageContract?.user_stage_log_contract)
      ? stageContract.user_stage_log_contract
      : null;
    const stageCompletionPolicy = isPlainRecord(stageContract?.stage_completion_policy)
      ? stageContract.stage_completion_policy
      : null;
    const progressDeltaPolicy = isPlainRecord(stageContract?.progress_delta_policy)
      ? stageContract.progress_delta_policy
      : null;
    const typedBlockerLineagePolicy = isPlainRecord(stageContract?.typed_blocker_lineage_policy)
      ? stageContract.typed_blocker_lineage_policy
      : null;
    const fields = readStringArray(userStageLogContract?.required_domain_semantic_fields);
    const observabilityFields = readStringArray(userStageLogContract?.required_observability_fields);
    const closeoutOutcomes = readStringArray(stageCompletionPolicy?.required_closeout_outcomes);
    const acceptedCloseoutRefFields = readStringArray(stageCompletionPolicy?.accepted_closeout_ref_fields);
    const stageCompletionBoundary = isPlainRecord(stageCompletionPolicy?.authority_boundary)
      ? stageCompletionPolicy.authority_boundary
      : {};
    const progressFields = readStringArray(progressDeltaPolicy?.required_fields);
    const blockerFields = readStringArray(typedBlockerLineagePolicy?.required_fields);
    const findings = [
      userStageLogContract ? null : `stage_user_stage_log_contract_missing:${stageId}`,
      readOptionalString(userStageLogContract?.surface_kind) === STANDARD_USER_STAGE_LOG_CONTRACT.surface_kind
        ? null
        : `stage_user_stage_log_contract_surface_kind_invalid:${stageId}`,
      readOptionalString(userStageLogContract?.standard_agent_requirement)
        === STANDARD_USER_STAGE_LOG_CONTRACT.standard_agent_requirement
        ? null
        : `stage_user_stage_log_requirement_invalid:${stageId}`,
      fields.includes('problem_summary') ? null : `stage_user_stage_log_missing_problem_summary:${stageId}`,
      fields.includes('stage_work_done') ? null : `stage_user_stage_log_missing_stage_work_done:${stageId}`,
      fields.includes('changed_stage_surfaces') ? null : `stage_user_stage_log_missing_changed_stage_surfaces:${stageId}`,
      fields.includes('remaining_blockers') ? null : `stage_user_stage_log_missing_remaining_blockers:${stageId}`,
      observabilityFields.includes('duration') ? null : `stage_user_stage_log_missing_duration:${stageId}`,
      observabilityFields.includes('token_usage') ? null : `stage_user_stage_log_missing_token_usage:${stageId}`,
      stageCompletionPolicy ? null : `stage_completion_policy_missing:${stageId}`,
      readOptionalString(stageCompletionPolicy?.surface_kind) === STANDARD_STAGE_COMPLETION_POLICY.surface_kind
        ? null
        : `stage_completion_policy_surface_kind_invalid:${stageId}`,
      readOptionalString(stageCompletionPolicy?.completion_judgment_owner) === 'domain_stage'
        ? null
        : `stage_completion_policy_owner_invalid:${stageId}`,
      stageCompletionPolicy?.closeout_packet_required === false
        ? null
        : `stage_completion_policy_closeout_packet_must_not_gate_progress:${stageId}`,
      stageCompletionPolicy?.raw_artifact_sufficient_for_progress === true
        ? null
        : `stage_completion_policy_raw_artifact_progress_missing:${stageId}`,
      stageCompletionPolicy?.provider_completion_is_domain_completion === false
        ? null
        : `stage_completion_policy_provider_completion_claims_domain_completion:${stageId}`,
      stageCompletionPolicy?.opl_content_judgment_allowed === false
        ? null
        : `stage_completion_policy_opl_content_judgment_allowed:${stageId}`,
      readOptionalString(stageCompletionPolicy?.next_stage_transition_owner) === 'codex_cli'
        ? null
        : `stage_completion_policy_next_transition_owner_invalid:${stageId}`,
      closeoutOutcomes.includes('completed_and_continue')
        ? null
        : `stage_completion_policy_missing_completed_and_continue:${stageId}`,
      closeoutOutcomes.includes('route_back')
        ? null
        : `stage_completion_policy_missing_route_back:${stageId}`,
      closeoutOutcomes.includes('blocked')
        ? null
        : `stage_completion_policy_missing_blocked:${stageId}`,
      acceptedCloseoutRefFields.includes('owner_receipt_ref')
        ? null
        : `stage_completion_policy_missing_owner_receipt_ref:${stageId}`,
      acceptedCloseoutRefFields.includes('typed_blocker_ref')
        ? null
        : `stage_completion_policy_missing_typed_blocker_ref:${stageId}`,
      acceptedCloseoutRefFields.includes('route_back_ref')
        ? null
        : `stage_completion_policy_missing_route_back_ref:${stageId}`,
      stageCompletionBoundary.opl_can_decide_domain_completion === false
        ? null
        : `stage_completion_policy_opl_can_decide_domain_completion:${stageId}`,
      stageCompletionBoundary.provider_completion_counts_as_stage_complete === false
        ? null
        : `stage_completion_policy_provider_completion_counts_complete:${stageId}`,
      stageCompletionBoundary.suite_pass_counts_as_stage_complete === false
        ? null
        : `stage_completion_policy_suite_pass_counts_complete:${stageId}`,
      progressDeltaPolicy ? null : `stage_progress_delta_policy_missing:${stageId}`,
      readOptionalString(progressDeltaPolicy?.surface_kind) === STANDARD_PROGRESS_DELTA_POLICY.surface_kind
        ? null
        : `stage_progress_delta_policy_surface_kind_invalid:${stageId}`,
      progressFields.includes('progress_delta_classification')
        ? null
        : `stage_progress_delta_policy_missing_classification:${stageId}`,
      progressFields.includes('deliverable_progress_delta')
        ? null
        : `stage_progress_delta_policy_missing_deliverable_delta:${stageId}`,
      progressFields.includes('platform_repair_delta')
        ? null
        : `stage_progress_delta_policy_missing_platform_delta:${stageId}`,
      progressFields.includes('next_forced_delta')
        ? null
        : `stage_progress_delta_policy_missing_next_forced_delta:${stageId}`,
      typedBlockerLineagePolicy ? null : `stage_typed_blocker_lineage_policy_missing:${stageId}`,
      readOptionalString(typedBlockerLineagePolicy?.surface_kind) === STANDARD_TYPED_BLOCKER_LINEAGE_POLICY.surface_kind
        ? null
        : `stage_typed_blocker_lineage_policy_surface_kind_invalid:${stageId}`,
      blockerFields.includes('blocker_family')
        ? null
        : `stage_typed_blocker_lineage_policy_missing_blocker_family:${stageId}`,
      blockerFields.includes('repeat_count')
        ? null
        : `stage_typed_blocker_lineage_policy_missing_repeat_count:${stageId}`,
      blockerFields.includes('next_forced_delta')
        ? null
        : `stage_typed_blocker_lineage_policy_missing_next_forced_delta:${stageId}`,
      blockerFields.includes('escalation_owner')
        ? null
        : `stage_typed_blocker_lineage_policy_missing_escalation_owner:${stageId}`,
    ].filter((entry): entry is string => Boolean(entry));
    return {
      stage_id: stageId,
      status: findings.length === 0 ? 'passed' : 'blocked',
      required_domain_semantic_fields: fields,
      required_observability_fields: observabilityFields,
      stage_completion_policy_outcomes: closeoutOutcomes,
      stage_completion_policy_ref_fields: acceptedCloseoutRefFields,
      progress_delta_policy_fields: progressFields,
      typed_blocker_lineage_policy_fields: blockerFields,
      blockers: findings,
    };
  });
  const blockers = [
    stages.length > 0 ? null : 'missing_stage_control_plane_stages',
    ...stageStatuses.flatMap((stage) => stage.blockers),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    surface_kind: 'opl_standard_agent_user_stage_log_validation',
    contract_ref: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json#/new_agent_scaffold/user_stage_log_contract',
    status: blockers.length === 0 ? 'passed' : 'blocked',
    required_for_standard_agent: true,
    stage_statuses: stageStatuses,
    blockers,
    authority_boundary: STANDARD_USER_STAGE_LOG_CONTRACT.authority_boundary,
  };
}
