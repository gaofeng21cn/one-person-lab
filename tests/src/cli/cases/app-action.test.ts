import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';
import '../../connection-registry.test.ts';
import './app-action-cases/dry-run-actions.test.ts';
import './app-action-cases/connection-actions.test.ts';
import './app-action-cases/settings-and-workspace-actions.test.ts';
import './app-action-cases/work-item-control.test.ts';

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
      'settings_check_opl_base_update',
      'settings_apply_opl_base_update',
      'settings_check_app_update',
      'settings_rollback_runtime_substrate',
      'settings_configure_webui_api_key',
      'task_action_receipt_preview',
      'opl_pack_provision_submission_resource',
      'install_from_manifest_url',
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
    assert.deepEqual(actions.get('install_from_manifest_url')?.payload_fields, ['manifest_url', 'trust_tier']);
    assert.equal(actions.get('install_from_manifest_url')?.dry_run_supported, true);
    assert.equal(actions.get('install_from_manifest_url')?.confirmation_required, true);
    assert.equal(actions.has('refresh_registry'), false);
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
      'project_root',
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
    assert.equal(actions.get('settings_check_opl_base_update')?.delegated_surface, 'opl update check');
    assert.equal(actions.get('settings_check_opl_base_update')?.mutates, 'none_read_only');
    assert.equal(actions.get('settings_apply_opl_base_update')?.delegated_surface, 'opl update apply');
    assert.equal(actions.get('settings_apply_opl_base_update')?.mutates, 'opl_base_runtime_substrate');
    assert.equal(actions.get('settings_apply_opl_base_update')?.confirmation_required, true);
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

test('retired App action aliases cannot execute through the generic action shell', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-retired-scholarskills-'));
  try {
    for (const actionId of [
      'scholarskills_workspace_sync',
      'scholarskills_quest_sync',
      'agent_package_install_from_manifest_url',
      'agent_package_activate',
    ]) {
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
