import { spawnSync } from 'node:child_process';

import { FrameworkContractError, PassThrough, assert, buildManifestCommand, buildProjectProgressBrief, cliPath, contractsDir, createCodexConfigFixture, createContractsFixtureRoot, createFakeCodexFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createFakeShellCommandFixture, createFamilyContractsFixtureRoot, createFamilyLocatorResolverFixture, createGitModuleRemoteFixture, createMasWorkspaceFixture, explainDomainBoundary, familyManifestFixtureDir, fs, loadFamilyManifestFixtures, loadFrameworkContracts, once, os, path, readJsonFixture, readJsonLine, repoRoot, resolveRequestSurface, runCli, runCliAsync, runCliFailure, runCliFailureInCwd, runCliInCwd, runCliRaw, runCliViaEntryPathInCwd, shellSingleQuote, spawn, startCliServer, startFakeOplApiServer, stopCliPipeChild, stopCliServer, stopHttpServer, test, validateFrameworkContracts, writeJsonLine, assertContractsContext, assertNoContractsProvenance, assertMagActionGraph, assertMasActionGraph, assertRedcubeActionGraph } from '../helpers.ts';
import { buildInternalCommandSpecs } from '../../../../src/cli/cases/private-command-specs.ts';
import { buildPublicCommandSpecs } from '../../../../src/cli/cases/public-command-specs.ts';
import { resolveEngineActionSpec } from '../../../../src/system-installation/engine-helpers.ts';

function createManagedDomainModuleFixtures(modulesRoot: string) {
  for (const repoName of ['med-autoscience', 'med-deepscientist', 'med-autogrant', 'redcube-ai']) {
    const repoPath = path.join(modulesRoot, repoName);
    fs.mkdirSync(repoPath, { recursive: true });
    const result = spawnSync('git', ['init', '-q'], {
      cwd: repoPath,
      encoding: 'utf8',
      env: { ...process.env, HOME: modulesRoot },
    });
    assert.equal(result.status, 0, result.stderr);
  }
}

test('help keeps GUI lane on AionUI without Product API service commands', () => {
  const output = runCli(['help']);
  assert.equal(output.help.commands.some((entry: { command: string }) => entry.command === 'web'), false);
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'service install'),
    false,
  );
  assert.equal(output.help.commands.some((entry: { command: string }) => entry.command === 'web bundle'), false);
  assert.equal(output.help.commands.some((entry: { command: string }) => entry.command === 'web package'), false);
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'product entry bootstrap'),
    false,
  );
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'product entry manifest'),
    false,
  );
});

test('system exposes user-facing engine and managed-path status from OPL defaults', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-environment-home-'));
  const codexConfigFixture = createCodexConfigFixture({
    model: 'gpt-5.4-opl',
    reasoningEffort: 'high',
    baseUrl: 'https://codex-opl.example.test/v1',
    apiKey: 'codex-opl-key',
  });
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['system'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      },
    ) as {
      system: {
        surface_id: string;
        overall_status: string;
        core_engines: {
          codex: {
            installed: boolean;
            version: string | null;
            parsed_version: string | null;
            minimum_version: string;
            version_status: string;
            config_path: string | null;
            default_model: string | null;
            default_reasoning_effort: string | null;
            provider_base_url: string | null;
            health_status: string;
            issues: string[];
            diagnostics: string[];
          };
          family_runtime_provider: {
            provider_kind: string;
            health_status: string;
            status: string;
            degraded_reason: string | null;
            details: {
              worker_ready: boolean;
            };
          };
        };
        native_helpers: {
          health_status: string;
          lifecycle: {
            status: string;
            commands: {
              repair: string;
            };
          };
          runtime: {
            status: string;
            discovery: {
              repair_command: string;
            };
          };
          issues: string[];
        };
        gui_shell: {
          strategy: string;
          service_dependency: string;
          local_product_api_retired: boolean;
        };
        managed_paths: {
          state_dir: string;
          modules_root: string;
          runtime_modes_file: string;
          workspace_registry_file: string;
        };
      };
    };

    assert.equal(output.system.surface_id, 'opl_system');
    assert.equal(output.system.overall_status, 'attention_needed');
    assert.equal(output.system.core_engines.codex.installed, true);
    assert.equal(output.system.core_engines.codex.version, 'codex-cli 0.125.0');
    assert.equal(output.system.core_engines.codex.parsed_version, '0.125.0');
    assert.equal(output.system.core_engines.codex.minimum_version, '0.125.0');
    assert.equal(output.system.core_engines.codex.version_status, 'compatible');
    assert.equal(
      output.system.core_engines.codex.config_path,
      codexConfigFixture.configPath,
    );
    assert.equal(output.system.core_engines.codex.default_model, 'gpt-5.4-opl');
    assert.equal(output.system.core_engines.codex.default_reasoning_effort, 'high');
    assert.equal(
      output.system.core_engines.codex.provider_base_url,
      'https://codex-opl.example.test/v1',
    );
    assert.equal(output.system.core_engines.codex.health_status, 'ready');
    assert.deepEqual(output.system.core_engines.codex.issues, []);
    assert.deepEqual(output.system.core_engines.codex.diagnostics, []);
    assert.equal(Object.hasOwn(output.system.core_engines, 'hermes'), false);
    assert.equal(output.system.core_engines.family_runtime_provider.provider_kind, 'temporal');
    assert.equal(output.system.core_engines.family_runtime_provider.health_status, 'attention_needed');
    assert.equal(output.system.core_engines.family_runtime_provider.status, 'provider_code_landed_unconfigured');
    assert.equal(output.system.core_engines.family_runtime_provider.degraded_reason, 'temporal_runtime_not_configured');
    assert.equal(output.system.core_engines.family_runtime_provider.details.worker_ready, false);
    assert.equal(output.system.native_helpers.lifecycle.status, 'ready_to_build');
    assert.equal(output.system.native_helpers.lifecycle.commands.repair, 'npm run native:repair');
    assert.equal(output.system.native_helpers.runtime.discovery.repair_command, 'npm run native:repair');
    assert.equal(['ready', 'attention_needed'].includes(output.system.native_helpers.health_status), true);
    assert.equal(Array.isArray(output.system.native_helpers.issues), true);
    assert.equal(output.system.gui_shell.strategy, 'aionui_remote_webui');
    assert.equal(output.system.gui_shell.service_dependency, 'none');
    assert.equal(output.system.gui_shell.local_product_api_retired, true);
    assert.match(
      output.system.managed_paths.state_dir,
      /Library\/Application Support\/OPL\/state$/,
    );
    assert.match(
      output.system.managed_paths.modules_root,
      /Library\/Application Support\/OPL\/state\/modules$/,
    );
    assert.match(
      output.system.managed_paths.runtime_modes_file,
      /runtime-modes\.json$/,
    );
    assert.match(
      output.system.managed_paths.workspace_registry_file,
      /workspace-registry\.json$/,
    );
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system flags outdated Codex CLI versions as attention needed', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-outdated-codex-home-'));
  const codexConfigFixture = createCodexConfigFixture({
    model: 'gpt-5.5',
    reasoningEffort: 'xhigh',
    baseUrl: 'https://codex-opl.example.test/v1',
    apiKey: 'codex-opl-key',
  });
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.121.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['system'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      },
    ) as {
      system: {
        overall_status: string;
        core_engines: {
          codex: {
            installed: boolean;
            version: string | null;
            parsed_version: string | null;
            minimum_version: string;
            version_status: string;
            health_status: string;
            issues: string[];
          };
        };
      };
    };

    assert.equal(output.system.overall_status, 'attention_needed');
    assert.equal(output.system.core_engines.codex.installed, true);
    assert.equal(output.system.core_engines.codex.version, 'codex-cli 0.121.0');
    assert.equal(output.system.core_engines.codex.parsed_version, '0.121.0');
    assert.equal(output.system.core_engines.codex.minimum_version, '0.125.0');
    assert.equal(output.system.core_engines.codex.version_status, 'outdated');
    assert.equal(output.system.core_engines.codex.health_status, 'attention_needed');
    assert.deepEqual(output.system.core_engines.codex.issues, ['codex_cli_version_outdated']);
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system treats a compatible Codex CLI as ready even before reading a local config file', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-no-config-home-'));
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['system'],
      {
        HOME: homeRoot,
        CODEX_HOME: path.join(homeRoot, 'codex-home'),
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      },
    ) as {
      system: {
        core_engines: {
          codex: {
            installed: boolean;
            config_path: string | null;
            config_status: string;
            health_status: string;
            issues: string[];
          };
        };
      };
    };

    assert.equal(output.system.core_engines.codex.installed, true);
    assert.equal(output.system.core_engines.codex.config_path, null);
    assert.equal(output.system.core_engines.codex.config_status, 'not_detected');
    assert.equal(output.system.core_engines.codex.health_status, 'ready');
    assert.deepEqual(output.system.core_engines.codex.issues, []);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system initialize aggregates environment modules settings workspace and system surfaces', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-root-'));
  const codexConfigFixture = createCodexConfigFixture({
    model: 'gpt-5.4-opl',
    reasoningEffort: 'high',
    baseUrl: 'https://codex-opl.example.test/v1',
    apiKey: 'codex-opl-key',
  });
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['system', 'initialize'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        OPL_STATE_DIR: stateDir,
        OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
        OPL_WORKSPACE_ROOT: workspaceRoot,
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      },
    ) as {
      system_initialize: {
        surface_id: string;
        overall_state: string;
        setup_flow: {
          is_first_run: boolean;
          phase: string;
          ready_to_launch: boolean;
          blocking_items: string[];
          progress: {
            ready_required_count: number;
            total_required_count: number;
            ready_optional_count: number;
            total_optional_count: number;
          };
        };
        module_summary: {
          installed_modules_count: number;
          total_modules_count: number;
        };
        core_engines: {
          codex: { installed: boolean };
        };
        native_helpers: {
          health_status: string;
          lifecycle: {
            commands: {
              repair: string;
            };
          };
        };
        checklist: Array<{
          item_id: string;
          required: boolean;
          blocking: boolean;
          status: string;
          action: {
            action_id: string;
            payload_template: Record<string, string> | null;
          } | null;
        }>;
        domain_modules: {
          summary: {
            installed_modules_count: number;
            total_modules_count: number;
          };
          modules_root: string;
          notes: string[];
          modules: Array<{ module_id: string }>;
        };
        settings: {
          interaction_mode: string;
          execution_mode: string;
        };
        workspace_root: {
          selected_path: string | null;
          health_status: string;
        };
        system: {
          update_channel: string;
          gui_shell: { local_product_api_retired: boolean };
          actions: { action_id: string }[];
        };
        first_run_log: {
          surface_id: string;
          log_path: string;
          event_schema_version: string;
        };
        gui_first_run_automation: {
          surface_id: string;
          command_flow: string[];
          accessibility_labels: {
            window: string;
            installButton: string;
          };
        };

        recommended_next_action: {
          action_id: string;
          label: string;
          method: string;
          request_fields: string[];
        };
        endpoints: {
          system_initialize: string;
          workspace_root: string;
        };
      };
    };

    assert.equal(output.system_initialize.surface_id, 'opl_system_initialize');
    assert.equal(output.system_initialize.overall_state, 'attention_needed');
    assert.equal(output.system_initialize.setup_flow.is_first_run, false);
    assert.equal(output.system_initialize.setup_flow.ready_to_launch, false);
    assert.equal(output.system_initialize.setup_flow.phase, 'modules');
    assert.deepEqual(output.system_initialize.setup_flow.blocking_items, [
      'family_runtime_provider',
      'domain_modules',
    ]);
    assert.equal(
      output.system_initialize.setup_flow.progress.ready_required_count <
      output.system_initialize.setup_flow.progress.total_required_count,
      true,
    );
    assert.equal(output.system_initialize.core_engines.codex.installed, true);
    assert.equal(Object.hasOwn(output.system_initialize.core_engines, 'hermes'), false);
    assert.equal(output.system_initialize.native_helpers.lifecycle.commands.repair, 'npm run native:repair');
    assert.equal(
      output.system_initialize.checklist.some((entry) => entry.item_id === 'workspace_root' && entry.required),
      true,
    );
    assert.equal(
      output.system_initialize.checklist.some((entry) => entry.item_id === 'codex' && entry.required),
      true,
    );
    assert.equal(
      output.system_initialize.checklist.some((entry) => entry.item_id === 'domain_modules' && entry.required),
      true,
    );
    const nativeHelperItem = output.system_initialize.checklist.find((entry) => entry.item_id === 'native_helpers');
    assert.ok(nativeHelperItem);
    assert.equal(nativeHelperItem.required, false);
    assert.equal(nativeHelperItem.blocking, false);
    assert.equal(
      nativeHelperItem.action?.action_id,
      nativeHelperItem.status === 'ready' ? 'open_environment' : 'repair_native_helpers',
    );
    if (nativeHelperItem.status !== 'ready') {
      assert.deepEqual(nativeHelperItem.action?.payload_template, { action: 'repair_native_helpers' });
    }
    assert.equal(nativeHelperItem.status, output.system_initialize.native_helpers.health_status);
    assert.equal(output.system_initialize.domain_modules.summary.total_modules_count, 4);
    assert.deepEqual(output.system_initialize.module_summary, output.system_initialize.domain_modules.summary);
    assert.equal(
      output.system_initialize.domain_modules.summary.total_modules_count,
      output.system_initialize.domain_modules.modules.length,
    );
    assert.equal(output.system_initialize.domain_modules.summary.installed_modules_count >= 0, true);
    assert.equal(output.system_initialize.domain_modules.modules.length, 4);
    assert.equal(output.system_initialize.settings.interaction_mode, 'codex');
    assert.equal(output.system_initialize.settings.execution_mode, 'codex');
    assert.equal(output.system_initialize.workspace_root.selected_path, workspaceRoot);
    assert.equal(output.system_initialize.workspace_root.health_status, 'ready');
    assert.equal(output.system_initialize.system.update_channel, 'stable');
    assert.equal(
      output.system_initialize.system.actions.some((entry) => entry.action_id === 'developer_supervisor'),
      true,
    );
    assert.equal(output.system_initialize.system.gui_shell.local_product_api_retired, true);
    assert.equal(output.system_initialize.first_run_log.surface_id, 'opl_first_run_log');
    assert.equal(output.system_initialize.first_run_log.event_schema_version, 'opl_first_run_event.v1');
    assert.match(output.system_initialize.first_run_log.log_path, /Library\/Logs\/One Person Lab\/first-run\.jsonl$/);
    assert.equal(output.system_initialize.gui_first_run_automation.surface_id, 'opl_gui_first_run_automation');
    assert.deepEqual(output.system_initialize.gui_first_run_automation.command_flow, [
      'opl system initialize',
      'opl install --skip-gui-open',
      'opl modules',
    ]);
    assert.equal(
      output.system_initialize.gui_first_run_automation.accessibility_labels.window,
      'opl-first-run-window',
    );
    assert.equal(
      output.system_initialize.gui_first_run_automation.accessibility_labels.installButton,
      'opl-first-run-install-button',
    );
    assert.ok(output.system_initialize.recommended_next_action.action_id.length > 0);
    assert.ok(output.system_initialize.recommended_next_action.label.length > 0);
    assert.equal(output.system_initialize.recommended_next_action.method, 'GET');
    assert.deepEqual(output.system_initialize.recommended_next_action.request_fields, []);
    assert.equal(output.system_initialize.endpoints.system_initialize, '/api/opl/system/initialize');
    assert.equal(output.system_initialize.endpoints.workspace_root, '/api/opl/workspaces/root');
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('system initialize reports temporal provider setup as blocking Full readiness when worker is unconfigured', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-online-management-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const modulesRoot = path.join(homeRoot, 'modules');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-online-management-workspace-'));
  const codexConfigFixture = createCodexConfigFixture({
    model: 'gpt-5.4-opl',
    reasoningEffort: 'high',
    baseUrl: 'https://codex-opl.example.test/v1',
    apiKey: 'codex-opl-key',
  });
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  createManagedDomainModuleFixtures(modulesRoot);

  try {
    const output = runCli(
      ['system', 'initialize'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        OPL_STATE_DIR: stateDir,
        OPL_MODULES_ROOT: modulesRoot,
        OPL_WORKSPACE_ROOT: workspaceRoot,
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      },
    ) as {
      system_initialize: {
        overall_state: string;
        readiness: {
          core_ready: boolean;
          domain_ready: boolean;
          online_management_ready: boolean;
          launch_ready: boolean;
          family_runtime_provider_ready: boolean;
          full_ready: boolean;
        };
        setup_flow: {
          phase: string;
          ready_to_launch: boolean;
          blocking_items: string[];
        };
        online_management: {
          surface_id: string;
          status: string;
          provider_kind: string;
          blocking: boolean;
          full_online_blocking: boolean;
          ready: boolean;
          capability_summary: string;
          repair_action: {
            action_id: string;
            payload_template: Record<string, string> | null;
          };
          service_status: {
            engine_id: string;
            installed: boolean;
            health_status: string;
          };
          last_repair_result: unknown | null;
        };
        checklist: Array<{
          item_id: string;
          label: string;
          required: boolean;
          blocking: boolean;
          detail_summary: string;
        }>;
        recommended_next_action: {
          action_id: string;
        };
      };
    };

    assert.equal(output.system_initialize.overall_state, 'ready_with_degraded_online_runtime');
    assert.deepEqual(output.system_initialize.readiness, {
      core_ready: true,
      domain_ready: true,
      online_management_ready: false,
      launch_ready: true,
      family_runtime_provider_ready: false,
      full_ready: false,
    });
    assert.equal(output.system_initialize.setup_flow.phase, 'environment');
    assert.equal(output.system_initialize.setup_flow.ready_to_launch, false);
    assert.deepEqual(output.system_initialize.setup_flow.blocking_items, ['family_runtime_provider']);
    assert.equal(output.system_initialize.online_management.surface_id, 'opl_online_management');
    assert.equal(output.system_initialize.online_management.status, 'initializing');
    assert.equal(output.system_initialize.online_management.provider_kind, 'temporal');
    assert.equal(output.system_initialize.online_management.blocking, true);
    assert.equal(output.system_initialize.online_management.full_online_blocking, true);
    assert.equal(output.system_initialize.online_management.ready, false);
    assert.match(
      output.system_initialize.online_management.capability_summary,
      /temporal/i,
    );
    assert.equal(output.system_initialize.online_management.repair_action.action_id, 'review_family_runtime_provider');
    assert.equal(output.system_initialize.online_management.service_status.engine_id, 'temporal');
    assert.equal(output.system_initialize.online_management.service_status.installed, false);
    assert.equal(Object.hasOwn(output.system_initialize.online_management.service_status, 'gateway_loaded'), false);
    assert.equal(output.system_initialize.online_management.service_status.health_status, 'attention_needed');
    assert.equal(output.system_initialize.online_management.last_repair_result, null);

    const onlineManagementItem = output.system_initialize.checklist.find((entry) => entry.item_id === 'family_runtime_provider');
    assert.ok(onlineManagementItem);
    assert.equal(onlineManagementItem.label, 'Family Runtime Provider');
    assert.equal(onlineManagementItem.required, true);
    assert.equal(onlineManagementItem.blocking, true);
    assert.match(onlineManagementItem.detail_summary, /temporal/i);
    assert.equal(output.system_initialize.recommended_next_action.action_id, 'review_family_runtime_provider');
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('opl install keeps retired gateway repair out of the default Codex install path', async () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-retired-gateway-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const codexConfigFixture = createCodexConfigFixture({
    apiKey: 'codex-opl-key',
  });
  const retiredGatewayState = path.join(homeRoot, 'retired-gateway-ready');
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = await runCliAsync(
      ['install', '--skip-gui-open', '--skip-modules', '--skip-native-helper-repair'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        OPL_STATE_DIR: stateDir,
        OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
        OPL_WORKSPACE_ROOT: homeRoot,
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
        OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
      },
    ) as {
      install: {
        runtime_manager_action: {
          status: string;
        non_blocking_actions: Array<{ action_id: string; status: string; blocking?: boolean }>;
        background_actions: Array<{ action_id: string; status: string; blocking?: boolean }>;
          executed_actions: Array<{
            action_id: string;
            status: string;
            blocking: boolean;
            action_lane: string;
            capability: string;
          }>;
          after: {
            reconcile: {
              checked_surfaces: {
                provider_runtime: string;
              };
            };
          };
        };
        system_initialize: {
          online_management: {
            status: string;
            blocking: boolean;
            full_online_blocking: boolean;
            ready: boolean;
          };
          core_engines: {
            [key: string]: unknown;
          };
        };
        background_actions: Array<{ action_id: string; status: string; blocking?: boolean }>;
        non_blocking_actions: Array<{ action_id: string; status: string; blocking?: boolean }>;
        first_run_log_events: Array<{
          event_type: string;
          payload: Record<string, unknown>;
        }>;
      };
    };

    assert.equal(fs.existsSync(retiredGatewayState), false);
    assert.equal(output.install.runtime_manager_action.status, 'completed_with_attention');
    assert.deepEqual(output.install.runtime_manager_action.executed_actions.map((action) => [
      action.action_id,
      action.status,
      action.blocking,
    ]), [
      ['configure_temporal_provider', 'blocked_manual_configuration_required', true],
    ]);
    assert.deepEqual(output.install.runtime_manager_action.non_blocking_actions, []);
    assert.deepEqual(output.install.runtime_manager_action.background_actions, []);
    assert.deepEqual(output.install.non_blocking_actions, []);
    assert.deepEqual(output.install.background_actions, []);
    assert.equal(
      output.install.runtime_manager_action.after.reconcile.checked_surfaces.provider_runtime,
      'provider_code_landed_unconfigured',
    );
    assert.equal(Object.hasOwn(output.install.runtime_manager_action.after.reconcile.checked_surfaces, 'hermes_diagnostics'), false);
    assert.equal(Object.hasOwn(output.install.system_initialize.core_engines, 'hermes'), false);
    assert.equal(output.install.system_initialize.online_management.status, 'initializing');
    assert.equal(output.install.system_initialize.online_management.blocking, true);
    assert.equal(output.install.system_initialize.online_management.full_online_blocking, true);
    assert.equal(output.install.system_initialize.online_management.ready, false);
    assert.equal(
      output.install.first_run_log_events.some((entry) =>
        entry.event_type === 'online_management_repair_started'
      ),
      false,
    );
    assert.equal(
      output.install.first_run_log_events.some((entry) =>
        entry.event_type === 'online_management_repair_completed'
      ),
      false,
    );
    assert.equal(
      output.install.first_run_log_events.some((entry) =>
        entry.event_type === 'runtime_manager_repair_completed'
        && entry.payload.status === 'completed_with_attention'
      ),
      true,
    );
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system initialize exposes first-run blocker metadata and actionable payload hints', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-first-run-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const output = runCli(
      ['system', 'initialize'],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
        OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
        PATH: '/usr/bin:/bin',
      },
    ) as {
      system_initialize: {
        overall_state: string;
        setup_flow: {
          is_first_run: boolean;
          phase: string;
          ready_to_launch: boolean;
          blocking_items: string[];
          progress: {
            ready_required_count: number;
            total_required_count: number;
          };
        };
        checklist: Array<{
          item_id: string;
          required: boolean;
          blocking: boolean;
          action: {
            action_id: string;
            method: string;
            request_fields: string[];
          } | null;
        }>;
        recommended_next_action: {
          action_id: string;
          method: string;
          request_fields: string[];
        };
        workspace_root: {
          selected_path: string | null;
          health_status: string;
        };
      };
    };

    assert.equal(output.system_initialize.overall_state, 'attention_needed');
    assert.equal(output.system_initialize.setup_flow.is_first_run, true);
    assert.equal(output.system_initialize.setup_flow.ready_to_launch, false);
    assert.equal(output.system_initialize.setup_flow.phase, 'environment');
    assert.equal(output.system_initialize.setup_flow.blocking_items.includes('codex'), true);
    assert.equal(output.system_initialize.setup_flow.blocking_items.includes('domain_modules'), true);
    assert.equal(
      output.system_initialize.setup_flow.progress.ready_required_count <
        output.system_initialize.setup_flow.progress.total_required_count,
      true,
    );
    assert.equal(output.system_initialize.workspace_root.selected_path, homeRoot);
    assert.equal(output.system_initialize.workspace_root.health_status, 'ready');
    assert.equal(output.system_initialize.recommended_next_action.action_id, 'install_or_configure_codex');
    assert.equal(output.system_initialize.recommended_next_action.method, 'POST');
    assert.deepEqual(output.system_initialize.recommended_next_action.request_fields, []);

    const workspaceRootItem = output.system_initialize.checklist.find((entry) => entry.item_id === 'workspace_root');
    const codexItem = output.system_initialize.checklist.find((entry) => entry.item_id === 'codex');

    assert.ok(workspaceRootItem);
    assert.ok(codexItem);
    assert.equal(workspaceRootItem.required, true);
    assert.equal(workspaceRootItem.blocking, false);
    assert.equal(workspaceRootItem.action?.action_id, 'open_workspace_root');
    assert.equal(workspaceRootItem.action?.method, 'GET');
    assert.deepEqual(workspaceRootItem.action?.request_fields, []);
    assert.equal(codexItem.required, true);
    assert.equal(codexItem.blocking, true);
    assert.equal(codexItem.action?.action_id, 'install_or_configure_codex');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('engine action executes env-overridden install commands and returns a structured action surface', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-engine-action-'));
  const markerPath = path.join(fixtureRoot, 'codex-install.marker');
  const installScript = path.join(fixtureRoot, 'install-codex.sh');
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  fs.writeFileSync(
    installScript,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `touch ${shellSingleQuote(markerPath)}`,
      'echo "codex install fixture completed"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  try {
    const output = runCli(
      ['engine', 'install', '--engine', 'codex'],
      {
        OPL_CODEX_BIN: codexFixture.codexPath,
        OPL_CODEX_INSTALL_COMMAND: installScript,
      },
    ) as {
      engine_action: {
        engine_id: string;
        action: string;
        status: string;
        command_preview: string[];
        system: {
          surface_id: string;
          core_engines: {
            codex: {
              installed: boolean;
            };
          };
        };
      };
    };

    assert.equal(output.engine_action.engine_id, 'codex');
    assert.equal(output.engine_action.action, 'install');
    assert.equal(output.engine_action.status, 'completed');
    assert.deepEqual(output.engine_action.command_preview, [installScript]);
    assert.equal('system_environment' in output.engine_action, false);
    assert.equal(output.engine_action.system.surface_id, 'opl_system');
    assert.equal(output.engine_action.system.core_engines.codex.installed, true);
    assert.equal(fs.existsSync(markerPath), true);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('engine actions reject retired Hermes target without compatibility action surface', () => {
  const failure = runCliFailure(['engine', 'install', '--engine', 'hermes']);

  assert.equal(failure.status, 2);
  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.equal(failure.payload.error.details.engine_id, 'hermes');
  assert.deepEqual(failure.payload.error.details.available_engine_ids, ['codex']);
  assert.deepEqual(failure.payload.error.details.retired_engine_ids, ['hermes']);
  assert.match(
    failure.payload.error.details.retirement_boundary,
    /legacy hermes engine action target is retired/,
  );
  assert.match(
    failure.payload.error.details.retirement_boundary,
    /canonical hermes_agent executor adapter remains available/,
  );
  assert.match(
    failure.payload.error.details.retirement_boundary,
    /explicit AgentExecutionRequest selection/,
  );
});

test('builtin Codex install command bounds npm registry fetches', () => {
  const install = resolveEngineActionSpec('codex', 'install');
  const command = install.command_preview.join(' ');

  assert.equal(install.strategy, 'builtin');
  assert.match(command, /npm install -g @openai\/codex@latest/);
  assert.match(command, /--fetch-retries=3/);
  assert.match(command, /--fetch-retry-mintimeout=2000/);
  assert.match(command, /--fetch-retry-maxtimeout=20000/);
  assert.match(command, /--fetch-timeout=60000/);
});
