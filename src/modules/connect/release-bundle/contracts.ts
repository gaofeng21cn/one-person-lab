import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import bundleSchema from '../../../../contracts/opl-framework/release-bundle.schema.json' with { type: 'json' };
import executorReceiptSchema from '../../../../contracts/opl-framework/release-bundle-executor-receipt.schema.json' with { type: 'json' };
import freezeRequestSchema from '../../../../contracts/opl-framework/release-bundle-freeze-request.schema.json' with { type: 'json' };
import operationReceiptSchema from '../../../../contracts/opl-framework/release-bundle-operation-receipt.schema.json' with { type: 'json' };
import qualificationReceiptSchema from '../../../../contracts/opl-framework/release-bundle-qualification-receipt.schema.json' with { type: 'json' };
import ownerCohortLockSchema from '../../../../contracts/opl-framework/package-owner-cohort-lock.schema.json' with { type: 'json' };
import releaseSetSchema from '../../../../contracts/opl-framework/release-set-v2.schema.json' with { type: 'json' };
import { canonicalJsonBytes } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { assertJsonSchemaPayload } from '../../../kernel/schema-registry.ts';
import {
  RELEASE_BUNDLE_PACKAGE_IDS,
  type ReleaseBundle,
  type ReleaseBundleExecutorReceipt,
  type ReleaseBundleFreezeRequest,
  type ReleaseBundleOperationReceipt,
  type ReleaseBundleQualificationReceipt,
  type ReleaseBundleTrackName,
} from './types.ts';

export const RELEASE_BUNDLE_SCHEMA_REF =
  'contracts/opl-framework/release-bundle.schema.json' as const;
export const RELEASE_BUNDLE_FREEZE_REQUEST_SCHEMA_REF =
  'contracts/opl-framework/release-bundle-freeze-request.schema.json' as const;
export const RELEASE_BUNDLE_EXECUTOR_RECEIPT_SCHEMA_REF =
  'contracts/opl-framework/release-bundle-executor-receipt.schema.json' as const;
export const RELEASE_BUNDLE_OPERATION_RECEIPT_SCHEMA_REF =
  'contracts/opl-framework/release-bundle-operation-receipt.schema.json' as const;
export const RELEASE_BUNDLE_QUALIFICATION_RECEIPT_SCHEMA_REF =
  'contracts/opl-framework/release-bundle-qualification-receipt.schema.json' as const;

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

function releaseSetObject(value: Record<string, unknown>) {
  const candidate = value.surface_kind === 'opl_release_set.v2' ? value : value.release_set;
  if (!isRecord(candidate) || candidate.surface_kind !== 'opl_release_set.v2') {
    fail('Framework Release Set manifest must expose opl_release_set.v2.');
  }
  return candidate;
}

function requireRecord(value: unknown, label: string) {
  if (!isRecord(value)) fail(`${label} must be an object.`);
  return value;
}

export function assertReleaseBundleFreezeInputs(
  request: ReleaseBundleFreezeRequest,
  selectedSourceRoot?: string,
) {
  const root = sourceRootPath(selectedSourceRoot);
  const releaseSetSource = readBoundJsonReference(
    root,
    request.framework_release_set.manifest_ref,
    request.framework_release_set.digest,
    'Framework Release Set manifest',
  );
  const releaseSet = releaseSetObject(releaseSetSource.value);
  assertSchema(
    releaseSetSchema as Record<string, unknown>,
    'contracts/opl-framework/release-set-v2.schema.json',
    releaseSet,
  );
  if (releaseSet.generation !== request.framework_release_set.generation) {
    fail('Framework Release Set generation does not match the freeze request.', {
      expected_generation: request.framework_release_set.generation,
      actual_generation: releaseSet.generation,
    });
  }
  const components = requireRecord(releaseSet.components, 'Framework Release Set components');
  const base = requireRecord(components.base, 'Framework Release Set base component');
  const app = requireRecord(components.app, 'Framework Release Set app component');
  const packageCollection = requireRecord(
    components.packages,
    'Framework Release Set package collection',
  );
  const members = requireRecord(
    packageCollection.members,
    'Framework Release Set package members',
  );
  if (
    base.source_commit !== null
    && base.source_commit !== request.sources.framework.source_commit
  ) {
    fail('Framework Release Set base source differs from the Bundle Framework source.', {
      release_set_source_commit: base.source_commit,
      bundle_source_commit: request.sources.framework.source_commit,
    });
  }
  if (app.source_commit !== null && app.source_commit !== request.sources.app.source_commit) {
    fail('Framework Release Set App source differs from the Bundle App source.', {
      release_set_source_commit: app.source_commit,
      bundle_source_commit: request.sources.app.source_commit,
    });
  }

  const cohortBinding = requireRecord(
    releaseSet.owner_cohort_lock,
    'Framework Release Set owner cohort lock binding',
  );
  if (
    cohortBinding.surface_kind !== 'opl_package_owner_cohort_lock.v1'
    || typeof cohortBinding.ref !== 'string'
    || typeof cohortBinding.digest !== 'string'
  ) {
    fail('Framework Release Set owner cohort lock binding is invalid.');
  }
  const cohortRef = path.posix.join(
    path.posix.dirname(request.framework_release_set.manifest_ref),
    cohortBinding.ref,
  );
  const cohortSource = readBoundJsonReference(
    root,
    cohortRef,
    cohortBinding.digest,
    'Framework Release Set owner cohort lock',
  );
  if (cohortSource.value.surface_kind !== 'opl_package_owner_cohort_lock.v1') {
    fail('Framework Release Set owner cohort lock surface is invalid.');
  }
  assertSchema(
    ownerCohortLockSchema as Record<string, unknown>,
    'contracts/opl-framework/package-owner-cohort-lock.schema.json',
    cohortSource.value,
  );
  const cohortPackages = requireRecord(
    cohortSource.value.packages,
    'Framework Release Set owner cohort packages',
  );

  const verifiedPackages: Record<string, unknown> = {};
  for (const packageId of RELEASE_BUNDLE_PACKAGE_IDS) {
    const identity = request.packages[packageId];
    const expectedManifestRef = `contracts/opl-framework/packages/${packageId}.json`;
    if (identity.manifest_ref !== expectedManifestRef) {
      fail('Release Bundle Package manifest ref is not canonical.', {
        package_id: packageId,
        expected_manifest_ref: expectedManifestRef,
        actual_manifest_ref: identity.manifest_ref,
      });
    }
    const manifestSource = readBoundJsonReference(
      root,
      identity.manifest_ref,
      identity.manifest_sha256,
      `Release Bundle Package manifest ${packageId}`,
    );
    const manifest = manifestSource.value;
    const codexSurface = requireRecord(
      manifest.codex_surface,
      `Release Bundle Package codex surface ${packageId}`,
    );
    if (
      manifest.package_id !== packageId
      || manifest.version !== identity.version
      || (manifest.source_commit ?? codexSurface.carrier_source_commit)
        !== identity.owner_source_commit
    ) {
      fail('Release Bundle Package manifest identity differs from the freeze request.', {
        package_id: packageId,
      });
    }
    if (typeof codexSurface.plugin_payload_manifest_url !== 'string') {
      fail('Release Bundle Package manifest has no payload manifest ref.', {
        package_id: packageId,
      });
    }
    const expectedPayloadRef = path.posix.join(
      path.posix.dirname(identity.manifest_ref),
      codexSurface.plugin_payload_manifest_url,
    );
    if (identity.payload_manifest_ref !== expectedPayloadRef) {
      fail('Release Bundle Package payload ref differs from its manifest.', {
        package_id: packageId,
        expected_payload_manifest_ref: expectedPayloadRef,
        actual_payload_manifest_ref: identity.payload_manifest_ref,
      });
    }
    const payloadSource = readBoundJsonReference(
      root,
      identity.payload_manifest_ref,
      identity.payload_manifest_sha256,
      `Release Bundle Package payload manifest ${packageId}`,
    );
    const payload = payloadSource.value;
    if (
      payload.surface_kind !== 'opl_package_payload_manifest.v2'
      || payload.package_id !== packageId
      || payload.package_version !== identity.version
      || payload.source_commit !== identity.owner_source_commit
    ) {
      fail('Release Bundle Package payload identity differs from the freeze request.', {
        package_id: packageId,
      });
    }
    const cohortEntry = requireRecord(
      cohortPackages[packageId],
      `Framework Release Set owner cohort entry ${packageId}`,
    );
    const releaseSetMember = requireRecord(
      members[packageId],
      `Framework Release Set member ${packageId}`,
    );
    const expectedMember = {
      version: identity.version,
      source_commit: identity.owner_source_commit,
      manifest_ref: identity.manifest_ref,
      manifest_sha256: identity.manifest_sha256,
      payload_manifest_ref: identity.payload_manifest_ref,
      payload_manifest_sha256: identity.payload_manifest_sha256,
    };
    if (
      cohortEntry.package_id !== packageId
      || cohortEntry.source_commit !== identity.owner_source_commit
      || Object.entries(expectedMember).some(([field, expected]) => releaseSetMember[field] !== expected)
    ) {
      fail('Framework Release Set does not transitively bind the Package identity.', {
        package_id: packageId,
        expected_member: expectedMember,
      });
    }
    verifiedPackages[packageId] = {
      manifest_path: manifestSource.path,
      manifest_sha256: manifestSource.sha256,
      payload_manifest_path: payloadSource.path,
      payload_manifest_sha256: payloadSource.sha256,
      owner_source_commit: identity.owner_source_commit,
    };
  }
  return {
    sourceRoot: root,
    releaseSetPath: releaseSetSource.path,
    releaseSetSha256: releaseSetSource.sha256,
    ownerCohortLockPath: cohortSource.path,
    ownerCohortLockSha256: cohortSource.sha256,
    packages: verifiedPackages,
  };
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

function assertFreezeSemantics(request: ReleaseBundleFreezeRequest) {
  if (request.release.tag !== `v${request.release.version}`) {
    fail('Release Bundle tag must be the exact v-prefixed release version.', {
      version: request.release.version,
      tag: request.release.tag,
    });
  }
  if (request.release.prerelease !== (request.release.channel === 'nightly')) {
    fail('Release Bundle prerelease state must match the selected channel.', {
      channel: request.release.channel,
      prerelease: request.release.prerelease,
    });
  }
  for (const packageId of RELEASE_BUNDLE_PACKAGE_IDS) {
    if (request.packages[packageId].package_id !== packageId) {
      fail('Release Bundle package map key does not match package identity.', {
        package_id: packageId,
        declared_package_id: request.packages[packageId].package_id,
      });
    }
  }
  for (const track of ['standard', 'full'] as const) {
    const names = request.tracks[track].required_asset_names;
    for (const name of names) assertAssetName(name, track);
    if (names.length !== new Set(names).size) {
      fail('Release Bundle track contains duplicate asset names.', { track });
    }
  }
}

export function readReleaseBundleFreezeRequest(filePath: string): ReleaseBundleFreezeRequest {
  const value = readJsonObject(filePath, 'Release Bundle freeze request');
  assertSchema(
    freezeRequestSchema as Record<string, unknown>,
    RELEASE_BUNDLE_FREEZE_REQUEST_SCHEMA_REF,
    value,
  );
  const request = value as ReleaseBundleFreezeRequest;
  assertFreezeSemantics(request);
  return request;
}

function normalizedTrack(request: ReleaseBundleFreezeRequest, track: ReleaseBundleTrackName) {
  return {
    ...request.tracks[track],
    required_asset_names: [...request.tracks[track].required_asset_names].sort(),
  };
}

export function releaseBundleCore(request: ReleaseBundleFreezeRequest) {
  const notesEvidence = request.prepared_notes.evidence;
  return {
    surface_kind: 'opl_release_bundle.v1' as const,
    schema_ref: RELEASE_BUNDLE_SCHEMA_REF,
    release: request.release,
    sources: request.sources,
    framework_release_set: request.framework_release_set,
    packages: request.packages,
    prepared_notes: {
      ...request.prepared_notes,
      markdown_sha256: sha256(request.prepared_notes.markdown),
      evidence_sha256: sha256(canonicalJsonBytes(notesEvidence)),
    },
    tracks: {
      standard: normalizedTrack(request, 'standard'),
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
      full_additive_only: true as const,
      full_updates_updater_metadata: false as const,
    },
  };
}

export function buildFrozenReleaseBundle(request: ReleaseBundleFreezeRequest): ReleaseBundle {
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

export function readReleaseBundleExecutorReceipt(filePath: string): ReleaseBundleExecutorReceipt {
  const value = readJsonObject(filePath, 'Release Bundle executor receipt');
  assertSchema(
    executorReceiptSchema as Record<string, unknown>,
    RELEASE_BUNDLE_EXECUTOR_RECEIPT_SCHEMA_REF,
    value,
  );
  const receipt = value as ReleaseBundleExecutorReceipt;
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
  return receipt;
}

export function assertOperationReceipt(receipt: ReleaseBundleOperationReceipt) {
  assertSchema(
    operationReceiptSchema as Record<string, unknown>,
    RELEASE_BUNDLE_OPERATION_RECEIPT_SCHEMA_REF,
    receipt,
  );
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
