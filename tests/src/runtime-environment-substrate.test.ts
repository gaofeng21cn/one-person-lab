import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Json = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string): Json {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Json;
}

test('runtime environment substrate contract defines OPL-owned false-ready boundary', () => {
  const contract = readJson('contracts/opl-framework/runtime-environment-substrate-contract.json');

  assert.equal(contract.contract_id, 'opl_runtime_environment_substrate_contract');
  assert.equal(contract.owner, 'OPL Framework');
  assert.equal(contract.implementation_status, 'contract_and_readback_skeleton');
  assert.equal(contract.target_planned, true);

  const authority = contract.authority_boundary as Json;
  assert.equal(authority.opl_is_canonical_runtime_environment_owner, true);
  assert.equal(authority.app_consumes_runtime_environment_projection, true);
  assert.equal(authority.domain_agents_declare_dependency_intent_only, true);
  assert.equal(authority.can_write_domain_truth, false);
  assert.equal(authority.can_sign_owner_receipt, false);
  assert.equal(authority.can_claim_domain_ready, false);
  assert.equal(authority.can_claim_app_release_ready, false);
  assert.equal(authority.can_claim_runtime_materialized_ready, false);

  assert.deepEqual(contract.required_readback_claim_fields, [
    'implementation_status',
    'target_planned',
    'dry_run',
    'can_claim_runtime_ready',
    'can_claim_domain_ready',
    'can_claim_app_release_ready',
  ]);

  const moduleMapping = contract.module_mapping as Record<string, Json>;
  assert.deepEqual(Object.keys(moduleMapping).sort(), [
    'atlas',
    'charter',
    'connect',
    'console',
    'foundry-lab',
    'pack',
    'runway',
    'stagecraft',
    'vault',
    'workspace',
  ]);
  assert.equal(moduleMapping.runway.role, 'runtime_materialization_and_run_consumption');
  assert.equal(moduleMapping.pack.role, 'descriptor_lock_layer_manifest_and_distribution_refs');

  const forbiddenClaims = contract.forbidden_claims as string[];
  assert.equal(forbiddenClaims.includes('runtime_cache_hit_means_ready'), true);
  assert.equal(forbiddenClaims.includes('materialization_skeleton_means_runtime_ready'), true);
  assert.equal(forbiddenClaims.includes('runtime_environment_receipt_means_domain_ready'), true);
});
