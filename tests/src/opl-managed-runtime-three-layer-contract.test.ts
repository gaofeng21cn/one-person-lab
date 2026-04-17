import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildManagedRuntimeContract,
  normalizeManagedRuntimeContract,
  readManagedRuntimeThreeLayerContract,
  readBundledManagedRuntimeThreeLayerContract,
  validateManagedRuntimeContract,
} from '../../src/managed-runtime-contract.ts';

type Json = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const familyManifestFixtureDir = path.join(repoRoot, 'tests', 'fixtures', 'family-manifests');

function readJson(relativePath: string): Json {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Json;
}

function readJsonFixture(name: string): Json {
  return JSON.parse(
    fs.readFileSync(path.join(familyManifestFixtureDir, name), 'utf8'),
  ) as Json;
}

function unwrapManifestFixture(payload: Json): Json {
  const nested = payload.product_entry_manifest;
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Json)
    : payload;
}

test('shared managed runtime contract freezes the three-layer owner envelope and fail-closed rules', () => {
  const contract = readManagedRuntimeThreeLayerContract(repoRoot);
  const bundled = readBundledManagedRuntimeThreeLayerContract();

  assert.equal(contract.contract_id, 'opl_managed_runtime_three_layer_contract');
  assert.deepEqual(contract.required_owner_fields, ['runtime_owner', 'domain_owner', 'executor_owner']);
  assert.deepEqual(contract.required_surface_locator_fields, [
    'supervision_status_surface',
    'attention_queue_surface',
    'recovery_contract_surface',
  ]);
  assert.match(contract.canonical_fail_closed_rules.join('\n'), /domain_supervision_cannot_bypass_runtime/);
  assert.match(contract.canonical_fail_closed_rules.join('\n'), /executor_cannot_declare_global_gate_clear/);
  assert.match(contract.canonical_fail_closed_rules.join('\n'), /runtime_cannot_invent_domain_publishability_truth/);
  assert.deepEqual(bundled, contract);
});

test('family manifest fixtures consume the shared managed runtime three-layer contract consistently', () => {
  const sharedContract = readJson('contracts/opl-gateway/managed-runtime-three-layer-contract.json');
  const fixtures = {
    medautoscience: readJsonFixture('med-autoscience-product-entry-manifest.json'),
    redcube: readJsonFixture('redcube-product-entry-manifest.json'),
    medautogrant: readJsonFixture('med-autogrant-product-entry-manifest.json'),
  };

  const expectations = {
    medautoscience: {
      runtime_owner: 'upstream_hermes_agent',
      domain_owner: 'med-autoscience',
      executor_owner: 'med_deepscientist',
    },
    redcube: {
      runtime_owner: 'upstream_hermes_agent',
      domain_owner: 'redcube_ai',
      executor_owner: 'codex_cli',
    },
    medautogrant: {
      runtime_owner: 'upstream_hermes_agent',
      domain_owner: 'med-autogrant',
      executor_owner: 'med-autogrant',
    },
  };

  for (const [key, manifest] of Object.entries(fixtures)) {
    const contract = normalizeManagedRuntimeContract(unwrapManifestFixture(manifest as Json).managed_runtime_contract);
    assert.ok(contract, `${key} fixture missing managed_runtime_contract`);
    assert.equal(contract?.shared_contract_ref, 'contracts/opl-gateway/managed-runtime-three-layer-contract.json');
    assert.equal(contract?.shared_contract_ref, sharedContract.contract_ref);
    assert.equal(contract?.runtime_owner, expectations[key as keyof typeof expectations].runtime_owner);
    assert.equal(contract?.domain_owner, expectations[key as keyof typeof expectations].domain_owner);
    assert.equal(contract?.executor_owner, expectations[key as keyof typeof expectations].executor_owner);
    assert.equal(contract?.supervision_status_surface.surface_kind.length > 0, true);
    assert.equal(contract?.attention_queue_surface.surface_kind.length > 0, true);
    assert.equal(contract?.recovery_contract_surface.surface_kind.length > 0, true);
    assert.deepEqual(contract?.fail_closed_rules, sharedContract.canonical_fail_closed_rules);
    assert.deepEqual(validateManagedRuntimeContract(contract), contract);
  }
});

test('buildManagedRuntimeContract materializes canonical fail-closed rules and domain-owned surfaces', () => {
  const contract = buildManagedRuntimeContract({
    domain_owner: 'redcube_ai',
    executor_owner: 'codex_cli',
    supervision_status_surface: 'product_entry_session',
    attention_queue_surface: 'product_frontdesk',
    recovery_contract_surface: 'product_entry_session',
  });

  assert.deepEqual(contract, {
    shared_contract_ref: 'contracts/opl-gateway/managed-runtime-three-layer-contract.json',
    runtime_owner: 'upstream_hermes_agent',
    domain_owner: 'redcube_ai',
    executor_owner: 'codex_cli',
    supervision_status_surface: {
      surface_kind: 'product_entry_session',
      owner: 'redcube_ai',
    },
    attention_queue_surface: {
      surface_kind: 'product_frontdesk',
      owner: 'redcube_ai',
    },
    recovery_contract_surface: {
      surface_kind: 'product_entry_session',
      owner: 'redcube_ai',
    },
    fail_closed_rules: [
      'domain_supervision_cannot_bypass_runtime',
      'executor_cannot_declare_global_gate_clear',
      'runtime_cannot_invent_domain_publishability_truth',
    ],
  });
});
