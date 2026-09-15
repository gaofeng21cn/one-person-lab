import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { repoRoot, runCliFailureInCwd, runCliInCwd } from '../../helpers.ts';
import { canonicalJsonBytes } from '../../../../../src/kernel/canonical-json.ts';
import { FrameworkContractError } from '../../../../../src/kernel/contract-validation.ts';
import { parseJsonText } from '../../../../../src/kernel/json-file.ts';

import {
  admitReleaseBundleOperation,
  buildReleaseBundle as buildReleaseBundleAuthority,
  buildReleaseBundleConsumerEnvelope,
  exportReleaseBundleCheckpoint,
  freezeReleaseBundle,
  importReleaseBundleCheckpoint,
  publishReleaseBundle as publishReleaseBundleAuthority,
  readReleaseBundleEvents,
  readReleaseBundleStatus,
  reconcileReleaseBundle as reconcileReleaseBundleAuthority,
  verifyReleaseBundle as verifyReleaseBundleAuthority,
  type ReleaseBundle,
  type ReleaseBundleOperationInvocation,
} from '../../../../../src/adapters/integration/release-bundle/index.ts';
import {
  releaseBundleStorePaths,
  withReleaseBundleStateLock,
} from '../../../../../src/adapters/integration/release-bundle/store.ts';

const standardOperation = {
  releaseOperation: 'standard' as const,
  operationId: 'operation-standard-1',
  operationStartedAt: '2026-07-21T00:00:00.000Z',
  operationDeadlineAt: '2099-07-21T01:30:00.000Z',
};

const appendFullOperation = {
  releaseOperation: 'append_full' as const,
  operationId: 'operation-append-full-1',
  operationStartedAt: '2026-07-21T02:00:00.000Z',
  operationDeadlineAt: '2099-07-21T02:50:00.000Z',
};

type MutableCheckpointFixture = {
  checkpoint_digest: string;
  bundle_digest: string;
  tracks: Record<'standard' | 'webui' | 'full', {
    built: boolean;
    verified: boolean;
    asset_names: string[];
    asset_manifest_path: string | null;
    asset_manifest_sha256: string | null;
    qualification_receipt_path: string | null;
    qualification_receipt_sha256: string | null;
  }>;
  entries: Array<{
    path: string;
    role: string;
    track: 'standard' | 'webui' | 'full' | null;
    asset_name: string | null;
    size_bytes: number;
    sha256: string;
  }>;
  active_unknown_markers?: Array<{
    marker_digest: string;
    prior_mutation_attempt_id: string;
  }>;
  operation_controls?: {
    standard: ({ control_digest: string; operation_id: string } & Record<string, unknown>) | null;
    append_full: ({ control_digest: string; operation_id: string } & Record<string, unknown>) | null;
  };
} & Record<string, unknown>;

type OptionalOperationInput<T> = Omit<T, keyof ReleaseBundleOperationInvocation>
  & Partial<ReleaseBundleOperationInvocation>;

function buildReleaseBundle(
  input: OptionalOperationInput<Parameters<typeof buildReleaseBundleAuthority>[0]>,
) {
  return buildReleaseBundleAuthority({ ...standardOperation, ...input } as Parameters<
    typeof buildReleaseBundleAuthority
  >[0]);
}

function verifyReleaseBundle(
  input: OptionalOperationInput<Parameters<typeof verifyReleaseBundleAuthority>[0]>,
) {
  return verifyReleaseBundleAuthority({ ...standardOperation, ...input } as Parameters<
    typeof verifyReleaseBundleAuthority
  >[0]);
}

function publishReleaseBundle(
  input: OptionalOperationInput<Parameters<typeof publishReleaseBundleAuthority>[0]>,
) {
  return publishReleaseBundleAuthority({ ...standardOperation, ...input } as Parameters<
    typeof publishReleaseBundleAuthority
  >[0]);
}

function reconcileReleaseBundle(
  input: OptionalOperationInput<Parameters<typeof reconcileReleaseBundleAuthority>[0]>,
) {
  return reconcileReleaseBundleAuthority({ ...standardOperation, ...input } as Parameters<
    typeof reconcileReleaseBundleAuthority
  >[0]);
}

const packageIds = [
  'mas',
  'mag',
  'rca',
  'oma',
  'obf',
  'mas-scholar-skills',
  'opl-flow',
] as const;

function digest(value: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function writeJson(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const source = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(filePath, source, 'utf8');
  return digest(source);
}

function readCheckpointFixture(filePath: string) {
  return parseJsonText(fs.readFileSync(filePath, 'utf8')) as MutableCheckpointFixture;
}

function fixtureRequest(
  sourceRoot: string,
  standardAssetNames = ['standard.dmg', 'latest.yml'],
  additionalPackageIds: readonly string[] = [],
) {
  fs.mkdirSync(sourceRoot, { recursive: true });
  const sourceSha = '1'.repeat(40);
  return {
    surface_kind: 'opl_release_bundle_freeze_request.v1',
    schema_ref: 'contracts/opl-framework/release-bundle-freeze-request.schema.json',
    release: {
      channel: 'stable',
      version: '26.7.20',
      display_version: '26.7.20',
      updater_version: '26.7.20',
      tag: 'v26.7.20',
      prerelease: false,
    },
    sources: {
      app: { repo: 'one-person-lab-app', source_commit: sourceSha },
      shell: { repo: 'opl-aion-shell', source_commit: '2'.repeat(40) },
      framework: { repo: 'one-person-lab', source_commit: '3'.repeat(40) },
    },
    identity_mode: 'app_standard_compatibility' as const,
    package_compatibility: { abi: 'opl_packages.v1' as const, version_range: '>=0.1.0 <1.0.0' },
    prepared_notes: {
      source: 'prepared_ai',
      format: 'markdown',
      markdown: '# One Person Lab v26.7.20\n\nPrepared before the build.\n',
      evidence: {
        surface_kind: 'opl_app_release_notes_evidence.v1',
        model: 'fixture-ai',
      },
    },
    tracks: {
      standard: {
        required_asset_names: standardAssetNames,
        required_for_latest: true,
        additive_only: false,
        updater_metadata_allowed: true,
      },
      full: {
        required_asset_names: ['full.dmg', 'full-manifest.json'],
        required_for_latest: false,
        additive_only: true,
        updater_metadata_allowed: false,
      },
    },
  };
}

function unifiedStableRequest(sourceRoot: string, additionalPackageIds: readonly string[] = []) {
  const request = fixtureRequest(sourceRoot, undefined, additionalPackageIds);
  const baseImageDigest = digest('webui-base-image');
  return {
    ...request,
    source_cutoff: {
      observed_at: '2026-07-21T00:00:00.000Z',
      policy: 'single_read_at_freeze_admission' as const,
      post_freeze_remote_refresh_allowed: false as const,
      later_authority_advancement_invalidates_bundle: false as const,
    },
    frozen_build_inputs: [
      {
        id: 'app_source' as const,
        ref: request.sources.app.source_commit,
        digest: digest('app-source-archive'),
        size_bytes: 101,
      },
      {
        id: 'base_image' as const,
        ref: `docker.io/library/node@${baseImageDigest}`,
        digest: baseImageDigest,
        size_bytes: 102,
      },
      {
        id: 'codex_cli' as const,
        ref: '@openai/codex@1.2.3',
        digest: digest('codex-cli-tarball'),
        size_bytes: 103,
      },
      {
        id: 'dockerfile' as const,
        ref: 'shells/aionui/Dockerfile',
        digest: digest('webui-dockerfile'),
        size_bytes: 104,
      },
      {
        id: 'framework_seed' as const,
        ref: request.sources.framework.source_commit,
        digest: digest('framework-seed'),
        size_bytes: 106,
      },
      {
        id: 'qualification_harness' as const,
        ref: 'scripts/validate-webui-runtime-image.ts',
        digest: digest('qualification-harness'),
        size_bytes: 108,
      },
      {
        id: 'shell_webui_source' as const,
        ref: request.sources.shell.source_commit,
        digest: digest('shell-webui-source-archive'),
        size_bytes: 109,
      },
    ],
    tracks: {
      standard: request.tracks.standard,
      webui: {
        required_asset_names: ['webui-carrier-manifest.json'],
        required_for_latest: true,
        additive_only: false,
        updater_metadata_allowed: false,
      },
      full: request.tracks.full,
    },
  };
}

function appStandardRequest(sourceRoot: string) { return unifiedStableRequest(sourceRoot); }

type QualificationBundle =
  | ReturnType<typeof fixtureRequest>
  | ReturnType<typeof appStandardRequest>
  | ReleaseBundle;

function isAppStandardFixtureRequest(
  request: QualificationBundle,
): request is Extract<QualificationBundle, { identity_mode: 'app_standard_compatibility' }> {
  return 'identity_mode' in request
    && request.identity_mode === 'app_standard_compatibility';
}

function writeQualification(input: {
  root: string;
  bundle: QualificationBundle;
  bundleDigest: string;
  track?: 'standard' | 'webui' | 'full';
  subject?: { name: string; bytes: string };
}) {
  const track = input.track ?? 'standard';
  const subject = input.subject ?? (track === 'standard'
    ? { name: 'standard.dmg', bytes: 'standard dmg' }
    : track === 'webui'
      ? { name: 'webui-carrier-manifest.json', bytes: '{"digest":"sha256:webui"}' }
      : { name: 'full.dmg', bytes: 'full dmg' });
  const packageBinding = { identity_mode: input.bundle.identity_mode,
    package_compatibility: input.bundle.package_compatibility };
  const receiptPath = path.join(input.root, `${track}-qualification.json`);
  writeJson(receiptPath, {
    surface_kind: 'opl_release_bundle_qualification_receipt.v1',
    schema_ref: 'contracts/opl-framework/release-bundle-qualification-receipt.schema.json',
    bundle_digest: input.bundleDigest,
    track,
    subject: {
      asset_name: subject.name,
      size_bytes: Buffer.byteLength(subject.bytes),
      sha256: digest(subject.bytes),
    },
    cohort: {
      app_sha: input.bundle.sources.app.source_commit,
      shell_sha: input.bundle.sources.shell.source_commit,
      framework_sha: input.bundle.sources.framework.source_commit,
      ...packageBinding,
    },
    qualification: {
      kind: 'installed_artifact',
      result: 'passed',
      installed_artifact_same_bytes: true,
      harness_sha256: digest('qualification-harness'),
      evidence_refs: ['file:///tmp/clean-vm-receipt.json'],
    },
  });
  return receiptPath;
}

function createFixture(options: {
  admitStandard?: boolean;
  standardAssetNames?: string[];
  additionalPackageIds?: readonly string[];
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-bundle-'));
  const sourceRoot = path.join(root, 'source');
  const storeRoot = path.join(root, 'store');
  const requestPath = path.join(root, 'freeze.json');
  const request = fixtureRequest(
    sourceRoot,
    options.standardAssetNames,
    options.additionalPackageIds,
  );
  writeJson(requestPath, request);
  const frozen = freezeReleaseBundle({ requestPath, sourceRoot, storeRoot });
  if (options.admitStandard !== false) {
    admitReleaseBundleOperation({
      bundleDigest: frozen.release_bundle_freeze.bundle_digest,
      storeRoot,
      ...standardOperation,
    });
  }
  return { root, sourceRoot, storeRoot, requestPath, request, frozen };
}

function createUnifiedStableFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-unified-stable-bundle-'));
  const sourceRoot = path.join(root, 'source');
  const storeRoot = path.join(root, 'store');
  const requestPath = path.join(root, 'freeze.json');
  const request = unifiedStableRequest(sourceRoot);
  writeJson(requestPath, request);
  const frozen = freezeReleaseBundle({ requestPath, sourceRoot, storeRoot });
  admitReleaseBundleOperation({
    bundleDigest: frozen.release_bundle_freeze.bundle_digest,
    storeRoot,
    ...standardOperation,
  });
  return { root, sourceRoot, storeRoot, requestPath, request, frozen };
}

function writeBuildReceipt(input: {
  root: string;
  bundleDigest: string;
  track?: 'standard' | 'webui' | 'full';
  executor?: 'local' | 'remote';
  attemptId?: string;
  outcome?: 'complete' | 'unknown';
  assets?: Array<{ name: string; bytes: string }>;
  releaseOperation?: 'standard' | 'resume_standard' | 'append_full';
  operationId?: string;
  remoteTarget?: string;
  priorAttemptId?: string | null;
}) {
  const track = input.track ?? 'standard';
  const outcome = input.outcome ?? 'complete';
  const receiptPath = path.join(input.root, `${track}-${input.attemptId ?? 'build'}.json`);
  const assets = outcome === 'unknown' ? [] : (input.assets ?? (
    track === 'standard'
      ? [{ name: 'standard.dmg', bytes: 'standard dmg' }, { name: 'latest.yml', bytes: 'updater' }]
      : track === 'webui'
        ? [{ name: 'webui-carrier-manifest.json', bytes: '{"digest":"sha256:webui"}' }]
        : [{ name: 'full.dmg', bytes: 'full dmg' }, { name: 'full-manifest.json', bytes: '{}' }]
  )).map((asset) => {
    const assetPath = path.join(input.root, `${input.attemptId ?? 'build'}-${asset.name}`);
    fs.writeFileSync(assetPath, asset.bytes);
    return {
      name: asset.name,
      path: assetPath,
      size_bytes: Buffer.byteLength(asset.bytes),
      sha256: digest(asset.bytes),
    };
  });
  writeJson(receiptPath, {
    surface_kind: 'opl_release_bundle_executor_receipt.v1',
    schema_ref: 'contracts/opl-framework/release-bundle-executor-receipt.schema.json',
    operation: 'build',
    executor: input.executor ?? 'local',
    attempt_id: input.attemptId ?? 'build-1',
    bundle_digest: input.bundleDigest,
    track,
    outcome,
    assets,
    release_operation: input.releaseOperation ?? (track === 'full' ? 'append_full' : 'standard'),
    operation_id: input.operationId ?? (track === 'full'
      ? appendFullOperation.operationId
      : standardOperation.operationId),
    remote_target: input.remoteTarget ?? `executor:${input.executor ?? 'local'}-${track}`,
    prior_attempt_id: input.priorAttemptId ?? null,
  });
  return receiptPath;
}

function writeRemoteInspection(input: {
  root: string;
  bundleDigest: string;
  track?: 'standard' | 'webui' | 'full';
  executor?: 'local' | 'remote';
  attemptId: string;
  outcome?: 'complete' | 'unknown';
  assets?: Array<{ name: string; bytes: string }>;
  releaseOperation?: 'standard' | 'resume_standard' | 'append_full';
  operationId?: string;
  remoteTarget?: string;
  priorAttemptId?: string | null;
  publicationScope?: 'track_assets' | 'external_target';
}) {
  const receiptPath = path.join(input.root, `${input.attemptId}.json`);
  writeJson(receiptPath, {
    surface_kind: 'opl_release_bundle_executor_receipt.v1',
    schema_ref: 'contracts/opl-framework/release-bundle-executor-receipt.schema.json',
    operation: 'remote_inspect',
    executor: input.executor ?? 'local',
    attempt_id: input.attemptId,
    bundle_digest: input.bundleDigest,
    track: input.track ?? 'standard',
    outcome: input.outcome ?? 'complete',
    release_operation: input.releaseOperation ?? (input.track === 'full' ? 'append_full' : 'standard'),
    operation_id: input.operationId ?? (input.track === 'full'
      ? appendFullOperation.operationId
      : standardOperation.operationId),
    remote_target: input.remoteTarget ?? `github-release:fixture/${input.track ?? 'standard'}`,
    prior_attempt_id: input.priorAttemptId ?? null,
    ...(input.publicationScope ? { publication_scope: input.publicationScope } : {}),
    assets: input.outcome === 'unknown' ? [] : (input.assets ?? []).map((asset) => ({
      name: asset.name,
      size_bytes: Buffer.byteLength(asset.bytes),
      sha256: digest(asset.bytes),
    })),
  });
  return receiptPath;
}

function assertTypedContractFailure(action: () => unknown, message: RegExp) {
  assert.throws(action, (error: unknown) => {
    assert.equal(error instanceof FrameworkContractError, true);
    assert.equal((error as FrameworkContractError).code, 'contract_shape_invalid');
    assert.match((error as Error).message, message);
    return true;
  });
}

export {
  assert,
  spawnSync,
  crypto,
  fs,
  os,
  path,
  test,
  pathToFileURL,
  repoRoot,
  runCliFailureInCwd,
  runCliInCwd,
  canonicalJsonBytes,
  FrameworkContractError,
  parseJsonText,
  admitReleaseBundleOperation,
  buildReleaseBundleAuthority,
  buildReleaseBundleConsumerEnvelope,
  exportReleaseBundleCheckpoint,
  freezeReleaseBundle,
  importReleaseBundleCheckpoint,
  publishReleaseBundleAuthority,
  readReleaseBundleEvents,
  readReleaseBundleStatus,
  reconcileReleaseBundleAuthority,
  verifyReleaseBundleAuthority,
  releaseBundleStorePaths,
  withReleaseBundleStateLock,
  standardOperation,
  appendFullOperation,
  buildReleaseBundle,
  verifyReleaseBundle,
  publishReleaseBundle,
  reconcileReleaseBundle,
  packageIds,
  digest,
  writeJson,
  readCheckpointFixture,
  fixtureRequest,
  unifiedStableRequest,
  appStandardRequest,
  isAppStandardFixtureRequest,
  writeQualification,
  createFixture,
  createUnifiedStableFixture,
  writeBuildReceipt,
  writeRemoteInspection,
  assertTypedContractFailure,
};

export type {
  ReleaseBundleOperationInvocation,
  MutableCheckpointFixture,
  OptionalOperationInput,
};
