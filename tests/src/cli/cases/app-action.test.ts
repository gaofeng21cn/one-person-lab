import { assert, fs, os, path, runCli, test } from '../helpers.ts';

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
      'module_reinstall',
      'module_remove',
      'provider_scheduler_install',
      'provider_scheduler_trigger',
      'provider_scheduler_tick',
      'provider_worker_start',
      'provider_worker_restart',
      'workspace_initialize',
      'workspace_ensure',
    ]) {
      assert.ok(actions.has(actionId), `missing App action: ${actionId}`);
      assert.equal(actions.get(actionId)?.delegated_surface.startsWith('opl '), true);
    }
    assert.deepEqual(actions.get('module_update')?.payload_fields, ['module_id']);
    assert.equal(actions.get('module_update')?.route_requires_domain_or_app_payload, true);
    assert.equal(actions.get('module_update')?.can_submit_to_safe_action_shell, false);
    assert.deepEqual(actions.get('module_sync')?.payload_fields, ['module_id']);
    assert.equal(actions.get('module_sync')?.delegated_surface, 'opl module sync --module <module_id>');
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
    assert.deepEqual(actions.get('provider_scheduler_tick')?.payload_fields, ['force', 'limit', 'hydrate']);
    assert.equal(actions.get('provider_scheduler_tick')?.route_requires_domain_or_app_payload, true);
    assert.equal(actions.get('provider_scheduler_tick')?.can_submit_to_safe_action_shell, false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
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
      fs.statSync(path.join(workspaceRoot, 'nsfc-p2c', 'deliverables', 'grant-001', 'artifacts', 'stage_outputs')).isDirectory(),
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

    assert.equal(module.delegated_surface, 'opl module reinstall --module oplmetaagent');
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

    assert.equal(moduleSync.delegated_surface, 'opl module sync --module oplmetaagent');
    assert.equal(moduleSync.result.module_action.action, 'sync');
    assert.equal(moduleSync.result.module_action.status, 'dry_run');

    const scheduler = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'provider_scheduler_tick',
      '--payload',
      '{"force":true,"limit":3,"hydrate":false}',
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

    assert.equal(worker.delegated_surface, 'opl family-runtime worker restart --provider temporal');
    assert.equal(worker.result.family_runtime_worker_restart.status, 'dry_run');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
