export const STANDARD_TYPED_BLOCKER_LINEAGE_POLICY = {
  surface_kind: 'family-stall-lineage.v1',
  version: 'family-stall-lineage.v1',
  owner: 'one-person-lab',
  standard_agent_requirement:
    'typed_blockers_must_include_repeat_budget_lineage_next_forced_delta_and_escalation_owner',
  required_fields: [
    'blocker_family',
    'study_id_or_domain_identity',
    'work_unit_id',
    'eval_id_or_review_ref',
    'source_fingerprint',
    'repeat_count',
    'first_seen',
    'last_seen',
    'last_deliverable_delta',
    'next_forced_delta',
    'escalation_owner',
    'terminal',
  ],
  repeat_budget: {
    mechanism_repair_after_repeat_count: 2,
    human_gate_or_stop_loss_after_repeat_count: 3,
  },
  platform_only_delta_policy: 'does_not_reset_deliverable_stall_budget',
  authority_boundary: {
    opl_can_generate_domain_blocker: false,
    opl_can_escalate_without_domain_or_human_gate_ref: false,
    opl_can_claim_deliverable_progress_from_platform_repair: false,
  },
} as const;
