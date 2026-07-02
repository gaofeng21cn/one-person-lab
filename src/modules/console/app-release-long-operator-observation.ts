import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

type StartInput = {
  cohort: string;
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
  'app_window_reopened_or_kept_live',
  'reload_prompt_path_exercised_or_confirmed_not_required',
  'provider_state_linkage_checked',
  'operator_continuity_window_observed',
] as const;

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function releaseVersion(cohort: string) {
  const trimmed = cohort.trim();
  return trimmed.startsWith('app-release-cohort:')
    ? trimmed.slice('app-release-cohort:'.length)
    : trimmed;
}

function cohortId(cohort: string) {
  return cohort.trim().startsWith('app-release-cohort:')
    ? cohort.trim()
    : `app-release-cohort:${cohort.trim()}`;
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
    can_claim_release_ready: false,
    can_claim_production_ready: false,
    can_close_app_release_user_path: false,
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
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!isRecord(parsed)) {
    throw new Error('App release long-operator workorder must be a JSON object.');
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
        const parsed = JSON.parse(line) as unknown;
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

export function startAppReleaseLongOperatorObservation(input: StartInput) {
  const release = releaseVersion(input.cohort);
  const selectedCohortId = cohortId(input.cohort);
  const startedAt = nowIso();
  const earliestFinishAt = new Date(
    Date.parse(startedAt) + input.minimumDurationMinutes * 60 * 1000,
  ).toISOString();
  fs.mkdirSync(input.evidenceDir, { recursive: true });
  const workorderFile = path.join(input.evidenceDir, 'app-release-long-operator-workorder.json');
  const operatorLogFile = path.join(input.evidenceDir, 'operator-observation-events.jsonl');
  const manifestFile = path.join(input.evidenceDir, 'app-release-long-operator-manifest.json');
  const recordPayloadFile = path.join(input.evidenceDir, 'app-release-long-operator-record-payload.json');
  const workorder = {
    surface_kind: 'opl_app_release_long_operator_observation_workorder',
    status: 'started',
    release_version: release,
    cohort_id: selectedCohortId,
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
    surface_kind: 'opl_app_release_long_operator_observation_start',
    status: 'started',
    cohort_id: selectedCohortId,
    release_version: release,
    started_at: startedAt,
    minimum_duration_minutes: input.minimumDurationMinutes,
    earliest_finish_at: earliestFinishAt,
    workorder_file: workorderFile,
    operator_log_file: operatorLogFile,
    manifest_file: manifestFile,
    record_payload_file: null,
    long_operator_evidence_refs: [],
    required_event_kinds: [...REQUIRED_EVENT_KINDS],
    authority_boundary: authorityBoundary(),
  };
}

export function recordAppReleaseLongOperatorObservationEvent(input: EventInput) {
  const workorder = readJson(input.workorderFile);
  assertRequiredEventKind(input.eventKind);
  const observedAt = input.observedAt ?? nowIso();
  parseIso(observedAt, 'observed_at');
  const release = stringValue(workorder.release_version) ?? 'unknown';
  const selectedCohortId = stringValue(workorder.cohort_id) ?? cohortId(release);
  const operatorLogFile = stringValue(workorder.operator_log_file)
    ?? path.join(path.dirname(input.workorderFile), 'operator-observation-events.jsonl');
  fs.mkdirSync(path.dirname(operatorLogFile), { recursive: true });
  const event = {
    surface_kind: 'opl_app_release_long_operator_observation_event',
    cohort_id: selectedCohortId,
    release_version: release,
    event_kind: input.eventKind,
    observed_at: observedAt,
    evidence_ref: input.evidenceRef ?? null,
    authority_boundary: authorityBoundary(),
  };
  fs.appendFileSync(operatorLogFile, `${JSON.stringify(event)}\n`);
  const events = readOperatorEvents(operatorLogFile);
  const observedEventKinds = [...new Set(events.map((entry) => stringValue(entry.event_kind)).filter(
    (eventKind): eventKind is string => Boolean(eventKind),
  ))].sort();
  const missingEventKinds = REQUIRED_EVENT_KINDS.filter((eventKind) =>
    !observedEventKinds.includes(eventKind)
  );
  return {
    surface_kind: 'opl_app_release_long_operator_observation_event_record',
    status: 'recorded',
    cohort_id: selectedCohortId,
    release_version: release,
    operator_log_file: operatorLogFile,
    event,
    observed_event_kinds: observedEventKinds,
    missing_event_kinds: missingEventKinds,
    required_event_kinds_observed: missingEventKinds.length === 0,
    long_operator_evidence_refs: [],
    record_payload_file: null,
    authority_boundary: authorityBoundary(),
  };
}

export function finishAppReleaseLongOperatorObservation(input: FinishInput) {
  const workorder = readJson(input.workorderFile);
  const startedAt = stringValue(workorder.started_at) ?? nowIso();
  const finishedAt = input.finishedAt ?? nowIso();
  const startedMs = parseIso(startedAt, 'started_at');
  const finishedMs = parseIso(finishedAt, 'finished_at');
  const minimumDurationMinutes = numberValue(workorder.minimum_duration_minutes) ?? 0;
  const elapsedMinutes = Math.floor((finishedMs - startedMs) / 60000);
  const operatorLogFile = stringValue(workorder.operator_log_file)
    ?? path.join(path.dirname(input.workorderFile), 'operator-observation-events.jsonl');
  const events = readOperatorEvents(operatorLogFile);
  const observedEventKinds = [...new Set(events.map((event) => stringValue(event.event_kind)).filter(
    (eventKind): eventKind is string => Boolean(eventKind),
  ))].sort();
  const missingEventKinds = REQUIRED_EVENT_KINDS.filter((eventKind) =>
    !observedEventKinds.includes(eventKind)
  );
  const durationSatisfied = elapsedMinutes >= minimumDurationMinutes;
  const requiredEventKindsObserved = missingEventKinds.length === 0;
  const release = stringValue(workorder.release_version) ?? 'unknown';
  const selectedCohortId = stringValue(workorder.cohort_id) ?? cohortId(release);

  if (!durationSatisfied || !requiredEventKindsObserved) {
    const blockerId = !durationSatisfied
      ? 'app_release_long_operator_minimum_duration_not_satisfied'
      : 'app_release_long_operator_required_events_missing';
    return {
      surface_kind: 'opl_app_release_long_operator_observation_finish',
      status: 'blocked',
      cohort_id: selectedCohortId,
      release_version: release,
      started_at: startedAt,
      finished_at: finishedAt,
      elapsed_minutes: elapsedMinutes,
      minimum_duration_minutes: minimumDurationMinutes,
      required_event_kinds_observed: requiredEventKindsObserved,
      observed_event_kinds: observedEventKinds,
      missing_event_kinds: missingEventKinds,
      long_operator_evidence_refs: [],
      record_payload_file: null,
      blocker: {
        blocker_id: blockerId,
        reason: !durationSatisfied
          ? 'finished_at_is_before_minimum_operator_observation_window'
          : 'operator_log_is_missing_required_event_kinds',
      },
      authority_boundary: authorityBoundary(),
    };
  }

  const manifestFile = stringValue(workorder.manifest_file)
    ?? path.join(path.dirname(input.workorderFile), 'app-release-long-operator-manifest.json');
  const recordPayloadFile = stringValue(workorder.record_payload_file)
    ?? path.join(path.dirname(input.workorderFile), 'app-release-long-operator-record-payload.json');
  const operatorLogSha256 = sha256File(operatorLogFile);
  const manifest = {
    surface_kind: 'opl_app_release_long_operator_observation_manifest',
    cohort_id: selectedCohortId,
    release_version: release,
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
    `long_operator_evidence_ref://one-person-lab-app/${release}/operator-window/${manifestSha256.slice(0, 16)}`
    + `?path=${encodeURIComponent(manifestFile)}&sha256=${manifestSha256}`;
  writeJson(recordPayloadFile, {
    long_operator_evidence_refs: [evidenceRef],
  });
  return {
    surface_kind: 'opl_app_release_long_operator_observation_finish',
    status: 'evidence_ready',
    cohort_id: selectedCohortId,
    release_version: release,
    started_at: startedAt,
    finished_at: finishedAt,
    elapsed_minutes: elapsedMinutes,
    minimum_duration_minutes: minimumDurationMinutes,
    required_event_kinds_observed: true,
    observed_event_kinds: observedEventKinds,
    missing_event_kinds: [],
    long_operator_evidence_refs: [evidenceRef],
    operator_log_sha256: operatorLogSha256,
    manifest_file: manifestFile,
    manifest_sha256: manifestSha256,
    record_payload_file: recordPayloadFile,
    authority_boundary: authorityBoundary(),
  };
}
