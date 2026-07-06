import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { buildRuntimeEnvironmentBuildReadback } from '../../src/modules/runway/runtime-environment-substrate.ts';

type Json = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string): Json {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Json;
}

test('runtime environment substrate keeps shared helpers split behind a thin facade', () => {
  const facade = fs.readFileSync(
    path.join(repoRoot, 'src/modules/runway/runtime-environment-substrate-parts/shared.ts'),
    'utf8',
  );
  const partFiles = [
    'contract.ts',
    'target-state.ts',
    'package-profile.ts',
    'projection-cache.ts',
  ];

  assert.equal(facade.includes('export function '), false);
  assert.deepEqual(
    facade.trim().split(/\r?\n/),
    partFiles.map((fileName) => `export * from './${fileName}';`),
  );

  for (const fileName of partFiles) {
    const source = fs.readFileSync(
      path.join(repoRoot, 'src/modules/runway/runtime-environment-substrate-parts', fileName),
      'utf8',
    );
    assert.ok(
      source.trim().split(/\r?\n/).length <= 420,
      `${fileName} should stay inside the runtime env source-boundary budget`,
    );
  }
});

test('runtime environment substrate contract defines OPL-owned false-ready boundary', () => {
  const contract = readJson('contracts/opl-framework/runtime-environment-substrate-contract.json');

  assert.equal(contract.contract_id, 'opl_runtime_environment_substrate_contract');
  assert.equal(contract.owner, 'OPL Framework');
  assert.equal(
    contract.implementation_status,
    'runtime_lock_materializer_cache_prune_run_context_guard_available',
  );
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

  const producerPolicy = contract.runtime_bundle_producer_policy as Json;
  assert.equal(producerPolicy.status, 'build_command_exposes_manifest_lock_and_readback_refs');
  assert.equal(producerPolicy.producer_kind, 'opl-runtime-bundle');
  assert.equal(producerPolicy.producer_command_ref, 'opl-runtime-env-command:build');
  assert.equal(producerPolicy.manifest_schema_version, 'opl-runtime-bundle-manifest.v1');
  assert.equal(producerPolicy.lock_schema_version, 'opl-runtime-bundle-lock.v1');
  assert.equal(producerPolicy.readback_schema_version, 'opl-runtime-bundle-producer-readback.v1');
  assert.equal(producerPolicy.dry_run_bundle_manifest_counts_as_runtime_ready, false);
  assert.equal(producerPolicy.dry_run_bundle_manifest_counts_as_app_release_ready, false);
  assert.equal(producerPolicy.can_claim_runtime_ready, false);
  assert.equal(producerPolicy.can_claim_domain_ready, false);
  assert.equal(producerPolicy.can_claim_app_release_ready, false);
  assert.equal((producerPolicy.stable_ref_fields as string[]).includes('bundle_manifest.bundle_ref'), true);
  assert.equal((producerPolicy.stable_ref_fields as string[]).includes('bundle_lock.lock_ref'), true);
  assert.equal(
    (producerPolicy.consumer_false_ready_flags as string[]).includes(
      'bundle_lock_exists_counts_as_app_full_release_ready',
    ),
    true,
  );

  const sandboxPolicy = contract.external_sandbox_provider_policy as Json;
  assert.equal(sandboxPolicy.status, 'adapter_boundary_available_without_live_provider_claim');
  assert.deepEqual(sandboxPolicy.supported_provider_kinds, ['local_managed_root', 'external_sandbox']);
  assert.deepEqual(sandboxPolicy.external_provider_examples, ['e2b', 'daytona', 'modal']);
  assert.equal(sandboxPolicy.provider_role, 'agent_sandbox_execution_substrate');
  assert.equal(sandboxPolicy.temporal_replacement, false);
  assert.equal(sandboxPolicy.requires_live_provider_receipt_for_ready, true);
  assert.equal(sandboxPolicy.template_exists_counts_as_provider_ready, false);
  assert.equal(sandboxPolicy.snapshot_exists_counts_as_runtime_ready, false);
  assert.equal(sandboxPolicy.provider_receipt_counts_as_domain_ready, false);
  assert.equal(sandboxPolicy.can_claim_provider_ready_without_receipt, false);
  assert.equal(sandboxPolicy.can_claim_runtime_ready_without_receipt, false);

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
  assert.equal(
    preparePolicy.run_context_consumer_preflight,
    'fail_closed_on_missing_run_context_or_target_mismatch',
  );
  assert.equal(preparePolicy.run_context_identity_required, true);
  assert.equal(preparePolicy.dependency_lock_counts_as_materialized_runtime_lock, false);
  assert.equal(preparePolicy.installs_packages, 'only_when_apply_into_opl_managed_library');
  assert.equal(preparePolicy.package_presence_verification, 'managed_library_only');
  assert.equal(
    preparePolicy.requirement_profile_selection,
    'all_profiles_by_default_or_scoped_by_requirement_profile_id',
  );
  assert.equal(preparePolicy.host_environment_fallback_allowed, false);
  assert.equal(preparePolicy.writes_domain_truth, false);
  assert.equal(preparePolicy.writes_runtime_root, false);
  assert.equal(preparePolicy.missing_dependency_returns_runtime_failure, true);
  assert.equal(preparePolicy.can_claim_provider_ready, false);
  assert.equal(preparePolicy.can_claim_runtime_ready, false);

  const runContextPolicy = contract.run_context_consumer_policy as Json;
  assert.equal(runContextPolicy.status, 'fail_closed_consumer_preflight_available');
  assert.equal(runContextPolicy.requires_paper_root_for_bound_readback, true);
  assert.equal(runContextPolicy.missing_run_context_status, 'missing_run_context');
  assert.equal(runContextPolicy.target_mismatch_status, 'target_mismatch');
  assert.equal(runContextPolicy.host_environment_fallback_allowed, false);
  assert.equal(runContextPolicy.run_context_exists_counts_as_provider_ready, false);
  assert.equal(runContextPolicy.run_context_exists_counts_as_domain_ready, false);
  assert.equal(runContextPolicy.can_schedule_domain_stage, false);
  assert.equal(runContextPolicy.can_claim_provider_ready, false);
  assert.equal(runContextPolicy.can_claim_runtime_ready, false);
  assert.equal(runContextPolicy.can_claim_domain_ready, false);

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
    'ledger',
    'pack',
    'runway',
    'stagecraft',
    'workspace',
  ]);
  assert.equal(moduleMapping.runway.role, 'runtime_materialization_and_run_consumption');
  assert.equal(moduleMapping.pack.role, 'descriptor_lock_layer_manifest_and_distribution_refs');

  const forbiddenClaims = contract.forbidden_claims as string[];
  assert.equal(forbiddenClaims.includes('runtime_cache_hit_means_ready'), true);
  assert.equal(forbiddenClaims.includes('materialization_skeleton_means_runtime_ready'), true);
  assert.equal(forbiddenClaims.includes('runtime_environment_receipt_means_domain_ready'), true);
  assert.equal(forbiddenClaims.includes('external_sandbox_template_exists_means_provider_ready'), true);
  assert.equal(forbiddenClaims.includes('external_sandbox_snapshot_exists_means_runtime_ready'), true);
  assert.equal(forbiddenClaims.includes('external_sandbox_receipt_means_domain_ready'), true);
  assert.equal(forbiddenClaims.includes('missing_run_context_allows_host_environment_fallback'), true);
  assert.equal(forbiddenClaims.includes('run_context_target_mismatch_allows_consumer_execution'), true);

  const readbackCommands = contract.readback_commands as string[];
  assert.equal(readbackCommands.some((command) => command.startsWith('opl runtime env build')), true);
  assert.equal(
    readbackCommands.includes(
      'opl runtime env prepare --domain <domain> --profile <profile> --platform <platform> --requirement-profile <path> [--requirement-profile-id <id>] --paper-root <path> [--apply]',
    ),
    true,
  );
  assert.equal(
    readbackCommands.includes(
      'opl runtime env run-context --domain <domain> --profile <profile> [--paper-root <path>]',
    ),
    true,
  );
  assert.equal(readbackCommands.some((command) => command.startsWith('opl runtime env materialize')), true);
  assert.equal(readbackCommands.some((command) => command.startsWith('opl runtime env verify')), true);
  assert.equal(readbackCommands.includes('opl runtime env cache inventory'), true);
  assert.equal(readbackCommands.includes('opl runtime env cache prune --dry-run'), true);
});

test('runtime env build readback exposes Full bundle producer manifest lock refs without App release authority', () => {
  const readback = buildRuntimeEnvironmentBuildReadback({
    domainId: 'mas',
    profileId: 'full',
    platformId: 'macos-arm64',
  }) as Json;

  assert.equal(readback.command, 'build');
  assert.equal(readback.dry_run, true);
  assert.equal(readback.can_claim_runtime_ready, false);
  assert.equal(readback.can_claim_domain_ready, false);
  assert.equal(readback.can_claim_app_release_ready, false);

  const bundleLock = readback.bundle_lock as Json;
  const bundleManifest = readback.bundle_manifest as Json;
  const producer = readback.runtime_bundle_producer as Json;
  const receipt = readback.producer_receipt as Json;

  assert.match(bundleLock.lock_ref as string, /^runtime-lock:mas\/full\/macos-arm64:sha256:/);
  assert.match(bundleManifest.bundle_ref as string, /^runtime-bundle:mas\/full\/macos-arm64:sha256:/);
  assert.equal(producer.producer_kind, 'opl-runtime-bundle');
  assert.equal(producer.producer_command_ref, 'opl-runtime-env-command:build');
  assert.equal(producer.manifest_schema_version, 'opl-runtime-bundle-manifest.v1');
  assert.equal(producer.lock_schema_version, 'opl-runtime-bundle-lock.v1');
  assert.equal((producer.target_profile as Json).profile_id, 'full');
  assert.equal(producer.target_platform_id, 'macos-arm64');
  assert.equal(readback.sandbox_provider, 'local_managed_root');
  const sandboxPlan = readback.sandbox_provider_plan as Json;
  assert.equal(sandboxPlan.selected_provider, 'local_managed_root');
  assert.equal(sandboxPlan.provider_role, 'local_materialized_runtime_root');
  assert.equal(sandboxPlan.temporal_replacement, false);
  assert.equal(sandboxPlan.can_claim_provider_ready, false);
  assert.equal((producer.layer_taxonomy as unknown[]).length, 6);
  assert.equal((producer.false_ready_flags as Json).dry_run_projection_counts_as_app_release_ready, false);
  assert.equal((producer.false_ready_flags as Json).bundle_lock_exists_counts_as_app_full_release_ready, false);
  assert.equal((producer.app_full_consumer_boundary as Json).app_owns_release_verdict, true);
  assert.equal((producer.app_full_consumer_boundary as Json).framework_can_claim_app_release_ready, false);
  assert.equal(receipt.bundle_manifest_ref, bundleManifest.bundle_ref);
  assert.equal(receipt.bundle_lock_ref, bundleLock.lock_ref);
  assert.equal(receipt.readback_ref, producer.producer_readback_ref);
  assert.equal(receipt.can_claim_runtime_ready, false);
  assert.equal(receipt.can_claim_domain_ready, false);
  assert.equal(receipt.can_claim_app_release_ready, false);
});

test('runtime env build readback exposes external sandbox provider plan without provider authority', () => {
  const readback = buildRuntimeEnvironmentBuildReadback({
    domainId: 'mas',
    profileId: 'analysis',
    platformId: 'linux-x64',
    sandboxProvider: 'external_sandbox',
  }) as Json;

  assert.equal(readback.command, 'build');
  assert.equal(readback.sandbox_provider, 'external_sandbox');
  assert.equal(readback.can_claim_runtime_ready, false);
  const plan = readback.sandbox_provider_plan as Json;
  assert.equal(plan.status, 'external_sandbox_provider_adapter_required');
  assert.equal(plan.provider_role, 'agent_sandbox_execution_substrate');
  assert.deepEqual(plan.external_provider_examples, ['e2b', 'daytona', 'modal']);
  assert.equal(plan.template_ref, 'sandbox-template:mas/analysis/linux-x64');
  assert.equal(plan.required_receipt_kind, 'external_sandbox_provider_receipt');
  assert.equal(plan.temporal_replacement, false);
  assert.equal(plan.live_provider_receipt_required, true);
  assert.equal(plan.can_claim_provider_ready, false);
  assert.equal(plan.can_claim_runtime_ready, false);
  assert.equal(plan.can_claim_domain_ready, false);

  const producer = readback.runtime_bundle_producer as Json;
  const flags = producer.false_ready_flags as Json;
  assert.equal(producer.sandbox_provider, 'external_sandbox');
  assert.equal(flags.external_sandbox_template_exists_counts_as_provider_ready, false);
  assert.equal(flags.external_sandbox_receipt_counts_as_domain_ready, false);
});
