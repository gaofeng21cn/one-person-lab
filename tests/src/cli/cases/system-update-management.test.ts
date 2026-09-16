import { assert, createFakeCodexFixture, createGitModuleRemoteFixture, fs, os, path, runCli, test } from '../helpers.ts';
import { runGitFixtureCommand } from '../helpers-parts/family-fixtures.ts';

function writeFrameworkFixtureRoot(root: string, marker: string) {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'opl-framework-fixture' }), 'utf8');
  fs.writeFileSync(path.join(root, 'src', 'cli.ts'), `// ${marker}\n`, 'utf8');
  fs.writeFileSync(path.join(root, 'bin', 'opl'), '#!/usr/bin/env bash\n', { encoding: 'utf8', mode: 0o755 });
}

test('system ignores retired Hermes env outside family runtime provider selection', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-retired-hermes-update-home-'));

  try {
    const output = runCli(
      ['system'],
      {
        HOME: homeRoot,
        OPL_HERMES_BIN: path.join(homeRoot, 'retired-hermes-bin'),
        OPL_FAMILY_RUNTIME_PROVIDER: '',
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      },
    );

    assert.equal(Object.hasOwn(output.system.core_engines, 'hermes'), false);
    assert.equal(output.system.core_engines.family_runtime_provider.provider_kind, 'temporal');
    assert.equal(output.system.core_engines.family_runtime_provider.health_status, 'attention_needed');
    assert.equal(output.system.core_engines.family_runtime_provider.status, 'provider_code_landed_unconfigured');
    assert.equal(output.system.developer_mode.action.action_id, 'developer_supervisor');
    assert.equal(output.system.developer_mode.action.endpoint, '/api/opl/system/actions');
    assert.equal(output.system.developer_mode.surface_id, 'opl_developer_mode');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system update keeps external Codex detect-only while updating available targets and reporting dirty module skips', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-system-update-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const frameworkSourceRoot = path.join(homeRoot, 'framework-source');
  const frameworkTargetRoot = path.join(homeRoot, 'framework-target');
  const turnkeyLogPath = path.join(homeRoot, 'turnkey.log');
  const npmLogPath = path.join(homeRoot, 'npm.log');
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  fs.writeFileSync(
    path.join(codexFixture.fixtureRoot, 'npm'),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> ${JSON.stringify(npmLogPath)}
exit 89
`,
    { mode: 0o755 },
  );
  const moduleExtraFiles = {
    'plugins/med-autoscience/.codex-plugin/plugin.json': JSON.stringify({
      name: 'med-autoscience',
      skills: './skills/',
    }, null, 2),
    'plugins/med-autoscience/skills/med-autoscience/SKILL.md': [
      '---',
      'name: med-autoscience',
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
  const metaAgentRemote = createGitModuleRemoteFixture('opl-meta-agent');
  const bookForgeRemote = createGitModuleRemoteFixture('opl-bookforge');
  const scholarSkillsRemote = createGitModuleRemoteFixture('mas-scholar-skills');
  writeFrameworkFixtureRoot(frameworkSourceRoot, 'framework source fixture');
  writeFrameworkFixtureRoot(frameworkTargetRoot, 'old framework target fixture');
  runGitFixtureCommand(frameworkSourceRoot, ['init', '--initial-branch', 'main']);
  runGitFixtureCommand(frameworkSourceRoot, ['add', '-A']);
  runGitFixtureCommand(frameworkSourceRoot, [
    '-c',
    'user.name=OPL Test',
    '-c',
    'user.email=opl@example.test',
    'commit',
    '-m',
    'Initial framework fixture',
  ]);
  const env = {
    HOME: homeRoot,
    OPL_MODULES_ROOT: modulesRoot,
    OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: medAutoScienceRemote.remoteRoot,
    OPL_MODULE_REPO_URL_MEDAUTOGRANT: medAutoGrantRemote.remoteRoot,
    OPL_MODULE_REPO_URL_OPLMETAAGENT: metaAgentRemote.remoteRoot,
    OPL_MODULE_REPO_URL_OPLBOOKFORGE: bookForgeRemote.remoteRoot,
    OPL_MODULE_REPO_URL_SCHOLARSKILLS: scholarSkillsRemote.remoteRoot,
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    OPL_FRAMEWORK_UPDATE_SOURCE: frameworkSourceRoot,
    OPL_FRAMEWORK_UPDATE_TARGET_ROOT: frameworkTargetRoot,
    OPL_FRAMEWORK_UPDATE_SKIP_DEPENDENCY_INSTALL: '1',
    OPL_CODEX_UPDATE_COMMAND: '',
    OPL_MIN_CODEX_CLI_VERSION: '0.125.0',
    OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
    PATH: `${codexFixture.fixtureRoot}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
  };

  try {
    runCli(['connect', 'install', '--module', 'medautoscience'], env);
    const medAutoGrantInstall = runCli(['connect', 'install', '--module', 'medautogrant'], env) as any;
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

    const output = runCli(['system', 'update'], env) as any;
    const targets = new Map<string, any>(
      output.system_action.details.targets.map((entry: any) => [`${entry.target_type}:${entry.target_id}`, entry]),
    );
    assert.equal(output.system_action.action, 'update');
    assert.equal(output.system_action.status, 'completed');
    // Target inventory follows the framework, engine and module registries, so
    // assert its aggregate consistency instead of a frozen total.
    assert.equal(output.system_action.details.summary.total_targets_count, targets.size);
    assert.equal(output.system_action.details.summary.completed_targets_count, 2);
    assert.equal(
      output.system_action.details.summary.skipped_targets_count,
      output.system_action.details.summary.total_targets_count
        - output.system_action.details.summary.completed_targets_count
        - output.system_action.details.summary.manual_required_targets_count,
    );
    assert.equal(output.system_action.details.summary.manual_required_targets_count, 0);
    assert.equal(targets.get('framework:opl-framework')?.status, 'completed');
    assert.equal(targets.get('framework:opl-framework')?.reason, 'framework_runtime_source_refreshed');
    assert.equal(targets.get('engine:codex')?.status, 'skipped');
    assert.equal(targets.get('engine:codex')?.reason, 'selected_external_codex_carrier_detect_only');
    assert.equal(targets.get('engine:codex')?.result, null);
    assert.equal(fs.existsSync(npmLogPath), false);
    assert.equal(fs.existsSync(path.join(homeRoot, 'runtime', 'current', 'bin', 'codex')), false);
    assert.equal(targets.has('engine:hermes'), false);
    assert.equal(targets.get('module:medautoscience')?.status, 'completed');
    assert.equal(targets.get('module:medautogrant')?.status, 'skipped');
    assert.equal(targets.get('module:medautogrant')?.reason, 'dirty_checkout');
    assert.equal(targets.get('module:meddeepscientist')?.reason, 'module_missing');
    assert.equal(targets.get('module:oplbookforge')?.reason, 'module_missing');
    assert.equal(targets.get('module:scholarskills')?.reason, 'module_missing');

    const updatedMas = (
      runCli(['connect', 'modules'], env) as any
    ).modules.items.find((entry: any) => entry.module_id === 'medautoscience');
    assert.ok(updatedMas);
    assert.equal(updatedMas.git?.head_sha, nextMasSha);
    assert.equal(updatedMas.recommended_action, null);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(medAutoScienceRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(medAutoGrantRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(metaAgentRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(bookForgeRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(scholarSkillsRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
