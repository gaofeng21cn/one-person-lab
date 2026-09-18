import {
  assert,
  fs,
  installRuntimePackageFixture,
  os,
  path,
  removeFixtureTree,
  runCli,
  runCliAsync,
  runCliFailure,
  test,
} from '../helpers.ts';
import {
  commitDeveloperFixture,
  writeCapabilityProvider,
  writeMasConsumer,
} from './packages-cases/capability-fixtures.ts';
import { createFakeCodexPluginManagerFixture } from '../helpers-parts/fixtures.ts';
import {
  ensureFamilyRuntimePackageLaunchReady,
  packageLaunchHardStopReason,
  packageRuntimeSourceCheckoutPath,
} from '../../../../src/adapters/execution/family-runtime-package-readiness.ts';
import {
  readAgentPackageReadinessPort,
  registerAgentPackageReadinessPort,
} from '../../../../src/kernel/agent-package-readiness-port.ts';

function createArgs(workspace: string) {
  return [
    'family-runtime', 'attempt', 'create',
    '--domain', 'medautoscience',
    '--stage', 'scout',
    '--provider', 'temporal',
    '--workspace-locator', JSON.stringify({ workspace_root: workspace }),
    '--source-fingerprint', 'sha256:package-readiness-gate',
  ];
}

function writeEmptyCapabilityMap(consumerRoot: string) {
  const contractsRoot = path.join(consumerRoot, 'plugins', 'med-autoscience', 'contracts');
  fs.mkdirSync(contractsRoot, { recursive: true });
  fs.writeFileSync(path.join(contractsRoot, 'capability_map.json'), `${JSON.stringify({
    surface_kind: 'opl_standard_agent_capability_map',
    capabilities: [],
  }, null, 2)}\n`);
}

test('package launch ignores retired materialization readiness and enforces native status', () => {
  assert.equal(packageLaunchHardStopReason({ installed_package_count: 0 }), 'package_not_installed');
  assert.equal(packageLaunchHardStopReason({
    installed_package_count: 1,
    package_dependency_readiness: {
      dependencies: [{ required: true, reasons: ['version_requirement_unsatisfied'] }],
    },
    launch_allowed: true,
  }), null);
  for (const reason of [
    'dependency_lock_missing',
    'dependency_disabled',
    'package_id_mismatch',
    'required_exports_missing',
    'required_modules_missing',
  ]) {
    assert.equal(packageLaunchHardStopReason({
      installed_package_count: 1,
      package_dependency_readiness: {
        dependencies: [{ required: true, reasons: [reason] }],
      },
      launch_allowed: false,
      launch_blocked_reason: reason,
    }), reason);
  }
  assert.equal(packageLaunchHardStopReason({
    installed_package_count: 1,
    materialization_readiness: {
      status: 'missing',
      core_readiness: { status: 'missing' },
    },
    launch_allowed: true,
  }), null);
  assert.equal(packageLaunchHardStopReason({
    installed_package_count: 1,
    launch_allowed: false,
    launch_blocked_reason: 'carrier_source_unavailable',
  }), 'carrier_source_unavailable');
});

test('effective runtime checkout is authoritative over the nested native carrier source', () => {
  assert.equal(packageRuntimeSourceCheckoutPath({
    effective_runtime_checkout_path: '/tmp/native-runtime-checkout',
    installed_carrier_readback: {
      lifecycle_authority: 'carrier_owned',
      source_ref: '/tmp/native-plugin',
    },
    installed_readiness: {
      installed: true,
      physical_status: 'available',
      callability: 'callable',
    },
    configured_carrier: {
      status: 'installed',
      executor: { status: 'callable' },
      plugin_source_path: '/tmp/native-plugin',
    },
    runtime_source_readiness: {
      status: 'current',
      operational_ready: true,
      checkout_path: '/tmp/legacy-source',
    },
  }), '/tmp/native-runtime-checkout');
});

test('native carrier plugin source remains the fallback without an effective runtime checkout', () => {
  assert.equal(packageRuntimeSourceCheckoutPath({
    installed_carrier_readback: {
      lifecycle_authority: 'carrier_owned',
      source_ref: '/tmp/native-plugin',
    },
    installed_readiness: {
      installed: true,
      physical_status: 'available',
      callability: 'callable',
    },
  }), '/tmp/native-plugin');
});

test('verified local carrier uses its marketplace root without state-local source policy', () => {
  const marketplaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-marketplace-'));
  const pluginRoot = path.join(marketplaceRoot, 'plugins', 'native-plugin');
  fs.mkdirSync(path.join(marketplaceRoot, 'contracts'), { recursive: true });
  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.writeFileSync(path.join(marketplaceRoot, 'contracts', 'domain_descriptor.json'), '{}\n');
  try {
    assert.equal(packageRuntimeSourceCheckoutPath({
      installed_carrier_readback: {
        kind: 'local',
        lifecycle_authority: 'carrier_owned',
        source_ref: pluginRoot,
      },
      installed_readiness: {
        installed: true,
        physical_status: 'available',
        callability: 'callable',
      },
      configured_carrier: {
        status: 'installed',
        plugin_source_path: pluginRoot,
        carrier: {
          marketplace_source: marketplaceRoot,
          precedence: 'exact_single_source',
          observed_sources: [{
            marketplace_source: marketplaceRoot,
            plugin_source_path: pluginRoot,
          }],
        },
      },
    }), fs.realpathSync.native(marketplaceRoot));
  } finally {
    fs.rmSync(marketplaceRoot, { recursive: true, force: true });
  }
});

test('Git marketplace launch resolves the same verified runtime root as hosted actions', () => {
  const marketplaceRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-git-marketplace-')));
  const pluginRoot = path.join(marketplaceRoot, 'plugins', 'med-autoscience');
  fs.mkdirSync(path.join(marketplaceRoot, 'contracts'), { recursive: true });
  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.writeFileSync(path.join(marketplaceRoot, 'contracts/domain_descriptor.json'), '{}\n');
  const marker = path.join(marketplaceRoot, '.codex-marketplace-install.json');
  const status = {
    installed_carrier_readback: { kind: 'local', lifecycle_authority: 'carrier_owned', source_ref: pluginRoot },
    installed_readiness: { installed: true, physical_status: 'available', callability: 'callable' },
    configured_carrier: {
      status: 'installed', plugin_source_path: pluginRoot,
      carrier: {
        marketplace_source: 'gaofeng21cn/med-autoscience', precedence: 'exact_single_source',
        observed_sources: [{ marketplace_source: 'https://github.com/gaofeng21cn/med-autoscience.git', plugin_source_path: pluginRoot }],
      },
    },
  };
  try {
    fs.writeFileSync(marker, JSON.stringify({ source: 'https://github.com/gaofeng21cn/med-autoscience.git' }));
    assert.equal(packageRuntimeSourceCheckoutPath(status), marketplaceRoot);
    status.configured_carrier.carrier.observed_sources[0].marketplace_source = marketplaceRoot;
    assert.equal(packageRuntimeSourceCheckoutPath(status), marketplaceRoot);
    status.configured_carrier.carrier.observed_sources[0].marketplace_source = path.dirname(marketplaceRoot);
    assert.equal(packageRuntimeSourceCheckoutPath(status), pluginRoot);
    status.configured_carrier.carrier.observed_sources[0].marketplace_source = marketplaceRoot;
    fs.writeFileSync(marker, JSON.stringify({ source: 'https://github.com/other/foreign.git' }));
    assert.equal(packageRuntimeSourceCheckoutPath(status), pluginRoot);
  } finally {
    fs.rmSync(marketplaceRoot, { recursive: true, force: true });
  }
});

test('native carrier with missing source fails closed instead of falling back', () => {
  assert.equal(packageRuntimeSourceCheckoutPath({
    installed_carrier_readback: {
      lifecycle_authority: 'carrier_owned',
      source_ref: null,
    },
    installed_readiness: {
      installed: true,
      physical_status: 'available',
      callability: 'callable',
    },
    runtime_source_readiness: {
      status: 'current',
      operational_ready: true,
      checkout_path: '/tmp/legacy-source',
    },
  }), null);
});

test('retired compatibility runtime source is ignored without a native carrier', () => {
  assert.equal(packageRuntimeSourceCheckoutPath({
    runtime_source_readiness: {
      status: 'current',
      operational_ready: true,
      checkout_path: '/tmp/managed-source',
    },
  }), null);
  assert.equal(packageRuntimeSourceCheckoutPath({
    runtime_source_readiness: {
      status: 'incompatible',
      operational_ready: false,
      checkout_path: '/tmp/stale-source',
    },
  }), null);
});

test('MAG start materializes a workspace-bound native package-use binding without retired receipts', async () => {
  const previousPort = readAgentPackageReadinessPort();
  const workspace = '/tmp/opl-mag-package-use-binding-proof';
  const packageStatus = {
    installed_package_count: 1,
    launch_allowed: true,
    installed_manifest_sha256: 'a'.repeat(64),
    installed_content_digest: `sha256:${'b'.repeat(64)}`,
    installed_carrier_readback: {
      kind: 'local',
      lifecycle_authority: 'carrier_owned',
      source_ref: '/tmp/opl-mag-native-carrier',
      version: '0.3.12',
    },
    configured_carrier: {
      status: 'installed',
      installed_version: '0.3.12',
    },
    package_dependency_readiness: { dependencies: [] },
  };
  registerAgentPackageReadinessPort({
    readStatus: () => ({ opl_agent_package_status: packageStatus }),
    refreshWorkspaceSkills: () => ({
      projection: {
        core_digest: `sha256:${'c'.repeat(64)}`,
        full_export_digest: `sha256:${'d'.repeat(64)}`,
      },
    }),
  });
  try {
    const createOnly = await ensureFamilyRuntimePackageLaunchReady({
      domainId: 'medautogrant',
      workspaceLocator: { workspace_root: workspace },
    });
    assert.equal(createOnly?.package_use_binding, null);

    const started = await ensureFamilyRuntimePackageLaunchReady({
      domainId: 'medautogrant',
      workspaceLocator: { workspace_root: workspace },
      useBoundaryId: 'package-use_mag-focused-proof',
    });
    assert.deepEqual(started?.package_use_binding, {
      surface_kind: 'opl_agent_package_use_binding.v1',
      binding_origin: 'installed_native_carrier',
      scope: 'workspace',
      target_root: workspace,
      root_package: started?.native_package_closure.root_package,
      provider_packages: [],
      dependency_closure_digest: started?.native_package_closure.dependency_closure_digest,
      core_skill_tree_digest: `sha256:${'c'.repeat(64)}`,
      skill_tree_digest: `sha256:${'d'.repeat(64)}`,
      use_boundary_id: 'package-use_mag-focused-proof',
    });
    assert.equal(Object.hasOwn(started?.package_use_binding ?? {}, 'use_receipt_ref'), false);
  } finally {
    if (previousPort) registerAgentPackageReadinessPort(previousPort);
  }
});

test('family-runtime attempt create fails closed when the canonical domain package is not installed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-package-not-installed-'));
  const workspace = path.join(root, 'workspace');
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_CODEX_PLUGIN_BIN: createFakeCodexPluginManagerFixture(
      path.join(root, 'fake-codex-plugin-manager'),
    ).codexPath,
  };
  fs.mkdirSync(workspace, { recursive: true });
  try {
    const failure = runCliFailure(createArgs(workspace), env);
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_operational_readiness_blocked');
    assert.equal(failure.payload.error.details.launch_blocked_reason, 'package_not_installed');
    assert.deepEqual(failure.payload.error.details.allowed_when_blocked, ['status', 'repair']);
  } finally {
    removeFixtureTree(root);
  }
});

test('a retained legacy package lock is not accepted as an installed native carrier', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-retained-legacy-lock-'));
  const workspace = path.join(root, 'workspace');
  const stateRoot = path.join(root, 'state');
  fs.mkdirSync(workspace, { recursive: true });
  try {
    installRuntimePackageFixture(stateRoot, 'mas');
    const env = { OPL_STATE_DIR: stateRoot, CODEX_HOME: path.join(root, 'codex-home') };
    const status = runCli(['packages', 'status', '--package-id', 'mas'], env).opl_agent_package_status;
    assert.equal(status.installed_package_count, 0);
    assert.equal(status.installed_readiness, null);
    assert.equal(status.configured_carrier, null);
    assert.equal(status.operational_ready, false);
    assert.equal(status.launch_allowed, false);
    assert.equal(status.launch_blocked_reason, 'native_carrier_descriptor_unavailable');

    const failure = runCliFailure(createArgs(workspace), env);
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_operational_readiness_blocked');
    assert.equal(failure.payload.error.details.launch_blocked_reason, 'package_not_installed');
  } finally {
    removeFixtureTree(root);
  }
});

test('native package launch projects Workspace Skills without private lifecycle state', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-native-package-launch-'));
  const workspace = path.join(root, 'workspace');
  const providerRoot = path.join(root, 'provider');
  const consumerRoot = path.join(root, 'consumer');
  const providerManifest = writeCapabilityProvider(providerRoot, '0.1.0', {
    configuredCarrier: true,
  });
  writeMasConsumer(
    consumerRoot,
    providerManifest,
    '0.1.0a4',
    { configuredCarrier: true },
  );
  writeEmptyCapabilityMap(consumerRoot);
  commitDeveloperFixture(
    path.join(consumerRoot, 'plugins', 'med-autoscience'),
    'native package launch fixture',
  );
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: path.join(consumerRoot, 'plugins', 'med-autoscience'),
    OPL_MODULE_PATH_SCHOLARSKILLS: providerRoot,
    OPL_CODEX_PLUGIN_BIN: createFakeCodexPluginManagerFixture(
      path.join(root, 'fake-codex-plugin-manager'),
    ).codexPath,
  };
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(env.CODEX_HOME, { recursive: true });
  fs.writeFileSync(path.join(env.CODEX_HOME, 'config.toml'), [
    '[marketplaces."mas-scholar-skills-local"]',
    `source = ${JSON.stringify(path.join(providerRoot, 'native-carrier-marketplace'))}`,
    '',
    '[marketplaces."med-autoscience-local"]',
    `source = ${JSON.stringify(consumerRoot)}`,
    '',
  ].join('\n'));
  try {
    runCli([
      'workspace', 'bind', '--project', 'medautoscience', '--path', workspace,
    ], env);
    await runCliAsync(['packages', 'install', 'mas-scholar-skills'], env);
    await runCliAsync(['packages', 'install', 'mas'], env);
    fs.appendFileSync(
      path.join(env.CODEX_HOME, 'config.toml'),
      '\n[plugins."mas-scholar-skills@mas-scholar-skills-local"]\nenabled = false\n',
    );
    const providerStatus = runCli([
      'packages', 'status', '--package-id', 'mas-scholar-skills',
    ], env).opl_agent_package_status;
    assert.equal(providerStatus.configured_carrier.enabled, false);
    assert.equal(providerStatus.installed_readiness.callability, 'disabled');
    assert.equal(providerStatus.installed_readiness.projection_callability, 'callable');
    const status = runCli([
      'packages', 'status', '--package-id', 'mas',
    ], env).opl_agent_package_status;
    assert.equal(status.installed_readiness.callability, 'callable');
    assert.equal(status.package_dependency_readiness.status, 'current');
    assert.equal(status.operational_ready, true);
    assert.equal(status.launch_allowed, true);

    const first = runCli(createArgs(workspace), env).family_runtime_stage_attempt.attempt;
    const duplicate = runCli(createArgs(workspace), env).family_runtime_stage_attempt.attempt;
    assert.equal(duplicate.stage_attempt_id, first.stage_attempt_id);
    assert.equal(Object.hasOwn(first.workspace_locator, 'package_use_binding'), false);
    assert.equal(first.workspace_locator.native_package_closure.root_package.package_id, 'mas');
    assert.match(
      first.workspace_locator.native_package_closure.root_package.content_digest,
      /^sha256:[a-f0-9]{64}$/,
    );
    const expectedProviderSkillIds = providerStatus.configured_carrier.executor.required_skill_ids.sort();
    assert.deepEqual(
      first.workspace_locator.native_package_closure.skill_projection.skill_ids,
      expectedProviderSkillIds,
    );
    assert.equal(fs.existsSync(path.join(env.OPL_STATE_DIR, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(env.OPL_STATE_DIR, 'agent-package-lifecycle.sqlite')), false);
    assert.equal(fs.existsSync(path.join(workspace, '.agents', 'skills')), true);

    const startFailure = runCliFailure([
      'family-runtime', 'attempt', 'start', first.stage_attempt_id,
    ], {
      ...env,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });
    assert.notEqual(
      startFailure.payload.error.details?.failure_code,
      'agent_package_operational_readiness_blocked',
    );
  } finally {
    removeFixtureTree(root);
  }
});
