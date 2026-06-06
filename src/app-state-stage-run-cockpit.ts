import { evaluateStageRunAdmission, evaluateStageRunExecutionAuthorization } from './stage-run-kernel.ts';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map(text).filter((entry): entry is string => Boolean(entry)))]
    : [];
}

function stringRefs(...values: unknown[]) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? strings(value) : [text(value)].filter(Boolean) as string[]))];
}

function stageRunId(currentOwnerDelta: JsonRecord) {
  return [
    'app-stage-run',
    text(currentOwnerDelta.domain) ?? text(currentOwnerDelta.current_owner) ?? 'one-person-lab',
    text(currentOwnerDelta.stage_ref) ?? 'current-owner-delta',
  ]
    .map((entry) => entry.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown')
    .join(':');
}

const EXECUTION_AUTHORIZATION_REQUIRED_REFS = [
  'provider_attempt_ref',
  'attempt_lease_ref',
  'execution_authorization_decision_ref',
  'workspace_scope_ref',
  'artifact_scope_ref',
  'source_fingerprint',
  'idempotency_key',
] as const;

const CLOSEOUT_BINDING_REQUIRED_REFS = [
  'closeout_receipt_ref',
  'closeout_receipt_stage_run_binding_ref',
  'closeout_receipt_stage_manifest_binding_ref',
  'closeout_receipt_current_pointer_binding_ref',
  'closeout_receipt_source_fingerprint_binding_ref',
] as const;

const BLOCKER_REASON_REF_MAP: Record<string, string[]> = {
  stage_run_id_missing: ['stage_run_ref'],
  domain_id_missing: ['domain_id'],
  stage_id_missing: ['stage_id'],
  generation_invalid: ['stage_run_generation'],
  current_pointer_invalid: ['current_pointer_ref'],
  selected_executor_missing: ['selected_executor_ref'],
  source_fingerprint_missing: ['source_fingerprint'],
  idempotency_key_missing: ['idempotency_key'],
  provider_attempt_ref_missing: ['provider_attempt_ref'],
  attempt_lease_ref_missing: ['attempt_lease_ref'],
  attempt_lease_not_active: ['attempt_lease_ref'],
  execution_authorization_decision_ref_missing: ['execution_authorization_decision_ref'],
  workspace_scope_ref_missing: ['workspace_scope_ref'],
  artifact_scope_ref_missing: ['artifact_scope_ref'],
  authority_boundary_invalid: ['stage_run_authority_boundary_ref'],
  forbidden_write_required: ['forbidden_write_guard_ref'],
  closeout_receipt_ref_missing: ['closeout_receipt_ref'],
  closeout_receipt_stage_run_binding_missing: ['closeout_receipt_stage_run_binding_ref'],
  closeout_receipt_stage_manifest_binding_missing: ['closeout_receipt_stage_manifest_binding_ref'],
  closeout_receipt_current_pointer_binding_missing: ['closeout_receipt_current_pointer_binding_ref'],
  closeout_receipt_source_fingerprint_binding_missing: [
    'closeout_receipt_source_fingerprint_binding_ref',
  ],
};

function missingRefsFromBlockerReasons(reasons: string[]) {
  return [
    ...new Set(reasons.flatMap((reason) => BLOCKER_REASON_REF_MAP[reason] ?? [reason])),
  ];
}

function buildExecutionAuthorizationNextAction(input: {
  stageRunId: string;
  domainId: string;
  stageId: string;
  currentOwnerDelta: JsonRecord;
  executionAuthorization: JsonRecord;
}) {
  const hardGate = record(input.currentOwnerDelta.hard_gate);
  const desiredDeltaKind = text(input.currentOwnerDelta.desired_delta_kind) ?? 'none';
  const hardGateState = text(hardGate.state) ?? 'none';
  if (desiredDeltaKind === 'none' && hardGateState === 'none') {
    return null;
  }
  const blocker = record(input.executionAuthorization.opl_runtime_blocker);
  const reasons = strings(blocker.blocker_reasons);
  if (text(input.executionAuthorization.status) !== 'blocked' || reasons.length === 0) {
    return null;
  }
  const missingRefs = missingRefsFromBlockerReasons(reasons);
  return {
    surface_kind: 'opl_stage_run_execution_authorization_next_required_owner_action',
    schema_version: 'stage-run-execution-authorization-next-action.v1',
    action_id: `${input.stageRunId}:execution-authorization-closeout-binding`,
    action_kind: 'stage_run_execution_authorization_or_closeout_binding_required',
    step_kind: 'stage_run_execution_authorization_or_closeout_binding_required',
    derivation_source: 'stage_run_execution_authorization',
    default_planning_root: 'stage_run_execution_authorization_or_closeout_binding',
    stage_run_id: input.stageRunId,
    domain_id: input.domainId,
    stage_id: input.stageId,
    current_owner_delta_ref: '/current_owner_delta',
    stage_run_cockpit_ref: '/stage_run_cockpit',
    execution_authorization_ref: '/stage_run_cockpit/execution_authorization',
    owner: 'one-person-lab',
    current_owner: 'one-person-lab',
    next_required_owner: 'one-person-lab',
    next_required_action:
      'record_opl_provider_attempt_lease_authorization_and_closeout_receipt_binding_refs',
    next_required_action_summary:
      'Record OPL provider attempt, active lease, execution authorization decision, workspace/artifact scope, source fingerprint/idempotency, and closeout receipt binding refs before execution or closeout.',
    payload_requirement: 'opl_execution_authorization_and_closeout_binding_refs_required',
    accepted_answer_shape: [
      'provider_attempt_ref',
      'attempt_lease_ref',
      'execution_authorization_decision_ref',
      'closeout_receipt_binding_ref',
    ],
    required_return_shapes: [
      'provider_attempt_ref',
      'attempt_lease_ref',
      'execution_authorization_decision_ref',
      'closeout_receipt_binding_ref',
    ],
    blocked_authority: strings(blocker.blocked_authority),
    blocker_code: text(blocker.blocker_code) ?? 'stage_run_execution_authorization_blocked',
    blocker_reasons: reasons,
    missing_input_refs: missingRefs,
    required_ref_shape: {
      execution_authorization_refs: [...EXECUTION_AUTHORIZATION_REQUIRED_REFS],
      closeout_receipt_binding_refs: [...CLOSEOUT_BINDING_REQUIRED_REFS],
    },
    route_requires_opl_runtime_refs: true,
    route_requires_domain_or_app_payload: false,
    can_submit_to_safe_action_shell: false,
    authority: 'stage_run_execution_authorization_projection_only',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_close_owner_chain: false,
    can_close_domain_ready: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    domain_truth_changed: false,
    owner_receipt_signed: false,
    domain_typed_blocker_created: false,
    execution_blocker_is_domain_typed_blocker: false,
    worklist_item_is_completion_claim: false,
  };
}

export function buildAppStageRunCockpit(currentOwnerDeltaInput: unknown) {
  const currentOwnerDelta = record(currentOwnerDeltaInput);
  const runId = stageRunId(currentOwnerDelta);
  const generation = 0;
  const domainId = text(currentOwnerDelta.domain) ?? text(currentOwnerDelta.current_owner) ?? 'one-person-lab';
  const stageId = text(currentOwnerDelta.stage_ref) ?? 'current-owner-delta';
  const currentPointer = {
    stage_run_id: runId,
    generation,
    current: true,
  };
  const acceptedReturnShapes = strings(currentOwnerDelta.accepted_answer_shape);
  const requiredRoleArtifacts = ['owner_delta', 'role_artifacts', 'owner_receipt_or_typed_blocker'];
  const producedRoleArtifacts = acceptedReturnShapes.some((entry) =>
    entry.includes('owner_receipt') || entry.includes('typed_blocker'))
    ? ['owner_delta', 'role_artifacts']
    : ['owner_delta'];
  const common = {
    stage_run_id: runId,
    domain_id: domainId,
    stage_id: stageId,
    generation,
    current_pointer: currentPointer,
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
    required_role_artifacts: requiredRoleArtifacts,
    audit_drilldown_refs: stringRefs(record(currentOwnerDelta.audit_refs).app_operator_drilldown_ref),
  };
  const launchAdmission = evaluateStageRunAdmission({
    ...common,
    phase: 'launch',
    owner: text(currentOwnerDelta.current_owner) ?? domainId,
    scope_refs: stringRefs(
      text(currentOwnerDelta.task_or_study_ref),
      text(currentOwnerDelta.lineage_ref),
      text(currentOwnerDelta.source_fingerprint),
    ),
    selected_executor: 'codex_cli',
    expected_receipt_or_blocker_shape: 'owner_receipt_or_typed_blocker',
    input_refs: stringRefs(
      text(currentOwnerDelta.task_or_study_ref),
      text(currentOwnerDelta.lineage_ref),
      text(currentOwnerDelta.source_fingerprint),
    ),
    replay_audit_refs: stringRefs(
      text(record(currentOwnerDelta.audit_refs).app_operator_drilldown_ref),
      text(record(currentOwnerDelta.audit_refs).framework_readiness_ref),
      text(currentOwnerDelta.source_fingerprint),
    ),
    missing_strategy_refs: [
      'prompt_refs',
      'skill_refs',
      'tool_affordance_refs',
      'knowledge_refs',
      'rubric_refs',
      'evaluation_refs',
    ],
    route_back_missing_refs: ['strategy_refs'],
  });
  const closeoutAdmission = evaluateStageRunAdmission({
    ...common,
    phase: 'closeout',
    manifest_valid: true,
    produced_role_artifacts: producedRoleArtifacts,
    owner_receipt_refs: [],
    typed_blocker_refs: [],
    content_hashes: [],
    lineage_refs: stringRefs(
      text(currentOwnerDelta.lineage_ref),
      text(currentOwnerDelta.source_fingerprint),
    ),
    provider_completed: true,
    read_model_refreshed: true,
  });
  const executionAuthorization = evaluateStageRunExecutionAuthorization({
    ...common,
    phase: 'closeout',
    selected_executor: 'codex_cli',
    source_fingerprint: text(currentOwnerDelta.source_fingerprint),
    idempotency_key: text(currentOwnerDelta.delta_id) ?? runId,
    provider_attempt_ref: text(currentOwnerDelta.live_attempt_ref),
    attempt_lease_ref: text(record(currentOwnerDelta.hard_gate).attempt_lease_ref),
    attempt_lease_status: text(record(currentOwnerDelta.hard_gate).attempt_lease_status) ?? 'active',
    execution_authorization_decision_ref: text(record(currentOwnerDelta.hard_gate).execution_authorization_decision_ref),
    workspace_scope_ref: text(record(currentOwnerDelta.audit_refs).workspace_scope_ref)
      ?? text(currentOwnerDelta.task_or_study_ref),
    artifact_scope_ref: text(record(currentOwnerDelta.audit_refs).artifact_scope_ref)
      ?? text(currentOwnerDelta.lineage_ref),
    forbidden_write_required: false,
    closeout_receipt_ref: text(currentOwnerDelta.latest_owner_answer_ref),
    closeout_receipt_stage_run_id: text(record(currentOwnerDelta.hard_gate).closeout_receipt_stage_run_id),
    closeout_receipt_generation: record(currentOwnerDelta.hard_gate).closeout_receipt_generation,
    closeout_receipt_manifest_ref: text(record(currentOwnerDelta.hard_gate).closeout_receipt_manifest_ref),
    stage_manifest_ref: text(record(currentOwnerDelta.hard_gate).stage_manifest_ref),
    closeout_receipt_current_pointer_ref: text(record(currentOwnerDelta.hard_gate).closeout_receipt_current_pointer_ref),
    current_pointer_ref: text(record(currentOwnerDelta.hard_gate).current_pointer_ref),
    closeout_receipt_source_fingerprint: text(record(currentOwnerDelta.hard_gate).closeout_receipt_source_fingerprint),
  });
  const nextRequiredOwnerAction = buildExecutionAuthorizationNextAction({
    stageRunId: runId,
    domainId,
    stageId,
    currentOwnerDelta,
    executionAuthorization,
  });

  return {
    surface_kind: 'opl_app_stage_run_cockpit_projection',
    version: 'app-stage-run-cockpit.v1',
    projection_role: 'app_consumes_stage_run_current_owner_delta',
    default_read_surface: 'stage_run_current_owner_delta',
    source_current_owner_delta_ref: '/app_state/operator/current_owner_delta',
    stage_run_current_owner_delta: {
      stage_run_id: runId,
      domain_id: domainId,
      stage_id: stageId,
      current_owner: text(currentOwnerDelta.current_owner) ?? domainId,
      required_delta: text(currentOwnerDelta.desired_delta_description)
        ?? 'no_opl_operator_actionable_delta_required',
      accepted_return_shapes: acceptedReturnShapes.length > 0 ? acceptedReturnShapes : ['typed_blocker_ref'],
      hard_gate: record(currentOwnerDelta.hard_gate),
      missing_role_or_answer_summary: {
        missing_required_role_count: Math.max(requiredRoleArtifacts.length - producedRoleArtifacts.length, 0),
        required_role_artifacts: requiredRoleArtifacts,
        produced_role_artifacts: producedRoleArtifacts,
        owner_receipt_or_typed_blocker_missing: true,
      },
    },
    launch_admission: launchAdmission,
    closeout_admission: closeoutAdmission,
    execution_authorization: executionAuthorization,
    next_required_owner_action: nextRequiredOwnerAction,
    app_cockpit_policy: {
      default_path_root: 'stage_run_current_owner_delta',
      raw_worklist_default: false,
      replay_packet_default: false,
      provider_trace_default: false,
      diagnostic_drilldown_ref: 'opl runtime app-operator-drilldown --detail full --json',
    },
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_mutate_artifact_body: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_or_export: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
      provider_completion_counts_as_closeout: false,
      read_model_counts_as_closeout: false,
      conformance_pass_counts_as_closeout: false,
    },
  };
}
