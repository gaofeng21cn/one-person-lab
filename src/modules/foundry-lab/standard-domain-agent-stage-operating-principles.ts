import {
  isRecord,
  optionalString,
  readJsonFile,
  stringList,
} from './standard-domain-agent-conformance-utils.ts';

const REQUIRED_STAGE_OPERATING_BOUNDARY_CONTROLS = [
  'stage_goal',
  'input_refs',
  'current_owner',
  'accepted_answer_shape',
  'progress_receipt_or_owner_answer_or_hard_stop',
  'handoff_packet',
  'current_pointer',
  'authority_boundary',
];

const REQUIRED_STAGE_OPERATING_DEMOTED_DEFAULT_SURFACES = [
  'raw_worklist',
  'stage_replay_packet',
  'provider_trace',
  'evidence_accounting',
  'private_residue_inventory',
  'cleanup_delete_gate',
];

const REQUIRED_STAGE_OPERATING_NEXT_DELTA_SHAPES = [
  'deliverable_delta_ref',
  'consumable_artifact_ref',
  'progress_delta_receipt_ref',
  'quality_debt_ref',
  'owner_receipt_ref',
  'typed_blocker_ref',
  'human_gate_ref',
  'quality_gate_receipt_ref',
  'no_regression_ref',
  'route_back_ref',
  'handoff_packet_ref',
  'no_output_or_failure_diagnostic_ref',
];

const REQUIRED_STAGE_OPERATING_HARD_STOP_GATES = [
  'executor_unavailable',
  'safety_or_compliance',
  'permission_or_credential_boundary',
  'human_decision_required',
  'irreversible_write_or_delete',
  'authority_boundary_violation',
  'stale_or_mismatched_stage_identity',
];

const REQUIRED_STAGE_OPERATING_AUTHORITY_FALSE_FLAGS = [
  'policy_can_claim_domain_ready',
  'policy_can_claim_production_ready',
  'conformance_pass_counts_as_live_progress',
  'opl_can_write_domain_truth',
  'opl_can_sign_domain_owner_receipt',
  'opl_can_create_typed_blocker',
  'opl_can_authorize_quality_or_export',
];

export const STAGE_OPERATING_PRINCIPLES_POLICY = {
  surface_kind: 'opl_standard_agent_stage_operating_principles',
  version: 'stage-operating-principles.v1',
  state: 'active_contract',
  policy_owner: 'one-person-lab',
  purpose: 'Keep OPL stages easy to manage while preserving fast owner-delta progression.',
  principle_summary: {
    management_logic:
      'Manage only the stage boundary: goal, inputs, owner, accepted answer shape, progress receipt or legal hard stop, handoff, pointer, and authority boundary.',
    speed_logic:
      'Let the selected executor do open-ended work inside the stage; route quality gaps into scoped next deltas unless a hard authority, safety, permission, human, or irreversible-change gate applies.',
  },
  management_boundary: {
    stage_unit: 'coarse_grained_stage_attempt',
    required_boundary_controls: REQUIRED_STAGE_OPERATING_BOUNDARY_CONTROLS,
    stage_must_not_split_into_micro_status_chain: true,
    default_operator_question: 'what_does_current_owner_need_to_answer_next',
  },
  speed_policy: {
    executor_autonomy_inside_stage: true,
    executor_can_choose_order_and_parallelism: true,
    strategy_refs_are_advisory_or_route_back: true,
    strategy_refs_block_launch_by_default: false,
    tool_catalog_can_prescribe_workflow_sequence: false,
    preflight_or_quality_review_can_loop_without_deliverable_delta: false,
    quality_gaps_block_ordinary_progress_by_default: false,
    consumable_artifact_advances_stage: true,
    no_output_or_failure_diagnostic_advances_stage: true,
    retry_review_and_repair_limits_are_quality_budgets: true,
    quality_budget_exhaustion_status: 'completed_with_quality_debt',
    quality_debt_blocks_stage_transition: false,
    quality_debt_blocks_quality_export_or_ready_claims: true,
    zero_output_becomes_progress_diagnostic: true,
    corrupt_or_unreadable_output_becomes_progress_diagnostic: true,
    safe_action_before_diagnostic_reconcile: true,
    next_delta_may_be_deliverable_receipt_diagnostic_hard_blocker_or_handoff: true,
  },
  default_read_surface: {
    root: 'current_owner_delta',
    raw_worklist_default: false,
    readiness_default: false,
    replay_packet_default: false,
    evidence_accounting_default: false,
    cleanup_delete_gate_default: false,
  },
  demoted_default_surfaces: REQUIRED_STAGE_OPERATING_DEMOTED_DEFAULT_SURFACES,
  hard_stop_gates: REQUIRED_STAGE_OPERATING_HARD_STOP_GATES,
  accepted_next_delta_shapes: REQUIRED_STAGE_OPERATING_NEXT_DELTA_SHAPES,
  authority_boundary: {
    policy_can_claim_domain_ready: false,
    policy_can_claim_production_ready: false,
    conformance_pass_counts_as_live_progress: false,
    opl_can_write_domain_truth: false,
    opl_can_sign_domain_owner_receipt: false,
    opl_can_create_typed_blocker: false,
    opl_can_authorize_quality_or_export: false,
  },
} as const;

export function buildStageOperatingPrincipleChecks(repoDir: string) {
  const policyFile = readJsonFile(repoDir, 'contracts/stage_operating_principles.json');
  const policy = isRecord(policyFile.payload) ? policyFile.payload : null;
  const managementBoundary = isRecord(policy?.management_boundary)
    ? policy.management_boundary
    : {};
  const speedPolicy = isRecord(policy?.speed_policy) ? policy.speed_policy : {};
  const defaultReadSurface = isRecord(policy?.default_read_surface)
    ? policy.default_read_surface
    : {};
  const authority = isRecord(policy?.authority_boundary) ? policy.authority_boundary : {};
  const requiredBoundaryControls = stringList(managementBoundary.required_boundary_controls);
  const demotedDefaultSurfaces = stringList(policy?.demoted_default_surfaces);
  const acceptedNextDeltaShapes = stringList(policy?.accepted_next_delta_shapes);
  const hardStopGates = stringList(policy?.hard_stop_gates);
  const blockers = [
    policyFile.status === 'resolved' ? null : `stage_operating_principles_${policyFile.status}`,
    policy ? null : 'stage_operating_principles_not_declared',
    optionalString(policy?.surface_kind) === 'opl_standard_agent_stage_operating_principles'
      ? null
      : 'stage_operating_principles_surface_kind_invalid',
    optionalString(policy?.state) === 'active_contract'
      ? null
      : 'stage_operating_principles_state_must_be_active_contract',
    optionalString(managementBoundary.stage_unit) === 'coarse_grained_stage_attempt'
      ? null
      : 'stage_operating_principles_stage_unit_must_be_coarse_grained_stage_attempt',
    ...REQUIRED_STAGE_OPERATING_BOUNDARY_CONTROLS
      .filter((control) => !requiredBoundaryControls.includes(control))
      .map((control) => `stage_operating_principles_boundary_control_missing:${control}`),
    managementBoundary.stage_must_not_split_into_micro_status_chain === true
      ? null
      : 'stage_operating_principles_micro_status_chain_guard_missing',
    optionalString(managementBoundary.default_operator_question) === 'what_does_current_owner_need_to_answer_next'
      ? null
      : 'stage_operating_principles_operator_question_must_be_current_owner_delta',
    speedPolicy.executor_autonomy_inside_stage === true
      ? null
      : 'stage_operating_principles_executor_autonomy_missing',
    speedPolicy.executor_can_choose_order_and_parallelism === true
      ? null
      : 'stage_operating_principles_executor_parallelism_autonomy_missing',
    speedPolicy.strategy_refs_are_advisory_or_route_back === true
      ? null
      : 'stage_operating_principles_strategy_refs_must_be_advisory_or_route_back',
    speedPolicy.strategy_refs_block_launch_by_default === false
      ? null
      : 'stage_operating_principles_strategy_refs_must_not_block_launch_by_default',
    speedPolicy.tool_catalog_can_prescribe_workflow_sequence === false
      ? null
      : 'stage_operating_principles_tool_catalog_must_not_prescribe_workflow_sequence',
    speedPolicy.preflight_or_quality_review_can_loop_without_deliverable_delta === false
      ? null
      : 'stage_operating_principles_preflight_quality_loop_without_delta_forbidden',
    speedPolicy.quality_gaps_block_ordinary_progress_by_default === false
      ? null
      : 'stage_operating_principles_quality_gaps_must_not_block_ordinary_progress_by_default',
    speedPolicy.consumable_artifact_advances_stage === true
      ? null
      : 'stage_operating_principles_consumable_artifact_must_advance_stage',
    speedPolicy.no_output_or_failure_diagnostic_advances_stage === true
      ? null
      : 'stage_operating_principles_no_output_diagnostic_must_advance_stage',
    speedPolicy.retry_review_and_repair_limits_are_quality_budgets === true
      ? null
      : 'stage_operating_principles_retry_limits_must_be_quality_budgets',
    optionalString(speedPolicy.quality_budget_exhaustion_status) === 'completed_with_quality_debt'
      ? null
      : 'stage_operating_principles_quality_budget_exhaustion_status_invalid',
    speedPolicy.quality_debt_blocks_stage_transition === false
      ? null
      : 'stage_operating_principles_quality_debt_must_not_block_stage_transition',
    speedPolicy.quality_debt_blocks_quality_export_or_ready_claims === true
      ? null
      : 'stage_operating_principles_quality_debt_must_block_ready_claims',
    speedPolicy.safe_action_before_diagnostic_reconcile === true
      ? null
      : 'stage_operating_principles_safe_action_before_diagnostic_reconcile_missing',
    speedPolicy.next_delta_may_be_deliverable_receipt_diagnostic_hard_blocker_or_handoff === true
      ? null
      : 'stage_operating_principles_next_delta_progress_shape_guard_missing',
    optionalString(defaultReadSurface.root) === 'current_owner_delta'
      ? null
      : 'stage_operating_principles_default_read_surface_must_be_current_owner_delta',
    defaultReadSurface.raw_worklist_default === false
      ? null
      : 'stage_operating_principles_raw_worklist_default_forbidden',
    defaultReadSurface.readiness_default === false
      ? null
      : 'stage_operating_principles_readiness_default_forbidden',
    defaultReadSurface.replay_packet_default === false
      ? null
      : 'stage_operating_principles_replay_packet_default_forbidden',
    defaultReadSurface.evidence_accounting_default === false
      ? null
      : 'stage_operating_principles_evidence_accounting_default_forbidden',
    defaultReadSurface.cleanup_delete_gate_default === false
      ? null
      : 'stage_operating_principles_cleanup_delete_gate_default_forbidden',
    ...REQUIRED_STAGE_OPERATING_DEMOTED_DEFAULT_SURFACES
      .filter((surface) => !demotedDefaultSurfaces.includes(surface))
      .map((surface) => `stage_operating_principles_demoted_default_surface_missing:${surface}`),
    ...REQUIRED_STAGE_OPERATING_NEXT_DELTA_SHAPES
      .filter((shape) => !acceptedNextDeltaShapes.includes(shape))
      .map((shape) => `stage_operating_principles_next_delta_shape_missing:${shape}`),
    ...REQUIRED_STAGE_OPERATING_HARD_STOP_GATES
      .filter((gate) => !hardStopGates.includes(gate))
      .map((gate) => `stage_operating_principles_hard_stop_gate_missing:${gate}`),
    ...REQUIRED_STAGE_OPERATING_AUTHORITY_FALSE_FLAGS
      .filter((flag) => authority[flag] !== false)
      .map((flag) => `stage_operating_principles_${flag}_must_be_false`),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    policy_status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_source: 'contracts/stage_operating_principles.json',
    management_boundary: {
      stage_unit: optionalString(managementBoundary.stage_unit),
      required_boundary_controls: requiredBoundaryControls,
      stage_must_not_split_into_micro_status_chain:
        managementBoundary.stage_must_not_split_into_micro_status_chain ?? null,
      default_operator_question: optionalString(managementBoundary.default_operator_question),
    },
    speed_policy: {
      executor_autonomy_inside_stage: speedPolicy.executor_autonomy_inside_stage ?? null,
      executor_can_choose_order_and_parallelism:
        speedPolicy.executor_can_choose_order_and_parallelism ?? null,
      strategy_refs_are_advisory_or_route_back:
        speedPolicy.strategy_refs_are_advisory_or_route_back ?? null,
      strategy_refs_block_launch_by_default:
        speedPolicy.strategy_refs_block_launch_by_default ?? null,
      tool_catalog_can_prescribe_workflow_sequence:
        speedPolicy.tool_catalog_can_prescribe_workflow_sequence ?? null,
      preflight_or_quality_review_can_loop_without_deliverable_delta:
        speedPolicy.preflight_or_quality_review_can_loop_without_deliverable_delta ?? null,
      quality_gaps_block_ordinary_progress_by_default:
        speedPolicy.quality_gaps_block_ordinary_progress_by_default ?? null,
      consumable_artifact_advances_stage:
        speedPolicy.consumable_artifact_advances_stage ?? null,
      no_output_or_failure_diagnostic_advances_stage:
        speedPolicy.no_output_or_failure_diagnostic_advances_stage ?? null,
      retry_review_and_repair_limits_are_quality_budgets:
        speedPolicy.retry_review_and_repair_limits_are_quality_budgets ?? null,
      quality_budget_exhaustion_status:
        optionalString(speedPolicy.quality_budget_exhaustion_status),
      quality_debt_blocks_stage_transition:
        speedPolicy.quality_debt_blocks_stage_transition ?? null,
      quality_debt_blocks_quality_export_or_ready_claims:
        speedPolicy.quality_debt_blocks_quality_export_or_ready_claims ?? null,
      safe_action_before_diagnostic_reconcile:
        speedPolicy.safe_action_before_diagnostic_reconcile ?? null,
      next_delta_may_be_deliverable_receipt_diagnostic_hard_blocker_or_handoff:
        speedPolicy.next_delta_may_be_deliverable_receipt_diagnostic_hard_blocker_or_handoff ?? null,
    },
    default_read_surface: {
      root: optionalString(defaultReadSurface.root),
      raw_worklist_default: defaultReadSurface.raw_worklist_default ?? null,
      readiness_default: defaultReadSurface.readiness_default ?? null,
      replay_packet_default: defaultReadSurface.replay_packet_default ?? null,
      evidence_accounting_default: defaultReadSurface.evidence_accounting_default ?? null,
      cleanup_delete_gate_default: defaultReadSurface.cleanup_delete_gate_default ?? null,
    },
    demoted_default_surfaces: demotedDefaultSurfaces,
    accepted_next_delta_shapes: acceptedNextDeltaShapes,
    hard_stop_gates: hardStopGates,
    authority_boundary: Object.fromEntries(
      REQUIRED_STAGE_OPERATING_AUTHORITY_FALSE_FLAGS.map((flag) => [flag, authority[flag] ?? null]),
    ),
    blockers,
  };
}
