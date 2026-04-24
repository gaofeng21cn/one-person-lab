import { assert, contractsDir, createFakeLaunchctlFixture, createFakeOpenFixture, createGitModuleRemoteFixture, fs, loadGatewayContracts, os, path, repoRoot, runCli, test } from '../helpers.ts';
import { buildInternalCommandSpecs } from '../../../../src/cli/cases/private-command-specs.ts';
import { buildPublicCommandSpecs } from '../../../../src/cli/cases/public-command-specs.ts';

test('public command specs expose the one-shot install command', () => {
  const contracts = loadGatewayContracts({ contractsDir });
  const publicSpecs = buildPublicCommandSpecs(buildInternalCommandSpecs({ helpRequested: false, command: null, args: [], loadOptions: { contractsDir } }, () => contracts), () => contracts);

  assert.equal(typeof publicSpecs.install.handler, 'function');
});

test('install command runs selected module installs and returns one-shot setup payload', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const turnkeyLogPath = path.join(homeRoot, 'turnkey.log');
  const medAutoScienceRemote = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'plugins/mas/.codex-plugin/plugin.json': JSON.stringify({ name: 'mas', skills: './skills/' }, null, 2),
      'plugins/mas/skills/mas/SKILL.md': '# mas\n',
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
    const output = runCli(['install', '--modules', 'mas', '--skip-engines', '--skip-service', '--skip-gui-open'], env) as {
      install: {
        surface_id: string;
        status: string;
        selected_engines: string[];
        selected_modules: string[];
        engine_actions: unknown[];
        module_actions: Array<{
          action: string;
          module: { module_id: string; installed: boolean };
          turnkey: { skill_sync: { status: string } };
        }>;
        service_action: unknown | null;
        web_open_action: unknown | null;
        gui_open_action: unknown | null;
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
    assert.equal(output.install.module_actions.length, 1);
    assert.equal(output.install.module_actions[0].action, 'install');
    assert.equal(output.install.module_actions[0].module.module_id, 'medautoscience');
    assert.equal(output.install.module_actions[0].module.installed, true);
    assert.equal(output.install.module_actions[0].turnkey.skill_sync.status, 'completed');
    assert.equal(output.install.service_action, null);
    assert.equal(output.install.web_open_action, null);
    assert.equal(output.install.gui_open_action, null);
    assert.equal(output.install.system_initialize.surface_id, 'opl_frontdesk_initialize');
    assert.equal(output.install.system_initialize.recommended_skills.surface_id, 'opl_recommended_skill_bundle');
    assert.equal(output.install.system_initialize.gui_shell.shell_id, 'opl_aion_shell');
    assert.deepEqual(fs.readFileSync(turnkeyLogPath, 'utf8').trim().split('\n'), ['bootstrap', 'skill-sync', 'health']);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(medAutoScienceRemote.fixtureRoot, { recursive: true, force: true });
  }
});


test('install command reuses already installed runtime dependencies', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-engines-home-'));
  const codexFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-codex-'));
  const hermesFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-hermes-'));
  const codexPath = path.join(codexFixtureRoot, 'codex');
  const hermesPath = path.join(hermesFixtureRoot, 'hermes');

  fs.writeFileSync(codexPath, '#!/usr/bin/env bash\necho "codex 1.2.3"\n', { mode: 0o755 });
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
      ['install', '--skip-modules', '--skip-service', '--skip-gui-open'],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
        OPL_HERMES_BIN: hermesPath,
        PATH: `${codexFixtureRoot}:${process.env.PATH ?? ''}`,
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
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixtureRoot, { recursive: true, force: true });
  }
});

test('install command can start and open local web service without launching GUI app', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-service-home-'));
  const launchctlFixture = createFakeLaunchctlFixture();
  const openFixture = createFakeOpenFixture();
  const configuredPort = 8912;
  const env = {
    HOME: homeRoot,
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    OPL_LAUNCHCTL_BIN: launchctlFixture.launchctlPath,
    OPL_OPEN_BIN: openFixture.openPath,
  };

  try {
    const output = runCli([
      'install',
      '--skip-modules',
      '--skip-engines',
      '--skip-gui-open',
      '--port',
      String(configuredPort),
      '--path',
      repoRoot,
    ], env) as {
      install: {
        engine_actions: unknown[];
        module_actions: unknown[];
        service_action: { action: string; status: string } | null;
        web_open_action: { action: string; entry_url: string } | null;
      };
    };

    assert.deepEqual(output.install.engine_actions, []);
    assert.deepEqual(output.install.module_actions, []);
    assert.equal(output.install.service_action?.action, 'reinstall_support');
    assert.equal(output.install.service_action?.status, 'completed');
    assert.equal(output.install.web_open_action?.action, 'open');
    assert.equal(output.install.web_open_action?.entry_url, `http://127.0.0.1:${configuredPort}/`);
    assert.equal(fs.readFileSync(openFixture.capturePath, 'utf8').trim(), `http://127.0.0.1:${configuredPort}/`);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(launchctlFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(openFixture.fixtureRoot, { recursive: true, force: true });
  }
});
