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
  assert.equal(contract.implementation_status, 'runtime_lock_materializer_cache_prune_available');
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

  const lockPolicy = contract.lock_projection_policy as Json;
  assert.equal(lockPolicy.status, 'projection_and_persisted_lock_available');
  assert.equal(lockPolicy.deterministic_digest_required, true);
  assert.equal(lockPolicy.persisted_lock_required_for_runtime_ready, true);
  assert.equal(lockPolicy.writes_runtime_root, false);
  assert.equal(lockPolicy.can_claim_runtime_ready, false);

  const bundlePolicy = contract.bundle_manifest_projection_policy as Json;
  assert.equal(bundlePolicy.status, 'projection_and_persisted_manifest_available');
  assert.equal(bundlePolicy.layer_graph_required, true);
  assert.equal(bundlePolicy.dry_run_bundle_manifest_counts_as_runtime_ready, false);
  assert.equal(bundlePolicy.can_claim_runtime_ready, false);

  const inventoryPolicy = contract.cache_inventory_policy as Json;
  assert.equal(inventoryPolicy.status, 'filesystem_inventory_and_prune_receipt_available');
  assert.equal(inventoryPolicy.cache_hit_counts_as_ready, false);
  assert.equal(inventoryPolicy.cache_miss_counts_as_readiness_failure, false);
  assert.equal(inventoryPolicy.prune_apply_requires_materialization_receipt, true);
  assert.equal(inventoryPolicy.protect_current_and_rollback_pointers, true);
  assert.equal(inventoryPolicy.deletes_domain_artifacts, false);

  const preparePolicy = contract.dependency_prepare_policy as Json;
  assert.equal(preparePolicy.status, 'local_dependency_check_and_opl_managed_package_prepare_available');
  assert.equal(preparePolicy.writes_dependency_lock, true);
  assert.equal(preparePolicy.writes_dependency_receipt, true);
  assert.equal(preparePolicy.writes_run_context_on_success, true);
  assert.equal(preparePolicy.dependency_lock_counts_as_materialized_runtime_lock, false);
  assert.equal(preparePolicy.installs_packages, 'only_when_apply_into_opl_managed_library');
  assert.equal(preparePolicy.writes_domain_truth, false);
  assert.equal(preparePolicy.writes_runtime_root, false);
  assert.equal(preparePolicy.missing_dependency_returns_runtime_failure, true);
  assert.equal(preparePolicy.can_claim_runtime_ready, false);

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

  const readbackCommands = contract.readback_commands as string[];
  assert.equal(readbackCommands.some((command) => command.startsWith('opl runtime env build')), true);
  assert.equal(readbackCommands.some((command) => command.startsWith('opl runtime env prepare')), true);
  assert.equal(readbackCommands.some((command) => command.startsWith('opl runtime env materialize')), true);
  assert.equal(readbackCommands.some((command) => command.startsWith('opl runtime env verify')), true);
  assert.equal(readbackCommands.includes('opl runtime env cache inventory'), true);
  assert.equal(readbackCommands.includes('opl runtime env cache prune --dry-run'), true);
});
