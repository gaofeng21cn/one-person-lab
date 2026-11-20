import crypto from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import type { StageAttemptRow } from '../family-runtime-stage-attempt-ledger.ts';
import {
  parseStageAttemptJsonList,
} from '../family-runtime-stage-attempt-ledger.ts';

export const MAX_STAGE_ATTEMPT_ACTIVITY_EVENTS = 256;
export const MAX_STAGE_ATTEMPT_ACTIVITY_EVENT_BYTES = 16 * 1024;
export const MAX_STAGE_ATTEMPT_PERSISTED_JSON_BYTES = 64 * 1024;
export const MAX_STAGE_ATTEMPT_CLOSEOUT_UNCOMPRESSED_JSON_BYTES = 1024 * 1024;
export const STAGE_ATTEMPT_CLOSEOUT_COMPRESSED_JSON_SURFACE = 'opl_stage_attempt_closeout_compressed_json';
export const STAGE_ATTEMPT_CLOSEOUT_COMPRESSED_JSON_VERSION = 'stage-attempt-closeout-compressed-json.v1';
const ACTIVITY_COMPACTION_EVENT_KIND = 'stage_attempt_activity_history_compacted';
const ACTIVITY_TRUNCATION_EVENT_KIND = 'stage_attempt_activity_event_truncated';

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

function normalizeActivityEvent(value: Record<string, unknown>) {
  return {
    event_time: nowIso(),
    ...value,
  };
}

function isActivityEvent(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringifyBoundedStageAttemptJson(
  value: unknown,
  field: string,
  maxBytes = MAX_STAGE_ATTEMPT_PERSISTED_JSON_BYTES,
) {
  const serialized = JSON.stringify(value);
  const bytes = Buffer.byteLength(serialized);
  if (bytes > maxBytes) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `${field} exceeds the persisted StageAttempt JSON byte limit.`,
      {
        failure_code: 'stage_attempt_persisted_json_too_large',
        field,
        max_json_bytes: maxBytes,
        actual_json_bytes: bytes,
        sha256: crypto.createHash('sha256').update(serialized).digest('hex'),
      },
    );
  }
  return serialized;
}

function closeoutCompressionError(message: string, details: Record<string, unknown>): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    failure_code: 'stage_attempt_closeout_compression_invalid',
    ...details,
  });
}

function uncompressedCloseoutDigest(serialized: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(serialized).digest('hex')}`;
}

export function stringifyStageAttemptCloseoutJson(value: unknown) {
  const serialized = JSON.stringify(value);
  const uncompressedBytes = Buffer.byteLength(serialized);
  if (uncompressedBytes > MAX_STAGE_ATTEMPT_CLOSEOUT_UNCOMPRESSED_JSON_BYTES) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'stage_attempt_closeout.packet_json exceeds the uncompressed closeout JSON byte limit.',
      {
        failure_code: 'stage_attempt_persisted_json_too_large',
        field: 'stage_attempt_closeout.packet_json',
        max_json_bytes: MAX_STAGE_ATTEMPT_CLOSEOUT_UNCOMPRESSED_JSON_BYTES,
        actual_json_bytes: uncompressedBytes,
        sha256: uncompressedCloseoutDigest(serialized),
      },
    );
  }
  if (uncompressedBytes <= MAX_STAGE_ATTEMPT_PERSISTED_JSON_BYTES) return serialized;

  const compressed = gzipSync(serialized, { level: 9 });
  const envelope = {
    surface_kind: STAGE_ATTEMPT_CLOSEOUT_COMPRESSED_JSON_SURFACE,
    version: STAGE_ATTEMPT_CLOSEOUT_COMPRESSED_JSON_VERSION,
    compression: 'gzip',
    encoding: 'base64',
    compressed_sha256: `sha256:${crypto.createHash('sha256').update(compressed).digest('hex')}`,
    uncompressed_sha256: uncompressedCloseoutDigest(serialized),
    uncompressed_bytes: uncompressedBytes,
    payload: compressed.toString('base64'),
  };
  const persisted = JSON.stringify(envelope);
  const persistedBytes = Buffer.byteLength(persisted);
  if (persistedBytes > MAX_STAGE_ATTEMPT_PERSISTED_JSON_BYTES) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'stage_attempt_closeout.packet_json exceeds the persisted StageAttempt JSON byte limit after compression.',
      {
        failure_code: 'stage_attempt_persisted_json_too_large',
        field: 'stage_attempt_closeout.packet_json',
        max_json_bytes: MAX_STAGE_ATTEMPT_PERSISTED_JSON_BYTES,
        actual_json_bytes: persistedBytes,
        uncompressed_json_bytes: uncompressedBytes,
        sha256: uncompressedCloseoutDigest(serialized),
      },
    );
  }
  return persisted;
}

export function parseStageAttemptCloseoutJson(value: string): unknown {
  const parsed = parseJsonText(value);
  if (!isRecord(parsed) || parsed.surface_kind !== STAGE_ATTEMPT_CLOSEOUT_COMPRESSED_JSON_SURFACE) {
    return parsed;
  }
  const expectedKeys = [
    'compressed_sha256', 'compression', 'encoding', 'payload', 'surface_kind', 'uncompressed_bytes',
    'uncompressed_sha256', 'version',
  ];
  const actualKeys = Object.keys(parsed).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    closeoutCompressionError('Compressed StageAttempt closeout envelope has an invalid field set.', {
      field: 'stage_attempt_closeout.packet_json',
      actual_keys: actualKeys,
    });
  }
  if (
    parsed.version !== STAGE_ATTEMPT_CLOSEOUT_COMPRESSED_JSON_VERSION
    || parsed.compression !== 'gzip'
    || parsed.encoding !== 'base64'
    || typeof parsed.compressed_sha256 !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(parsed.compressed_sha256)
    || typeof parsed.uncompressed_sha256 !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(parsed.uncompressed_sha256)
    || !Number.isSafeInteger(parsed.uncompressed_bytes)
    || (parsed.uncompressed_bytes as number) <= MAX_STAGE_ATTEMPT_PERSISTED_JSON_BYTES
    || (parsed.uncompressed_bytes as number) > MAX_STAGE_ATTEMPT_CLOSEOUT_UNCOMPRESSED_JSON_BYTES
    || typeof parsed.payload !== 'string'
    || !parsed.payload
  ) {
    closeoutCompressionError('Compressed StageAttempt closeout envelope is invalid.', {
      field: 'stage_attempt_closeout.packet_json',
    });
  }
  const uncompressedBytes = parsed.uncompressed_bytes as number;
  const compressed = Buffer.from(parsed.payload, 'base64');
  if (compressed.toString('base64') !== parsed.payload) {
    closeoutCompressionError('Compressed StageAttempt closeout payload is not canonical base64.', {
      field: 'stage_attempt_closeout.packet_json',
    });
  }
  if (`sha256:${crypto.createHash('sha256').update(compressed).digest('hex')}` !== parsed.compressed_sha256) {
    closeoutCompressionError('Compressed StageAttempt closeout payload digest does not match its compressed declaration.', {
      field: 'stage_attempt_closeout.packet_json',
    });
  }
  let uncompressed: Buffer;
  try {
    uncompressed = gunzipSync(compressed, { maxOutputLength: uncompressedBytes });
  } catch (error) {
    closeoutCompressionError('Compressed StageAttempt closeout payload cannot be decompressed within its declared bound.', {
      field: 'stage_attempt_closeout.packet_json',
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (uncompressed.length !== uncompressedBytes) {
    closeoutCompressionError('Compressed StageAttempt closeout payload length does not match its declaration.', {
      field: 'stage_attempt_closeout.packet_json',
      declared_uncompressed_bytes: uncompressedBytes,
      actual_uncompressed_bytes: uncompressed.length,
    });
  }
  if (uncompressedCloseoutDigest(uncompressed) !== parsed.uncompressed_sha256) {
    closeoutCompressionError('Compressed StageAttempt closeout payload digest does not match its declaration.', {
      field: 'stage_attempt_closeout.packet_json',
    });
  }
  return parseJsonText(uncompressed.toString('utf8'));
}

function boundedActivityEvent(event: Record<string, unknown>) {
  const serialized = JSON.stringify(event);
  const bytes = Buffer.byteLength(serialized);
  if (bytes <= MAX_STAGE_ATTEMPT_ACTIVITY_EVENT_BYTES) {
    return event;
  }
  const eventTime = typeof event.event_time === 'string' ? event.event_time : nowIso();
  const originalEventKind = typeof event.event_kind === 'string'
    ? event.event_kind
    : typeof event.activity_kind === 'string'
      ? event.activity_kind
      : null;
  return {
    event_kind: ACTIVITY_TRUNCATION_EVENT_KIND,
    event_time: eventTime,
    original_event_kind: originalEventKind,
    original_json_bytes: bytes,
    sha256: crypto.createHash('sha256').update(serialized).digest('hex'),
    retention_policy: {
      strategy: 'hash_and_size_only',
      max_event_json_bytes: MAX_STAGE_ATTEMPT_ACTIVITY_EVENT_BYTES,
    },
  };
}

function compactedEventCount(event: Record<string, unknown>) {
  if (event.event_kind !== ACTIVITY_COMPACTION_EVENT_KIND) {
    return 0;
  }
  const count = event.compacted_event_count;
  return typeof count === 'number' && Number.isSafeInteger(count) && count > 0 ? count : 0;
}

export function compactStageAttemptActivityEvents(
  values: unknown[],
  compactedAt = nowIso(),
) {
  const activityEvents = values.filter(isActivityEvent).map(boundedActivityEvent);
  const previouslyCompactedCount = activityEvents.reduce(
    (total, event) => total + compactedEventCount(event),
    0,
  );
  const retainedCandidates = activityEvents.filter(
    (event) => event.event_kind !== ACTIVITY_COMPACTION_EVENT_KIND,
  );
  if (
    previouslyCompactedCount === 0
    && retainedCandidates.length <= MAX_STAGE_ATTEMPT_ACTIVITY_EVENTS
  ) {
    return retainedCandidates;
  }
  const retainedEventLimit = MAX_STAGE_ATTEMPT_ACTIVITY_EVENTS - 1;
  const newlyCompactedCount = Math.max(0, retainedCandidates.length - retainedEventLimit);
  const retainedEvents = retainedCandidates.slice(-retainedEventLimit);
  return [{
    event_kind: ACTIVITY_COMPACTION_EVENT_KIND,
    event_time: compactedAt,
    compacted_event_count: previouslyCompactedCount + newlyCompactedCount,
    retained_event_count: retainedEvents.length,
    retention_policy: {
      strategy: 'latest_tail',
      max_events: MAX_STAGE_ATTEMPT_ACTIVITY_EVENTS,
    },
  }, ...retainedEvents];
}

export function appendActivityEventToRow(row: StageAttemptRow, event: Record<string, unknown>) {
  return compactStageAttemptActivityEvents([
    ...parseStageAttemptJsonList(row.activity_events_json).filter(
      isActivityEvent,
    ),
    normalizeActivityEvent(event),
  ], typeof event.event_time === 'string' ? event.event_time : undefined);
}
