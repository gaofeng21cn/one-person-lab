import {
  countValue as numberValue,
  record,
  recordList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';

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
