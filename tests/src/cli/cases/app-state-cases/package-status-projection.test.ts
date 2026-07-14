import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../../helpers.ts';
import { FrameworkContractError } from '../../../../../src/kernel/contract-validation.ts';
import {
  buildAppAgentPackageStatuses,
  buildOplAppState,
} from '../../../../../src/modules/console/app-state.ts';
import { buildAgentCatalog } from '../../../../../src/modules/console/work-item-projection/catalog.ts';
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

test('app state isolates one invalid package status while direct status reads remain fail closed', () => {
  const readStatus = ((input: { packageId?: string | null }) => {
    if (input.packageId === 'obf') {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Selected package runtime source contains a retired descriptor field.',
        {
          package_id: 'obf',
          failure_code: 'standard_agent_interface_unknown_property',
        },
      );
    }
    return {
      opl_agent_package_status: {
        package_id: input.packageId,
        status: 'available',
        installed_packages: [{
          package_version: '1.0.0',
          source_kind: 'fixture',
          lock_ref: 'opl://agent-package-lock/mas/1.0.0/fixture',
          physical_surface: null,
          exposure_state: 'visible',
        }],
        package_dependency_readiness: { status: 'current', operational_ready: true },
        materialization_readiness: { status: 'not_required' },
        runtime_source_readiness: { status: 'current', operational_ready: true },
        operational_ready: true,
        operational_ready_scope: 'package_dependency_scope_and_runtime_source',
        launch_allowed: true,
        launch_blocked_reason: null,
        allowed_when_blocked: ['status', 'doctor', 'repair'],
        repair_action: null,
      },
    };
  }) as any;

  assert.throws(() => readStatus({ packageId: 'obf' }), /retired descriptor field/);

  const statuses = buildAppAgentPackageStatuses({
    packageIds: ['mas', 'obf'],
    activeWorkspaceBindings: [],
    workspaceRootPath: null,
    profile: 'fast',
    readStatus,
  });
  const availability = buildAgentCatalog({
    profile: 'fast',
    packageStatusById: statuses,
  }).availability;

  assert.equal(statuses.mas.status, 'available');
  assert.equal(statuses.obf.status, 'unavailable');
  assert.equal(statuses.obf.launch_allowed, false);
  assert.equal((statuses.obf.status_read_error as Record<string, unknown>).code, 'contract_shape_invalid');
  assert.equal(availability.find((entry) => entry.agent_id === 'mas')?.availability, 'available');
  assert.equal(availability.find((entry) => entry.agent_id === 'obf')?.availability, 'unavailable');
  assert.equal(availability.find((entry) => entry.agent_id === 'obf')?.reason, 'package_status_read_failed');
});

test('app package status uses a package binding before falling back to the selected workspace root', () => {
  const selectedWorkspaceRoot = '/tmp/opl-selected-workspace';
  const packageWorkspace = '/tmp/opl-mas-workspace';
  const requests: Array<{ packageId: string; scope?: string; targetWorkspace?: string }> = [];
  const readStatus = ((input: { packageId: string; scope?: string; targetWorkspace?: string }) => {
    requests.push(input);
    const materialized = input.scope === 'workspace'
      && (input.targetWorkspace === packageWorkspace || input.targetWorkspace === selectedWorkspaceRoot);
    return {
      opl_agent_package_status: {
        package_id: input.packageId,
        status: materialized ? 'available' : 'attention_needed',
        recommended_action: materialized ? null : 'agent_package_activate',
        installed_packages: [{
          package_version: '1.0.0',
          source_kind: 'fixture',
          lock_ref: `opl://agent-package-lock/${input.packageId}/1.0.0/fixture`,
          physical_surface: null,
          exposure_state: 'visible',
        }],
        package_dependency_readiness: { status: 'current', operational_ready: true },
        operational_ready: materialized,
        operational_ready_scope: 'package_dependency_scope_and_runtime_source',
        launch_allowed: materialized,
        launch_blocked_reason: materialized ? null : 'scope_materialization_scope_required',
        materialization_readiness: { status: materialized ? 'current' : 'scope_required' },
        runtime_source_readiness: { status: 'current', operational_ready: true },
        allowed_when_blocked: ['status', 'doctor', 'repair'],
        repair_action: null,
      },
    };
  }) as any;

  const statuses = buildAppAgentPackageStatuses({
    packageIds: ['mas', 'opl-flow'],
    activeWorkspaceBindings: [{ project_id: 'mas', workspace_path: packageWorkspace }],
    workspaceRootPath: selectedWorkspaceRoot,
    profile: 'fast',
    readStatus,
  });

  assert.equal(requests.find((entry) => entry.packageId === 'mas')?.targetWorkspace, packageWorkspace);
  assert.equal(requests.find((entry) => entry.packageId === 'opl-flow')?.targetWorkspace, selectedWorkspaceRoot);
  assert.equal(statuses['opl-flow'].status, 'available');
  assert.equal(statuses['opl-flow'].operational_ready, true);
  assert.equal(
    (statuses['opl-flow'].materialization_readiness as Record<string, unknown>).status,
    'current',
  );
});

test('app state reuses one status read across directory and status index for the workspace-root fallback', async () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-package-status-cache-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspaceRoot = path.join(homeRoot, 'workspace');
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
exit 1
`);
  const env = {
    HOME: homeRoot,
    CODEX_HOME: path.join(homeRoot, '.codex'),
    OPL_STATE_DIR: stateDir,
    OPL_MODULES_ROOT: path.join(stateDir, 'modules'),
    OPL_WORKSPACE_ROOT: workspaceRoot,
    OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
    OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
    OPL_FAMILY_RUNTIME_PROVIDER: '',
    OPL_TEMPORAL_ADDRESS: '',
    TEMPORAL_ADDRESS: '',
    PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
  };
  const previousEnv = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
  const calls = new Map<string, number>();
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'agent-package-locks.json'), `${JSON.stringify({
      surface_kind: 'opl_agent_package_lock_index',
      version: 'opl-agent-package-lock-index.v1',
      packages: [{
        surface_kind: 'opl_agent_package_lock',
        package_id: 'third.party.research',
        agent_id: 'third.party.research',
        package_role: 'standard_agent',
        display_name: 'Third Party Research',
        publisher: 'example-org',
        package_version: '1.0.0',
        trust_tier: 'third_party_verified',
        source_kind: 'manifest_url',
        manifest_url: 'https://example.test/research.json',
        lock_ref: 'opl://agent-package-lock/third.party.research/1.0.0/fixture',
        capability_provider: null,
        scope_materializations: [],
      }],
      last_known_good_transactions: [],
    }, null, 2)}\n`);
    for (const [key, value] of Object.entries(env)) process.env[key] = value;

    const appState = await buildOplAppState({
      profile: 'fast',
      readAgentPackageStatus: ((input: { packageId?: string; scope?: string; targetWorkspace?: string } = {}) => {
        const packageId = input.packageId ?? 'unknown';
        calls.set(packageId, (calls.get(packageId) ?? 0) + 1);
        const installed = packageId === 'third.party.research';
        const materialized = installed
          && input.scope === 'workspace'
          && input.targetWorkspace === workspaceRoot;
        return {
          opl_agent_package_status: {
            package_id: packageId,
            status: installed ? materialized ? 'available' : 'attention_needed' : 'not_installed',
            recommended_action: installed && !materialized ? 'agent_package_activate' : null,
            installed_packages: installed ? [{
              package_version: '1.0.0',
              source_kind: 'manifest_url',
              lock_ref: 'opl://agent-package-lock/third.party.research/1.0.0/fixture',
              physical_surface: null,
              exposure_state: 'visible',
            }] : [],
            package_dependency_readiness: { status: installed ? 'current' : 'not_installed', operational_ready: installed },
            materialization_readiness: { status: installed ? materialized ? 'current' : 'scope_required' : 'not_required' },
            runtime_source_readiness: { status: installed ? 'current' : 'not_installed', operational_ready: installed },
            operational_ready: materialized,
            operational_ready_scope: 'package_dependency_scope_and_runtime_source',
            launch_allowed: materialized,
            launch_blocked_reason: installed ? materialized ? null : 'scope_materialization_scope_required' : 'package_not_installed',
            allowed_when_blocked: ['status', 'doctor', 'repair'],
            repair_action: null,
          },
        };
      }) as any,
    }) as any;

    const directoryEntry = appState.app_state.agent_packages.directory.entries.find(
      (entry: any) => entry.package_id === 'third.party.research',
    );
    assert.equal(directoryEntry.activated, true);
    assert.equal(directoryEntry.readiness.status, 'ready');
    assert.equal(calls.get('third.party.research'), 1);
  } finally {
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
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
