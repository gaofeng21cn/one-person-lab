import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';
import '../../connection-registry.test.ts';
import './app-action-cases/dry-run-actions.test.ts';
import './app-action-cases/connection-actions.test.ts';
import './app-action-cases/settings-and-workspace-actions.test.ts';

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
      'import json, os, pathlib, subprocess, sys',
      'action = sys.argv[1] if len(sys.argv) > 1 else "status"',
      'home = pathlib.Path(os.environ["HOME"])',
      'codex_home = pathlib.Path(os.environ.get("CODEX_HOME", home / ".codex"))',
      'codex_config = codex_home / "config.toml"',
      'codexcont_home = home / ".codexcont"',
      'codexcont_home.mkdir(parents=True, exist_ok=True)',
      'previous_base_url = "https://gflabtoken.cn/v1"',
      'proxy_base_url = "http://127.0.0.1:8787/v1"',
      'def run_uvx(*args):',
      '    subprocess.run(["uvx", "--from", "git+https://github.com/ZhenHuangLab/CodexCont", *args], check=False)',
      'def write_config(base_url):',
      '    text = codex_config.read_text() if codex_config.exists() else ""',
      '    lines = [line if not line.startswith("base_url = ") else f"base_url = \\"{base_url}\\"" for line in text.splitlines()]',
      '    codex_config.write_text("\\n".join(lines) + "\\n")',
      'def write_service():',
      '    mode = os.environ.get("OPL_CODEXCONT_SERVICE_MODE", "manual")',
      '    if mode == "systemd":',
      '        service_path = home / ".config" / "systemd" / "user" / "org.onepersonlab.codexcont.service"',
      '        service_path.parent.mkdir(parents=True, exist_ok=True)',
      '        service_path.write_text("[Unit]\\nDescription=CodexCont\\n[Service]\\nRestart=always\\n[Install]\\nWantedBy=default.target\\n")',
      '        return {"mode": "systemd", "definition_path": str(service_path), "persistence_policy": "systemd_user_service", "commands": [{"command": ["systemctl", "--user", "daemon-reload"]}, {"command": ["systemctl", "--user", "enable", "--now", "org.onepersonlab.codexcont.service"]}]}',
      '    foreground = codexcont_home / "opl-flow-codexcont-foreground.sh"',
      '    foreground.write_text("#!/bin/sh\\nexec codexcont start\\n")',
      '    return {"mode": "manual", "foreground_script": str(foreground), "persistence_policy": "manual_start_only"}',
      'if action == "enable":',
      '    write_config(proxy_base_url)',
      '    (codexcont_home / "config.toml").write_text(\'url = "https://gflabtoken.cn/v1/responses"\\n\')',
      '    (codexcont_home / "opl-flow-intelligence-enhancement.json").write_text(json.dumps({"previous_provider_base_url": previous_base_url}, indent=2))',
      '    run_uvx("codexcont", "install", "-y")',
      '    service = write_service()',
      '    if service["mode"] == "systemd":',
      '        run_uvx("codexcont", "stop")',
      '    else:',
      '        run_uvx("codexcont", "restart")',
      'elif action == "disable":',
      '    write_config(previous_base_url)',
      '    run_uvx("codexcont", "stop")',
      '    service = write_service()',
      'elif action == "repair":',
      '    run_uvx("codexcont", "restart")',
      '    service = write_service()',
      'else:',
      '    service = write_service()',
      'print(json.dumps({"opl_flow_intelligence_enhancement_action": {"status": "completed", "proxy_base_url": proxy_base_url, "status_readback": {"codex_provider_base_url": proxy_base_url, "service": service}, "service": service}}))',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return { scriptPath, installerPath };
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
      'intelligence_enhancement_enable',
      'module_sync',
      'scholarskills_workspace_sync',
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
          || delegatedSurface.startsWith('opl flow intelligence-enhancement ')
          || delegatedSurface.includes(' opl system startup-maintenance'),
        true,
      );
    }
    assert.deepEqual(actions.get('module_sync')?.payload_fields, []);
    assert.equal(actions.get('module_sync')?.delegated_surface, 'opl update apply --component capability_packages');
    assert.deepEqual(actions.get('scholarskills_workspace_sync')?.payload_fields, ['workspace_root']);
    assert.equal(
      actions.get('scholarskills_workspace_sync')?.delegated_surface,
      'opl connect sync-skills --domain mas-scholar-skills --scope workspace --target-workspace <workspace_root>',
    );
    assert.equal(actions.get('scholarskills_workspace_sync')?.mutates, 'workspace_local_codex_skill');
    assert.equal(actions.get('scholarskills_workspace_sync')?.dry_run_supported, true);
    assert.equal(actions.get('scholarskills_workspace_sync')?.route_requires_domain_or_app_payload, true);
    assert.equal(actions.get('scholarskills_workspace_sync')?.can_submit_to_safe_action_shell, false);
    assert.equal(actions.get('provider_scheduler_status')?.submit_via, 'opl app action execute');
    assert.equal(actions.get('provider_scheduler_status')?.execution_policy, 'opl_safe_action_shell');
    assert.equal(actions.get('provider_scheduler_status')?.route_requires_domain_or_app_payload, false);
    assert.equal(actions.get('provider_scheduler_status')?.can_submit_to_safe_action_shell, true);
    assert.equal(actions.get('provider_scheduler_status')?.dry_run_supported, true);
    assert.equal(actions.get('provider_scheduler_status')?.route, 'opl app action execute --action provider_scheduler_status');
    assert.equal(
      actions.get('intelligence_enhancement_status')?.delegated_surface,
      'opl flow intelligence-enhancement status',
    );
    assert.equal(actions.get('intelligence_enhancement_status')?.mutates, 'none_read_only');
    assert.equal(
      actions.get('intelligence_enhancement_enable')?.delegated_surface,
      'opl flow intelligence-enhancement enable',
    );
    assert.equal(actions.get('intelligence_enhancement_enable')?.mutates, 'local_codex_config_and_codexcont_proxy');
    assert.equal(actions.get('intelligence_enhancement_enable')?.rollback_action_id, 'intelligence_enhancement_disable');
    assert.equal(actions.get('intelligence_enhancement_enable')?.verify_action_id, 'intelligence_enhancement_status');
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
    assert.equal(actions.get('settings_sync_capabilities')?.delegated_surface, 'opl update apply --component capability_packages');
    assert.deepEqual(actions.get('settings_sync_capabilities')?.payload_fields, []);
    assert.equal(actions.get('settings_sync_capabilities')?.can_submit_to_safe_action_shell, true);
    assert.equal(
      actions.get('settings_check_app_update')?.delegated_surface,
      'opl update status --component installation_carrier',
    );
    assert.equal(actions.get('settings_check_app_update')?.mutates, 'none_read_only');
    assert.equal(
      actions.get('settings_rollback_runtime_substrate')?.delegated_surface,
      'opl update rollback --component runtime_substrate',
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
      'opl connect sync-skills --domain mas-scholar-skills --scope workspace --target-workspace <workspace_root>',
    );
    assert.equal(output.app_action_execution.result.skill_sync.status, 'dry_run');
    assert.equal(output.app_action_execution.result.skill_sync.domain_id, 'scholarskills');
    assert.equal(output.app_action_execution.result.skill_sync.scope, 'workspace');
    assert.equal(output.app_action_execution.result.skill_sync.target_workspace, workspaceRoot);
    assert.equal(
      output.app_action_execution.result.skill_sync.target_skill_path,
      `${workspaceRoot}/.codex/skills/mas-scholar-skills`,
    );
    assert.equal(
      output.app_action_execution.result.skill_sync.command,
      `opl connect sync-skills --domain mas-scholar-skills --scope workspace --target-workspace ${workspaceRoot} --json`,
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
    assert.equal(fs.existsSync(path.join(workspaceRoot, '.codex', 'skills', 'mas-scholar-skills')), false);
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'config.toml')), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('app action execute enables and disables CodexCont intelligence enhancement through OPL Flow', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-codexcont-home-'));
  const binDir = path.join(homeRoot, 'bin');
  const uvxLog = path.join(homeRoot, 'uvx.log');
  const codexHome = path.join(homeRoot, '.codex');
  const codexConfig = path.join(codexHome, 'config.toml');

  try {
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(
      path.join(binDir, 'uvx'),
      [
        '#!/bin/sh',
        `printf '%s\\n' "$*" >> ${JSON.stringify(uvxLog)}`,
        'exit 0',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      codexConfig,
      [
        'model_provider = "gflab"',
        'model = "gpt-5.5"',
        '',
        '[model_providers.gflab]',
        'name = "gflab"',
        'base_url = "https://gflabtoken.cn/v1"',
        'wire_api = "responses"',
        '',
      ].join('\n'),
      'utf8',
    );
    const flowFixture = writeOplFlowIntelligenceEnhancementFixture(homeRoot);

    const env = {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_CODEXCONT_SERVICE_MODE: 'manual',
      OPL_CODEXCONT_SERVICE_SKIP: '1',
      OPL_FLOW_INSTALLER_SCRIPT: flowFixture.installerPath,
      PATH: `${binDir}:/usr/bin:/bin`,
    };

    const enable = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'intelligence_enhancement_enable',
    ], env).app_action_execution;

    assert.equal(enable.delegated_surface, 'opl flow intelligence-enhancement enable');
    assert.equal(enable.result.opl_flow_intelligence_enhancement_action.status, 'completed');
    assert.equal(
      enable.result.opl_flow_intelligence_enhancement_action.status_readback.codex_provider_base_url,
      'http://127.0.0.1:8787/v1',
    );
    assert.match(fs.readFileSync(codexConfig, 'utf8'), /base_url = "http:\/\/127\.0\.0\.1:8787\/v1"/);
    assert.match(
      fs.readFileSync(path.join(homeRoot, '.codexcont', 'config.toml'), 'utf8'),
      /url = "https:\/\/gflabtoken\.cn\/v1\/responses"/,
    );
    assert.match(
      fs.readFileSync(path.join(homeRoot, '.codexcont', 'opl-flow-intelligence-enhancement.json'), 'utf8'),
      /"previous_provider_base_url": "https:\/\/gflabtoken\.cn\/v1"/,
    );
    assert.equal(
      enable.result.opl_flow_intelligence_enhancement_action.status_readback.service.persistence_policy,
      'manual_start_only',
    );
    assert.equal(
      fs.existsSync(path.join(homeRoot, '.codexcont', 'opl-flow-codexcont-foreground.sh')),
      true,
    );

    const repair = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'intelligence_enhancement_repair',
    ], env).app_action_execution;

    assert.equal(repair.delegated_surface, 'opl flow intelligence-enhancement repair');
    assert.equal(repair.result.opl_flow_intelligence_enhancement_action.status, 'completed');

    const disable = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'intelligence_enhancement_disable',
    ], env).app_action_execution;

    assert.equal(disable.delegated_surface, 'opl flow intelligence-enhancement disable');
    assert.equal(disable.result.opl_flow_intelligence_enhancement_action.status, 'completed');
    assert.match(fs.readFileSync(codexConfig, 'utf8'), /base_url = "https:\/\/gflabtoken\.cn\/v1"/);
    assert.match(fs.readFileSync(uvxLog, 'utf8'), /codexcont install -y/);
    assert.match(fs.readFileSync(uvxLog, 'utf8'), /codexcont restart/);
    assert.match(fs.readFileSync(uvxLog, 'utf8'), /codexcont stop/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('app action execute delegates to the installed OPL Flow script without reapplying the plugin', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-opl-flow-preflight-'));
  const flowRoot = path.join(homeRoot, 'opl-flow-source');
  const scriptPath = path.join(flowRoot, 'scripts', 'intelligence_enhancement.py');
  const userProfilePath = path.join(homeRoot, '.codex', 'AGENTS.md');

  try {
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.mkdirSync(path.dirname(userProfilePath), { recursive: true });
    fs.writeFileSync(userProfilePath, 'user profile must stay intact\n', 'utf8');
    fs.writeFileSync(
      scriptPath,
      [
        '#!/usr/bin/env python3',
        'import json',
        'print(json.dumps({"opl_flow_intelligence_enhancement": {"status": "disabled", "script_installed": True}}))',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );

    const status = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'intelligence_enhancement_status',
    ], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, '.codex'),
      OPL_FLOW_REPO_ROOT: flowRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      PATH: '/usr/bin:/bin',
    }).app_action_execution;

    assert.equal(status.delegated_surface, 'opl flow intelligence-enhancement status');
    assert.equal(status.result.opl_flow_intelligence_enhancement.status, 'disabled');
    assert.equal(fs.readFileSync(userProfilePath, 'utf8'), 'user profile must stay intact\n');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('app action execute installs CodexCont as a Linux systemd user service when requested', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-action-codexcont-systemd-home-'));
  const binDir = path.join(homeRoot, 'bin');
  const uvxLog = path.join(homeRoot, 'uvx.log');
  const codexHome = path.join(homeRoot, '.codex');
  const codexConfig = path.join(codexHome, 'config.toml');

  try {
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(
      path.join(binDir, 'uvx'),
      [
        '#!/bin/sh',
        `printf '%s\\n' "$*" >> ${JSON.stringify(uvxLog)}`,
        'exit 0',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      codexConfig,
      [
        'model_provider = "gflab"',
        '',
        '[model_providers.gflab]',
        'name = "gflab"',
        'base_url = "https://gflabtoken.cn/v1"',
        'wire_api = "responses"',
        '',
      ].join('\n'),
      'utf8',
    );
    const flowFixture = writeOplFlowIntelligenceEnhancementFixture(homeRoot);

    const enable = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'intelligence_enhancement_enable',
    ], {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_CODEXCONT_SERVICE_MODE: 'systemd',
      OPL_CODEXCONT_SERVICE_SKIP: '1',
      OPL_FLOW_INSTALLER_SCRIPT: flowFixture.installerPath,
      PATH: `${binDir}:/usr/bin:/bin`,
    }).app_action_execution;

    const service = enable.result.opl_flow_intelligence_enhancement_action.service;
    assert.equal(service.mode, 'systemd');
    assert.equal(
      service.definition_path,
      path.join(homeRoot, '.config', 'systemd', 'user', 'org.onepersonlab.codexcont.service'),
    );
    assert.match(fs.readFileSync(service.definition_path, 'utf8'), /Restart=always/);
    assert.match(fs.readFileSync(service.definition_path, 'utf8'), /WantedBy=default\.target/);
    assert.deepEqual(service.commands.map((command: { command: string[] }) => command.command), [
      ['systemctl', '--user', 'daemon-reload'],
      ['systemctl', '--user', 'enable', '--now', 'org.onepersonlab.codexcont.service'],
    ]);
    assert.match(fs.readFileSync(uvxLog, 'utf8'), /codexcont install -y/);
    assert.match(fs.readFileSync(uvxLog, 'utf8'), /codexcont stop/);
    assert.doesNotMatch(fs.readFileSync(uvxLog, 'utf8'), /codexcont restart/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
