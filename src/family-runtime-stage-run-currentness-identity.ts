type JsonRecord = Record<string, unknown>;

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function recordValue(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function nestedRecord(source: JsonRecord, ...keys: string[]) {
  let current: JsonRecord | null = source;
  for (const key of keys) {
    current = current ? recordValue(current[key]) : null;
  }
  return current;
}

export type StageRunCurrentnessIdentity = {
  surface_kind: 'opl_stage_run_currentness_identity';
  schema_version: 1;
  domain_id: string | null;
  study_id_or_quest_id: string | null;
  stage_id: string | null;
  stage_attempt_id: string | null;
  action_type: string | null;
  work_unit_id: string | null;
  work_unit_fingerprint: string | null;
  source_fingerprint: string | null;
  truth_epoch: string | null;
  runtime_health_epoch: string | null;
  source_eval_id: string | null;
  idempotency_key: string | null;
  route_identity_key: string | null;
  attempt_idempotency_key: string | null;
  provider_admission_identity: JsonRecord | null;
  owner_route_currentness_basis: JsonRecord | null;
  provider_attempt_ref: string | null;
  active_lease_ref: string | null;
  execution_authorization_ref: string | null;
  workflow_id: string | null;
  task_id: string | null;
};

export type StageRunCurrentnessIdentityInput = {
  task?: JsonRecord | null;
  taskPayload?: JsonRecord | null;
  stageAttempt?: JsonRecord | null;
  currentOwnerDelta?: JsonRecord | null;
};

export function buildStageRunCurrentnessIdentity(
  input: StageRunCurrentnessIdentityInput,
): StageRunCurrentnessIdentity {
  const task = input.task ?? {};
  const taskPayload = input.taskPayload ?? recordValue(task.payload) ?? {};
  const stageAttempt = input.stageAttempt ?? {};
  const currentOwnerDelta = input.currentOwnerDelta ?? {};
  const providerAdmissionIdentity = recordValue(taskPayload.provider_admission_identity)
    ?? recordValue(stageAttempt.provider_admission_identity);
  const ownerRoute = recordValue(taskPayload.owner_route) ?? {};
  const sourceRefs = recordValue(ownerRoute.source_refs) ?? {};
  const currentnessContract = recordValue(ownerRoute.currentness_contract) ?? {};
  const basis = recordValue(sourceRefs.owner_route_currentness_basis)
    ?? recordValue(currentnessContract.basis)
    ?? recordValue(taskPayload.owner_route_currentness_basis)
    ?? recordValue(currentOwnerDelta.currentness_basis)
    ?? {};
  const workspaceLocator = recordValue(stageAttempt.workspace_locator)
    ?? recordValue(taskPayload.workspace_locator)
    ?? {};
  return {
    surface_kind: 'opl_stage_run_currentness_identity',
    schema_version: 1,
    domain_id: optionalString(stageAttempt.domain_id) ?? optionalString(task.domain_id),
    study_id_or_quest_id: optionalString(taskPayload.study_id)
      ?? optionalString(taskPayload.quest_id)
      ?? optionalString(currentOwnerDelta.study_id)
      ?? optionalString(currentOwnerDelta.quest_id),
    stage_id: optionalString(stageAttempt.stage_id)
      ?? optionalString(taskPayload.stage_id)
      ?? optionalString(workspaceLocator.task_kind),
    stage_attempt_id: optionalString(stageAttempt.stage_attempt_id),
    action_type: optionalString(taskPayload.action_type)
      ?? optionalString(currentOwnerDelta.action_type)
      ?? optionalString(nestedRecord(taskPayload, 'source_action')?.action_type),
    work_unit_id: optionalString(basis.work_unit_id)
      ?? optionalString(taskPayload.work_unit_id)
      ?? optionalString(workspaceLocator.work_unit_id)
      ?? optionalString(currentOwnerDelta.work_unit_id)
      ?? optionalString(nestedRecord(taskPayload, 'source_action', 'next_work_unit')?.unit_id)
      ?? optionalString(taskPayload.action_type),
    work_unit_fingerprint: optionalString(basis.work_unit_fingerprint)
      ?? optionalString(taskPayload.work_unit_fingerprint)
      ?? optionalString(taskPayload.source_fingerprint)
      ?? optionalString(workspaceLocator.work_unit_fingerprint)
      ?? optionalString(workspaceLocator.domain_source_fingerprint)
      ?? optionalString(currentOwnerDelta.work_unit_fingerprint),
    source_fingerprint: optionalString(taskPayload.source_fingerprint)
      ?? optionalString(workspaceLocator.domain_source_fingerprint)
      ?? optionalString(workspaceLocator.source_fingerprint)
      ?? optionalString(stageAttempt.source_fingerprint)
      ?? optionalString(currentOwnerDelta.source_fingerprint),
    truth_epoch: optionalString(basis.truth_epoch)
      ?? optionalString(providerAdmissionIdentity?.truth_epoch)
      ?? optionalString(taskPayload.truth_epoch)
      ?? optionalString(workspaceLocator.truth_epoch)
      ?? optionalString(taskPayload.source_fingerprint)
      ?? optionalString(workspaceLocator.domain_source_fingerprint),
    runtime_health_epoch: optionalString(basis.runtime_health_epoch)
      ?? optionalString(providerAdmissionIdentity?.runtime_health_epoch)
      ?? optionalString(taskPayload.runtime_health_epoch)
      ?? optionalString(workspaceLocator.runtime_health_epoch),
    source_eval_id: optionalString(basis.source_eval_id)
      ?? optionalString(providerAdmissionIdentity?.source_eval_id)
      ?? optionalString(taskPayload.source_eval_id)
      ?? optionalString(workspaceLocator.source_eval_id),
    idempotency_key: optionalString(taskPayload.attempt_idempotency_key)
      ?? optionalString(taskPayload.idempotency_key)
      ?? optionalString(providerAdmissionIdentity?.attempt_idempotency_key)
      ?? optionalString(providerAdmissionIdentity?.idempotency_key)
      ?? optionalString(stageAttempt.idempotency_key)
      ?? optionalString(taskPayload.source_fingerprint)
      ?? optionalString(workspaceLocator.domain_source_fingerprint),
    route_identity_key: optionalString(taskPayload.route_identity_key)
      ?? optionalString(providerAdmissionIdentity?.route_identity_key),
    attempt_idempotency_key: optionalString(taskPayload.attempt_idempotency_key)
      ?? optionalString(providerAdmissionIdentity?.attempt_idempotency_key)
      ?? optionalString(taskPayload.idempotency_key)
      ?? optionalString(providerAdmissionIdentity?.idempotency_key),
    provider_admission_identity: providerAdmissionIdentity,
    owner_route_currentness_basis: recordValue(taskPayload.owner_route_currentness_basis)
      ?? recordValue(sourceRefs.owner_route_currentness_basis)
      ?? recordValue(currentnessContract.basis)
      ?? null,
    provider_attempt_ref: optionalString(stageAttempt.provider_attempt_ref)
      ?? (
        optionalString(stageAttempt.stage_attempt_id)
          ? `opl://stage-attempts/${optionalString(stageAttempt.stage_attempt_id)}`
          : null
      ),
    active_lease_ref: optionalString(stageAttempt.attempt_lease_ref)
      ?? optionalString(stageAttempt.active_lease_ref),
    execution_authorization_ref: optionalString(stageAttempt.execution_authorization_decision_ref)
      ?? optionalString(stageAttempt.execution_authorization_ref),
    workflow_id: optionalString(stageAttempt.workflow_id),
    task_id: optionalString(stageAttempt.task_id) ?? optionalString(task.task_id),
  };
}

export function missingStageRunCurrentnessIdentityFields(
  identity: StageRunCurrentnessIdentity,
) {
  return [
    'domain_id',
    'study_id_or_quest_id',
    'stage_id',
    'stage_attempt_id',
    'action_type',
    'work_unit_id',
    'work_unit_fingerprint',
    'source_fingerprint',
    'truth_epoch',
    'runtime_health_epoch',
    'source_eval_id',
    'idempotency_key',
  ].filter((key) => !identity[key as keyof StageRunCurrentnessIdentity]);
}

function comparisonFields(identity: StageRunCurrentnessIdentity) {
  return {
    domain_id: identity.domain_id,
    study_id_or_quest_id: identity.study_id_or_quest_id,
    stage_id: identity.stage_id,
    stage_attempt_id: identity.stage_attempt_id,
    action_type: identity.action_type,
    work_unit_id: identity.work_unit_id,
    work_unit_fingerprint: identity.work_unit_fingerprint,
    source_fingerprint: identity.source_fingerprint,
    truth_epoch: identity.truth_epoch,
    runtime_health_epoch: identity.runtime_health_epoch,
    source_eval_id: identity.source_eval_id,
    idempotency_key: identity.idempotency_key,
    route_identity_key: identity.route_identity_key,
    attempt_idempotency_key: identity.attempt_idempotency_key,
    task_id: identity.task_id,
  };
}

function routeComparisonFields(identity: StageRunCurrentnessIdentity) {
  return {
    domain_id: identity.domain_id,
    study_id_or_quest_id: identity.study_id_or_quest_id,
    stage_id: identity.stage_id,
    action_type: identity.action_type,
    work_unit_id: identity.work_unit_id,
    work_unit_fingerprint: identity.work_unit_fingerprint,
    source_fingerprint: identity.source_fingerprint,
    truth_epoch: identity.truth_epoch,
    runtime_health_epoch: identity.runtime_health_epoch,
    source_eval_id: identity.source_eval_id,
    idempotency_key: identity.idempotency_key,
    route_identity_key: identity.route_identity_key,
    attempt_idempotency_key: identity.attempt_idempotency_key,
  };
}

export function sameStageRunCurrentnessIdentity(
  left: StageRunCurrentnessIdentity,
  right: StageRunCurrentnessIdentity,
) {
  if (
    missingStageRunCurrentnessIdentityFields(left).length > 0
    || missingStageRunCurrentnessIdentityFields(right).length > 0
  ) {
    return false;
  }
  return JSON.stringify(comparisonFields(left)) === JSON.stringify(comparisonFields(right));
}

export function sameStageRunRouteCurrentnessIdentity(
  left: StageRunCurrentnessIdentity,
  right: StageRunCurrentnessIdentity,
) {
  const required = [
    'domain_id',
    'study_id_or_quest_id',
    'stage_id',
    'action_type',
    'work_unit_id',
    'work_unit_fingerprint',
    'source_fingerprint',
    'truth_epoch',
    'runtime_health_epoch',
    'source_eval_id',
    'idempotency_key',
  ] as const;
  if (
    required.some((key) => !left[key])
    || required.some((key) => !right[key])
  ) {
    return false;
  }
  return JSON.stringify(routeComparisonFields(left)) === JSON.stringify(routeComparisonFields(right));
}
