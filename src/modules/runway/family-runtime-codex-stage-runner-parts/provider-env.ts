import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import { isRecord, type JsonRecord } from './shared.ts';

function readRecordList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function stageIdFromAttempt(attempt: JsonRecord) {
  return optionalString(attempt.stage_id) ?? 'stage';
}

function sourceRefValueForRole(sourceRefs: unknown, role: string) {
  const refs = readRecordList(sourceRefs);
  for (const ref of refs) {
    if (optionalString(ref.role) === role) {
      return optionalString(ref.ref);
    }
  }
  return null;
}

function workUnitIdFromAttempt(attempt: JsonRecord) {
  const workspaceLocator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  const direct = optionalString(attempt.work_unit_id)
    ?? optionalString(workspaceLocator.work_unit_id);
  if (direct) {
    return direct;
  }
  const workUnitFingerprint = sourceRefValueForRole(workspaceLocator.source_refs, 'owner_route_work_unit_fingerprint');
  return workUnitFingerprint?.startsWith('truth-snapshot::') ? workUnitFingerprint : null;
}

export function codexStageAttemptEnv(input: {
  attempt: JsonRecord;
  stagePacketRef?: string | null;
  workspaceRoot: string;
}): Record<string, string | undefined> {
  const workspaceLocator = isRecord(input.attempt.workspace_locator) ? input.attempt.workspace_locator : {};
  const stageAttemptId = optionalString(input.attempt.stage_attempt_id);
  const providerAttemptRef = optionalString(input.attempt.provider_attempt_ref)
    ?? (stageAttemptId ? `temporal://attempt/${encodeURIComponent(stageAttemptId)}` : null);
  const sourceFingerprint = optionalString(input.attempt.source_fingerprint);
  const idempotencyKey = optionalString(input.attempt.idempotency_key);
  const stageRunId = optionalString(workspaceLocator.stage_run_id);
  const stageManifestRef = optionalString(workspaceLocator.stage_manifest_ref);
  return {
    OPL_STAGE_ATTEMPT_ID: optionalString(input.attempt.stage_attempt_id) ?? undefined,
    OPL_STAGE_ID: stageIdFromAttempt(input.attempt),
    OPL_STAGE_PACKET_REF: optionalString(input.stagePacketRef) === 'unavailable'
      ? undefined
      : optionalString(input.stagePacketRef) ?? undefined,
    OPL_WORKSPACE_ROOT: input.workspaceRoot,
    OPL_TASK_ID: optionalString(input.attempt.task_id) ?? undefined,
    OPL_WORKFLOW_ID: optionalString(input.attempt.workflow_id) ?? undefined,
    OPL_DOMAIN_ID:
      optionalString(input.attempt.domain_id) ?? optionalString(workspaceLocator.domain_id) ?? undefined,
    OPL_DOMAIN_TRUTH_OWNER: optionalString(workspaceLocator.domain_truth_owner) ?? undefined,
    OPL_QUEST_ID: optionalString(workspaceLocator.quest_id) ?? undefined,
    OPL_ACTION_TYPE: optionalString(workspaceLocator.action_type) ?? undefined,
    OPL_WORK_UNIT_ID: workUnitIdFromAttempt(input.attempt) ?? undefined,
    OPL_CANDIDATE_REF: optionalString(workspaceLocator.candidate_ref) ?? undefined,
    OPL_DOMAIN_ROUTE_PROFILE_REF: optionalString(workspaceLocator.profile_ref) ?? undefined,
    OPL_DOMAIN_ROUTE_HANDOFF_REF: optionalString(workspaceLocator.domain_route_handoff_ref) ?? undefined,
    OPL_DOMAIN_ROUTE_TRANSACTION_REF:
      optionalString(workspaceLocator.domain_route_transaction_ref) ?? undefined,
    OPL_DOMAIN_ROUTE_COMMAND_REF:
      optionalString(workspaceLocator.domain_route_command_ref) ?? undefined,
    OPL_ROUTE_COMMAND_KIND: optionalString(workspaceLocator.command_kind) ?? undefined,
    OPL_ROUTE_TARGET: optionalString(workspaceLocator.route_target) ?? undefined,
    OPL_DOMAIN_COMMAND_CWD: optionalString(workspaceLocator.command_cwd) ?? undefined,
    OPL_DOMAIN_COMMAND_SOURCE: optionalString(workspaceLocator.command_source) ?? undefined,
    OPL_ROUTE_HANDOFF_SOURCE_REF:
      optionalString(workspaceLocator.domain_route_handoff_ref)
      ?? optionalString(workspaceLocator.source_ref)
      ?? undefined,
    OPL_PROVIDER_ATTEMPT_REF: providerAttemptRef ?? undefined,
    OPL_SOURCE_FINGERPRINT: sourceFingerprint ?? undefined,
    OPL_IDEMPOTENCY_KEY: idempotencyKey ?? undefined,
    OPL_STAGE_RUN_ID: stageRunId ?? undefined,
    OPL_STAGE_MANIFEST_REF: stageManifestRef ?? undefined,
  };
}
