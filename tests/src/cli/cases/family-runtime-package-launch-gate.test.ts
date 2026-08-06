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
  writeCapabilityCatalog,
  writeCapabilityProvider,
  writeMasConsumer,
} from './packages-cases/capability-fixtures.ts';
import { createFakeCodexPluginManagerFixture } from '../helpers-parts/fixtures.ts';
import {
  packageLaunchHardStopReason,
  packageRuntimeSourceCheckoutPath,
} from '../../../../src/modules/runway/family-runtime-package-readiness.ts';

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

test('package launch ignores retired materialization readiness while enforcing native readiness', () => {
  assert.equal(packageLaunchHardStopReason({ installed_package_count: 0 }), 'package_not_installed');
  assert.equal(packageLaunchHardStopReason({
    installed_package_count: 1,
    package_dependency_readiness: {
      dependencies: [{ required: true, reasons: ['version_requirement_unsatisfied'] }],
    },
    runtime_source_readiness: { status: 'current', operational_ready: true },
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
      runtime_source_readiness: { status: 'current', operational_ready: true },
    }), reason);
  }
  assert.equal(packageLaunchHardStopReason({
    installed_package_count: 1,
    materialization_readiness: {
      status: 'missing',
      core_readiness: { status: 'missing' },
    },
    runtime_source_readiness: { status: 'current', operational_ready: true },
  }), null);
  assert.equal(packageLaunchHardStopReason({
    installed_package_count: 1,
    runtime_source_readiness: {
      status: 'missing',
      operational_ready: false,
      reason: 'managed_runtime_source_missing',
    },
  }), 'managed_runtime_source_missing');
});

test('native carrier source is authoritative over compatibility runtime source', () => {
  assert.equal(packageRuntimeSourceCheckoutPath({
    installed_carrier_readback: {
      lifecycle_authority: 'carrier_owned',
      source_ref: '/tmp/native-carrier',
    },
    installed_readiness: {
      installed: true,
      physical_status: 'available',
      callability: 'callable',
    },
    configured_carrier: {
      status: 'installed',
      executor: { status: 'callable' },
      plugin_source_path: '/tmp/native-carrier',
    },
    runtime_source_readiness: {
      status: 'current',
      operational_ready: true,
      checkout_path: '/tmp/legacy-source',
    },
  }), '/tmp/native-carrier');
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

test('compatibility runtime source is used only without a native carrier', () => {
  assert.equal(packageRuntimeSourceCheckoutPath({
    runtime_source_readiness: {
      status: 'current',
      operational_ready: true,
      checkout_path: '/tmp/managed-source',
    },
  }), '/tmp/managed-source');
  assert.equal(packageRuntimeSourceCheckoutPath({
    runtime_source_readiness: {
      status: 'incompatible',
      operational_ready: false,
      checkout_path: '/tmp/stale-source',
    },
  }), null);
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
    assert.deepEqual(failure.payload.error.details.allowed_when_blocked, ['status', 'doctor', 'repair']);
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
    assert.equal(status.configured_carrier.status, 'physical_unavailable');
    assert.equal(status.operational_ready, false);
    assert.equal(status.launch_allowed, false);
    assert.equal(status.launch_blocked_reason, 'native_carrier_reports_not_installed');

    const failure = runCliFailure(createArgs(workspace), env);
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_operational_readiness_blocked');
    assert.equal(failure.payload.error.details.launch_blocked_reason, 'package_not_installed');
  } finally {
    removeFixtureTree(root);
  }
});

test('native package launch remains carrier-owned and creates no private lifecycle state', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-native-package-launch-'));
  const workspace = path.join(root, 'workspace');
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0', {
    configuredCarrier: true,
  });
  const consumerManifest = writeMasConsumer(
    path.join(root, 'consumer'),
    providerManifest,
    '0.1.0a4',
    { configuredCarrier: true },
  );
  const releaseSet = writeCapabilityCatalog(
    path.join(root, 'release-set'),
    [consumerManifest, providerManifest],
  );
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_CODEX_PLUGIN_BIN: createFakeCodexPluginManagerFixture(
      path.join(root, 'fake-codex-plugin-manager'),
    ).codexPath,
    ...releaseSet.env,
  };
  fs.mkdirSync(workspace, { recursive: true });
  try {
    runCli([
      'workspace', 'bind', '--project', 'medautoscience', '--path', workspace,
    ], env);
    await runCliAsync([
      'packages', 'install', 'mas',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env);
    const status = runCli([
      'packages', 'status', '--package-id', 'mas',
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env).opl_agent_package_status;
    assert.equal(status.installed_readiness.callability, 'callable');
    assert.equal(status.operational_ready, true);
    assert.equal(status.launch_allowed, true);

    const first = runCli(createArgs(workspace), env).family_runtime_stage_attempt.attempt;
    const duplicate = runCli(createArgs(workspace), env).family_runtime_stage_attempt.attempt;
    assert.equal(duplicate.stage_attempt_id, first.stage_attempt_id);
    assert.equal(Object.hasOwn(first.workspace_locator, 'package_use_binding'), false);
    assert.equal(fs.existsSync(path.join(env.OPL_STATE_DIR, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(env.OPL_STATE_DIR, 'agent-package-lifecycle.sqlite')), false);
    assert.equal(fs.existsSync(path.join(workspace, '.codex', 'skills')), false);

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
