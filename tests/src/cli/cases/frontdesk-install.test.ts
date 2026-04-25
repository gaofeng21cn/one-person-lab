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
    const output = runCli(['install', '--modules', 'mas', '--skip-engines', '--skip-gui-open'], env) as {
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
        service_action: unknown | null;
        web_open_action: unknown | null;
        gui_open_action: unknown | null;
        companion_skill_sync: {
          surface_id: string;
          summary: { total: number };
        };
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
    assert.equal(output.install.service_action, null);
    assert.equal(output.install.web_open_action, null);
    assert.equal(output.install.gui_open_action, null);
    assert.equal(output.install.companion_skill_sync.surface_id, 'opl_companion_skill_sync');
    assert.equal(output.install.companion_skill_sync.summary.total >= 6, true);
    assert.equal(output.install.system_initialize.surface_id, 'opl_frontdesk_initialize');
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
      ['install', '--skip-modules', '--skip-gui-open'],
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
        web_open_action: unknown | null;
        gui_open_action: {
          status: string;
          strategy: string;
          release_asset: string;
          installed_app_path: string;
        } | null;
      };
    };

    assert.equal(output.install.web_open_action, null);
    assert.equal(output.install.gui_open_action?.status, 'completed');
    assert.equal(output.install.gui_open_action?.strategy, 'install_release_asset_then_open_app');
    assert.match(output.install.gui_open_action?.release_asset ?? '', /^One Person Lab-26\.4\.25-mac-/);
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
