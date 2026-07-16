import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../../helpers.ts';
import { FrameworkContractError } from '../../../../../src/kernel/contract-validation.ts';
import {
  buildAppAgentPackageStatuses,
  buildOplAppState,
} from '../../../../../src/modules/console/app-state.ts';
import { buildAgentCatalog } from '../../../../../src/modules/console/work-item-projection/catalog.ts';
import { managedRuntimeSourceLockReadiness } from '../../../../../src/modules/connect/agent-package-registry-parts/managed-runtime-source-carrier.ts';
import type {
  AgentPackageLockIndex,
  AgentPackageManagedRuntimeSourceState,
} from '../../../../../src/modules/connect/agent-package-registry-parts/types.ts';

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
      assert.equal(status.action_receipt_ref, null);
      assert.equal(status.rollback_ref, null);
      assert.deepEqual(status.allowed_when_blocked, ['status', 'doctor', 'repair']);
      assert.deepEqual(status.dependency_readiness, {
        status: 'blocked',
        required_count: 0,
        ready_count: 0,
        checks: [],
        closure: null,
      });
      assert.deepEqual(status.repair_action, {
        action_id: 'agent_package_repair',
        command_ref: 'opl app action execute --action agent_package_repair --payload <json> --json',
        enabled: false,
        reason_code: 'package_not_installed',
      });
      assert.equal(Object.hasOwn(status, 'activation_action'), false);
      assert.deepEqual(status.dependent_guard, {
        required_by_package_ids: [],
        disable: { allowed: true, reason_code: null },
        uninstall: { allowed: true, reason_code: null },
      });
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
  const lockIndex = {
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages: [{
      package_id: 'obf',
      package_version: '0.3.2',
      lock_ref: 'opl://agent-package-lock/obf/0.3.2/fixture',
      exposure_state: 'hidden',
      capability_dependencies: [],
      dependency_transaction_id: 'tx-obf-current',
      dependency_closure_digest: 'sha256:obf-current',
      action_receipt_id: 'opl://agent-package-receipt/obf/update/fixture',
      rollback_ref: 'opl://agent-package-rollback/obf/0.3.1/fixture',
    }],
    last_known_good_transactions: [],
  } as unknown as AgentPackageLockIndex;
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
    lockIndex,
  });
  const availability = buildAgentCatalog({
    profile: 'fast',
    packageStatusById: statuses,
  }).availability;

  assert.equal(statuses.mas.status, 'verification_deferred');
  assert.equal(statuses.mas.operational_ready, false);
  assert.equal(statuses.mas.launch_allowed, false);
  assert.equal(statuses.mas.launch_blocked_reason, 'live_verification_deferred');
  assert.equal(statuses.obf.status, 'unavailable');
  assert.equal(statuses.obf.launch_allowed, false);
  assert.equal((statuses.obf.dependency_readiness as Record<string, unknown>).status, 'blocked');
  assert.equal((statuses.obf.repair_action as Record<string, unknown>).action_id, 'agent_package_repair');
  assert.equal((statuses.obf.repair_action as Record<string, unknown>).reason_code, 'status_unavailable');
  assert.equal(Object.hasOwn(statuses.obf, 'activation_action'), false);
  assert.equal((statuses.obf.capability_exposure as Record<string, unknown>).status, 'hidden');
  assert.equal(statuses.obf.action_receipt_ref, 'opl://agent-package-receipt/obf/update/fixture');
  assert.equal(statuses.obf.rollback_ref, 'opl://agent-package-rollback/obf/0.3.1/fixture');
  assert.equal(
    ((statuses.obf.dependent_guard as Record<string, any>).disable as Record<string, unknown>).allowed,
    false,
  );
  assert.equal((statuses.obf.status_read_error as Record<string, unknown>).code, 'contract_shape_invalid');
  assert.equal(availability.find((entry) => entry.agent_id === 'mas')?.availability, 'available');
  assert.equal(availability.find((entry) => entry.agent_id === 'obf')?.availability, 'unavailable');
  assert.equal(availability.find((entry) => entry.agent_id === 'obf')?.reason, 'package_status_read_failed');
});

test('app package status uses only the selected workspace and keeps fast readiness fail closed', () => {
  const selectedWorkspaceRoot = '/tmp/opl-selected-workspace';
  const packageWorkspace = '/tmp/opl-mas-workspace';
  const requests: Array<{ packageId: string; scope?: string; targetWorkspace?: string; detail?: string }> = [];
  const readStatus = ((input: { packageId: string; scope?: string; targetWorkspace?: string; detail?: string }) => {
    requests.push(input);
    const materialized = input.scope === 'workspace'
      && input.targetWorkspace === selectedWorkspaceRoot;
    return {
      opl_agent_package_status: {
        package_id: input.packageId,
        status: materialized ? 'available' : 'attention_needed',
        recommended_action: null,
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

  const fastStatuses = buildAppAgentPackageStatuses({
    packageIds: ['mas', 'opl-flow'],
    activeWorkspaceBindings: [{ project_id: 'mas', workspace_path: packageWorkspace }],
    workspaceRootPath: selectedWorkspaceRoot,
    profile: 'fast',
    readStatus,
  });
  const fullStatuses = buildAppAgentPackageStatuses({
    packageIds: ['opl-flow'],
    activeWorkspaceBindings: [{ project_id: 'mas', workspace_path: packageWorkspace }],
    workspaceRootPath: selectedWorkspaceRoot,
    profile: 'full',
    readStatus,
  });
  const noSelectedWorkspace = buildAppAgentPackageStatuses({
    packageIds: ['mas'],
    activeWorkspaceBindings: [{ project_id: 'mas', workspace_path: packageWorkspace }],
    workspaceRootPath: null,
    profile: 'fast',
    readStatus,
  });

  const fastMasRequest = requests.find((entry) => entry.packageId === 'mas' && entry.detail === 'fast'
    && entry.targetWorkspace === selectedWorkspaceRoot);
  const noWorkspaceRequest = requests.find((entry) => entry.packageId === 'mas' && entry.detail === 'fast'
    && entry.targetWorkspace === undefined);
  assert.equal(fastMasRequest?.targetWorkspace, selectedWorkspaceRoot);
  assert.equal(noWorkspaceRequest?.scope, undefined);
  assert.equal(noWorkspaceRequest?.targetWorkspace, undefined);
  assert.equal(fastStatuses['opl-flow'].status, 'verification_deferred');
  assert.equal(fastStatuses['opl-flow'].operational_ready, false);
  assert.equal(fastStatuses['opl-flow'].launch_allowed, false);
  assert.equal(fastStatuses['opl-flow'].launch_blocked_reason, 'live_verification_deferred');
  assert.equal(fullStatuses['opl-flow'].status, 'available');
  assert.equal(fullStatuses['opl-flow'].operational_ready, true);
  assert.equal(fullStatuses['opl-flow'].launch_allowed, true);
  assert.equal(noSelectedWorkspace.mas.status, 'verification_deferred');
  assert.equal(noSelectedWorkspace.mas.launch_blocked_reason, 'live_verification_deferred');
  assert.equal(Object.hasOwn(noSelectedWorkspace.mas, 'activation_action'), false);
  assert.equal(
    (fastStatuses['opl-flow'].materialization_readiness as Record<string, unknown>).status,
    'current',
  );
  assert.equal(Object.hasOwn(fastStatuses['opl-flow'], 'activation_action'), false);
  assert.equal(Object.hasOwn(fullStatuses['opl-flow'], 'activation_action'), false);
});

test('app package status normalizes dependency closure and dependent guards for fast and full', () => {
  const dependency = {
    package_id: 'mas-scholar-skills',
    required: true,
    version_requirement: '>=0.1.0',
    capability_abi: 'mas-scholar-skills.v1',
    required_export_ids: ['medical-research'],
    required_module_ids: [],
  };
  const missingDependency = {
    package_id: 'missing-provider',
    required: true,
    version_requirement: '>=1.0.0',
    capability_abi: 'missing-provider.v1',
    required_export_ids: ['missing-export'],
    required_module_ids: [],
  };
  const lockIndex = {
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages: [
      {
        package_id: 'mas',
        package_version: '0.2.4',
        lock_ref: 'opl://agent-package-lock/mas/0.2.4/current',
        exposure_state: 'hidden',
        capability_dependencies: [dependency, missingDependency],
        resolved_dependencies: [],
        dependency_transaction_id: 'tx-mas-current',
        dependency_closure_digest: 'sha256:mas-current',
      },
      {
        package_id: 'oma',
        package_version: '0.3.0',
        lock_ref: 'opl://agent-package-lock/oma/0.3.0/current',
        exposure_state: 'visible',
        capability_dependencies: [dependency],
        resolved_dependencies: [],
        dependency_transaction_id: 'tx-oma-current',
        dependency_closure_digest: 'sha256:oma-current',
      },
      {
        package_id: 'mas-scholar-skills',
        package_version: '0.1.1',
        lock_ref: 'opl://agent-package-lock/mas-scholar-skills/0.1.1/current',
        exposure_state: 'disabled',
        capability_provider: {
          capability_abi: 'mas-scholar-skills.v1',
          exports: [{ export_id: 'medical-research', skill_id: 'medical-research', install_mode: 'core_required' }],
          module_export_ids: [],
        },
        content_digest: 'sha256:mas-scholar-skills',
        capability_dependencies: [],
        resolved_dependencies: [],
        dependency_transaction_id: 'tx-scholar-current',
        dependency_closure_digest: 'sha256:scholar-current',
      },
    ],
    last_known_good_transactions: [{
      root_package_id: 'mas',
      transaction_id: 'tx-mas-lkg',
      closure_digest: 'sha256:mas-lkg',
      package_locks: [],
    }],
  } as unknown as AgentPackageLockIndex;
  const readStatus = ((input: { packageId?: string | null }) => {
    const packageId = input.packageId ?? null;
    const isMas = packageId === 'mas';
    const isOma = packageId === 'oma';
    const dependencyDisabled = isMas;
    const dependencyMissing = isOma;
    const dependencyReady = !dependencyDisabled && !dependencyMissing;
    return {
      opl_agent_package_status: {
        package_id: packageId,
        status: dependencyReady ? 'available' : 'attention_needed',
        installed_packages: lockIndex.packages.filter((entry) => entry.package_id === packageId),
        package_dependency_readiness: {
          status: dependencyDisabled ? 'incompatible' : dependencyMissing ? 'missing' : 'current',
          operational_ready: dependencyReady,
          repair_command: `opl packages repair --package-id ${packageId}`,
          dependencies: isMas ? [{
            ...dependency,
            installed_version: '0.1.1',
            manifest_sha256: 'sha256:manifest',
            content_digest: 'sha256:mas-scholar-skills',
            status: 'incompatible',
            reasons: ['dependency_disabled'],
            missing_required_export_ids: [],
            missing_required_module_ids: [],
          }] : isOma ? [{
            ...missingDependency,
            installed_version: null,
            manifest_sha256: null,
            content_digest: null,
            status: 'missing',
            reasons: ['dependency_lock_missing'],
            missing_required_export_ids: ['missing-export'],
            missing_required_module_ids: [],
          }] : [],
        },
        materialization_readiness: { status: 'current' },
        runtime_source_readiness: { status: 'current', operational_ready: true },
        operational_ready: dependencyReady,
        operational_ready_scope: 'package_dependency_scope_runtime_source_and_managed_policy',
        launch_allowed: dependencyReady,
        launch_blocked_reason: dependencyDisabled
          ? 'package_dependency_incompatible'
          : dependencyMissing
            ? 'package_dependency_missing'
            : null,
        allowed_when_blocked: ['status', 'doctor', 'repair'],
        repair_action: dependencyReady ? null : `opl packages repair --package-id ${packageId}`,
      },
    };
  }) as any;

  const fast = buildAppAgentPackageStatuses({
    packageIds: ['mas', 'oma', 'mas-scholar-skills'],
    workspaceRootPath: '/tmp/opl-workspace',
    profile: 'fast',
    readStatus,
    lockIndex,
  });
  const full = buildAppAgentPackageStatuses({
    packageIds: ['mas', 'oma', 'mas-scholar-skills'],
    workspaceRootPath: '/tmp/opl-workspace',
    profile: 'full',
    readStatus,
    lockIndex,
  });
  const fastMas = fast.mas as any;
  const fullMas = full.mas as any;
  const fastOma = fast.oma as any;
  const fullOma = full.oma as any;
  const fastProvider = fast['mas-scholar-skills'] as any;

  assert.deepEqual(fastMas.dependency_readiness, fullMas.dependency_readiness);
  assert.deepEqual(fastMas.dependency_readiness, {
    status: 'repair_required',
    required_count: 1,
    ready_count: 0,
    checks: [{
      package_id: 'mas-scholar-skills',
      required: true,
      installed: true,
      enabled: false,
      version_requirement: '>=0.1.0',
      installed_version: '0.1.1',
      version_satisfied: true,
      capability_abi: 'mas-scholar-skills.v1',
      installed_capability_abi: 'mas-scholar-skills.v1',
      abi_satisfied: true,
      required_export_ids: ['medical-research'],
      available_export_ids: ['medical-research'],
      exports_satisfied: true,
      required_module_ids: [],
      available_module_ids: [],
      modules_satisfied: true,
      content_lock_digest: 'sha256:mas-scholar-skills',
      physical_surface_status: null,
      ready: false,
      hard_failure_reasons: ['dependency_disabled'],
      currentness_observations: [],
      failure_reasons: ['dependency_disabled'],
    }],
    closure: {
      transaction_id: 'tx-mas-current',
      closure_digest: 'sha256:mas-current',
      last_known_good_transaction_id: 'tx-mas-lkg',
      last_known_good_closure_digest: 'sha256:mas-lkg',
    },
  });
  assert.equal('generation_id' in fastMas.dependency_readiness.closure, false);
  assert.deepEqual(fastMas.repair_action, {
    action_id: 'agent_package_repair',
    command_ref: 'opl app action execute --action agent_package_repair --payload <json> --json',
    enabled: true,
    reason_code: 'dependency_closure_repair_required',
  });
  assert.equal(Object.hasOwn(fastMas, 'activation_action'), false);
  assert.equal(Object.hasOwn(fullMas, 'activation_action'), false);
  assert.equal(fastMas.capability_exposure.status, 'hidden');
  assert.equal(fastOma.dependency_readiness.status, 'repair_required');
  assert.deepEqual(fastOma.dependency_readiness, fullOma.dependency_readiness);
  assert.equal(fastOma.dependency_readiness.checks[0].failure_reasons[0], 'dependency_lock_missing');
  assert.equal(fastOma.repair_action.enabled, true);
  assert.equal(fastProvider.dependency_readiness.status, 'ready');
  assert.deepEqual(fastProvider.dependent_guard, {
    required_by_package_ids: ['mas', 'oma'],
    disable: { allowed: false, reason_code: 'agent_package_required_by_installed_dependents' },
    uninstall: { allowed: false, reason_code: 'agent_package_required_by_installed_dependents' },
  });
  assert.equal(fastProvider.capability_exposure.status, 'disabled');
  assert.equal(fastProvider.status, 'attention_needed');
  assert.equal(fastProvider.launch_allowed, false);
  assert.equal(fastProvider.launch_blocked_reason, 'package_disabled');
  assert.equal(Object.hasOwn(fastProvider, 'activation_action'), false);
});

test('app package status keeps dependency currentness drift observable without requesting repair or activation', () => {
  const dependency = {
    package_id: 'mas-scholar-skills',
    required: true,
    version_requirement: '^0.2.0',
    capability_abi: 'mas-scholar-skills.v1',
    required_export_ids: ['medical-research'],
    required_module_ids: ['medical-specialists'],
  };
  const lockIndex = {
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages: [{
      package_id: 'mas',
      package_version: '0.2.10',
      lock_ref: 'opl://agent-package-lock/mas/0.2.10/current',
      exposure_state: 'visible',
      capability_dependencies: [dependency],
    }, {
      package_id: 'mas-scholar-skills',
      package_version: '0.3.0',
      lock_ref: 'opl://agent-package-lock/mas-scholar-skills/0.3.0/latest',
      exposure_state: 'visible',
      content_digest: 'sha256:latest-skill-content',
      capability_provider: {
        capability_abi: 'mas-scholar-skills.v1',
        exports: [{
          export_id: 'medical-research',
          skill_id: 'medical-research',
          install_mode: 'core_required',
        }],
        module_export_ids: ['medical-specialists'],
      },
    }],
    last_known_good_transactions: [],
  } as unknown as AgentPackageLockIndex;
  const reasons = [
    'version_requirement_unsatisfied',
    'dependency_closure_digest_mismatch',
    'carrier_authority_source_commit_mismatch',
  ];
  const readStatus = (() => ({
      opl_agent_package_status: {
        package_id: 'mas',
        status: 'attention_needed',
        installed_packages: [lockIndex.packages[0]],
        package_dependency_readiness: {
          status: 'incompatible',
          operational_ready: true,
          repair_command: 'opl packages repair --package-id mas',
          dependencies: [{
            ...dependency,
            installed_version: '0.3.0',
            manifest_sha256: 'sha256:latest-manifest',
            content_digest: 'sha256:latest-skill-content',
            status: 'incompatible',
            reasons,
            missing_required_export_ids: [],
            missing_required_module_ids: [],
          }],
        },
        materialization_readiness: {
          status: 'incompatible',
          required_skill_ids: ['med-autoscience'],
          materialized_skill_ids: ['med-autoscience'],
          expected_digest: 'sha256:old-scope-content',
          actual_digest: 'sha256:latest-scope-content',
          lifecycle_receipt_ref: 'opl://agent-package-receipt/mas/old-scope',
          core_readiness: {
            status: 'incompatible',
            required_skill_ids: ['med-autoscience'],
            materialized_skill_ids: ['med-autoscience'],
          },
        },
        runtime_source_readiness: { status: 'current', operational_ready: true },
        operational_ready: false,
        launch_allowed: false,
        launch_blocked_reason: 'codex_reload_required',
        allowed_when_blocked: ['status', 'doctor', 'repair'],
        repair_action: 'opl packages repair --package-id mas',
      },
    })) as any;
  const fullStatuses = buildAppAgentPackageStatuses({
    packageIds: ['mas'],
    workspaceRootPath: '/tmp/opl-workspace',
    profile: 'full',
    lockIndex,
    readStatus,
  });
  const fastStatuses = buildAppAgentPackageStatuses({
    packageIds: ['mas'],
    workspaceRootPath: '/tmp/opl-workspace',
    profile: 'fast',
    lockIndex,
    readStatus,
  });

  const projected = fullStatuses.mas as any;
  assert.equal(projected.dependency_readiness.status, 'ready');
  assert.equal(projected.dependency_readiness.ready_count, 1);
  assert.equal(projected.dependency_readiness.checks[0].ready, true);
  assert.deepEqual(projected.dependency_readiness.checks[0].hard_failure_reasons, []);
  assert.deepEqual(projected.dependency_readiness.checks[0].currentness_observations, reasons);
  assert.equal(projected.repair_action.enabled, false);
  assert.equal(projected.repair_action.reason_code, 'dependency_closure_ready');
  assert.equal(projected.repair_command, null);
  assert.equal(projected.status, 'available');
  assert.equal(projected.operational_ready, true);
  assert.equal(projected.launch_allowed, true);
  assert.equal(projected.launch_blocked_reason, null);
  assert.equal(Object.hasOwn(projected, 'activation_action'), false);

  const fastProjected = fastStatuses.mas as any;
  assert.equal(fastProjected.status, 'verification_deferred');
  assert.equal(fastProjected.operational_ready, false);
  assert.equal(fastProjected.launch_allowed, false);
  assert.equal(fastProjected.launch_blocked_reason, 'live_verification_deferred');
  assert.equal(fastProjected.repair_action.enabled, false);
  assert.equal(Object.hasOwn(fastProjected, 'activation_action'), false);
});

test('app state reuses status reads and publishes the same canonical package ABI in fast and full', async () => {
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
    const packageLockIndexFixture = {
      surface_kind: 'opl_agent_package_lock_index',
      version: 'opl-agent-package-lock-index.v1',
      packages: [
        {
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
          exposure_state: 'visible',
          physical_surface: {
            status: 'materialized',
            note: null,
            profile_migration: {
              status: 'not_requested',
              note: 'Package does not request a profile surface.',
            },
            managed_policy_config: null,
          },
          capability_provider: {
            capability_abi: 'third-party-research.v1',
            exports: [{
              export_id: 'research-search',
              skill_id: 'third-party-research',
              install_mode: 'core_required',
            }],
            module_export_ids: [],
          },
          capability_dependencies: [],
          resolved_dependencies: [],
          dependency_transaction_id: 'tx-research-current',
          dependency_closure_digest: 'sha256:research-current',
          action_receipt_id: 'opl://agent-package-receipt/third.party.research/install/fixture',
          rollback_ref: 'opl://agent-package-rollback/third.party.research/1.0.0/fixture',
          content_digest: 'sha256:research-content',
          scope_materializations: [],
        },
        {
          surface_kind: 'opl_agent_package_lock',
          package_id: 'mas',
          agent_id: 'mas',
          package_role: 'standard_agent',
          display_name: 'Med Auto Science',
          publisher: 'one-person-lab',
          package_version: '0.2.4',
          trust_tier: 'first_party',
          source_kind: 'first_party_managed_cohort',
          manifest_url: 'opl+oci://example.test/mas:0.2.4#/package-manifest.json',
          lock_ref: 'opl://agent-package-lock/mas/0.2.4/fixture',
          exposure_state: 'visible',
          capability_provider: null,
          capability_dependencies: [{
            package_id: 'third.party.research',
            required: true,
            version_requirement: '>=1.0.0',
            capability_abi: 'third-party-research.v1',
            required_export_ids: ['research-search'],
            required_module_ids: [],
          }],
          resolved_dependencies: [],
          dependency_transaction_id: 'tx-mas-current',
          dependency_closure_digest: 'sha256:mas-current',
          content_digest: 'sha256:mas-content',
          scope_materializations: [],
        },
      ],
      last_known_good_transactions: [{
        root_package_id: 'mas',
        transaction_id: 'tx-mas-lkg',
        closure_digest: 'sha256:mas-lkg',
        package_locks: [],
      }],
    };
    fs.writeFileSync(
      path.join(stateDir, 'agent-package-locks.json'),
      `${JSON.stringify(packageLockIndexFixture, null, 2)}\n`,
    );
    for (const [key, value] of Object.entries(env)) process.env[key] = value;

    const readAgentPackageStatus = ((input: { packageId?: string; scope?: string; targetWorkspace?: string } = {}) => {
        const packageId = input.packageId ?? 'unknown';
        calls.set(packageId, (calls.get(packageId) ?? 0) + 1);
        const lock = packageLockIndexFixture.packages.find((entry) => entry.package_id === packageId) ?? null;
        const installed = Boolean(lock);
        const materialized = installed
          && input.scope === 'workspace'
          && input.targetWorkspace === workspaceRoot;
        const dependencies = packageId === 'mas' ? [{
          package_id: 'third.party.research',
          required: true,
          version_requirement: '>=1.0.0',
          capability_abi: 'third-party-research.v1',
          required_export_ids: ['research-search'],
          required_module_ids: [],
          installed_version: '1.0.0',
          manifest_sha256: 'sha256:research-manifest',
          content_digest: 'sha256:research-content',
          status: 'current',
          reasons: [],
          missing_required_export_ids: [],
          missing_required_module_ids: [],
        }] : [];
        return {
          opl_agent_package_status: {
            package_id: packageId,
            status: installed ? materialized ? 'available' : 'attention_needed' : 'not_installed',
            recommended_action: null,
            installed_packages: installed ? [lock] : [],
            package_dependency_readiness: installed ? {
              status: 'current',
              operational_ready: true,
              repair_command: `opl packages repair --package-id ${packageId}`,
              dependencies,
            } : null,
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
      }) as any;
    const fastAppState = await buildOplAppState({
      profile: 'fast',
      readAgentPackageStatus,
    }) as any;
    const fullAppState = await buildOplAppState({
      profile: 'full',
      readAgentPackageStatus,
    }) as any;

    const settingsControlCenter = fullAppState.app_state.settings_control_center;
    const codexSurfaceRef = settingsControlCenter.capability_task_awareness_refs.connector_readiness_refs
      .find((entry: any) => entry.id === 'codex_surface');
    assert.deepEqual(codexSurfaceRef, {
      id: 'codex_surface',
      title: 'Codex-visible capability surface',
      status: 'automatic_at_use_boundary',
      ref: 'app_state.agent_packages.status_index',
      owner: 'one-person-lab',
      next_action: 'none',
    });
    assert.equal(
      settingsControlCenter.issue_catalog.some((entry: any) => entry.status_code === 'needs_reload'),
      false,
    );
    assert.equal(
      settingsControlCenter.issue_catalog.some((entry: any) => entry.status_code === 'dirty_checkout'),
      false,
    );
    assert.equal(settingsControlCenter.allowed_action_ids.includes('agent_package_activate'), false);
    assert.equal(settingsControlCenter.action_catalog.some(
      (entry: any) => entry.action_id === 'agent_package_activate',
    ), false);
    const launchAction = fullAppState.app_state.actions.find(
      (entry: any) => entry.action_id === 'agent_package_activate',
    );
    assert.equal(Boolean(launchAction), true);
    assert.deepEqual(launchAction.payload_fields, [
      'package_id',
      'scope',
      'target_workspace',
      'target_quest',
      'use_boundary_id',
    ]);
    assert.deepEqual(
      settingsControlCenter.action_catalog
        .filter((entry: any) => entry.follow_up_action_ids.includes('agent_package_activate')
          || entry.verify_action_id === 'agent_package_activate')
        .map((entry: any) => entry.action_id),
      [],
    );

    const directoryEntry = fastAppState.app_state.agent_packages.directory.entries.find(
      (entry: any) => entry.package_id === 'third.party.research',
    );
    assert.equal(directoryEntry.activated, true);
    assert.equal(directoryEntry.readiness.status, 'verification_deferred');
    assert.equal(directoryEntry.readiness.verification_deferred, true);
    assert.equal(directoryEntry.readiness.reason, 'live_verification_deferred');
    assert.equal(directoryEntry.readiness.operational_ready, false);
    assert.equal(directoryEntry.readiness.launch_allowed, false);
    assert.equal(directoryEntry.recommended_action, null);
    assert.deepEqual(
      directoryEntry.available_actions.find(
        (entry: any) => entry.action_id === 'agent_package_activate',
      )?.payload,
      {
        package_id: 'third.party.research',
        scope: 'workspace',
        target_workspace: workspaceRoot,
      },
    );
    const statusIndexEntry = fastAppState.app_state.agent_packages.status_index.packages['third.party.research'];
    const fullStatusIndexEntry = fullAppState.app_state.agent_packages.status_index.packages['third.party.research'];
    const fastMasStatus = fastAppState.app_state.agent_packages.status_index.packages.mas;
    const fullMasStatus = fullAppState.app_state.agent_packages.status_index.packages.mas;
    assert.equal(statusIndexEntry.status, 'verification_deferred');
    assert.equal(statusIndexEntry.operational_ready, false);
    assert.equal(statusIndexEntry.launch_allowed, false);
    assert.equal(statusIndexEntry.launch_blocked_reason, 'live_verification_deferred');
    for (const field of [
      'dependency_readiness',
      'repair_action',
      'dependent_guard',
      'capability_exposure',
    ]) {
      assert.equal(field in statusIndexEntry, true, `fast status index missing ${field}`);
      assert.equal(field in fullStatusIndexEntry, true, `full status index missing ${field}`);
    }
    assert.equal(Object.hasOwn(statusIndexEntry, 'activation_action'), false);
    assert.equal(Object.hasOwn(fullStatusIndexEntry, 'activation_action'), false);
    assert.deepEqual(statusIndexEntry.dependency_readiness, fullStatusIndexEntry.dependency_readiness);
    assert.deepEqual(statusIndexEntry.repair_action, fullStatusIndexEntry.repair_action);
    assert.deepEqual(statusIndexEntry.dependent_guard, fullStatusIndexEntry.dependent_guard);
    assert.deepEqual(statusIndexEntry.capability_exposure, fullStatusIndexEntry.capability_exposure);
    assert.equal(statusIndexEntry.repair_action.action_id, 'agent_package_repair');
    assert.equal(
      statusIndexEntry.action_receipt_ref,
      'opl://agent-package-receipt/third.party.research/install/fixture',
    );
    assert.equal(
      statusIndexEntry.rollback_ref,
      'opl://agent-package-rollback/third.party.research/1.0.0/fixture',
    );
    assert.equal(statusIndexEntry.action_receipt_ref, fullStatusIndexEntry.action_receipt_ref);
    assert.equal(statusIndexEntry.rollback_ref, fullStatusIndexEntry.rollback_ref);
    assert.equal('generation_id' in (statusIndexEntry.dependency_readiness.closure ?? {}), false);
    assert.deepEqual(fastMasStatus.dependency_readiness, fullMasStatus.dependency_readiness);
    assert.deepEqual(fastMasStatus.dependency_readiness, {
      status: 'ready',
      required_count: 1,
      ready_count: 1,
      checks: [{
        package_id: 'third.party.research',
        required: true,
        installed: true,
        enabled: true,
        version_requirement: '>=1.0.0',
        installed_version: '1.0.0',
        version_satisfied: true,
        capability_abi: 'third-party-research.v1',
        installed_capability_abi: 'third-party-research.v1',
        abi_satisfied: true,
        required_export_ids: ['research-search'],
        available_export_ids: ['research-search'],
        exports_satisfied: true,
        required_module_ids: [],
        available_module_ids: [],
        modules_satisfied: true,
        content_lock_digest: 'sha256:research-content',
        physical_surface_status: 'materialized',
        ready: true,
        hard_failure_reasons: [],
        currentness_observations: [],
        failure_reasons: [],
      }],
      closure: {
        transaction_id: 'tx-mas-current',
        closure_digest: 'sha256:mas-current',
        last_known_good_transaction_id: 'tx-mas-lkg',
        last_known_good_closure_digest: 'sha256:mas-lkg',
      },
    });
    assert.deepEqual(statusIndexEntry.dependent_guard, {
      required_by_package_ids: ['mas'],
      disable: { allowed: false, reason_code: 'agent_package_required_by_installed_dependents' },
      uninstall: { allowed: false, reason_code: 'agent_package_required_by_installed_dependents' },
    });
    assert.equal(fastAppState.app_state.agent_packages.directory.entry_count, 8);
    assert.equal(fastAppState.app_state.agent_packages.directory.entries.length, 8);
    assert.equal('installed_packages' in fastAppState.app_state.agent_packages.directory, false);
    assert.equal(calls.get('third.party.research'), 2);
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
