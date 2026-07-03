import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText, readJsonPayloadFile } from '../../kernel/json-file.ts';
import { countValue, stringValue } from '../../kernel/json-record.ts';

type StartInput = {
  minimumDurationMinutes: number;
  evidenceDir: string;
};

type FinishInput = {
  workorderFile: string;
  finishedAt?: string | null;
};

type EventInput = {
  workorderFile: string;
  eventKind: string;
  observedAt?: string | null;
  evidenceRef?: string | null;
};

const REQUIRED_EVENT_KINDS = [
  'managed_install_update_state_checked',
  'app_live_path_reexercised_or_confirmed_live',
  'owner_receipt_or_typed_blocker_scaleout_checked',
  'operator_continuity_window_observed',
] as const;

function nowIso() {
  return new Date().toISOString();
}

function authorityBoundary() {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_domain_memory_body: false,
    can_read_domain_memory_body: false,
    can_read_domain_artifact_body: false,
    can_mutate_domain_artifact_body: false,
    can_create_domain_owner_receipt: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    can_authorize_quality_or_export: false,
    can_promote_default_agent_without_gate: false,
  };
}

function parseIso(value: string, label: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
  return timestamp;
}

function readJson(filePath: string) {
  const parsed = readJsonPayloadFile(filePath);
  if (!isRecord(parsed)) {
    throw new Error('OMA long-soak observation workorder must be a JSON object.');
  }
  return parsed;
}

function readOperatorEvents(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        const parsed = parseJsonText(line);
        return isRecord(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256File(filePath: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertRequiredEventKind(eventKind: string) {
  if (!REQUIRED_EVENT_KINDS.includes(eventKind as (typeof REQUIRED_EVENT_KINDS)[number])) {
    throw new Error(
      `event_kind must be one of: ${REQUIRED_EVENT_KINDS.join(', ')}.`,
    );
  }
}

function listObservedEventKinds(events: Record<string, unknown>[]) {
  return [...new Set(events.map((event) => stringValue(event.event_kind)).filter(
    (eventKind): eventKind is string => Boolean(eventKind),
  ))].sort();
}

function listMissingEventKinds(observedKinds: string[]) {
  return REQUIRED_EVENT_KINDS.filter((eventKind) => !observedKinds.includes(eventKind));
}

export function startOmaLongSoakObservation(input: StartInput) {
  const startedAt = nowIso();
  const earliestFinishAt = new Date(
    Date.parse(startedAt) + input.minimumDurationMinutes * 60 * 1000,
  ).toISOString();
  fs.mkdirSync(input.evidenceDir, { recursive: true });
  const workorderFile = path.join(input.evidenceDir, 'oma-long-soak-workorder.json');
  const operatorLogFile = path.join(input.evidenceDir, 'operator-observation-events.jsonl');
  const manifestFile = path.join(input.evidenceDir, 'oma-long-soak-manifest.json');
  const recordPayloadFile = path.join(input.evidenceDir, 'oma-long-soak-record-payload.json');
  const workorder = {
    surface_kind: 'opl_oma_long_soak_observation_workorder',
    status: 'started',
    target_agent: 'opl-meta-agent',
    target_repo: 'opl-meta-agent',
    started_at: startedAt,
    minimum_duration_minutes: input.minimumDurationMinutes,
    earliest_finish_at: earliestFinishAt,
    required_event_kinds: [...REQUIRED_EVENT_KINDS],
    operator_log_file: operatorLogFile,
    manifest_file: manifestFile,
    record_payload_file: recordPayloadFile,
    authority_boundary: authorityBoundary(),
  };
  writeJson(workorderFile, workorder);
  fs.writeFileSync(operatorLogFile, '');
  return {
    surface_kind: 'opl_oma_long_soak_observation_start',
    status: 'started',
    target_agent: 'opl-meta-agent',
    target_repo: 'opl-meta-agent',
    started_at: startedAt,
    minimum_duration_minutes: input.minimumDurationMinutes,
    earliest_finish_at: earliestFinishAt,
    workorder_file: workorderFile,
    operator_log_file: operatorLogFile,
    manifest_file: manifestFile,
    record_payload_file: null,
    long_soak_refs: [],
    required_event_kinds: [...REQUIRED_EVENT_KINDS],
    authority_boundary: authorityBoundary(),
  };
}

export function recordOmaLongSoakObservationEvent(input: EventInput) {
  const workorder = readJson(input.workorderFile);
  assertRequiredEventKind(input.eventKind);
  const observedAt = input.observedAt ?? nowIso();
  parseIso(observedAt, 'observed_at');
  const operatorLogFile = stringValue(workorder.operator_log_file)
    ?? path.join(path.dirname(input.workorderFile), 'operator-observation-events.jsonl');
  fs.mkdirSync(path.dirname(operatorLogFile), { recursive: true });
  const event = {
    surface_kind: 'opl_oma_long_soak_observation_event',
    target_agent: stringValue(workorder.target_agent) ?? 'opl-meta-agent',
    target_repo: stringValue(workorder.target_repo) ?? 'opl-meta-agent',
    event_kind: input.eventKind,
    observed_at: observedAt,
    evidence_ref: input.evidenceRef ?? null,
    authority_boundary: authorityBoundary(),
  };
  fs.appendFileSync(operatorLogFile, `${JSON.stringify(event)}\n`);
  const events = readOperatorEvents(operatorLogFile);
  const observedEventKinds = listObservedEventKinds(events);
  const missingEventKinds = listMissingEventKinds(observedEventKinds);
  return {
    surface_kind: 'opl_oma_long_soak_observation_event_record',
    status: 'recorded',
    target_agent: stringValue(workorder.target_agent) ?? 'opl-meta-agent',
    target_repo: stringValue(workorder.target_repo) ?? 'opl-meta-agent',
    operator_log_file: operatorLogFile,
    event,
    observed_event_kinds: observedEventKinds,
    missing_event_kinds: missingEventKinds,
    required_event_kinds_observed: missingEventKinds.length === 0,
    long_soak_refs: [],
    record_payload_file: null,
    authority_boundary: authorityBoundary(),
  };
}

export function finishOmaLongSoakObservation(input: FinishInput) {
  const workorder = readJson(input.workorderFile);
  const startedAt = stringValue(workorder.started_at) ?? nowIso();
  const finishedAt = input.finishedAt ?? nowIso();
  const startedMs = parseIso(startedAt, 'started_at');
  const finishedMs = parseIso(finishedAt, 'finished_at');
  const minimumDurationMinutes = countValue(workorder.minimum_duration_minutes);
  const elapsedMinutes = Math.floor((finishedMs - startedMs) / 60000);
  const operatorLogFile = stringValue(workorder.operator_log_file)
    ?? path.join(path.dirname(input.workorderFile), 'operator-observation-events.jsonl');
  const events = readOperatorEvents(operatorLogFile);
  const observedEventKinds = listObservedEventKinds(events);
  const missingEventKinds = listMissingEventKinds(observedEventKinds);
  const durationSatisfied = elapsedMinutes >= minimumDurationMinutes;
  const requiredEventKindsObserved = missingEventKinds.length === 0;

  if (!durationSatisfied || !requiredEventKindsObserved) {
    const blockerId = !durationSatisfied
      ? 'oma_long_soak_minimum_duration_not_satisfied'
      : 'oma_long_soak_required_events_missing';
    return {
      surface_kind: 'opl_oma_long_soak_observation_finish',
      status: 'blocked',
      target_agent: 'opl-meta-agent',
      target_repo: 'opl-meta-agent',
      started_at: startedAt,
      finished_at: finishedAt,
      elapsed_minutes: elapsedMinutes,
      minimum_duration_minutes: minimumDurationMinutes,
      required_event_kinds_observed: requiredEventKindsObserved,
      observed_event_kinds: observedEventKinds,
      missing_event_kinds: missingEventKinds,
      long_soak_refs: [],
      record_payload_file: null,
      blocker: {
        blocker_id: blockerId,
        reason: !durationSatisfied
          ? 'finished_at_is_before_minimum_oma_long_soak_window'
          : 'operator_log_is_missing_required_event_kinds',
      },
      authority_boundary: authorityBoundary(),
    };
  }

  const manifestFile = stringValue(workorder.manifest_file)
    ?? path.join(path.dirname(input.workorderFile), 'oma-long-soak-manifest.json');
  const recordPayloadFile = stringValue(workorder.record_payload_file)
    ?? path.join(path.dirname(input.workorderFile), 'oma-long-soak-record-payload.json');
  const operatorLogSha256 = sha256File(operatorLogFile);
  const manifest = {
    surface_kind: 'opl_oma_long_soak_observation_manifest',
    target_agent: 'opl-meta-agent',
    target_repo: 'opl-meta-agent',
    started_at: startedAt,
    finished_at: finishedAt,
    elapsed_minutes: elapsedMinutes,
    minimum_duration_minutes: minimumDurationMinutes,
    operator_log_file: operatorLogFile,
    operator_log_sha256: operatorLogSha256,
    observed_event_kinds: observedEventKinds,
    authority_boundary: authorityBoundary(),
  };
  writeJson(manifestFile, manifest);
  const manifestSha256 = sha256File(manifestFile);
  const evidenceRef =
    `long_soak_ref://opl-meta-agent/production-consumption/operator-window/${manifestSha256.slice(0, 16)}`
    + `?path=${encodeURIComponent(manifestFile)}&sha256=${manifestSha256}`;
  writeJson(recordPayloadFile, {
    long_soak_refs: [evidenceRef],
  });
  return {
    surface_kind: 'opl_oma_long_soak_observation_finish',
    status: 'evidence_ready',
    target_agent: 'opl-meta-agent',
    target_repo: 'opl-meta-agent',
    started_at: startedAt,
    finished_at: finishedAt,
    elapsed_minutes: elapsedMinutes,
    minimum_duration_minutes: minimumDurationMinutes,
    required_event_kinds_observed: true,
    observed_event_kinds: observedEventKinds,
    missing_event_kinds: [],
    long_soak_refs: [evidenceRef],
    operator_log_sha256: operatorLogSha256,
    manifest_file: manifestFile,
    manifest_sha256: manifestSha256,
    record_payload_file: recordPayloadFile,
    authority_boundary: authorityBoundary(),
  };
}
