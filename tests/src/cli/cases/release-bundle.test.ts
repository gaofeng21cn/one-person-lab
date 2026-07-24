import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { repoRoot, runCliFailureInCwd, runCliInCwd } from '../helpers.ts';
import { canonicalJsonBytes } from '../../../../src/kernel/canonical-json.ts';
import { FrameworkContractError } from '../../../../src/kernel/contract-validation.ts';
import { parseJsonText } from '../../../../src/kernel/json-file.ts';

import {
  admitReleaseBundleOperation,
  buildReleaseBundle as buildReleaseBundleAuthority,
  exportReleaseBundleCheckpoint,
  freezeReleaseBundle,
  importReleaseBundleCheckpoint,
  publishReleaseBundle as publishReleaseBundleAuthority,
  readReleaseBundleStatus,
  reconcileReleaseBundle as reconcileReleaseBundleAuthority,
  verifyReleaseBundle as verifyReleaseBundleAuthority,
  type ReleaseBundleOperationInvocation,
} from '../../../../src/modules/connect/release-bundle/index.ts';
import {
  releaseBundleStorePaths,
  withReleaseBundleStateLock,
} from '../../../../src/modules/connect/release-bundle/store.ts';

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
) {
  const sourceSha = '1'.repeat(40);
  const repoNames = {
    mas: 'med-autoscience',
    mag: 'med-autogrant',
    rca: 'redcube-ai',
    oma: 'opl-meta-agent',
    obf: 'opl-bookforge',
    'mas-scholar-skills': 'mas-scholar-skills',
    'opl-flow': 'opl-flow',
  } as const;
  const packages = Object.fromEntries(packageIds.map((packageId, index) => {
    const version = `0.${index + 1}.0`;
    const ownerSourceCommit = ['4', '5', '6', '7', '8', '9', 'a'][index].repeat(40);
    const manifestRef = `contracts/opl-framework/packages/${packageId}.json`;
    const payloadManifestRef = `contracts/opl-framework/packages/payloads/${packageId}-${version}.json`;
    const payloadLeafRef = `payloads/${packageId}-${version}.json`;
    const manifestSha256 = writeJson(path.join(sourceRoot, manifestRef), {
      surface_kind: 'opl_agent_package_manifest.v1',
      package_id: packageId,
      version,
      source: 'first_party',
      codex_surface: {
        carrier_source_commit: ownerSourceCommit,
        plugin_payload_manifest_url: payloadLeafRef,
      },
    });
    const payloadManifestSha256 = writeJson(path.join(sourceRoot, payloadManifestRef), {
      surface_kind: 'opl_package_payload_manifest.v2',
      schema_ref: 'contracts/opl-framework/package-payload-manifest-v2.schema.json',
      package_id: packageId,
      plugin_id: packageId,
      package_version: version,
      source_repo: `https://github.com/gaofeng21cn/${repoNames[packageId]}.git`,
      source_commit: ownerSourceCommit,
      source_root: '.',
      content_lock: {
        algorithm: 'sha256',
        canonicalization: 'ordered_path_length_file_length_bytes',
        digest: digest(`content:${packageId}`),
      },
      files: [{
        path: '.codex-plugin/plugin.json',
        mode: '100644',
        source_url: `https://raw.githubusercontent.com/gaofeng21cn/${repoNames[packageId]}/${ownerSourceCommit}/.codex-plugin/plugin.json`,
        sha256: digest(`plugin:${packageId}`),
      }],
    });
    return [packageId, {
      package_id: packageId,
      version,
      owner_source_commit: ownerSourceCommit,
      manifest_ref: manifestRef,
      manifest_sha256: manifestSha256,
      payload_manifest_ref: payloadManifestRef,
      payload_manifest_sha256: payloadManifestSha256,
    }];
  })) as Record<typeof packageIds[number], {
    package_id: typeof packageIds[number];
    version: string;
    owner_source_commit: string;
    manifest_ref: string;
    manifest_sha256: string;
    payload_manifest_ref: string;
    payload_manifest_sha256: string;
  }>;
  const cohortRef = 'release/cohorts/26.7.20/owner-cohort-lock.json';
  const cohortDigest = writeJson(path.join(sourceRoot, cohortRef), {
    surface_kind: 'opl_package_owner_cohort_lock.v1',
    generated_at: '2026-07-20T00:00:00.000Z',
    packages: Object.fromEntries(packageIds.map((packageId) => [packageId, {
      package_id: packageId,
      repo_name: repoNames[packageId],
      repo_url: `https://github.com/gaofeng21cn/${repoNames[packageId]}.git`,
      source_commit: packages[packageId].owner_source_commit,
    }])),
  });
  const releaseSetRef = 'release/cohorts/26.7.20/release-set.json';
  const releaseSetDigest = writeJson(path.join(sourceRoot, releaseSetRef), {
    surface_kind: 'opl_release_set.v2',
    schema_ref: 'contracts/opl-framework/release-set-v2.schema.json',
    generation: '26.7.20',
    component_count: 9,
    component_ids: ['opl-base', 'opl-app', ...packageIds],
    bom_status: 'planned',
    bom_digest: null,
    owner_cohort_lock: {
      surface_kind: 'opl_package_owner_cohort_lock.v1',
      ref: 'owner-cohort-lock.json',
      digest: cohortDigest,
      package_ids: [...packageIds],
    },
    update_decision: {
      comparison_key: 'component_id+version+artifact_digest',
      release_set_revision_affects_component_update: false,
      unchanged_component_behavior: 'reuse_existing_artifact_digest_without_rebuild_or_reinstall',
    },
    channel_pointer_policy: {
      mutable_tags: ['candidate', 'latest-stable'],
      promotion_mode: 'retag_exact_immutable_release_set_digest',
      channel_is_not_bom_content: true,
    },
    components: {
      base: {
        component_id: 'opl-base',
        component_kind: 'base',
        version: '0.3.4',
        source_commit: null,
        artifact_ref: null,
        artifact_digest: null,
        artifact_status: 'pending_bundle_source_freeze',
      },
      app: {
        component_id: 'opl-app',
        component_kind: 'app',
        version: '26.7.20',
        source_commit: null,
        artifact_ref: null,
        artifact_digest: null,
        artifact_status: 'pending_bundle_source_freeze',
      },
      packages: {
        component_kind: 'package_collection',
        package_count: 7,
        package_ids: [...packageIds],
        members: Object.fromEntries(packageIds.map((packageId) => [packageId, {
          component_id: packageId,
          component_kind: 'package',
          version: packages[packageId].version,
          source_commit: packages[packageId].owner_source_commit,
          artifact_ref: `ghcr.io/example/${packageId}:${packages[packageId].version}`,
          artifact_digest: null,
          artifact_status: 'pending_remote_verification',
          manifest_ref: packages[packageId].manifest_ref,
          manifest_sha256: packages[packageId].manifest_sha256,
          payload_manifest_ref: packages[packageId].payload_manifest_ref,
          payload_manifest_sha256: packages[packageId].payload_manifest_sha256,
        }])),
      },
    },
  });
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
    framework_release_set: {
      generation: '26.7.20',
      manifest_ref: releaseSetRef,
      digest: releaseSetDigest,
    },
    packages,
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

function unifiedStableRequest(sourceRoot: string) {
  const request = fixtureRequest(sourceRoot);
  const baseImageDigest = digest('webui-base-image');
  return {
    ...request,
    source_cutoff: {
      observed_at: '2026-07-21T00:00:00.000Z',
      policy: 'single_read_at_freeze_admission' as const,
      frozen_base_release_set: {
        generation: '26.7.20',
        digest: `sha256:${'e'.repeat(64)}`,
      },
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
        id: 'first_party_packages' as const,
        ref: `release-set-generation:${request.framework_release_set.generation}`,
        digest: request.framework_release_set.digest,
        size_bytes: 105,
      },
      {
        id: 'framework_seed' as const,
        ref: request.sources.framework.source_commit,
        digest: digest('framework-seed'),
        size_bytes: 106,
      },
      {
        id: 'opl_flow' as const,
        ref: request.packages['opl-flow'].owner_source_commit,
        digest: request.packages['opl-flow'].payload_manifest_sha256,
        size_bytes: 107,
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

function appStandardRequest(sourceRoot: string) {
  const legacy = unifiedStableRequest(sourceRoot);
  const {
    framework_release_set: _frameworkReleaseSet,
    packages: _packages,
    ...request
  } = legacy;
  return {
    ...request,
    identity_mode: 'app_standard_compatibility' as const,
    package_compatibility: {
      abi: 'opl_packages.v1' as const,
      version_range: '>=0.1.0 <1.0.0',
    },
    source_cutoff: {
      ...request.source_cutoff,
      frozen_base_release_set: null,
    },
    frozen_build_inputs: request.frozen_build_inputs.filter(
      (input) => input.id !== 'first_party_packages' && input.id !== 'opl_flow',
    ),
  };
}

function isAppStandardFixtureRequest(
  request: ReturnType<typeof fixtureRequest> | ReturnType<typeof appStandardRequest>,
): request is ReturnType<typeof appStandardRequest> {
  return 'identity_mode' in request
    && request.identity_mode === 'app_standard_compatibility';
}

function writeQualification(input: {
  root: string;
  bundle: ReturnType<typeof fixtureRequest> | ReturnType<typeof appStandardRequest>;
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
  const packageBinding = (() => {
    if (isAppStandardFixtureRequest(input.bundle)) {
      return {
        identity_mode: input.bundle.identity_mode,
        package_compatibility: input.bundle.package_compatibility,
      };
    }
    const legacy = input.bundle;
    return {
      framework_release_set_digest: legacy.framework_release_set.digest,
      package_payload_manifest_sha256: Object.fromEntries(packageIds.map((packageId) => [
        packageId,
        legacy.packages[packageId].payload_manifest_sha256,
      ])),
    };
  })();
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

function createFixture(options: { admitStandard?: boolean; standardAssetNames?: string[] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-bundle-'));
  const sourceRoot = path.join(root, 'source');
  const storeRoot = path.join(root, 'store');
  const requestPath = path.join(root, 'freeze.json');
  const request = fixtureRequest(sourceRoot, options.standardAssetNames);
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

test('freeze computes one canonical digest over sources, seven package payloads, Release Set and prepared AI notes', () => {
  const fixture = createFixture();
  try {
    const first = fixture.frozen.release_bundle_freeze;
    const second = freezeReleaseBundle({
      requestPath: fixture.requestPath,
      sourceRoot: fixture.sourceRoot,
      storeRoot: fixture.storeRoot,
    })
      .release_bundle_freeze;
    assert.match(first.bundle_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(second.bundle_digest, first.bundle_digest);
    assert.equal(second.status, 'idempotent');
    if (first.bundle.identity_mode === 'app_standard_compatibility') {
      assert.fail('Legacy fixture unexpectedly produced an App Standard compatibility Bundle.');
    }
    assert.equal(
      first.bundle.packages.mas.payload_manifest_sha256,
      fixture.request.packages.mas.payload_manifest_sha256,
    );
    assert.equal(
      first.bundle.framework_release_set.digest,
      fixture.request.framework_release_set.digest,
    );
    assert.equal(first.bundle.prepared_notes.source, 'prepared_ai');
    assert.equal(first.bundle.release.version, first.bundle.release.display_version);
    assert.equal(first.bundle.release.updater_version, '26.7.20');
    assert.equal(first.bundle.policy.build_once, true);
    assert.deepEqual(first.bundle.policy.allowed_executors, ['local', 'remote']);
    const status = runCliInCwd([
      'release',
      'status',
      '--bundle',
      first.bundle_digest,
      '--store',
      fixture.storeRoot,
    ], fixture.root);
    assert.equal(status.release_bundle_status.bundle_digest, first.bundle_digest);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('App Standard freeze binds source refs and Package compatibility without Release Set or Package digests', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-bundle-app-standard-'));
  try {
    const sourceRoot = path.join(root, 'source');
    const storeRoot = path.join(root, 'store');
    const request = appStandardRequest(sourceRoot);
    const requestPath = path.join(root, 'freeze.json');
    writeJson(requestPath, request);
    const frozen = freezeReleaseBundle({ requestPath, sourceRoot, storeRoot })
      .release_bundle_freeze;
    assert.equal(frozen.bundle.identity_mode, 'app_standard_compatibility');
    assert.deepEqual(frozen.bundle.package_compatibility, {
      abi: 'opl_packages.v1',
      version_range: '>=0.1.0 <1.0.0',
    });
    assert.equal('framework_release_set' in frozen.bundle, false);
    assert.equal('packages' in frozen.bundle, false);
    assert.equal('framework_release_set_digest' in frozen.receipt.details, false);
    assert.equal('package_payload_manifest_sha256' in frozen.receipt.details, false);
    assert.equal('release_set_path' in frozen.receipt.details, false);
    assert.equal('owner_cohort_lock_path' in frozen.receipt.details, false);
    assert.deepEqual(
      frozen.bundle.frozen_build_inputs?.map((input) => input.id),
      [
        'app_source',
        'base_image',
        'codex_cli',
        'dockerfile',
        'framework_seed',
        'qualification_harness',
        'shell_webui_source',
      ],
    );

    admitReleaseBundleOperation({
      bundleDigest: frozen.bundle_digest,
      storeRoot,
      ...standardOperation,
    });
    buildReleaseBundle({
      bundleDigest: frozen.bundle_digest,
      executorReceiptPath: writeBuildReceipt({
        root,
        bundleDigest: frozen.bundle_digest,
      }),
      storeRoot,
    });
    const qualificationReceiptPath = writeQualification({
      root,
      bundle: request,
      bundleDigest: frozen.bundle_digest,
    });
    const verified = verifyReleaseBundle({
      bundleDigest: frozen.bundle_digest,
      qualificationReceiptPath,
      storeRoot,
    });
    assert.equal(verified.release_bundle_verify.status, 'complete');
    const qualification = parseJsonText(
      fs.readFileSync(qualificationReceiptPath, 'utf8'),
    ) as Record<string, any>;
    assert.equal(qualification.cohort.identity_mode, 'app_standard_compatibility');
    assert.deepEqual(qualification.cohort.package_compatibility, request.package_compatibility);
    assert.equal('framework_release_set_digest' in qualification.cohort, false);
    assert.equal('package_payload_manifest_sha256' in qualification.cohort, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('App Standard freeze rejects legacy Package authority fields, Package digest inputs, and invalid ranges', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-bundle-app-standard-invalid-'));
  try {
    const sourceRoot = path.join(root, 'source');
    for (const [name, mutate] of [
      ['legacy-authority', (request: Record<string, any>) => {
        request.framework_release_set = { generation: '26.7.23', manifest_ref: 'release.json', digest: digest('legacy') };
      }],
      ['package-digest-input', (request: Record<string, any>) => {
        request.frozen_build_inputs.splice(4, 0, {
          id: 'first_party_packages',
          ref: 'release-set-generation:26.7.23',
          digest: digest('packages'),
          size_bytes: 105,
        });
      }],
      ['invalid-range', (request: Record<string, any>) => {
        request.package_compatibility.version_range = '>=1.0.0 <0.1.0';
      }],
    ] as const) {
      const request = structuredClone(appStandardRequest(sourceRoot)) as Record<string, any>;
      mutate(request);
      const requestPath = path.join(root, `${name}.json`);
      writeJson(requestPath, request);
      assertTypedContractFailure(
        () => freezeReleaseBundle({
          requestPath,
          sourceRoot,
          storeRoot: path.join(root, `${name}-store`),
        }),
        name === 'invalid-range'
          ? /compatibility range must have an increasing upper bound/
          : /JSON Schema validation/,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('freeze rejects a compatibility version alias that differs from display_version', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-bundle-display-alias-'));
  try {
    const sourceRoot = path.join(root, 'source');
    const request = fixtureRequest(sourceRoot);
    request.release.version = '26.7.20-r1';
    const requestPath = path.join(root, 'freeze.json');
    writeJson(requestPath, request);
    assert.throws(
      () => freezeReleaseBundle({ requestPath, sourceRoot, storeRoot: path.join(root, 'store') }),
      /version compatibility alias must equal display_version/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('freeze keeps publication quality separate from GitHub prerelease visibility', () => {
  for (const [channel, prerelease] of [
    ['stable', false],
    ['preview', false],
    ['nightly', true],
  ] as const) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `opl-release-bundle-${channel}-visibility-`));
    try {
      const sourceRoot = path.join(root, 'source');
      const request = fixtureRequest(sourceRoot);
      request.release.channel = channel;
      request.release.prerelease = prerelease;
      const requestPath = path.join(root, 'freeze.json');
      writeJson(requestPath, request);
      const frozen = freezeReleaseBundle({ requestPath, sourceRoot, storeRoot: path.join(root, 'store') });
      assert.equal(frozen.release_bundle_freeze.bundle.release.channel, channel);
      assert.equal(frozen.release_bundle_freeze.bundle.release.prerelease, prerelease);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('freeze rejects channel visibility mismatches', () => {
  for (const [channel, prerelease] of [
    ['stable', true],
    ['preview', true],
    ['nightly', false],
  ] as const) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `opl-release-bundle-${channel}-visibility-mismatch-`));
    try {
      const sourceRoot = path.join(root, 'source');
      const request = fixtureRequest(sourceRoot);
      request.release.channel = channel;
      request.release.prerelease = prerelease;
      const requestPath = path.join(root, 'freeze.json');
      writeJson(requestPath, request);
      assert.throws(
        () => freezeReleaseBundle({ requestPath, sourceRoot, storeRoot: path.join(root, 'store') }),
        /prerelease state must match the selected channel visibility/,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('freeze rejects an invalid updater machine identity before computing a Bundle digest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-bundle-updater-version-'));
  try {
    const sourceRoot = path.join(root, 'source');
    const request = fixtureRequest(sourceRoot);
    request.release.updater_version = 'not-semver';
    const requestPath = path.join(root, 'freeze.json');
    writeJson(requestPath, request);
    assert.throws(
      () => freezeReleaseBundle({ requestPath, sourceRoot, storeRoot: path.join(root, 'store') }),
      /Payload failed JSON Schema validation/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('bin/opl routes release freeze through the Framework public CLI', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-bundle-public-entry-'));
  try {
    const sourceRoot = path.join(root, 'source');
    const storeRoot = path.join(root, 'store');
    const requestPath = path.join(root, 'freeze.json');
    writeJson(requestPath, fixtureRequest(sourceRoot));
    const result = spawnSync(path.join(repoRoot, 'bin', 'opl'), [
      'release',
      'freeze',
      '--request',
      requestPath,
      '--source-root',
      sourceRoot,
      '--store',
      storeRoot,
      '--json',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_SKIP_SKILL_SYNC: '1',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.match(output.release_bundle_freeze.bundle_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(output.release_bundle_freeze.status, 'frozen');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('freeze fails before build when a Package payload or Release Set input drifts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-bundle-drift-'));
  try {
    const sourceRoot = path.join(root, 'source');
    const request = fixtureRequest(sourceRoot);
    const requestPath = path.join(root, 'freeze.json');
    writeJson(requestPath, request);
    fs.appendFileSync(
      path.join(sourceRoot, request.packages.mas.payload_manifest_ref),
      ' ',
      'utf8',
    );
    assert.throws(
      () => freezeReleaseBundle({ requestPath, sourceRoot, storeRoot: path.join(root, 'store') }),
      /payload manifest mas digest does not match its frozen identity/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unified Stable freeze binds one cutoff and later authority advancement cannot refresh the cohort', () => {
  const fixture = createUnifiedStableFixture();
  try {
    const first = fixture.frozen.release_bundle_freeze;
    assert.deepEqual(first.bundle.source_cutoff, fixture.request.source_cutoff);
    assert.deepEqual(first.bundle.frozen_build_inputs, fixture.request.frozen_build_inputs);
    assert.deepEqual(first.receipt.details.source_cutoff, fixture.request.source_cutoff);
    assert.deepEqual(first.receipt.details.frozen_build_inputs, fixture.request.frozen_build_inputs);
    assert.equal(first.receipt.details.source_cutoff_frozen_once, true);
    assert.equal(first.receipt.details.frozen_build_inputs_frozen_once, true);
    assert.equal(first.bundle.policy.post_freeze_remote_refresh_allowed, false);
    assert.equal(first.bundle.policy.later_authority_advancement_invalidates_bundle, false);
    assert.equal(first.bundle.policy.all_other_live_currentness_drift_invalidates_bundle, false);
    assert.deepEqual(first.bundle.policy.cohort_invalidation_causes, [
      'frozen_byte_or_digest_drift',
      'artifact_build_or_integrity_failure',
      'explicit_security_revocation_bound_to_frozen_ref_or_digest',
    ]);
    assert.deepEqual(first.bundle.source_cutoff.frozen_base_release_set, {
      generation: '26.7.20',
      digest: `sha256:${'e'.repeat(64)}`,
    });
    assert.deepEqual(first.bundle.policy.latest_required_tracks, ['standard', 'webui']);

    const changedInputRequest = unifiedStableRequest(fixture.sourceRoot);
    changedInputRequest.frozen_build_inputs[2].digest = digest('later-codex-cli-tarball');
    const changedInputRequestPath = path.join(fixture.root, 'changed-input-freeze.json');
    writeJson(changedInputRequestPath, changedInputRequest);
    const changedInput = freezeReleaseBundle({
      requestPath: changedInputRequestPath,
      sourceRoot: fixture.sourceRoot,
      storeRoot: fixture.storeRoot,
    }).release_bundle_freeze;
    assert.notEqual(changedInput.bundle_digest, first.bundle_digest);

    const laterRequest = unifiedStableRequest(fixture.sourceRoot);
    laterRequest.source_cutoff.frozen_base_release_set = {
      generation: '26.7.21',
      digest: `sha256:${'f'.repeat(64)}`,
    };
    const laterRequestPath = path.join(fixture.root, 'later-freeze.json');
    writeJson(laterRequestPath, laterRequest);
    const later = freezeReleaseBundle({
      requestPath: laterRequestPath,
      sourceRoot: fixture.sourceRoot,
      storeRoot: fixture.storeRoot,
    }).release_bundle_freeze;
    assert.notEqual(later.bundle_digest, first.bundle_digest);

    // The source projection may advance after freeze; all later stages consume stored exact bytes.
    fs.writeFileSync(
      path.join(fixture.sourceRoot, fixture.request.framework_release_set.manifest_ref),
      '{"surface_kind":"later_authority_state"}\n',
      'utf8',
    );
    const webuiBuild = buildReleaseBundle({
      bundleDigest: first.bundle_digest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest: first.bundle_digest,
        track: 'webui',
        attemptId: 'cutoff-webui-build',
      }),
      storeRoot: fixture.storeRoot,
    });
    assert.equal(webuiBuild.release_bundle_build.status, 'complete');
    assert.equal(
      readReleaseBundleStatus({ bundleDigest: first.bundle_digest, storeRoot: fixture.storeRoot })
        .release_bundle_status.bundle.source_cutoff?.observed_at,
      '2026-07-21T00:00:00.000Z',
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('unified Stable requires cutoff, WebUI track, and frozen build inputs together', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-unified-stable-pair-'));
  try {
    const sourceRoot = path.join(root, 'source');
    const missingCutoff = unifiedStableRequest(sourceRoot);
    delete (missingCutoff as { source_cutoff?: typeof missingCutoff.source_cutoff }).source_cutoff;
    const missingCutoffPath = path.join(root, 'missing-cutoff.json');
    writeJson(missingCutoffPath, missingCutoff);
    assertTypedContractFailure(
      () => freezeReleaseBundle({
        requestPath: missingCutoffPath,
        sourceRoot,
        storeRoot: path.join(root, 'missing-cutoff-store'),
      }),
      /JSON Schema validation/,
    );

    const missingWebui = fixtureRequest(sourceRoot) as ReturnType<typeof fixtureRequest> & {
      source_cutoff: ReturnType<typeof unifiedStableRequest>['source_cutoff'];
    };
    missingWebui.source_cutoff = unifiedStableRequest(sourceRoot).source_cutoff;
    const missingWebuiPath = path.join(root, 'missing-webui.json');
    writeJson(missingWebuiPath, missingWebui);
    assertTypedContractFailure(
      () => freezeReleaseBundle({
        requestPath: missingWebuiPath,
        sourceRoot,
        storeRoot: path.join(root, 'missing-webui-store'),
      }),
      /JSON Schema validation/,
    );

    const missingFrozenBase = unifiedStableRequest(sourceRoot) as Record<string, any>;
    delete missingFrozenBase.source_cutoff.frozen_base_release_set;
    const missingFrozenBasePath = path.join(root, 'missing-frozen-base.json');
    writeJson(missingFrozenBasePath, missingFrozenBase);
    assertTypedContractFailure(
      () => freezeReleaseBundle({
        requestPath: missingFrozenBasePath,
        sourceRoot,
        storeRoot: path.join(root, 'missing-frozen-base-store'),
      }),
      /JSON Schema validation/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unified Stable rejects missing, duplicate, unknown, noncanonical, or malformed frozen build inputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-unified-stable-build-inputs-'));
  try {
    const sourceRoot = path.join(root, 'source');
    const cases: Array<{
      name: string;
      mutate: (request: Record<string, any>) => void;
      message: RegExp;
    }> = [
      {
        name: 'missing',
        mutate: (request) => delete request.frozen_build_inputs,
        message: /JSON Schema validation/,
      },
      {
        name: 'duplicate-id',
        mutate: (request) => { request.frozen_build_inputs[1].id = 'app_source'; },
        message: /JSON Schema validation/,
      },
      {
        name: 'unknown-id',
        mutate: (request) => { request.frozen_build_inputs[1].id = 'future_live_input'; },
        message: /JSON Schema validation/,
      },
      {
        name: 'noncanonical-order',
        mutate: (request) => {
          [request.frozen_build_inputs[0], request.frozen_build_inputs[1]] =
            [request.frozen_build_inputs[1], request.frozen_build_inputs[0]];
        },
        message: /JSON Schema validation/,
      },
      {
        name: 'invalid-digest',
        mutate: (request) => { request.frozen_build_inputs[0].digest = 'sha256:invalid'; },
        message: /JSON Schema validation/,
      },
      {
        name: 'zero-size',
        mutate: (request) => { request.frozen_build_inputs[0].size_bytes = 0; },
        message: /JSON Schema validation/,
      },
      {
        name: 'blank-ref',
        mutate: (request) => { request.frozen_build_inputs[0].ref = ' '; },
        message: /ref must be non-empty and canonical/,
      },
    ];
    for (const contractCase of cases) {
      const request = structuredClone(unifiedStableRequest(sourceRoot)) as Record<string, any>;
      contractCase.mutate(request);
      const requestPath = path.join(root, `${contractCase.name}.json`);
      writeJson(requestPath, request);
      assertTypedContractFailure(
        () => freezeReleaseBundle({
          requestPath,
          sourceRoot,
          storeRoot: path.join(root, `${contractCase.name}-store`),
        }),
        contractCase.message,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('post-freeze frozen build input digest or size drift fails before any stage runs', () => {
  const fixture = createUnifiedStableFixture();
  try {
    const first = fixture.frozen.release_bundle_freeze;
    const frozenBytes = fs.readFileSync(first.bundle_path, 'utf8');
    for (const field of ['digest', 'size_bytes'] as const) {
      const storedBundle = parseJsonText(frozenBytes) as Record<string, any>;
      storedBundle.frozen_build_inputs[0][field] = field === 'digest'
        ? digest('substituted-app-source')
        : storedBundle.frozen_build_inputs[0].size_bytes + 1;
      writeJson(first.bundle_path, storedBundle);
      assertTypedContractFailure(
        () => readReleaseBundleStatus({ bundleDigest: first.bundle_digest, storeRoot: fixture.storeRoot }),
        /canonical digest does not match its immutable core/,
      );
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Desktop and WebUI qualify in either order and share one Stable promotion barrier', () => {
  const fixture = createUnifiedStableFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        track: 'webui',
        attemptId: 'webui-first-build',
      }),
      storeRoot: fixture.storeRoot,
    });
    verifyReleaseBundle({
      bundleDigest,
      track: 'webui',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
        track: 'webui',
      }),
      storeRoot: fixture.storeRoot,
    });
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        attemptId: 'desktop-second-build',
      }),
      storeRoot: fixture.storeRoot,
    });
    verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
      }),
      storeRoot: fixture.storeRoot,
    });

    const qualifiedCheckpoint = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: path.join(fixture.root, 'stable-qualified-checkpoint'),
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    assert.equal(qualifiedCheckpoint.checkpoint_stage, 'stable_qualified');

    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'desktop-carrier-published',
        assets: [
          { name: 'standard.dmg', bytes: 'standard dmg' },
          { name: 'latest.yml', bytes: 'updater' },
        ],
      }),
      storeRoot: fixture.storeRoot,
    });
    let status = readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
      .release_bundle_status;
    assert.equal(status.latest_eligible, false);
    assert.deepEqual(status.stable_promotion_barrier.required_tracks, ['standard', 'webui']);
    assert.equal(status.stable_promotion_barrier.satisfied, false);
    assertTypedContractFailure(
      () => publishReleaseBundle({
        bundleDigest,
        executorReceiptPath: writeRemoteInspection({
          root: fixture.root,
          bundleDigest,
          attemptId: 'premature-unified-promotion',
          remoteTarget: 'framework-release-set:latest-stable',
          publicationScope: 'external_target',
        }),
        storeRoot: fixture.storeRoot,
      }),
      /every immutable carrier/,
    );

    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        track: 'webui',
        attemptId: 'webui-carrier-published',
        assets: [{ name: 'webui-carrier-manifest.json', bytes: '{"digest":"sha256:webui"}' }],
      }),
      storeRoot: fixture.storeRoot,
    });
    status = readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
      .release_bundle_status;
    assert.equal(status.latest_eligible, true);
    assert.equal(status.stable_promotion_barrier.satisfied, true);

    const promoted = publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'unified-stable-promotion',
        remoteTarget: 'framework-release-set:latest-stable',
        publicationScope: 'external_target',
      }),
      storeRoot: fixture.storeRoot,
    });
    assert.equal(promoted.release_bundle_publish.status, 'complete');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('build stages exact bytes once and rejects a second executor with different bytes', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const firstReceipt = writeBuildReceipt({ root: fixture.root, bundleDigest });
    const built = buildReleaseBundle({ bundleDigest, executorReceiptPath: firstReceipt, storeRoot: fixture.storeRoot });
    assert.equal(built.release_bundle_build.status, 'complete');

    const replayReceipt = writeBuildReceipt({
      root: fixture.root,
      bundleDigest,
      executor: 'remote',
      attemptId: 'remote-replay',
    });
    const replay = buildReleaseBundle({ bundleDigest, executorReceiptPath: replayReceipt, storeRoot: fixture.storeRoot });
    assert.equal(replay.release_bundle_build.status, 'idempotent');

    const conflictReceipt = writeBuildReceipt({
      root: fixture.root,
      bundleDigest,
      executor: 'remote',
      attemptId: 'remote-conflict',
      assets: [{ name: 'standard.dmg', bytes: 'different' }, { name: 'latest.yml', bytes: 'updater' }],
    });
    assert.throws(
      () => buildReleaseBundle({ bundleDigest, executorReceiptPath: conflictReceipt, storeRoot: fixture.storeRoot }),
      /already contains different asset bytes/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('portable checkpoint binds one canonical six-asset manifest and rejects transport drift', () => {
  const standardAssets = [
    { name: 'standard.dmg', bytes: 'standard dmg' },
    { name: 'standard.zip', bytes: 'standard zip' },
    { name: 'standard.zip.blockmap', bytes: 'standard blockmap' },
    { name: 'latest.yml', bytes: 'updater' },
    { name: 'component-manifest.json', bytes: 'component manifest' },
    { name: 'authorization-policy.json', bytes: 'authorization policy' },
  ];
  const fixture = createFixture({
    standardAssetNames: standardAssets.map((asset) => asset.name),
  });
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        attemptId: 'six-asset-build',
        assets: standardAssets,
      }),
      storeRoot: fixture.storeRoot,
    });
    verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
      }),
      storeRoot: fixture.storeRoot,
    });

    const checkpointDirectory = path.join(fixture.root, 'six-asset-checkpoint');
    const exported = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    const checkpointPath = path.join(checkpointDirectory, 'checkpoint.json');
    const checkpoint = readCheckpointFixture(checkpointPath);
    const manifestEntries = checkpoint.entries.filter((entry) => (
      entry.role === 'track_asset_manifest' && entry.track === 'standard'
    ));
    assert.equal(manifestEntries.length, 1);
    assert.equal(manifestEntries[0].path, 'tracks/standard/assets.json');
    assert.equal(checkpoint.tracks.standard.asset_manifest_path, manifestEntries[0].path);
    assert.equal(checkpoint.tracks.standard.asset_manifest_sha256, manifestEntries[0].sha256);
    const manifestPath = path.join(checkpointDirectory, manifestEntries[0].path);
    assert.equal(digest(fs.readFileSync(manifestPath)), manifestEntries[0].sha256);
    const manifest = parseJsonText(fs.readFileSync(manifestPath, 'utf8')) as {
      surface_kind: string;
      bundle_digest: string;
      track: string;
      assets: Array<{ name: string; size_bytes: number; sha256: string }>;
    };
    const expectedManifestAssets = standardAssets
      .map((asset) => ({
        name: asset.name,
        size_bytes: Buffer.byteLength(asset.bytes),
        sha256: digest(asset.bytes),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
    assert.deepEqual(manifest, {
      surface_kind: 'opl_release_bundle_staged_assets.v1',
      bundle_digest: bundleDigest,
      track: 'standard',
      assets: expectedManifestAssets,
    });
    assert.equal(manifest.assets.length, 6);
    assert.equal(manifest.assets.some((asset) => 'path' in asset), false);
    assert.deepEqual(
      manifest.assets.map((asset) => asset.name).sort(),
      [...fixture.request.tracks.standard.required_asset_names].sort(),
    );

    const importedStore = path.join(fixture.root, 'six-asset-imported-store');
    const imported = importReleaseBundleCheckpoint({ checkpointPath, storeRoot: importedStore })
      .release_bundle_checkpoint_import;
    assert.equal(imported.status, 'complete');
    const roundTripDirectory = path.join(fixture.root, 'six-asset-round-trip');
    const roundTrip = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: roundTripDirectory,
      storeRoot: importedStore,
    }).release_bundle_checkpoint_export;
    assert.equal(roundTrip.checkpoint_digest, exported.checkpoint_digest);
    assert.deepEqual(
      fs.readFileSync(path.join(roundTripDirectory, 'tracks/standard/assets.json')),
      fs.readFileSync(manifestPath),
    );

    const rewriteCheckpointCopy = (
      label: string,
      mutate: (copy: MutableCheckpointFixture, directory: string) => void,
    ) => {
      const directory = path.join(fixture.root, label);
      fs.cpSync(checkpointDirectory, directory, { recursive: true });
      const copiedCheckpointPath = path.join(directory, 'checkpoint.json');
      const copy = readCheckpointFixture(copiedCheckpointPath);
      mutate(copy, directory);
      const { checkpoint_digest: _checkpointDigest, ...core } = copy;
      copy.checkpoint_digest = digest(canonicalJsonBytes(core));
      writeJson(copiedCheckpointPath, copy);
      return copiedCheckpointPath;
    };

    const missingManifestPath = rewriteCheckpointCopy('missing-manifest-checkpoint', (copy, directory) => {
      const entry = copy.entries.find((candidate) => candidate.role === 'track_asset_manifest');
      assert.ok(entry);
      fs.rmSync(path.join(directory, entry.path));
      copy.entries = copy.entries.filter((candidate) => candidate !== entry);
      copy.tracks.standard.asset_manifest_path = null;
      copy.tracks.standard.asset_manifest_sha256 = null;
    });
    assertTypedContractFailure(
      () => importReleaseBundleCheckpoint({
        checkpointPath: missingManifestPath,
        storeRoot: path.join(fixture.root, 'missing-manifest-store'),
      }),
      /requires exactly one canonical asset manifest/,
    );

    const duplicateManifestPath = rewriteCheckpointCopy('duplicate-manifest-checkpoint', (copy, directory) => {
      const entry = copy.entries.find((candidate) => candidate.role === 'track_asset_manifest');
      assert.ok(entry);
      const duplicatePath = 'tracks/standard/assets-copy.json';
      fs.copyFileSync(path.join(directory, entry.path), path.join(directory, duplicatePath));
      copy.entries.push({ ...entry, path: duplicatePath });
      copy.entries.sort((left, right) => left.path.localeCompare(right.path));
    });
    assertTypedContractFailure(
      () => importReleaseBundleCheckpoint({
        checkpointPath: duplicateManifestPath,
        storeRoot: path.join(fixture.root, 'duplicate-manifest-store'),
      }),
      /requires exactly one canonical asset manifest/,
    );

    const contentDriftPath = rewriteCheckpointCopy('content-drift-checkpoint', (copy, directory) => {
      const entry = copy.entries.find((candidate) => candidate.role === 'track_asset_manifest');
      assert.ok(entry);
      const copiedManifestPath = path.join(directory, entry.path);
      const copiedManifest = parseJsonText(fs.readFileSync(copiedManifestPath, 'utf8')) as {
        assets: Array<{ sha256: string }>;
      };
      copiedManifest.assets[0].sha256 = `sha256:${'c'.repeat(64)}`;
      writeJson(copiedManifestPath, copiedManifest);
      const bytes = fs.readFileSync(copiedManifestPath);
      entry.size_bytes = bytes.length;
      entry.sha256 = digest(bytes);
      copy.tracks.standard.asset_manifest_sha256 = entry.sha256;
    });
    assertTypedContractFailure(
      () => importReleaseBundleCheckpoint({
        checkpointPath: contentDriftPath,
        storeRoot: path.join(fixture.root, 'content-drift-store'),
      }),
      /differs from the exact checkpoint asset identities/,
    );

    const digestDriftPath = rewriteCheckpointCopy('digest-drift-checkpoint', (copy) => {
      copy.tracks.standard.asset_manifest_sha256 = `sha256:${'d'.repeat(64)}`;
    });
    assertTypedContractFailure(
      () => importReleaseBundleCheckpoint({
        checkpointPath: digestDriftPath,
        storeRoot: path.join(fixture.root, 'digest-drift-store'),
      }),
      /asset manifest digest does not match its declared entry/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('portable checkpoint switches executors without rebuilding and never imports publish state', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const localBuild = writeBuildReceipt({
      root: fixture.root,
      bundleDigest,
      executor: 'local',
      attemptId: 'local-standard-build',
    });
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: localBuild,
      storeRoot: fixture.storeRoot,
    });
    const qualificationReceiptPath = writeQualification({
      root: fixture.root,
      bundle: fixture.request,
      bundleDigest,
    });
    verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath,
      storeRoot: fixture.storeRoot,
    });
    const publishedReceipt = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'source-published',
      assets: [
        { name: 'standard.dmg', bytes: 'standard dmg' },
        { name: 'latest.yml', bytes: 'updater' },
      ],
    });
    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: publishedReceipt,
      storeRoot: fixture.storeRoot,
    });

    const checkpointDirectory = path.join(fixture.root, 'checkpoint');
    const exported = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    assert.equal(exported.status, 'complete');
    assert.equal(exported.checkpoint_stage, 'standard_qualified');
    assert.match(exported.checkpoint_digest, /^sha256:[0-9a-f]{64}$/);
    const exportedAgain = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    assert.equal(exportedAgain.status, 'idempotent');
    assert.equal(exportedAgain.checkpoint_digest, exported.checkpoint_digest);

    const importedStore = path.join(fixture.root, 'imported-store');
    const imported = importReleaseBundleCheckpoint({
      checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
      storeRoot: importedStore,
    }).release_bundle_checkpoint_import;
    assert.equal(imported.status, 'complete');
    assert.equal(imported.rebuild_performed, false);
    assert.equal(imported.publish_state_imported, false);
    const importedAgain = importReleaseBundleCheckpoint({
      checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
      storeRoot: importedStore,
    }).release_bundle_checkpoint_import;
    assert.equal(importedAgain.status, 'idempotent');

    const status = readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status;
    assert.equal(status.tracks.standard.built, true);
    assert.equal(status.tracks.standard.verified, true);
    assert.equal(status.tracks.standard.published, false);
    assert.equal(status.latest_eligible, false);

    const remoteReplay = writeBuildReceipt({
      root: fixture.root,
      bundleDigest,
      executor: 'remote',
      attemptId: 'remote-same-byte-resume',
    });
    const resumed = buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: remoteReplay,
      storeRoot: importedStore,
    });
    assert.equal(resumed.release_bundle_build.status, 'idempotent');

    fs.appendFileSync(path.join(checkpointDirectory, 'tracks', 'standard', 'assets', 'standard.dmg'), 'tamper');
    assert.throws(
      () => importReleaseBundleCheckpoint({
        checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
        storeRoot: path.join(fixture.root, 'tampered-store'),
      }),
      /does not match its declared identity/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('portable checkpoint covers every executor handoff stage', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const checkpoints: Array<{
      label: string;
      stage: 'frozen' | 'standard_built' | 'standard_qualified' | 'full_built' | 'full_qualified';
    }> = [];
    const capture = (label: string, stage: typeof checkpoints[number]['stage']) => {
      const result = exportReleaseBundleCheckpoint({
        bundleDigest,
        outputDirectory: path.join(fixture.root, `checkpoint-${label}`),
        storeRoot: fixture.storeRoot,
      }).release_bundle_checkpoint_export;
      assert.equal(result.checkpoint_stage, stage);
      checkpoints.push({ label, stage });
    };

    capture('frozen', 'frozen');
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        executor: 'local',
        attemptId: 'matrix-standard-build',
      }),
      storeRoot: fixture.storeRoot,
    });
    capture('standard-built', 'standard_built');
    verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
      }),
      storeRoot: fixture.storeRoot,
    });
    capture('standard-qualified', 'standard_qualified');
    admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      ...appendFullOperation,
    });
    buildReleaseBundle({
      ...appendFullOperation,
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        track: 'full',
        executor: 'local',
        attemptId: 'matrix-full-build',
      }),
      storeRoot: fixture.storeRoot,
    });
    capture('full-built', 'full_built');
    verifyReleaseBundle({
      ...appendFullOperation,
      bundleDigest,
      track: 'full',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
        track: 'full',
      }),
      storeRoot: fixture.storeRoot,
    });
    capture('full-qualified', 'full_qualified');

    for (const checkpoint of checkpoints) {
      const importedStore = path.join(fixture.root, `imported-${checkpoint.label}`);
      const imported = importReleaseBundleCheckpoint({
        checkpointPath: path.join(fixture.root, `checkpoint-${checkpoint.label}`, 'checkpoint.json'),
        storeRoot: importedStore,
      }).release_bundle_checkpoint_import;
      assert.equal(imported.checkpoint_stage, checkpoint.stage);
      assert.equal(imported.rebuild_performed, false);
      const status = readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
        .release_bundle_status;
      assert.equal(status.tracks.standard.built, checkpoint.stage !== 'frozen');
      assert.equal(
        status.tracks.standard.verified,
        ['standard_qualified', 'full_built', 'full_qualified'].includes(checkpoint.stage),
      );
      assert.equal(
        status.tracks.full.built,
        ['full_built', 'full_qualified'].includes(checkpoint.stage),
      );
      assert.equal(status.tracks.full.verified, checkpoint.stage === 'full_qualified');
      assert.equal(status.tracks.standard.published, false);
      assert.equal(status.tracks.full.published, false);
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('checkpoint export is idempotent only while the complete store state is unchanged', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const checkpointDirectory = path.join(fixture.root, 'state-bound-checkpoint');
    const first = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    const unchanged = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    assert.equal(unchanged.status, 'idempotent');
    assert.equal(unchanged.checkpoint_digest, first.checkpoint_digest);

    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({ root: fixture.root, bundleDigest }),
      storeRoot: fixture.storeRoot,
    });
    verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
      }),
      storeRoot: fixture.storeRoot,
    });
    assertTypedContractFailure(
      () => exportReleaseBundleCheckpoint({
        bundleDigest,
        outputDirectory: checkpointDirectory,
        storeRoot: fixture.storeRoot,
      }),
      /stale for the current immutable Release Bundle state/,
    );
    const current = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: path.join(fixture.root, 'qualified-checkpoint'),
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    assert.equal(current.checkpoint_stage, 'standard_qualified');
    assert.notEqual(current.checkpoint_digest, first.checkpoint_digest);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('checkpoint rename race returns the exact identity retained on disk across compatible formats', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const legacyDirectory = path.join(fixture.root, 'legacy-race-source');
    const current = exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: legacyDirectory,
      storeRoot: fixture.storeRoot,
    }).release_bundle_checkpoint_export;
    const legacyPath = path.join(legacyDirectory, 'checkpoint.json');
    const legacyCheckpoint = readCheckpointFixture(legacyPath);
    delete legacyCheckpoint.active_unknown_markers;
    const { checkpoint_digest: _checkpointDigest, ...legacyCore } = legacyCheckpoint;
    legacyCheckpoint.checkpoint_digest = digest(canonicalJsonBytes(legacyCore));
    writeJson(legacyPath, legacyCheckpoint);
    assert.notEqual(legacyCheckpoint.checkpoint_digest, current.checkpoint_digest);

    const racedDirectory = path.join(fixture.root, 'mixed-format-race-target');
    const originalRenameSync = fs.renameSync;
    fs.renameSync = ((source: fs.PathLike, destination: fs.PathLike) => {
      if (path.resolve(String(destination)) === path.resolve(racedDirectory)) {
        fs.cpSync(legacyDirectory, racedDirectory, { recursive: true, errorOnExist: true });
        throw Object.assign(new Error('simulated compatible checkpoint race'), { code: 'EEXIST' });
      }
      return originalRenameSync(source, destination);
    }) as typeof fs.renameSync;
    try {
      const raced = exportReleaseBundleCheckpoint({
        bundleDigest,
        outputDirectory: racedDirectory,
        storeRoot: fixture.storeRoot,
      }).release_bundle_checkpoint_export;
      assert.equal(raced.status, 'idempotent');
      assert.equal(raced.checkpoint_digest, legacyCheckpoint.checkpoint_digest);
      assert.equal(
        readCheckpointFixture(path.join(racedDirectory, 'checkpoint.json')).checkpoint_digest,
        raced.checkpoint_digest,
      );
    } finally {
      fs.renameSync = originalRenameSync;
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('checkpoint carries an exact unknown build marker across executors and never resurrects it', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const staleCheckpointDirectory = path.join(fixture.root, 'stale-before-unknown-checkpoint');
    exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: staleCheckpointDirectory,
      storeRoot: fixture.storeRoot,
    });
    const priorAttemptId = 'unknown-before-handoff';
    const remoteTarget = 'build:standard';
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        executor: 'local',
        attemptId: priorAttemptId,
        outcome: 'unknown',
        remoteTarget,
      }),
      storeRoot: fixture.storeRoot,
    });
    assertTypedContractFailure(
      () => exportReleaseBundleCheckpoint({
        bundleDigest,
        outputDirectory: staleCheckpointDirectory,
        storeRoot: fixture.storeRoot,
      }),
      /stale for the current immutable Release Bundle state/,
    );
    const checkpointDirectory = path.join(fixture.root, 'unknown-checkpoint');
    exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    });
    const checkpoint = readCheckpointFixture(path.join(checkpointDirectory, 'checkpoint.json'));
    assert.equal(checkpoint.active_unknown_markers?.length, 1);
    assert.equal(checkpoint.active_unknown_markers?.[0].prior_mutation_attempt_id, priorAttemptId);
    const mismatchedControlDirectory = path.join(fixture.root, 'mismatched-control-checkpoint');
    fs.cpSync(checkpointDirectory, mismatchedControlDirectory, { recursive: true });
    const mismatchedControlPath = path.join(mismatchedControlDirectory, 'checkpoint.json');
    const mismatchedControlCheckpoint = readCheckpointFixture(mismatchedControlPath);
    const { control_digest: _controlDigest, ...controlCore } =
      mismatchedControlCheckpoint.operation_controls!.standard!;
    controlCore.operation_id = 'different-operation-control';
    mismatchedControlCheckpoint.operation_controls!.standard = {
      ...controlCore,
      control_digest: digest(canonicalJsonBytes(controlCore)),
    };
    const { checkpoint_digest: _checkpointDigest, ...mismatchedCheckpointCore } =
      mismatchedControlCheckpoint;
    mismatchedControlCheckpoint.checkpoint_digest = digest(canonicalJsonBytes(mismatchedCheckpointCore));
    writeJson(mismatchedControlPath, mismatchedControlCheckpoint);
    assertTypedContractFailure(
      () => importReleaseBundleCheckpoint({
        checkpointPath: mismatchedControlPath,
        storeRoot: path.join(fixture.root, 'mismatched-control-store'),
      }),
      /unknown marker does not match its immutable operation control/,
    );

    const importedStore = path.join(fixture.root, 'unknown-imported-store');
    const imported = importReleaseBundleCheckpoint({
      checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
      storeRoot: importedStore,
    }).release_bundle_checkpoint_import;
    assert.equal(imported.rebuild_performed, false);
    assert.equal(imported.unknown_outcomes_imported, true);
    assert.equal(imported.active_unknown_marker_count, 1);
    const importedStatus = readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status;
    assert.equal(importedStatus.live_mutation_allowed, false);
    assert.equal(importedStatus.active_unknown_markers[0].marker_digest, checkpoint.active_unknown_markers?.[0].marker_digest);
    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        bundleDigest,
        storeRoot: importedStore,
        ...standardOperation,
        releaseOperation: 'resume_standard',
      }),
      /blocks every ordinary mutation/,
    );

    const conflictingFixture = createFixture();
    try {
      assert.equal(conflictingFixture.frozen.release_bundle_freeze.bundle_digest, bundleDigest);
      buildReleaseBundle({
        bundleDigest,
        executorReceiptPath: writeBuildReceipt({
          root: conflictingFixture.root,
          bundleDigest,
          attemptId: 'different-unknown-before-import',
          outcome: 'unknown',
        }),
        storeRoot: conflictingFixture.storeRoot,
      });
      const conflictingMarker = readReleaseBundleStatus({
        bundleDigest,
        storeRoot: conflictingFixture.storeRoot,
      }).release_bundle_status.active_unknown_markers[0];
      assertTypedContractFailure(
        () => importReleaseBundleCheckpoint({
          checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
          storeRoot: conflictingFixture.storeRoot,
        }),
        /cannot overwrite or omit a different unknown outcome/,
      );
      assert.equal(readReleaseBundleStatus({
        bundleDigest,
        storeRoot: conflictingFixture.storeRoot,
      }).release_bundle_status.active_unknown_markers[0].marker_digest, conflictingMarker.marker_digest);
    } finally {
      fs.rmSync(conflictingFixture.root, { recursive: true, force: true });
    }

    assertTypedContractFailure(
      () => buildReleaseBundle({
        releaseOperation: 'resume_standard',
        bundleDigest,
        executorReceiptPath: writeBuildReceipt({
          root: fixture.root,
          bundleDigest,
          executor: 'remote',
          attemptId: 'ordinary-build-after-import',
          releaseOperation: 'resume_standard',
          remoteTarget,
        }),
        storeRoot: importedStore,
      }),
      /blocks every ordinary mutation/,
    );
    assertTypedContractFailure(
      () => reconcileReleaseBundle({
        releaseOperation: 'resume_standard',
        bundleDigest,
        executorReceiptPath: writeBuildReceipt({
          root: fixture.root,
          bundleDigest,
          executor: 'remote',
          attemptId: 'wrong-prior-after-import',
          releaseOperation: 'resume_standard',
          remoteTarget,
          priorAttemptId: 'not-the-prior-attempt',
        }),
        storeRoot: importedStore,
      }),
      /does not match the exact unknown outcome marker/,
    );

    const stillUnknown = reconcileReleaseBundle({
      releaseOperation: 'resume_standard',
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        executor: 'remote',
        attemptId: 'still-unknown-after-import',
        outcome: 'unknown',
        releaseOperation: 'resume_standard',
        remoteTarget,
        priorAttemptId,
      }),
      storeRoot: importedStore,
    }).release_bundle_reconcile;
    assert.equal(stillUnknown.status, 'reconcile_only');
    assert.equal(readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status.active_unknown_markers[0].marker_digest, checkpoint.active_unknown_markers[0].marker_digest);
    const stillUnknownCheckpointDirectory = path.join(fixture.root, 'still-unknown-checkpoint');
    exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: stillUnknownCheckpointDirectory,
      storeRoot: importedStore,
    });
    const stillUnknownCheckpoint = readCheckpointFixture(
      path.join(stillUnknownCheckpointDirectory, 'checkpoint.json'),
    );
    assert.equal(
      stillUnknownCheckpoint.active_unknown_markers?.[0].marker_digest,
      checkpoint.active_unknown_markers?.[0].marker_digest,
    );

    const reconciled = reconcileReleaseBundle({
      releaseOperation: 'resume_standard',
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        executor: 'remote',
        attemptId: 'resolved-after-import',
        releaseOperation: 'resume_standard',
        remoteTarget,
        priorAttemptId,
      }),
      storeRoot: importedStore,
    }).release_bundle_reconcile;
    assert.equal(reconciled.status, 'complete');
    assert.equal(readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status.active_unknown_markers.length, 0);

    assertTypedContractFailure(
      () => importReleaseBundleCheckpoint({
        checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
        storeRoot: importedStore,
      }),
      /no longer matches its checkpoint stage/,
    );
    assert.equal(readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status.active_unknown_markers.length, 0);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('portable external-target unknown marker preserves the track-assets prerequisite for exact reconcile', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({ root: fixture.root, bundleDigest }),
      storeRoot: fixture.storeRoot,
    });
    verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
      }),
      storeRoot: fixture.storeRoot,
    });
    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'assets-before-external-target',
        assets: [
          { name: 'standard.dmg', bytes: 'standard dmg' },
          { name: 'latest.yml', bytes: 'updater' },
        ],
      }),
      storeRoot: fixture.storeRoot,
    });
    const remoteTarget = `homebrew:gaofeng21cn/homebrew-one-person-lab@${digest('cask')}`;
    const priorAttemptId = 'homebrew-push-unknown';
    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: priorAttemptId,
        outcome: 'unknown',
        remoteTarget,
        publicationScope: 'external_target',
      }),
      storeRoot: fixture.storeRoot,
    });
    const checkpointDirectory = path.join(fixture.root, 'external-target-unknown-checkpoint');
    exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    });
    const importedStore = path.join(fixture.root, 'external-target-unknown-store');
    importReleaseBundleCheckpoint({
      checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
      storeRoot: importedStore,
    });

    const conflictingFixture = createFixture();
    try {
      buildReleaseBundle({
        bundleDigest,
        executorReceiptPath: writeBuildReceipt({
          root: conflictingFixture.root,
          bundleDigest,
          attemptId: 'conflicting-build-before-import',
          assets: [
            { name: 'standard.dmg', bytes: 'different standard dmg' },
            { name: 'latest.yml', bytes: 'different updater' },
          ],
        }),
        storeRoot: conflictingFixture.storeRoot,
      });
      assertTypedContractFailure(
        () => importReleaseBundleCheckpoint({
          checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
          storeRoot: conflictingFixture.storeRoot,
        }),
        /already contains different asset bytes/,
      );
      assert.equal(
        readReleaseBundleStatus({ bundleDigest, storeRoot: conflictingFixture.storeRoot })
          .release_bundle_status.active_unknown_markers[0].prior_mutation_attempt_id,
        priorAttemptId,
      );
    } finally {
      fs.rmSync(conflictingFixture.root, { recursive: true, force: true });
    }

    const reconciled = reconcileReleaseBundle({
      releaseOperation: 'resume_standard',
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'homebrew-readback-after-import',
        releaseOperation: 'resume_standard',
        remoteTarget,
        priorAttemptId,
        publicationScope: 'external_target',
      }),
      storeRoot: importedStore,
    }).release_bundle_reconcile;
    assert.equal(reconciled.status, 'complete');
    const status = readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status;
    assert.equal(status.active_unknown_markers.length, 0);
    assert.equal(status.tracks.standard.published, true);

    const repeated = importReleaseBundleCheckpoint({
      checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
      storeRoot: importedStore,
    }).release_bundle_checkpoint_import;
    assert.equal(repeated.status, 'idempotent');
    assert.equal(repeated.active_unknown_marker_count, 0);
    assert.equal(repeated.reconcile_required, false);
    assert.equal(readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status.active_unknown_markers.length, 0);

    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'different-external-target-unknown',
        outcome: 'unknown',
        remoteTarget: `github-latest:gaofeng21cn/one-person-lab@${fixture.request.release.tag}`,
        publicationScope: 'external_target',
      }),
      storeRoot: importedStore,
    });
    const differentMarker = readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status.active_unknown_markers[0];
    assertTypedContractFailure(
      () => importReleaseBundleCheckpoint({
        checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
        storeRoot: importedStore,
      }),
      /cannot overwrite or omit a different unknown outcome/,
    );
    assert.equal(readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status.active_unknown_markers[0].marker_digest, differentMarker.marker_digest);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('portable external-target reconciliation inherits the expired deadline and never advances', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({ root: fixture.root, bundleDigest }),
      storeRoot: fixture.storeRoot,
    });
    verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
      }),
      storeRoot: fixture.storeRoot,
    });
    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'deadline-assets-before-external-target',
        assets: [
          { name: 'standard.dmg', bytes: 'standard dmg' },
          { name: 'latest.yml', bytes: 'updater' },
        ],
      }),
      storeRoot: fixture.storeRoot,
    });
    const remoteTarget = `homebrew:gaofeng21cn/homebrew-one-person-lab@${digest('late-cask')}`;
    const priorAttemptId = 'late-homebrew-push-unknown';
    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: priorAttemptId,
        outcome: 'unknown',
        remoteTarget,
        publicationScope: 'external_target',
      }),
      storeRoot: fixture.storeRoot,
    });
    const checkpointDirectory = path.join(fixture.root, 'expired-external-target-checkpoint');
    exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: checkpointDirectory,
      storeRoot: fixture.storeRoot,
    });
    const importedStore = path.join(fixture.root, 'expired-external-target-store');
    importReleaseBundleCheckpoint({
      checkpointPath: path.join(checkpointDirectory, 'checkpoint.json'),
      storeRoot: importedStore,
    });

    const stillUnknown = reconcileReleaseBundle({
      releaseOperation: 'resume_standard',
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'late-homebrew-still-unknown',
        outcome: 'unknown',
        releaseOperation: 'resume_standard',
        remoteTarget,
        priorAttemptId,
        publicationScope: 'external_target',
      }),
      storeRoot: importedStore,
      now: '2100-07-21T00:00:00.000Z',
    }).release_bundle_reconcile;
    assert.equal(stillUnknown.status, 'reconcile_only');
    assert.equal(readReleaseBundleStatus({ bundleDigest, storeRoot: importedStore })
      .release_bundle_status.active_unknown_markers.length, 1);

    const resolved = reconcileReleaseBundle({
      releaseOperation: 'resume_standard',
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'late-homebrew-readback',
        releaseOperation: 'resume_standard',
        remoteTarget,
        priorAttemptId,
        publicationScope: 'external_target',
      }),
      storeRoot: importedStore,
      now: '2100-07-21T00:00:00.000Z',
    }).release_bundle_reconcile;
    assert.equal(resolved.status, 'late_observation');
    assert.deepEqual(resolved.receipt.details.upload_actions, []);
    assert.equal(resolved.receipt.details.stage_advanced, false);
    assert.equal(resolved.receipt.details.late_success_recorded_as_evidence_only, true);
    const status = readReleaseBundleStatus({
      bundleDigest,
      storeRoot: importedStore,
      now: '2100-07-21T00:00:00.000Z',
    }).release_bundle_status;
    assert.equal(status.operation_controls.standard?.operation_deadline_at, standardOperation.operationDeadlineAt);
    assert.equal(status.operation_controls.standard?.deadline_elapsed, true);
    assert.equal(status.active_unknown_markers.length, 0);
    assert.equal(status.tracks.standard.published, false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('public CLI exports and imports a frozen portable checkpoint', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const checkpointDirectory = path.join(fixture.root, 'cli-checkpoint');
    const exported = runCliInCwd([
      'release',
      'checkpoint',
      'export',
      '--bundle',
      bundleDigest,
      '--output',
      checkpointDirectory,
      '--store',
      fixture.storeRoot,
    ], fixture.root);
    assert.equal(exported.release_bundle_checkpoint_export.checkpoint_stage, 'frozen');
    const imported = runCliInCwd([
      'release',
      'checkpoint',
      'import',
      '--checkpoint',
      path.join(checkpointDirectory, 'checkpoint.json'),
      '--store',
      path.join(fixture.root, 'cli-imported-store'),
    ], fixture.root);
    assert.equal(imported.release_bundle_checkpoint_import.rebuild_performed, false);
    assert.equal(imported.release_bundle_checkpoint_import.checkpoint_stage, 'frozen');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('unknown build outcome blocks rebuild and can only be completed through reconcile', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const unknownReceipt = writeBuildReceipt({
      root: fixture.root,
      bundleDigest,
      outcome: 'unknown',
      attemptId: 'unknown-build',
    });
    const unknown = buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: unknownReceipt,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(unknown.release_bundle_build.status, 'reconcile_only');

    const resolvedReceipt = writeBuildReceipt({ root: fixture.root, bundleDigest, attemptId: 'resolved-build' });
    assert.throws(
      () => buildReleaseBundle({ bundleDigest, executorReceiptPath: resolvedReceipt, storeRoot: fixture.storeRoot }),
      /blocks every ordinary mutation/,
    );
    const resolvedObservation = writeBuildReceipt({
      root: fixture.root,
      bundleDigest,
      attemptId: 'resolved-build-observation',
      remoteTarget: 'executor:local-standard',
      priorAttemptId: 'unknown-build',
    });
    const reconciled = reconcileReleaseBundle({
      bundleDigest,
      executorReceiptPath: resolvedObservation,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(reconciled.release_bundle_reconcile.status, 'complete');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('verify binds staged assets and Standard alone becomes latest-eligible while Full remains additive', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const standardReceipt = writeBuildReceipt({ root: fixture.root, bundleDigest });
    buildReleaseBundle({ bundleDigest, executorReceiptPath: standardReceipt, storeRoot: fixture.storeRoot });
    const qualificationReceiptPath = writeQualification({
      root: fixture.root,
      bundle: fixture.request,
      bundleDigest,
    });
    const verified = verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(verified.release_bundle_verify.status, 'complete');
    const qualification = verified.release_bundle_verify.tracks[0];
    assert.equal(
      digest(fs.readFileSync(qualification.qualification_receipt_path)),
      qualification.qualification_receipt_sha256,
    );
    const beforePublish = readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot });
    assert.equal(beforePublish.release_bundle_status.latest_eligible, false);
    assert.equal(beforePublish.release_bundle_status.tracks.standard.verified, true);
    assert.equal(beforePublish.release_bundle_status.tracks.full.built, false);
    assert.equal(beforePublish.release_bundle_status.bundle.policy.full_updates_updater_metadata, false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('publish is idempotent by remote name and digest and unknown results force reconcile', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const buildReceipt = writeBuildReceipt({ root: fixture.root, bundleDigest });
    buildReleaseBundle({ bundleDigest, executorReceiptPath: buildReceipt, storeRoot: fixture.storeRoot });
    const qualificationReceiptPath = writeQualification({
      root: fixture.root,
      bundle: fixture.request,
      bundleDigest,
    });
    verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath,
      storeRoot: fixture.storeRoot,
    });

    const missing = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'remote-missing',
      assets: [],
    });
    const upload = publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: missing,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(upload.release_bundle_publish.status, 'upload_required');
    const uploadActions = upload.release_bundle_publish.receipt.details.upload_actions as Array<{
      name: string;
    }>;
    assert.deepEqual(
      uploadActions.map((entry) => entry.name),
      ['latest.yml', 'standard.dmg'],
    );

    const complete = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'remote-complete',
      assets: [{ name: 'standard.dmg', bytes: 'standard dmg' }, { name: 'latest.yml', bytes: 'updater' }],
    });
    const published = publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: complete,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(published.release_bundle_publish.status, 'complete');
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.latest_eligible,
      true,
    );

    const conflict = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'remote-conflict',
      assets: [{ name: 'standard.dmg', bytes: 'wrong' }, { name: 'latest.yml', bytes: 'updater' }],
    });
    assert.throws(
      () => publishReleaseBundle({ bundleDigest, executorReceiptPath: conflict, storeRoot: fixture.storeRoot }),
      /same-name asset with a different digest/,
    );

    const unknown = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'remote-unknown',
      outcome: 'unknown',
    });
    const unknownResult = publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: unknown,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(unknownResult.release_bundle_publish.status, 'reconcile_only');
    assert.throws(
      () => publishReleaseBundle({ bundleDigest, executorReceiptPath: complete, storeRoot: fixture.storeRoot }),
      /blocks every ordinary mutation/,
    );
    const reconcileMissing = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'reconcile-missing',
      assets: [],
      remoteTarget: 'github-release:fixture/standard',
      priorAttemptId: 'remote-unknown',
    });
    const reconciled = reconcileReleaseBundle({
      bundleDigest,
      executorReceiptPath: reconcileMissing,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(reconciled.release_bundle_reconcile.status, 'reconcile_only');
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.latest_eligible,
      false,
    );
    assert.throws(
      () => publishReleaseBundle({
        bundleDigest,
        executorReceiptPath: complete,
        storeRoot: fixture.storeRoot,
      }),
      /blocks every ordinary mutation/,
    );
    const completeObservation = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'reconcile-complete',
      remoteTarget: 'github-release:fixture/standard',
      priorAttemptId: 'remote-unknown',
      assets: [
        { name: 'standard.dmg', bytes: 'standard dmg' },
        { name: 'latest.yml', bytes: 'updater' },
      ],
    });
    const afterReconcile = reconcileReleaseBundle({
      bundleDigest,
      executorReceiptPath: completeObservation,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(afterReconcile.release_bundle_reconcile.status, 'complete');
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.latest_eligible,
      true,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('verify rejects a qualification receipt bound to a different transitive Package cohort', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({ root: fixture.root, bundleDigest }),
      storeRoot: fixture.storeRoot,
    });
    const qualificationReceiptPath = writeQualification({
      root: fixture.root,
      bundle: fixture.request,
      bundleDigest,
    });
    const qualification = JSON.parse(fs.readFileSync(qualificationReceiptPath, 'utf8'));
    qualification.cohort.package_payload_manifest_sha256.mas = digest('different-package-cohort');
    writeJson(qualificationReceiptPath, qualification);
    assert.throws(
      () => verifyReleaseBundle({
        bundleDigest,
        track: 'standard',
        qualificationReceiptPath,
        storeRoot: fixture.storeRoot,
      }),
      /cohort does not match the immutable Release Bundle inputs/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('release mutation CLI and direct callers reject missing operation identity with typed failures', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const executorReceiptPath = writeBuildReceipt({ root: fixture.root, bundleDigest });
    for (const [command, requiredReceipt] of [
      ['operation admit', []],
      ['build', ['--executor-receipt', executorReceiptPath]],
      ['verify', ['--qualification-receipt', path.join(fixture.root, 'qualification.json')]],
      ['publish', ['--executor-receipt', path.join(fixture.root, 'remote.json')]],
      ['reconcile', ['--executor-receipt', path.join(fixture.root, 'reconcile.json')]],
    ] as const) {
      const failure = runCliFailureInCwd([
        'release',
        ...command.split(' '),
        '--bundle',
        bundleDigest,
        ...requiredReceipt,
        '--store',
        fixture.storeRoot,
        '--json',
      ], fixture.root);
      assert.equal(failure.status, 2, command);
      assert.equal(failure.payload.error.code, 'cli_usage_error', command);
      assert.match(failure.payload.error.message, /requires --operation/, command);
    }

    assertTypedContractFailure(
      () => buildReleaseBundleAuthority({
        bundleDigest,
        executorReceiptPath,
        storeRoot: fixture.storeRoot,
      } as Parameters<typeof buildReleaseBundleAuthority>[0]),
      /operation identity does not match/,
    );
    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        bundleDigest,
        releaseOperation: 'standard',
        operationId: standardOperation.operationId,
        operationStartedAt: standardOperation.operationStartedAt,
        storeRoot: fixture.storeRoot,
      } as Parameters<typeof admitReleaseBundleOperation>[0]),
      /operation_deadline_at must be a non-empty string/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Standard operation control freezes once, resume cannot refresh it, and append_full is independent', () => {
  const fixture = createFixture({ admitStandard: false });
  const missingResume = createFixture({ admitStandard: false });
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const admitted = admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:01:00.000Z',
      ...standardOperation,
    }).release_bundle_operation_admit;
    const admittedAgain = admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:02:00.000Z',
      ...standardOperation,
    }).release_bundle_operation_admit;
    assert.equal(admitted.status, 'complete');
    assert.equal(admittedAgain.status, 'idempotent');
    assert.equal(
      admittedAgain.operation_control.control_digest,
      admitted.operation_control.control_digest,
    );

    const resumeOperation = {
      ...standardOperation,
      releaseOperation: 'resume_standard' as const,
    };
    const resumed = admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:03:00.000Z',
      ...resumeOperation,
    }).release_bundle_operation_admit;
    assert.equal(resumed.status, 'idempotent');
    assert.equal(resumed.operation_control.control_digest, admitted.operation_control.control_digest);
    for (const changed of [
      { ...resumeOperation, operationId: 'operation-standard-refreshed' },
      { ...resumeOperation, operationStartedAt: '2026-07-21T00:00:01.000Z' },
      { ...resumeOperation, operationDeadlineAt: '2099-07-21T01:31:00.000Z' },
    ]) {
      assertTypedContractFailure(
        () => admitReleaseBundleOperation({
          bundleDigest,
          storeRoot: fixture.storeRoot,
          now: '2026-07-21T00:03:00.000Z',
          ...changed,
        }),
        /immutable and does not match/,
      );
    }
    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        bundleDigest: missingResume.frozen.release_bundle_freeze.bundle_digest,
        storeRoot: missingResume.storeRoot,
        now: '2026-07-21T00:03:00.000Z',
        ...resumeOperation,
      }),
      /requires an existing Standard operation control/,
    );

    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        bundleDigest,
        storeRoot: fixture.storeRoot,
        now: '2026-07-21T00:04:00.000Z',
        ...appendFullOperation,
      }),
      /requires a qualified Standard checkpoint/,
    );
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({ root: fixture.root, bundleDigest }),
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:04:00.000Z',
    });
    verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
      }),
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:05:00.000Z',
    });
    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        bundleDigest,
        storeRoot: fixture.storeRoot,
        now: '2026-07-21T00:06:00.000Z',
        ...appendFullOperation,
        operationId: standardOperation.operationId,
      }),
      /independent operation identity/,
    );
    const append = admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:06:00.000Z',
      ...appendFullOperation,
    }).release_bundle_operation_admit.operation_control;
    assert.notEqual(append.operation_id, admitted.operation_control.operation_id);
    assert.notEqual(append.operation_deadline_at, admitted.operation_control.operation_deadline_at);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(missingResume.root, { recursive: true, force: true });
  }
});

test('checkpoint preserves exact operation controls while legacy checkpoints remain permanently read-only', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const currentDirectory = path.join(fixture.root, 'current-control-checkpoint');
    exportReleaseBundleCheckpoint({
      bundleDigest,
      outputDirectory: currentDirectory,
      storeRoot: fixture.storeRoot,
    });
    const checkpointPath = path.join(currentDirectory, 'checkpoint.json');
    const currentCheckpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
    assert.equal(
      currentCheckpoint.operation_controls.standard.control_digest,
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.operation_controls.standard?.control_digest,
    );

    const importedStore = path.join(fixture.root, 'current-imported-store');
    const imported = importReleaseBundleCheckpoint({ checkpointPath, storeRoot: importedStore })
      .release_bundle_checkpoint_import;
    assert.equal(imported.live_mutation_compatible, true);
    const resumed = admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: importedStore,
      ...standardOperation,
      releaseOperation: 'resume_standard',
    }).release_bundle_operation_admit;
    assert.equal(
      resumed.operation_control.control_digest,
      currentCheckpoint.operation_controls.standard.control_digest,
    );

    const wrongSlotDirectory = path.join(fixture.root, 'wrong-slot-checkpoint');
    fs.cpSync(currentDirectory, wrongSlotDirectory, { recursive: true });
    const wrongSlotPath = path.join(wrongSlotDirectory, 'checkpoint.json');
    const wrongSlotCheckpoint = JSON.parse(fs.readFileSync(wrongSlotPath, 'utf8'));
    const { control_digest: _standardControlDigest, ...standardControlCore } =
      wrongSlotCheckpoint.operation_controls.standard;
    const appendControlCore = {
      ...standardControlCore,
      operation_id: 'forged-append-full-before-standard-qualification',
      operation_kind: 'append_full',
      track: 'full',
      operation_started_at: appendFullOperation.operationStartedAt,
      operation_deadline_at: appendFullOperation.operationDeadlineAt,
    };
    const forgedAppendControl = {
      ...appendControlCore,
      control_digest: digest(canonicalJsonBytes(appendControlCore)),
    };
    wrongSlotCheckpoint.operation_controls = {
      standard: forgedAppendControl,
      append_full: null,
    };
    const { checkpoint_digest: _wrongSlotDigest, ...wrongSlotCore } = wrongSlotCheckpoint;
    wrongSlotCheckpoint.checkpoint_digest = digest(canonicalJsonBytes(wrongSlotCore));
    writeJson(wrongSlotPath, wrongSlotCheckpoint);
    assertTypedContractFailure(
      () => importReleaseBundleCheckpoint({
        checkpointPath: wrongSlotPath,
        storeRoot: path.join(fixture.root, 'wrong-slot-store'),
      }),
      /release-bundle-checkpoint|JSON schema/i,
    );

    const legacyDirectory = path.join(fixture.root, 'legacy-checkpoint');
    fs.cpSync(currentDirectory, legacyDirectory, { recursive: true });
    const legacyCheckpointPath = path.join(legacyDirectory, 'checkpoint.json');
    const legacyCheckpoint = JSON.parse(fs.readFileSync(legacyCheckpointPath, 'utf8'));
    delete legacyCheckpoint.operation_controls;
    delete legacyCheckpoint.active_unknown_markers;
    const { checkpoint_digest: _oldDigest, ...legacyCore } = legacyCheckpoint;
    legacyCheckpoint.checkpoint_digest = digest(canonicalJsonBytes(legacyCore));
    writeJson(legacyCheckpointPath, legacyCheckpoint);

    const legacyStore = path.join(fixture.root, 'legacy-imported-store');
    const legacyImport = importReleaseBundleCheckpoint({
      checkpointPath: legacyCheckpointPath,
      storeRoot: legacyStore,
    }).release_bundle_checkpoint_import;
    assert.equal(legacyImport.live_mutation_compatible, false);
    assert.equal(
      importReleaseBundleCheckpoint({ checkpointPath: legacyCheckpointPath, storeRoot: legacyStore })
        .release_bundle_checkpoint_import.live_mutation_compatible,
      false,
    );
    assert.equal(
      importReleaseBundleCheckpoint({ checkpointPath, storeRoot: legacyStore })
        .release_bundle_checkpoint_import.live_mutation_compatible,
      false,
    );
    const legacyStatus = readReleaseBundleStatus({ bundleDigest, storeRoot: legacyStore })
      .release_bundle_status;
    assert.equal(legacyStatus.operation_control_compatible, false);
    assert.equal(legacyStatus.live_mutation_allowed, false);
    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        bundleDigest,
        storeRoot: legacyStore,
        ...standardOperation,
      }),
      /legacy checkpoint without operation control is read-only/,
    );
    assertTypedContractFailure(
      () => buildReleaseBundle({
        bundleDigest,
        executorReceiptPath: writeBuildReceipt({
          root: fixture.root,
          bundleDigest,
          attemptId: 'legacy-live-build',
        }),
        storeRoot: legacyStore,
      }),
      /legacy checkpoint without operation control is read-only/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Bundle state transitions use one cross-process lock and public mutations cannot reenter it', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const paths = releaseBundleStorePaths(bundleDigest, fixture.storeRoot);
    const storeModuleUrl = pathToFileURL(
      path.join(repoRoot, 'src/modules/connect/release-bundle/store.ts'),
    ).href;
    const buildReceipt = writeBuildReceipt({
      root: fixture.root,
      bundleDigest,
      attemptId: 'lock-exclusion-build',
    });
    withReleaseBundleStateLock(paths, () => {
      const child = spawnSync(process.execPath, [
        '--experimental-strip-types',
        '--input-type=module',
        '--eval',
        `
          import {
            releaseBundleStorePaths,
            withReleaseBundleStateLock,
          } from ${JSON.stringify(storeModuleUrl)};
          const paths = releaseBundleStorePaths(
            ${JSON.stringify(bundleDigest)},
            ${JSON.stringify(fixture.storeRoot)},
          );
          try {
            withReleaseBundleStateLock(paths, () => {}, { maxWaitMs: 0 });
          } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(23);
          }
        `,
      ], {
        cwd: repoRoot,
        encoding: 'utf8',
      });
      assert.equal(child.status, 23, child.stderr);
      assert.match(child.stderr, /state transition is already locked by another process/);
      assertTypedContractFailure(
        () => buildReleaseBundle({
          bundleDigest,
          executorReceiptPath: buildReceipt,
          storeRoot: fixture.storeRoot,
        }),
        /state transition lock is not reentrant/,
      );
    });
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.tracks.standard.built,
      false,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('durable unknown marker binds exact identity, blocks the whole Bundle, and only exact reconcile clears it', () => {
  const fixture = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({ root: fixture.root, bundleDigest }),
      storeRoot: fixture.storeRoot,
    });
    verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
      }),
      storeRoot: fixture.storeRoot,
    });
    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'standard-assets-complete-before-marker',
        assets: [
          { name: 'standard.dmg', bytes: 'standard dmg' },
          { name: 'latest.yml', bytes: 'updater' },
        ],
      }),
      storeRoot: fixture.storeRoot,
    });
    admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      ...appendFullOperation,
    });
    buildReleaseBundle({
      ...appendFullOperation,
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        track: 'full',
        attemptId: 'full-build-before-marker',
      }),
      storeRoot: fixture.storeRoot,
    });
    verifyReleaseBundle({
      ...appendFullOperation,
      bundleDigest,
      track: 'full',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
        track: 'full',
      }),
      storeRoot: fixture.storeRoot,
    });
    publishReleaseBundle({
      ...appendFullOperation,
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        track: 'full',
        attemptId: 'full-assets-complete-before-marker',
        assets: [
          { name: 'full.dmg', bytes: 'full dmg' },
          { name: 'full-manifest.json', bytes: '{}' },
        ],
      }),
      storeRoot: fixture.storeRoot,
    });

    const target = `github-latest:gaofeng21cn/one-person-lab@${digest('latest-target')}`;
    const priorAttempt = 'latest-patch-unknown';
    const unknown = publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: priorAttempt,
        outcome: 'unknown',
        remoteTarget: target,
        publicationScope: 'external_target',
      }),
      storeRoot: fixture.storeRoot,
    }).release_bundle_publish;
    assert.equal(unknown.status, 'reconcile_only');
    const marker = readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
      .release_bundle_status.active_unknown_markers[0];
    assert.deepEqual({
      bundle_digest: marker.bundle_digest,
      operation_id: marker.operation_id,
      operation_kind: marker.operation_kind,
      stage_operation: marker.stage_operation,
      publication_scope: marker.publication_scope,
      track: marker.track,
      remote_target: marker.remote_target,
      prior_mutation_attempt_id: marker.prior_mutation_attempt_id,
    }, {
      bundle_digest: bundleDigest,
      operation_id: standardOperation.operationId,
      operation_kind: 'standard',
      stage_operation: 'publish',
      publication_scope: 'external_target',
      track: 'standard',
      remote_target: target,
      prior_mutation_attempt_id: priorAttempt,
    });
    const assertMarkerUnchanged = () => {
      const markers = readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.active_unknown_markers;
      assert.equal(markers.length, 1);
      assert.equal(markers[0].marker_digest, marker.marker_digest);
    };

    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        bundleDigest,
        storeRoot: fixture.storeRoot,
        ...standardOperation,
      }),
      /blocks every ordinary mutation/,
    );
    assertTypedContractFailure(
      () => buildReleaseBundle({
        ...appendFullOperation,
        bundleDigest,
        executorReceiptPath: writeBuildReceipt({
          root: fixture.root,
          bundleDigest,
          track: 'full',
          attemptId: 'blocked-full-build',
        }),
        storeRoot: fixture.storeRoot,
      }),
      /blocks every ordinary mutation/,
    );
    assertTypedContractFailure(
      () => verifyReleaseBundle({
        ...appendFullOperation,
        bundleDigest,
        track: 'full',
        qualificationReceiptPath: writeQualification({
          root: fixture.root,
          bundle: fixture.request,
          bundleDigest,
          track: 'full',
        }),
        storeRoot: fixture.storeRoot,
      }),
      /blocks every ordinary mutation/,
    );
    assertTypedContractFailure(
      () => publishReleaseBundle({
        ...appendFullOperation,
        bundleDigest,
        executorReceiptPath: writeRemoteInspection({
          root: fixture.root,
          bundleDigest,
          track: 'full',
          attemptId: 'blocked-full-publish',
          assets: [
            { name: 'full.dmg', bytes: 'full dmg' },
            { name: 'full-manifest.json', bytes: '{}' },
          ],
        }),
        storeRoot: fixture.storeRoot,
      }),
      /blocks every ordinary mutation/,
    );
    assertMarkerUnchanged();

    const mismatchCases: Array<{ label: string; action: () => unknown; message: RegExp }> = [
      {
        label: 'bundle',
        action: () => reconcileReleaseBundle({
          bundleDigest,
          executorReceiptPath: writeRemoteInspection({
            root: fixture.root,
            bundleDigest: `sha256:${'f'.repeat(64)}`,
            attemptId: 'wrong-bundle-observation',
            remoteTarget: target,
            priorAttemptId: priorAttempt,
            publicationScope: 'external_target',
          }),
          storeRoot: fixture.storeRoot,
        }),
        message: /different Release Bundle/,
      },
      {
        label: 'operation id',
        action: () => reconcileReleaseBundle({
          bundleDigest,
          operationId: 'wrong-operation-id',
          executorReceiptPath: writeRemoteInspection({
            root: fixture.root,
            bundleDigest,
            attemptId: 'wrong-operation-observation',
            operationId: 'wrong-operation-id',
            remoteTarget: target,
            priorAttemptId: priorAttempt,
            publicationScope: 'external_target',
          }),
          storeRoot: fixture.storeRoot,
        }),
        message: /immutable and does not match/,
      },
      {
        label: 'target',
        action: () => reconcileReleaseBundle({
          bundleDigest,
          executorReceiptPath: writeRemoteInspection({
            root: fixture.root,
            bundleDigest,
            attemptId: 'wrong-target-observation',
            remoteTarget: `github-latest:gaofeng21cn/other@${digest('other')}`,
            priorAttemptId: priorAttempt,
            publicationScope: 'external_target',
          }),
          storeRoot: fixture.storeRoot,
        }),
        message: /does not match the exact unknown outcome marker/,
      },
      {
        label: 'prior attempt',
        action: () => reconcileReleaseBundle({
          bundleDigest,
          executorReceiptPath: writeRemoteInspection({
            root: fixture.root,
            bundleDigest,
            attemptId: 'wrong-prior-observation',
            remoteTarget: target,
            priorAttemptId: 'another-attempt',
            publicationScope: 'external_target',
          }),
          storeRoot: fixture.storeRoot,
        }),
        message: /does not match the exact unknown outcome marker/,
      },
      {
        label: 'publication scope',
        action: () => reconcileReleaseBundle({
          bundleDigest,
          executorReceiptPath: writeRemoteInspection({
            root: fixture.root,
            bundleDigest,
            attemptId: 'wrong-scope-observation',
            remoteTarget: target,
            priorAttemptId: priorAttempt,
            publicationScope: 'track_assets',
            assets: [
              { name: 'standard.dmg', bytes: 'standard dmg' },
              { name: 'latest.yml', bytes: 'updater' },
            ],
          }),
          storeRoot: fixture.storeRoot,
        }),
        message: /does not match the exact unknown outcome marker/,
      },
      {
        label: 'operation and track',
        action: () => reconcileReleaseBundle({
          ...appendFullOperation,
          bundleDigest,
          executorReceiptPath: writeRemoteInspection({
            root: fixture.root,
            bundleDigest,
            track: 'full',
            attemptId: 'wrong-track-observation',
            remoteTarget: target,
            priorAttemptId: priorAttempt,
            publicationScope: 'external_target',
          }),
          storeRoot: fixture.storeRoot,
        }),
        message: /requires a prior durable unknown outcome marker/,
      },
      {
        label: 'stage operation',
        action: () => reconcileReleaseBundle({
          bundleDigest,
          executorReceiptPath: writeBuildReceipt({
            root: fixture.root,
            bundleDigest,
            attemptId: 'wrong-stage-observation',
            remoteTarget: target,
            priorAttemptId: priorAttempt,
          }),
          storeRoot: fixture.storeRoot,
        }),
        message: /requires a prior durable unknown outcome marker/,
      },
    ];
    for (const mismatch of mismatchCases) {
      assertTypedContractFailure(mismatch.action, mismatch.message);
      assertMarkerUnchanged();
    }

    const stillUnknown = reconcileReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'latest-readback-still-unknown',
        outcome: 'unknown',
        remoteTarget: target,
        priorAttemptId: priorAttempt,
        publicationScope: 'external_target',
      }),
      storeRoot: fixture.storeRoot,
    }).release_bundle_reconcile;
    assert.equal(stillUnknown.status, 'reconcile_only');
    assertMarkerUnchanged();

    const completeObservation = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'latest-readback-complete',
      remoteTarget: target,
      priorAttemptId: priorAttempt,
      publicationScope: 'external_target',
    });
    assert.equal(reconcileReleaseBundle({
      bundleDigest,
      executorReceiptPath: completeObservation,
      storeRoot: fixture.storeRoot,
    }).release_bundle_reconcile.status, 'complete');
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.active_unknown_markers.length,
      0,
    );
    assertTypedContractFailure(
      () => reconcileReleaseBundle({
        bundleDigest,
        executorReceiptPath: completeObservation,
        storeRoot: fixture.storeRoot,
      }),
      /requires a prior durable unknown outcome marker/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('resume_standard exactly reconciles a Standard unknown after deadline without refreshing or advancing state', () => {
  const fixture = createFixture({ admitStandard: false });
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    const expiringStandard = {
      releaseOperation: 'standard' as const,
      operationId: 'operation-standard-expiring',
      operationStartedAt: '2026-07-21T00:00:00.000Z',
      operationDeadlineAt: '2026-07-21T00:10:00.000Z',
    };
    admitReleaseBundleOperation({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:01:00.000Z',
      ...expiringStandard,
    });
    const target = 'executor:local-standard-expiring';
    const priorAttempt = 'standard-build-unknown-before-run-ended';
    assert.equal(buildReleaseBundle({
      ...expiringStandard,
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        attemptId: priorAttempt,
        outcome: 'unknown',
        operationId: expiringStandard.operationId,
        remoteTarget: target,
      }),
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:05:00.000Z',
    }).release_bundle_build.status, 'reconcile_only');
    const markerBefore = readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
      .release_bundle_status.active_unknown_markers[0];
    assert.equal(markerBefore.operation_kind, 'standard');

    const resume = {
      ...expiringStandard,
      releaseOperation: 'resume_standard' as const,
    };
    assertTypedContractFailure(
      () => reconcileReleaseBundle({
        ...resume,
        operationDeadlineAt: '2026-07-21T00:20:00.000Z',
        bundleDigest,
        executorReceiptPath: writeBuildReceipt({
          root: fixture.root,
          bundleDigest,
          attemptId: 'refreshed-deadline-observation',
          releaseOperation: 'resume_standard',
          operationId: expiringStandard.operationId,
          remoteTarget: target,
          priorAttemptId: priorAttempt,
        }),
        storeRoot: fixture.storeRoot,
        now: '2026-07-21T00:11:00.000Z',
      }),
      /immutable and does not match/,
    );
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.active_unknown_markers[0].marker_digest,
      markerBefore.marker_digest,
    );

    const stillUnknown = reconcileReleaseBundle({
      ...resume,
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({
        root: fixture.root,
        bundleDigest,
        attemptId: 'resume-readback-still-unknown',
        outcome: 'unknown',
        releaseOperation: 'resume_standard',
        operationId: expiringStandard.operationId,
        remoteTarget: target,
        priorAttemptId: priorAttempt,
      }),
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:11:00.000Z',
    }).release_bundle_reconcile;
    assert.equal(stillUnknown.status, 'reconcile_only');
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.active_unknown_markers[0].marker_digest,
      markerBefore.marker_digest,
    );

    const completeObservation = writeBuildReceipt({
      root: fixture.root,
      bundleDigest,
      attemptId: 'resume-readback-late-success',
      releaseOperation: 'resume_standard',
      operationId: expiringStandard.operationId,
      remoteTarget: target,
      priorAttemptId: priorAttempt,
    });
    const late = reconcileReleaseBundle({
      ...resume,
      bundleDigest,
      executorReceiptPath: completeObservation,
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:11:00.000Z',
    }).release_bundle_reconcile;
    assert.equal(late.status, 'late_observation');
    assert.equal(late.receipt.release_operation, 'resume_standard');
    assert.equal(late.receipt.operation_control?.operation_deadline_at, expiringStandard.operationDeadlineAt);
    assert.equal(late.receipt.details.stage_advanced, false);
    const status = readReleaseBundleStatus({
      bundleDigest,
      storeRoot: fixture.storeRoot,
      now: '2026-07-21T00:11:00.000Z',
    }).release_bundle_status;
    assert.equal(status.operation_controls.standard?.operation_deadline_at, expiringStandard.operationDeadlineAt);
    assert.equal(status.operation_controls.standard?.deadline_elapsed, true);
    assert.equal(status.active_unknown_markers.length, 0);
    assert.equal(status.tracks.standard.built, false);
    assert.equal(status.latest_eligible, false);
    assertTypedContractFailure(
      () => reconcileReleaseBundle({
        ...resume,
        bundleDigest,
        executorReceiptPath: completeObservation,
        storeRoot: fixture.storeRoot,
        now: '2026-07-21T00:12:00.000Z',
      }),
      /requires a prior durable unknown outcome marker/,
    );
    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        ...resume,
        bundleDigest,
        storeRoot: fixture.storeRoot,
        now: '2026-07-21T00:12:00.000Z',
      }),
      /absolute operation deadline has elapsed/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('elapsed absolute deadline blocks admit, build, verify, and publish while status stays readable', () => {
  const fixtures = Array.from({ length: 4 }, () => createFixture({ admitStandard: false }));
  const expiringStandard = {
    releaseOperation: 'standard' as const,
    operationId: 'operation-deadline-gate',
    operationStartedAt: '2026-07-21T00:00:00.000Z',
    operationDeadlineAt: '2026-07-21T00:10:00.000Z',
  };
  const before = '2026-07-21T00:05:00.000Z';
  const after = '2026-07-21T00:11:00.000Z';
  try {
    const [admitFixture, buildFixture, verifyFixture, publishFixture] = fixtures;
    assertTypedContractFailure(
      () => admitReleaseBundleOperation({
        ...expiringStandard,
        bundleDigest: admitFixture.frozen.release_bundle_freeze.bundle_digest,
        storeRoot: admitFixture.storeRoot,
        now: after,
      }),
      /absolute operation deadline has elapsed/,
    );
    assert.equal(
      readReleaseBundleStatus({
        bundleDigest: admitFixture.frozen.release_bundle_freeze.bundle_digest,
        storeRoot: admitFixture.storeRoot,
        now: after,
      }).release_bundle_status.operation_controls.standard,
      null,
    );

    for (const fixture of [buildFixture, verifyFixture, publishFixture]) {
      admitReleaseBundleOperation({
        ...expiringStandard,
        bundleDigest: fixture.frozen.release_bundle_freeze.bundle_digest,
        storeRoot: fixture.storeRoot,
        now: before,
      });
    }
    const buildDigest = buildFixture.frozen.release_bundle_freeze.bundle_digest;
    assertTypedContractFailure(
      () => buildReleaseBundle({
        ...expiringStandard,
        bundleDigest: buildDigest,
        executorReceiptPath: writeBuildReceipt({
          root: buildFixture.root,
          bundleDigest: buildDigest,
          operationId: expiringStandard.operationId,
          attemptId: 'expired-build',
        }),
        storeRoot: buildFixture.storeRoot,
        now: after,
      }),
      /absolute operation deadline has elapsed/,
    );
    assert.equal(readReleaseBundleStatus({
      bundleDigest: buildDigest,
      storeRoot: buildFixture.storeRoot,
      now: after,
    }).release_bundle_status.operation_controls.standard?.deadline_elapsed, true);

    const verifyDigest = verifyFixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      ...expiringStandard,
      bundleDigest: verifyDigest,
      executorReceiptPath: writeBuildReceipt({
        root: verifyFixture.root,
        bundleDigest: verifyDigest,
        operationId: expiringStandard.operationId,
        attemptId: 'before-deadline-build-for-verify',
      }),
      storeRoot: verifyFixture.storeRoot,
      now: before,
    });
    assertTypedContractFailure(
      () => verifyReleaseBundle({
        ...expiringStandard,
        bundleDigest: verifyDigest,
        track: 'standard',
        qualificationReceiptPath: writeQualification({
          root: verifyFixture.root,
          bundle: verifyFixture.request,
          bundleDigest: verifyDigest,
        }),
        storeRoot: verifyFixture.storeRoot,
        now: after,
      }),
      /absolute operation deadline has elapsed/,
    );

    const publishDigest = publishFixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      ...expiringStandard,
      bundleDigest: publishDigest,
      executorReceiptPath: writeBuildReceipt({
        root: publishFixture.root,
        bundleDigest: publishDigest,
        operationId: expiringStandard.operationId,
        attemptId: 'before-deadline-build-for-publish',
      }),
      storeRoot: publishFixture.storeRoot,
      now: before,
    });
    verifyReleaseBundle({
      ...expiringStandard,
      bundleDigest: publishDigest,
      track: 'standard',
      qualificationReceiptPath: writeQualification({
        root: publishFixture.root,
        bundle: publishFixture.request,
        bundleDigest: publishDigest,
      }),
      storeRoot: publishFixture.storeRoot,
      now: before,
    });
    assertTypedContractFailure(
      () => publishReleaseBundle({
        ...expiringStandard,
        bundleDigest: publishDigest,
        executorReceiptPath: writeRemoteInspection({
          root: publishFixture.root,
          bundleDigest: publishDigest,
          operationId: expiringStandard.operationId,
          attemptId: 'expired-publish',
          assets: [
            { name: 'standard.dmg', bytes: 'standard dmg' },
            { name: 'latest.yml', bytes: 'updater' },
          ],
        }),
        storeRoot: publishFixture.storeRoot,
        now: after,
      }),
      /absolute operation deadline has elapsed/,
    );
  } finally {
    for (const fixture of fixtures) fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Latest PATCH and Homebrew use the same external-target unknown/reconcile ABI without asset retry', () => {
  const fixture = createFixture();
  const premature = createFixture();
  try {
    const bundleDigest = fixture.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeBuildReceipt({ root: fixture.root, bundleDigest }),
      storeRoot: fixture.storeRoot,
    });
    verifyReleaseBundle({
      bundleDigest,
      track: 'standard',
      qualificationReceiptPath: writeQualification({
        root: fixture.root,
        bundle: fixture.request,
        bundleDigest,
      }),
      storeRoot: fixture.storeRoot,
    });
    publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: writeRemoteInspection({
        root: fixture.root,
        bundleDigest,
        attemptId: 'asset-publication-complete',
        assets: [
          { name: 'standard.dmg', bytes: 'standard dmg' },
          { name: 'latest.yml', bytes: 'updater' },
        ],
      }),
      storeRoot: fixture.storeRoot,
    });

    for (const external of [
      {
        label: 'latest',
        target: `github-latest:gaofeng21cn/one-person-lab@${digest('v26.7.21-r1')}`,
      },
      {
        label: 'homebrew',
        target: `homebrew:gaofeng21cn/homebrew-tap/one-person-lab@${digest('cask-commit')}`,
      },
    ]) {
      const priorAttempt = `${external.label}-mutation-unknown`;
      assert.equal(publishReleaseBundle({
        bundleDigest,
        executorReceiptPath: writeRemoteInspection({
          root: fixture.root,
          bundleDigest,
          attemptId: priorAttempt,
          outcome: 'unknown',
          remoteTarget: external.target,
          publicationScope: 'external_target',
        }),
        storeRoot: fixture.storeRoot,
      }).release_bundle_publish.status, 'reconcile_only');
      const marker = readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.active_unknown_markers[0];
      assert.equal(marker.remote_target, external.target);
      assert.equal(marker.prior_mutation_attempt_id, priorAttempt);
      assert.equal(marker.publication_scope, 'external_target');
      assertTypedContractFailure(
        () => publishReleaseBundle({
          bundleDigest,
          executorReceiptPath: writeRemoteInspection({
            root: fixture.root,
            bundleDigest,
            attemptId: `${external.label}-forbidden-retry`,
            remoteTarget: external.target,
            publicationScope: 'external_target',
          }),
          storeRoot: fixture.storeRoot,
        }),
        /blocks every ordinary mutation/,
      );
      const unknownReadback = reconcileReleaseBundle({
        bundleDigest,
        executorReceiptPath: writeRemoteInspection({
          root: fixture.root,
          bundleDigest,
          attemptId: `${external.label}-readback-unknown`,
          outcome: 'unknown',
          remoteTarget: external.target,
          priorAttemptId: priorAttempt,
          publicationScope: 'external_target',
        }),
        storeRoot: fixture.storeRoot,
      }).release_bundle_reconcile;
      assert.equal(unknownReadback.status, 'reconcile_only');
      assert.deepEqual(unknownReadback.receipt.details.upload_actions, []);
      assert.equal(
        readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
          .release_bundle_status.active_unknown_markers[0].marker_digest,
        marker.marker_digest,
      );
      const completeReadback = reconcileReleaseBundle({
        bundleDigest,
        executorReceiptPath: writeRemoteInspection({
          root: fixture.root,
          bundleDigest,
          attemptId: `${external.label}-readback-complete`,
          remoteTarget: external.target,
          priorAttemptId: priorAttempt,
          publicationScope: 'external_target',
        }),
        storeRoot: fixture.storeRoot,
      }).release_bundle_reconcile;
      assert.equal(completeReadback.status, 'complete');
      assert.deepEqual(completeReadback.receipt.details.upload_actions, []);
      assert.equal(completeReadback.receipt.details.track_assets_confirmed, true);
      assert.equal(
        readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
          .release_bundle_status.active_unknown_markers.length,
        0,
      );
    }
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.latest_eligible,
      true,
    );

    const prematureDigest = premature.frozen.release_bundle_freeze.bundle_digest;
    buildReleaseBundle({
      bundleDigest: prematureDigest,
      executorReceiptPath: writeBuildReceipt({ root: premature.root, bundleDigest: prematureDigest }),
      storeRoot: premature.storeRoot,
    });
    verifyReleaseBundle({
      bundleDigest: prematureDigest,
      track: 'standard',
      qualificationReceiptPath: writeQualification({
        root: premature.root,
        bundle: premature.request,
        bundleDigest: prematureDigest,
      }),
      storeRoot: premature.storeRoot,
    });
    assertTypedContractFailure(
      () => publishReleaseBundle({
        bundleDigest: prematureDigest,
        executorReceiptPath: writeRemoteInspection({
          root: premature.root,
          bundleDigest: prematureDigest,
          attemptId: 'premature-latest-unknown',
          outcome: 'unknown',
          remoteTarget: 'github-latest:gaofeng21cn/one-person-lab@premature',
          publicationScope: 'external_target',
        }),
        storeRoot: premature.storeRoot,
      }),
      /requires completed track asset publication first/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(premature.root, { recursive: true, force: true });
  }
});
