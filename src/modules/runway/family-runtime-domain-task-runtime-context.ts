import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  stringList,
  stringValue,
  uniqueStringList,
} from '../../kernel/json-record.ts';

type JsonRecord = Record<string, unknown>;

const STALE_OR_MISSING_RECONCILIATION_STATUSES = new Set([
  'blocked_missing_identity',
  'blocked_stale_epoch',
  'blocked_stale_work_unit',
]);

const ROUTE_IMPACT_SCALAR_FIELDS = [
  'next_owner',
  'selected_action_id',
  'selected_stage_route',
  'blocked_reason',
  'blocker_reason',
] as const;

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function refList(value: unknown) {
  return uniqueStringList(stringList(value));
}

function refsOnlyRouteImpact(value: unknown) {
  const source = record(value);
  const projection: JsonRecord = {};
  for (const field of ROUTE_IMPACT_SCALAR_FIELDS) {
    const selected = stringValue(source[field]);
    if (selected) {
      projection[field] = selected;
    }
  }
  for (const [key, selected] of Object.entries(source)) {
    if (key.endsWith('_ref')) {
      const ref = stringValue(selected);
      if (ref) {
        projection[key] = ref;
      }
    } else if (key.endsWith('_refs')) {
      const refs = refList(selected);
      if (refs.length > 0) {
        projection[key] = refs;
      }
    }
  }
  return projection;
}

function refsOnlyCurrentnessIdentity(value: JsonRecord) {
  return {
    surface_kind: 'opl_stage_run_currentness_identity',
    schema_version: 1,
    domain_id: stringValue(value.domain_id),
    study_id_or_quest_id: stringValue(value.study_id_or_quest_id),
    stage_id: stringValue(value.stage_id),
    stage_attempt_id: stringValue(value.stage_attempt_id),
    action_type: stringValue(value.action_type),
    work_unit_id: stringValue(value.work_unit_id),
    work_unit_fingerprint: stringValue(value.work_unit_fingerprint),
    source_fingerprint: stringValue(value.source_fingerprint),
    truth_epoch: stringValue(value.truth_epoch),
    runtime_health_epoch: stringValue(value.runtime_health_epoch),
    source_eval_id: stringValue(value.source_eval_id),
    idempotency_key: stringValue(value.idempotency_key),
    route_identity_key: stringValue(value.route_identity_key),
    attempt_idempotency_key: stringValue(value.attempt_idempotency_key),
    recovery_obligation_id: stringValue(value.recovery_obligation_id),
    dispatch_ref: stringValue(value.dispatch_ref),
    stage_packet_ref: stringValue(value.stage_packet_ref),
    stage_packet_refs: refList(value.stage_packet_refs),
    provider_attempt_identity: null,
    owner_route_currentness_basis: null,
    provider_attempt_ref: stringValue(value.provider_attempt_ref),
    workflow_id: stringValue(value.workflow_id),
    task_id: stringValue(value.task_id),
  };
}

function resumeRefs(stageAttemptId: string, value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStringList(value.flatMap((entry) => {
    const signal = record(entry);
    const payload = record(signal.payload);
    const explicitRefs = [
      stringValue(payload.resume_ref),
      ...refList(payload.resume_refs),
    ];
    const signalId = stringValue(signal.signal_id);
    return [
      ...explicitRefs,
      signalId
        ? `opl://stage-attempts/${encodeURIComponent(stageAttemptId)}/signals/${encodeURIComponent(signalId)}`
        : null,
    ].filter((candidate): candidate is string => Boolean(candidate));
  }));
}

export function buildOplDomainTaskRuntimeContext(input: {
  currentControlState: JsonRecord;
  stageAttemptQuery: JsonRecord;
}) {
  const current = input.currentControlState;
  const query = input.stageAttemptQuery;
  const attempt = record(query.attempt);
  const identity = record(current.stage_run_currentness_identity);
  const stageAttemptId = stringValue(attempt.stage_attempt_id);
  const currentStageAttemptId = stringValue(current.current_stage_attempt_id);
  const identityStageAttemptId = stringValue(identity.stage_attempt_id);
  const reconciliationStatus = stringValue(current.reconciliation_status);
  const missingIdentityFields = refList(current.missing_stage_run_currentness_identity_fields);
  const identityCurrent = Boolean(
    stageAttemptId
    && currentStageAttemptId === stageAttemptId
    && identityStageAttemptId === stageAttemptId
    && reconciliationStatus
    && !STALE_OR_MISSING_RECONCILIATION_STATUSES.has(reconciliationStatus)
    && missingIdentityFields.length === 0
  );
  if (!identityCurrent) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Domain task runtime context requires a complete current StageRun identity.',
      {
        stage_attempt_id: stageAttemptId,
        current_stage_attempt_id: currentStageAttemptId,
        identity_stage_attempt_id: identityStageAttemptId,
        reconciliation_status: reconciliationStatus,
        missing_identity_fields: missingIdentityFields,
        missing_transport_fields: [],
      },
    );
  }

  const domainOutput = record(query.domain_output);
  return {
    surface_kind: 'opl_domain_task_runtime_context',
    stage_run_currentness_identity: refsOnlyCurrentnessIdentity(identity),
    stage_attempt_id: stageAttemptId,
    status: stringValue(attempt.status),
    canonical_outcome: stringValue(query.canonical_outcome),
    running_provider_attempt: current.running_provider_attempt === true,
    reconciliation_status: reconciliationStatus,
    provider_attempt_ref: stringValue(identity.provider_attempt_ref),
    owner_receipt_refs: refList(current.owner_receipt_refs),
    typed_blocker_refs: refList(current.typed_blocker_refs),
    human_gate_refs: refList(attempt.human_gate_refs),
    resume_refs: resumeRefs(stageAttemptId as string, query.resume_ledger),
    domain_output_ref: stringValue(domainOutput.output_ref),
    route_impact: refsOnlyRouteImpact(attempt.route_impact),
    authority_boundary: {
      opl: 'runtime_control_metadata_and_refs_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
      opl_can_write_domain_truth: false,
      opl_can_create_owner_receipt: false,
      opl_can_create_typed_blocker: false,
    },
  };
}

export function projectOplDomainTaskRuntimeContext(input: {
  currentControlState: JsonRecord;
  stageAttemptQuery: JsonRecord;
}) {
  try {
    return buildOplDomainTaskRuntimeContext(input);
  } catch (error) {
    if (!(error instanceof FrameworkContractError)) {
      throw error;
    }
    const attempt = record(input.stageAttemptQuery.attempt);
    const current = input.currentControlState;
    const details = record(error.details);
    return {
      surface_kind: 'opl_domain_task_runtime_context',
      projection_status: 'blocked',
      blocker_reason: 'current_stage_run_identity_required',
      stage_attempt_id: stringValue(attempt.stage_attempt_id),
      reconciliation_status: stringValue(current.reconciliation_status),
      missing_identity_fields: refList(details.missing_identity_fields),
      missing_transport_fields: refList(details.missing_transport_fields),
      authority_boundary: {
        opl: 'runtime_control_metadata_and_refs_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
        task_materialization_allowed: false,
      },
    };
  }
}
