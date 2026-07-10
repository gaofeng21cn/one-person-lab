import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildPackOsCache,
  buildPackOsDistribution,
  buildPackOsInspection,
  buildPackOsInstall,
  buildPackOsLock,
  buildPackOsRegistry,
  buildPackOsValidation,
} from '../../src/modules/pack/pack-os.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';

function writeDescriptor(root: string, overrides: Record<string, unknown> = {}) {
  fs.mkdirSync(path.join(root, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(root, 'templates', 'figure.json'), '{"kind":"template"}\n');
  fs.writeFileSync(path.join(root, 'schema.json'), '{"type":"object"}\n');

  const descriptor = {
    schema_version: 1,
    pack_id: 'mas.display.example',
    version: '1.2.3',
    pack_kind: 'display_pack',
    owner: 'MedAutoScience',
    capabilities: [
      {
        capability_id: 'forest_plot',
        capability_kind: 'display_template',
        entrypoint_ref: 'templates/figure.json',
        input_contract_ref: 'schema.json',
        output_contract_ref: 'paper/build/display_pack_lock.json',
      },
    ],
    resources: [
      {
        resource_id: 'template.forest_plot',
        role: 'template',
        ref: 'templates/figure.json',
      },
      {
        resource_id: 'schema.input',
        role: 'schema',
        ref: 'schema.json',
      },
      {
        resource_id: 'visual.audit.receipt',
        role: 'receipt_ref',
        ref: 'mas://paper/figure_visual_audit_receipt.json',
      },
    ],
    artifact_lifecycle: {
      states: ['declared', 'resolved', 'locked', 'review_receipts_observed', 'handoff_ready'],
      current_state: 'declared',
      artifact_locator_refs: ['paper/build/display_pack_lock.json#/publication_figure_quality_refs'],
      retention: {
        policy_ref: 'policy:keep-publication-locks',
        restore_proof_required: true,
      },
    },
    review_transport: {
      receipt_refs: ['paper/figure_visual_audit_receipt.json'],
      reviewer_adapter_refs: ['vlm-reviewer:display-audit'],
      receipt_transport_only: true,
      quality_verdict_owner: 'MedAutoScience',
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_mutate_artifact_body: false,
      can_sign_domain_owner_receipt: false,
      can_authorize_quality_verdict: false,
      can_authorize_publication_readiness: false,
      can_authorize_grant_readiness: false,
      can_authorize_visual_export_readiness: false,
      can_authorize_app_release_readiness: false,
      provider_completion_is_pack_quality_ready: false,
    },
    provenance: {
      source_ref: 'git:https://github.com/gaofeng21cn/med-autoscience.git',
      license_ref: 'license:internal',
      release_ref: 'git:main',
      descriptor_created_by: 'test-fixture',
    },
    ...overrides,
  };

  const descriptorPath = path.join(root, 'display-pack.json');
  fs.writeFileSync(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
  return descriptorPath;
}

test('Pack OS builds refs-only locks with hashes and false-authority boundaries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-os-'));
  try {
    const descriptorPath = writeDescriptor(root);

    const inspection = buildPackOsInspection(descriptorPath);
    assert.equal(inspection.pack_os.surface_kind, 'opl_pack_os_inspection');
    assert.equal(inspection.pack_os.status, 'resolved');
    assert.equal(inspection.pack_os.pack_kind, 'display_pack');
    assert.equal(inspection.pack_os.descriptor_oci.digest, `sha256:${inspection.pack_os.descriptor_sha256}`);
    assert.equal(inspection.pack_os.content_addressed_lock_policy.registry_push_pull_implemented, false);
    assert.equal(inspection.pack_os.authority_boundary.can_authorize_publication_readiness, false);

    const lock = buildPackOsLock(descriptorPath).pack_lock;
    assert.equal(lock.surface_kind, 'opl_generic_pack_lock');
    assert.equal(lock.lock_id, 'opl-pack-lock:mas.display.example@1.2.3');
    assert.equal(lock.descriptor_oci.mediaType, 'application/vnd.opl.pack.descriptor.v1+json');
    assert.equal(lock.descriptor_oci.digest, `sha256:${lock.descriptor_sha256}`);
    assert.equal(typeof lock.descriptor_oci.size, 'number');
    assert.equal(lock.content_addressed_lock_policy.policy_id, 'opl.pack_os.content_addressed_lock.v1');
    assert.equal(lock.content_addressed_lock_policy.lock_records_refs_only, true);
    assert.equal(lock.content_addressed_lock_policy.stores_artifact_body, false);
    assert.equal(lock.content_addressed_lock_policy.closes_stage, false);
    assert.equal(lock.content_addressed_lock_policy.writes_domain_truth, false);
    assert.equal(lock.summary.present_resource_count, 2);
    assert.equal(lock.summary.receipt_ref_count, 1);
    assert.equal(lock.resolved_resources[0].status, 'present');
    const firstResourceSha256 = lock.resolved_resources[0].sha256;
    if (firstResourceSha256 === null) {
      assert.fail('present local resources must carry a sha256 hash');
    }
    assert.match(firstResourceSha256, /^[0-9a-f]{64}$/);
    assert.equal(lock.resolved_resources[0].oci_descriptor.mediaType, 'application/vnd.opl.pack.resource.v1');
    assert.equal(lock.resolved_resources[0].oci_descriptor.digest, `sha256:${firstResourceSha256}`);
    assert.equal(typeof lock.resolved_resources[0].oci_descriptor.size, 'number');
    assert.equal(lock.resolved_resources[2].ref_kind, 'external_ref');
    assert.deepEqual(lock.not_claims.slice(0, 4), [
      'domain_ready',
      'quality_verdict',
      'artifact_authority',
      'publication_ready',
    ]);

    const validation = buildPackOsValidation(descriptorPath).pack_os_validation;
    assert.equal(validation.status, 'valid');
    assert.equal(validation.checks.every((entry) => entry.status === 'pass'), true);
    assert.equal(
      validation.checks.some((entry) => entry.check_id === 'content_addressed_lock_policy_refs_only'),
      true,
    );
    assert.equal(validation.content_addressed_lock_policy.registry_push_pull_implemented, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Pack OS installs descriptors into registry and content-addressed cache without claiming domain authority', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-os-install-'));
  try {
    const descriptorPath = writeDescriptor(root);
    const registryPath = path.join(root, 'registry', 'pack-registry.json');
    const cacheRoot = path.join(root, 'cache');

    const install = buildPackOsInstall(descriptorPath, registryPath, cacheRoot).pack_os_install;
    assert.equal(install.surface_kind, 'opl_pack_os_install_receipt');
    assert.equal(install.status, 'installed');
    assert.equal(install.registry_entry.registry_key, 'mas.display.example@1.2.3');
    assert.equal(install.registry_entry.pack_kind, 'display_pack');
    assert.equal(install.registry_entry.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(install.cache_manifest.summary.cached_resource_count, 2);
    assert.equal(install.cache_manifest.summary.skipped_resource_count, 1);
    assert.equal(install.not_claims.includes('quality_verdict'), true);
    assert.equal(install.not_claims.includes('artifact_authority'), true);

    const firstCacheRef = install.cache_manifest.cached_resources[0].cache_ref;
    assert.match(firstCacheRef, /^sha256\/[0-9a-f]{64}$/);
    assert.equal(fs.existsSync(path.join(cacheRoot, firstCacheRef)), true);

    const registry = buildPackOsRegistry(registryPath).pack_os_registry;
    assert.equal(registry.surface_kind, 'opl_pack_os_registry');
    assert.equal(registry.status, 'available');
    assert.equal(registry.entries.length, 1);
    assert.equal(registry.entries[0].registry_key, 'mas.display.example@1.2.3');
    assert.equal(registry.entries[0].descriptor_sha256, install.registry_entry.descriptor_sha256);
    assert.equal(registry.entries[0].descriptor_oci.digest, install.registry_entry.descriptor_oci.digest);
    assert.equal(registry.entries[0].content_addressed_lock_policy.lock_records_refs_only, true);
    assert.equal(registry.content_addressed_lock_policy.external_refs_cached, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Pack OS cache and distribution materialize refs-only manifests for pack assets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-os-distribute-'));
  try {
    const descriptorPath = writeDescriptor(root);
    const cacheRoot = path.join(root, 'cache');
    const outputPath = path.join(root, 'dist', 'pack-distribution.json');

    const cache = buildPackOsCache(descriptorPath, cacheRoot).pack_os_cache;
    assert.equal(cache.surface_kind, 'opl_pack_os_cache_manifest');
    assert.equal(cache.status, 'cached');
    assert.equal(cache.summary.cached_resource_count, 2);
    assert.equal(cache.summary.skipped_resource_count, 1);
    assert.equal(cache.cached_resources.every((entry) => entry.status === 'cached'), true);
    assert.equal(cache.content_addressed_lock_policy.present_local_resource_digest_required, true);
    assert.equal(cache.cached_resources[0].oci_descriptor.mediaType, 'application/vnd.opl.pack.resource.v1');
    assert.match(cache.cached_resources[0].oci_descriptor.digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(cache.skipped_resources[0].status, 'external_ref');

    const distribution = buildPackOsDistribution(descriptorPath, outputPath, cacheRoot).pack_os_distribution;
    assert.equal(distribution.surface_kind, 'opl_pack_os_distribution_manifest');
    assert.equal(distribution.status, 'written');
    assert.equal(distribution.output.path, outputPath);
    assert.match(distribution.output.sha256, /^[0-9a-f]{64}$/);
    assert.equal(distribution.bundle.pack_lock.lock_id, 'opl-pack-lock:mas.display.example@1.2.3');
    assert.equal(distribution.bundle.content_addressed_lock_policy.registry_push_pull_implemented, false);
    assert.equal(distribution.bundle.cache_manifest.summary.cached_resource_count, 2);
    assert.equal(distribution.bundle.not_claims.includes('publication_ready'), true);

    const written = parseJsonText(fs.readFileSync(outputPath, 'utf8')) as Record<string, any>;
    assert.equal(written.surface_kind, 'opl_pack_os_distribution_bundle');
    assert.equal(written.pack_lock.lock_id, 'opl-pack-lock:mas.display.example@1.2.3');
    assert.equal(written.cache_manifest.summary.cached_resource_count, 2);
    assert.equal(written.authority_boundary.can_mutate_artifact_body, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Pack OS rejects descriptors that give OPL domain or quality authority', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-os-invalid-'));
  try {
    const descriptorPath = writeDescriptor(root, {
      authority_boundary: {
        can_write_domain_truth: false,
        can_mutate_artifact_body: false,
        can_sign_domain_owner_receipt: false,
        can_authorize_quality_verdict: true,
        can_authorize_publication_readiness: false,
        can_authorize_grant_readiness: false,
        can_authorize_visual_export_readiness: false,
        can_authorize_app_release_readiness: false,
        provider_completion_is_pack_quality_ready: false,
      },
    });

    assert.throws(
      () => buildPackOsLock(descriptorPath),
      /authority_boundary.can_authorize_quality_verdict must be false/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Pack OS rejects review transport that is not refs-only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-os-review-invalid-'));
  try {
    const descriptorPath = writeDescriptor(root, {
      review_transport: {
        receipt_refs: ['paper/figure_visual_audit_receipt.json'],
        reviewer_adapter_refs: ['vlm-reviewer:display-audit'],
        receipt_transport_only: false,
        quality_verdict_owner: 'MedAutoScience',
      },
    });

    assert.throws(
      () => buildPackOsValidation(descriptorPath),
      /receipt_transport_only must be true/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Pack OS rejects non-string refs before lock projection', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-os-ref-invalid-'));
  try {
    const descriptorPath = writeDescriptor(root, {
      artifact_lifecycle: {
        states: ['declared', 'resolved', 'locked'],
        current_state: 'declared',
        artifact_locator_refs: [{ body: 'not a ref string' }],
        retention: {
          policy_ref: 'policy:keep-publication-locks',
          restore_proof_required: true,
        },
      },
    });

    assert.throws(
      () => buildPackOsLock(descriptorPath),
      /artifact_locator_refs\[\] must contain only strings/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Pack OS rejects descriptor schema drift', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-os-schema-invalid-'));
  try {
    const descriptorPath = writeDescriptor(root, {
      schema_version: 2,
    });

    assert.throws(
      () => buildPackOsValidation(descriptorPath),
      /pack_descriptor.schema_version must be 1/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
