import {
  assert,
  fs,
  installRuntimePackageFixture,
  os,
  path,
  runCli,
  runCliAsync,
  runCliFailure,
  test,
} from '../helpers.ts';
import {
  writeCapabilityProvider,
  writeMasConsumer,
} from './packages-cases/capability-fixtures.ts';
import '../../connection-registry.test.ts';
import './app-action-cases/dry-run-actions.test.ts';
import './app-action-cases/connection-actions.test.ts';
import './app-action-cases/settings-and-workspace-actions.test.ts';
import './app-action-cases/work-item-control.test.ts';

function makeTreeWritable(root: string) {
  if (!fs.existsSync(root)) return;
  const stat = fs.lstatSync(root);
  if (stat.isDirectory()) {
    fs.chmodSync(root, 0o755);
    for (const entry of fs.readdirSync(root)) makeTreeWritable(path.join(root, entry));
  } else if (!stat.isSymbolicLink()) {
    fs.chmodSync(root, 0o644);
  }
}

test('app action execute wraps runtime action dry-run as the App mutating boundary', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-state-'));
  try {
    const output = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'missing-action',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(stateRoot, 'missing-gh'),
    }) as {
      app_action_execution: {
        surface_kind: string;
        action_id: string;
        dry_run: boolean;
        delegated_surface: string;
        result: {
          runtime_operator_action_execution: {
            action_id: string;
            dry_run: boolean;
            execution: { execution_status: string; result: null };
          };
        };
      };
    };

    assert.equal(output.app_action_execution.surface_kind, 'opl_app_action_execution.v1');
    assert.equal(output.app_action_execution.action_id, 'missing-action');
    assert.equal(output.app_action_execution.dry_run, true);
    assert.equal(output.app_action_execution.delegated_surface, 'opl runtime action execute');
    assert.equal(output.app_action_execution.result.runtime_operator_action_execution.action_id, 'missing-action');
    assert.equal(output.app_action_execution.result.runtime_operator_action_execution.dry_run, true);
    assert.equal(output.app_action_execution.result.runtime_operator_action_execution.execution.execution_status, 'dry_run_unresolved');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('app action catalog exposes representative safe delegated action refs', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-state-actions-home-'));

  try {
    const output = runCli(['app', 'state', '--profile', 'fast'], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'opl-state', 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    }) as {
      app_state: {
        actions: Array<{
          action_id: string;
          delegated_surface: string;
          payload_fields: string[];
        } & Record<string, unknown>>;
      };
    };
    const actions = new Map(output.app_state.actions.map((entry) => [entry.action_id, entry]));

    for (const actionId of [
      'codex_update',
      'module_sync',
      'provider_service_status',
      'provider_service_start',
      'provider_service_restart',
      'provider_service_stop',
      'provider_scheduler_status',
      'workspace_initialize',
      'workspace_validate',
      'settings_sync_capabilities',
      'settings_check_app_update',
      'settings_rollback_runtime_substrate',
      'settings_configure_webui_api_key',
      'task_action_receipt_preview',
      'opl_pack_provision_submission_resource',
    ]) {
      assert.ok(actions.has(actionId), `missing App action: ${actionId}`);
      const delegatedSurface = actions.get(actionId)?.delegated_surface ?? '';
      assert.equal(
        delegatedSurface.startsWith('opl ')
          || delegatedSurface.startsWith('printf <api-key> | opl ')
          || delegatedSurface.includes(' opl system startup-maintenance'),
        true,
      );
    }
    assert.deepEqual(actions.get('module_sync')?.payload_fields, []);
    assert.equal(actions.get('module_sync')?.delegated_surface, 'opl packages update');
    assert.equal(actions.has('scholarskills_workspace_sync'), false);
    assert.equal(actions.has('scholarskills_quest_sync'), false);
    assert.equal(actions.get('provider_scheduler_status')?.submit_via, 'opl app action execute');
    assert.equal(actions.get('provider_scheduler_status')?.execution_policy, 'opl_safe_action_shell');
    assert.equal(actions.get('provider_scheduler_status')?.route_requires_domain_or_app_payload, false);
    assert.equal(actions.get('provider_scheduler_status')?.can_submit_to_safe_action_shell, true);
    assert.equal(actions.get('provider_scheduler_status')?.dry_run_supported, true);
    assert.equal(actions.get('provider_scheduler_status')?.route, 'opl app action execute --action provider_scheduler_status');
    assert.equal(actions.get('provider_service_status')?.mutates, 'none_read_only');
    assert.equal(actions.get('provider_service_status')?.dry_run_supported, true);
    assert.equal(
      actions.get('provider_service_status')?.route,
      'opl app action execute --action provider_service_status',
    );
    assert.equal(actions.get('provider_service_start')?.mutates, 'opl_temporal_service');
    assert.equal(actions.get('provider_service_start')?.dry_run_supported, true);
    assert.equal(actions.get('provider_service_restart')?.mutates, 'opl_temporal_service');
    assert.equal(actions.get('provider_service_restart')?.dry_run_supported, true);
    assert.equal(
      actions.get('provider_service_restart')?.delegated_surface,
      'opl family-runtime service restart --provider temporal',
    );
    assert.equal(actions.get('provider_service_stop')?.mutates, 'opl_temporal_service');
    assert.equal(
      actions.get('provider_service_stop')?.delegated_surface,
      'opl family-runtime service stop --provider temporal',
    );
    assert.equal(actions.get('provider_worker_stop')?.mutates, 'opl_temporal_worker');
    assert.equal(actions.get('workspace_initialize')?.delegated_surface, 'opl workspace init');
    assert.equal(actions.get('workspace_initialize')?.dry_run_supported, true);
    assert.deepEqual(actions.get('workspace_initialize')?.payload_fields, [
      'agent_id',
      'workspace_root_optional',
      'workspace_id',
      'project_id',
      'mode',
      'title',
    ]);
    assert.equal(actions.get('workspace_validate')?.delegated_surface, 'opl workspace validate');
    assert.equal(actions.get('workspace_validate')?.mutates, 'none_read_only');
    assert.deepEqual(actions.get('workspace_validate')?.payload_fields, ['workspace_path']);
    assert.equal(actions.has('provider_scheduler_tick'), false);
    assert.equal(
      actions.get('task_action_receipt_preview')?.delegated_surface,
      'opl app action execute --action task_action_receipt_preview --dry-run',
    );
    assert.deepEqual(actions.get('task_action_receipt_preview')?.payload_fields, ['task_id', 'action_ref']);
    assert.equal(actions.get('task_action_receipt_preview')?.mutates, 'none_read_only');
    assert.equal(actions.get('task_action_receipt_preview')?.dry_run_supported, true);
    assert.equal(actions.has('work_item_lifecycle_set'), true);
    assert.deepEqual(actions.get('work_item_lifecycle_set')?.payload_fields, [
      'agent_id',
      'project_id',
      'work_item_id',
      'lifecycle_state',
      'reason',
      'expected_generation',
    ]);
    assert.equal(actions.get('work_item_lifecycle_set')?.mutates, 'opl_work_item_control_ledger');
    assert.equal(actions.get('work_item_lifecycle_set')?.dry_run_supported, true);
    assert.equal(actions.has('work_item_visibility_set'), true);
    assert.deepEqual(actions.get('work_item_visibility_set')?.payload_fields, [
      'agent_id',
      'project_id',
      'work_item_id',
      'visibility_state',
      'reason',
      'expected_generation',
    ]);
    assert.equal(actions.get('work_item_visibility_set')?.mutates, 'opl_work_item_control_ledger');
    assert.equal(actions.get('work_item_visibility_set')?.dry_run_supported, true);
    assert.equal(
      actions.get('task_export_bundle_preview')?.delegated_surface,
      'opl app action execute --action task_export_bundle_preview --dry-run',
    );
    assert.deepEqual(actions.get('task_export_bundle_preview')?.payload_fields, ['task_id', 'export_bundle_ref']);
    assert.equal(actions.get('task_export_bundle_preview')?.mutates, 'none_read_only');
    assert.equal(actions.get('task_export_bundle_preview')?.dry_run_supported, true);
    assert.equal(
      actions.get('opl_pack_provision_submission_resource')?.delegated_surface,
      'opl pack provision-submission-resource',
    );
    assert.deepEqual(actions.get('opl_pack_provision_submission_resource')?.payload_fields, [
      'requirements_path',
      'requirements_payload',
      'resource_id',
      'package_root',
      'source_path',
      'expected_sha256',
      'destination_root',
    ]);
    assert.equal(
      actions.get('opl_pack_provision_submission_resource')?.mutates,
      'opl_pack_content_addressed_submission_resource_cache',
    );
    assert.equal(actions.get('opl_pack_provision_submission_resource')?.dry_run_supported, true);
    assert.equal(
      actions.get('settings_repair_model_access')?.delegated_surface,
      'opl system developer-supervisor',
    );
    assert.deepEqual(actions.get('settings_repair_model_access')?.payload_fields, [
      'developerSupervisorEnabled',
      'developerSupervisorMode',
      'developerSupervisorAutoEnableGithubLogin',
    ]);
    assert.equal(actions.get('settings_repair_model_access')?.mutates, 'opl_developer_supervisor_config');
    assert.equal(actions.get('settings_repair_model_access')?.confirmation_required, true);
    assert.equal(actions.get('settings_repair_model_access')?.danger_level, 'medium');
    assert.equal(actions.get('settings_verify_workspace')?.delegated_surface, 'opl workspace health');
    assert.deepEqual(actions.get('settings_verify_workspace')?.payload_fields, ['workspace_path']);
    assert.equal(actions.get('settings_verify_workspace')?.mutates, 'none_read_only');
    assert.equal(actions.get('settings_sync_capabilities')?.delegated_surface, 'opl packages update');
    assert.deepEqual(actions.get('settings_sync_capabilities')?.payload_fields, []);
    assert.equal(actions.get('settings_sync_capabilities')?.confirmation_required, false);
    assert.equal(actions.get('settings_sync_capabilities')?.danger_level, 'low');
    assert.equal(actions.get('settings_sync_capabilities')?.can_submit_to_safe_action_shell, true);
    assert.equal(
      actions.get('settings_check_app_update')?.delegated_surface,
      'opl app state --profile fast',
    );
    assert.equal(actions.get('settings_check_app_update')?.mutates, 'none_read_only');
    assert.equal(
      actions.get('settings_rollback_runtime_substrate')?.delegated_surface,
      'opl update rollback',
    );
    assert.deepEqual(actions.get('settings_rollback_runtime_substrate')?.payload_fields, ['receipt_ref']);
    assert.equal(actions.get('settings_rollback_runtime_substrate')?.danger_level, 'high');
    assert.equal(
      actions.get('settings_configure_webui_api_key')?.delegated_surface,
      'printf <api-key> | opl system configure-codex --api-key-stdin',
    );
    assert.deepEqual(actions.get('settings_configure_webui_api_key')?.payload_fields, []);
    assert.equal(actions.get('settings_configure_webui_api_key')?.danger_level, 'medium');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('App action catalog registers only verified external owner updates and executes the confirmation route as dry-run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-external-owner-action-'));
  const brew = path.join(root, 'bin', 'brew');
  const codex = path.join(root, 'Cellar', 'codex', '0.1.0', 'bin', 'codex');
  fs.mkdirSync(path.dirname(brew), { recursive: true });
  fs.mkdirSync(path.dirname(codex), { recursive: true });
  fs.writeFileSync(brew, [
    '#!/usr/bin/env bash',
    'if [ "$*" = "list --formula --versions codex" ]; then echo "codex 0.1.0"; fi',
    '',
  ].join('\n'), { mode: 0o755 });
  fs.writeFileSync(codex, '#!/usr/bin/env bash\necho "codex-cli 0.1.0"\n', { mode: 0o755 });
  const env = {
    HOME: root,
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_HOMEBREW_BIN: brew,
    OPL_CODEX_BIN: codex,
    PATH: `${path.dirname(codex)}:/usr/bin:/bin`,
  };
  try {
    const state = runCli(['app', 'state', '--profile', 'full'], env) as any;
    const action = state.app_state.actions.find((entry: any) => entry.action_id === 'external_codex_update_homebrew');
    assert.equal(action.confirmation_required, true);
    assert.equal(action.delegated_surface, 'brew upgrade codex');
    const execution = runCli([
      'app', 'action', 'execute', '--action', 'external_codex_update_homebrew', '--dry-run',
    ], env) as any;
    assert.equal(execution.app_action_execution.delegated_surface, 'brew upgrade codex');
    assert.equal(execution.app_action_execution.result.external_dependency_update.status, 'dry_run');
    assert.equal(execution.app_action_execution.result.external_dependency_update.auto_apply_allowed, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('retired ScholarSkills App actions cannot execute through the generic action shell', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-retired-scholarskills-'));
  try {
    for (const actionId of ['scholarskills_workspace_sync', 'scholarskills_quest_sync']) {
      const failure = runCliFailure([
        'app', 'action', 'execute', '--action', actionId,
      ], {
        OPL_STATE_DIR: stateRoot,
        OPL_DEVELOPER_MODE_GH_BINARY: path.join(stateRoot, 'missing-gh'),
      });
      assert.equal(failure.payload.error.code, 'cli_usage_error');
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('generic package activation action returns the launch binding at the App boundary', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-package-activate-'));
  const workspace = path.join(root, 'workspace');
  const providerPackageId = 'fixture.app-action-provider';
  const consumerPackageId = 'fixture.app-action-consumer';
  const providerManifest = writeCapabilityProvider(path.join(root, 'provider'), '0.1.0', {
    packageId: providerPackageId,
  });
  const consumerManifest = writeMasConsumer(path.join(root, 'consumer'), providerManifest, '0.1.0a4', {
    packageId: consumerPackageId,
    providerPackageId,
  });
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    CODEX_HOME: path.join(root, 'codex-home'),
  };
  try {
    await runCliAsync([
      'packages', 'install', '--manifest-url', consumerManifest, '--trust-tier', 'third_party_unverified',
    ], env);
    const output = await runCliAsync([
      'app', 'action', 'execute', '--action', 'agent_package_activate',
      '--payload', JSON.stringify({
        package_id: consumerPackageId,
        scope: 'workspace',
        target_workspace: workspace,
        use_boundary_id: 'app-conversation-create-1',
      }),
    ], env) as any;
    const execution = output.app_action_execution;
    const activation = execution.result.opl_agent_package_activation;

    assert.equal(execution.action_id, 'agent_package_activate');
    assert.equal(execution.delegated_surface, 'opl packages activate --package-id <package_id> --scope <workspace|quest>');
    assert.equal(activation.package_id, consumerPackageId);
    assert.equal(activation.launch_allowed, true);
    assert.equal(activation.operational_ready, true);
    assert.equal(activation.launch_state_schema_version, 'opl-agent-package-launch-state.v1');
    assert.equal(activation.launch_state, 'ready');
    assert.equal(activation.launch_state_reason, null);
    assert.deepEqual({
      launch_state_schema_version: activation.launch_state_schema_version,
      launch_state: activation.launch_state,
      launch_state_reason: activation.launch_state_reason,
    }, {
      launch_state_schema_version: activation.package_status.launch_state_schema_version,
      launch_state: activation.package_status.launch_state,
      launch_state_reason: activation.package_status.launch_state_reason,
    });
    assert.equal(activation.use_boundary_id, 'app-conversation-create-1');
    assert.equal(activation.package_use_binding.use_boundary_id, activation.use_boundary_id);
    assert.equal(activation.package_use_binding.use_receipt_ref, activation.use_receipt_ref);
    assert.match(activation.use_receipt_ref, /^opl:\/\/agent-package\/use\/fixture\.app-action-consumer\//);

    const lockPath = path.join(env.OPL_STATE_DIR, 'agent-package-locks.json');
    const lockIndex = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const consumerLock = lockIndex.packages.find((entry: any) => entry.package_id === consumerPackageId);
    const providerLock = lockIndex.packages.find((entry: any) => entry.package_id === providerPackageId);
    const ownerCommit = 'a'.repeat(40);
    const releaseDigest = `sha256:${'b'.repeat(64)}`;
    Object.assign(consumerLock, {
      source_kind: 'first_party_managed_cohort',
      owner_source_commit: ownerCommit,
      release_channel_ref: 'opl://release-set/fixture',
      release_channel_digest: releaseDigest,
      carrier_authority: {
        surface_kind: 'opl_agent_package_carrier_authority.v1',
        status: 'verified',
        catalog_ref: 'opl://release-set/fixture',
        catalog_sha256: releaseDigest,
        catalog_owner_source_commit: ownerCommit,
        manifest_carrier_source_commit: ownerCommit,
        payload_source_commit: ownerCommit,
        verified_source_commit: ownerCommit,
      },
    });
    fs.writeFileSync(lockPath, `${JSON.stringify(lockIndex, null, 2)}\n`);

    const carrierObservation = runCli([
      'packages', 'status', '--package-id', consumerPackageId,
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env) as any;
    assert.equal(carrierObservation.opl_agent_package_status.operational_ready, true);
    assert.equal(carrierObservation.opl_agent_package_status.launch_allowed, true);
    assert.equal(carrierObservation.opl_agent_package_status.launch_blocked_reason, null);
    assert.equal(carrierObservation.opl_agent_package_status.carrier_authority_readiness.status, 'invalid');
    assert.equal(carrierObservation.opl_agent_package_status.launch_state, 'degraded');
    assert.equal(carrierObservation.opl_agent_package_status.launch_state_reason, 'carrier_authority_invalid');

    providerLock.exposure_state = 'disabled';
    fs.writeFileSync(lockPath, `${JSON.stringify(lockIndex, null, 2)}\n`);
    const hardDependency = runCli([
      'packages', 'status', '--package-id', consumerPackageId,
      '--scope', 'workspace', '--target-workspace', workspace,
    ], env) as any;
    assert.equal(hardDependency.opl_agent_package_status.launch_allowed, false);
    assert.equal(hardDependency.opl_agent_package_status.launch_blocked_reason, 'package_dependency_incompatible');
    assert.equal(hardDependency.opl_agent_package_status.carrier_authority_readiness.status, 'invalid');
    assert.equal(hardDependency.opl_agent_package_status.launch_state, 'package_unavailable');
    assert.equal(hardDependency.opl_agent_package_status.launch_state_reason, 'package_dependency_incompatible');

    providerLock.exposure_state = 'visible';
    lockIndex.packages = lockIndex.packages.filter((entry: any) => entry.package_id !== providerPackageId);
    fs.writeFileSync(lockPath, `${JSON.stringify(lockIndex, null, 2)}\n`);
    const requiredWorkspace = path.join(root, 'required-provider-missing-workspace');
    const ledgerPath = path.join(env.OPL_STATE_DIR, 'agent-package-lifecycle-ledger.json');
    const ledgerBeforeRequiredFailure = fs.readFileSync(ledgerPath, 'utf8');
    const requiredFailure = runCliFailure([
      'app', 'action', 'execute', '--action', 'agent_package_activate',
      '--payload', JSON.stringify({
        package_id: consumerPackageId,
        scope: 'workspace',
        target_workspace: requiredWorkspace,
        use_boundary_id: 'app-conversation-required-provider-missing',
      }),
    ], env);
    assert.equal(requiredFailure.payload.error.code, 'contract_shape_invalid');
    assert.equal(requiredFailure.payload.error.details.failure_code, 'agent_package_scope_activation_blocked');
    assert.equal(requiredFailure.payload.error.details.launch_blocked_reason, 'package_dependency_missing');
    assert.equal(fs.readFileSync(ledgerPath, 'utf8'), ledgerBeforeRequiredFailure);
    assert.equal(fs.existsSync(path.join(requiredWorkspace, '.codex', 'skills')), false);

    consumerLock.capability_dependencies[0].required = false;
    consumerLock.resolved_dependencies[0].required = false;
    fs.writeFileSync(lockPath, `${JSON.stringify(lockIndex, null, 2)}\n`);
    const optionalWorkspace = path.join(root, 'optional-workspace');
    const optionalActivation = (await runCliAsync([
      'app', 'action', 'execute', '--action', 'agent_package_activate',
      '--payload', JSON.stringify({
        package_id: consumerPackageId,
        scope: 'workspace',
        target_workspace: optionalWorkspace,
        use_boundary_id: 'app-conversation-optional-provider-missing',
      }),
    ], env) as any).app_action_execution.result.opl_agent_package_activation;
    assert.equal(optionalActivation.writes_performed, true);
    assert.equal(optionalActivation.launch_allowed, true);
    assert.equal(optionalActivation.launch_blocked_reason, null);
    assert.equal(optionalActivation.package_status.package_dependency_readiness.operational_ready, true);
    assert.equal(optionalActivation.package_status.materialization_readiness.status, 'incompatible');
    assert.equal(optionalActivation.launch_state, 'degraded');
    assert.equal(optionalActivation.launch_state_reason, 'optional_dependency_missing');
    assert.deepEqual({
      launch_state_schema_version: optionalActivation.launch_state_schema_version,
      launch_state: optionalActivation.launch_state,
      launch_state_reason: optionalActivation.launch_state_reason,
    }, {
      launch_state_schema_version: optionalActivation.package_status.launch_state_schema_version,
      launch_state: optionalActivation.package_status.launch_state,
      launch_state_reason: optionalActivation.package_status.launch_state_reason,
    });
    assert.deepEqual(optionalActivation.scope_materializations, []);
    assert.deepEqual(optionalActivation.package_use_binding.provider_packages, []);
    assert.deepEqual(optionalActivation.package_use_binding.skill_projection.package_lock_refs, [consumerLock.lock_ref]);
    assert.equal(fs.existsSync(path.join(optionalWorkspace, '.codex', 'skills')), false);
  } finally {
    makeTreeWritable(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('dependency-free activation returns only persisted receipt refs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-package-use-receipt-'));
  const stateRoot = path.join(root, 'state');
  const workspace = path.join(root, 'workspace');
  const env = {
    OPL_STATE_DIR: stateRoot,
    CODEX_HOME: path.join(root, 'codex-home'),
  };
  try {
    installRuntimePackageFixture(stateRoot, 'rca');
    const activation = (await runCliAsync([
      'app', 'action', 'execute', '--action', 'agent_package_activate',
      '--payload', JSON.stringify({
        package_id: 'rca',
        scope: 'workspace',
        target_workspace: workspace,
        use_boundary_id: 'dependency-free-use',
      }),
    ], env) as any).app_action_execution.result.opl_agent_package_activation;
    const ledger = JSON.parse(fs.readFileSync(
      path.join(stateRoot, 'agent-package-lifecycle-ledger.json'),
      'utf8',
    ));
    const persistedRefs = new Set(ledger.receipts.map((receipt: any) => receipt.receipt_ref));
    const returnedRefs = [
      activation.lifecycle_receipt?.receipt_ref,
      activation.lifecycle_receipt_ref,
      activation.use_receipt?.receipt_ref,
      activation.use_receipt_ref,
      activation.package_use_binding?.use_receipt_ref,
      activation.package_lock?.action_receipt_id,
    ].filter((receiptRef): receiptRef is string => typeof receiptRef === 'string' && receiptRef.length > 0);

    assert.equal(activation.lifecycle_receipt, null);
    assert.equal(activation.lifecycle_receipt_ref, null);
    assert.equal(activation.package_use_binding.use_receipt_ref, activation.use_receipt_ref);
    assert.equal(returnedRefs.every((receiptRef) => persistedRefs.has(receiptRef)), true);
  } finally {
    makeTreeWritable(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('package activation dry-run stays canonical and disabled preflight performs no writes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-package-preflight-'));
  const stateRoot = path.join(root, 'state');
  const workspace = path.join(root, 'workspace');
  const env = {
    OPL_STATE_DIR: stateRoot,
    CODEX_HOME: path.join(stateRoot, 'codex-home'),
  };
  try {
    installRuntimePackageFixture(stateRoot, 'rca');
    const lockPath = path.join(stateRoot, 'agent-package-locks.json');
    const ledgerPath = path.join(stateRoot, 'agent-package-lifecycle-ledger.json');
    const lockBeforeDryRun = fs.readFileSync(lockPath, 'utf8');
    const ledgerBeforeDryRun = fs.readFileSync(ledgerPath, 'utf8');
    const dryRun = (await runCliAsync([
      'app', 'action', 'execute', '--action', 'agent_package_activate', '--dry-run',
      '--payload', JSON.stringify({
        package_id: 'rca',
        scope: 'workspace',
        target_workspace: workspace,
        use_boundary_id: 'dependency-free-dry-run',
      }),
    ], env) as any).app_action_execution.result.opl_agent_package_activation;

    assert.equal(dryRun.status, 'validated_no_write');
    assert.equal(dryRun.writes_performed, false);
    assert.equal(dryRun.operational_ready, false);
    assert.equal(dryRun.launch_allowed, false);
    assert.equal(dryRun.launch_blocked_reason, null);
    assert.equal(dryRun.package_status.operational_ready, true);
    assert.equal(dryRun.package_status.launch_allowed, true);
    for (const field of [
      'launch_state_schema_version',
      'launch_state',
      'launch_state_reason',
    ]) {
      assert.deepEqual(dryRun[field], dryRun.package_status[field], field);
    }
    assert.equal(fs.readFileSync(lockPath, 'utf8'), lockBeforeDryRun);
    assert.equal(fs.readFileSync(ledgerPath, 'utf8'), ledgerBeforeDryRun);

    const lockIndex = JSON.parse(lockBeforeDryRun);
    lockIndex.packages[0].exposure_state = 'disabled';
    fs.writeFileSync(lockPath, `${JSON.stringify(lockIndex, null, 2)}\n`);
    const disabledLockBefore = fs.readFileSync(lockPath, 'utf8');
    const disabledLedgerBefore = fs.readFileSync(ledgerPath, 'utf8');
    const failure = runCliFailure([
      'app', 'action', 'execute', '--action', 'agent_package_activate',
      '--payload', JSON.stringify({
        package_id: 'rca',
        scope: 'workspace',
        target_workspace: workspace,
        use_boundary_id: 'disabled-package-preflight',
      }),
    ], env);
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_scope_activation_blocked');
    assert.equal(failure.payload.error.details.launch_blocked_reason, 'package_disabled');
    assert.equal(fs.readFileSync(lockPath, 'utf8'), disabledLockBefore);
    assert.equal(fs.readFileSync(ledgerPath, 'utf8'), disabledLedgerBefore);
    assert.equal(fs.existsSync(path.join(workspace, '.codex', 'skills')), false);
  } finally {
    makeTreeWritable(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
