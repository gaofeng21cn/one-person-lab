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

const PREFIX = 'app-release-long-operator';
const REQUIRED_EVENT_KINDS = [
  'app_window_reopened_or_kept_live',
  'reload_prompt_path_exercised_or_confirmed_not_required',
  'provider_state_linkage_checked',
  'operator_continuity_window_observed',
] as const;

function releaseIdentity(cohort: string) {
  const release = cohort.trim().replace(/^app-release-cohort:/, '');
  return { release_version: release, cohort_id: `app-release-cohort:${release}` };
}

function workorderIdentity(workorder: Record<string, unknown>) {
  const release = stringValue(workorder.release_version) ?? 'unknown';
  return {
    release_version: release,
    cohort_id: stringValue(workorder.cohort_id) ?? releaseIdentity(release).cohort_id,
  };
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

export function startAppReleaseLongOperatorObservation(input: ObservationStartInput & { cohort: string }) {
  const identity = releaseIdentity(input.cohort);
  return {
    surface_kind: 'opl_app_release_long_operator_observation_start',
    status: 'started',
    ...identity,
    ...startOperatorObservation(input, PREFIX, REQUIRED_EVENT_KINDS, {
      surface_kind: 'opl_app_release_long_operator_observation_workorder',
      ...identity,
      authority_boundary: authorityBoundary(),
    }),
    record_payload_file: null,
    long_operator_evidence_refs: [],
    authority_boundary: authorityBoundary(),
  };
}

export function recordAppReleaseLongOperatorObservationEvent(input: ObservationEventInput) {
  const workorder = readObservationWorkorder(input.workorderFile, 'App release long-operator');
  const identity = workorderIdentity(workorder);
  return {
    surface_kind: 'opl_app_release_long_operator_observation_event_record',
    status: 'recorded',
    ...identity,
    ...recordOperatorObservationEvent(input, workorder, REQUIRED_EVENT_KINDS, {
      surface_kind: 'opl_app_release_long_operator_observation_event',
      ...identity,
      authority_boundary: authorityBoundary(),
    }),
    long_operator_evidence_refs: [],
    record_payload_file: null,
    authority_boundary: authorityBoundary(),
  };
}

export function finishAppReleaseLongOperatorObservation(input: ObservationFinishInput) {
  const workorder = readObservationWorkorder(input.workorderFile, 'App release long-operator');
  const identity = workorderIdentity(workorder);
  const observation = inspectOperatorObservation(input, workorder, REQUIRED_EVENT_KINDS);
  const result = {
    surface_kind: 'opl_app_release_long_operator_observation_finish',
    ...identity,
    ...observation.fields,
    authority_boundary: authorityBoundary(),
  };
  if (!observation.durationSatisfied || !observation.fields.required_event_kinds_observed) {
    return {
      ...result,
      status: 'blocked',
      long_operator_evidence_refs: [],
      record_payload_file: null,
      blocker: {
        blocker_id: !observation.durationSatisfied
          ? 'app_release_long_operator_minimum_duration_not_satisfied'
          : 'app_release_long_operator_required_events_missing',
        reason: !observation.durationSatisfied
          ? 'finished_at_is_before_minimum_operator_observation_window'
          : 'operator_log_is_missing_required_event_kinds',
      },
    };
  }
  const manifest = writeOperatorObservationManifest(input, workorder, PREFIX, observation, {
    surface_kind: 'opl_app_release_long_operator_observation_manifest',
    ...identity,
    authority_boundary: authorityBoundary(),
  });
  const recordPayload = {
    long_operator_evidence_refs: [operatorObservationRef(
      `long_operator_evidence_ref://one-person-lab-app/${identity.release_version}/operator-window`,
      manifest.manifest_file, manifest.manifest_sha256,
    )],
  };
  writeJsonPayloadFile(manifest.record_payload_file, recordPayload);
  return { ...result, status: 'evidence_ready', ...recordPayload, ...manifest };
}
