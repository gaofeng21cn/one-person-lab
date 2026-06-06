type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

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

function explicitExecutionAuthorization(attempt: JsonRecord) {
  const candidates = [
    attempt.opl_execution_authorization,
    attempt.execution_authorization,
    attempt.execution_authorization_receipt,
    attempt.stage_run_execution_authorization,
  ];
  for (const candidate of candidates) {
    if (isRecord(candidate)) {
      return candidate;
    }
  }
  return {};
}

function explicitAttemptRef(attempt: JsonRecord, authorization: JsonRecord, key: string) {
  return optionalString(authorization[key]) ?? optionalString(attempt[key]);
}

export function codexStageAttemptEnv(input: {
  attempt: JsonRecord;
  stagePacketRef: string;
  workspaceRoot: string;
}): Record<string, string | undefined> {
  const workspaceLocator = isRecord(input.attempt.workspace_locator) ? input.attempt.workspace_locator : {};
  const authorization = explicitExecutionAuthorization(input.attempt);
  const providerAttemptRef = explicitAttemptRef(input.attempt, authorization, 'provider_attempt_ref');
  const attemptLeaseRef = explicitAttemptRef(input.attempt, authorization, 'attempt_lease_ref');
  const attemptLeaseStatus = explicitAttemptRef(input.attempt, authorization, 'attempt_lease_status');
  const authorizationDecisionRef = explicitAttemptRef(
    input.attempt,
    authorization,
    'execution_authorization_decision_ref',
  );
  const sourceFingerprint = explicitAttemptRef(input.attempt, authorization, 'source_fingerprint');
  const idempotencyKey = explicitAttemptRef(input.attempt, authorization, 'idempotency_key');
  return {
    OPL_STAGE_ATTEMPT_ID: optionalString(input.attempt.stage_attempt_id) ?? undefined,
    OPL_STAGE_ID: stageIdFromAttempt(input.attempt),
    OPL_STAGE_PACKET_REF: input.stagePacketRef,
    OPL_WORKSPACE_ROOT: input.workspaceRoot,
    OPL_TASK_ID: optionalString(input.attempt.task_id) ?? undefined,
    OPL_WORKFLOW_ID: optionalString(input.attempt.workflow_id) ?? undefined,
    OPL_STUDY_ID: optionalString(workspaceLocator.study_id) ?? undefined,
    OPL_QUEST_ID: optionalString(workspaceLocator.quest_id) ?? undefined,
    OPL_ACTION_TYPE: optionalString(workspaceLocator.action_type) ?? undefined,
    OPL_WORK_UNIT_ID: workUnitIdFromAttempt(input.attempt) ?? undefined,
    OPL_PROVIDER_ATTEMPT_REF: providerAttemptRef ?? undefined,
    OPL_ATTEMPT_LEASE_REF: attemptLeaseRef ?? undefined,
    OPL_ATTEMPT_LEASE_STATUS: attemptLeaseStatus ?? undefined,
    OPL_EXECUTION_AUTHORIZATION_DECISION_REF: authorizationDecisionRef ?? undefined,
    OPL_SOURCE_FINGERPRINT: sourceFingerprint ?? undefined,
    OPL_IDEMPOTENCY_KEY: idempotencyKey ?? undefined,
  };
}
