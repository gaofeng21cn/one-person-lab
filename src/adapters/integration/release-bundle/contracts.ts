import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import bundleSchema from '../../../../contracts/opl-framework/release-bundle.schema.json' with { type: 'json' };
import checkpointSchema from '../../../../contracts/opl-framework/release-bundle-checkpoint.schema.json' with { type: 'json' };
import executorReceiptSchema from '../../../../contracts/opl-framework/release-bundle-executor-receipt.schema.json' with { type: 'json' };
import freezeRequestSchema from '../../../../contracts/opl-framework/release-bundle-freeze-request.schema.json' with { type: 'json' };
import operationControlSchema from '../../../../contracts/opl-framework/release-bundle-operation-control.schema.json' with { type: 'json' };
import operationEventSchema from '../../../../contracts/opl-framework/release-bundle-operation-event.schema.json' with { type: 'json' };
import operationReceiptSchema from '../../../../contracts/opl-framework/release-bundle-operation-receipt.schema.json' with { type: 'json' };
import qualificationReceiptSchema from '../../../../contracts/opl-framework/release-bundle-qualification-receipt.schema.json' with { type: 'json' };
import unknownOutcomeSchema from '../../../../contracts/opl-framework/release-bundle-unknown-outcome.schema.json' with { type: 'json' };
import consumerEnvelopeSchema from '../../../../contracts/opl-framework/release-bundle-consumer-envelope.schema.json' with { type: 'json' };
import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { assertJsonSchemaPayload } from '../../../kernel/schema-registry.ts';
import {
  RELEASE_BUNDLE_APP_STANDARD_FROZEN_BUILD_INPUT_IDS,
  type ReleaseBundle,
  type ReleaseBundleAppStandardFreezeRequest,
  type ReleaseBundleCheckpoint,
  type ReleaseBundleExecutorReceipt,
  type ReleaseBundleFreezeRequestDocument,
  type ReleaseBundleOperationControl,
  type ReleaseBundleOperationEvent,
  type ReleaseBundleOperationReceipt,
  type ReleaseBundleConsumerEnvelope,
  type ReleaseBundleQualificationReceipt,
  type ReleaseBundleTrackName,
  type ReleaseBundleUnknownOutcomeMarker,
} from './types.ts';

export const RELEASE_BUNDLE_SCHEMA_REF =
  'contracts/opl-framework/release-bundle.schema.json' as const;
export const RELEASE_BUNDLE_CHECKPOINT_SCHEMA_REF =
  'contracts/opl-framework/release-bundle-checkpoint.schema.json' as const;
export const RELEASE_BUNDLE_FREEZE_REQUEST_SCHEMA_REF =
  'contracts/opl-framework/release-bundle-freeze-request.schema.json' as const;
export const RELEASE_BUNDLE_EXECUTOR_RECEIPT_SCHEMA_REF =
  'contracts/opl-framework/release-bundle-executor-receipt.schema.json' as const;
export const RELEASE_BUNDLE_OPERATION_RECEIPT_SCHEMA_REF =
  'contracts/opl-framework/release-bundle-operation-receipt.schema.json' as const;
export const RELEASE_BUNDLE_OPERATION_CONTROL_SCHEMA_REF =
  'contracts/opl-framework/release-bundle-operation-control.schema.json' as const;
export const RELEASE_BUNDLE_OPERATION_EVENT_SCHEMA_REF =
  'contracts/opl-framework/release-bundle-operation-event.schema.json' as const;
export const RELEASE_BUNDLE_QUALIFICATION_RECEIPT_SCHEMA_REF =
  'contracts/opl-framework/release-bundle-qualification-receipt.schema.json' as const;
export const RELEASE_BUNDLE_UNKNOWN_OUTCOME_SCHEMA_REF =
  'contracts/opl-framework/release-bundle-unknown-outcome.schema.json' as const;
export const RELEASE_BUNDLE_CONSUMER_ENVELOPE_SCHEMA_REF =
  'contracts/opl-framework/release-bundle-consumer-envelope.schema.json' as const;

const DIGEST = /^sha256:[0-9a-f]{64}$/;

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    surface_kind: 'opl_release_bundle.v1',
    ...details,
  });
}

export function sha256(value: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function readJsonObject(filePath: string, label: string) {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new FrameworkContractError('contract_file_missing', `${label} is missing.`, {
      path: filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  let value: unknown;
  try {
    value = parseJsonText(raw);
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', `${label} is not valid JSON.`, {
      path: filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(value)) fail(`${label} must be a JSON object.`, { path: filePath });
  return value;
}

function safeReference(value: string, label: string) {
  if (
    !value
    || value.includes('\\')
    || path.posix.isAbsolute(value)
    || path.posix.normalize(value) !== value
    || value.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    fail(`${label} must be a canonical relative POSIX file ref.`, { ref: value });
  }
  return value;
}

function sourceRootPath(input?: string) {
  const root = path.resolve(input?.trim() || process.cwd());
  let state: fs.Stats;
  try {
    state = fs.lstatSync(root);
  } catch (error) {
    throw new FrameworkContractError('contract_file_missing', 'Release Bundle source root is unavailable.', {
      path: root,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!state.isDirectory() || state.isSymbolicLink()) {
    fail('Release Bundle source root must be a real directory.', { path: root });
  }
  return fs.realpathSync(root);
}

function readSourceReference(root: string, ref: string, label: string) {
  const relativeRef = safeReference(ref, label);
  const requested = path.resolve(root, ...relativeRef.split('/'));
  const real = (() => {
    try {
      return fs.realpathSync(requested);
    } catch (error) {
      throw new FrameworkContractError('contract_file_missing', `${label} is unavailable.`, {
        path: requested,
        ref: relativeRef,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  })();
  if (!real.startsWith(`${root}${path.sep}`)) {
    fail(`${label} resolves outside the Release Bundle source root.`, {
      source_root: root,
      ref: relativeRef,
      resolved_path: real,
    });
  }
  const linked = fs.lstatSync(requested);
  if (!linked.isFile() || linked.isSymbolicLink()) {
    fail(`${label} must be a regular non-symlink file.`, { path: requested, ref: relativeRef });
  }
  const descriptor = fs.openSync(requested, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    if (
      !before.isFile()
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs
      || BigInt(bytes.length) !== after.size
    ) {
      fail(`${label} changed while its exact bytes were read.`, { path: requested, ref: relativeRef });
    }
    return { bytes, path: requested, ref: relativeRef, sha256: sha256(bytes) };
  } finally {
    fs.closeSync(descriptor);
  }
}

function readBoundJsonReference(
  root: string,
  ref: string,
  expectedSha256: string,
  label: string,
) {
  const source = readSourceReference(root, ref, label);
  if (source.sha256 !== expectedSha256) {
    fail(`${label} digest does not match its frozen identity.`, {
      ref,
      expected_sha256: expectedSha256,
      actual_sha256: source.sha256,
    });
  }
  let value: unknown;
  try {
    value = parseJsonText(source.bytes.toString('utf8'));
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', `${label} is not valid JSON.`, {
      path: source.path,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(value)) fail(`${label} must be a JSON object.`, { path: source.path });
  return { ...source, value };
}

export function isAppStandardFreezeRequest(
  request: ReleaseBundleFreezeRequestDocument,
): request is ReleaseBundleAppStandardFreezeRequest {
  return request.identity_mode === 'app_standard_compatibility';
}

export function isAppStandardReleaseBundle(
  bundle: ReleaseBundle,
): bundle is Extract<ReleaseBundle, { identity_mode: 'app_standard_compatibility' }> {
  return bundle.identity_mode === 'app_standard_compatibility';
}

export function assertReleaseBundleFreezeInputs(request: ReleaseBundleFreezeRequestDocument, selectedSourceRoot?: string) {
  return { sourceRoot: sourceRootPath(selectedSourceRoot), identityMode: request.identity_mode,
    packageCompatibility: request.package_compatibility };
}

function assertSchema(
  schema: Record<string, unknown>,
  schemaRef: string,
  value: unknown,
) {
  assertJsonSchemaPayload({
    schemaId: String(schema.$id),
    schema,
    sourceRef: schemaRef,
  }, value);
}

function assertAssetName(name: string, track: ReleaseBundleTrackName) {
  if (
    !name
    || name === '.'
    || name === '..'
    || name.includes('/')
    || name.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(name)
  ) {
    fail('Release Bundle asset names must be bounded leaf filenames.', { track, asset_name: name });
  }
}

function assertFrozenBuildInputs(
  request: ReleaseBundleFreezeRequestDocument | ReleaseBundle,
) {
  const inputs = request.frozen_build_inputs;
  if (!inputs) return;
  const expectedIds = RELEASE_BUNDLE_APP_STANDARD_FROZEN_BUILD_INPUT_IDS;
  if (inputs.length !== expectedIds.length) {
    fail('Release Bundle frozen build inputs must contain every allowed input exactly once.', {
      expected_ids: expectedIds,
      actual_ids: inputs.map((input) => input.id),
    });
  }
  inputs.forEach((input, index) => {
    const expectedId = expectedIds[index];
    if (input.id !== expectedId) {
      fail('Release Bundle frozen build inputs must use the canonical ID order.', {
        index,
        expected_id: expectedId,
        actual_id: input.id,
      });
    }
    if (!input.ref.trim() || input.ref !== input.ref.trim()) {
      fail('Release Bundle frozen build input ref must be non-empty and canonical.', {
        input_id: input.id,
      });
    }
    if (!DIGEST.test(input.digest)) {
      fail('Release Bundle frozen build input digest must be an exact sha256 digest.', {
        input_id: input.id,
        digest: input.digest,
      });
    }
    if (!Number.isSafeInteger(input.size_bytes) || input.size_bytes <= 0) {
      fail('Release Bundle frozen build input size must be a positive safe integer.', {
        input_id: input.id,
        size_bytes: input.size_bytes,
      });
    }
  });
}

function assertPackageCompatibility(
  compatibility: ReleaseBundleAppStandardFreezeRequest['package_compatibility'],
) {
  const match = /^>=(\d+)\.(\d+)\.(\d+) <(\d+)\.(\d+)\.(\d+)$/.exec(
    compatibility.version_range,
  );
  if (!match) {
    fail('Release Bundle Package compatibility range is invalid.');
  }
  const lower = match.slice(1, 4).map(Number);
  const upper = match.slice(4, 7).map(Number);
  let comparison = 0;
  for (let index = 0; index < lower.length; index += 1) {
    if (lower[index]! === upper[index]!) continue;
    comparison = lower[index]! < upper[index]! ? -1 : 1;
    break;
  }
  if (comparison !== -1) {
    fail('Release Bundle Package compatibility range must have an increasing upper bound.');
  }
}

function assertFreezeSemantics(request: ReleaseBundleFreezeRequestDocument) {
  if (request.release.version !== request.release.display_version) {
    fail('Release Bundle version compatibility alias must equal display_version.', {
      version: request.release.version,
      display_version: request.release.display_version,
    });
  }
  if (request.release.tag !== `v${request.release.display_version}`) {
    fail('Release Bundle tag must be the exact v-prefixed display version.', {
      display_version: request.release.display_version,
      tag: request.release.tag,
    });
  }
  const expectedPrerelease = request.release.channel === 'nightly';
  if (request.release.prerelease !== expectedPrerelease) {
    fail('Release Bundle prerelease state must match the selected channel visibility.', {
      channel: request.release.channel,
      prerelease: request.release.prerelease,
      expected_prerelease: expectedPrerelease,
    });
  }
  assertPackageCompatibility(request.package_compatibility);
  const unifiedStableFlags = [
    Boolean(request.source_cutoff),
    Boolean(request.tracks.webui),
    Boolean(request.frozen_build_inputs),
  ];
  if (new Set(unifiedStableFlags).size !== 1) {
    fail('Release Bundle source cutoff and WebUI carrier track must be introduced together with frozen build inputs.', {
      source_cutoff_present: Boolean(request.source_cutoff),
      webui_track_present: Boolean(request.tracks.webui),
      frozen_build_inputs_present: Boolean(request.frozen_build_inputs),
    });
  }
  assertFrozenBuildInputs(request);
  if (request.source_cutoff) {
    assertCanonicalUtcTimestamp(
      request.source_cutoff.observed_at,
      'Release Bundle source cutoff observation',
    );

  }
  for (const track of (request.tracks.webui
    ? ['standard', 'webui', 'full'] as const
    : ['standard', 'full'] as const)) {
    const plan = request.tracks[track];
    if (!plan) fail('Release Bundle track plan is missing.', { track });
    const names = plan.required_asset_names;
    for (const name of names) assertAssetName(name, track);
    if (names.length !== new Set(names).size) {
      fail('Release Bundle track contains duplicate asset names.', { track });
    }
  }
}

export function readReleaseBundleFreezeRequest(
  filePath: string,
): ReleaseBundleFreezeRequestDocument {
  const value = readJsonObject(filePath, 'Release Bundle freeze request');
  assertSchema(
    freezeRequestSchema as Record<string, unknown>,
    RELEASE_BUNDLE_FREEZE_REQUEST_SCHEMA_REF,
    value,
  );
  const request = value as ReleaseBundleFreezeRequestDocument;
  assertFreezeSemantics(request);
  return request;
}

function normalizedTrack(
  request: ReleaseBundleFreezeRequestDocument,
  track: ReleaseBundleTrackName,
) {
  const plan = request.tracks[track];
  if (!plan) fail('Release Bundle track plan is missing.', { track });
  return {
    ...plan,
    required_asset_names: [...plan.required_asset_names].sort(),
  };
}

export function releaseBundleCore(request: ReleaseBundleFreezeRequestDocument) {
  const notesEvidence = request.prepared_notes.evidence;
  return {
    surface_kind: 'opl_release_bundle.v1' as const,
    schema_ref: RELEASE_BUNDLE_SCHEMA_REF,
    release: request.release,
    sources: request.sources,
    identity_mode: request.identity_mode,
    package_compatibility: request.package_compatibility,
    prepared_notes: {
      ...request.prepared_notes,
      markdown_sha256: sha256(request.prepared_notes.markdown),
      evidence_sha256: sha256(canonicalJsonBytes(notesEvidence)),
    },
    ...(request.source_cutoff ? { source_cutoff: request.source_cutoff } : {}),
    ...(request.frozen_build_inputs
      ? { frozen_build_inputs: request.frozen_build_inputs }
      : {}),
    tracks: {
      standard: normalizedTrack(request, 'standard'),
      ...(request.tracks.webui ? { webui: normalizedTrack(request, 'webui') } : {}),
      full: normalizedTrack(request, 'full'),
    },
    policy: {
      build_once: true as const,
      verify_and_promote_many: true as const,
      executor_neutral: true as const,
      allowed_executors: ['local', 'remote'] as ['local', 'remote'],
      prepared_notes_required_before_build: true as const,
      publish_may_generate_notes: false as const,
      latest_required_track: 'standard' as const,
      ...(request.source_cutoff ? {
        latest_required_tracks: ['standard', 'webui'] as ['standard', 'webui'],
        source_cutoff_frozen_once: true as const,
        post_freeze_remote_refresh_allowed: false as const,
        later_authority_advancement_invalidates_bundle: false as const,
        cohort_invalidation_causes: [
          'frozen_byte_or_digest_drift',
          'artifact_build_or_integrity_failure',
          'explicit_security_revocation_bound_to_frozen_ref_or_digest',
        ] as [
          'frozen_byte_or_digest_drift',
          'artifact_build_or_integrity_failure',
          'explicit_security_revocation_bound_to_frozen_ref_or_digest',
        ],
        all_other_live_currentness_drift_invalidates_bundle: false as const,
      } : {}),
      full_additive_only: true as const,
      full_updates_updater_metadata: false as const,
    },
  };
}

export function buildFrozenReleaseBundle(
  request: ReleaseBundleFreezeRequestDocument,
): ReleaseBundle {
  const core = releaseBundleCore(request);
  const bundle = {
    ...core,
    bundle_digest: sha256(canonicalJsonBytes(core)),
  };
  assertSchema(bundleSchema as Record<string, unknown>, RELEASE_BUNDLE_SCHEMA_REF, bundle);
  return bundle;
}

export function assertReleaseBundle(value: unknown): asserts value is ReleaseBundle {
  assertSchema(bundleSchema as Record<string, unknown>, RELEASE_BUNDLE_SCHEMA_REF, value);
  if (!isRecord(value)) fail('Release Bundle must be a JSON object.');
  const bundle = value as ReleaseBundle;
  const unifiedStableFlags = [
    Boolean(bundle.source_cutoff),
    Boolean(bundle.tracks.webui),
    Boolean(bundle.frozen_build_inputs),
  ];
  if (new Set(unifiedStableFlags).size !== 1) {
    fail('Frozen Release Bundle source cutoff, WebUI carrier track, and frozen build inputs must be present together.');
  }
  assertFrozenBuildInputs(bundle);
  if (bundle.source_cutoff) {
    assertCanonicalUtcTimestamp(
      bundle.source_cutoff.observed_at,
      'Frozen Release Bundle source cutoff observation',
    );
    if (
      bundle.policy.source_cutoff_frozen_once !== true
      || bundle.policy.post_freeze_remote_refresh_allowed !== false
      || bundle.policy.later_authority_advancement_invalidates_bundle !== false
      || bundle.policy.all_other_live_currentness_drift_invalidates_bundle !== false
      || canonicalJsonBytes(bundle.policy.cohort_invalidation_causes).compare(canonicalJsonBytes([
        'frozen_byte_or_digest_drift',
        'artifact_build_or_integrity_failure',
        'explicit_security_revocation_bound_to_frozen_ref_or_digest',
      ])) !== 0
      || canonicalJsonBytes(bundle.policy.latest_required_tracks).compare(
        canonicalJsonBytes(['standard', 'webui']),
      ) !== 0
    ) {
      fail('Frozen Release Bundle cutoff policy does not bind the unified Stable carrier barrier.');
    }
  }
  const { bundle_digest: digest, ...core } = bundle;
  const actual = sha256(canonicalJsonBytes(core));
  if (digest !== actual) {
    fail('Release Bundle canonical digest does not match its immutable core.', {
      expected_bundle_digest: digest,
      actual_bundle_digest: actual,
    });
  }
  const notesDigest = sha256(bundle.prepared_notes.markdown);
  const evidenceDigest = sha256(canonicalJsonBytes(bundle.prepared_notes.evidence));
  if (
    notesDigest !== bundle.prepared_notes.markdown_sha256
    || evidenceDigest !== bundle.prepared_notes.evidence_sha256
  ) {
    fail('Release Bundle prepared AI notes do not match their immutable digests.', {
      expected_markdown_sha256: bundle.prepared_notes.markdown_sha256,
      actual_markdown_sha256: notesDigest,
      expected_evidence_sha256: bundle.prepared_notes.evidence_sha256,
      actual_evidence_sha256: evidenceDigest,
    });
  }
}

export function releaseBundleCheckpointCore(checkpoint: ReleaseBundleCheckpoint) {
  const { checkpoint_digest: _checkpointDigest, ...core } = checkpoint;
  return core;
}

function assertCanonicalUtcTimestamp(value: string, label: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail(`${label} must be a canonical UTC ISO-8601 timestamp with milliseconds.`, {
      value,
    });
  }
  return milliseconds;
}

export function releaseBundleOperationControlCore(control: ReleaseBundleOperationControl) {
  const { control_digest: _controlDigest, ...core } = control;
  return core;
}

export function assertReleaseBundleOperationControl(
  value: unknown,
): asserts value is ReleaseBundleOperationControl {
  assertSchema(
    operationControlSchema as Record<string, unknown>,
    RELEASE_BUNDLE_OPERATION_CONTROL_SCHEMA_REF,
    value,
  );
  if (!isRecord(value)) fail('Release Bundle operation control must be a JSON object.');
  const control = value as ReleaseBundleOperationControl;
  const actual = sha256(canonicalJsonBytes(releaseBundleOperationControlCore(control)));
  if (control.control_digest !== actual) {
    fail('Release Bundle operation control digest does not match its canonical contents.', {
      expected_control_digest: control.control_digest,
      actual_control_digest: actual,
    });
  }
  const startedAt = assertCanonicalUtcTimestamp(
    control.operation_started_at,
    'Release Bundle operation start',
  );
  const deadlineAt = assertCanonicalUtcTimestamp(
    control.operation_deadline_at,
    'Release Bundle operation deadline',
  );
  if (deadlineAt <= startedAt) {
    fail('Release Bundle operation deadline must be after its immutable start.', {
      operation_started_at: control.operation_started_at,
      operation_deadline_at: control.operation_deadline_at,
    });
  }
  if (
    (control.operation_kind === 'standard' && control.track !== 'standard')
    || (control.operation_kind === 'append_full' && control.track !== 'full')
  ) {
    fail('Release Bundle operation control kind and track do not match.', {
      operation_kind: control.operation_kind,
      track: control.track,
    });
  }
}

export function releaseBundleUnknownOutcomeCore(marker: ReleaseBundleUnknownOutcomeMarker) {
  const { marker_digest: _markerDigest, ...core } = marker;
  return core;
}

export function assertReleaseBundleUnknownOutcomeMarker(
  value: unknown,
): asserts value is ReleaseBundleUnknownOutcomeMarker {
  assertSchema(
    unknownOutcomeSchema as Record<string, unknown>,
    RELEASE_BUNDLE_UNKNOWN_OUTCOME_SCHEMA_REF,
    value,
  );
  if (!isRecord(value)) fail('Release Bundle unknown outcome marker must be a JSON object.');
  const marker = value as ReleaseBundleUnknownOutcomeMarker;
  const actual = sha256(canonicalJsonBytes(releaseBundleUnknownOutcomeCore(marker)));
  if (marker.marker_digest !== actual) {
    fail('Release Bundle unknown outcome marker digest does not match its canonical contents.', {
      expected_marker_digest: marker.marker_digest,
      actual_marker_digest: actual,
    });
  }
  if (
    (marker.operation_kind === 'append_full' && marker.track !== 'full')
    || (marker.operation_kind !== 'append_full'
      && marker.track !== 'standard'
      && marker.track !== 'webui')
  ) {
    fail('Release Bundle unknown marker operation and track do not match.', {
      operation_kind: marker.operation_kind,
      track: marker.track,
    });
  }
  if (
    (marker.stage_operation === 'build' && marker.publication_scope !== null)
    || (marker.stage_operation === 'publish' && marker.publication_scope === null)
  ) {
    fail('Release Bundle unknown marker stage and publication scope do not match.', {
      stage_operation: marker.stage_operation,
      publication_scope: marker.publication_scope,
    });
  }
}

export function assertReleaseBundleCheckpoint(
  value: unknown,
): asserts value is ReleaseBundleCheckpoint {
  assertSchema(
    checkpointSchema as Record<string, unknown>,
    RELEASE_BUNDLE_CHECKPOINT_SCHEMA_REF,
    value,
  );
  if (!isRecord(value)) fail('Release Bundle checkpoint must be a JSON object.');
  const checkpoint = value as ReleaseBundleCheckpoint;
  const actual = sha256(canonicalJsonBytes(releaseBundleCheckpointCore(checkpoint)));
  if (checkpoint.checkpoint_digest !== actual) {
    fail('Release Bundle checkpoint digest does not match its canonical contents.', {
      expected_checkpoint_digest: checkpoint.checkpoint_digest,
      actual_checkpoint_digest: actual,
    });
  }
  for (const control of Object.values(checkpoint.operation_controls ?? {})) {
    if (control !== null) assertReleaseBundleOperationControl(control);
  }
  const controls = checkpoint.operation_controls;
  if (controls?.standard && (
    controls.standard.operation_kind !== 'standard'
    || controls.standard.track !== 'standard'
  )) {
    fail('Release Bundle checkpoint Standard control is stored in the wrong operation slot.', {
      operation_kind: controls.standard.operation_kind,
      track: controls.standard.track,
    });
  }
  if (controls?.append_full && (
    controls.append_full.operation_kind !== 'append_full'
    || controls.append_full.track !== 'full'
  )) {
    fail('Release Bundle checkpoint append_full control is stored in the wrong operation slot.', {
      operation_kind: controls.append_full.operation_kind,
      track: controls.append_full.track,
    });
  }
  for (const marker of checkpoint.active_unknown_markers ?? []) {
    assertReleaseBundleUnknownOutcomeMarker(marker);
    if (marker.bundle_digest !== checkpoint.bundle_digest) {
      fail('Release Bundle checkpoint unknown marker belongs to another Bundle.', {
        checkpoint_bundle_digest: checkpoint.bundle_digest,
        marker_bundle_digest: marker.bundle_digest,
      });
    }
    const control = controls?.[marker.operation_kind];
    const trackAllowed = marker.operation_kind === 'append_full'
      ? marker.track === 'full'
      : marker.track === 'standard' || marker.track === 'webui';
    if (!control || control.operation_id !== marker.operation_id || !trackAllowed) {
      fail('Release Bundle checkpoint unknown marker does not match its immutable operation control.', {
        marker_digest: marker.marker_digest,
        operation_id: marker.operation_id,
        operation_kind: marker.operation_kind,
        track: marker.track,
      });
    }
  }
}

export function readReleaseBundleExecutorReceipt(filePath: string): ReleaseBundleExecutorReceipt {
  const value = readJsonObject(filePath, 'Release Bundle executor receipt');
  assertSchema(
    executorReceiptSchema as Record<string, unknown>,
    RELEASE_BUNDLE_EXECUTOR_RECEIPT_SCHEMA_REF,
    value,
  );
  const receipt = value as ReleaseBundleExecutorReceipt;
  const binding = [
    receipt.release_operation,
    receipt.operation_id,
    receipt.remote_target,
    receipt.prior_attempt_id,
  ];
  if (binding.some((entry) => entry !== undefined) && binding.some((entry) => entry === undefined)) {
    fail('Release Bundle executor receipt operation binding must be supplied as one closed set.', {
      attempt_id: receipt.attempt_id,
    });
  }
  const names = receipt.assets.map((asset) => asset.name);
  if (names.length !== new Set(names).size) {
    fail('Release Bundle executor receipt contains duplicate asset names.', {
      attempt_id: receipt.attempt_id,
    });
  }
  for (const asset of receipt.assets) assertAssetName(asset.name, receipt.track);
  if (receipt.operation === 'build' && receipt.outcome === 'complete') {
    if (receipt.assets.some((asset) => typeof asset.path !== 'string' || asset.path.length === 0)) {
      fail('Complete build executor receipts require an exact local path for every asset.', {
        attempt_id: receipt.attempt_id,
      });
    }
  }
  if (receipt.operation === 'remote_inspect' && receipt.assets.some((asset) => asset.path !== undefined)) {
    fail('Remote inspection receipts must not transport local asset paths.', {
      attempt_id: receipt.attempt_id,
    });
  }
  if (receipt.publication_scope === 'external_target' && receipt.assets.length > 0) {
    fail('External target observations cannot carry Release Bundle track assets.', {
      attempt_id: receipt.attempt_id,
      remote_target: receipt.remote_target,
    });
  }
  return receipt;
}

export function assertOperationReceipt(receipt: ReleaseBundleOperationReceipt) {
  assertSchema(
    operationReceiptSchema as Record<string, unknown>,
    RELEASE_BUNDLE_OPERATION_RECEIPT_SCHEMA_REF,
    receipt,
  );
}

export function releaseBundleOperationEventCore(event: ReleaseBundleOperationEvent) {
  const {
    event_id: _eventId,
    event_idempotency_key: _eventIdempotencyKey,
    ...core
  } = event;
  return core;
}

export function assertReleaseBundleOperationEvent(
  value: unknown,
): asserts value is ReleaseBundleOperationEvent {
  assertSchema(
    operationEventSchema as Record<string, unknown>,
    RELEASE_BUNDLE_OPERATION_EVENT_SCHEMA_REF,
    value,
  );
  const event = value as ReleaseBundleOperationEvent;
  const digest = sha256(canonicalJsonBytes(releaseBundleOperationEventCore(event)));
  if (event.event_id !== digest || event.event_idempotency_key !== digest) {
    fail('Release Bundle operation event identity does not match its canonical contents.', {
      expected_event_id: event.event_id,
      expected_idempotency_key: event.event_idempotency_key,
      actual_event_id: digest,
    });
  }
}

export function releaseBundleConsumerEnvelopeCore(envelope: ReleaseBundleConsumerEnvelope) {
  const { envelope_digest: _envelopeDigest, ...core } = envelope;
  return core;
}

export function assertReleaseBundleConsumerEnvelope(
  value: unknown,
): asserts value is ReleaseBundleConsumerEnvelope {
  assertSchema(
    consumerEnvelopeSchema as Record<string, unknown>,
    RELEASE_BUNDLE_CONSUMER_ENVELOPE_SCHEMA_REF,
    value,
  );
  const envelope = value as ReleaseBundleConsumerEnvelope;
  const digest = sha256(canonicalJsonBytes(releaseBundleConsumerEnvelopeCore(envelope)));
  if (envelope.envelope_digest !== digest) {
    fail('Release Bundle consumer envelope digest does not match its canonical contents.', {
      expected_envelope_digest: envelope.envelope_digest,
      actual_envelope_digest: digest,
    });
  }
  if (
    envelope.operation
    && (
      (envelope.track === 'standard' && envelope.operation.operation_kind !== 'standard')
      || (envelope.track === 'full' && envelope.operation.operation_kind !== 'append_full')
    )
  ) {
    fail('Release Bundle consumer envelope track and operation kind do not match.', {
      track: envelope.track,
      operation_kind: envelope.operation.operation_kind,
    });
  }
}

export function readReleaseBundleQualificationReceipt(
  filePath: string,
): ReleaseBundleQualificationReceipt {
  const value = readJsonObject(filePath, 'Release Bundle qualification receipt');
  assertSchema(
    qualificationReceiptSchema as Record<string, unknown>,
    RELEASE_BUNDLE_QUALIFICATION_RECEIPT_SCHEMA_REF,
    value,
  );
  return value as ReleaseBundleQualificationReceipt;
}

export function assertBundleDigest(value: string) {
  if (!DIGEST.test(value)) {
    fail('Release Bundle digest must be an exact sha256:<lowercase-hex> ref.', {
      bundle_digest: value,
    });
  }
}
