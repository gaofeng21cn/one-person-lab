import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import { repoRoot } from '../helpers.ts';
import { FrameworkContractError } from '../../../../src/kernel/contract-validation.ts';
import {
  readBundledFullRuntimePackageCatalog,
} from '../../../../src/modules/connect/agent-package-registry-parts/bundled-full-runtime-catalog.ts';
import {
  assertReleaseBundleFreezeInputs,
} from '../../../../src/modules/connect/release-bundle/contracts.ts';
import type {
  ReleaseBundleFreezeRequest,
} from '../../../../src/modules/connect/release-bundle/types.ts';

const generation = '26.7.21';
const packageIds = [
  'mas',
  'mag',
  'rca',
  'oma',
  'obf',
  'mas-scholar-skills',
  'opl-flow',
] as const;
const catalogRef = 'contracts/opl-framework/bundled-full-runtime-package-catalog.json';
const releaseSetRef = `release/cohorts/${generation}/release-set.json`;
const ownerLockRef = `release/cohorts/${generation}/owner-cohort-lock.json`;

function sha256(bytes: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, any>;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function copyRef(sourceRoot: string, targetRoot: string, ref: string) {
  const source = path.join(sourceRoot, ...ref.split('/'));
  const target = path.join(targetRoot, ...ref.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function committedSurfaceFixture(
  t: TestContext,
  packageAuthority: 'release-set' | 'catalog' = 'release-set',
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-cohort-closure-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  copyRef(repoRoot, root, catalogRef);
  copyRef(repoRoot, root, releaseSetRef);
  copyRef(repoRoot, root, ownerLockRef);
  if (packageAuthority === 'catalog') {
    const catalog = readJson(path.join(repoRoot, catalogRef));
    for (const packageId of packageIds) {
      const entry = catalog.packages[packageId];
      copyRef(repoRoot, root, `contracts/opl-framework/${entry.manifest_ref}`);
      copyRef(repoRoot, root, `contracts/opl-framework/${entry.payload_manifest_ref}`);
    }
    return root;
  }

  const releaseSet = readJson(path.join(root, releaseSetRef));
  for (const packageId of packageIds) {
    const member = releaseSet.components.packages.members[packageId];
    copyRef(repoRoot, root, member.payload_manifest_ref);
    const payload = readJson(path.join(root, member.payload_manifest_ref));
    const manifest = readJson(path.join(repoRoot, member.manifest_ref));
    // The frozen digest proves this identity-only reconstruction is byte-exact.
    manifest.version = member.version;
    if (manifest.owner_language_version?.value !== undefined) {
      manifest.owner_language_version.value = member.version;
    }
    manifest.codex_surface.carrier_source_commit = member.source_commit;
    manifest.codex_surface.plugin_payload_manifest_url = path.posix.relative(
      path.posix.dirname(member.manifest_ref),
      member.payload_manifest_ref,
    );
    if (manifest.content_lock !== undefined) {
      manifest.content_lock = {
        algorithm: payload.content_lock.algorithm,
        canonicalization: payload.content_lock.canonicalization,
        paths: payload.files.map((entry: { path: string }) => entry.path),
        digest: payload.content_lock.digest,
      };
    }
    if (packageId === 'mas' && member.version === '0.2.16') {
      const scholarDependency = manifest.capability_dependencies.find(
        (entry: { package_id: string }) => entry.package_id === 'mas-scholar-skills',
      );
      scholarDependency.version_requirement = '>=0.2.0 <0.3.0';
      scholarDependency.required_for = ['workspace_or_quest_codex_discovery'];
    }
    const manifestPath = path.join(root, member.manifest_ref);
    writeJson(manifestPath, manifest);
    assert.equal(sha256(fs.readFileSync(manifestPath)), member.manifest_sha256);
    assert.equal(
      sha256(fs.readFileSync(path.join(root, member.payload_manifest_ref))),
      member.payload_manifest_sha256,
    );
  }
  return root;
}

function freezeRequest(root: string): ReleaseBundleFreezeRequest {
  const releaseSet = readJson(path.join(root, releaseSetRef));
  const ownerLock = readJson(path.join(root, ownerLockRef));
  const packages = Object.fromEntries(packageIds.map((packageId) => {
    const member = releaseSet.components.packages.members[packageId];
    const owner = ownerLock.packages[packageId];
    return [packageId, {
      package_id: packageId,
      version: member.version,
      owner_source_commit: owner.source_commit,
      manifest_ref: member.manifest_ref,
      manifest_sha256: member.manifest_sha256,
      payload_manifest_ref: member.payload_manifest_ref,
      payload_manifest_sha256: member.payload_manifest_sha256,
    }];
  }));
  const releaseSetPath = path.join(root, releaseSetRef);
  return {
    surface_kind: 'opl_release_bundle_freeze_request.v1',
    schema_ref: 'contracts/opl-framework/release-bundle-freeze-request.schema.json',
    release: {
      channel: 'stable',
      version: '26.7.21-r1',
      display_version: '26.7.21-r1',
      updater_version: '26.7.2101',
      tag: 'v26.7.21-r1',
      prerelease: false,
    },
    sources: {
      app: { repo: 'gaofeng21cn/one-person-lab-app', source_commit: '1'.repeat(40) },
      shell: { repo: 'gaofeng21cn/opl-aion-shell', source_commit: '2'.repeat(40) },
      framework: { repo: 'gaofeng21cn/one-person-lab', source_commit: '3'.repeat(40) },
    },
    framework_release_set: {
      generation,
      manifest_ref: releaseSetRef,
      digest: sha256(fs.readFileSync(releaseSetPath)),
    },
    packages,
    prepared_notes: {
      source: 'prepared_ai',
      format: 'markdown',
      markdown: '# One Person Lab 26.7.21-r1\n',
      evidence: { surface_kind: 'opl_app_release_notes_evidence.v1' },
    },
    tracks: {
      standard: {
        required_asset_names: ['One-Person-Lab-26.7.21-r1-mac-arm64.zip'],
        required_for_latest: true,
        additive_only: false,
        updater_metadata_allowed: true,
      },
      full: {
        required_asset_names: ['One-Person-Lab-Full-26.7.21-r1-mac-arm64.dmg'],
        required_for_latest: false,
        additive_only: true,
        updater_metadata_allowed: false,
      },
    },
  } as unknown as ReleaseBundleFreezeRequest;
}

test('committed 26.7.21 cohort closes catalog, owner lock, manifests, and payloads', (t) => {
  const root = committedSurfaceFixture(t);
  const catalog = readBundledFullRuntimePackageCatalog();
  assert.deepEqual([...catalog.entries.keys()].sort(), [...packageIds].sort());
  assert.match(catalog.catalogSha256, /^sha256:[0-9a-f]{64}$/);
  const catalogPath = path.join(root, catalogRef);
  const movingCatalog = readJson(catalogPath);
  movingCatalog.packages['mas-scholar-skills'].package_version = '0.2.15';
  movingCatalog.packages['mas-scholar-skills'].owner_source_commit = 'f'.repeat(40);
  writeJson(catalogPath, movingCatalog);
  const request = freezeRequest(root);
  const releaseSet = readJson(path.join(root, releaseSetRef));
  const ownerLock = readJson(path.join(root, ownerLockRef));
  const scholarMember = releaseSet.components.packages.members['mas-scholar-skills'];
  assert.equal(scholarMember.version, '0.2.14');
  assert.equal(request.packages['mas-scholar-skills'].version, scholarMember.version);
  assert.equal(
    request.packages['mas-scholar-skills'].owner_source_commit,
    ownerLock.packages['mas-scholar-skills'].source_commit,
  );
  assert.notEqual(
    request.packages['mas-scholar-skills'].version,
    movingCatalog.packages['mas-scholar-skills'].package_version,
  );
  assert.notEqual(
    request.packages['mas-scholar-skills'].owner_source_commit,
    movingCatalog.packages['mas-scholar-skills'].owner_source_commit,
  );
  const closure = assertReleaseBundleFreezeInputs(request, root);
  assert.equal(closure.releaseSetSha256, sha256(fs.readFileSync(path.join(root, releaseSetRef))));
  assert.equal(closure.ownerCohortLockSha256, sha256(fs.readFileSync(path.join(root, ownerLockRef))));
  assert.deepEqual(Object.keys(closure.packages).sort(), [...packageIds].sort());
});

test('committed cohort rejects owner lock byte drift before freeze', (t) => {
  const root = committedSurfaceFixture(t);
  const lockPath = path.join(root, ownerLockRef);
  const lock = readJson(lockPath);
  lock.packages.mas.source_commit = '0'.repeat(40);
  writeJson(lockPath, lock);
  assert.throws(
    () => assertReleaseBundleFreezeInputs(freezeRequest(root), root),
    (error: unknown) => error instanceof FrameworkContractError
      && /owner cohort lock digest does not match/.test(error.message),
  );
});

test('committed cohort rejects Release Set member digest drift before freeze', (t) => {
  const root = committedSurfaceFixture(t);
  const request = freezeRequest(root);
  const releaseSetPath = path.join(root, releaseSetRef);
  const releaseSet = readJson(releaseSetPath);
  releaseSet.components.packages.members.mas.manifest_sha256 = `sha256:${'0'.repeat(64)}`;
  writeJson(releaseSetPath, releaseSet);
  request.framework_release_set.digest = sha256(fs.readFileSync(releaseSetPath));
  assert.throws(
    () => assertReleaseBundleFreezeInputs(request, root),
    (error: unknown) => error instanceof FrameworkContractError
      && /does not transitively bind the Package identity/.test(error.message),
  );
});

test('bundled catalog rejects its own manifest digest drift', (t) => {
  const root = committedSurfaceFixture(t, 'catalog');
  const catalogPath = path.join(root, catalogRef);
  const catalog = readJson(catalogPath);
  catalog.packages.mas.manifest_sha256 = `sha256:${'0'.repeat(64)}`;
  writeJson(catalogPath, catalog);
  const previousFaultGate = process.env.OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED;
  const previousCatalog = process.env.OPL_TEST_BUNDLED_FULL_RUNTIME_PACKAGE_CATALOG;
  process.env.OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED = '1';
  process.env.OPL_TEST_BUNDLED_FULL_RUNTIME_PACKAGE_CATALOG = catalogPath;
  t.after(() => {
    if (previousFaultGate === undefined) delete process.env.OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED;
    else process.env.OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED = previousFaultGate;
    if (previousCatalog === undefined) delete process.env.OPL_TEST_BUNDLED_FULL_RUNTIME_PACKAGE_CATALOG;
    else process.env.OPL_TEST_BUNDLED_FULL_RUNTIME_PACKAGE_CATALOG = previousCatalog;
  });
  assert.throws(
    () => readBundledFullRuntimePackageCatalog(),
    (error: unknown) => {
      const details = error instanceof FrameworkContractError ? error.details : undefined;
      return details?.failure_code === 'agent_package_bundled_full_runtime_catalog_invalid'
        && Array.isArray(details.mismatches)
        && details.mismatches.includes('manifest_sha256');
    },
  );
});
