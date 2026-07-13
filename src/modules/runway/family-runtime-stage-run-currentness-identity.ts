import { isRecord } from '../../kernel/contract-validation.ts';
import {
  stringList,
  stringValue as optionalString,
  uniqueStringList,
} from '../../kernel/json-record.ts';

type JsonRecord = Record<string, unknown>;

function recordValue(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function nestedRecord(source: JsonRecord, ...keys: string[]) {
  let current: JsonRecord | null = source;
  for (const key of keys) {
    current = current ? recordValue(current[key]) : null;
  }
  return current;
}

function firstRecord(...values: Array<JsonRecord | null>) {
  return values.find((value): value is JsonRecord => Boolean(value)) ?? {};
}

function uniqueSortedStrings(values: Array<string | null | undefined>) {
  return uniqueStringList(values).sort();
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
  recovery_obligation_id: string | null;
  dispatch_ref: string | null;
  stage_packet_ref: string | null;
  stage_packet_refs: string[];
  provider_attempt_identity: JsonRecord | null;
  owner_route_currentness_basis: JsonRecord | null;
  provider_attempt_ref: string | null;
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
  const providerAttemptIdentity = recordValue(taskPayload.provider_attempt_identity)
    ?? recordValue(stageAttempt.provider_attempt_identity);
  const stageRunRequest = recordValue(taskPayload.stage_run_request) ?? {};
  const paperMissionRouteIdentity = firstRecord(
    recordValue(taskPayload.opl_runtime_carrier),
    nestedRecord(taskPayload, 'opl_route_handoff_record', 'opl_runtime_carrier'),
    recordValue(taskPayload.opl_route_handoff_record),
    stageRunRequest,
  );
  const ownerRoute = recordValue(taskPayload.owner_route) ?? {};
  const sourceRefs = recordValue(ownerRoute.source_refs) ?? {};
  const currentnessContract = recordValue(ownerRoute.currentness_contract) ?? {};
  const workspaceLocator = recordValue(stageAttempt.workspace_locator)
    ?? recordValue(taskPayload.workspace_locator)
    ?? {};
  const basis = recordValue(sourceRefs.owner_route_currentness_basis)
    ?? recordValue(currentnessContract.basis)
    ?? recordValue(taskPayload.owner_route_currentness_basis)
    ?? recordValue(workspaceLocator.owner_route_currentness_basis)
    ?? {};
  const dispatchRef = optionalString(taskPayload.dispatch_ref)
    ?? optionalString(workspaceLocator.dispatch_ref)
    ?? optionalString(providerAttemptIdentity?.dispatch_ref)
    ?? optionalString(taskPayload.dispatch_packet_ref)
    ?? optionalString(workspaceLocator.dispatch_packet_ref)
    ?? optionalString(taskPayload.dispatch_request_ref)
    ?? optionalString(workspaceLocator.dispatch_request_ref);
  const stagePacketRef = optionalString(taskPayload.stage_packet_ref)
    ?? optionalString(workspaceLocator.stage_packet_ref)
    ?? optionalString(providerAttemptIdentity?.stage_packet_ref);
  const stagePacketRefs = uniqueSortedStrings([
    stagePacketRef,
    ...stringList(taskPayload.stage_packet_refs),
    ...stringList(taskPayload.checkpoint_refs),
    ...stringList(workspaceLocator.stage_packet_refs),
    ...stringList(workspaceLocator.checkpoint_refs),
  ]);
  return {
    surface_kind: 'opl_stage_run_currentness_identity',
    schema_version: 1,
    domain_id: optionalString(stageAttempt.domain_id) ?? optionalString(task.domain_id),
    study_id_or_quest_id: optionalString(taskPayload.study_id)
      ?? optionalString(taskPayload.quest_id),
    stage_id: optionalString(stageAttempt.stage_id)
      ?? optionalString(taskPayload.stage_id)
      ?? optionalString(workspaceLocator.task_kind)
      ?? optionalString(task?.task_kind),
    stage_attempt_id: optionalString(stageAttempt.stage_attempt_id),
    action_type: optionalString(taskPayload.action_type)
      ?? optionalString(paperMissionRouteIdentity.action_type)
      ?? optionalString(nestedRecord(taskPayload, 'source_action')?.action_type),
    work_unit_id: optionalString(basis.work_unit_id)
      ?? optionalString(taskPayload.work_unit_id)
      ?? optionalString(paperMissionRouteIdentity.work_unit_id)
      ?? optionalString(workspaceLocator.work_unit_id)
      ?? optionalString(nestedRecord(taskPayload, 'source_action', 'next_work_unit')?.unit_id)
      ?? optionalString(taskPayload.action_type),
    work_unit_fingerprint: optionalString(basis.work_unit_fingerprint)
      ?? optionalString(taskPayload.work_unit_fingerprint)
      ?? optionalString(paperMissionRouteIdentity.work_unit_fingerprint)
      ?? optionalString(taskPayload.source_fingerprint)
      ?? optionalString(workspaceLocator.work_unit_fingerprint)
      ?? optionalString(workspaceLocator.domain_source_fingerprint),
    source_fingerprint: optionalString(taskPayload.source_fingerprint)
      ?? optionalString(paperMissionRouteIdentity.work_unit_fingerprint)
      ?? optionalString(workspaceLocator.domain_source_fingerprint)
      ?? optionalString(workspaceLocator.source_fingerprint)
      ?? optionalString(stageAttempt.source_fingerprint),
    truth_epoch: optionalString(basis.truth_epoch)
      ?? optionalString(providerAttemptIdentity?.truth_epoch)
      ?? optionalString(taskPayload.truth_epoch)
      ?? optionalString(workspaceLocator.truth_epoch)
      ?? optionalString(taskPayload.source_fingerprint)
      ?? optionalString(workspaceLocator.domain_source_fingerprint),
    runtime_health_epoch: optionalString(basis.runtime_health_epoch)
      ?? optionalString(providerAttemptIdentity?.runtime_health_epoch)
      ?? optionalString(taskPayload.runtime_health_epoch)
      ?? optionalString(workspaceLocator.runtime_health_epoch),
    source_eval_id: optionalString(basis.source_eval_id)
      ?? optionalString(providerAttemptIdentity?.source_eval_id)
      ?? optionalString(taskPayload.source_eval_id)
      ?? optionalString(workspaceLocator.source_eval_id),
    idempotency_key: optionalString(taskPayload.next_action_id)
      ?? optionalString(paperMissionRouteIdentity.next_action_id)
      ?? optionalString(providerAttemptIdentity?.next_action_id)
      ?? optionalString(taskPayload.request_idempotency_key)
      ?? optionalString(paperMissionRouteIdentity.request_idempotency_key)
      ?? optionalString(providerAttemptIdentity?.request_idempotency_key)
      ?? optionalString(taskPayload.idempotency_key)
      ?? optionalString(paperMissionRouteIdentity.idempotency_key)
      ?? optionalString(providerAttemptIdentity?.idempotency_key),
    route_identity_key: optionalString(taskPayload.route_identity_key)
      ?? optionalString(paperMissionRouteIdentity.route_identity_key)
      ?? optionalString(providerAttemptIdentity?.route_identity_key),
    attempt_idempotency_key: optionalString(taskPayload.attempt_idempotency_key)
      ?? optionalString(paperMissionRouteIdentity.attempt_idempotency_key)
      ?? optionalString(providerAttemptIdentity?.attempt_idempotency_key),
    recovery_obligation_id: optionalString(taskPayload.recovery_obligation_id)
      ?? optionalString(providerAttemptIdentity?.recovery_obligation_id)
      ?? optionalString(providerAttemptIdentity?.paper_recovery_obligation_id)
      ?? optionalString(workspaceLocator.recovery_obligation_id),
    dispatch_ref: dispatchRef,
    stage_packet_ref: stagePacketRef,
    stage_packet_refs: stagePacketRefs,
    provider_attempt_identity: providerAttemptIdentity,
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
    workflow_id: optionalString(stageAttempt.workflow_id),
    task_id: optionalString(stageAttempt.task_id) ?? optionalString(task.task_id),
  };
}

export function missingStageRunCurrentnessIdentityFields(
  identity: StageRunCurrentnessIdentity,
) {
  const missing = [
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
    'route_identity_key',
    'attempt_idempotency_key',
    'dispatch_ref',
    'stage_packet_ref',
  ].filter((key) => !identity[key as keyof StageRunCurrentnessIdentity]);
  if (identity.stage_packet_refs.length === 0) {
    missing.push('stage_packet_refs');
  }
  return missing;
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
    recovery_obligation_id: identity.recovery_obligation_id,
    dispatch_ref: identity.dispatch_ref,
    stage_packet_ref: identity.stage_packet_ref,
    stage_packet_refs: identity.stage_packet_refs,
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
    recovery_obligation_id: identity.recovery_obligation_id,
    dispatch_ref: identity.dispatch_ref,
    stage_packet_ref: identity.stage_packet_ref,
    stage_packet_refs: identity.stage_packet_refs,
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
  if (
    missingStageRunCurrentnessIdentityFields(left).length > 0
    || missingStageRunCurrentnessIdentityFields(right).length > 0
  ) {
    return false;
  }
  return JSON.stringify(routeComparisonFields(left)) === JSON.stringify(routeComparisonFields(right));
}
