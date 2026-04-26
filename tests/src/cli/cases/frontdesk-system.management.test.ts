import { GatewayContractError, PassThrough, assert, buildManifestCommand, buildProjectProgressBrief, cliPath, contractsDir, createCodexConfigFixture, createContractsFixtureRoot, createFakeCodexFixture, createFakeHermesFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createFakePsFixture, createFakeShellCommandFixture, createFamilyContractsFixtureRoot, createFamilyLocatorResolverFixture, createGitModuleRemoteFixture, createMasWorkspaceFixture, explainDomainBoundary, familyManifestFixtureDir, fs, loadFamilyManifestFixtures, loadGatewayContracts, once, os, path, readJsonFixture, readJsonLine, repoRoot, resolveRequestSurface, runCli, runCliAsync, runCliFailure, runCliFailureInCwd, runCliInCwd, runCliRaw, runCliViaEntryPathInCwd, shellSingleQuote, spawn, startCliServer, startFakeOplApiServer, stopCliPipeChild, stopCliServer, stopHttpServer, test, validateGatewayContracts, writeJsonLine, assertContractsContext, assertNoContractsProvenance, assertMagActionGraph, assertMasActionGraph, assertRedcubeActionGraph } from '../helpers.ts';
import { buildInternalCommandSpecs } from '../../../../src/cli/cases/private-command-specs.ts';
import { buildPublicCommandSpecs } from '../../../../src/cli/cases/public-command-specs.ts';

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
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk bootstrap'),
    false,
  );
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk manifest'),
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
  const hermesFixture = createFakeHermesFixture(`
if [[ "$1" == "version" ]]; then
  echo "Hermes 1.2.3"
  exit 0
fi
if [[ "$1" == "gateway" && "$2" == "status" ]]; then
  echo "Gateway service is loaded"
  exit 0
fi
echo "Unsupported hermes fixture command: $*" >&2
exit 1
`);
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
        OPL_HERMES_BIN: hermesFixture.hermesPath,
        PATH: `${codexFixture.fixtureRoot}:${hermesFixture.fixtureRoot}:/usr/bin:/bin`,
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
          };
          hermes: {
            installed: boolean;
            version: string | null;
            gateway_loaded: boolean;
            health_status: string;
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
    assert.equal(output.system.overall_status, 'ready');
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
    assert.equal(output.system.core_engines.hermes.installed, true);
    assert.equal(output.system.core_engines.hermes.version, 'Hermes 1.2.3');
    assert.equal(output.system.core_engines.hermes.gateway_loaded, true);
    assert.equal(output.system.core_engines.hermes.health_status, 'ready');
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
    fs.rmSync(hermesFixture.fixtureRoot, { recursive: true, force: true });
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

test('system flags conflicting Codex CLI PATH candidates as attention needed', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-conflicting-codex-home-'));
  const codexConfigFixture = createCodexConfigFixture({
    model: 'gpt-5.5',
    reasoningEffort: 'xhigh',
    baseUrl: 'https://codex-opl.example.test/v1',
    apiKey: 'codex-opl-key',
  });
  const compatibleCodexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported compatible codex fixture command: $*" >&2
exit 1
`);
  const outdatedCodexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.121.0"
  exit 0
fi
echo "Unsupported outdated codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['system'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        PATH: `${compatibleCodexFixture.fixtureRoot}:${outdatedCodexFixture.fixtureRoot}:/usr/bin:/bin`,
      },
    ) as {
      system: {
        overall_status: string;
        core_engines: {
          codex: {
            version_status: string;
            health_status: string;
            issues: string[];
            candidates: Array<{
              path: string;
              selected: boolean;
              parsed_version: string | null;
              version_status: string;
            }>;
          };
        };
      };
    };

    assert.equal(output.system.overall_status, 'attention_needed');
    assert.equal(output.system.core_engines.codex.version_status, 'compatible');
    assert.equal(output.system.core_engines.codex.health_status, 'attention_needed');
    assert.deepEqual(output.system.core_engines.codex.issues, ['codex_cli_path_version_conflict']);
    assert.deepEqual(
      output.system.core_engines.codex.candidates.map((candidate) => [
        candidate.path,
        candidate.selected,
        candidate.parsed_version,
        candidate.version_status,
      ]),
      [
        [compatibleCodexFixture.codexPath, true, '0.125.0', 'compatible'],
        [outdatedCodexFixture.codexPath, false, '0.121.0', 'outdated'],
      ],
    );
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(compatibleCodexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(outdatedCodexFixture.fixtureRoot, { recursive: true, force: true });
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
  const hermesFixture = createFakeHermesFixture(`
if [[ "$1" == "version" ]]; then
  echo "Hermes 1.2.3"
  exit 0
fi
if [[ "$1" == "gateway" && "$2" == "status" ]]; then
  echo "Gateway service is loaded"
  exit 0
fi
echo "Unsupported hermes fixture command: $*" >&2
exit 1
`);
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
        OPL_HERMES_BIN: hermesFixture.hermesPath,
        OPL_STATE_DIR: stateDir,
        OPL_WORKSPACE_ROOT: workspaceRoot,
        PATH: `${codexFixture.fixtureRoot}:${hermesFixture.fixtureRoot}:/usr/bin:/bin`,
      },
    ) as {
      system_initialize: {
        surface_id: string;
        overall_state: string;
        core_engines: {
          codex: { installed: boolean };
          hermes: { installed: boolean };
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
        };

        recommended_next_action: {
          action_id: string;
          label: string;
          method: string;
          request_fields: string[];
        };
      };
    };

    assert.equal(output.system_initialize.surface_id, 'opl_system_initialize');
    assert.match(output.system_initialize.overall_state, /ready|attention_needed/);
    assert.equal(output.system_initialize.core_engines.codex.installed, true);
    assert.equal(output.system_initialize.core_engines.hermes.installed, true);
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
      output.system_initialize.checklist.some((entry) => entry.item_id === 'domain_modules' && !entry.required),
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
    assert.equal(output.system_initialize.domain_modules.summary.total_modules_count, 3);
    assert.equal(
      output.system_initialize.domain_modules.summary.total_modules_count,
      output.system_initialize.domain_modules.modules.length,
    );
    assert.equal(output.system_initialize.domain_modules.summary.installed_modules_count >= 0, true);
    assert.equal(output.system_initialize.domain_modules.modules.length, 3);
    assert.equal(output.system_initialize.settings.interaction_mode, 'codex');
    assert.equal(output.system_initialize.settings.execution_mode, 'codex');
    assert.equal(output.system_initialize.workspace_root.selected_path, workspaceRoot);
    assert.equal(output.system_initialize.workspace_root.health_status, 'ready');
    assert.equal(output.system_initialize.system.update_channel, 'stable');
    assert.equal(output.system_initialize.system.gui_shell.local_product_api_retired, true);
    assert.ok(output.system_initialize.recommended_next_action.action_id.length > 0);
    assert.ok(output.system_initialize.recommended_next_action.label.length > 0);
    assert.equal(output.system_initialize.recommended_next_action.method, 'GET');
    assert.deepEqual(output.system_initialize.recommended_next_action.request_fields, []);
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
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
        PATH: '/usr/bin:/bin',
      },
    ) as {
      system_initialize: {
        overall_state: string;
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
    assert.equal(output.system_initialize.workspace_root.selected_path, null);
    assert.equal(output.system_initialize.workspace_root.health_status, 'missing');
    assert.equal(output.system_initialize.recommended_next_action.action_id, 'set_workspace_root');
    assert.equal(output.system_initialize.recommended_next_action.method, 'POST');
    assert.deepEqual(output.system_initialize.recommended_next_action.request_fields, ['path']);

    const workspaceRootItem = output.system_initialize.checklist.find((entry) => entry.item_id === 'workspace_root');
    const codexItem = output.system_initialize.checklist.find((entry) => entry.item_id === 'codex');

    assert.ok(workspaceRootItem);
    assert.ok(codexItem);
    assert.equal(workspaceRootItem.required, true);
    assert.equal(workspaceRootItem.blocking, true);
    assert.equal(workspaceRootItem.action?.action_id, 'set_workspace_root');
    assert.equal(workspaceRootItem.action?.method, 'POST');
    assert.deepEqual(workspaceRootItem.action?.request_fields, ['path']);
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
    assert.equal('frontdesk_environment' in output.engine_action, false);
    assert.equal(output.engine_action.system.surface_id, 'opl_system');
    assert.equal(output.engine_action.system.core_engines.codex.installed, true);
    assert.equal(fs.existsSync(markerPath), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('workspace root set persists the selected root and workspace root reads it back', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-root-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-root-selected-'));

  try {
    const setOutput = runCli(
      ['workspace', 'root', 'set', '--path', workspaceRoot],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
      },
    ) as {
      workspace_root: {
        selected_path: string | null;
        health_status: string;
      };
    };

    assert.equal(setOutput.workspace_root.selected_path, workspaceRoot);
    assert.equal(setOutput.workspace_root.health_status, 'ready');

    const readOutput = runCli(
      ['workspace', 'root'],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
      },
    ) as {
      workspace_root: {
        selected_path: string | null;
        health_status: string;
      };
    };

    assert.equal(readOutput.workspace_root.selected_path, workspaceRoot);
    assert.equal(readOutput.workspace_root.health_status, 'ready');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('system update-channel reports and persists the selected release channel', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-update-channel-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const initial = runCli(
      ['system', 'update-channel'],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
      },
    ) as {
      system_action: {
        action: string;
        update_channel: string;
        status: string;
      };
    };
    assert.equal(initial.system_action.action, 'update_channel');
    assert.equal(initial.system_action.update_channel, 'stable');
    assert.equal(initial.system_action.status, 'ready');

    const updated = runCli(
      ['system', 'update-channel', '--channel', 'preview'],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
      },
    ) as {
      system_action: {
        action: string;
        update_channel: string;
        status: string;
      };
    };
    assert.equal(updated.system_action.action, 'update_channel');
    assert.equal(updated.system_action.update_channel, 'preview');
    assert.equal(updated.system_action.status, 'completed');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
test('modules and module actions manage OPL-owned domain module installs and updates', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-modules-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const turnkeyLogPath = path.join(homeRoot, 'turnkey.log');
  const medAutoScienceRemote = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'plugins/mas/.codex-plugin/plugin.json': JSON.stringify({
        name: 'mas',
        skills: './skills/',
      }, null, 2),
      'plugins/mas/skills/mas/SKILL.md': [
        '---',
        'name: mas',
        'description: Use when Codex should operate MedAutoScience through its stable runtime, controller, overlay, and workspace contracts instead of ad-hoc scripts.',
        '---',
        '',
        '# MAS App Skill',
        '',
        'Use this fixture as the canonical MAS family app skill entry.',
        '',
      ].join('\n'),
      'scripts/opl-module-bootstrap.sh': `#!/usr/bin/env bash
set -euo pipefail
printf 'bootstrap\\n' >> ${JSON.stringify(turnkeyLogPath)}
`,
      'scripts/install-codex-plugin.sh': `#!/usr/bin/env bash
set -euo pipefail
printf 'skill-sync\\n' >> ${JSON.stringify(turnkeyLogPath)}
cat <<'EOF'
{"repo":"med-autoscience","sync":"ok"}
EOF
`,
      'scripts/opl-module-healthcheck.sh': `#!/usr/bin/env bash
set -euo pipefail
test -f ${JSON.stringify(turnkeyLogPath)}
printf 'health\\n' >> ${JSON.stringify(turnkeyLogPath)}
cat <<'EOF'
{"status":"ok"}
EOF
`,
    },
  });
  const env = {
    HOME: homeRoot,
    OPL_MODULES_ROOT: modulesRoot,
    OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: medAutoScienceRemote.remoteRoot,
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
  };

  try {
    const initial = runCli(['modules'], env) as {
      modules: {
        summary: {
          total_modules_count: number;
          installed_modules_count: number;
        };
        items: Array<{
          module_id: string;
          installed: boolean;
          install_origin: string;
          available_actions: string[];
        }>;
      };
    };
    assert.equal(initial.modules.summary.total_modules_count, 3);
    const initialMas = initial.modules.items.find((entry) => entry.module_id === 'medautoscience');
    assert.ok(initialMas);
    assert.equal(initialMas.installed, false);
    assert.equal(initialMas.install_origin, 'missing');
    assert.equal(initialMas.available_actions.includes('install'), true);

    const install = runCli(
      ['module', 'install', '--module', 'medautoscience'],
      env,
    ) as {
      module_action: {
        action: string;
        status: string;
        turnkey: {
          bootstrap: {
            status: string;
          };
          skill_sync: {
            status: string;
            domain_id: string | null;
          };
          health_check: {
            status: string;
          };
        };
        module: {
          module_id: string;
          installed: boolean;
          install_origin: string;
          checkout_path: string;
          git: {
            head_sha: string | null;
          };
        };
      };
    };
    assert.equal(install.module_action.action, 'install');
    assert.equal(install.module_action.status, 'completed');
    assert.equal(install.module_action.module.module_id, 'medautoscience');
    assert.equal(install.module_action.module.installed, true);
    assert.equal(install.module_action.module.install_origin, 'managed_root');
    assert.equal(install.module_action.turnkey.bootstrap.status, 'completed');
    assert.equal(install.module_action.turnkey.skill_sync.status, 'completed');
    assert.equal(install.module_action.turnkey.skill_sync.domain_id, 'medautoscience');
    assert.equal(install.module_action.turnkey.health_check.status, 'completed');
    assert.equal(
      install.module_action.module.git.head_sha,
      medAutoScienceRemote.getHeadSha(),
    );
    assert.equal(
      fs.existsSync(path.join(install.module_action.module.checkout_path, 'README.md')),
      true,
    );
    assert.deepEqual(
      fs.readFileSync(turnkeyLogPath, 'utf8').trim().split('\n'),
      ['bootstrap', 'skill-sync', 'health'],
    );

    const nextSha = medAutoScienceRemote.advance(
      'CHANGELOG.md',
      '# Changelog\n\n- Added module update test\n',
      'Advance module remote',
    );
    const update = runCli(
      ['module', 'update', '--module', 'medautoscience'],
      env,
    ) as {
      module_action: {
        action: string;
        status: string;
        module: {
          git: {
            head_sha: string | null;
          };
        };
      };
    };
    assert.equal(update.module_action.action, 'update');
    assert.equal(update.module_action.status, 'completed');
    assert.equal(update.module_action.module.git.head_sha, nextSha);
    assert.deepEqual(
      fs.readFileSync(turnkeyLogPath, 'utf8').trim().split('\n'),
      ['bootstrap', 'skill-sync', 'health', 'bootstrap', 'skill-sync', 'health'],
    );

    const remove = runCli(
      ['module', 'remove', '--module', 'medautoscience'],
      env,
    ) as {
      module_action: {
        action: string;
        status: string;
        module: {
          installed: boolean;
          checkout_path: string;
        };
      };
    };
    assert.equal(remove.module_action.action, 'remove');
    assert.equal(remove.module_action.status, 'completed');
    assert.equal(remove.module_action.module.installed, false);
    assert.equal(fs.existsSync(remove.module_action.module.checkout_path), false);
  } finally {
    fs.rmSync(medAutoScienceRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('help keeps AionUI GUI lane without Product API commands', () => {
  const output = runCli(['help']);
  assert.equal(output.help.commands.some((entry: { command: string }) => entry.command === 'web'), false);
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'service install'),
    false,
  );
  assert.equal(output.help.commands.some((entry: { command: string }) => entry.command === 'web bundle'), false);
  assert.equal(output.help.commands.some((entry: { command: string }) => entry.command === 'web package'), false);
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk bootstrap'),
    false,
  );
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk manifest'),
    false,
  );
});
