import { record, stringValue, type JsonRecord } from '../../kernel/json-record.ts';
import { evaluateStageRunProgress } from './stage-run-kernel.ts';

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

function ownerAnswerRef(currentOwnerDelta: JsonRecord) {
  const hardGate = record(currentOwnerDelta.hard_gate);
  return stringValue(currentOwnerDelta.latest_owner_answer_ref)
    ?? stringValue(currentOwnerDelta.latest_owner_receipt_ref)
    ?? stringValue(currentOwnerDelta.latest_typed_blocker_ref)
    ?? stringValue(hardGate.owner_answer_ref)
    ?? stringValue(hardGate.typed_blocker_ref);
}

function ownerAnswerKind(currentOwnerDelta: JsonRecord) {
  const hardGate = record(currentOwnerDelta.hard_gate);
  const explicitKind = stringValue(hardGate.owner_answer_kind)
    ?? stringValue(currentOwnerDelta.latest_owner_answer_kind);
  if (explicitKind === 'typed_blocker' || stringValue(currentOwnerDelta.latest_typed_blocker_ref)) {
    return 'typed_blocker';
  }
  if (explicitKind === 'quality_gate_receipt') {
    return explicitKind;
  }
  return ownerAnswerRef(currentOwnerDelta) ? 'owner_receipt' : null;
}

export function buildAppStageRunCockpit(currentOwnerDeltaInput: unknown) {
  const currentOwnerDelta = record(currentOwnerDeltaInput);
  const runId = stageRunId(currentOwnerDelta);
  const domainId =
    stringValue(currentOwnerDelta.domain) ?? stringValue(currentOwnerDelta.current_owner) ?? 'one-person-lab';
  const stageId = currentOwnerDeltaStageId(currentOwnerDelta) ?? 'current-owner-delta';
  const effectiveOwnerAnswerRef = ownerAnswerRef(currentOwnerDelta);
  const effectiveOwnerAnswerKind = ownerAnswerKind(currentOwnerDelta);
  const consumableArtifactProgressRefs = stringRefs(
    currentOwnerDelta.consumable_artifact_refs,
    currentOwnerDelta.consumable_artifact_ref,
    currentOwnerDelta.progress_delta_receipt_refs,
    currentOwnerDelta.progress_delta_receipt_ref,
    currentOwnerDelta.artifact_refs,
    currentOwnerDelta.artifact_ref,
  );
  const hasConsumableArtifactProgress = consumableArtifactProgressRefs.length > 0;
  const acceptedReturnShapes = strings(currentOwnerDelta.accepted_answer_shape);
  const requiredRoleArtifacts = ['owner_delta', 'progress_artifact_or_hard_stop'];
  const producedRoleArtifacts = [
    'owner_delta',
    ...(hasConsumableArtifactProgress || effectiveOwnerAnswerRef ? ['progress_artifact_or_hard_stop'] : []),
  ];
  const common = {
    stage_run_id: runId,
    domain_id: domainId,
    stage_id: stageId,
    generation: 0,
    current_pointer: {
      stage_run_id: runId,
      generation: 0,
      current: true,
    },
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
    required_role_artifacts: requiredRoleArtifacts,
    audit_drilldown_refs: stringRefs(record(currentOwnerDelta.audit_refs).app_operator_drilldown_ref),
  };
  const launchProgress = evaluateStageRunProgress({
    ...common,
    phase: 'launch',
    owner: stringValue(currentOwnerDelta.current_owner) ?? domainId,
    selected_executor: 'codex_cli',
    scope_refs: stringRefs(
      currentOwnerDelta.task_or_study_ref,
      currentOwnerDelta.lineage_ref,
      currentOwnerDelta.source_fingerprint,
    ),
    input_refs: stringRefs(
      currentOwnerDelta.task_or_study_ref,
      currentOwnerDelta.lineage_ref,
      currentOwnerDelta.source_fingerprint,
    ),
  });
  const closeoutProgress = evaluateStageRunProgress({
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
    consumable_artifact_refs: consumableArtifactProgressRefs,
    lineage_refs: stringRefs(currentOwnerDelta.lineage_ref, currentOwnerDelta.source_fingerprint),
  });
  const nextStageMayStart = hasConsumableArtifactProgress
    || closeoutProgress.transition_outcome !== 'hard_stopped';

  return {
    surface_kind: 'opl_app_stage_run_cockpit_projection',
    version: 'app-stage-run-cockpit.v2',
    projection_role: 'passive_progress_and_transport_readback',
    source_current_owner_delta_ref: '/app_state/operator/current_owner_delta',
    stage_run_current_owner_delta: {
      stage_run_id: runId,
      stage_run_identity_source: 'current_owner_delta',
      domain_id: domainId,
      stage_id: stageId,
      current_owner: stringValue(currentOwnerDelta.current_owner) ?? domainId,
      required_delta: stringValue(currentOwnerDelta.desired_delta_description)
        ?? 'codex_may_select_any_declared_stage',
      accepted_return_shapes: acceptedReturnShapes.length > 0
        ? acceptedReturnShapes
        : ['readable_artifact_ref', 'hard_stop_ref'],
      hard_gate: record(currentOwnerDelta.hard_gate),
      progress_artifact_refs: consumableArtifactProgressRefs,
      owner_answer_ref: effectiveOwnerAnswerRef,
      owner_answer_kind: effectiveOwnerAnswerKind,
      next_stage_may_start: nextStageMayStart,
      route_options: ['skip', 'repeat', 'reverse', 'route_back', 'advance'],
    },
    launch_progress: launchProgress,
    closeout_progress: closeoutProgress,
    next_required_owner_action: null,
    transport_observation: {
      provider_attempt_ref: stringValue(currentOwnerDelta.live_attempt_ref),
      source_fingerprint: stringValue(currentOwnerDelta.source_fingerprint),
      role: 'observability_only',
      missing_transport_refs_block_next_stage: false,
    },
    authority_boundary: {
      refs_only: true,
      can_select_semantic_route: false,
      can_block_next_declared_stage_for_quality_debt: false,
      can_write_domain_truth: false,
      can_mutate_artifact_body: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_or_export: false,
      can_claim_production_ready: false,
      read_model_counts_as_closeout: false,
    },
  };
}
