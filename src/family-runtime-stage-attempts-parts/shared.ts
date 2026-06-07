import type { StageAttemptRow } from '../family-runtime-stage-attempt-ledger.ts';
import {
  parseStageAttemptJsonList,
} from '../family-runtime-stage-attempt-ledger.ts';

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeStageId(stageId: string) {
  const normalized = stageId.trim();
  if (!normalized) {
    throw new Error('Stage attempt requires a non-empty stage id.');
  }
  return normalized;
}

export function normalizeJsonList(value?: string[]) {
  return Array.isArray(value) ? value.filter((entry) => entry.trim()).map((entry) => entry.trim()) : [];
}

export function normalizeActivityEvent(value: Record<string, unknown>) {
  return {
    event_time: nowIso(),
    ...value,
  };
}

export function appendActivityEventToRow(row: StageAttemptRow, event: Record<string, unknown>) {
  return [
    ...parseStageAttemptJsonList(row.activity_events_json).filter(
      (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry),
    ),
    normalizeActivityEvent(event),
  ];
}
