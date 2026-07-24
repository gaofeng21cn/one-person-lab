import { fileURLToPath } from 'node:url';

import { assert, fs, os, path, test } from '../../helpers.ts';
import {
  deriveAgentPackageLaunchState,
  type AgentPackageLaunchStateInput,
  type AgentPackageLaunchStateProjection,
} from '../../../../../src/kernel/agent-package-launch-state.ts';
import { FrameworkContractError } from '../../../../../src/kernel/contract-validation.ts';
import { parseJsonText } from '../../../../../src/kernel/json-file.ts';
import { validateJsonSchemaPayload } from '../../../../../src/kernel/schema-registry.ts';
import { buildAppAgentPackageStatuses } from '../../../../../src/modules/console/app-state.ts';
import { managedRuntimeSourceLockReadiness } from '../../../../../src/modules/connect/agent-package-registry-parts/managed-runtime-source-carrier.ts';
import type {
  AgentPackageLockIndex,
  AgentPackageManagedRuntimeSourceState,
} from '../../../../../src/modules/connect/agent-package-registry-parts/types.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const launchStateSchemaRef = 'contracts/opl-framework/agent-package-launch-state.schema.json';
const launchStateFixtureRef = 'contracts/opl-framework/agent-package-launch-state.fixture.json';

function readContractJson(relativePath: string) {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, unknown>;
}

function lockIndex(packages: unknown[] = []) {
  return {
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages,
    last_known_good_transactions: [],
  } as unknown as AgentPackageLockIndex;
}

function installedStatus(input: {
  packageId: string;
  exposure?: 'visible' | 'hidden' | 'disabled';
  dependencyReadiness?: Record<string, unknown> | null;
  runtimeReady?: boolean;
  launchAllowed?: boolean;
  launchBlockedReason?: string | null;
  lifecycleActionRefs?: string[];
  recommendedAction?: string | null;
}) {
  const legacyRollbackField = ['roll', 'back_ref'].join('');
  const runtimeReady = input.runtimeReady ?? true;
  const launchAllowed = input.launchAllowed ?? runtimeReady;
  const launchBlockedReason = input.launchBlockedReason
    ?? (launchAllowed ? null : 'runtime_source_incompatible');
  return {
    opl_agent_package_status: {
      surface_kind: 'opl_agent_package_status',
      package_id: input.packageId,
      status: launchAllowed ? 'available' : 'attention_needed',
      installed_package_count: 1,
      installed_packages: [{
        package_id: input.packageId,
        package_version: '99.0.0-ignored',
        lock_ref: `opl://legacy-lock/${input.packageId}`,
        action_receipt_id: `opl://legacy-receipt/${input.packageId}`,
        [legacyRollbackField]: `opl://legacy-history/${input.packageId}`,
        content_digest: `sha256:legacy-${input.packageId}`,
        exposure_state: input.exposure ?? 'visible',
        physical_surface: { status: 'materialized' },
      }],
      conditions: [],
      recommended_action: input.recommendedAction ?? null,
      lifecycle_action_refs: input.lifecycleActionRefs ?? [
        'update',
        'repair',
        'uninstall',
        'hide',
        'disable',
        'home_shortcut_preferences_set',
      ],
      package_dependency_readiness: input.dependencyReadiness ?? {
        status: 'current',
        operational_ready: true,
        repair_command: `opl packages repair --package-id ${input.packageId}`,
        dependencies: [],
      },
      materialization_readiness: {
        status: 'current',
        expected_digest: 'sha256:legacy-expected',
        actual_digest: 'sha256:legacy-actual',
        lifecycle_receipt_ref: `opl://legacy-materialization/${input.packageId}`,
      },
      runtime_source_readiness: {
        status: runtimeReady ? 'current' : 'incompatible',
        operational_ready: runtimeReady,
        module_id: input.packageId,
        checkout_path: `/legacy/${input.packageId}`,
        expected_tree_sha256: 'sha256:legacy-expected-tree',
        actual_tree_sha256: 'sha256:legacy-actual-tree',
        reason: runtimeReady ? null : 'managed_runtime_source_probe_failed',
      },
      operational_ready: launchAllowed,
      operational_ready_scope: 'package_dependency_scope_runtime_source_and_managed_policy',
      launch_allowed: launchAllowed,
      launch_blocked_reason: launchBlockedReason,
      ...deriveAgentPackageLaunchState({
        installed: true,
        exposure_state: input.exposure ?? 'visible',
        operational_ready: launchAllowed,
        launch_blocked_reason: launchBlockedReason,
        unavailable_reason: launchAllowed ? null : launchBlockedReason,
      }),
      allowed_when_blocked: ['status', 'doctor', 'repair'],
      repair_action: launchAllowed ? null : `opl packages repair --package-id ${input.packageId}`,
      lifecycle_receipt_summary: {
        latest_receipt_ref: `opl://legacy-receipt/${input.packageId}`,
      },
    },
  };
}

function assertLegacyManagerFieldsAbsent(status: Record<string, unknown>) {
  for (const field of [
    'package_version',
    'installed_version',
    'version',
    'source_kind',
    'package_lock_ref',
    'lock_ref',
    'physical_surface',
    'materialization_readiness',
    'managed_policy_currentness',
    'carrier_authority_readiness',
    'action_receipt_ref',
    'rollback_ref',
    'dependent_guard',
    'lifecycle_receipt_summary',
  ]) {
    assert.equal(Object.hasOwn(status, field), false, `${field} must stay out of the App package projection`);
  }
  const readiness = status.dependency_readiness as Record<string, unknown>;
  assert.equal(Object.hasOwn(readiness, 'closure'), false);
}

test('Framework package launch-state fixture is exact and schema-valid', () => {
  const schema = readContractJson(launchStateSchemaRef);
  const fixture = readContractJson(launchStateFixtureRef) as {
    fixture_kind: string;
    owner: string;
    schema_ref: string;
    cases: Array<{
      id: string;
      input: AgentPackageLaunchStateInput;
      expected: AgentPackageLaunchStateProjection;
    }>;
  };
  assert.equal(fixture.fixture_kind, 'opl_agent_package_launch_state_fixture.v1');
  assert.equal(fixture.owner, 'one-person-lab');
  assert.equal(fixture.schema_ref, launchStateSchemaRef);
  assert.equal(new Set(fixture.cases.map((entry) => entry.id)).size, fixture.cases.length);

  for (const entry of fixture.cases) {
    assert.deepEqual(deriveAgentPackageLaunchState(entry.input), entry.expected, entry.id);
    const validation = validateJsonSchemaPayload({
      schemaId: 'opl.agent_package_launch_state.v1',
      schema,
      sourceRef: launchStateSchemaRef,
    }, entry.expected);
    assert.equal(validation.ok, true, entry.id);
  }

  for (const invalid of [
    {
      launch_state_schema_version: 'opl-agent-package-launch-state.v1',
      launch_state: 'ready',
      launch_state_reason: 'unexpected_reason',
    },
    {
      launch_state_schema_version: 'opl-agent-package-launch-state.v1',
      launch_state: 'degraded',
      launch_state_reason: null,
    },
    {
      launch_state_schema_version: 'opl-agent-package-launch-state.v1',
      launch_state: 'package_unavailable',
      launch_state_reason: '   ',
    },
  ]) {
    assert.equal(validateJsonSchemaPayload({
      schemaId: 'opl.agent_package_launch_state.v1',
      schema,
      sourceRef: launchStateSchemaRef,
    }, invalid).ok, false);
  }

  assert.deepEqual(deriveAgentPackageLaunchState({
    installed: true,
    exposure_state: 'visible',
    operational_ready: false,
    launch_blocked_reason: 'unknown_package_failure',
  }), {
    launch_state_schema_version: 'opl-agent-package-launch-state.v1',
    launch_state: 'package_unavailable',
    launch_state_reason: 'unknown_package_failure',
  });
});

test('App package projection accepts arbitrary package ids and trusts fresh owner presence', () => {
  const requested: string[] = [];
  const readStatus = ((input: { packageId: string }) => {
    requested.push(input.packageId);
    return installedStatus({
      packageId: input.packageId,
      exposure: 'hidden',
      recommendedAction: 'update',
    });
  }) as any;
  const staleLockIndex = lockIndex([{
    package_id: 'unrelated.legacy.package',
    package_version: '1.0.0',
    exposure_state: 'disabled',
  }]);

  const fast = buildAppAgentPackageStatuses({
    packageIds: ['third.party.research'],
    profile: 'fast',
    readStatus,
    lockIndex: staleLockIndex,
  });
  const full = buildAppAgentPackageStatuses({
    packageIds: ['third.party.research'],
    profile: 'full',
    readStatus,
    lockIndex: staleLockIndex,
  });

  assert.deepEqual(Object.keys(fast), ['third.party.research']);
  assert.deepEqual(requested, ['third.party.research', 'third.party.research']);
  const fastStatus = fast['third.party.research'] as any;
  const fullStatus = full['third.party.research'] as any;
  assert.deepEqual(fastStatus.presence, {
    registered: true,
    installed: true,
    present: true,
    callable: true,
    status: 'present',
    reason: null,
  });
  assert.deepEqual(fastStatus.capability_exposure, {
    status: 'hidden',
    codex_visible: false,
  });
  assert.equal(fastStatus.operational_ready, true);
  assert.equal(fastStatus.launch_allowed, true);
  assert.equal(fastStatus.launch_state, 'ready');
  assert.equal(fastStatus.recommended_action, 'update');
  assert.deepEqual(fastStatus.actions.available, [
    'update',
    'repair',
    'uninstall',
    'hide',
    'disable',
    'home_shortcut_preferences_set',
  ]);
  assert.deepEqual({ ...fastStatus, profile: 'full' }, fullStatus);
  assertLegacyManagerFieldsAbsent(fastStatus);
  assertLegacyManagerFieldsAbsent(fullStatus);
});

test('presence-only dependency projection ignores legacy version ABI digest observations', () => {
  const dependencyReadiness = {
    status: 'incompatible',
    operational_ready: true,
    repair_command: 'opl packages repair --package-id mas',
    dependencies: [{
      package_id: 'mas-scholar-skills',
      required: true,
      version_requirement: '^999.0.0',
      capability_abi: 'legacy.v999',
      consumer_profile_id: null,
      required_export_ids: ['ignored-by-composition'],
      required_module_ids: [],
      installed_version: '0.1.0',
      manifest_sha256: 'sha256:legacy-manifest',
      content_digest: 'sha256:legacy-content',
      status: 'incompatible',
      reasons: [
        'version_requirement_unsatisfied',
        'capability_abi_mismatch',
        'dependency_closure_digest_mismatch',
      ],
      missing_required_export_ids: [],
      missing_required_module_ids: [],
    }, {
      package_id: 'optional.visualizer',
      required: false,
      version_requirement: '*',
      capability_abi: 'ignored',
      consumer_profile_id: null,
      required_export_ids: [],
      required_module_ids: [],
      installed_version: null,
      manifest_sha256: null,
      content_digest: null,
      status: 'missing',
      reasons: ['dependency_lock_missing'],
      missing_required_export_ids: [],
      missing_required_module_ids: [],
    }],
  };
  const statuses = buildAppAgentPackageStatuses({
    packageIds: ['mas'],
    profile: 'fast',
    lockIndex: lockIndex(),
    readStatus: (() => installedStatus({
      packageId: 'mas',
      dependencyReadiness,
    })) as any,
  });
  const projected = statuses.mas as any;

  assert.deepEqual(projected.dependency_readiness, {
    status: 'ready',
    required_count: 1,
    present_count: 1,
    callable_count: 1,
    checks: [{
      package_id: 'mas-scholar-skills',
      required: true,
      present: true,
      callable: true,
      status: 'callable',
      reasons: [],
    }, {
      package_id: 'optional.visualizer',
      required: false,
      present: false,
      callable: false,
      status: 'missing',
      reasons: ['package_missing'],
    }],
  });
  assert.equal(JSON.stringify(projected).includes('legacy.v999'), false);
  assert.equal(JSON.stringify(projected).includes('sha256:legacy-content'), false);
});

test('missing or disabled required packages remain local presence blockers', () => {
  const dependencyReadiness = {
    status: 'missing',
    operational_ready: false,
    repair_command: 'opl packages repair --package-id mas',
    dependencies: [{
      package_id: 'mas-scholar-skills',
      required: true,
      status: 'missing',
      reasons: ['dependency_lock_missing'],
    }, {
      package_id: 'required.runtime.tool',
      required: true,
      status: 'incompatible',
      reasons: ['dependency_disabled'],
    }],
  };
  const statuses = buildAppAgentPackageStatuses({
    packageIds: ['mas'],
    profile: 'full',
    lockIndex: lockIndex(),
    readStatus: (() => installedStatus({
      packageId: 'mas',
      dependencyReadiness,
      launchAllowed: false,
      launchBlockedReason: 'package_dependency_missing',
    })) as any,
  });
  const projected = statuses.mas as any;

  assert.equal(projected.dependency_readiness.status, 'attention_needed');
  assert.equal(projected.dependency_readiness.present_count, 1);
  assert.equal(projected.dependency_readiness.callable_count, 0);
  assert.deepEqual(projected.dependency_readiness.checks.map((entry: any) => ({
    package_id: entry.package_id,
    status: entry.status,
    reasons: entry.reasons,
  })), [{
    package_id: 'mas-scholar-skills',
    status: 'missing',
    reasons: ['package_missing'],
  }, {
    package_id: 'required.runtime.tool',
    status: 'unavailable',
    reasons: ['package_disabled'],
  }]);
  assert.equal(projected.launch_allowed, false);
  assert.equal(projected.launch_blocked_reason, 'package_dependency_missing');
});

test('runtime carrier failure reports physical_unavailable without exposing old manager state', () => {
  const statuses = buildAppAgentPackageStatuses({
    packageIds: ['mas'],
    profile: 'fast',
    lockIndex: lockIndex(),
    readStatus: (() => installedStatus({
      packageId: 'mas',
      runtimeReady: false,
      launchAllowed: false,
      launchBlockedReason: 'runtime_source_incompatible',
      lifecycleActionRefs: ['repair', 'uninstall'],
    })) as any,
  });
  const projected = statuses.mas as any;

  assert.deepEqual(projected.presence, {
    registered: true,
    installed: false,
    present: false,
    callable: false,
    status: 'physical_unavailable',
    reason: 'runtime_source_incompatible',
  });
  assert.deepEqual(projected.runtime_source_readiness, {
    status: 'incompatible',
    operational_ready: false,
    reason: 'managed_runtime_source_probe_failed',
  });
  assert.equal(projected.status, 'attention_needed');
  assert.equal(projected.launch_allowed, false);
  assert.equal(projected.launch_state, 'package_unavailable');
  assert.equal(projected.launch_state_reason, 'runtime_source_incompatible');
  assert.equal(projected.repair_action.enabled, true);
  assertLegacyManagerFieldsAbsent(projected);
});

test('status read failure stays unknown and never guesses installed state from a stale lock', () => {
  const legacyRollbackField = ['roll', 'back_ref'].join('');
  const staleLockIndex = lockIndex([{
    package_id: 'stale.package',
    package_version: '1.0.0',
    exposure_state: 'hidden',
    action_receipt_id: 'opl://stale-receipt',
    [legacyRollbackField]: 'opl://stale-history',
  }]);
  const statuses = buildAppAgentPackageStatuses({
    packageIds: ['stale.package'],
    profile: 'fast',
    lockIndex: staleLockIndex,
    readStatus: (() => {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Fresh carrier status is unavailable.',
        { failure_code: 'fresh_carrier_status_unavailable' },
      );
    }) as any,
  });
  const projected = statuses['stale.package'] as any;

  assert.equal(projected.status, 'unavailable');
  assert.deepEqual(projected.presence, {
    registered: null,
    installed: null,
    present: null,
    callable: false,
    status: 'unknown',
    reason: 'package_status_read_failed',
  });
  assert.deepEqual(projected.capability_exposure, {
    status: 'unknown',
    codex_visible: false,
  });
  assert.equal(projected.launch_allowed, false);
  assert.equal(projected.repair_action.enabled, false);
  assert.equal(Object.hasOwn(projected, 'action_receipt_ref'), false);
  assert.equal(Object.hasOwn(projected, 'rollback_ref'), false);
  assert.equal((projected.status_read_error as Record<string, unknown>).code, 'contract_shape_invalid');
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
    fs.writeFileSync(checkoutPath, 'not-a-directory\n');
    const readiness = managedRuntimeSourceLockReadiness(state);
    assert.equal(readiness.status, 'missing');
    assert.equal(readiness.operational_ready, false);
    assert.equal(readiness.reason, 'managed_runtime_source_missing');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
