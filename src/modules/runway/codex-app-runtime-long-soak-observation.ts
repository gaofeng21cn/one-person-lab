import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText, readJsonPayloadFile, writeJsonPayloadFile } from '../../kernel/json-file.ts';
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

const TARGET_SURFACE = 'codex_app_runtime_role';
const RUNTIME_POLICY = 'opl_temporal_hosted_autonomous';

const REQUIRED_EVENT_KINDS = [
  'temporal_hosted_stage_or_worker_window_observed',
  'provider_state_linkage_checked',
  'codex_app_operator_observation_recorded',
  'operator_continuity_window_observed',
] as const;

function nowIso() {
  return new Date().toISOString();
}

function authorityBoundary() {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact_body: false,
    can_authorize_quality_or_export: false,
    can_create_owner_receipt: false,
    can_generate_typed_blocker: false,
    can_close_domain_ready: false,
    can_close_long_soak: false,
    can_claim_production_ready: false,
    can_drive_long_running_task_loop: false,
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
    throw new Error('Codex App runtime long-soak workorder must be a JSON object.');
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

export function startCodexAppRuntimeLongSoakObservation(input: StartInput) {
  const startedAt = nowIso();
  const earliestFinishAt = new Date(
    Date.parse(startedAt) + input.minimumDurationMinutes * 60 * 1000,
  ).toISOString();
  fs.mkdirSync(input.evidenceDir, { recursive: true });
  const workorderFile = path.join(
    input.evidenceDir,
    'codex-app-runtime-long-soak-workorder.json',
  );
  const operatorLogFile = path.join(input.evidenceDir, 'operator-observation-events.jsonl');
  const manifestFile = path.join(input.evidenceDir, 'codex-app-runtime-long-soak-manifest.json');
  const recordPayloadFile = path.join(
    input.evidenceDir,
    'codex-app-runtime-long-soak-record-payload.json',
  );
  const workorder = {
    surface_kind: 'opl_codex_app_runtime_long_soak_observation_workorder',
    status: 'started',
    target_surface: TARGET_SURFACE,
    runtime_policy: RUNTIME_POLICY,
    started_at: startedAt,
    minimum_duration_minutes: input.minimumDurationMinutes,
    earliest_finish_at: earliestFinishAt,
    required_event_kinds: [...REQUIRED_EVENT_KINDS],
    operator_log_file: operatorLogFile,
    manifest_file: manifestFile,
    record_payload_file: recordPayloadFile,
    authority_boundary: authorityBoundary(),
  };
  writeJsonPayloadFile(workorderFile, workorder);
  fs.writeFileSync(operatorLogFile, '');
  return {
    surface_kind: 'opl_codex_app_runtime_long_soak_observation_start',
    status: 'started',
    target_surface: TARGET_SURFACE,
    runtime_policy: RUNTIME_POLICY,
    started_at: startedAt,
    minimum_duration_minutes: input.minimumDurationMinutes,
    earliest_finish_at: earliestFinishAt,
    workorder_file: workorderFile,
    operator_log_file: operatorLogFile,
    manifest_file: manifestFile,
    record_payload_file: null,
    temporal_hosted_long_soak_refs: [],
    provider_state_linkage_refs: [],
    operator_evidence_refs: [],
    required_event_kinds: [...REQUIRED_EVENT_KINDS],
    authority_boundary: authorityBoundary(),
  };
}

export function recordCodexAppRuntimeLongSoakObservationEvent(input: EventInput) {
  const workorder = readJson(input.workorderFile);
  assertRequiredEventKind(input.eventKind);
  const observedAt = input.observedAt ?? nowIso();
  parseIso(observedAt, 'observed_at');
  const operatorLogFile = stringValue(workorder.operator_log_file)
    ?? path.join(path.dirname(input.workorderFile), 'operator-observation-events.jsonl');
  fs.mkdirSync(path.dirname(operatorLogFile), { recursive: true });
  const event = {
    surface_kind: 'opl_codex_app_runtime_long_soak_observation_event',
    target_surface: stringValue(workorder.target_surface) ?? TARGET_SURFACE,
    runtime_policy: stringValue(workorder.runtime_policy) ?? RUNTIME_POLICY,
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
    surface_kind: 'opl_codex_app_runtime_long_soak_observation_event_record',
    status: 'recorded',
    target_surface: stringValue(workorder.target_surface) ?? TARGET_SURFACE,
    runtime_policy: stringValue(workorder.runtime_policy) ?? RUNTIME_POLICY,
    operator_log_file: operatorLogFile,
    event,
    observed_event_kinds: observedEventKinds,
    missing_event_kinds: missingEventKinds,
    required_event_kinds_observed: missingEventKinds.length === 0,
    temporal_hosted_long_soak_refs: [],
    provider_state_linkage_refs: [],
    operator_evidence_refs: [],
    record_payload_file: null,
    authority_boundary: authorityBoundary(),
  };
}

export function finishCodexAppRuntimeLongSoakObservation(input: FinishInput) {
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
      ? 'codex_app_runtime_long_soak_minimum_duration_not_satisfied'
      : 'codex_app_runtime_long_soak_required_events_missing';
    return {
      surface_kind: 'opl_codex_app_runtime_long_soak_observation_finish',
      status: 'blocked',
      target_surface: TARGET_SURFACE,
      runtime_policy: RUNTIME_POLICY,
      started_at: startedAt,
      finished_at: finishedAt,
      elapsed_minutes: elapsedMinutes,
      minimum_duration_minutes: minimumDurationMinutes,
      required_event_kinds_observed: requiredEventKindsObserved,
      observed_event_kinds: observedEventKinds,
      missing_event_kinds: missingEventKinds,
      temporal_hosted_long_soak_refs: [],
      provider_state_linkage_refs: [],
      operator_evidence_refs: [],
      record_payload_file: null,
      blocker: {
        blocker_id: blockerId,
        reason: !durationSatisfied
          ? 'finished_at_is_before_minimum_codex_app_runtime_long_soak_window'
          : 'operator_log_is_missing_required_event_kinds',
      },
      authority_boundary: authorityBoundary(),
    };
  }

  const manifestFile = stringValue(workorder.manifest_file)
    ?? path.join(path.dirname(input.workorderFile), 'codex-app-runtime-long-soak-manifest.json');
  const recordPayloadFile = stringValue(workorder.record_payload_file)
    ?? path.join(
      path.dirname(input.workorderFile),
      'codex-app-runtime-long-soak-record-payload.json',
    );
  const operatorLogSha256 = sha256File(operatorLogFile);
  const manifest = {
    surface_kind: 'opl_codex_app_runtime_long_soak_observation_manifest',
    target_surface: TARGET_SURFACE,
    runtime_policy: RUNTIME_POLICY,
    started_at: startedAt,
    finished_at: finishedAt,
    elapsed_minutes: elapsedMinutes,
    minimum_duration_minutes: minimumDurationMinutes,
    operator_log_file: operatorLogFile,
    operator_log_sha256: operatorLogSha256,
    observed_event_kinds: observedEventKinds,
    authority_boundary: authorityBoundary(),
  };
  writeJsonPayloadFile(manifestFile, manifest);
  const manifestSha256 = sha256File(manifestFile);
  const temporalHostedLongSoakRef =
    `temporal_hosted_long_soak_ref://one-person-lab/codex-app-runtime/operator-window/${manifestSha256.slice(0, 16)}`
    + `?path=${encodeURIComponent(manifestFile)}&sha256=${manifestSha256}`;
  const providerStateLinkageRef =
    `provider_state_linkage_ref://one-person-lab/codex-app-runtime/operator-window/${manifestSha256.slice(0, 16)}`
    + `?path=${encodeURIComponent(manifestFile)}&sha256=${manifestSha256}`;
  const operatorEvidenceRef =
    `operator_evidence_ref://one-person-lab/codex-app-runtime/operator-log/${operatorLogSha256.slice(0, 16)}`
    + `?path=${encodeURIComponent(operatorLogFile)}&sha256=${operatorLogSha256}`;
  const recordPayload = {
    temporal_hosted_long_soak_refs: [temporalHostedLongSoakRef],
    provider_state_linkage_refs: [providerStateLinkageRef],
    operator_evidence_refs: [operatorEvidenceRef],
  };
  writeJsonPayloadFile(recordPayloadFile, recordPayload);
  return {
    surface_kind: 'opl_codex_app_runtime_long_soak_observation_finish',
    status: 'evidence_ready',
    target_surface: TARGET_SURFACE,
    runtime_policy: RUNTIME_POLICY,
    started_at: startedAt,
    finished_at: finishedAt,
    elapsed_minutes: elapsedMinutes,
    minimum_duration_minutes: minimumDurationMinutes,
    required_event_kinds_observed: true,
    observed_event_kinds: observedEventKinds,
    missing_event_kinds: [],
    temporal_hosted_long_soak_refs: recordPayload.temporal_hosted_long_soak_refs,
    provider_state_linkage_refs: recordPayload.provider_state_linkage_refs,
    operator_evidence_refs: recordPayload.operator_evidence_refs,
    operator_log_sha256: operatorLogSha256,
    manifest_file: manifestFile,
    manifest_sha256: manifestSha256,
    record_payload_file: recordPayloadFile,
    authority_boundary: authorityBoundary(),
  };
}
