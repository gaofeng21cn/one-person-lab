import { assert, contractsDir, createCodexConfigFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createGitModuleRemoteFixture, fs, loadGatewayContracts, os, path, repoRoot, runCli, test } from '../helpers.ts';
import { buildInternalCommandSpecs } from '../../../../src/cli/cases/private-command-specs.ts';
import { buildPublicCommandSpecs } from '../../../../src/cli/cases/public-command-specs.ts';

test('public command specs expose the one-shot install command', () => {
  const contracts = loadGatewayContracts({ contractsDir });
  const internalSpecs = buildInternalCommandSpecs(
    {
      helpRequested: false,
      jsonOutput: true,
      textOutput: false,
      command: null,
      args: [],
      loadOptions: { contractsDir },
    },
    () => contracts,
  );
  const publicSpecs = buildPublicCommandSpecs(internalSpecs, () => contracts);

  assert.equal(typeof publicSpecs.install.handler, 'function');
});

test('install command runs selected module installs and returns one-shot setup payload', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const turnkeyLogPath = path.join(homeRoot, 'turnkey.log');
  const medAutoScienceRemote = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'plugins/mas/.codex-plugin/plugin.json': JSON.stringify({ name: 'mas', skills: './skills/' }, null, 2),
      '.agents/plugins/marketplace.json': JSON.stringify({
        name: 'mas-local',
        plugins: [
          {
            name: 'mas',
            source: { source: 'local', path: './plugins/mas' },
            policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
            category: 'Research',
          },
        ],
      }, null, 2),
      'plugins/mas/skills/mas/SKILL.md': [
        '---',
        'name: mas',
        'description: Use MAS runtime through its OPL-managed product entry.',
        '---',
        '',
        '# MAS Skill',
        '',
      ].join('\n'),
      'scripts/opl-module-bootstrap.sh': `#!/usr/bin/env bash
set -euo pipefail
printf 'bootstrap\n' >> ${JSON.stringify(turnkeyLogPath)}
`,
      'scripts/install-codex-plugin.sh': `#!/usr/bin/env bash
set -euo pipefail
printf 'skill-sync\n' >> ${JSON.stringify(turnkeyLogPath)}
cat <<'EOF'
{"repo":"mas","sync":"ok"}
EOF
`,
      'scripts/opl-module-healthcheck.sh': `#!/usr/bin/env bash
set -euo pipefail
printf 'health\n' >> ${JSON.stringify(turnkeyLogPath)}
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
    const output = runCli(['install', '--modules', 'mas', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'], env) as {
      install: {
        surface_id: string;
        status: string;
        selected_engines: string[];
        selected_modules: string[];
        codex_plugin_registry: {
          surface_id: string;
          summary: { registered: number };
        };
        engine_actions: unknown[];
        module_actions: Array<{
          action: string;
          module: { module_id: string; installed: boolean };
          turnkey: { skill_sync: { status: string } };
        }>;
        gui_open_action: unknown | null;
        codex_config_bootstrap: { status: string; api_key_present: boolean };
        companion_skill_sync: {
          surface_id: string;
          mode: string;
          summary: { total: number };
        };
        first_run_log: {
          surface_id: string;
          log_path: string;
          event_schema_version: string;
        };
        first_run_log_events: Array<{
          status: string;
          event_type: string;
          log_path: string;
        }>;
        system_initialize: {
          surface_id: string;
          recommended_skills: { surface_id: string };
          gui_shell: { shell_id: string };
        };
      };
    };

    assert.equal(output.install.surface_id, 'opl_install');
    assert.equal(output.install.status, 'completed');
    assert.deepEqual(output.install.selected_engines, ['codex', 'hermes']);
    assert.deepEqual(output.install.engine_actions, []);
    assert.deepEqual(output.install.selected_modules, ['medautoscience']);
    assert.equal(output.install.codex_plugin_registry.surface_id, 'opl_codex_plugin_registry');
    assert.equal(output.install.codex_plugin_registry.summary.registered, 1);
    assert.equal(output.install.module_actions.length, 1);
    assert.equal(output.install.module_actions[0].action, 'install');
    assert.equal(output.install.module_actions[0].module.module_id, 'medautoscience');
    assert.equal(output.install.module_actions[0].module.installed, true);
    assert.equal(output.install.module_actions[0].turnkey.skill_sync.status, 'completed');
    assert.equal(output.install.gui_open_action, null);
    assert.equal(output.install.codex_config_bootstrap.status, 'skipped_missing_input');
    assert.equal(output.install.codex_config_bootstrap.api_key_present, false);
    assert.equal(output.install.companion_skill_sync.surface_id, 'opl_companion_skill_sync');
    assert.equal(output.install.companion_skill_sync.mode, 'managed');
    assert.equal(output.install.companion_skill_sync.summary.total >= 6, true);
    assert.equal(output.install.first_run_log.surface_id, 'opl_first_run_log');
    assert.equal(output.install.first_run_log.event_schema_version, 'opl_first_run_event.v1');
    assert.equal(output.install.first_run_log.log_path, path.join(homeRoot, 'Library', 'Logs', 'One Person Lab', 'first-run.jsonl'));
    assert.deepEqual(
      output.install.first_run_log_events.map((entry) => [entry.event_type, entry.status, entry.log_path]),
      [
        ['install_started', 'written', output.install.first_run_log.log_path],
        ['install_completed', 'written', output.install.first_run_log.log_path],
      ],
    );
    const firstRunEvents = fs.readFileSync(output.install.first_run_log.log_path, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { event_type: string; payload: Record<string, unknown> });
    assert.deepEqual(firstRunEvents.map((entry) => entry.event_type), ['install_started', 'install_completed']);
    assert.equal(firstRunEvents[0].payload.skip_gui_open, true);
    assert.equal(firstRunEvents[1].payload.status, 'completed');
    assert.equal(output.install.system_initialize.surface_id, 'opl_system_initialize');
    assert.equal(output.install.system_initialize.recommended_skills.surface_id, 'opl_recommended_skill_bundle');
    assert.equal(output.install.system_initialize.gui_shell.shell_id, 'opl_aion_shell');
    assert.equal(
      fs.readFileSync(path.join(homeRoot, '.codex', 'config.toml'), 'utf8').includes(
        `[marketplaces.mas-local]\nsource_type = "local"\nsource = "${path.join(modulesRoot, 'med-autoscience')}"`,
      ),
      true,
    );
    assert.equal(
      fs.readFileSync(path.join(homeRoot, '.codex', 'config.toml'), 'utf8').includes(
        '[plugins."mas@mas-local"]\nenabled = true',
      ),
      true,
    );
    assert.deepEqual(fs.readFileSync(turnkeyLogPath, 'utf8').trim().split('\n'), ['bootstrap', 'skill-sync', 'health']);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(medAutoScienceRemote.fixtureRoot, { recursive: true, force: true });
  }
});

test('install command repairs native helpers and returns the refreshed lifecycle report', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-native-home-'));
  const helperBinDir = path.join(homeRoot, 'native-bin');
  const repairScript = path.join(homeRoot, 'repair-native.sh');
  fs.mkdirSync(helperBinDir, { recursive: true });
  fs.writeFileSync(
    repairScript,
    `#!/usr/bin/env bash
set -euo pipefail
for binary in opl-doctor-native opl-runtime-watch opl-artifact-indexer opl-state-indexer; do
  cat > "${helperBinDir}/$binary" <<'EOS'
#!/bin/sh
cat >/dev/null
case "$(basename "$0")" in
  opl-doctor-native)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-doctor-native","ok":true,"request_id":"runtime-manager-doctor","result":{"surface_kind":"native_doctor_snapshot"},"errors":[]}'
    ;;
  opl-runtime-watch)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-runtime-watch","ok":true,"request_id":"runtime-manager-runtime-watch","result":{"surface_kind":"runtime_health_snapshot_index","roots":[]},"errors":[]}'
    ;;
  opl-artifact-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-artifact-indexer","ok":true,"request_id":"runtime-manager-artifact-index","result":{"surface_kind":"native_artifact_manifest","summary":{"total_files_count":0},"files":[]},"errors":[]}'
    ;;
  opl-state-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-state-indexer","ok":true,"request_id":"runtime-manager-state-index","result":{"surface_kind":"native_state_index","roots":[],"json_validation":{"checked_files_count":0,"invalid_files_count":0,"files":[]}},"errors":[]}'
    ;;
esac
EOS
  chmod +x "${helperBinDir}/$binary"
done
printf 'native repair completed\\n'
`,
    { mode: 0o755 },
  );

  try {
    const output = runCli(['install', '--skip-modules', '--skip-engines', '--skip-gui-open'], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
      OPL_NATIVE_HELPER_REPAIR_COMMAND: repairScript,
    }) as {
      install: {
        native_helper_action: {
          action: string;
          status: string;
          command_preview: string[];
          before: { runtime: { status: string } };
          after: { runtime: { status: string } };
        };
        system_initialize: {
          native_helpers: {
            health_status: string;
            runtime: { status: string };
          };
        };
      };
    };

    assert.equal(output.install.native_helper_action.action, 'repair_native_helpers');
    assert.equal(output.install.native_helper_action.status, 'completed');
    assert.deepEqual(output.install.native_helper_action.command_preview, [repairScript]);
    assert.equal(output.install.native_helper_action.before.runtime.status, 'unavailable');
    assert.equal(output.install.native_helper_action.after.runtime.status, 'available');
    assert.equal(output.install.system_initialize.native_helpers.runtime.status, 'available');
    assert.equal(output.install.system_initialize.native_helpers.health_status, 'ready');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('install command can bootstrap Codex defaults from environment without leaking the API key', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-codex-defaults-home-'));

  try {
    const output = runCli(['install', '--skip-modules', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_CODEX_MODEL: 'gpt-5.5',
      OPL_CODEX_REASONING_EFFORT: 'xhigh',
      OPL_CODEX_BASE_URL: 'https://codex-provider.example.test/v1',
      OPL_CODEX_API_KEY: 'secret-test-key',
    }) as {
      install: {
        codex_config_bootstrap: {
          status: string;
          config_path: string;
          model: string;
          reasoning_effort: string;
          provider_base_url: string;
          api_key_present: boolean;
        };
      };
    };

    const bootstrap = output.install.codex_config_bootstrap;
    assert.equal(bootstrap.status, 'completed');
    assert.equal(bootstrap.model, 'gpt-5.5');
    assert.equal(bootstrap.reasoning_effort, 'xhigh');
    assert.equal(bootstrap.provider_base_url, 'https://codex-provider.example.test/v1');
    assert.equal(bootstrap.api_key_present, true);
    assert.equal(JSON.stringify(output).includes('secret-test-key'), false);

    const config = fs.readFileSync(bootstrap.config_path, 'utf8');
    assert.match(config, /model = "gpt-5\.5"/);
    assert.match(config, /model_reasoning_effort = "xhigh"/);
    assert.match(config, /base_url = "https:\/\/codex-provider\.example\.test\/v1"/);
    assert.match(config, /experimental_bearer_token = "secret-test-key"/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('install command points WebUI users to the AionUI shell instead of a local Product API service', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-webui-note-home-'));

  try {
    const output = runCli(['install', '--skip-modules', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    }) as { install: { notes: string[] } };

    assert.doesNotMatch(output.install.notes.join('\n'), /serve-web|8787|Product API service/);
    assert.match(output.install.notes.join('\n'), /GUI startup opens/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});


test('install command reuses already installed runtime dependencies', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-engines-home-'));
  const codexFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-codex-'));
  const hermesFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-hermes-'));
  const codexConfigFixture = createCodexConfigFixture();
  const codexPath = path.join(codexFixtureRoot, 'codex');
  const hermesPath = path.join(hermesFixtureRoot, 'hermes');

  fs.writeFileSync(codexPath, '#!/usr/bin/env bash\necho "codex-cli 0.125.0"\n', { mode: 0o755 });
  fs.writeFileSync(
    hermesPath,
    [
      '#!/usr/bin/env bash',
      'if [ "$1" = "version" ]; then echo "Hermes 2.3.4"; exit 0; fi',
      'if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then echo "Gateway service is loaded"; exit 0; fi',
      'echo "unexpected hermes args: $*" >&2',
      'exit 1',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  try {
    const output = runCli(
      ['install', '--skip-modules', '--skip-gui-open', '--skip-native-helper-repair'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
        OPL_HERMES_BIN: hermesPath,
        PATH: `${codexFixtureRoot}:${hermesFixtureRoot}:/usr/bin:/bin`,
      },
    ) as {
      install: {
        engine_actions: Array<{ engine_id: string; status: string; strategy: string }>;
      };
    };

    assert.deepEqual(
      output.install.engine_actions.map((entry) => [entry.engine_id, entry.status, entry.strategy]),
      [
        ['codex', 'skipped_installed', 'already_installed'],
        ['hermes', 'skipped_installed', 'already_installed'],
      ],
    );
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixtureRoot, { recursive: true, force: true });
  }
});

test('install command downloads installs and opens the OPL GUI when it is missing', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-gui-home-'));
  const applicationsDir = path.join(homeRoot, 'Applications');
  const toolRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-gui-tools-'));
  const curlPath = path.join(toolRoot, 'curl');
  const hdiutilPath = path.join(toolRoot, 'hdiutil');
  const openFixture = createFakeOpenFixture();
  const toolLogPath = path.join(toolRoot, 'tools.log');

  fs.writeFileSync(
    curlPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'curl %s\n' "$*" >> ${JSON.stringify(toolLogPath)}
out=''
while [ "$#" -gt 0 ]; do
  if [ "$1" = '-o' ]; then
    out="$2"
    shift 2
    continue
  fi
  shift
done
mkdir -p "$(dirname "$out")"
printf 'fake dmg\n' > "$out"
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    hdiutilPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'hdiutil %s\n' "$*" >> ${JSON.stringify(toolLogPath)}
if [ "$1" = 'attach' ]; then
  mountpoint=''
  while [ "$#" -gt 0 ]; do
    if [ "$1" = '-mountpoint' ]; then
      mountpoint="$2"
      shift 2
      continue
    fi
    shift
  done
  mkdir -p "$mountpoint/One Person Lab.app/Contents"
  printf 'app\n' > "$mountpoint/One Person Lab.app/Contents/Info.plist"
  exit 0
fi
if [ "$1" = 'detach' ]; then
  exit 0
fi
echo "unexpected hdiutil args: $*" >&2
exit 1
`,
    { mode: 0o755 },
  );

  try {
    const output = runCli([
      'install',
      '--skip-modules',
      '--skip-engines',
      '--skip-native-helper-repair',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_GUI_INSTALL_PLATFORM: 'darwin',
      OPL_APPLICATIONS_DIR: applicationsDir,
      OPL_CURL_BIN: curlPath,
      OPL_HDIUTIL_BIN: hdiutilPath,
      OPL_OPEN_BIN: openFixture.openPath,
      OPL_RELEASE_VERSION: '26.4.25',
    }) as {
      install: {
        gui_open_action: {
          status: string;
          strategy: string;
          release_asset: string;
          installed_app_path: string;
        } | null;
      };
    };

    assert.equal(output.install.gui_open_action?.status, 'completed');
    assert.equal(output.install.gui_open_action?.strategy, 'install_release_asset_then_open_app');
    assert.match(output.install.gui_open_action?.release_asset ?? '', /^One\.Person\.Lab-26\.4\.25-mac-/);
    assert.equal(output.install.gui_open_action?.installed_app_path, path.join(applicationsDir, 'One Person Lab.app'));
    assert.equal(fs.existsSync(path.join(applicationsDir, 'One Person Lab.app', 'Contents', 'Info.plist')), true);
    assert.equal(fs.readFileSync(openFixture.capturePath, 'utf8').trim(), path.join(applicationsDir, 'One Person Lab.app'));
    const toolLog = fs.readFileSync(toolLogPath, 'utf8');
    assert.match(toolLog, /curl .*github\.com\/gaofeng21cn\/one-person-lab\/releases\/download\/v26\.4\.25/);
    assert.match(toolLog, /hdiutil attach /);
    assert.match(toolLog, /hdiutil detach /);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(toolRoot, { recursive: true, force: true });
    fs.rmSync(openFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('skill companion apply installs Superpowers full bundle only in managed mode', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-superpowers-home-'));
  const superpowersRemote = createGitModuleRemoteFixture('superpowers', {
    extraFiles: {
      'skills/using-superpowers/SKILL.md': '# using-superpowers\n',
      'skills/verification-before-completion/SKILL.md': '# verification-before-completion\n',
      'skills/systematic-debugging/SKILL.md': '# systematic-debugging\n',
    },
  });

  try {
    const status = runCli([
      'skill',
      'companion',
      'status',
      '--superpowers',
      'full',
    ], {
      HOME: homeRoot,
      OPL_SUPERPOWERS_REPO_URL: superpowersRemote.remoteRoot,
    }) as {
      companion_skills: {
        mode: string;
        items: Array<{ skill_id: string; status: string; action: string }>;
      };
    };
    const observed = status.companion_skills.items.find((entry) => entry.skill_id === 'superpowers');
    assert.equal(status.companion_skills.mode, 'observe');
    assert.equal(observed?.action, 'none');
    assert.equal(fs.existsSync(path.join(homeRoot, '.agents', 'skills', 'superpowers')), false);

    const output = runCli([
      'skill',
      'companion',
      'apply',
      '--mode',
      'managed',
      '--superpowers',
      'full',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_SUPERPOWERS_REPO_URL: superpowersRemote.remoteRoot,
    }) as {
      companion_skills: {
        mode: string;
        superpowers_profile: string;
        items: Array<{
          skill_id: string;
          source_path: string | null;
          target_path: string;
          status: string;
          action: string;
        }>;
      };
    };

    assert.equal(output.companion_skills.mode, 'managed');
    assert.equal(output.companion_skills.superpowers_profile, 'full');
    const superpowers = output.companion_skills.items.find((entry) => entry.skill_id === 'superpowers');
    assert.equal(superpowers?.status, 'installed');
    assert.equal(superpowers?.action, 'clone_and_symlink');
    assert.equal(superpowers?.source_path, path.join(homeRoot, '.codex', 'superpowers'));
    assert.equal(superpowers?.target_path, path.join(homeRoot, '.agents', 'skills', 'superpowers'));
    assert.equal(
      fs.realpathSync(path.join(homeRoot, '.agents', 'skills', 'superpowers')),
      fs.realpathSync(path.join(homeRoot, '.codex', 'superpowers', 'skills')),
    );
    assert.equal(
      fs.existsSync(path.join(homeRoot, '.agents', 'skills', 'superpowers', 'using-superpowers', 'SKILL.md')),
      true,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(superpowersRemote.fixtureRoot, { recursive: true, force: true });
  }
});
