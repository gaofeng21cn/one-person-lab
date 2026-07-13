import type { JsonRecord } from '../../kernel/json-record.ts';

// StageRun is a passive transport/readback surface. It must never rewrite an
// owner delta or close an owner action based on framework receipt formatting.
export function currentOwnerDeltaWithClosedStageRunAnswer<T extends JsonRecord>(
  currentOwnerDelta: T,
  _stageRunCockpit: JsonRecord,
): T {
  return currentOwnerDelta;
}

export function readModelWithClosedStageRunAnswer<T extends JsonRecord>(
  readModel: T,
  _currentOwnerDelta: JsonRecord,
  _stageRunCockpit: JsonRecord,
): T {
  return readModel;
}
