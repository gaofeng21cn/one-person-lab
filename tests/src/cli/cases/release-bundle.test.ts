import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { repoRoot, runCliInCwd } from '../helpers.ts';

import {
  buildReleaseBundle,
  freezeReleaseBundle,
  publishReleaseBundle,
  readReleaseBundleStatus,
  reconcileReleaseBundle,
  verifyReleaseBundle,
} from '../../../../src/modules/connect/release-bundle/index.ts';

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

function fixtureRequest(sourceRoot: string) {
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
        required_asset_names: ['standard.dmg', 'latest.yml'],
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

function writeQualification(input: {
  root: string;
  bundle: ReturnType<typeof fixtureRequest>;
  bundleDigest: string;
  track?: 'standard' | 'full';
  subject?: { name: string; bytes: string };
}) {
  const track = input.track ?? 'standard';
  const subject = input.subject ?? (track === 'standard'
    ? { name: 'standard.dmg', bytes: 'standard dmg' }
    : { name: 'full.dmg', bytes: 'full dmg' });
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
      framework_release_set_digest: input.bundle.framework_release_set.digest,
      package_payload_manifest_sha256: Object.fromEntries(packageIds.map((packageId) => [
        packageId,
        input.bundle.packages[packageId].payload_manifest_sha256,
      ])),
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

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-bundle-'));
  const sourceRoot = path.join(root, 'source');
  const storeRoot = path.join(root, 'store');
  const requestPath = path.join(root, 'freeze.json');
  const request = fixtureRequest(sourceRoot);
  writeJson(requestPath, request);
  const frozen = freezeReleaseBundle({ requestPath, sourceRoot, storeRoot });
  return { root, sourceRoot, storeRoot, requestPath, request, frozen };
}

function writeBuildReceipt(input: {
  root: string;
  bundleDigest: string;
  track?: 'standard' | 'full';
  executor?: 'local' | 'remote';
  attemptId?: string;
  outcome?: 'complete' | 'unknown';
  assets?: Array<{ name: string; bytes: string }>;
}) {
  const track = input.track ?? 'standard';
  const outcome = input.outcome ?? 'complete';
  const receiptPath = path.join(input.root, `${track}-${input.attemptId ?? 'build'}.json`);
  const assets = outcome === 'unknown' ? [] : (input.assets ?? (
    track === 'standard'
      ? [{ name: 'standard.dmg', bytes: 'standard dmg' }, { name: 'latest.yml', bytes: 'updater' }]
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
  });
  return receiptPath;
}

function writeRemoteInspection(input: {
  root: string;
  bundleDigest: string;
  track?: 'standard' | 'full';
  executor?: 'local' | 'remote';
  attemptId: string;
  outcome?: 'complete' | 'unknown';
  assets?: Array<{ name: string; bytes: string }>;
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
    assets: input.outcome === 'unknown' ? [] : (input.assets ?? []).map((asset) => ({
      name: asset.name,
      size_bytes: Buffer.byteLength(asset.bytes),
      sha256: digest(asset.bytes),
    })),
  });
  return receiptPath;
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
      /reconcile is required/,
    );
    const reconciled = reconcileReleaseBundle({
      bundleDigest,
      executorReceiptPath: resolvedReceipt,
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
      /reconcile is required/,
    );
    const reconcileMissing = writeRemoteInspection({
      root: fixture.root,
      bundleDigest,
      attemptId: 'reconcile-missing',
      assets: [],
    });
    const reconciled = reconcileReleaseBundle({
      bundleDigest,
      executorReceiptPath: reconcileMissing,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(reconciled.release_bundle_reconcile.status, 'upload_required');
    assert.equal(
      readReleaseBundleStatus({ bundleDigest, storeRoot: fixture.storeRoot })
        .release_bundle_status.latest_eligible,
      false,
    );
    const afterReconcile = publishReleaseBundle({
      bundleDigest,
      executorReceiptPath: complete,
      storeRoot: fixture.storeRoot,
    });
    assert.equal(afterReconcile.release_bundle_publish.status, 'complete');
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
