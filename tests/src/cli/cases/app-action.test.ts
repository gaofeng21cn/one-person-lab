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
    ]) {
      assert.ok(actions.has(actionId), `missing App action: ${actionId}`);
      assert.equal(actions.get(actionId)?.delegated_surface.startsWith('opl '), true);
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
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
