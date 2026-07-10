import {
  assert,
  createCodexConfigFixture,
  createFakeCodexFixture,
  createGitModuleRemoteFixture,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';
import { OPL_GATEWAY_BASE_URL } from '../../../../src/kernel/local-codex-defaults.ts';
import { createFakeCompanionInstallEnv } from './system-install-fixtures.ts';

test('install runs the selected module turnkey path and records first-run completion', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-module-owner-'));
  const modulesRoot = path.join(homeRoot, 'modules');
  const logPath = path.join(homeRoot, 'turnkey.log');
  const remote = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'plugins/med-autoscience/.codex-plugin/plugin.json': JSON.stringify({
        name: 'med-autoscience',
        skills: './skills/',
      }),
      'plugins/med-autoscience/skills/med-autoscience/SKILL.md': [
        '---',
        'name: med-autoscience',
        'description: MAS fixture.',
        '---',
        '',
        '# MAS',
      ].join('\n'),
      'scripts/opl-module-bootstrap.sh': `#!/usr/bin/env bash\nprintf 'bootstrap\\n' >> ${JSON.stringify(logPath)}\n`,
      'scripts/install-codex-plugin.sh': `#!/usr/bin/env bash\nprintf 'skill-sync\\n' >> ${JSON.stringify(logPath)}\nprintf '{"sync":"ok"}\\n'\n`,
      'scripts/opl-module-healthcheck.sh': `#!/usr/bin/env bash\nprintf 'health\\n' >> ${JSON.stringify(logPath)}\n`,
    },
  });

  try {
    const output = runCli(
      ['install', '--modules', 'mas', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'],
      {
        HOME: homeRoot,
        CODEX_HOME: path.join(homeRoot, 'codex-home'),
        OPL_MODULES_ROOT: modulesRoot,
        OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: remote.remoteRoot,
        OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
        PATH: '/usr/bin:/bin',
        ...createFakeCompanionInstallEnv(homeRoot),
      },
    ) as any;
    const moduleAction = output.install.module_actions[0];

    assert.equal(output.install.status, 'completed');
    assert.deepEqual(output.install.selected_modules, ['medautoscience']);
    assert.equal(moduleAction.module.installed, true);
    assert.equal(moduleAction.turnkey.skill_sync.status, 'completed');
    assert.equal(output.install.codex_plugin_registry.summary.registered, 1);
    assert.equal(output.install.opl_flow_plugin.status, 'installed');
    assert.equal(output.install.first_run_log_events.at(-1)?.event_type, 'install_completed');
    assert.deepEqual(fs.readFileSync(logPath, 'utf8').trim().split('\n'), ['bootstrap', 'health']);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(remote.fixtureRoot, { recursive: true, force: true });
  }
});

test('install fails before config or first-run writes when mandatory OPL Flow is missing', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-missing-flow-'));
  const codexHome = path.join(homeRoot, 'codex-home');
  const stateRoot = path.join(homeRoot, 'opl-state');

  try {
    const failure = runCliFailure(
      ['install', '--skip-modules', '--skip-engines', '--skip-gui-open', '--skip-native-helper-repair'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexHome,
        OPL_STATE_DIR: stateRoot,
        OPL_FLOW_INSTALLER_SCRIPT: '',
        OPL_FLOW_REPO_ROOT: '',
        OPL_MODULES_ROOT: path.join(homeRoot, 'missing-modules'),
        OPL_CODEX_API_KEY: 'must-not-be-written',
        PATH: '/usr/bin:/bin',
      },
    );

    assert.equal(failure.payload.error.code, 'surface_not_found');
    assert.equal(fs.existsSync(path.join(codexHome, 'config.toml')), false);
    assert.equal(fs.existsSync(path.join(stateRoot, 'first-run.jsonl')), false);
    assert.equal(fs.existsSync(path.join(homeRoot, 'Library', 'Logs', 'One Person Lab', 'first-run.jsonl')), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system initialize admits only configured Codex model-access sources', () => {
  const cases = [
    { kind: 'missing', ready: false, source: 'missing' },
    { kind: 'codex_login', ready: true, source: 'codex_login' },
    { kind: 'env_api_key', ready: true, source: 'env_api_key' },
    { kind: 'opl_gateway', ready: true, source: 'opl_gateway' },
    { kind: 'app_runtime', ready: true, source: 'custom_provider' },
  ] as const;

  for (const entry of cases) {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-model-access-${entry.kind}-`));
    const cleanupRoots = [homeRoot];
    const env: Record<string, string> = {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
      PATH: '/usr/bin:/bin',
    };
    let expectedRuntimeCodex: string | null = null;

    if (entry.kind === 'app_runtime') {
      const config = createCodexConfigFixture();
      const runtimeRoot = path.join(homeRoot, 'runtime');
      expectedRuntimeCodex = path.join(runtimeRoot, 'current', 'bin', 'codex');
      fs.mkdirSync(path.dirname(expectedRuntimeCodex), { recursive: true });
      fs.writeFileSync(expectedRuntimeCodex, '#!/usr/bin/env bash\necho "codex-cli 0.137.0"\n', { mode: 0o755 });
      env.CODEX_HOME = config.codexHome;
      env.OPL_RUNTIME_ROOT = runtimeRoot;
      cleanupRoots.push(config.codexHome);
    } else {
      const codex = createFakeCodexFixture('echo "codex-cli 0.125.0"');
      env.PATH = `${codex.fixtureRoot}:/usr/bin:/bin`;
      cleanupRoots.push(codex.fixtureRoot);

      if (entry.kind === 'codex_login') {
        fs.mkdirSync(env.CODEX_HOME, { recursive: true });
        fs.writeFileSync(
          path.join(env.CODEX_HOME, 'auth.json'),
          JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'redacted-test-token' } }),
        );
      } else if (entry.kind === 'env_api_key') {
        env.OPENAI_API_KEY = 'redacted-env-key';
      } else if (entry.kind === 'opl_gateway') {
        const config = createCodexConfigFixture({
          providerId: 'gflab',
          providerName: 'gflab',
          baseUrl: OPL_GATEWAY_BASE_URL,
          apiKey: 'redacted-gateway-key',
        });
        env.CODEX_HOME = config.codexHome;
        cleanupRoots.push(config.codexHome);
      }
    }

    try {
      const output = runCli(['system', 'initialize'], env) as any;
      const codex = output.system_initialize.core_engines.codex;
      const codexConfig = output.system_initialize.checklist.find(
        (item: any) => item.item_id === 'codex_config',
      );

      assert.equal(output.system_initialize.setup_flow.ready_to_launch, entry.ready, entry.kind);
      assert.equal(codex.model_access_ready, entry.ready, entry.kind);
      assert.equal(codex.model_access_source, entry.source, entry.kind);
      assert.equal(codex.codex_login_present, entry.kind === 'codex_login', entry.kind);
      assert.equal(codex.env_api_key_present, entry.kind === 'env_api_key', entry.kind);
      assert.equal(codex.opl_gateway_configured, entry.kind === 'opl_gateway', entry.kind);
      assert.equal(codexConfig?.blocking, !entry.ready, entry.kind);
      if (!entry.ready) {
        assert.equal(codexConfig?.action_command_ref, 'opl system configure-codex --api-key-stdin');
      }
      if (expectedRuntimeCodex) {
        assert.equal(codex.binary_path, expectedRuntimeCodex);
        assert.equal(codex.binary_source, 'runtime');
      }
      assert.equal(JSON.stringify(output).includes('redacted-env-key'), false);
      assert.equal(JSON.stringify(output).includes('redacted-gateway-key'), false);
    } finally {
      for (const root of cleanupRoots) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  }
});
