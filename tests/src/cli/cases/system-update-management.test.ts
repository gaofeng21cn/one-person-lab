import { spawnSync } from 'node:child_process';

import { assert, createFakeCodexFixture, createGitModuleRemoteFixture, fs, os, path, runCli, test } from '../helpers.ts';
import { runGitFixtureCommand } from '../helpers-parts/family-fixtures.ts';
import { writeFakeBookForgeGeneratedSurfacePack } from '../../cli-codex-default-shell-helpers.ts';

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

test('system update skips ready targets updates available targets and reports dirty module skips', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-system-update-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const frameworkSourceRoot = path.join(homeRoot, 'framework-source');
  const frameworkTargetRoot = path.join(homeRoot, 'framework-target');
  const turnkeyLogPath = path.join(homeRoot, 'turnkey.log');
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
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
    OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
    PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
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
    assert.equal(output.system_action.details.summary.total_targets_count, 9);
    assert.equal(output.system_action.details.summary.completed_targets_count, 2);
    assert.equal(output.system_action.details.summary.skipped_targets_count, 7);
    assert.equal(output.system_action.details.summary.manual_required_targets_count, 0);
    assert.equal(targets.get('framework:opl-framework')?.status, 'completed');
    assert.equal(targets.get('framework:opl-framework')?.reason, 'framework_runtime_source_refreshed');
    assert.equal(targets.get('engine:codex')?.status, 'skipped');
    assert.equal(targets.get('engine:codex')?.reason, 'selected_codex_ready');
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

test('packages update installs missing managed carriers updates clean carriers and reports dirty or developer carriers as manual', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-packages-update-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const turnkeyLogPath = path.join(homeRoot, 'turnkey.log');
  const buildModuleFiles = (skill: 'mas' | 'mag' | 'rca' | 'oma' | 'bookforge' | null) => {
    const files: Record<string, string> = {
      'scripts/opl-module-bootstrap.sh': `#!/usr/bin/env bash
set -euo pipefail
printf 'bootstrap:%s\\n' "$(basename "$(pwd)")" >> ${JSON.stringify(turnkeyLogPath)}
`,
      'scripts/opl-module-healthcheck.sh': `#!/usr/bin/env bash
set -euo pipefail
printf 'health:%s\\n' "$(basename "$(pwd)")" >> ${JSON.stringify(turnkeyLogPath)}
cat <<'EOF'
{"status":"ok"}
EOF
`,
    };
    if (skill === 'oma') {
      delete files['scripts/opl-module-healthcheck.sh'];
      files['scripts/verify.sh'] = `#!/usr/bin/env bash
set -euo pipefail
lane="\${1:-}"
if [[ "$lane" != "smoke" ]]; then
  echo "Unknown lane: $lane" >&2
  echo "Usage: scripts/verify.sh [smoke|typecheck|full]" >&2
  exit 3
fi
printf 'health:%s:%s\\n' "$(basename "$(pwd)")" "$lane" >> ${JSON.stringify(turnkeyLogPath)}
cat <<'EOF'
{"status":"ok","lane":"smoke"}
EOF
`;
    }
    if (skill === 'bookforge') {
      delete files['scripts/opl-module-healthcheck.sh'];
      files['scripts/verify.sh'] = `#!/usr/bin/env bash
set -euo pipefail
lane="\${1:-}"
if [[ "$lane" != "fast" ]]; then
  echo "Unknown lane: $lane" >&2
  exit 3
fi
printf 'health:%s:%s\\n' "$(basename "$(pwd)")" "$lane" >> ${JSON.stringify(turnkeyLogPath)}
cat <<'EOF'
{"status":"ok","lane":"fast"}
EOF
`;
    }
    if (skill === 'mas' || skill === 'mag') {
      files[`plugins/${skill}/.codex-plugin/plugin.json`] = JSON.stringify({ name: skill, skills: './skills/' }, null, 2);
      files[`plugins/${skill}/skills/${skill}/SKILL.md`] = [
        '---',
        `name: ${skill}`,
        `description: ${skill.toUpperCase()} workflow entry fixture.`,
        '---',
        '',
        '# Test Skill',
        '',
      ].join('\n');
      files['scripts/install-codex-plugin.sh'] = `#!/usr/bin/env bash
set -euo pipefail
printf 'skill:%s\\n' "$(basename "$PWD")" >> ${JSON.stringify(turnkeyLogPath)}
cat <<'EOF'
{"sync":"ok"}
EOF
`;
    }
    if (skill === 'rca') {
      files['plugins/redcube-ai/.codex-plugin/plugin.json'] = JSON.stringify({ name: 'redcube-ai', skills: './skills/' }, null, 2);
      files['plugins/redcube-ai/skills/redcube-ai/SKILL.md'] = [
        '---',
        'name: redcube-ai',
        'description: RCA workflow entry fixture.',
        '---',
        '',
        '# Test Skill',
        '',
      ].join('\n');
      files['scripts/install-codex-plugin.ts'] = `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
fs.appendFileSync(${JSON.stringify(turnkeyLogPath)}, 'skill:' + path.basename(process.cwd()) + '\\n');
console.log(JSON.stringify({ sync: 'ok' }));
`;
    }
    return files;
  };
  const remotes = {
    medautoscience: createGitModuleRemoteFixture('med-autoscience', { extraFiles: buildModuleFiles('mas') }),
    medautogrant: createGitModuleRemoteFixture('med-autogrant', { extraFiles: buildModuleFiles('mag') }),
    redcube: createGitModuleRemoteFixture('redcube-ai', { extraFiles: buildModuleFiles('rca') }),
    oplmetaagent: createGitModuleRemoteFixture('opl-meta-agent', { extraFiles: buildModuleFiles('oma') }),
    oplbookforge: createGitModuleRemoteFixture('opl-bookforge', { extraFiles: buildModuleFiles('bookforge') }),
    scholarskills: createGitModuleRemoteFixture('mas-scholar-skills'),
  };
  writeFakeBookForgeGeneratedSurfacePack(remotes.oplbookforge.sourceRoot);
  runGitFixtureCommand(remotes.oplbookforge.sourceRoot, ['add', 'agent', 'contracts']);
  runGitFixtureCommand(remotes.oplbookforge.sourceRoot, ['commit', '-m', 'Add Book Forge generated surface pack']);
  runGitFixtureCommand(remotes.oplbookforge.sourceRoot, ['push', 'origin', 'main']);
  const redcubeExternalCheckout = path.join(homeRoot, 'external-redcube-ai');
  const cloneResult = spawnSync('git', ['clone', '--branch', 'main', remotes.redcube.remoteRoot, redcubeExternalCheckout], {
    encoding: 'utf8',
  });
  assert.equal(cloneResult.status, 0, `git clone redcube fixture\nstdout=${cloneResult.stdout}\nstderr=${cloneResult.stderr}`);
  const env = {
    HOME: homeRoot,
    OPL_MODULES_ROOT: modulesRoot,
    OPL_MODULE_PATH_REDCUBE: redcubeExternalCheckout,
    OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: remotes.medautoscience.remoteRoot,
    OPL_MODULE_REPO_URL_MEDAUTOGRANT: remotes.medautogrant.remoteRoot,
    OPL_MODULE_REPO_URL_REDCUBE: remotes.redcube.remoteRoot,
    OPL_MODULE_REPO_URL_OPLMETAAGENT: remotes.oplmetaagent.remoteRoot,
    OPL_MODULE_REPO_URL_OPLBOOKFORGE: remotes.oplbookforge.remoteRoot,
    OPL_MODULE_REPO_URL_SCHOLARSKILLS: remotes.scholarskills.remoteRoot,
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
  };

  try {
    runCli(['connect', 'install', '--module', 'medautoscience'], env);
    const grantInstall = runCli(['connect', 'install', '--module', 'medautogrant'], env) as any;
    fs.writeFileSync(path.join(grantInstall.module_action.module.checkout_path, 'LOCAL-CHANGE.md'), '# Local change\n');
    const nextMasSha = remotes.medautoscience.advance(
      'CHANGELOG.md',
      '# Changelog\n\n- Available through package update\n',
      'Advance MAS for package update',
    );
    fs.writeFileSync(turnkeyLogPath, '', 'utf8');

    const output = runCli(['packages', 'update'], env) as any;
    const adapter = output.managed_update.execution.adapter_results[0];
    const targets = new Map<string, any>(adapter.result.targets.map((entry: any) => [entry.target_id, entry]));
    assert.equal(adapter.component_id, 'opl_packages');
    assert.equal(adapter.status, 'manual_required');
    assert.deepEqual(adapter.result.summary, {
      total_targets_count: 5,
      completed_targets_count: 3,
      manual_required_targets_count: 2,
    });
    assert.equal(targets.get('medautoscience')?.status, 'completed');
    assert.equal(targets.get('medautoscience')?.reason, 'capability_packages_refresh');
    assert.equal(targets.has('meddeepscientist'), false);
    assert.equal(targets.get('redcube')?.status, 'manual_required');
    assert.equal(targets.get('redcube')?.reason, 'developer_or_dirty_checkout_visible');
    assert.equal(targets.get('oplmetaagent')?.status, 'completed');
    assert.equal(targets.get('oplmetaagent')?.reason, 'module_missing');
    assert.equal(targets.get('oplbookforge')?.status, 'completed');
    assert.equal(targets.get('oplbookforge')?.reason, 'module_missing');
    assert.equal(targets.has('scholarskills'), false);
    assert.equal(targets.get('medautogrant')?.status, 'manual_required');
    assert.equal(targets.get('medautogrant')?.reason, 'developer_or_dirty_checkout_visible');
    const turnkeyLog = fs.readFileSync(turnkeyLogPath, 'utf8');
    assert.match(turnkeyLog, /bootstrap:med-autoscience/);
    assert.doesNotMatch(turnkeyLog, /skill:med-autoscience/);
    assert.match(turnkeyLog, /health:med-autoscience/);
    assert.doesNotMatch(turnkeyLog, /med-deepscientist/);
    assert.doesNotMatch(turnkeyLog, /bootstrap:external-redcube-ai/);
    assert.doesNotMatch(turnkeyLog, /skill:external-redcube-ai/);
    assert.doesNotMatch(turnkeyLog, /health:external-redcube-ai/);
    assert.match(turnkeyLog, /bootstrap:opl-meta-agent/);
    assert.match(turnkeyLog, /health:opl-meta-agent:smoke/);
    assert.match(turnkeyLog, /bootstrap:opl-bookforge/);
    assert.match(turnkeyLog, /health:opl-bookforge:fast/);

    const modules = runCli(['connect', 'modules'], env) as any;
    const byId = new Map<string, any>(modules.modules.items.map((entry: any) => [entry.module_id, entry]));
    assert.equal(byId.get('medautoscience')?.git?.head_sha, nextMasSha);
    assert.equal(byId.get('meddeepscientist')?.installed, false);
    assert.equal(byId.get('redcube')?.installed, true);
    assert.equal(byId.get('oplmetaagent')?.installed, true);
    assert.equal(byId.get('oplbookforge')?.installed, true);
  } finally {
    for (const remote of Object.values(remotes)) {
      fs.rmSync(remote.fixtureRoot, { recursive: true, force: true });
    }
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
