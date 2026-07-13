import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../../helpers.ts';
import { managedRuntimeSourceLockReadiness } from '../../../../../src/modules/connect/agent-package-registry-parts/managed-runtime-source-carrier.ts';
import type { AgentPackageManagedRuntimeSourceState } from '../../../../../src/modules/connect/agent-package-registry-parts/types.ts';

const CANONICAL_PACKAGE_IDS = [
  'mas',
  'mag',
  'rca',
  'oma',
  'obf',
  'mas-scholar-skills',
  'opl-flow',
] as const;

function assertCanonicalPackagesFailClosed(profile: 'fast' | 'full') {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-app-state-${profile}-packages-home-`));
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const output = runCli(['app', 'state', '--profile', profile], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as any;
    const statusIndex = output.app_state.agent_packages.status_index;

    assert.equal(statusIndex.installed_package_count, 0);
    assert.deepEqual(Object.keys(statusIndex.packages), [...CANONICAL_PACKAGE_IDS]);
    for (const packageId of CANONICAL_PACKAGE_IDS) {
      const status = statusIndex.packages[packageId];
      assert.equal(status.package_id, packageId);
      assert.equal(status.status, 'not_installed');
      assert.equal(status.operational_ready, false);
      assert.equal(status.launch_allowed, false);
      assert.equal(status.launch_blocked_reason, 'package_not_installed');
      assert.deepEqual(status.allowed_when_blocked, ['status', 'doctor', 'repair']);
      if (profile === 'fast') {
        assert.equal(status.runtime_source_readiness.live_verification_deferred, true);
        assert.equal(
          status.runtime_source_readiness.verification_mode,
          'persisted_lock_and_path_fast_projection',
        );
      }
    }
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
}

test('app state fast projects every uninstalled canonical package as fail closed', () => {
  assertCanonicalPackagesFailClosed('fast');
});

test('app state full projects every uninstalled canonical package as fail closed', () => {
  assertCanonicalPackagesFailClosed('full');
});

test('fast managed runtime readiness rejects a checkout path that is not a directory', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-fast-runtime-source-path-'));
  const checkoutPath = path.join(fixtureRoot, 'managed-runtime');
  const state: AgentPackageManagedRuntimeSourceState = {
    surface_kind: 'opl_agent_package_managed_runtime_source',
    status: 'current',
    carrier_kind: 'opl_managed_module_source',
    module_id: 'medautoscience',
    checkout_path: checkoutPath,
    ownership: 'package_created',
    source_mode: 'package_channel',
    channel_version: '0.1.0',
    artifact_ref: 'sha256:fixture',
    layer_digest: 'sha256:fixture',
    source_archive_sha256: 'fixture',
    source_git_head_sha: 'fixture',
    tree_sha256: 'fixture',
    rollback_ref: null,
    preparation_status: 'completed',
    bootstrap_command: null,
    package_prepare_command: null,
    health_check_command: [],
    handler_probe_command: [],
    health_output_sha256: null,
    handler_probe_output_sha256: null,
    preparation_root: null,
    preparation_scope: 'managed_source_root',
  };

  try {
    fs.writeFileSync(checkoutPath, 'not a checkout directory\n', 'utf8');
    assert.deepEqual(managedRuntimeSourceLockReadiness(state), {
      status: 'missing',
      operational_ready: false,
      module_id: 'medautoscience',
      checkout_path: checkoutPath,
      expected_tree_sha256: 'fixture',
      actual_tree_sha256: null,
      reason: 'managed_runtime_source_missing',
    });

    fs.rmSync(checkoutPath);
    fs.mkdirSync(checkoutPath);
    assert.equal(managedRuntimeSourceLockReadiness(state).operational_ready, true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
