import { assert, fs, parseJsonText, path, repoRoot, runCli, runCliFailure, test } from '../helpers.ts';
import os from 'node:os';
import { loadFrameworkContracts } from '../../../../src/modules/charter/contracts.ts';
import { buildManagedUpdateKernelProjection } from '../../../../src/modules/connect/managed-update-kernel.ts';
import { selectedManagedUpdateComponentIds } from '../../../../src/modules/connect/managed-update-owner-boundary.ts';

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
  assert.deepEqual(contract.base_dependency_catalog_contract.update_mode_values, [
    'silent_managed',
    'explicit_owner_delegated',
    'detect_only_guidance',
  ]);
  assert.equal(contract.base_dependency_catalog_contract.external_dependency_policy.confirmation_required, true);
  assert.equal(contract.base_dependency_catalog_contract.external_dependency_policy.auto_apply_allowed, false);
  assert.equal(contract.base_dependency_catalog_contract.external_dependency_policy.unverified_owner_action, null);
  assert.equal(contract.base_dependency_catalog_contract.external_dependency_policy.temporal_server_currentness_inference_allowed, false);
  assert.equal(
    contract.base_dependency_catalog_contract.flow_dependencies_projection.app_hardcoded_dependency_classification_allowed,
    false,
  );

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

test('opl update projects coordinated Base and installed Packages while rejecting internal selectors', () => {
  const output = runCli(['update', 'status']) as Record<string, any>;
  const components = output.managed_update.components;

  assert.equal(output.managed_update.requested_component_id, null);
  assert.equal(output.managed_update.requested_lifecycle_owner, null);
  assert.deepEqual(components.map((entry: Record<string, unknown>) => entry.component_id), ['opl_app', 'opl_base', 'opl_packages']);
  const base = components.find((entry: Record<string, unknown>) => entry.component_id === 'opl_base');
  assert.equal(base.lifecycle_owner, 'opl_base');
  assert.equal(base.provider_id, 'runtime_substrate');
  assert.equal(base.authority_boundary.can_mutate_homebrew, false);
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

test('generic apply selects only eligible background-safe components while explicit owner actions stay scoped', async () => {
  const output = await buildManagedUpdateKernelProjection(loadFrameworkContracts(), {
    operation: 'plan',
  }) as Record<string, any>;
  const components = output.managed_update.components.map((component: Record<string, any>) => ({
    ...component,
    auto_apply: component.component_id === 'opl_packages'
      ? { ...component.auto_apply, eligible: true, app_background_safe: true, command_ref: 'opl packages update --json' }
      : { ...component.auto_apply, eligible: true, app_background_safe: false, command_ref: 'opl update apply --json' },
  }));

  assert.deepEqual(selectedManagedUpdateComponentIds({ operation: 'apply' }, components), ['opl_packages']);
  assert.deepEqual(selectedManagedUpdateComponentIds({ operation: 'apply', componentId: 'opl_base' }, components), ['opl_base']);
});

test('developer Framework source override is visible but excluded from generic background apply', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-source-override-plan-'));
  const target = path.join(root, 'target');
  const source = path.join(root, 'source');
  for (const directory of [target, source]) {
    fs.mkdirSync(path.join(directory, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(directory, 'src', 'entrypoints'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), '{}\n', 'utf8');
    fs.writeFileSync(path.join(directory, 'bin', 'opl'), '#!/bin/sh\n', { mode: 0o755 });
    fs.writeFileSync(path.join(directory, 'src', 'entrypoints', 'cli.ts'), 'export {};\n', 'utf8');
  }
  const previousSource = process.env.OPL_FRAMEWORK_UPDATE_SOURCE;
  const previousTarget = process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT;
  try {
    process.env.OPL_FRAMEWORK_UPDATE_SOURCE = source;
    process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT = target;
    const output = await buildManagedUpdateKernelProjection(loadFrameworkContracts(), {
      operation: 'plan',
      componentId: 'opl_base',
    }) as Record<string, any>;
    const base = output.managed_update.components[0];
    assert.equal(base.current.opl_framework_runtime.source_root_configured, true);
    assert.equal(base.auto_apply.eligible, false);
    assert.equal(base.auto_apply.app_background_safe, false);
    assert.deepEqual(base.auto_apply.blocked_reasons, ['developer_framework_source_override_detect_only']);
  } finally {
    if (previousSource === undefined) delete process.env.OPL_FRAMEWORK_UPDATE_SOURCE;
    else process.env.OPL_FRAMEWORK_UPDATE_SOURCE = previousSource;
    if (previousTarget === undefined) delete process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT;
    else process.env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT = previousTarget;
    fs.rmSync(root, { recursive: true, force: true });
  }
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
