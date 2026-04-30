import { assert, createCodexConfigFixture, createFakeCodexFixture, createFakeHermesFixture, createGitModuleRemoteFixture, fs, os, path, runCli, shellSingleQuote, test } from '../helpers.ts';

test('system exposes Hermes update availability separately from readiness', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-hermes-update-home-'));
  const hermesFixture = createFakeHermesFixture(`
if [[ "$1" == "version" ]]; then
  cat <<'EOF'
Hermes Agent v0.10.0 (2026.4.16)
Project: /tmp/hermes-agent
Update available: 42 commits behind — run 'hermes update'
EOF
  exit 0
fi
if [[ "$1" == "gateway" && "$2" == "status" ]]; then
  echo "✓ Gateway service is loaded"
  exit 0
fi
echo "Unsupported hermes fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['system'],
      {
        HOME: homeRoot,
        OPL_HERMES_BIN: hermesFixture.hermesPath,
      },
    ) as {
      system: {
        core_engines: {
          hermes: {
            installed: boolean;
            version: string | null;
            version_raw_output: string | null;
            update_available: boolean;
            update_summary: string | null;
            health_status: string;
          };
        };
      };
    };

    assert.equal(output.system.core_engines.hermes.installed, true);
    assert.equal(output.system.core_engines.hermes.version, 'Hermes Agent v0.10.0 (2026.4.16)');
    assert.match(output.system.core_engines.hermes.version_raw_output ?? '', /Project: \/tmp\/hermes-agent/);
    assert.equal(output.system.core_engines.hermes.update_available, true);
    assert.equal(
      output.system.core_engines.hermes.update_summary,
      "Update available: 42 commits behind — run 'hermes update'",
    );
    assert.equal(output.system.core_engines.hermes.health_status, 'ready');
  } finally {
    fs.rmSync(hermesFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system treats conflicting non-selected Codex CLI candidates as non-blocking diagnostics', () => {
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
            diagnostics: string[];
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
    assert.equal(output.system.core_engines.codex.health_status, 'ready');
    assert.deepEqual(output.system.core_engines.codex.issues, []);
    assert.deepEqual(output.system.core_engines.codex.diagnostics, ['codex_cli_path_version_conflict_nonblocking']);
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

test('system update skips ready targets updates available targets and reports dirty module skips', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-system-update-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const hermesUpdateMarker = path.join(homeRoot, 'hermes-update.marker');
  const turnkeyLogPath = path.join(homeRoot, 'turnkey.log');
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  const hermesFixture = createFakeHermesFixture(`
if [[ "$1" == "version" ]]; then
  cat <<'EOF'
Hermes Agent v0.10.0 (2026.4.16)
Update available: 42 commits behind — run 'hermes update'
EOF
  exit 0
fi
if [[ "$1" == "gateway" && "$2" == "status" ]]; then
  echo "Gateway service is loaded"
  exit 0
fi
if [[ "$1" == "update" ]]; then
  touch ${shellSingleQuote(hermesUpdateMarker)}
  echo "hermes update fixture completed"
  exit 0
fi
echo "Unsupported hermes fixture command: $*" >&2
exit 1
`);
  const moduleExtraFiles = {
    'plugins/mas/.codex-plugin/plugin.json': JSON.stringify({
      name: 'mas',
      skills: './skills/',
    }, null, 2),
    'plugins/mas/skills/mas/SKILL.md': [
      '---',
      'name: mas',
      'description: Test skill fixture.',
      '---',
      '',
      '# Test Skill',
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
{"sync":"ok"}
EOF
`,
    'scripts/opl-module-healthcheck.sh': `#!/usr/bin/env bash
set -euo pipefail
printf 'health\\n' >> ${JSON.stringify(turnkeyLogPath)}
cat <<'EOF'
{"status":"ok"}
EOF
`,
  };
  const medAutoScienceRemote = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: moduleExtraFiles,
  });
  const medAutoGrantRemote = createGitModuleRemoteFixture('med-autogrant', {
    extraFiles: moduleExtraFiles,
  });
  const env = {
    HOME: homeRoot,
    OPL_HERMES_BIN: hermesFixture.hermesPath,
    OPL_MODULES_ROOT: modulesRoot,
    OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: medAutoScienceRemote.remoteRoot,
    OPL_MODULE_REPO_URL_MEDAUTOGRANT: medAutoGrantRemote.remoteRoot,
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    PATH: `${codexFixture.fixtureRoot}:${hermesFixture.fixtureRoot}:/usr/bin:/bin`,
  };

  try {
    runCli(['module', 'install', '--module', 'medautoscience'], env);
    const medAutoGrantInstall = runCli(['module', 'install', '--module', 'medautogrant'], env) as {
      module_action: { module: { checkout_path: string } };
    };
    fs.writeFileSync(
      path.join(medAutoGrantInstall.module_action.module.checkout_path, 'LOCAL-CHANGE.md'),
      '# Local change\n',
      'utf8',
    );
    const nextMasSha = medAutoScienceRemote.advance(
      'CHANGELOG.md',
      '# Changelog\n\n- Available through system update\n',
      'Advance MAS for system update',
    );

    const output = runCli(['system', 'update'], env) as {
      system_action: {
        action: string;
        status: string;
        details: {
          summary: {
            total_targets_count: number;
            completed_targets_count: number;
            skipped_targets_count: number;
            manual_required_targets_count: number;
          };
          targets: Array<{
            target_type: string;
            target_id: string;
            status: string;
            reason: string;
          }>;
        };
      };
    };
    const targets = new Map(
      output.system_action.details.targets.map((entry) => [`${entry.target_type}:${entry.target_id}`, entry]),
    );
    assert.equal(output.system_action.action, 'update');
    assert.equal(output.system_action.status, 'completed');
    assert.equal(output.system_action.details.summary.total_targets_count, 6);
    assert.equal(output.system_action.details.summary.completed_targets_count, 2);
    assert.equal(output.system_action.details.summary.skipped_targets_count, 4);
    assert.equal(output.system_action.details.summary.manual_required_targets_count, 0);
    assert.equal(targets.get('engine:codex')?.status, 'skipped');
    assert.equal(targets.get('engine:codex')?.reason, 'selected_codex_ready');
    assert.equal(targets.get('engine:hermes')?.status, 'completed');
    assert.equal(fs.existsSync(hermesUpdateMarker), true);
    assert.equal(targets.get('module:medautoscience')?.status, 'completed');
    assert.equal(targets.get('module:medautogrant')?.status, 'skipped');
    assert.equal(targets.get('module:medautogrant')?.reason, 'dirty_checkout');
    assert.equal(targets.get('module:meddeepscientist')?.reason, 'module_missing');

    const updatedMas = (
      runCli(['modules'], env) as {
        modules: { items: Array<{ module_id: string; git: Record<string, unknown> | null; recommended_action: string | null }> };
      }
    ).modules.items.find((entry) => entry.module_id === 'medautoscience');
    assert.ok(updatedMas);
    assert.equal(updatedMas.git?.head_sha, nextMasSha);
    assert.equal(updatedMas.recommended_action, null);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(medAutoScienceRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(medAutoGrantRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
