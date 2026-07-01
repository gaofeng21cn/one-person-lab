import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';

const defaultDeveloperModePermissionsFixture = JSON.stringify({
  user: { login: 'gaofeng21cn' },
  permissions: {
    'gaofeng21cn/one-person-lab': 'admin',
    'gaofeng21cn/med-autoscience': 'write',
    'gaofeng21cn/med-autogrant': 'maintain',
    'gaofeng21cn/opl-meta-agent': 'write',
    'gaofeng21cn/redcube-ai': 'admin',
  },
});

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

test('app action catalog exposes Codex, module, and Temporal management actions', () => {
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
      'codex_install',
      'codex_update',
      'codex_reinstall',
      'codex_remove',
      'developer_supervisor_refresh',
      'module_install',
      'module_update',
      'module_sync',
      'scholarskills_workspace_sync',
      'scholarskills_quest_sync',
      'module_reinstall',
      'module_remove',
      'provider_scheduler_install',
      'provider_scheduler_trigger',
      'provider_scheduler_tick',
      'provider_worker_start',
      'provider_worker_restart',
      'workspace_initialize',
      'workspace_ensure',
      'workspace_validate',
      'workspace_doctor',
      'workspace_adopt_dry_run',
      'workspace_adopt_apply',
      'workspace_upgrade',
      'workspace_project_archive',
      'workspace_project_lifecycle',
      'workspace_project_pause',
      'workspace_project_resume',
      'workspace_project_lock',
      'workspace_project_supersede',
      'workspace_project_delete',
      'workspace_export_map',
      'workspace_inspect',
      'workspace_inventory',
      'workspace_health',
      'workspace_report',
      'workspace_fleet_report',
      'settings_repair_model_access',
      'settings_verify_workspace',
      'settings_sync_capabilities',
      'settings_apply_opl_packages',
      'settings_reload_codex_surface',
      'settings_check_app_update',
      'settings_prune_runtime_roots_dry_run',
      'settings_rollback_runtime_substrate',
      'settings_install_docker_webui',
      'settings_configure_webui_api_key',
      'settings_select_webui_seed',
      'settings_run_webui_startup_maintenance',
      'settings_open_docker_webui',
      'settings_diagnose_docker_webui',
      'task_action_receipt_preview',
    ]) {
      assert.ok(actions.has(actionId), `missing App action: ${actionId}`);
      const delegatedSurface = actions.get(actionId)?.delegated_surface ?? '';
      assert.equal(
        delegatedSurface.startsWith('opl ')
          || delegatedSurface.startsWith('printf <api-key> | opl ')
          || delegatedSurface.includes(' opl system startup-maintenance')
          || delegatedSurface === 'one-person-lab-app installation_carrier.macos_app status',
        true,
      );
    }
    assert.deepEqual(actions.get('module_update')?.payload_fields, ['module_id']);
    assert.equal(actions.get('module_update')?.route_requires_domain_or_app_payload, true);
    assert.equal(actions.get('module_update')?.can_submit_to_safe_action_shell, false);
    assert.deepEqual(actions.get('module_sync')?.payload_fields, []);
    assert.equal(actions.get('module_sync')?.delegated_surface, 'opl connect reconcile-modules');
    assert.deepEqual(actions.get('scholarskills_workspace_sync')?.payload_fields, ['workspace_root']);
    assert.equal(
      actions.get('scholarskills_workspace_sync')?.delegated_surface,
      'opl connect sync-skills --domain scholarskills --scope workspace --target-workspace <workspace_root>',
    );
    assert.equal(actions.get('scholarskills_workspace_sync')?.mutates, 'workspace_local_codex_skill');
    assert.equal(actions.get('scholarskills_workspace_sync')?.dry_run_supported, true);
    assert.equal(actions.get('scholarskills_workspace_sync')?.route_requires_domain_or_app_payload, true);
    assert.equal(actions.get('scholarskills_workspace_sync')?.can_submit_to_safe_action_shell, false);
    assert.deepEqual(actions.get('scholarskills_quest_sync')?.payload_fields, ['quest_root']);
    assert.equal(
      actions.get('scholarskills_quest_sync')?.delegated_surface,
      'opl connect sync-skills --domain scholarskills --scope quest --target-quest <quest_root>',
    );
    assert.equal(actions.get('scholarskills_quest_sync')?.mutates, 'quest_local_codex_skill');
    assert.equal(actions.get('scholarskills_quest_sync')?.dry_run_supported, true);
    assert.equal(actions.get('scholarskills_quest_sync')?.route_requires_domain_or_app_payload, true);
    assert.equal(actions.get('scholarskills_quest_sync')?.can_submit_to_safe_action_shell, false);
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
    assert.equal(actions.get('workspace_ensure')?.delegated_surface, 'opl workspace ensure');
    assert.equal(actions.get('workspace_ensure')?.dry_run_supported, true);
    assert.deepEqual(actions.get('workspace_ensure')?.payload_fields, [
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
    assert.equal(actions.get('workspace_doctor')?.delegated_surface, 'opl workspace doctor');
    assert.equal(actions.get('workspace_doctor')?.mutates, 'none_read_only');
    assert.deepEqual(actions.get('workspace_doctor')?.payload_fields, ['workspace_path']);
    assert.equal(actions.get('workspace_adopt_dry_run')?.delegated_surface, 'opl workspace adopt --dry-run');
    assert.equal(actions.get('workspace_adopt_dry_run')?.mutates, 'none_read_only');
    assert.equal(actions.get('workspace_adopt_dry_run')?.dry_run_supported, true);
    assert.equal(actions.get('workspace_adopt_apply')?.delegated_surface, 'opl workspace adopt --apply');
    assert.equal(actions.get('workspace_adopt_apply')?.mutates, 'opl_workspace_topology_projection');
    assert.equal(actions.get('workspace_upgrade')?.delegated_surface, 'opl workspace upgrade');
    assert.equal(actions.get('workspace_upgrade')?.mutates, 'opl_workspace_topology_projection');
    assert.equal(actions.get('workspace_project_archive')?.delegated_surface, 'opl workspace project archive');
    assert.equal(actions.get('workspace_project_archive')?.mutates, 'opl_workspace_project_lifecycle_projection');
    assert.equal(actions.get('workspace_project_lifecycle')?.delegated_surface, 'opl workspace project lifecycle');
    assert.deepEqual(actions.get('workspace_project_lifecycle')?.payload_fields, [
      'workspace_path',
      'project_id',
      'status',
      'reason',
      'superseded_by_project_id',
    ]);
    assert.equal(actions.get('workspace_project_pause')?.delegated_surface, 'opl workspace project lifecycle');
    assert.equal(actions.get('workspace_project_resume')?.delegated_surface, 'opl workspace project lifecycle');
    assert.equal(actions.get('workspace_project_lock')?.delegated_surface, 'opl workspace project lifecycle');
    assert.equal(actions.get('workspace_project_supersede')?.delegated_surface, 'opl workspace project lifecycle');
    assert.equal(actions.get('workspace_project_delete')?.delegated_surface, 'opl workspace project delete');
    assert.equal(actions.get('workspace_project_delete')?.mutates, 'none_read_only');
    assert.equal(actions.get('workspace_export_map')?.delegated_surface, 'opl workspace export-map');
    assert.equal(actions.get('workspace_export_map')?.mutates, 'none_read_only');
    assert.equal(actions.get('workspace_inspect')?.delegated_surface, 'opl workspace inspect');
    assert.equal(actions.get('workspace_inspect')?.mutates, 'none_read_only');
    assert.deepEqual(actions.get('workspace_inspect')?.payload_fields, ['workspace_path']);
    assert.equal(actions.get('workspace_inventory')?.delegated_surface, 'opl workspace inventory');
    assert.equal(actions.get('workspace_inventory')?.mutates, 'none_read_only');
    assert.deepEqual(actions.get('workspace_inventory')?.payload_fields, ['workspace_path']);
    assert.equal(actions.get('workspace_health')?.delegated_surface, 'opl workspace health');
    assert.equal(actions.get('workspace_health')?.mutates, 'none_read_only');
    assert.equal(actions.get('workspace_report')?.delegated_surface, 'opl workspace report');
    assert.equal(actions.get('workspace_report')?.mutates, 'none_read_only');
    assert.deepEqual(actions.get('workspace_report')?.payload_fields, ['workspace_path']);
    assert.equal(actions.get('workspace_fleet_report')?.delegated_surface, 'opl workspace fleet report');
    assert.equal(actions.get('workspace_fleet_report')?.mutates, 'none_read_only');
    assert.deepEqual(actions.get('workspace_fleet_report')?.payload_fields, []);
    assert.deepEqual(actions.get('provider_scheduler_tick')?.payload_fields, ['force', 'limit', 'hydrate', 'profile']);
    assert.equal(actions.get('provider_scheduler_tick')?.route_requires_domain_or_app_payload, true);
    assert.equal(actions.get('provider_scheduler_tick')?.can_submit_to_safe_action_shell, false);
    assert.equal(
      actions.get('task_action_receipt_preview')?.delegated_surface,
      'opl app action execute --action task_action_receipt_preview --dry-run',
    );
    assert.deepEqual(actions.get('task_action_receipt_preview')?.payload_fields, ['task_id', 'action_ref']);
    assert.equal(actions.get('task_action_receipt_preview')?.mutates, 'none_read_only');
    assert.equal(actions.get('task_action_receipt_preview')?.dry_run_supported, true);
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
    assert.equal(actions.get('settings_sync_capabilities')?.delegated_surface, 'opl connect reconcile-modules');
    assert.deepEqual(actions.get('settings_sync_capabilities')?.payload_fields, []);
    assert.equal(actions.get('settings_sync_capabilities')?.can_submit_to_safe_action_shell, true);
    assert.equal(actions.get('settings_apply_opl_packages')?.delegated_surface, 'opl connect update --module <all-default-modules>');
    assert.equal(
      actions.get('settings_reload_codex_surface')?.delegated_surface,
      'opl connect sync-skills --domain scholarskills --scope <workspace|quest>',
    );
    assert.deepEqual(actions.get('settings_reload_codex_surface')?.payload_fields, ['scope', 'target_path']);
    assert.equal(actions.get('settings_reload_codex_surface')?.route_requires_domain_or_app_payload, true);
    assert.equal(
      actions.get('settings_prune_runtime_roots_dry_run')?.delegated_surface,
      'opl app action execute --action settings_prune_runtime_roots_dry_run',
    );
    assert.equal(actions.get('settings_prune_runtime_roots_dry_run')?.mutates, 'none_read_only');
    assert.equal(
      actions.get('settings_check_app_update')?.delegated_surface,
      'one-person-lab-app installation_carrier.macos_app status',
    );
    assert.equal(actions.get('settings_check_app_update')?.mutates, 'none_read_only');
    assert.equal(
      actions.get('settings_rollback_runtime_substrate')?.delegated_surface,
      'opl update rollback --component runtime_substrate',
    );
    assert.deepEqual(actions.get('settings_rollback_runtime_substrate')?.payload_fields, ['receipt_ref']);
    assert.equal(actions.get('settings_rollback_runtime_substrate')?.danger_level, 'high');
    assert.equal(actions.get('settings_install_docker_webui')?.delegated_surface, 'opl install');
    assert.equal(actions.get('settings_install_docker_webui')?.confirmation_required, true);
    assert.equal(
      actions.get('settings_configure_webui_api_key')?.delegated_surface,
      'printf <api-key> | opl system configure-codex --api-key-stdin',
    );
    assert.deepEqual(actions.get('settings_configure_webui_api_key')?.payload_fields, []);
    assert.equal(actions.get('settings_configure_webui_api_key')?.danger_level, 'medium');
    assert.equal(
      actions.get('settings_select_webui_seed')?.delegated_surface,
      'OPL_IMAGE_MANIFEST_PATH=<manifest> OPL_IMAGE_SEED_DIR=<seed> opl system startup-maintenance --json',
    );
    assert.deepEqual(actions.get('settings_select_webui_seed')?.payload_fields, [
      'image_manifest_path',
      'image_seed_dir',
    ]);
    assert.equal(
      actions.get('settings_run_webui_startup_maintenance')?.delegated_surface,
      'opl system startup-maintenance',
    );
    assert.equal(
      actions.get('settings_open_docker_webui')?.delegated_surface,
      'opl system docker-webui doctor --json#docker_webui_doctor.browser.url',
    );
    assert.equal(actions.get('settings_open_docker_webui')?.mutates, 'none_read_only');
    assert.equal(actions.get('settings_diagnose_docker_webui')?.delegated_surface, 'opl system docker-webui doctor');
    assert.equal(actions.get('settings_diagnose_docker_webui')?.mutates, 'none_read_only');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('app action execute exposes ScholarSkills workspace sync as dry-run before mutating workspace skill path', () => {
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
          skill_sync: {
            status: string;
            domain_id: string;
            scope: string;
            target_workspace: string;
            target_skill_path: string;
            command: string;
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
      'opl connect sync-skills --domain scholarskills --scope workspace --target-workspace <workspace_root>',
    );
    assert.equal(output.app_action_execution.result.skill_sync.status, 'dry_run');
    assert.equal(output.app_action_execution.result.skill_sync.domain_id, 'scholarskills');
    assert.equal(output.app_action_execution.result.skill_sync.scope, 'workspace');
    assert.equal(output.app_action_execution.result.skill_sync.target_workspace, workspaceRoot);
    assert.equal(
      output.app_action_execution.result.skill_sync.target_skill_path,
      `${workspaceRoot}/.codex/skills/opl-scholarskills`,
    );
    assert.equal(
      output.app_action_execution.result.skill_sync.command,
      `opl connect sync-skills --domain scholarskills --scope workspace --target-workspace ${workspaceRoot} --json`,
    );
    assert.deepEqual(output.app_action_execution.result.skill_sync.authority_boundary, {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
      can_write_owner_receipt: false,
      can_write_paper_body: false,
      can_write_artifact_authority: false,
      can_authorize_publication_readiness: false,
    });
    assert.equal(fs.existsSync(path.join(workspaceRoot, '.codex', 'skills', 'opl-scholarskills')), false);
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'config.toml')), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('app action execute owns settings, release channel, workspace root, and provider status actions', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-settings-home-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const developer = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'developer_supervisor',
      '--payload',
      JSON.stringify({
        developerSupervisorEnabled: 'on',
        developerSupervisorMode: 'developer_apply_safe',
        developerSupervisorAutoEnableGithubLogin: 'gaofeng21cn',
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_DEVELOPER_MODE_GH_FIXTURE: defaultDeveloperModePermissionsFixture,
    }).app_action_execution;

    assert.equal(developer.delegated_surface, 'opl system developer-supervisor');
    assert.equal(developer.result.system_action.action, 'developer_supervisor');
    assert.equal(developer.result.system_action.status, 'completed');

    const channel = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'update_channel',
      '--payload',
      '{"channel":"preview"}',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(channel.delegated_surface, 'opl system update-channel');
    assert.equal(channel.result.system_action.update_channel, 'preview');

    const workspace = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_root_set',
      '--payload',
      JSON.stringify({ path: workspaceRoot }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(workspace.delegated_surface, 'opl workspace root set');
    assert.equal(workspace.result.workspace_root.selected_path, workspaceRoot);

    const workspaceInitialize = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_initialize',
      '--payload',
      JSON.stringify({
        agent_id: 'rca',
        workspace_root: workspaceRoot,
        workspace_id: 'visual-theme-a',
        project_id: 'deck-001',
      }),
      '--dry-run',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(workspaceInitialize.delegated_surface, 'opl workspace init');
    assert.equal(workspaceInitialize.result.workspace_initialization.dry_run, true);
    assert.equal(workspaceInitialize.result.workspace_initialization.agent.agent_id, 'rca');
    assert.equal(workspaceInitialize.result.workspace_initialization.interface_projection.mcp.tool_name, 'opl_workspace_ensure');
    assert.equal(workspaceInitialize.result.workspace_initialization.interface_projection.mcp.descriptor_only, true);
    assert.equal(workspaceInitialize.result.workspace_initialization.workspace_norm.norm_id, 'opl.agent_workspace_norm.v1');
    assert.equal(
      workspaceInitialize.result.workspace_initialization.workspace_norm.default_workspace_precondition.command,
      'opl workspace ensure',
    );

    const magWorkspace = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_initialize',
      '--payload',
      JSON.stringify({
        agent_id: 'mag',
        workspace_id: 'nsfc-p2c',
        project_id: 'grant-001',
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(magWorkspace.delegated_surface, 'opl workspace init');
    assert.equal(magWorkspace.result.workspace_initialization.dry_run, false);
    assert.equal(magWorkspace.result.workspace_initialization.binding.project_id, 'medautogrant');
    assert.equal(
      fs.statSync(path.join(workspaceRoot, 'nsfc-p2c', 'projects', 'grant-001', 'artifacts', 'stage_outputs')).isDirectory(),
      true,
    );

    const magEnsure = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_ensure',
      '--payload',
      JSON.stringify({
        agent_id: 'mag',
        project_id: 'grant-001',
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(magEnsure.delegated_surface, 'opl workspace ensure');
    assert.equal(magEnsure.result.workspace_initialization.action, 'ensure');
    assert.equal(magEnsure.result.workspace_initialization.ensure_status, 'reused_active_binding');
    assert.equal(magEnsure.result.workspace_initialization.binding.project_id, 'medautogrant');
    assert.equal(
      magEnsure.result.workspace_initialization.workspace_norm.default_workspace_precondition.app_action_id,
      'workspace_ensure',
    );
    assert.equal(magEnsure.result.workspace_initialization.workspace_norm.registry_policy.writes_opl_workspace_registry, true);

    const magHealthPath = path.join(workspaceRoot, 'nsfc-p2c', 'workspace_health.json');
    const magHealth = JSON.parse(fs.readFileSync(magHealthPath, 'utf8'));
    magHealth.status = 'blocked';
    fs.writeFileSync(magHealthPath, `${JSON.stringify(magHealth, null, 2)}\n`);

    const workspaceValidate = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_validate',
      '--payload',
      JSON.stringify({
        workspace_path: path.join(workspaceRoot, 'nsfc-p2c'),
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(workspaceValidate.delegated_surface, 'opl workspace validate');
    assert.equal(workspaceValidate.result.workspace_validation.status, 'passed_with_repairable_findings');
    assert.equal(
      workspaceValidate.result.workspace_validation.repairable_findings.some(
        (entry: { code: string }) => entry.code === 'workspace_health_drift',
      ),
      true,
    );
    assert.equal(workspaceValidate.result.workspace_validation.display_labels.project_unit, 'grant_project');

    const workspaceDoctor = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_doctor',
      '--payload',
      JSON.stringify({
        workspace_path: path.join(workspaceRoot, 'nsfc-p2c'),
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(workspaceDoctor.delegated_surface, 'opl workspace doctor');
    assert.equal(workspaceDoctor.result.workspace_doctor.status, 'repairable');
    assert.deepEqual(workspaceDoctor.result.workspace_doctor.blockers, []);
    assert.equal(
      workspaceDoctor.result.workspace_doctor.repairable_findings.some(
        (entry: { code: string }) => entry.code === 'workspace_health_drift',
      ),
      true,
    );

    const workspaceAdopt = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_adopt_dry_run',
      '--payload',
      JSON.stringify({
        agent_id: 'mas',
        workspace: path.join(workspaceRoot, 'dm-cvd'),
        study_id: 'DM002',
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(workspaceAdopt.delegated_surface, 'opl workspace adopt --dry-run');
    assert.equal(workspaceAdopt.result.workspace_adoption.write_allowed, false);
    assert.equal(workspaceAdopt.result.workspace_adoption.profile.profile_id, 'mas_portfolio');

    const workspaceAdoptApply = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_adopt_apply',
      '--payload',
      JSON.stringify({
        agent_id: 'rca',
        workspace: path.join(workspaceRoot, 'visual-theme-a'),
        project_id: 'deck-001',
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(workspaceAdoptApply.delegated_surface, 'opl workspace adopt --apply');
    assert.equal(workspaceAdoptApply.result.workspace_adoption.status, 'applied');

    const workspaceUpgrade = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_upgrade',
      '--payload',
      JSON.stringify({
        workspace_path: path.join(workspaceRoot, 'visual-theme-a'),
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(workspaceUpgrade.delegated_surface, 'opl workspace upgrade');
    assert.equal(workspaceUpgrade.result.workspace_upgrade.status, 'applied');

    const workspaceProjectArchive = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_project_archive',
      '--payload',
      JSON.stringify({
        workspace_path: path.join(workspaceRoot, 'visual-theme-a'),
        project_id: 'deck-001',
        reason: 'superseded',
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(workspaceProjectArchive.delegated_surface, 'opl workspace project archive');
    assert.equal(workspaceProjectArchive.result.workspace_project_archive.lifecycle.status, 'archived');

    const magProjectPause = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_project_pause',
      '--payload',
      JSON.stringify({
        workspace_path: path.join(workspaceRoot, 'nsfc-p2c'),
        project_id: 'grant-001',
        reason: 'waiting-for-user',
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(magProjectPause.delegated_surface, 'opl workspace project lifecycle');
    assert.equal(magProjectPause.result.workspace_project_pause.lifecycle.status, 'paused');
    assert.equal(magProjectPause.result.workspace_project_pause.lifecycle.pause_reason, 'waiting-for-user');

    const magProjectResume = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_project_resume',
      '--payload',
      JSON.stringify({
        workspace_path: path.join(workspaceRoot, 'nsfc-p2c'),
        project_id: 'grant-001',
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(magProjectResume.result.workspace_project_restore.lifecycle.status, 'active');

    const deleteGate = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_project_delete',
      '--payload',
      JSON.stringify({
        workspace_path: path.join(workspaceRoot, 'nsfc-p2c'),
        project_id: 'grant-001',
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(deleteGate.delegated_surface, 'opl workspace project delete');
    assert.equal(deleteGate.result.workspace_project_delete.status, 'blocked_owner_receipt_required');

    const workspaceMap = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_export_map',
      '--payload',
      JSON.stringify({
        workspace_path: path.join(workspaceRoot, 'visual-theme-a'),
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(workspaceMap.delegated_surface, 'opl workspace export-map');
    assert.equal(workspaceMap.result.workspace_map.projects[0].lifecycle.status, 'archived');

    const workspaceInspectAction = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_inspect',
      '--payload',
      JSON.stringify({
        workspace_path: path.join(workspaceRoot, 'visual-theme-a'),
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(workspaceInspectAction.delegated_surface, 'opl workspace inspect');
    assert.equal(workspaceInspectAction.result.workspace_inspection.current_project_id, 'deck-001');

    const workspaceInventoryAction = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_inventory',
      '--payload',
      JSON.stringify({
        workspace_path: path.join(workspaceRoot, 'visual-theme-a'),
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(workspaceInventoryAction.delegated_surface, 'opl workspace inventory');
    assert.equal(workspaceInventoryAction.result.workspace_resource_inventory.resources[0].domain_truth_owner, 'domain_agent');

    const workspaceHealthAction = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_health',
      '--payload',
      JSON.stringify({
        workspace_path: path.join(workspaceRoot, 'visual-theme-a'),
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(workspaceHealthAction.delegated_surface, 'opl workspace health');
    assert.equal(workspaceHealthAction.result.workspace_health.status, 'passed');

    const workspaceReportAction = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_report',
      '--payload',
      JSON.stringify({
        workspace_path: path.join(workspaceRoot, 'visual-theme-a'),
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(workspaceReportAction.delegated_surface, 'opl workspace report');
    assert.equal(workspaceReportAction.result.workspace_report.surface_kind, 'opl_workspace_report');
    assert.equal(workspaceReportAction.result.workspace_report.current_project.project_id, 'deck-001');

    const refreshedMagHealth = JSON.parse(fs.readFileSync(magHealthPath, 'utf8'));
    refreshedMagHealth.status = 'blocked';
    fs.writeFileSync(magHealthPath, `${JSON.stringify(refreshedMagHealth, null, 2)}\n`);

    const workspaceFleetReport = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'workspace_fleet_report',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
    }).app_action_execution;

    assert.equal(workspaceFleetReport.delegated_surface, 'opl workspace fleet report');
    assert.equal(workspaceFleetReport.result.workspace_fleet_report.status, 'repairable');
    assert.equal(workspaceFleetReport.result.workspace_fleet_report.summary.repairable_bindings_count >= 1, true);
    assert.equal(workspaceFleetReport.result.workspace_fleet_report.summary.blocked_bindings_count, 0);

    const provider = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'provider_scheduler_status',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).app_action_execution;

    assert.equal(provider.delegated_surface, 'opl family-runtime scheduler status --provider temporal');
    assert.equal(provider.result.family_runtime_scheduler_cadence.status, 'blocked_provider_not_ready');

    const developerRefresh = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'developer_supervisor_refresh',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_DEVELOPER_MODE_GH_FIXTURE: defaultDeveloperModePermissionsFixture,
    }).app_action_execution;

    assert.equal(developerRefresh.delegated_surface, 'opl system developer-supervisor');
    assert.equal(developerRefresh.result.system_action.action, 'developer_supervisor');
    assert.equal(developerRefresh.result.system_action.status, 'ready');
    assert.equal(developerRefresh.result.system_action.developer_supervisor.enabled, 'on');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('app action execute dry-runs Codex, module, scheduler, and worker actions from one boundary', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-dry-run-home-'));

  try {
    const env = {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'opl-state', 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    };

    const codex = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'codex_update',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(codex.delegated_surface, 'opl engine update --engine codex');
    assert.equal(codex.result.engine_action.status, 'dry_run');

    const developerRefresh = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'developer_supervisor_refresh',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(developerRefresh.delegated_surface, 'opl system developer-supervisor');
    assert.equal(developerRefresh.result.system_action.status, 'dry_run');

    const module = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'module_reinstall',
      '--payload',
      '{"module_id":"oplmetaagent"}',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(module.delegated_surface, 'opl connect reinstall --module oplmetaagent');
    assert.equal(module.result.module_action.status, 'dry_run');

    const moduleSync = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'module_sync',
      '--payload',
      '{"module_id":"oplmetaagent"}',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(moduleSync.delegated_surface, 'opl connect reconcile-modules');
    assert.equal(moduleSync.result.system_action.action, 'reconcile_modules');
    assert.equal(moduleSync.result.system_action.status, 'dry_run');

    const actionReceipt = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'task_action_receipt_preview',
      '--payload',
      '{"task_id":"medautoscience:study:002","action_ref":"app_state.operator.workbench.task_drilldowns.002.action_receipt"}',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(
      actionReceipt.delegated_surface,
      'opl app action execute --action task_action_receipt_preview --dry-run',
    );
    assert.equal(actionReceipt.result.task_action_receipt_preview.status, 'dry_run_refs_only');
    assert.equal(actionReceipt.result.task_action_receipt_preview.task_id, 'medautoscience:study:002');
    assert.equal(actionReceipt.result.task_action_receipt_preview.plan.required_mode, 'dry_run');
    assert.deepEqual(actionReceipt.result.task_action_receipt_preview.write_targets, []);
    assert.equal(actionReceipt.result.task_action_receipt_preview.risk.mutation_policy, 'no_writes_preview_only');
    assert.equal(
      actionReceipt.result.task_action_receipt_preview.expected_output.content_policy,
      'refs_only_no_action_receipt_body',
    );
    assert.equal(
      actionReceipt.result.task_action_receipt_preview.authority_boundary.can_create_owner_receipt,
      false,
    );
    assert.equal(
      actionReceipt.result.task_action_receipt_preview.authority_boundary.temporal_is_diagnostics_only,
      true,
    );

    const nonDryRunActionReceipt = runCliFailure([
      'app',
      'action',
      'execute',
      '--action',
      'task_action_receipt_preview',
      '--payload',
      '{"task_id":"medautoscience:study:002"}',
    ], env);

    assert.equal(nonDryRunActionReceipt.payload.error.code, 'cli_usage_error');
    assert.equal(nonDryRunActionReceipt.payload.error.details.required_mode, 'dry_run');
    assert.equal(nonDryRunActionReceipt.payload.error.details.can_create_owner_receipt, false);

    const scheduler = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'provider_scheduler_tick',
      '--payload',
      '{"force":true,"limit":3,"hydrate":false,"profile":"/tmp/dm-cvd.local.toml"}',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(scheduler.delegated_surface, 'opl family-runtime scheduler tick --provider temporal');
    assert.equal(scheduler.result.family_runtime_scheduler_tick.status, 'dry_run');
    assert.deepEqual(scheduler.result.family_runtime_scheduler_tick.command_preview, [
      'opl',
      'family-runtime',
      'scheduler',
      'tick',
      '--provider',
      'temporal',
      '--force',
      '--limit',
      '3',
      '--profile',
      '/tmp/dm-cvd.local.toml',
      '--no-hydrate',
    ]);

    const worker = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'provider_worker_restart',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(worker.delegated_surface, 'opl family-runtime repair --provider temporal');
    assert.equal(worker.result.family_runtime_provider.status, 'dry_run');

    const settingsRepair = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'settings_repair_model_access',
      '--payload',
      '{"developerSupervisorEnabled":"on","developerSupervisorMode":"developer_apply_safe"}',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(settingsRepair.delegated_surface, 'opl system developer-supervisor');
    assert.equal(settingsRepair.result.settings_control_center_action.status, 'dry_run');
    assert.equal(
      settingsRepair.result.settings_control_center_action.read_model_ref,
      'app_state.settings_control_center.app_settings_read_model',
    );
    assert.equal(settingsRepair.result.settings_control_center_action.taxonomy, 'settings.model_access.repair');
    assert.equal(settingsRepair.result.settings_control_center_action.confirmation_required, true);
    assert.equal(settingsRepair.result.settings_control_center_action.danger_level, 'medium');
    assert.equal(
      settingsRepair.result.settings_control_center_action.authority_boundary.can_write_domain_truth,
      false,
    );

    const settingsSync = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'settings_sync_capabilities',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(settingsSync.delegated_surface, 'opl connect reconcile-modules');
    assert.equal(settingsSync.result.settings_control_center_action.task_kind, 'sync');

    const settingsVerify = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'settings_verify_workspace',
      '--payload',
      '{"workspace_path":"/tmp/opl-workspace"}',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(settingsVerify.delegated_surface, 'opl workspace health');
    assert.equal(settingsVerify.result.settings_control_center_action.task_kind, 'verify');
    assert.deepEqual(settingsVerify.result.settings_control_center_action.payload_fields, ['workspace_path']);

    const settingsReload = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'settings_reload_codex_surface',
      '--payload',
      '{"scope":"workspace","target_path":"/tmp/opl-workspace"}',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(
      settingsReload.delegated_surface,
      'opl connect sync-skills --domain scholarskills --scope workspace --target-workspace <target_path>',
    );
    assert.deepEqual(settingsReload.result.settings_control_center_action.payload_fields, ['scope', 'target_path']);

    const appUpdate = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'settings_check_app_update',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(appUpdate.delegated_surface, 'one-person-lab-app installation_carrier.macos_app status');
    assert.equal(appUpdate.result.settings_control_center_action.task_kind, 'check');
    assert.equal(appUpdate.result.settings_control_center_action.mutates, 'none_read_only');
    assert.equal(appUpdate.result.installation_carrier_status.carrier_variant, 'installation_carrier.macos_app');
    assert.equal(appUpdate.result.installation_carrier_status.opl_update_apply_allowed, false);

    const cleanupPlan = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'settings_prune_runtime_roots_dry_run',
    ], env).app_action_execution;

    assert.equal(cleanupPlan.delegated_surface, 'opl settings control-center cleanup_plan --dry-run');
    assert.equal(cleanupPlan.result.settings_runtime_roots_cleanup_plan.status, 'dry_run_plan_only');
    assert.equal(cleanupPlan.result.settings_runtime_roots_cleanup_plan.authority_boundary.can_delete_runtime_roots, false);

    const rollbackPlan = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'settings_rollback_runtime_substrate',
      '--payload',
      '{"receipt_ref":"opl://managed-update/runtime_substrate/apply/example"}',
    ], env).app_action_execution;

    assert.equal(rollbackPlan.delegated_surface, 'opl update rollback --component runtime_substrate');
    assert.equal(rollbackPlan.result.settings_control_center_action.task_kind, 'rollback');
    assert.equal(rollbackPlan.result.settings_control_center_action.danger_level, 'high');
    assert.equal(
      rollbackPlan.result.settings_control_center_action.authority_boundary.can_write_runtime_queue,
      false,
    );

    const webuiInstall = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'settings_install_docker_webui',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(webuiInstall.delegated_surface, 'opl install --skip-gui-open');
    assert.equal(webuiInstall.result.settings_control_center_action.status, 'manual_command_preview');
    assert.deepEqual(webuiInstall.result.settings_control_center_action.command_preview, [
      'opl',
      'install',
      '--skip-gui-open',
      '--json',
    ]);

    const webuiApiKey = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'settings_configure_webui_api_key',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(webuiApiKey.delegated_surface, 'printf <api-key> | opl system configure-codex --api-key-stdin');
    assert.equal(webuiApiKey.result.settings_control_center_action.status, 'manual_command_preview');
    assert.equal(webuiApiKey.result.settings_control_center_action.authority_boundary.carries_api_key_secret, false);

    const webuiSeed = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'settings_select_webui_seed',
      '--payload',
      '{"image_manifest_path":"/opt/opl/image-manifest.json","image_seed_dir":"/opt/opl/seed"}',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(
      webuiSeed.delegated_surface,
      'OPL_IMAGE_MANIFEST_PATH=<manifest> OPL_IMAGE_SEED_DIR=<seed> opl system startup-maintenance --json',
    );
    assert.deepEqual(webuiSeed.result.settings_control_center_action.command_preview, [
      'OPL_IMAGE_MANIFEST_PATH=/opt/opl/image-manifest.json',
      'OPL_IMAGE_SEED_DIR=/opt/opl/seed',
      'opl',
      'system',
      'startup-maintenance',
      '--json',
    ]);

    const webuiStartup = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'settings_run_webui_startup_maintenance',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(webuiStartup.delegated_surface, 'opl system startup-maintenance');
    assert.equal(webuiStartup.result.settings_control_center_action.task_kind, 'repair');

    const webuiOpen = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'settings_open_docker_webui',
      '--dry-run',
    ], {
      ...env,
      AIONUI_PORT: '3000',
    }).app_action_execution;

    assert.equal(webuiOpen.delegated_surface, 'opl system docker-webui doctor --json#docker_webui_doctor.browser.url');
    assert.equal(webuiOpen.result.docker_webui_browser_entry.status, 'url_available');
    assert.equal(webuiOpen.result.docker_webui_browser_entry.browser_url, 'http://127.0.0.1:3000/');
    assert.equal(webuiOpen.result.docker_webui_browser_entry.authority_boundary.can_claim_runtime_ready, false);

    const webuiDoctor = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'settings_diagnose_docker_webui',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(webuiDoctor.delegated_surface, 'opl system docker-webui doctor');
    assert.equal(webuiDoctor.result.docker_webui_doctor.surface_kind, 'opl_docker_webui_doctor');
    assert.equal(webuiDoctor.result.docker_webui_doctor.authority_boundary.can_claim_runtime_ready, false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
