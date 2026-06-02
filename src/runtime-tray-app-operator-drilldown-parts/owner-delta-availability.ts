import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function workstreamOwnerDeltaAvailable(workstreamOperatingLoop: JsonRecord) {
  const summary = record(workstreamOperatingLoop.summary);
  if (numberValue(summary.goal_oracle_missing_count) > 0) {
    return true;
  }
  return recordList(workstreamOperatingLoop.workstreams).some((workstream) => {
    const action = record(workstream.next_steering_action);
    const actionId = stringValue(action.action_id);
    return Boolean(actionId) && actionId !== 'continue_workstream_observation';
  });
}

export function ownerDeltaAvailable(input: {
  evidenceNextStepsProjection: JsonRecord;
  workstreamOperatingLoop: JsonRecord;
}) {
  return numberValue(input.evidenceNextStepsProjection.total_count) > 0
    || workstreamOwnerDeltaAvailable(input.workstreamOperatingLoop);
}
