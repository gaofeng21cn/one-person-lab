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

export function codexStageAttemptEnv(input: {
  attempt: JsonRecord;
  stagePacketRef: string;
  workspaceRoot: string;
}): Record<string, string | undefined> {
  const workspaceLocator = isRecord(input.attempt.workspace_locator) ? input.attempt.workspace_locator : {};
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
  };
}
