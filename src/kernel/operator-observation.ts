import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { isRecord } from './contract-validation.ts';
import { parseJsonText, readJsonPayloadFile, writeJsonPayloadFile } from './json-file.ts';
import { countValue, stringValue, type JsonRecord } from './json-record.ts';

export type ObservationStartInput = { minimumDurationMinutes: number; evidenceDir: string };
export type ObservationFinishInput = { workorderFile: string; finishedAt?: string | null };
export type ObservationEventInput = {
  workorderFile: string;
  eventKind: string;
  observedAt?: string | null;
  evidenceRef?: string | null;
};

export function readObservationWorkorder(filePath: string, label: string) {
  const workorder = readJsonPayloadFile(filePath);
  if (!isRecord(workorder)) throw new Error(`${label} workorder must be a JSON object.`);
  return workorder;
}

function timestamp(value: string, label: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`${label} must be an ISO timestamp.`);
  return parsed;
}

function observationPaths(evidenceDir: string, prefix: string) {
  return {
    workorder_file: path.join(evidenceDir, `${prefix}-workorder.json`),
    operator_log_file: path.join(evidenceDir, 'operator-observation-events.jsonl'),
    manifest_file: path.join(evidenceDir, `${prefix}-manifest.json`),
    record_payload_file: path.join(evidenceDir, `${prefix}-record-payload.json`),
  };
}

function operatorLogFile(workorder: JsonRecord, workorderFile: string) {
  return stringValue(workorder.operator_log_file)
    ?? path.join(path.dirname(workorderFile), 'operator-observation-events.jsonl');
}

function observationEvents(filePath: string, requiredKinds: readonly string[]) {
  const kinds = new Set<string>();
  const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').split('\n') : [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const event = parseJsonText(line);
      const kind = isRecord(event) ? stringValue(event.event_kind) : null;
      if (kind) kinds.add(kind);
    } catch {
      // An incomplete log line is not an observed event.
    }
  }
  const observed = [...kinds].sort();
  const missing = requiredKinds.filter((kind) => !kinds.has(kind));
  return {
    observed_event_kinds: observed,
    missing_event_kinds: missing,
    required_event_kinds_observed: missing.length === 0,
  };
}

export function startOperatorObservation(
  input: ObservationStartInput,
  prefix: string,
  requiredKinds: readonly string[],
  workorderFields: JsonRecord,
) {
  const startedAt = new Date().toISOString();
  const paths = observationPaths(input.evidenceDir, prefix);
  const window = {
    started_at: startedAt,
    minimum_duration_minutes: input.minimumDurationMinutes,
    earliest_finish_at: new Date(Date.parse(startedAt) + input.minimumDurationMinutes * 60000).toISOString(),
  };
  fs.mkdirSync(input.evidenceDir, { recursive: true });
  writeJsonPayloadFile(paths.workorder_file, {
    ...workorderFields,
    status: 'started',
    ...window,
    required_event_kinds: [...requiredKinds],
    operator_log_file: paths.operator_log_file,
    manifest_file: paths.manifest_file,
    record_payload_file: paths.record_payload_file,
  });
  fs.writeFileSync(paths.operator_log_file, '');
  return { ...window, ...paths, required_event_kinds: [...requiredKinds] };
}

export function recordOperatorObservationEvent(
  input: ObservationEventInput,
  workorder: JsonRecord,
  requiredKinds: readonly string[],
  eventFields: JsonRecord,
) {
  if (!requiredKinds.includes(input.eventKind)) {
    throw new Error(`event_kind must be one of: ${requiredKinds.join(', ')}.`);
  }
  const observedAt = input.observedAt ?? new Date().toISOString();
  timestamp(observedAt, 'observed_at');
  const logFile = operatorLogFile(workorder, input.workorderFile);
  const event = {
    ...eventFields,
    event_kind: input.eventKind,
    observed_at: observedAt,
    evidence_ref: input.evidenceRef ?? null,
  };
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, `${JSON.stringify(event)}\n`);
  return { operator_log_file: logFile, event, ...observationEvents(logFile, requiredKinds) };
}

export function inspectOperatorObservation(
  input: ObservationFinishInput,
  workorder: JsonRecord,
  requiredKinds: readonly string[],
) {
  const startedAt = stringValue(workorder.started_at) ?? new Date().toISOString();
  const finishedAt = input.finishedAt ?? new Date().toISOString();
  const elapsed = Math.floor((timestamp(finishedAt, 'finished_at') - timestamp(startedAt, 'started_at')) / 60000);
  const minimumDuration = countValue(workorder.minimum_duration_minutes);
  const logFile = operatorLogFile(workorder, input.workorderFile);
  return {
    operatorLogFile: logFile,
    durationSatisfied: elapsed >= minimumDuration,
    fields: {
      started_at: startedAt,
      finished_at: finishedAt,
      elapsed_minutes: elapsed,
      minimum_duration_minutes: minimumDuration,
      ...observationEvents(logFile, requiredKinds),
    },
  };
}

export function writeOperatorObservationManifest(
  input: ObservationFinishInput,
  workorder: JsonRecord,
  prefix: string,
  observation: ReturnType<typeof inspectOperatorObservation>,
  manifestFields: JsonRecord,
) {
  const defaults = observationPaths(path.dirname(input.workorderFile), prefix);
  const manifestFile = stringValue(workorder.manifest_file) ?? defaults.manifest_file;
  const recordPayloadFile = stringValue(workorder.record_payload_file) ?? defaults.record_payload_file;
  const operatorLogSha256 = crypto.createHash('sha256')
    .update(fs.readFileSync(observation.operatorLogFile)).digest('hex');
  const { required_event_kinds_observed: _ready, missing_event_kinds: _missing, ...window } = observation.fields;
  writeJsonPayloadFile(manifestFile, {
    ...manifestFields,
    ...window,
    operator_log_file: observation.operatorLogFile,
    operator_log_sha256: operatorLogSha256,
  });
  return {
    operator_log_sha256: operatorLogSha256,
    manifest_file: manifestFile,
    manifest_sha256: crypto.createHash('sha256').update(fs.readFileSync(manifestFile)).digest('hex'),
    record_payload_file: recordPayloadFile,
  };
}

export function operatorObservationRef(prefix: string, filePath: string, sha256: string) {
  return `${prefix}/${sha256.slice(0, 16)}?path=${encodeURIComponent(filePath)}&sha256=${sha256}`;
}
