export const STANDARD_PROGRESS_DELTA_POLICY = {
  surface_kind: 'opl_stage_progress_delta_policy',
  version: 'progress-delta-policy.v1',
  owner: 'one-person-lab',
  standard_agent_requirement:
    'stage_closeout_must_classify_raw_partial_negative_diagnostic_deliverable_progress_quality_debt_or_legal_hard_stop',
  projection_surface: 'stage_progress_log.user_stage_log',
  required_fields: [
    'progress_delta_classification',
    'deliverable_progress_delta',
    'platform_repair_delta',
    'next_forced_delta',
  ],
  classification_values: [
    'deliverable_progress',
    'negative_result',
    'progress_diagnostic',
    'platform_repair',
    'mixed',
    'quality_debt',
    'typed_blocker',
    'human_gate',
    'stop_loss',
  ],
  deliverable_delta_aliases: {
    medautoscience: ['paper_progress_delta', 'paper_work_progress'],
    medautogrant: ['grant_work_progress'],
    redcube: ['visual_deliverable_progress', 'deliverable_progress_delta'],
    opl_meta_agent: ['target_agent_substantive_delta'],
  },
  platform_delta_aliases: {
    medautoscience: ['platform_repair_delta'],
    medautogrant: ['platform_evidence_progress'],
    redcube: ['platform_repair_delta'],
    opl_meta_agent: ['platform_interface_repair_delta'],
  },
  platform_only_is_not_deliverable_progress: true,
  quality_budget_exhaustion_policy:
    'completed_with_quality_debt_and_continue_with_best_artifact_or_progress_diagnostic',
  quality_debt_blocks_stage_transition: false,
  quality_debt_blocks_quality_export_or_ready_claims: true,
  missing_delta_policy:
    'materialize_no_output_or_failure_diagnostic_and_next_forced_delta_without_inventing_domain_work',
  authority_boundary: {
    opl_can_infer_domain_work: false,
    opl_can_read_artifact_body: false,
    opl_can_write_domain_truth: false,
    opl_can_authorize_quality_or_export: false,
  },
} as const;
