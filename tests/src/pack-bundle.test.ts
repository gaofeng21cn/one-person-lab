import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildPackBundleManifest,
  buildPackBundleValidation,
  writePackBundleAggregate,
} from '../../src/modules/pack/pack-bundle.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';

function writeSource(root: string) {
  const sourceRoot = path.join(root, 'contract.source');
  fs.mkdirSync(path.join(sourceRoot, 'items'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'root.json'), `${JSON.stringify({
    surface_kind: 'example_bundle',
    version: 'example.v1',
    owner: 'example-owner',
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(sourceRoot, 'items', 'alpha.json'), `${JSON.stringify({
    item_id: 'alpha',
    value: 1,
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(sourceRoot, 'items', 'beta.json'), `${JSON.stringify({
    item_id: 'beta',
    value: 2,
  }, null, 2)}\n`);

  const assemblyPath = path.join(root, 'contract.assembly.json');
  const aggregatePath = path.join(root, 'contract.generated.json');
  const manifestPath = path.join(root, 'contract.bundle-manifest.json');
  fs.writeFileSync(assemblyPath, `${JSON.stringify({
    surface_kind: 'opl_pack_bundle_assembly',
    schema_version: 1,
    bundle_id: 'example.contract',
    owner: 'one-person-lab',
    state: 'active_bundle_source',
    aggregate_ref: 'contract.generated.json',
    manifest_ref: 'contract.bundle-manifest.json',
    source_root_ref: 'contract.source/root.json',
    generated_array_fields: [
      {
        field: 'items',
        source_dir_ref: 'contract.source/items',
        order: ['alpha.json', 'beta.json'],
      },
    ],
    commands: {
      write: 'opl pack bundle write --assembly contract.assembly.json',
      check: 'opl pack bundle check --assembly contract.assembly.json',
      manifest: 'opl pack bundle manifest --assembly contract.assembly.json',
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
  }, null, 2)}\n`);
  return { assemblyPath, aggregatePath, manifestPath };
}

test('Pack Bundle writes generated aggregates from source parts with manifest digests', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-bundle-'));
  try {
    const { assemblyPath, aggregatePath } = writeSource(root);

    const write = writePackBundleAggregate(assemblyPath).pack_bundle_write;
    assert.equal(write.surface_kind, 'opl_pack_bundle_write');
    assert.equal(write.status, 'written');
    assert.equal(write.aggregate_output.path, aggregatePath);
    assert.match(write.aggregate_output.sha256, /^[0-9a-f]{64}$/);
    assert.equal(write.manifest.generated_artifact.do_not_edit, true);
    assert.equal(Object.prototype.hasOwnProperty.call(write.manifest.generated_artifact, 'aggregate_path'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(write.manifest.generated_artifact, 'manifest_path'), false);
    assert.equal(write.manifest.source_entries.length, 3);
    assert.match(write.manifest.source_digest, /^[0-9a-f]{64}$/);
    assert.equal(write.manifest.assembly_ref, 'contract.assembly.json');
    assert.equal(
      write.manifest.source_entries.some((entry: Record<string, unknown>) =>
        Object.prototype.hasOwnProperty.call(entry, 'path')
      ),
      false,
    );

    const aggregate = parseJsonText(fs.readFileSync(aggregatePath, 'utf8')) as {
      surface_kind?: string;
      items: Array<{ item_id: string; value: number }>;
      generated_by: {
        surface_kind?: string;
        assembly_ref?: string;
        source_digest?: string;
        do_not_edit?: boolean;
      };
    };
    assert.equal(aggregate.surface_kind, 'example_bundle');
    assert.deepEqual(aggregate.items.map((item: { item_id: string }) => item.item_id), ['alpha', 'beta']);
    assert.equal(aggregate.generated_by.surface_kind, 'opl_pack_bundle_generated_metadata');
    assert.equal(aggregate.generated_by.assembly_ref, 'contract.assembly.json');
    assert.equal(aggregate.generated_by.source_digest, write.manifest.source_digest);
    assert.equal(aggregate.generated_by.do_not_edit, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Pack Bundle check fails closed when generated aggregate drifts from source parts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-bundle-drift-'));
  try {
    const { assemblyPath, aggregatePath } = writeSource(root);
    writePackBundleAggregate(assemblyPath);
    const firstValidation = buildPackBundleValidation(assemblyPath).pack_bundle_validation;
    assert.equal(firstValidation.status, 'valid');

    const stale = parseJsonText(fs.readFileSync(aggregatePath, 'utf8')) as {
      items: Array<{ value: number }>;
    };
    stale.items[0].value = 99;
    fs.writeFileSync(aggregatePath, `${JSON.stringify(stale, null, 2)}\n`);

    const validation = buildPackBundleValidation(assemblyPath).pack_bundle_validation;
    assert.equal(validation.status, 'drift_detected');
    assert.equal(validation.checks.some((entry: { check_id: string; status: string }) =>
      entry.check_id === 'aggregate_matches_source' && entry.status === 'fail'
    ), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Pack Bundle manifest is a refs-only compatibility surface without readiness authority', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-bundle-manifest-'));
  try {
    const { assemblyPath } = writeSource(root);
    const manifest = buildPackBundleManifest(assemblyPath).pack_bundle_manifest;
    assert.equal(manifest.surface_kind, 'opl_pack_bundle_manifest');
    assert.equal(manifest.generated_artifact.aggregate_is_generated_consumer_surface, true);
    assert.equal(manifest.generated_artifact.do_not_edit, true);
    assert.equal(manifest.authority_boundary.can_claim_domain_ready, false);
    assert.equal(manifest.authority_boundary.can_claim_production_ready, false);
    assert.deepEqual(manifest.not_claims.slice(0, 4), [
      'domain_ready',
      'quality_verdict',
      'artifact_authority',
      'production_ready',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
