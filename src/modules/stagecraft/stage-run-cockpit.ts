import { record, stringValue, type JsonRecord } from '../../kernel/json-record.ts';
import { evaluateStageRunAdmission, evaluateStageRunExecutionAuthorization } from './stage-run-kernel.ts';
import {
  latestStageRunExecutionAuthorizationCloseoutReceiptForStageAttempt,
  latestStageRunExecutionAuthorizationCloseoutReceiptForStageRun,
  latestStageRunExecutionAuthorizationReceiptForStageAttemptAnyRun,
  latestStageRunExecutionAuthorizationReceiptForStageAttempt,
  latestStageRunExecutionAuthorizationReceiptForStageRun,
} from './stage-run-execution-authorization-ledger.ts';
import {
  findOwnerAnswerProjection,
} from './domain-owner-answer-projection.ts';

function strings(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map(stringValue).filter((entry): entry is string => Boolean(entry)))]
    : [];
}

function stringRefs(...values: unknown[]) {
  return [...new Set(values.flatMap((value) => (
    Array.isArray(value) ? strings(value) : [stringValue(value)].filter(Boolean) as string[]
  )))];
}

function currentOwnerDeltaStageId(currentOwnerDelta: JsonRecord) {
  return stringValue(currentOwnerDelta.stage_id) ?? stringValue(currentOwnerDelta.stage_ref);
}

function stageRunId(currentOwnerDelta: JsonRecord) {
  return [
    'app-stage-run',
    stringValue(currentOwnerDelta.domain) ?? stringValue(currentOwnerDelta.current_owner) ?? 'one-person-lab',
    currentOwnerDeltaStageId(currentOwnerDelta) ?? 'current-owner-delta',
  ]
    .map((entry) => entry.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown')
    .join(':');
}

function stageAttemptIdFromRef(value: unknown) {
  const ref = stringValue(value);
  if (!ref) {
    return null;
  }
  if (/^sat[_-][A-Za-z0-9_-]+$/.test(ref)) {
    return ref;
  }
  const match = ref.match(/stage[_-]attempts?\/(sat[_-][A-Za-z0-9_-]+)/);
  return match?.[1] ?? null;
}

function currentOwnerDeltaStageAttemptId(currentOwnerDelta: JsonRecord) {
  return stageAttemptIdFromRef(currentOwnerDelta.lineage_ref)
    ?? stageAttemptIdFromRef(currentOwnerDelta.live_attempt_ref)
    ?? stageAttemptIdFromRef(currentOwnerDelta.task_or_study_ref);
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
  'owner_answer_ref',
  'owner_answer_stage_run_binding_ref',
  'owner_answer_stage_manifest_binding_ref',
  'owner_answer_current_pointer_binding_ref',
  'owner_answer_source_fingerprint_binding_ref',
  'owner_answer_idempotency_binding_ref',
  'quality_gate_attempt_ref',
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
  closeout_receipt_ref_missing: ['owner_answer_ref'],
  closeout_receipt_stage_run_binding_missing: ['owner_answer_stage_run_binding_ref'],
  closeout_receipt_stage_manifest_binding_missing: ['owner_answer_stage_manifest_binding_ref'],
  closeout_receipt_current_pointer_binding_missing: ['owner_answer_current_pointer_binding_ref'],
  closeout_receipt_source_fingerprint_binding_missing: [
    'owner_answer_source_fingerprint_binding_ref',
  ],
  closeout_owner_answer_idempotency_binding_missing: [
    'owner_answer_idempotency_binding_ref',
  ],
  quality_gate_independent_attempt_binding_missing: ['quality_gate_attempt_ref'],
  quality_gate_same_attempt_self_review_forbidden: ['quality_gate_attempt_ref'],
};

function ownerAnswerRef(currentOwnerDelta: JsonRecord) {
  const hardGate = record(currentOwnerDelta.hard_gate);
  return stringValue(currentOwnerDelta.latest_owner_answer_ref)
    ?? stringValue(currentOwnerDelta.latest_owner_receipt_ref)
    ?? stringValue(currentOwnerDelta.latest_typed_blocker_ref)
    ?? stringValue(hardGate.owner_answer_ref)
    ?? stringValue(hardGate.closeout_receipt_ref)
    ?? stringValue(hardGate.typed_blocker_ref);
}

function ownerAnswerKind(currentOwnerDelta: JsonRecord) {
  const hardGate = record(currentOwnerDelta.hard_gate);
  const explicitKind = stringValue(hardGate.owner_answer_kind) ?? stringValue(currentOwnerDelta.latest_owner_answer_kind);
  if (explicitKind === 'typed_blocker' || stringValue(currentOwnerDelta.latest_typed_blocker_ref) || stringValue(hardGate.typed_blocker_ref)) {
    return 'typed_blocker';
  }
  if (explicitKind === 'quality_gate_receipt' || explicitKind === 'human_gate' || explicitKind === 'route_back_evidence') {
    return explicitKind;
  }
  return ownerAnswerRef(currentOwnerDelta) ? 'owner_receipt' : null;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function ownerAnswerRefFromProjection(projection: JsonRecord) {
  const hardGate = record(projection.hard_gate);
  return stringValue(hardGate.owner_answer_ref)
    ?? stringValue(projection.latest_owner_answer_ref)
    ?? stringValue(projection.latest_owner_receipt_ref)
    ?? stringValue(projection.latest_typed_blocker_ref);
}

function ownerAnswerKindFromProjection(projection: JsonRecord) {
  const hardGate = record(projection.hard_gate);
  const explicitKind = stringValue(hardGate.owner_answer_kind) ?? stringValue(projection.latest_owner_answer_kind);
  if (explicitKind === 'typed_blocker' || stringValue(projection.latest_typed_blocker_ref)) {
    return 'typed_blocker';
  }
  if (explicitKind === 'quality_gate_receipt' || explicitKind === 'human_gate' || explicitKind === 'route_back_evidence') {
    return explicitKind;
  }
  return ownerAnswerRefFromProjection(projection) ? 'owner_receipt' : null;
}

function legalStageRunCloseoutOwnerAnswerKind(kind: string | null) {
  return kind === 'owner_receipt' || kind === 'typed_blocker' || kind === 'quality_gate_receipt'
    ? kind
    : null;
}

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
  const desiredDeltaKind = stringValue(input.currentOwnerDelta.desired_delta_kind) ?? 'none';
  const hardGateState = stringValue(hardGate.state) ?? 'none';
  if (desiredDeltaKind === 'none' && hardGateState === 'none') {
    return null;
  }
  const blocker = record(input.executionAuthorization.opl_runtime_blocker);
  const reasons = strings(blocker.blocker_reasons);
  if (stringValue(input.executionAuthorization.status) !== 'blocked' || reasons.length === 0) {
    return null;
  }
  const missingRefs = missingRefsFromBlockerReasons(reasons);
  const executionAuthorizationMissing = EXECUTION_AUTHORIZATION_REQUIRED_REFS.some((ref) =>
    missingRefs.includes(ref)
  );
  const domainOwnerAnswerMissing = !executionAuthorizationMissing
    && CLOSEOUT_BINDING_REQUIRED_REFS.some((ref) => missingRefs.includes(ref));
  const currentDomainOwner =
    stringValue(input.currentOwnerDelta.current_owner)
    ?? stringValue(input.currentOwnerDelta.owner)
    ?? input.domainId;
  const nextRequiredOwner = domainOwnerAnswerMissing ? currentDomainOwner : 'one-person-lab';
  const nextRequiredAction = domainOwnerAnswerMissing
    ? stringValue(input.currentOwnerDelta.desired_delta_description)
      ?? stringValue(input.currentOwnerDelta.payload_requirement)
      ?? 'domain_owner_receipt_quality_gate_or_typed_blocker_required'
    : 'record_opl_provider_attempt_lease_authorization_and_closeout_receipt_binding_refs';
  const payloadRequirement = domainOwnerAnswerMissing
    ? stringValue(input.currentOwnerDelta.payload_requirement)
      ?? 'domain_owner_receipt_quality_gate_or_typed_blocker_required'
    : 'opl_execution_authorization_and_closeout_binding_refs_required';
  const acceptedAnswerShape = domainOwnerAnswerMissing
    ? strings(input.currentOwnerDelta.accepted_answer_shape).length > 0
      ? strings(input.currentOwnerDelta.accepted_answer_shape)
      : strings(input.currentOwnerDelta.required_return_shapes).length > 0
        ? strings(input.currentOwnerDelta.required_return_shapes)
        : ['domain_owner_receipt_ref', 'typed_blocker_ref']
    : [
        'provider_attempt_ref',
        'attempt_lease_ref',
        'execution_authorization_decision_ref',
        'owner_answer_binding_ref',
      ];
  const routeRequiresDomainPayload = domainOwnerAnswerMissing;
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
    owner: nextRequiredOwner,
    current_owner: nextRequiredOwner,
    next_required_owner: nextRequiredOwner,
    next_required_action: nextRequiredAction,
    next_required_action_summary: domainOwnerAnswerMissing
      ? 'Domain owner must return a legal owner receipt, quality gate receipt, or typed blocker before OPL can record refs-only closeout binding.'
      : 'Record OPL provider attempt, active lease, execution authorization decision, workspace/artifact scope, source fingerprint/idempotency, and closeout receipt binding refs before execution or closeout.',
    payload_requirement: payloadRequirement,
    accepted_answer_shape: acceptedAnswerShape,
    required_return_shapes: acceptedAnswerShape,
    blocked_authority: strings(blocker.blocked_authority),
    blocker_code: stringValue(blocker.blocker_code) ?? 'stage_run_execution_authorization_blocked',
    blocker_reasons: reasons,
    missing_input_refs: missingRefs,
    required_ref_shape: {
      execution_authorization_refs: [...EXECUTION_AUTHORIZATION_REQUIRED_REFS],
      closeout_receipt_binding_refs: [...CLOSEOUT_BINDING_REQUIRED_REFS],
    },
    route_requires_opl_runtime_refs: !domainOwnerAnswerMissing,
    route_requires_domain_or_app_payload: routeRequiresDomainPayload,
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
    owner_answer_missing_before_opl_closeout_binding: domainOwnerAnswerMissing,
    worklist_item_is_completion_claim: false,
  };
}

export function buildAppStageRunCockpit(currentOwnerDeltaInput: unknown) {
  const currentOwnerDelta = record(currentOwnerDeltaInput);
  const currentOwnerDeltaRunId = stageRunId(currentOwnerDelta);
  const generation = 0;
  const currentOwnerDeltaDomainId =
    stringValue(currentOwnerDelta.domain) ?? stringValue(currentOwnerDelta.current_owner) ?? 'one-person-lab';
  const currentOwnerDeltaStageIdValue = currentOwnerDeltaStageId(currentOwnerDelta) ?? 'current-owner-delta';
  const currentStageAttemptId = currentOwnerDeltaStageAttemptId(currentOwnerDelta);
  const latestExecutionAuthorization =
    latestStageRunExecutionAuthorizationCloseoutReceiptForStageRun(currentOwnerDeltaRunId)
    ?? (currentStageAttemptId
      ? latestStageRunExecutionAuthorizationCloseoutReceiptForStageAttempt(currentStageAttemptId)
        ?? latestStageRunExecutionAuthorizationReceiptForStageAttempt({
            stageRunId: currentOwnerDeltaRunId,
            stageAttemptId: currentStageAttemptId,
          })
        ?? latestStageRunExecutionAuthorizationReceiptForStageAttemptAnyRun(currentStageAttemptId)
      : latestStageRunExecutionAuthorizationReceiptForStageRun(currentOwnerDeltaRunId));
  const runId = latestExecutionAuthorization?.stage_run_id ?? currentOwnerDeltaRunId;
  const domainId = latestExecutionAuthorization?.domain_id ?? currentOwnerDeltaDomainId;
  const stageId = latestExecutionAuthorization?.stage_id ?? currentOwnerDeltaStageIdValue;
  const stageRunIdentitySource = latestExecutionAuthorization?.stage_run_id === currentOwnerDeltaRunId
      ? 'current_owner_delta_stage_run_id'
    : latestExecutionAuthorization
      ? 'stage_attempt_execution_authorization_receipt'
      : 'current_owner_delta_synthetic';
  const currentPointer = {
    stage_run_id: runId,
    generation,
    current: true,
  };
  const ownerAnswerProjectionMatch = findOwnerAnswerProjection({
    receipt: latestExecutionAuthorization,
  });
  const ownerAnswerProjection = record(ownerAnswerProjectionMatch?.projection);
  const ownerAnswerProjectionHardGate = record(ownerAnswerProjection.hard_gate);
  const ownerAnswerProjectionCloseoutBinding = record(ownerAnswerProjection.closeout_binding);
  const bridgedOwnerAnswerRef = ownerAnswerRefFromProjection(ownerAnswerProjection);
  const observedOwnerAnswerKind = ownerAnswerKind(currentOwnerDelta)
    ?? latestExecutionAuthorization?.owner_answer_kind
    ?? ownerAnswerKindFromProjection(ownerAnswerProjection);
  const effectiveOwnerAnswerKind = legalStageRunCloseoutOwnerAnswerKind(observedOwnerAnswerKind);
  const rawOwnerAnswerRef = ownerAnswerRef(currentOwnerDelta)
    ?? latestExecutionAuthorization?.owner_answer_ref
    ?? bridgedOwnerAnswerRef;
  const effectiveOwnerAnswerRef = effectiveOwnerAnswerKind ? rawOwnerAnswerRef : null;
  const hasOwnerAnswer =
    Boolean(effectiveOwnerAnswerRef);
  const acceptedReturnShapes = strings(currentOwnerDelta.accepted_answer_shape);
  const requiredRoleArtifacts = ['owner_delta', 'role_artifacts', 'owner_receipt_or_typed_blocker'];
  const producedRoleArtifacts = [
    ...(acceptedReturnShapes.some((entry) =>
    entry.includes('owner_receipt')
      || entry.includes('quality_gate')
      || entry.includes('typed_blocker')
      || entry.includes('human_gate')
      || entry.includes('route_back'))
      ? ['owner_delta', 'role_artifacts']
      : ['owner_delta']),
    ...(hasOwnerAnswer ? ['owner_receipt_or_typed_blocker'] : []),
  ];
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
    owner: stringValue(currentOwnerDelta.current_owner) ?? domainId,
    scope_refs: stringRefs(
      stringValue(currentOwnerDelta.task_or_study_ref),
      stringValue(currentOwnerDelta.lineage_ref),
      stringValue(currentOwnerDelta.source_fingerprint),
    ),
    selected_executor: 'codex_cli',
    expected_receipt_or_blocker_shape: 'owner_receipt_or_typed_blocker',
    input_refs: stringRefs(
      stringValue(currentOwnerDelta.task_or_study_ref),
      stringValue(currentOwnerDelta.lineage_ref),
      stringValue(currentOwnerDelta.source_fingerprint),
    ),
    replay_audit_refs: stringRefs(
      stringValue(record(currentOwnerDelta.audit_refs).app_operator_drilldown_ref),
      stringValue(record(currentOwnerDelta.audit_refs).framework_readiness_ref),
      stringValue(currentOwnerDelta.source_fingerprint),
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
    owner_receipt_refs: effectiveOwnerAnswerKind === 'owner_receipt'
      ? stringRefs(effectiveOwnerAnswerRef)
      : [],
    typed_blocker_refs: effectiveOwnerAnswerKind === 'typed_blocker'
      ? stringRefs(effectiveOwnerAnswerRef)
      : [],
    quality_gate_receipt_refs: effectiveOwnerAnswerKind === 'quality_gate_receipt'
      ? stringRefs(effectiveOwnerAnswerRef)
      : [],
    content_hashes: stringRefs(
      stringValue(ownerAnswerProjection.source_fingerprint),
      stringValue(ownerAnswerProjectionCloseoutBinding.source_fingerprint),
    ),
    lineage_refs: stringRefs(
      stringValue(currentOwnerDelta.lineage_ref),
      stringValue(currentOwnerDelta.source_fingerprint),
    ),
    provider_completed: true,
    read_model_refreshed: true,
  });
  const executionAuthorization = evaluateStageRunExecutionAuthorization({
    ...common,
    phase: 'closeout',
    selected_executor: 'codex_cli',
    source_fingerprint:
      latestExecutionAuthorization?.source_fingerprint ?? stringValue(currentOwnerDelta.source_fingerprint),
    idempotency_key:
      latestExecutionAuthorization?.idempotency_key ?? stringValue(currentOwnerDelta.delta_id) ?? runId,
    provider_attempt_ref:
      latestExecutionAuthorization?.provider_attempt_ref ?? stringValue(currentOwnerDelta.live_attempt_ref),
    attempt_lease_ref:
      latestExecutionAuthorization?.attempt_lease_ref ?? stringValue(record(currentOwnerDelta.hard_gate).attempt_lease_ref),
    attempt_lease_status:
      latestExecutionAuthorization?.attempt_lease_status
      ?? stringValue(record(currentOwnerDelta.hard_gate).attempt_lease_status)
      ?? 'active',
    execution_authorization_decision_ref:
      latestExecutionAuthorization?.execution_authorization_decision_ref
      ?? stringValue(record(currentOwnerDelta.hard_gate).execution_authorization_decision_ref),
    workspace_scope_ref:
      latestExecutionAuthorization?.workspace_scope_ref
      ?? stringValue(record(currentOwnerDelta.audit_refs).workspace_scope_ref)
      ?? stringValue(currentOwnerDelta.task_or_study_ref),
    artifact_scope_ref:
      latestExecutionAuthorization?.artifact_scope_ref
      ?? stringValue(record(currentOwnerDelta.audit_refs).artifact_scope_ref)
      ?? stringValue(currentOwnerDelta.lineage_ref),
    forbidden_write_required: false,
    owner_answer_ref: effectiveOwnerAnswerRef,
    owner_answer_kind: effectiveOwnerAnswerKind,
    owner_answer_stage_run_id: stringValue(record(currentOwnerDelta.hard_gate).owner_answer_stage_run_id)
      ?? stringValue(record(currentOwnerDelta.hard_gate).closeout_receipt_stage_run_id)
      ?? latestExecutionAuthorization?.owner_answer_stage_run_id
      ?? (bridgedOwnerAnswerRef ? runId : null),
    owner_answer_generation: record(currentOwnerDelta.hard_gate).owner_answer_generation
      ?? record(currentOwnerDelta.hard_gate).closeout_receipt_generation
      ?? latestExecutionAuthorization?.owner_answer_generation
      ?? numberValue(ownerAnswerProjectionHardGate.owner_answer_generation)
      ?? numberValue(ownerAnswerProjectionCloseoutBinding.generation),
    owner_answer_manifest_ref: stringValue(record(currentOwnerDelta.hard_gate).owner_answer_manifest_ref)
      ?? stringValue(record(currentOwnerDelta.hard_gate).closeout_receipt_manifest_ref)
      ?? latestExecutionAuthorization?.owner_answer_manifest_ref
      ?? stringValue(ownerAnswerProjectionHardGate.owner_answer_manifest_ref)
      ?? stringValue(ownerAnswerProjectionCloseoutBinding.stage_manifest_ref),
    stage_manifest_ref: stringValue(record(currentOwnerDelta.hard_gate).stage_manifest_ref)
      ?? stringValue(ownerAnswerProjectionHardGate.stage_manifest_ref)
      ?? stringValue(ownerAnswerProjection.stage_manifest_ref)
      ?? stringValue(ownerAnswerProjectionCloseoutBinding.stage_manifest_ref)
      ?? latestExecutionAuthorization?.stage_manifest_ref,
    owner_answer_current_pointer_ref: stringValue(record(currentOwnerDelta.hard_gate).owner_answer_current_pointer_ref)
      ?? stringValue(record(currentOwnerDelta.hard_gate).closeout_receipt_current_pointer_ref)
      ?? latestExecutionAuthorization?.owner_answer_current_pointer_ref
      ?? stringValue(ownerAnswerProjectionHardGate.owner_answer_current_pointer_ref)
      ?? stringValue(ownerAnswerProjectionCloseoutBinding.current_pointer_ref),
    current_pointer_ref: stringValue(record(currentOwnerDelta.hard_gate).current_pointer_ref)
      ?? stringValue(ownerAnswerProjectionHardGate.current_pointer_ref)
      ?? stringValue(ownerAnswerProjection.current_pointer_ref)
      ?? stringValue(ownerAnswerProjectionCloseoutBinding.current_pointer_ref)
      ?? latestExecutionAuthorization?.current_pointer_ref,
    owner_answer_source_fingerprint: stringValue(record(currentOwnerDelta.hard_gate).owner_answer_source_fingerprint)
      ?? stringValue(record(currentOwnerDelta.hard_gate).closeout_receipt_source_fingerprint)
      ?? latestExecutionAuthorization?.owner_answer_source_fingerprint
      ?? stringValue(ownerAnswerProjectionHardGate.owner_answer_source_fingerprint)
      ?? stringValue(ownerAnswerProjection.source_fingerprint)
      ?? stringValue(ownerAnswerProjectionCloseoutBinding.source_fingerprint),
    owner_answer_idempotency_key: stringValue(record(currentOwnerDelta.hard_gate).owner_answer_idempotency_key)
      ?? stringValue(record(currentOwnerDelta.hard_gate).closeout_receipt_idempotency_key)
      ?? latestExecutionAuthorization?.owner_answer_idempotency_key
      ?? stringValue(ownerAnswerProjectionHardGate.owner_answer_idempotency_key)
      ?? stringValue(ownerAnswerProjection.delta_id)
      ?? stringValue(ownerAnswerProjectionCloseoutBinding.idempotency_key),
    quality_gate_attempt_ref: stringValue(record(currentOwnerDelta.hard_gate).quality_gate_attempt_ref)
      ?? latestExecutionAuthorization?.quality_gate_attempt_ref
      ?? stringValue(ownerAnswerProjectionHardGate.quality_gate_attempt_ref)
      ?? stringValue(ownerAnswerProjectionCloseoutBinding.quality_gate_attempt_ref),
  });
  const nextRequiredOwnerAction = buildExecutionAuthorizationNextAction({
    stageRunId: runId,
    domainId,
    stageId,
    currentOwnerDelta,
    executionAuthorization,
  });
  const currentOwnerDeltaOwner = stringValue(currentOwnerDelta.current_owner) ?? domainId;
  const stageRunCurrentOwner =
    stringValue(nextRequiredOwnerAction?.next_required_owner)
    ?? currentOwnerDeltaOwner;

  return {
    surface_kind: 'opl_app_stage_run_cockpit_projection',
    version: 'app-stage-run-cockpit.v1',
    projection_role: 'app_consumes_stage_run_current_owner_delta',
    default_read_surface: 'stage_run_current_owner_delta',
    source_current_owner_delta_ref: '/app_state/operator/current_owner_delta',
    stage_run_current_owner_delta: {
      stage_run_id: runId,
      source_current_owner_delta_stage_run_id: currentOwnerDeltaRunId,
      stage_run_identity_source: stageRunIdentitySource,
      domain_id: domainId,
      stage_id: stageId,
      current_owner: stageRunCurrentOwner,
      current_owner_delta_owner: currentOwnerDeltaOwner,
      required_delta: stringValue(currentOwnerDelta.desired_delta_description)
        ?? 'no_opl_operator_actionable_delta_required',
      accepted_return_shapes: acceptedReturnShapes.length > 0 ? acceptedReturnShapes : ['typed_blocker_ref'],
      hard_gate: record(currentOwnerDelta.hard_gate),
      execution_authorization_receipt_ref: latestExecutionAuthorization?.receipt_ref ?? null,
      execution_authorization_decision_ref:
        latestExecutionAuthorization?.execution_authorization_decision_ref ?? null,
      current_owner_delta_stage_attempt_id: currentStageAttemptId,
      missing_role_or_answer_summary: {
        missing_required_role_count: Math.max(requiredRoleArtifacts.length - producedRoleArtifacts.length, 0),
        required_role_artifacts: requiredRoleArtifacts,
        produced_role_artifacts: producedRoleArtifacts,
        owner_receipt_or_typed_blocker_missing: !hasOwnerAnswer,
      },
      owner_answer_binding_projection: ownerAnswerProjectionMatch
        ? {
            profile_id: ownerAnswerProjectionMatch.profile_id,
            profile_role: ownerAnswerProjectionMatch.profile_role,
            projection_ref: ownerAnswerProjectionMatch.projection_ref,
            workspace_root: ownerAnswerProjectionMatch.workspace_root,
            study_id: ownerAnswerProjectionMatch.study_id,
            source_stage_run_id:
              stringValue(ownerAnswerProjection.stage_run_id)
              ?? stringValue(ownerAnswerProjectionCloseoutBinding.stage_run_id),
            source_owner_answer_stage_run_id:
              stringValue(ownerAnswerProjectionHardGate.owner_answer_stage_run_id),
            bridged_stage_run_id: runId,
            closeout_binding_source: 'owner_answer_projection_profile_registry',
            match_policy:
              'trusted_opl_execution_authorization_provider_attempt_lease_decision_source_idempotency_match',
            reason: stringValue(ownerAnswerProjection.reason),
            authority_boundary: ownerAnswerProjectionMatch.authority_boundary,
          }
        : null,
    },
    launch_admission: launchAdmission,
    closeout_admission: closeoutAdmission,
    execution_authorization: executionAuthorization,
    execution_authorization_ledger_receipt: latestExecutionAuthorization
      ? {
          receipt_ref: latestExecutionAuthorization.receipt_ref,
          receipt_status: latestExecutionAuthorization.receipt_status,
          stage_attempt_id: latestExecutionAuthorization.stage_attempt_id,
          provider_attempt_ref: latestExecutionAuthorization.provider_attempt_ref,
          quality_gate_attempt_ref: latestExecutionAuthorization.quality_gate_attempt_ref,
          attempt_lease_ref: latestExecutionAuthorization.attempt_lease_ref,
          execution_authorization_decision_ref:
            latestExecutionAuthorization.execution_authorization_decision_ref,
          authority_boundary: latestExecutionAuthorization.authority_boundary,
        }
      : null,
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
