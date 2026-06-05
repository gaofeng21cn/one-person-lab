import { evaluateStageRunAdmission } from './stage-run-kernel.ts';

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
