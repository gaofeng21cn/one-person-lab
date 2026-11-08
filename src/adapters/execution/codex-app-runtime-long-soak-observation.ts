import { writeJsonPayloadFile } from '../../kernel/json-file.ts';
import { stringValue } from '../../kernel/json-record.ts';
import {
  inspectOperatorObservation,
  operatorObservationRef,
  readObservationWorkorder,
  recordOperatorObservationEvent,
  startOperatorObservation,
  writeOperatorObservationManifest,
  type ObservationEventInput,
  type ObservationFinishInput,
  type ObservationStartInput,
} from '../../kernel/operator-observation.ts';

const PREFIX = 'codex-app-runtime-long-soak';
const IDENTITY = { target_surface: 'codex_app_runtime_role', runtime_policy: 'opl_temporal_hosted_autonomous' };
const REQUIRED_EVENT_KINDS = [
  'temporal_hosted_stage_or_worker_window_observed',
  'provider_state_linkage_checked',
  'codex_app_operator_observation_recorded',
  'operator_continuity_window_observed',
] as const;

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

function emptyRefs() {
  return { temporal_hosted_long_soak_refs: [], provider_state_linkage_refs: [], operator_evidence_refs: [] };
}

export function startCodexAppRuntimeLongSoakObservation(input: ObservationStartInput) {
  return {
    surface_kind: 'opl_codex_app_runtime_long_soak_observation_start',
    status: 'started',
    ...IDENTITY,
    ...startOperatorObservation(input, PREFIX, REQUIRED_EVENT_KINDS, {
      surface_kind: 'opl_codex_app_runtime_long_soak_observation_workorder',
      ...IDENTITY,
      authority_boundary: authorityBoundary(),
    }),
    record_payload_file: null,
    ...emptyRefs(),
    authority_boundary: authorityBoundary(),
  };
}

export function recordCodexAppRuntimeLongSoakObservationEvent(input: ObservationEventInput) {
  const workorder = readObservationWorkorder(input.workorderFile, 'Codex App runtime long-soak');
  const identity = {
    target_surface: stringValue(workorder.target_surface) ?? IDENTITY.target_surface,
    runtime_policy: stringValue(workorder.runtime_policy) ?? IDENTITY.runtime_policy,
  };
  return {
    surface_kind: 'opl_codex_app_runtime_long_soak_observation_event_record',
    status: 'recorded',
    ...identity,
    ...recordOperatorObservationEvent(input, workorder, REQUIRED_EVENT_KINDS, {
      surface_kind: 'opl_codex_app_runtime_long_soak_observation_event',
      ...identity,
      authority_boundary: authorityBoundary(),
    }),
    ...emptyRefs(),
    record_payload_file: null,
    authority_boundary: authorityBoundary(),
  };
}

export function finishCodexAppRuntimeLongSoakObservation(input: ObservationFinishInput) {
  const workorder = readObservationWorkorder(input.workorderFile, 'Codex App runtime long-soak');
  const observation = inspectOperatorObservation(input, workorder, REQUIRED_EVENT_KINDS);
  const result = {
    surface_kind: 'opl_codex_app_runtime_long_soak_observation_finish',
    ...IDENTITY,
    ...observation.fields,
    authority_boundary: authorityBoundary(),
  };
  if (!observation.durationSatisfied || !observation.fields.required_event_kinds_observed) {
    return {
      ...result,
      status: 'blocked',
      ...emptyRefs(),
      record_payload_file: null,
      blocker: {
        blocker_id: !observation.durationSatisfied
          ? 'codex_app_runtime_long_soak_minimum_duration_not_satisfied'
          : 'codex_app_runtime_long_soak_required_events_missing',
        reason: !observation.durationSatisfied
          ? 'finished_at_is_before_minimum_codex_app_runtime_long_soak_window'
          : 'operator_log_is_missing_required_event_kinds',
      },
    };
  }
  const manifest = writeOperatorObservationManifest(input, workorder, PREFIX, observation, {
    surface_kind: 'opl_codex_app_runtime_long_soak_observation_manifest',
    ...IDENTITY,
    authority_boundary: authorityBoundary(),
  });
  const recordPayload = {
    temporal_hosted_long_soak_refs: [operatorObservationRef(
      'temporal_hosted_long_soak_ref://one-person-lab/codex-app-runtime/operator-window',
      manifest.manifest_file, manifest.manifest_sha256,
    )],
    provider_state_linkage_refs: [operatorObservationRef(
      'provider_state_linkage_ref://one-person-lab/codex-app-runtime/operator-window',
      manifest.manifest_file, manifest.manifest_sha256,
    )],
    operator_evidence_refs: [operatorObservationRef(
      'operator_evidence_ref://one-person-lab/codex-app-runtime/operator-log',
      observation.operatorLogFile, manifest.operator_log_sha256,
    )],
  };
  writeJsonPayloadFile(manifest.record_payload_file, recordPayload);
  return { ...result, status: 'evidence_ready', ...recordPayload, ...manifest };
}
