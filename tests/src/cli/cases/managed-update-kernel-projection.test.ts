import { assert, fs, parseJsonText, path, repoRoot, runCli, runCliFailure, test } from '../helpers.ts';
import { loadFrameworkContracts } from '../../../../src/modules/charter/contracts.ts';
import { buildManagedUpdateKernelProjection } from '../../../../src/modules/connect/managed-update-kernel.ts';

function readManagedUpdateKernelContract() {
  return parseJsonText(
    fs.readFileSync(
      path.join(repoRoot, 'contracts/opl-framework/managed-update-kernel-contract.json'),
      'utf8',
    ),
  ) as Record<string, any>;
}

test('managed update contract exposes only OPL Base, OPL App, and OPL Packages lifecycle owners', () => {
  const contract = readManagedUpdateKernelContract();

  assert.deepEqual(contract.components, ['opl_base', 'opl_app', 'opl_packages']);
  assert.deepEqual(contract.component_classes, contract.components);
  assert.deepEqual(
    contract.lifecycle_owners.map((entry: Record<string, unknown>) => entry.lifecycle_owner),
    contract.components,
  );
  assert.equal(Object.hasOwn(contract, 'legacy_component_aliases'), false);
  assert.deepEqual(
    contract.update_plane_state_machine.component_routes.map((entry: Record<string, unknown>) => entry.component_class),
    ['opl_app', 'opl_base', 'opl_packages'],
  );
  assert.deepEqual(
    contract.owner_execution_boundary_contract.runner_can_execute_only_for,
    ['opl_base', 'opl_packages'],
  );
  assert.deepEqual(
    contract.providers.map((entry: Record<string, unknown>) => entry.lifecycle_owner),
    ['opl_app', 'opl_base', 'opl_packages'],
  );

  const packages = contract.providers.find((entry: Record<string, unknown>) =>
    entry.lifecycle_owner === 'opl_packages'
  );
  assert.deepEqual(packages.transaction_status_fields, ['projection_status', 'profile_migration_status']);
  assert.equal(packages.transaction_guards.installed_digest_required, true);
  assert.equal(packages.transaction_guards.dirty_checkout_policy, 'fail_closed_no_overwrite');
  assert.equal(packages.transaction_guards.developer_checkout_policy, 'fail_closed_no_auto_update');
  assert.equal(packages.transaction_guards.codex_skill_plugin_sync, 'same_transaction_post_apply');
  assert.equal(packages.transaction_guards.receipt_policy, 'single_package_transaction_receipt');
  assert.equal(packages.profile_migration_policy.semantic_merge_required, true);
  assert.equal(packages.profile_migration_policy.silent_overwrite_allowed, false);

  assert.deepEqual(contract.app_action_consumer_policy.canonical_delegated_surfaces, {
    module_sync: 'opl packages update',
    settings_sync_capabilities: 'opl packages update',
    settings_apply_opl_packages: 'opl packages update',
    settings_check_app_update: 'opl app state --profile fast',
    settings_rollback_runtime_substrate: 'opl update rollback',
  });
});

test('full managed update projection materializes only the three lifecycle owners', async () => {
  const output = await buildManagedUpdateKernelProjection(loadFrameworkContracts(), {
    operation: 'status',
  }) as Record<string, any>;

  assert.deepEqual(
    output.managed_update.components.map((component: Record<string, unknown>) => component.component_id),
    ['opl_app', 'opl_base', 'opl_packages'],
  );
  assert.equal(
    output.managed_update.components.every(
      (component: Record<string, unknown>) => component.component_class === component.component_id,
    ),
    true,
  );
});

test('opl update is the OPL Base lifecycle and rejects internal component selectors', () => {
  const output = runCli(['update', 'status']) as Record<string, any>;
  const components = output.managed_update.components;

  assert.equal(output.managed_update.requested_component_id, 'opl_base');
  assert.equal(output.managed_update.requested_lifecycle_owner, 'opl_base');
  assert.equal(components.length, 1);
  assert.equal(components[0].component_id, 'opl_base');
  assert.equal(components[0].lifecycle_owner, 'opl_base');
  assert.equal(components[0].provider_id, 'runtime_substrate');
  assert.equal(components[0].authority_boundary.can_mutate_homebrew, false);
  assert.equal(output.managed_update.authority_boundary.can_write_domain_truth, false);

  const failure = runCliFailure(['update', 'status', '--component', 'runtime_substrate']);
  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /Unknown option '--component'/);
});

test('OPL Packages folds Codex projection and profile migration into one guarded transaction', async () => {
  const output = await buildManagedUpdateKernelProjection(loadFrameworkContracts(), {
    operation: 'plan',
    componentId: 'opl_packages',
  }) as Record<string, any>;
  const components = output.managed_update.components;

  assert.equal(components.length, 1);
  assert.equal(components[0].component_id, 'opl_packages');
  assert.equal(components[0].provider_id, 'capability_packages');
  assert.equal(components[0].projection_status.separate_lifecycle_owner, false);
  assert.equal(components[0].projection_status.materialized_by, 'package_transaction_post_apply');
  assert.equal(components[0].profile_migration_status.semantic_merge_required, true);
  assert.equal(components[0].profile_migration_status.silent_overwrite_allowed, false);
  assert.equal(components[0].profile_migration_status.apply_mode, 'fail_closed_owner_handoff');
  assert.equal(components[0].current.transaction_guards.installed_digest_required, true);
  assert.equal(components[0].current.transaction_guards.receipt_policy, 'single_package_transaction_receipt');
  assert.deepEqual(components[0].receipt.content_identity_fields, [
    'digest',
    'sha256',
    'source_fingerprint',
    'git_head_sha',
  ]);
  assert.equal(components[0].authority_boundary.can_overwrite_dirty_checkout, false);
  assert.equal(components[0].authority_boundary.can_overwrite_developer_checkout, false);
});

test('OPL App keeps host update routing while remaining outside opl update apply', async () => {
  const output = await buildManagedUpdateKernelProjection(loadFrameworkContracts(), {
    operation: 'status',
    componentId: 'opl_app',
  }) as Record<string, any>;
  const component = output.managed_update.components[0];

  assert.equal(component.component_id, 'opl_app');
  assert.equal(component.provider_id, 'installation_carrier');
  assert.equal(component.owner_execution_boundary.runner_can_execute, false);
  assert.equal(component.current.host_executor_required, true);
  assert.equal(typeof component.current.host_update_route, 'string');
  assert.equal(component.authority_boundary.can_mutate_installation_carrier, false);
});
