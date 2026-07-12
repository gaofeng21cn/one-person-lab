import { assert, fs, os, path, runCli, runCliFailure, test } from '../../helpers.ts';

function writeOplFlowIntelligenceEnhancementFixture(homeRoot: string) {
  const scriptPath = path.join(homeRoot, 'plugins', 'opl-flow', 'scripts', 'intelligence_enhancement.py');
  const installerPath = path.join(homeRoot, 'plugins', 'opl-flow', 'scripts', 'install_local_plugin.py');
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(
    installerPath,
    'import json\nprint(json.dumps({"surface_kind": "opl_flow_plugin_install_receipt.v1", "status": "installed"}))\n',
    'utf8',
  );
  fs.writeFileSync(
    scriptPath,
    [
      '#!/usr/bin/env python3',
      'import json',
      'print(json.dumps({"opl_flow_intelligence_enhancement_action": {"status": "dry_run", "proxy_base_url": "http://127.0.0.1:8787/v1", "authority_boundary": {"owner": "opl_flow", "can_write_domain_truth": False, "can_authorize_release_ready": False, "shell_must_not_edit_configs_directly": True}}}))',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return installerPath;
}

test('app action execute dry-runs Codex, module, scheduler, and worker actions from one boundary', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-dry-run-home-'));

  try {
    const flowInstaller = writeOplFlowIntelligenceEnhancementFixture(homeRoot);

    const env = {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'opl-state', 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      OPL_FLOW_INSTALLER_SCRIPT: flowInstaller,
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

    const intelligenceEnhancement = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'intelligence_enhancement_enable',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(intelligenceEnhancement.delegated_surface, 'opl flow intelligence-enhancement enable');
    assert.equal(
      intelligenceEnhancement.result.opl_flow_intelligence_enhancement_action.status,
      'dry_run',
    );
    assert.equal(
      intelligenceEnhancement.result.opl_flow_intelligence_enhancement_action.proxy_base_url,
      'http://127.0.0.1:8787/v1',
    );
    assert.deepEqual(
      intelligenceEnhancement.result.opl_flow_intelligence_enhancement_action.authority_boundary,
      {
        owner: 'opl_flow',
        can_write_domain_truth: false,
        can_authorize_release_ready: false,
        shell_must_not_edit_configs_directly: true,
      },
    );

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

    const capabilityModule = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'module_install',
      '--payload',
      '{"module_id":"scholarskills"}',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(capabilityModule.delegated_surface, 'opl connect install --module scholarskills');
    assert.equal(capabilityModule.result.module_action.module_id, 'scholarskills');

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

    assert.equal(moduleSync.delegated_surface, 'opl update apply --component capability_packages');
    assert.equal(moduleSync.result.managed_update.operation, 'plan');
    assert.equal(moduleSync.result.managed_update.components[0].component_id, 'capability_packages');

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

    const exportBundle = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'task_export_bundle_preview',
      '--payload',
      '{"task_id":"medautoscience:study:002","export_bundle_ref":"opl://domains/medautoscience/tasks/002/export-bundles/latest"}',
      '--dry-run',
    ], env).app_action_execution;

    assert.equal(
      exportBundle.delegated_surface,
      'opl app action execute --action task_export_bundle_preview --dry-run',
    );
    assert.equal(exportBundle.result.task_export_bundle_preview.status, 'dry_run_refs_only');
    assert.equal(exportBundle.result.task_export_bundle_preview.task_id, 'medautoscience:study:002');
    assert.equal(exportBundle.result.task_export_bundle_preview.plan.required_mode, 'dry_run');
    assert.deepEqual(exportBundle.result.task_export_bundle_preview.write_targets, []);
    assert.equal(
      exportBundle.result.task_export_bundle_preview.expected_output.content_policy,
      'refs_only_no_export_bundle_body',
    );
    assert.equal(
      exportBundle.result.task_export_bundle_preview.authority_boundary.can_generate_domain_export_bundle,
      false,
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

    const nonDryRunExportBundle = runCliFailure([
      'app',
      'action',
      'execute',
      '--action',
      'task_export_bundle_preview',
      '--payload',
      '{"task_id":"medautoscience:study:002"}',
    ], env);

    assert.equal(nonDryRunExportBundle.payload.error.code, 'cli_usage_error');
    assert.equal(nonDryRunExportBundle.payload.error.details.required_mode, 'dry_run');
    assert.equal(nonDryRunExportBundle.payload.error.details.can_generate_domain_export_bundle, false);

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

    assert.equal(settingsSync.delegated_surface, 'opl update apply --component capability_packages');
    assert.equal(settingsSync.result.settings_control_center_action.task_kind, 'sync');
    assert.equal(settingsSync.result.settings_control_center_action.confirmation_required, false);
    assert.equal(settingsSync.result.settings_control_center_action.danger_level, 'low');
    assert.equal(settingsSync.result.managed_update.components[0].component_id, 'capability_packages');

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
      'opl connect sync-skills --domain mas-scholar-skills --scope workspace --target-workspace <target_path>',
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

    assert.equal(appUpdate.delegated_surface, 'opl update status --component installation_carrier');
    assert.equal(appUpdate.result.settings_control_center_action.task_kind, 'check');
    assert.equal(appUpdate.result.settings_control_center_action.mutates, 'none_read_only');
    assert.equal(appUpdate.result.managed_update.components[0].component_id, 'installation_carrier');
    assert.equal(appUpdate.result.managed_update.components[0].coordination_role, 'owner_handoff');
    assert.equal(appUpdate.result.managed_update.components[0].current.managed_kernel_apply_allowed, false);

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

    assert.equal(
      rollbackPlan.delegated_surface,
      'opl update rollback --component runtime_substrate', // reuse-first: allow owner-routed update command registry metadata.
    );
    assert.equal(
      rollbackPlan.result.settings_control_center_action.task_kind,
      'rollback', // reuse-first: allow owner-routed update command registry metadata.
    );
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

    assert.equal(webuiInstall.delegated_surface, 'opl install --headless');
    assert.equal(webuiInstall.result.settings_control_center_action.status, 'manual_command_preview');
    assert.deepEqual(webuiInstall.result.settings_control_center_action.command_preview, [
      'opl',
      'install',
      '--headless',
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
