import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  assertReleaseBundleOperationControl,
  releaseBundleOperationControlCore,
  sha256,
} from './contracts.ts';
import { releaseBundleOperationReceipt } from './receipt.ts';
import {
  installReleaseBundleOperationControl,
  listReleaseBundleUnknownOutcomes,
  readReleaseBundleOperation,
  readReleaseBundleOperationControl,
  readStagedReleaseBundleAssets,
  readStoredReleaseBundle,
  recordReleaseBundleOperation,
  replaceReleaseBundleOperationControl,
  releaseBundleLegacyCheckpointReadOnly,
  releaseBundleStorePaths,
  withReleaseBundleStateLock,
} from './store.ts';
import type {
  ReleaseBundleCanonicalOperation,
  ReleaseBundle,
  ReleaseBundleOperationControl,
  ReleaseBundleOperationInput,
  ReleaseBundleOperationInvocation,
  ReleaseBundleStableOperation,
  ReleaseBundleTrackName,
} from './types.ts';

type StorePaths = ReturnType<typeof releaseBundleStorePaths>;

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    surface_kind: 'opl_release_bundle_operation_control.v1',
    ...details,
  });
}

export function canonicalReleaseBundleOperation(
  operation: ReleaseBundleStableOperation,
): ReleaseBundleCanonicalOperation {
  return operation === 'append_full' ? 'append_full' : 'standard';
}

export function releaseBundleOperationTrack(
  operation: ReleaseBundleStableOperation,
): ReleaseBundleTrackName {
  return operation === 'append_full' ? 'full' : 'standard';
}

export function releaseBundleOperationTracks(
  operation: ReleaseBundleStableOperation,
): readonly ReleaseBundleTrackName[] {
  return operation === 'append_full' ? ['full'] : ['standard', 'webui'];
}

function nowMilliseconds(value?: string | Date) {
  const now = value instanceof Date ? value.getTime() : value === undefined ? Date.now() : Date.parse(value);
  if (!Number.isFinite(now)) fail('Release Bundle operation clock is invalid.', { now: value });
  return now;
}

export function releaseBundleOperationDeadlineElapsed(
  control: ReleaseBundleOperationControl,
  now?: string | Date,
) {
  return nowMilliseconds(now) >= Date.parse(control.operation_deadline_at);
}

function candidateControl(input: {
  bundleDigest: string;
  invocation: ReleaseBundleOperationInvocation;
}) {
  if (!['standard', 'resume_standard', 'append_full'].includes(input.invocation.releaseOperation)) {
    fail('Release Bundle operation kind is invalid.', {
      release_operation: input.invocation.releaseOperation,
    });
  }
  for (const [field, value] of [
    ['operation_id', input.invocation.operationId],
    ['operation_started_at', input.invocation.operationStartedAt],
    ['operation_deadline_at', input.invocation.operationDeadlineAt],
  ] as const) {
    if (typeof value !== 'string' || !value.trim()) {
      fail(`Release Bundle ${field} must be a non-empty string.`, { field });
    }
  }
  const canonicalOperation = canonicalReleaseBundleOperation(input.invocation.releaseOperation);
  const core = {
    surface_kind: 'opl_release_bundle_operation_control.v1' as const,
    schema_ref: 'contracts/opl-framework/release-bundle-operation-control.schema.json' as const,
    bundle_digest: input.bundleDigest,
    operation_id: input.invocation.operationId,
    operation_kind: canonicalOperation,
    track: releaseBundleOperationTrack(input.invocation.releaseOperation),
    operation_started_at: input.invocation.operationStartedAt,
    operation_deadline_at: input.invocation.operationDeadlineAt,
  };
  const control: ReleaseBundleOperationControl = {
    ...core,
    control_digest: sha256(canonicalJsonBytes(core)),
  };
  assertReleaseBundleOperationControl(control);
  return control;
}

function assertExactControl(
  current: ReleaseBundleOperationControl,
  expected: ReleaseBundleOperationControl,
  requestedOperation: ReleaseBundleStableOperation,
) {
  if (!canonicalJsonBytes(current).equals(canonicalJsonBytes(expected))) {
    fail('Release Bundle operation control is immutable and does not match this invocation.', {
      requested_operation: requestedOperation,
      expected_control_digest: current.control_digest,
      received_control_digest: expected.control_digest,
      operation_id: expected.operation_id,
      operation_started_at: expected.operation_started_at,
      operation_deadline_at: expected.operation_deadline_at,
    });
  }
}

function assertResumeWindowRotation(
  current: ReleaseBundleOperationControl,
  replacement: ReleaseBundleOperationControl,
  now?: string | Date,
) {
  if (!releaseBundleOperationDeadlineElapsed(current, now)) {
    fail('resume_standard cannot rotate an active Standard operation window.', {
      operation_id: current.operation_id,
      operation_deadline_at: current.operation_deadline_at,
    });
  }
  if (current.bundle_digest !== replacement.bundle_digest
    || current.operation_id !== replacement.operation_id
    || current.operation_kind !== 'standard'
    || replacement.operation_kind !== 'standard'
    || current.track !== 'standard'
    || replacement.track !== 'standard') {
    fail('resume_standard window rotation must preserve the exact Standard identity.', {
      current_control_digest: current.control_digest,
      replacement_control_digest: replacement.control_digest,
    });
  }
  const startedAt = Date.parse(replacement.operation_started_at);
  const deadlineAt = Date.parse(replacement.operation_deadline_at);
  const observedAt = nowMilliseconds(now);
  if (startedAt < Date.parse(current.operation_deadline_at) || startedAt > observedAt) {
    fail('resume_standard window rotation must start after the expired window and no later than the current clock.', {
      previous_operation_deadline_at: current.operation_deadline_at,
      replacement_operation_started_at: replacement.operation_started_at,
      observed_at: new Date(observedAt).toISOString(),
    });
  }
  if (deadlineAt <= observedAt) {
    fail('resume_standard replacement window must still be active.', {
      replacement_operation_deadline_at: replacement.operation_deadline_at,
      observed_at: new Date(observedAt).toISOString(),
    });
  }
}

function assertNoActiveUnknownOutcome(paths: StorePaths) {
  const markers = listReleaseBundleUnknownOutcomes(paths);
  if (markers.length > 0) {
    fail('An active Release Bundle unknown outcome blocks every ordinary mutation.', {
      active_marker_digests: markers.map((marker) => marker.marker_digest),
      required_next_command: 'opl release status then exact opl release reconcile',
    });
  }
}

function assertExpiredFullReplacement(
  paths: StorePaths,
  bundle: ReleaseBundle,
  current: ReleaseBundleOperationControl,
  replacement: ReleaseBundleOperationControl,
  now?: string | Date,
) {
  if (!releaseBundleOperationDeadlineElapsed(current, now)) {
    fail('append_full cannot replace an active operation window.');
  }
  if (current.bundle_digest !== replacement.bundle_digest
    || current.operation_id === replacement.operation_id
    || current.operation_kind !== 'append_full' || replacement.operation_kind !== 'append_full'
    || current.track !== 'full' || replacement.track !== 'full') {
    fail('Expired Full recovery requires a new operation identity for the exact bundle and Full track.');
  }
  const observedAt = nowMilliseconds(now);
  const startedAt = Date.parse(replacement.operation_started_at);
  if (startedAt < Date.parse(current.operation_deadline_at) || startedAt > observedAt
    || Date.parse(replacement.operation_deadline_at) <= observedAt) {
    fail('Expired Full recovery must start after the prior window and remain active at admission.');
  }
  assertAppendFullAdmission(paths, bundle, replacement);
  if (!readStagedReleaseBundleAssets(paths, 'full')) {
    fail('Expired Full recovery requires an existing built Full checkpoint.');
  }
}

function assertLiveCompatible(paths: StorePaths) {
  if (releaseBundleLegacyCheckpointReadOnly(paths)) {
    fail('A legacy checkpoint without operation control is read-only and cannot drive live mutation.', {
      compatibility: 'status_and_history_only',
      required_next_action: 'freeze_a_current_checkpoint_with_operation_control',
    });
  }
}

function assertDeadlineActive(
  control: ReleaseBundleOperationControl,
  now?: string | Date,
) {
  if (releaseBundleOperationDeadlineElapsed(control, now)) {
    fail('Release Bundle absolute operation deadline has elapsed.', {
      operation_id: control.operation_id,
      operation_kind: control.operation_kind,
      operation_deadline_at: control.operation_deadline_at,
      allowed_commands: ['status', 'reconcile_exact_unknown'],
    });
  }
}

function assertAppendFullAdmission(
  paths: StorePaths,
  bundle: ReleaseBundle,
  control: ReleaseBundleOperationControl,
) {
  const standardControl = readReleaseBundleOperationControl(paths, 'standard');
  if (!standardControl) {
    fail('append_full requires the immutable Standard operation control.');
  }
  if (standardControl.operation_id === control.operation_id) {
    fail('append_full requires an independent operation identity.', {
      standard_operation_id: standardControl.operation_id,
      append_full_operation_id: control.operation_id,
    });
  }
  const requiredTracks = (['standard', 'webui'] as const).filter(
    (track) => bundle.tracks[track]?.required_for_latest,
  );
  for (const track of requiredTracks) {
    if (!readStagedReleaseBundleAssets(paths, track)) {
      fail('append_full requires a built Standard checkpoint and every Stable carrier track before admission.', {
        missing_track: track,
        required_tracks: requiredTracks,
      });
    }
  }
}

function admitReleaseBundleOperationUnlocked(
  input: ReleaseBundleOperationInput & ReleaseBundleOperationInvocation,
) {
  const stored = readStoredReleaseBundle(input.bundleDigest, input.storeRoot);
  assertLiveCompatible(stored.paths);
  assertNoActiveUnknownOutcome(stored.paths);
  const candidate = candidateControl({ bundleDigest: input.bundleDigest, invocation: input });
  const canonicalOperation = canonicalReleaseBundleOperation(input.releaseOperation);
  const current = readReleaseBundleOperationControl(stored.paths, canonicalOperation);

  if (input.releaseOperation === 'resume_standard' && !current) {
    fail('resume_standard requires an existing Standard operation control from the checkpoint.', {
      bundle_digest: input.bundleDigest,
      resume_of: input.operationId,
    });
  }
  if (!current && canonicalOperation === 'append_full') {
    assertAppendFullAdmission(stored.paths, stored.bundle, candidate);
  }
  let installed: { status: 'created' | 'idempotent' | 'replaced' };
  let control: ReleaseBundleOperationControl;
  if (current && input.releaseOperation === 'resume_standard'
    && !canonicalJsonBytes(current).equals(canonicalJsonBytes(candidate))) {
    assertResumeWindowRotation(current, candidate, input.now);
    installed = replaceReleaseBundleOperationControl(stored.paths, current, candidate);
    control = candidate;
  } else if (current && input.releaseOperation === 'append_full'
    && !canonicalJsonBytes(current).equals(canonicalJsonBytes(candidate))) {
    assertExpiredFullReplacement(stored.paths, stored.bundle, current, candidate, input.now);
    installed = replaceReleaseBundleOperationControl(stored.paths, current, candidate);
    control = candidate;
  } else {
    if (current) assertExactControl(current, candidate, input.releaseOperation);
    assertDeadlineActive(current ?? candidate, input.now);
    installed = current
      ? { status: 'idempotent' as const }
      : installReleaseBundleOperationControl(stored.paths, candidate);
    control = current ?? candidate;
  }
  const receipt = releaseBundleOperationReceipt({
    operation: 'operation_admit',
    status: installed.status === 'idempotent' ? 'idempotent' : 'complete',
    bundle_digest: input.bundleDigest,
    track: control.track,
    executor: null,
    attempt_id: control.operation_id,
    release_operation: input.releaseOperation,
    operation_control: control,
    unknown_marker: null,
    details: {
      control_digest: control.control_digest,
      deadline_frozen_once: true,
      deadline_refresh_allowed: input.releaseOperation === 'resume_standard',
      resume_window_rotated: installed.status === 'replaced',
      previous_control_digest: installed.status === 'replaced' ? current?.control_digest ?? null : null,
      resume_of: input.releaseOperation === 'resume_standard' ? control.operation_id : null,
      expired_full_operation_replaced: installed.status === 'replaced' && input.releaseOperation === 'append_full',
      previous_operation_id: installed.status === 'replaced' ? current?.operation_id ?? null : null,
      append_full_independent_deadline: input.releaseOperation === 'append_full',
    },
  });
  const recorded = recordReleaseBundleOperation(stored.paths, receipt);
  return {
    version: 'g2' as const,
    release_bundle_operation_admit: {
      status: receipt.status,
      bundle_digest: input.bundleDigest,
      release_operation: input.releaseOperation,
      operation_control: control,
      receipt_path: recorded.receiptPath,
      receipt,
    },
  };
}

export function admitReleaseBundleOperation(
  input: ReleaseBundleOperationInput & ReleaseBundleOperationInvocation,
) {
  const paths = releaseBundleStorePaths(input.bundleDigest, input.storeRoot);
  return withReleaseBundleStateLock(paths, () => admitReleaseBundleOperationUnlocked(input));
}

export function requireReleaseBundleOperation(
  paths: StorePaths,
  bundleDigest: string,
  invocation: ReleaseBundleOperationInvocation,
  options: {
    allowExpired?: boolean;
    allowActiveUnknown?: boolean;
  } = {},
) {
  assertLiveCompatible(paths);
  if (!options.allowActiveUnknown) assertNoActiveUnknownOutcome(paths);
  const canonicalOperation = canonicalReleaseBundleOperation(invocation.releaseOperation);
  const current = readReleaseBundleOperationControl(paths, canonicalOperation);
  if (!current) {
    fail('Release Bundle operation must be admitted before any build, verify, or publish plan.', {
      bundle_digest: bundleDigest,
      release_operation: invocation.releaseOperation,
      required_next_command: 'opl release operation admit',
    });
  }
  const expected = candidateControl({ bundleDigest, invocation });
  assertExactControl(current, expected, invocation.releaseOperation);
  const deadlineElapsed = releaseBundleOperationDeadlineElapsed(current, invocation.now);
  if (deadlineElapsed && !options.allowExpired) assertDeadlineActive(current, invocation.now);
  return { control: current, deadlineElapsed };
}

export function assertReleaseBundleOperationTrack(
  operation: ReleaseBundleStableOperation,
  track: ReleaseBundleTrackName,
) {
  const allowed = releaseBundleOperationTracks(operation);
  if (!allowed.includes(track)) {
    fail('Release Bundle operation cannot act on the requested track.', {
      release_operation: operation,
      allowed_tracks: allowed,
      received_track: track,
    });
  }
}
