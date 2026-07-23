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
    let manifest = readJson(path.join(repoRoot, member.manifest_ref));
    if (packageId === 'mas' && member.version === '0.2.16') {
      manifest.capability_dependencies = [{
        module_id: 'scholarskills',
        package_id: 'mas-scholar-skills',
        kind: 'framework_capability_package',
        required: true,
        version_requirement: '>=0.2.12 <0.3.0',
        capability_abi: 'mas-scholar-skills.v1',
        required_export_ids: [
          'mas-scholar-skills',
          'medical-manuscript-writing',
          'medical-manuscript-review',
          'medical-figure-design',
          'medical-figure-style',
          'medical-figure-composer',
          'medical-research-lit',
          'medical-statistical-review',
          'medical-table-design',
          'medical-submission-prep',
          'medical-data-governance',
        ],
        required_module_ids: [
          'mas-scholar-skills.display',
          'mas-scholar-skills.tables',
          'mas-scholar-skills.stats',
          'mas-scholar-skills.lit',
          'mas-scholar-skills.write',
          'mas-scholar-skills.review',
          'mas-scholar-skills.submit',
          'mas-scholar-skills.data',
          'mas-scholar-skills.reference-provider-adapters',
          'mas-scholar-skills.scientific-search-adapters',
        ],
        manifest_url: 'mas-scholar-skills.json',
        version_policy: 'compatible_channel_manifest',
        codex_distribution: 'bundled',
        opl_distribution: 'managed_dependency',
        developer_distribution: 'source_checkout',
        required_for: [
          'workspace_or_quest_codex_discovery',
          'mas_operational_readiness',
          'all_mas_medical_research_workflows',
        ],
        install_owner: 'one-person-lab',
        install_update_source: 'ghcr_capability_packages_channel',
        sync_scopes: ['workspace', 'quest'],
        authority_boundary: {
          can_write_domain_truth: false,
          can_sign_owner_receipt: false,
          can_create_typed_blocker: false,
          can_write_runtime_queue: false,
        },
      }];
    }
    if (packageId === 'mag' && member.version === '0.3.4') {
      manifest.codex_surface.bundled_capability_package_ids = [];
      manifest.capability_dependencies = [];
    }
    if (packageId === 'mas-scholar-skills' && member.version === '0.2.14') {
      manifest = {
        surface_kind: manifest.surface_kind,
        package_id: manifest.package_id,
        display_name: manifest.display_name,
        publisher: manifest.publisher,
        version: manifest.version,
        source: manifest.source,
        source_repo: manifest.source_repo,
        package_role: 'required_agent_capability_package',
        schema_ref: manifest.schema_ref,
        primary_consumer: {
          agent_id: 'mas',
          package_id: 'mas',
          dependency_kind: 'hard_runtime_dependency',
          required: true,
          version_requirement: '>=0.2.12 <0.3.0',
          capability_abi: 'mas-scholar-skills.v1',
        },
        consumer_policy: {
          compatibility_commitment: 'primary_consumer_only',
          supported_required_by: ['mas'],
          non_primary_read_only_discovery_allowed: true,
          non_primary_runtime_dependency_supported: false,
          relationship: 'one_required_product_consumer_with_read_only_observers',
        },
        capability_abi: {
          id: 'mas-scholar-skills.v1',
          version: '1.0.0',
          compatibility_policy: 'same_major',
          breaking_change_requires: 'new_abi_major_and_mas_consumer_update',
        },
        exports: manifest.exports,
        content_lock: manifest.content_lock,
        lifecycle: {
          owner: 'one-person-lab',
          default_install_trigger: 'dependency_of_mas',
          direct_install_supported_for_development: true,
          disable_or_uninstall_when_required_by_installed_consumer: 'forbidden',
          update_transaction: 'consumer_dependency_closure_atomic',
          rollback_transaction: 'consumer_dependency_closure_atomic',
          status_command_templates: {
            workspace: 'opl packages status --package-id mas --scope workspace --target-workspace <workspace-root> --json',
            quest: 'opl packages status --package-id mas --scope quest --target-quest <quest-root> --json',
          },
          repair_command_templates: {
            workspace: 'opl packages repair --package-id mas --scope workspace --target-workspace <workspace-root> --json',
            quest: 'opl packages repair --package-id mas --scope quest --target-quest <quest-root> --json',
          },
          activation_materialization: {
            required: true,
            owner: 'one-person-lab',
            trigger: 'mas_workspace_or_quest_activation',
            scopes: ['workspace', 'quest'],
            skill_ids_ref: '#/exports/all_skill_ids',
            readiness_skill_ids_ref: '#/exports/core_skill_ids',
            materialization_policy: 'all_exported_skills',
            target_path_template: '<scope-root>/.codex/skills/<skill-id>',
            receipt_required: true,
            readiness_policy: 'all_core_skills_current_for_active_scope',
          },
        },
        codex_surface: {
          plugin_id: 'mas-scholar-skills',
          carrier_source_commit: manifest.codex_surface.carrier_source_commit,
          carrier_source_role: 'codex_plugin_carrier_not_package_truth',
          required_skill_ids_ref: '#/exports/core_skill_ids',
          default_materialized_skill_ids_ref: '#/exports/all_skill_ids',
          codex_default_exposure: false,
          optional_install_policy: 'all_exported_skills',
          plugin_payload_manifest_url: manifest.codex_surface.plugin_payload_manifest_url,
        },
        authority_boundary: {
          can_write_domain_truth: false,
          can_sign_owner_receipt: false,
          can_create_typed_blocker: false,
          can_write_runtime_queue: false,
          can_claim_mas_operational_readiness: false,
        },
        source_manifest_ref: manifest.source_manifest_ref, // reuse-first: allow frozen manifest byte reconstruction from the current owner projection.
      };
    }
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
    if (packageId === 'mas-scholar-skills' && member.version === '0.2.14') {
      manifest.primary_consumer.version_requirement = '>=0.2.0 <0.3.0';
    }
    if (packageId === 'opl-flow' && member.version === '0.1.24') {
      manifest.codex_surface.required_skill_ids = ['opl-flow'];
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

test('bundled catalog excludes optional enhancements from closure without relaxing member integrity', (t) => {
  const root = committedSurfaceFixture(t, 'catalog');
  const catalogPath = path.join(root, catalogRef);
  const catalog = readJson(catalogPath);
  const manifestRoot = path.join(root, 'contracts', 'opl-framework');

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

  const selected = readBundledFullRuntimePackageCatalog();
  assert.deepEqual(selected.entries.get('mas')?.dependencyPackageIds, []);
  assert.deepEqual(selected.entries.get('mag')?.dependencyPackageIds, []);
  assert.ok(selected.entries.has('mas-scholar-skills'));

  const scholarPayloadPath = path.join(
    manifestRoot,
    catalog.packages['mas-scholar-skills'].payload_manifest_ref,
  );
  fs.appendFileSync(scholarPayloadPath, '\n');
  assert.throws(
    () => readBundledFullRuntimePackageCatalog(),
    (error: unknown) => {
      const details = error instanceof FrameworkContractError ? error.details : undefined;
      return details?.failure_code === 'agent_package_bundled_full_runtime_catalog_invalid'
        && details.package_id === 'mas-scholar-skills'
        && Array.isArray(details.mismatches)
        && details.mismatches.includes('payload_manifest_sha256');
    },
  );
});
