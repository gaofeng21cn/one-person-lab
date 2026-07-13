import { assert, fs, os, parseJsonText, path, runCli, test } from '../../helpers.ts';
import { createWorkspaceDescriptorFamilyFixture } from '../workspace-domain-test-helper.ts';

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

test('app action execute owns settings, release channel, workspace root, and provider status actions', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-settings-home-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-workspace-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const descriptorFixture = createWorkspaceDescriptorFamilyFixture();

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
        developerSupervisorModuleId: 'medautoscience',
        developerSupervisorModuleSource: 'developer',
      }),
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_DEVELOPER_MODE_GH_FIXTURE: defaultDeveloperModePermissionsFixture,
    }).app_action_execution;

    assert.equal(developer.delegated_surface, 'opl system developer-supervisor');
    assert.equal(developer.result.system_action.action, 'developer_supervisor');
    assert.equal(developer.result.system_action.status, 'completed');
    assert.equal(
      developer.result.system_action.developer_supervisor.module_source_preferences.medautoscience,
      'developer',
    );

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
      OPL_FAMILY_WORKSPACE_ROOT: descriptorFixture.familyRoot,
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
      OPL_FAMILY_WORKSPACE_ROOT: descriptorFixture.familyRoot,
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
      OPL_FAMILY_WORKSPACE_ROOT: descriptorFixture.familyRoot,
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
    const magHealth = parseJsonText(fs.readFileSync(magHealthPath, 'utf8')) as any;
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
      OPL_FAMILY_WORKSPACE_ROOT: descriptorFixture.familyRoot,
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
      OPL_FAMILY_WORKSPACE_ROOT: descriptorFixture.familyRoot,
    }).app_action_execution;

    assert.equal(workspaceAdopt.delegated_surface, 'opl workspace adopt --dry-run');
    assert.equal(workspaceAdopt.result.workspace_adoption.write_allowed, false);
    assert.equal(workspaceAdopt.result.workspace_adoption.profile.profile_id, 'portfolio');

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
      OPL_FAMILY_WORKSPACE_ROOT: descriptorFixture.familyRoot,
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

    const refreshedMagHealth = parseJsonText(fs.readFileSync(magHealthPath, 'utf8')) as any;
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
    descriptorFixture.cleanup();
  }
});
