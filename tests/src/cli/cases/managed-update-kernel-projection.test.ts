import { assert, fs, parseJsonText, path, repoRoot, runCli, runCliFailure, test } from '../helpers.ts';
import os from 'node:os';
import { formatJsonPayload } from '../../../../src/kernel/json-file.ts';
import { loadFrameworkContracts } from '../../../../src/modules/charter/contracts.ts';
import { buildManagedUpdateKernelProjection } from '../../../../src/modules/connect/managed-update-kernel.ts';
import { selectedManagedUpdateComponentIds } from '../../../../src/modules/connect/managed-update-owner-boundary.ts';
import { getOplPackageSpecs } from '../../../../src/modules/connect/package-distribution.ts';
import { loadDeveloperCheckoutPackageSource } from '../../../../src/modules/connect/agent-package-registry-parts/developer-checkout-package-source.ts';
import { writePackageCatalog } from './packages-cases/capability-fixtures.ts';

function readManagedUpdateKernelContract() {
  return parseJsonText(
    fs.readFileSync(
      path.join(repoRoot, 'contracts/opl-framework/managed-update-kernel-contract.json'),
      'utf8',
    ),
  ) as Record<string, any>;
}

function writeFixtureFile(root: string, relativePath: string, content: string) {
  const targetPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);
  return targetPath;
}

function writeDeveloperPackageFixture(root: string, packageId: 'mag' | 'opl-flow', version: string) {
  const spec = getOplPackageSpecs().find((entry) => entry.package_id === packageId)!;
  const frameworkManifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, spec.package_manifest_ref),
    'utf8',
  )) as Record<string, any>;
  const checkoutPath = path.join(root, spec.repo_name);
  const ownerPayload = packageId === 'opl-flow'
    ? {
        schema: 'opl_flow_workflow_policy.v1',
        package: {
          id: packageId,
          version,
          owner: packageId,
          kind: 'workflow_profile',
        },
      }
    : {
        ...frameworkManifest,
        version,
        source: 'first_party_repo_local',
      };
  writeFixtureFile(
    checkoutPath,
    spec.owner_package_manifest_ref,
    formatJsonPayload(ownerPayload),
  );
  writeFixtureFile(
    checkoutPath,
    spec.owner_plugin_manifest_ref,
    formatJsonPayload({
      name: frameworkManifest.codex_surface.plugin_id,
      version,
      skills: './skills/',
    }),
  );
  const pluginRoot = path.dirname(path.dirname(path.join(checkoutPath, spec.owner_plugin_manifest_ref)));
  const requiredSkillIds = frameworkManifest.codex_surface.required_skill_ids as string[];
  const skillPaths = requiredSkillIds.map((skillId) => writeFixtureFile(
    pluginRoot,
    path.join('skills', skillId, 'SKILL.md'),
    `# ${skillId}\n`,
  ));
  if (packageId === 'opl-flow') {
    const declaredPaths = [
      frameworkManifest.profile_surface.runtime_profile.source_path,
      ...frameworkManifest.profile_surface.authoring_sources.map((entry: any) => entry.source_path),
      ...frameworkManifest.profile_surface.merge_context_paths,
      frameworkManifest.managed_policy_surface.schema_path,
    ] as string[];
    for (const relativePath of new Set(declaredPaths)) {
      writeFixtureFile(
        checkoutPath,
        relativePath,
        relativePath.endsWith('.json') ? formatJsonPayload({ type: 'object' }) : '# Fixture\n',
      );
    }
  }
  return {
    checkoutPath,
    skillPath: skillPaths[0],
    source: loadDeveloperCheckoutPackageSource(packageId, checkoutPath),
  };
}

function developerPackageLock(
  packageId: 'mag' | 'opl-flow',
  source: ReturnType<typeof loadDeveloperCheckoutPackageSource>,
) {
  return {
    surface_kind: 'opl_agent_package_lock',
    package_id: packageId,
    agent_id: packageId === 'opl-flow' ? null : packageId,
    package_role: source.ownerManifest.package_role,
    display_name: source.ownerManifest.display_name,
    publisher: source.ownerManifest.publisher,
    package_version: source.ownerManifest.version,
    source_kind: 'developer_checkout_override',
    manifest_url: source.source.owner_manifest_path,
    manifest_sha256: source.source.owner_manifest_sha256,
    content_digest: source.source.payload_digest,
    artifact_digest: null,
    owner_source_commit: source.source.source_git_head_sha,
    lock_ref: `opl://agent-package-lock/${packageId}/${source.ownerManifest.version}/fixture`,
    physical_surface: { status: 'materialized', failure_reason: null },
    resolved_dependencies: [],
    developer_checkout_source: source.source,
  };
}

function bundledPackageLockFixture(packageId: 'mag') {
  const catalog = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/bundled-full-runtime-package-catalog.json'),
    'utf8',
  )) as Record<string, any>;
  const entry = catalog.packages[packageId];
  const manifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework', entry.manifest_ref),
    'utf8',
  )) as Record<string, any>;
  return {
    surface_kind: 'opl_agent_package_lock',
    package_id: packageId,
    agent_id: packageId,
    package_role: entry.package_role,
    display_name: manifest.display_name,
    publisher: manifest.publisher,
    package_version: '0.0.0',
    source_kind: 'bundled_full_runtime_modules',
    manifest_url: `file://${path.join(repoRoot, 'contracts/opl-framework', entry.manifest_ref)}`,
    manifest_sha256: '0'.repeat(64),
    content_digest: `sha256:${'0'.repeat(64)}`,
    artifact_digest: null,
    owner_source_commit: '0'.repeat(40),
    lock_ref: `opl://agent-package-lock/${packageId}/0.0.0/rootless-fixture`,
    physical_surface: { status: 'materialized', failure_reason: null },
    resolved_dependencies: [],
    carrier_authority: {
      catalog_ref: 'file:///stale/bundled-full-runtime-package-catalog.json',
      catalog_sha256: `sha256:${'0'.repeat(64)}`,
    },
  };
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
  assert.equal(packages.transaction_guards.developer_checkout_policy, 'source_reconcile_then_protect_no_channel_overwrite');
  assert.equal(packages.transaction_guards.codex_skill_plugin_sync, 'same_transaction_post_apply');
  assert.equal(packages.transaction_guards.receipt_policy, 'single_package_transaction_receipt');
  assert.deepEqual(packages.currentness_identity_fields, [
    'source_kind',
    'package_version',
    'manifest_sha256',
    'content_digest',
    'artifact_digest',
  ]);
  assert.equal(packages.auto_apply.current_noop_receipt_policy, 'do_not_write_component_receipt');
  assert.equal(packages.auto_apply.bundled_full_runtime_command_ref, 'opl update apply --json');
  const bundled = packages.bundled_full_runtime_reconciliation;
  assert.equal(
    bundled.top_level_selection_policy,
    'component_neutral_selected_managed_update_components',
  );
  assert.equal(bundled.package_adapter_component_id, 'opl_packages');
  assert.equal(bundled.bundled_source_plane_scope, 'opl_packages_adapter_only');
  assert.deepEqual(bundled.top_level_components_forced_or_excluded, []);
  assert.deepEqual(bundled.root_package_ids_exact, ['mag', 'mas', 'obf', 'oma', 'opl-flow', 'rca']);
  assert.deepEqual(bundled.dependency_closure_package_ids_exact, [
    'mag', 'mas', 'mas-scholar-skills', 'obf', 'oma', 'opl-flow', 'rca',
  ]);
  assert.equal(bundled.source_root_authority.required_for_public_apply, true);
  assert.equal(
    bundled.source_root_authority.missing_or_incomplete_policy,
    'fail_closed_without_generic_package_fallback',
  );
  assert.equal(bundled.orchestration.failure_policy, 'fail_open_per_root_package');
  assert.equal(bundled.orchestration.successful_root_policy, 'commit_and_retain');
  assert.equal(bundled.orchestration.continuation_policy, 'continue_independent_remaining_roots');
  assert.deepEqual(bundled.orchestration.aggregate_status_values, ['completed', 'partial', 'failed']);
  assert.deepEqual(bundled.orchestration.target_status_values, [
    'completed', 'failed', 'manual_required', 'skipped',
  ]);
  assert.equal(
    bundled.package_mutation_unit.failure_policy,
    'fail_closed_with_local_prestate_restored',
  );
  assert.equal(
    bundled.package_mutation_unit.commit_point,
    'after_catalog_and_materialized_lock_final_verification',
  );
  assert.equal(
    bundled.package_mutation_unit.rollback_success_evidence,
    'restored_snapshot_paths_mechanically_match_local_prestate',
  );
  assert.equal(
    bundled.package_mutation_unit.unproven_restore_reporting,
    'local_prestate_restored_is_false_or_null_never_true',
  );
  assert.equal(
    bundled.package_mutation_unit.package_lifecycle_exclusion.release_policy,
    'release_before_the_next_independent_root',
  );
  assert.equal(bundled.post_apply_currentness.writes_performed, false);
  assert.equal(bundled.post_apply_currentness.command_ref, 'opl packages status --json');
  assert.equal(bundled.post_apply_currentness.ordinary_package_update_guidance_allowed, false);
  assert.equal(
    bundled.execution_receipt_authority.target_receipt_ref_field,
    'target.result.lifecycle_receipt.receipt_ref',
  );
  assert.equal(
    bundled.execution_receipt_authority.component_aggregate_binding_field,
    'component_receipt.adapter_result_ref',
  );
  assert.equal(bundled.execution_receipt_authority.duplicate_target_receipt_ref_list, false);
  assert.equal(bundled.recovery.configure_codex_allowed, false);
  assert.equal(bundled.recovery.command_ref.includes('configure-codex'), false);
  assert.equal(
    packages.partial_outcome_policy,
    'apply_all_eligible_targets_run_post_apply_when_any_target_changed_and_report_current_changed_manual_failed_separately',
  );
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

test('OPL Packages evaluates MAG and OPL Flow against their effective developer targets', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-developer-targets-'));
  const homeDir = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const developerVersion = '9.9.0';
  const releaseVersion = '0.1.0';
  const mag = writeDeveloperPackageFixture(root, 'mag', developerVersion);
  const flow = writeDeveloperPackageFixture(root, 'opl-flow', developerVersion);
  const oldMagManifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/packages/mag.json'),
    'utf8',
  )) as Record<string, any>;
  const oldMagManifestPath = writeFixtureFile(
    path.join(root, 'release-source'),
    'mag.json',
    formatJsonPayload({ ...oldMagManifest, version: releaseVersion }),
  );
  const releaseCatalog = writePackageCatalog(path.join(root, 'release-catalog'), [oldMagManifestPath]);
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'agent-package-locks.json'), formatJsonPayload({
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages: [
      developerPackageLock('mag', mag.source),
      developerPackageLock('opl-flow', flow.source),
    ],
    last_known_good_transactions: [],
  }));
  fs.writeFileSync(path.join(stateDir, 'agent-package-release-catalog-cache.json'), formatJsonPayload({
    surface_kind: 'opl_agent_package_release_catalog_cache.v1',
    catalog_ref: 'ghcr.io/fixture/one-person-lab-manifest:fixture',
    catalog_digest: `sha256:${'9'.repeat(64)}`,
    checked_at: new Date().toISOString(),
    catalog_payload: parseJsonText(fs.readFileSync(releaseCatalog.catalogPath, 'utf8')),
  }));
  const env = {
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
    OPL_MODULE_PATH_MEDAUTOGRANT: mag.checkoutPath,
    OPL_MODULE_PATH_OPLFLOW: flow.checkoutPath,
    OPL_FULL_RUNTIME_MODULE_OVERRIDES: '',
  };
  const previousEnv = new Map(Object.keys(env).map((key) => [key, process.env[key]]));

  try {
    for (const [key, value] of Object.entries(env)) process.env[key] = value;
    const current = await buildManagedUpdateKernelProjection(loadFrameworkContracts(), {
      operation: 'status',
      componentId: 'opl_packages',
    }) as Record<string, any>;
    const currentPackages = current.managed_update.components[0];
    const magCurrent = currentPackages.current.package_lock_states.find(
      (entry: Record<string, unknown>) => entry.package_id === 'mag',
    );
    const flowCurrent = currentPackages.current.package_lock_states.find(
      (entry: Record<string, unknown>) => entry.package_id === 'opl-flow',
    );

    assert.equal(currentPackages.state, 'current');
    assert.equal(currentPackages.plan.action, 'none');
    for (const entry of [magCurrent, flowCurrent]) {
      assert.equal(entry.state, 'current');
      assert.equal(entry.reason, 'installed_identity_matches_developer_checkout_target');
      assert.equal(entry.currentness.status, 'current');
      assert.equal(entry.currentness.target_version, developerVersion);
      assert.equal(entry.target.source_kind, 'developer_checkout_override');
      assert.equal(entry.target.package_version, developerVersion);
      assert.equal(entry.target.source_artifact_ref, null);
      assert.notEqual(entry.target.package_version, releaseVersion);
    }

    fs.appendFileSync(mag.skillPath, '\nDeveloper checkout changed.\n');
    const drifted = await buildManagedUpdateKernelProjection(loadFrameworkContracts(), {
      operation: 'status',
      componentId: 'opl_packages',
    }) as Record<string, any>;
    const driftedPackages = drifted.managed_update.components[0];
    const magDrifted = driftedPackages.current.package_lock_states.find(
      (entry: Record<string, unknown>) => entry.package_id === 'mag',
    );
    const flowStillCurrent = driftedPackages.current.package_lock_states.find(
      (entry: Record<string, unknown>) => entry.package_id === 'opl-flow',
    );

    assert.equal(driftedPackages.state, 'update_available');
    assert.equal(driftedPackages.plan.action, 'update');
    assert.equal(magDrifted.state, 'update_available');
    assert.equal(magDrifted.reason, 'developer_checkout_target_differs');
    assert.equal(magDrifted.currentness.status, 'update_available');
    assert.equal(magDrifted.currentness.reasons.includes('developer_payload_changed'), true);
    assert.equal(magDrifted.target.package_version, developerVersion);
    assert.equal(flowStillCurrent.state, 'current');
  } finally {
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
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

test('canonical bundled projection freezes root6 closure7 and OPL Flow policy v2', () => {
  const catalog = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/bundled-full-runtime-package-catalog.json'),
    'utf8',
  )) as Record<string, any>;
  const flow = catalog.packages['opl-flow'];
  const manifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework', flow.manifest_ref),
    'utf8',
  )) as Record<string, any>;
  const payload = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework', flow.payload_manifest_ref),
    'utf8',
  )) as Record<string, any>;

  assert.deepEqual(Object.keys(catalog.packages).sort(), [
    'mag', 'mas', 'mas-scholar-skills', 'obf', 'oma', 'opl-flow', 'rca',
  ]);
  assert.equal(flow.package_version, '0.1.25');
  assert.equal(manifest.version, '0.1.25');
  assert.equal(manifest.profile_surface.existing_profile_policy, 'semantic_merge_required');
  assert.equal(manifest.managed_policy_surface.policy_kind, 'opl_flow_workflow_policy');
  assert.deepEqual(manifest.codex_surface.required_skill_ids, ['coordinate-concurrent-tasks', 'opl-flow']);
  assert.equal(payload.surface_kind, 'opl_package_payload_manifest.v2');
  assert.equal(payload.source_commit, flow.owner_source_commit);
  assert.match(payload.content_lock.digest, /^sha256:[0-9a-f]{64}$/);
});

test('component-neutral apply runs eligible Base and bundled Packages while missing package roots fail closed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-rootless-bundled-'));
  const homeDir = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const codexHome = path.join(homeDir, '.codex');
  const codexBin = path.join(root, 'codex');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    codexBin,
    '#!/bin/sh\necho "codex-cli 0.134.0"\n',
    { mode: 0o755 },
  );
  const lockPath = path.join(stateDir, 'agent-package-locks.json');
  const lockBytes = formatJsonPayload({
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages: [bundledPackageLockFixture('mag')],
    last_known_good_transactions: [],
  });
  fs.writeFileSync(lockPath, lockBytes);
  const env = {
    HOME: homeDir,
    CODEX_HOME: codexHome,
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_BIN: codexBin,
    OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
    OPL_FRAMEWORK_UPDATE_SOURCE: '',
    OPL_FRAMEWORK_UPDATE_ARCHIVE: '',
    OPL_MODULE_SOURCE_MODE: 'package_channel',
    OPL_FULL_RUNTIME_HOME: '',
    OPL_FULL_RUNTIME_MODULE_OVERRIDES: '',
    OPL_FLOW_REPO_ROOT: '',
    OPL_MODULE_PATH_MEDAUTOGRANT: '',
    OPL_MODULE_PATH_MEDAUTOSCIENCE: '',
    OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS: '',
    OPL_MODULE_PATH_OPLBOOKFORGE: '',
    OPL_MODULE_PATH_OPLMETAAGENT: '',
    OPL_MODULE_PATH_OPLFLOW: '',
    OPL_MODULE_PATH_REDCUBE: '',
  };

  try {
    const output = runCli(['update', 'apply'], env) as Record<string, any>;
    assert.deepEqual(
      output.managed_update.components.map((entry: Record<string, unknown>) => entry.component_id),
      ['opl_base', 'opl_packages'],
    );
    assert.deepEqual(
      output.managed_update.execution.adapter_results.map(
        (entry: Record<string, unknown>) => entry.component_id,
      ),
      ['opl_base', 'opl_packages'],
    );
    const baseAdapter = output.managed_update.execution.adapter_results.find(
      (entry: Record<string, unknown>) => entry.component_id === 'opl_base',
    );
    const adapter = output.managed_update.execution.adapter_results.find(
      (entry: Record<string, unknown>) => entry.component_id === 'opl_packages',
    );
    assert.equal(baseAdapter.adapter_id, 'runtime_substrate_adapter');
    assert.equal(adapter.adapter_id, 'capability_packages_adapter');
    const reconciliation = adapter.result.bundled_full_runtime_reconciliation;
    assert.equal(adapter.status, 'failed');
    assert.equal(adapter.result.auto_apply_scope, 'catalog_owned_bundled_full_runtime_root_packages_only');
    assert.equal(reconciliation.status, 'failed');
    assert.equal(reconciliation.orchestration_policy, 'fail_open_per_root_package');
    assert.equal(
      reconciliation.failures[0].failure_code,
      'full_runtime_package_source_authority_incomplete',
    );
    assert.deepEqual(adapter.result.targets.map((entry: Record<string, unknown>) => entry.target_id), [
      'mag', 'mas', 'obf', 'oma', 'opl-flow', 'rca',
    ]);
    assert.equal(
      adapter.result.targets.every((entry: Record<string, unknown>) => entry.status === 'failed'),
      true,
    );
    assert.equal(
      output.managed_update.execution.receipt_record.receipts.some(
        (entry: Record<string, unknown>) => entry.component_id === 'opl_packages',
      ),
      true,
    );
    assert.equal(fs.readFileSync(lockPath, 'utf8'), lockBytes);
    assert.equal(fs.existsSync(path.join(stateDir, 'managed-update-component-receipts.json')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
