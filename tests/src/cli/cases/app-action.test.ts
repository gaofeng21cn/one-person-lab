import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';
import '../../connection-registry.test.ts';
import './app-action-cases/dry-run-actions.test.ts';
import './app-action-cases/connection-actions.test.ts';
import './app-action-cases/settings-and-workspace-actions.test.ts';

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
      'provider_scheduler_status',
      'workspace_initialize',
      'workspace_validate',
      'settings_sync_capabilities',
      'settings_check_app_update',
      'settings_rollback_runtime_substrate',
      'settings_configure_webui_api_key',
      'task_action_receipt_preview',
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
    assert.equal(
      actions.get('task_export_bundle_preview')?.delegated_surface,
      'opl app action execute --action task_export_bundle_preview --dry-run',
    );
    assert.deepEqual(actions.get('task_export_bundle_preview')?.payload_fields, ['task_id', 'export_bundle_ref']);
    assert.equal(actions.get('task_export_bundle_preview')?.mutates, 'none_read_only');
    assert.equal(actions.get('task_export_bundle_preview')?.dry_run_supported, true);
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

test('legacy ScholarSkills workspace action is a no-write Packages activation migration preview', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-scholarskills-home-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-scholarskills-workspace-'));

  try {
    const output = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'scholarskills_workspace_sync',
      '--payload',
      JSON.stringify({ workspace_root: workspaceRoot }),
      '--dry-run',
    ], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    }) as {
      app_action_execution: {
        action_id: string;
        dry_run: boolean;
        delegated_surface: string;
        result: {
          package_scope_activation: {
            status: string;
            package_id: string;
            scope: string;
            target_root: string;
            lifecycle_owner: string;
            automatic_on: string[];
            authority_boundary: {
              can_write_domain_truth: boolean;
              can_sign_owner_receipt: boolean;
              can_create_typed_blocker: boolean;
              can_write_runtime_queue: boolean;
              can_write_owner_receipt: boolean;
              can_write_paper_body: boolean;
              can_write_artifact_authority: boolean;
              can_authorize_publication_readiness: boolean;
            };
          };
        };
      };
    };

    assert.equal(output.app_action_execution.action_id, 'scholarskills_workspace_sync');
    assert.equal(output.app_action_execution.dry_run, true);
    assert.equal(
      output.app_action_execution.delegated_surface,
      'opl packages#scope_activation_transaction(workspace)',
    );
    const preview = output.app_action_execution.result.package_scope_activation;
    assert.equal(preview.status, 'compatibility_migration_preview');
    assert.equal(preview.package_id, 'med-autoscience');
    assert.equal(preview.scope, 'workspace');
    assert.equal(preview.target_root, workspaceRoot);
    assert.equal(preview.lifecycle_owner, 'opl_packages');
    assert.deepEqual(preview.automatic_on, ['workspace_activation', 'domain_launch']);
    assert.deepEqual(preview.authority_boundary, {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
      can_write_owner_receipt: false,
      can_write_paper_body: false,
      can_write_artifact_authority: false,
      can_authorize_publication_readiness: false,
    });
    assert.equal(fs.existsSync(path.join(workspaceRoot, '.codex', 'skills', 'mas-scholar-skills')), false);
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'config.toml')), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
