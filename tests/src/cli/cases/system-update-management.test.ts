import { spawnSync } from 'node:child_process';

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

test('system suppresses compatible Codex CLI aliases from user-facing candidates', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-aliased-codex-home-'));
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  const appBundledCodexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.126.0-alpha.8"
  exit 0
fi
echo "Unsupported app bundled codex fixture command: $*" >&2
exit 1
`);
  const aliasRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-aliases-'));
  const firstAliasRoot = path.join(aliasRoot, 'first');
  const secondAliasRoot = path.join(aliasRoot, 'second');
  const appBundledRoot = path.join(aliasRoot, 'Codex.app', 'Contents', 'Resources');
  fs.mkdirSync(firstAliasRoot, { recursive: true });
  fs.mkdirSync(secondAliasRoot, { recursive: true });
  fs.mkdirSync(appBundledRoot, { recursive: true });
  const firstAlias = path.join(firstAliasRoot, 'codex');
  const secondAlias = path.join(secondAliasRoot, 'codex');
  const appBundledCandidate = path.join(appBundledRoot, 'codex');
  fs.symlinkSync(codexFixture.codexPath, firstAlias);
  fs.symlinkSync(codexFixture.codexPath, secondAlias);
  fs.symlinkSync(appBundledCodexFixture.codexPath, appBundledCandidate);

  try {
    const output = runCli(
      ['system'],
      {
        HOME: homeRoot,
        PATH: `${firstAliasRoot}:${secondAliasRoot}:${codexFixture.fixtureRoot}:${appBundledRoot}:/usr/bin:/bin`,
      },
    ) as {
      system: {
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
              aliases?: string[];
            }>;
          };
        };
      };
    };

    const codex = output.system.core_engines.codex;
    assert.equal(codex.version_status, 'compatible');
    assert.equal(codex.health_status, 'ready');
    assert.deepEqual(codex.issues, []);
    assert.deepEqual(codex.diagnostics, []);
    assert.deepEqual(
      codex.candidates.map((candidate) => [
        candidate.path,
        candidate.selected,
        candidate.parsed_version,
        candidate.version_status,
        candidate.aliases,
      ]),
      [[firstAlias, true, '0.125.0', 'compatible', [secondAlias, codexFixture.codexPath]]],
    );
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(appBundledCodexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(aliasRoot, { recursive: true, force: true });
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

test('system reconcile-modules installs missing modules updates clean modules and reports dirty modules as manual', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-system-reconcile-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const turnkeyLogPath = path.join(homeRoot, 'turnkey.log');
  const buildModuleFiles = (skill: 'mas' | 'mag' | 'rca' | null) => {
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
      files['plugins/rca/.codex-plugin/plugin.json'] = JSON.stringify({ name: 'rca', skills: './skills/' }, null, 2);
      files['plugins/rca/skills/rca/SKILL.md'] = [
        '---',
        'name: rca',
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
    meddeepscientist: createGitModuleRemoteFixture('med-deepscientist', { extraFiles: buildModuleFiles(null) }),
    medautogrant: createGitModuleRemoteFixture('med-autogrant', { extraFiles: buildModuleFiles('mag') }),
    redcube: createGitModuleRemoteFixture('redcube-ai', { extraFiles: buildModuleFiles('rca') }),
  };
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
    OPL_MODULE_REPO_URL_MEDDEEPSCIENTIST: remotes.meddeepscientist.remoteRoot,
    OPL_MODULE_REPO_URL_MEDAUTOGRANT: remotes.medautogrant.remoteRoot,
    OPL_MODULE_REPO_URL_REDCUBE: remotes.redcube.remoteRoot,
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
  };

  try {
    runCli(['module', 'install', '--module', 'medautoscience'], env);
    const grantInstall = runCli(['module', 'install', '--module', 'medautogrant'], env) as {
      module_action: { module: { checkout_path: string } };
    };
    fs.writeFileSync(path.join(grantInstall.module_action.module.checkout_path, 'LOCAL-CHANGE.md'), '# Local change\n');
    const nextMasSha = remotes.medautoscience.advance(
      'CHANGELOG.md',
      '# Changelog\n\n- Available through reconcile\n',
      'Advance MAS for reconcile',
    );
    fs.writeFileSync(turnkeyLogPath, '', 'utf8');

    const output = runCli(['system', 'reconcile-modules'], env) as {
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
    const targets = new Map(output.system_action.details.targets.map((entry) => [entry.target_id, entry]));
    assert.equal(output.system_action.action, 'reconcile_modules');
    assert.equal(output.system_action.status, 'manual_required');
    assert.deepEqual(output.system_action.details.summary, {
      total_targets_count: 4,
      completed_targets_count: 3,
      skipped_targets_count: 0,
      manual_required_targets_count: 1,
    });
    assert.equal(targets.get('medautoscience')?.status, 'completed');
    assert.equal(targets.get('medautoscience')?.reason, 'module_update_available');
    assert.equal(targets.get('meddeepscientist')?.status, 'completed');
    assert.equal(targets.get('meddeepscientist')?.reason, 'module_missing');
    assert.equal(targets.get('redcube')?.status, 'completed');
    assert.equal(targets.get('redcube')?.reason, 'module_reconcile_refresh');
    assert.equal(targets.get('medautogrant')?.status, 'manual_required');
    assert.equal(targets.get('medautogrant')?.reason, 'dirty_checkout');
    const turnkeyLog = fs.readFileSync(turnkeyLogPath, 'utf8');
    assert.match(turnkeyLog, /bootstrap:med-autoscience/);
    assert.match(turnkeyLog, /skill:med-autoscience/);
    assert.match(turnkeyLog, /health:med-autoscience/);
    assert.match(turnkeyLog, /bootstrap:med-deepscientist/);
    assert.match(turnkeyLog, /health:med-deepscientist/);
    assert.doesNotMatch(turnkeyLog, /bootstrap:external-redcube-ai/);
    assert.match(turnkeyLog, /skill:external-redcube-ai/);
    assert.match(turnkeyLog, /health:external-redcube-ai/);

    const modules = runCli(['modules'], env) as {
      modules: {
        items: Array<{ module_id: string; installed: boolean; git: { head_sha: string | null } | null }>;
      };
    };
    const byId = new Map(modules.modules.items.map((entry) => [entry.module_id, entry]));
    assert.equal(byId.get('medautoscience')?.git?.head_sha, nextMasSha);
    assert.equal(byId.get('meddeepscientist')?.installed, true);
    assert.equal(byId.get('redcube')?.installed, true);
  } finally {
    for (const remote of Object.values(remotes)) {
      fs.rmSync(remote.fixtureRoot, { recursive: true, force: true });
    }
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system reconcile-modules promotes Full packaged module seeds to latest managed checkouts', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-system-reconcile-full-seed-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const buildFullSeedModule = (
    moduleId: 'medautoscience' | 'meddeepscientist' | 'medautogrant' | 'redcube',
    repoName: 'med-autoscience' | 'med-deepscientist' | 'med-autogrant' | 'redcube-ai',
    packageName: 'mas' | 'mds' | 'mag' | 'rca',
    extraFiles: Record<string, string> = {},
  ) => {
    const remote = createGitModuleRemoteFixture(repoName, {
      extraFiles: {
        'scripts/opl-module-bootstrap.sh': '#!/usr/bin/env bash\nset -euo pipefail\n',
        'scripts/opl-module-healthcheck.sh': '#!/usr/bin/env bash\nset -euo pipefail\n',
        ...extraFiles,
      },
    });
    const packagedRoot = path.join(homeRoot, 'runtime', 'current', 'modules', packageName);
    const packagedSha = remote.getHeadSha();
    const latestSha = remote.advance(
      'CHANGELOG.md',
      `# Changelog\n\n- Newer online ${repoName} version\n`,
      `Advance ${repoName} after Full package build`,
    );
    fs.cpSync(remote.sourceRoot, packagedRoot, {
      recursive: true,
      dereference: false,
    });
    fs.rmSync(path.join(packagedRoot, '.git'), { recursive: true, force: true });
    fs.writeFileSync(
      path.join(packagedRoot, 'opl-runtime-module.json'),
      JSON.stringify({
        marker_version: 1,
        module_id: moduleId,
        repo_name: repoName,
        packaged_runtime: true,
        source_git: { head_sha: packagedSha },
      }, null, 2),
    );
    return {
      moduleId,
      repoName,
      remote,
      packagedRoot,
      packagedSha,
      latestSha,
    };
  };
  const packagedModules = {
    medautoscience: buildFullSeedModule('medautoscience', 'med-autoscience', 'mas', {
      'plugins/mas/.codex-plugin/plugin.json': JSON.stringify({ name: 'mas', skills: './skills/' }, null, 2),
      'plugins/mas/skills/mas/SKILL.md': '---\nname: mas\ndescription: MAS fixture.\n---\n\n# MAS\n',
      'scripts/install-codex-plugin.sh': '#!/usr/bin/env bash\nset -euo pipefail\nprintf \'{"sync":"ok"}\\n\'\n',
    }),
    meddeepscientist: buildFullSeedModule('meddeepscientist', 'med-deepscientist', 'mds'),
    medautogrant: buildFullSeedModule('medautogrant', 'med-autogrant', 'mag', {
      'plugins/mag/.codex-plugin/plugin.json': JSON.stringify({ name: 'mag', skills: './skills/' }, null, 2),
      'plugins/mag/skills/mag/SKILL.md': '---\nname: mag\ndescription: MAG fixture.\n---\n\n# MAG\n',
      'scripts/install-codex-plugin.sh': '#!/usr/bin/env bash\nset -euo pipefail\nprintf \'{"sync":"ok"}\\n\'\n',
    }),
    redcube: buildFullSeedModule('redcube', 'redcube-ai', 'rca', {
      'plugins/rca/.codex-plugin/plugin.json': JSON.stringify({ name: 'rca', skills: './skills/' }, null, 2),
      'plugins/rca/skills/rca/SKILL.md': '---\nname: rca\ndescription: RCA fixture.\n---\n\n# RCA\n',
      'scripts/install-codex-plugin.ts': [
        '#!/usr/bin/env node',
        'console.log(JSON.stringify({ sync: "ok" }));',
        '',
      ].join('\n'),
    }),
  };
  const env = {
    HOME: homeRoot,
    OPL_MODULES_ROOT: modulesRoot,
    OPL_MODULE_PATH_MEDAUTOSCIENCE: packagedModules.medautoscience.packagedRoot,
    OPL_MODULE_PATH_MEDDEEPSCIENTIST: packagedModules.meddeepscientist.packagedRoot,
    OPL_MODULE_PATH_MEDAUTOGRANT: packagedModules.medautogrant.packagedRoot,
    OPL_MODULE_PATH_REDCUBE: packagedModules.redcube.packagedRoot,
    OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: packagedModules.medautoscience.remote.remoteRoot,
    OPL_MODULE_REPO_URL_MEDDEEPSCIENTIST: packagedModules.meddeepscientist.remote.remoteRoot,
    OPL_MODULE_REPO_URL_MEDAUTOGRANT: packagedModules.medautogrant.remote.remoteRoot,
    OPL_MODULE_REPO_URL_REDCUBE: packagedModules.redcube.remote.remoteRoot,
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
  };

  try {
    for (const moduleId of Object.keys(packagedModules)) {
      const install = runCli(['module', 'install', '--module', moduleId], env) as {
        module_action: {
          module: {
            checkout_path: string;
            git: { head_sha: string | null; sync_status: string };
            recommended_action: string | null;
            available_actions: string[];
          };
        };
      };
      const packaged = packagedModules[moduleId as keyof typeof packagedModules];
      assert.equal(install.module_action.module.git.head_sha, packaged.packagedSha);
      assert.equal(install.module_action.module.git.sync_status, 'no_upstream');
      assert.equal(install.module_action.module.recommended_action, 'update');
      assert.equal(install.module_action.module.available_actions.includes('update'), true);
      assert.equal(fs.existsSync(path.join(install.module_action.module.checkout_path, 'opl-runtime-module.json')), true);
    }

    const output = runCli(['system', 'reconcile-modules'], env) as {
      system_action: {
        status: string;
        details: {
          targets: Array<{ target_id: string; status: string; reason: string }>;
        };
      };
    };
    assert.equal(output.system_action.status, 'completed');
    const targets = new Map(output.system_action.details.targets.map((entry) => [entry.target_id, entry]));
    for (const moduleId of Object.keys(packagedModules)) {
      assert.equal(targets.get(moduleId)?.status, 'completed');
      assert.equal(targets.get(moduleId)?.reason, 'module_update_available');
    }

    const modules = runCli(['modules'], env) as {
      modules: {
        items: Array<{
          module_id: string;
          install_origin: string;
          git: { head_sha: string | null; sync_status: string; upstream_ref: string | null } | null;
          recommended_action: string | null;
        }>;
      };
    };
    const modulesById = new Map(modules.modules.items.map((entry) => [entry.module_id, entry]));
    for (const [moduleId, packaged] of Object.entries(packagedModules)) {
      const module = modulesById.get(moduleId);
      assert.equal(module?.install_origin, 'managed_root');
      assert.equal(module?.git?.head_sha, packaged.latestSha);
      assert.equal(module?.git?.sync_status, 'synced');
      assert.equal(module?.git?.upstream_ref, 'origin/main');
      assert.equal(module?.recommended_action, null);
      assert.equal(fs.existsSync(path.join(modulesRoot, packaged.repoName, 'opl-runtime-module.json')), false);
    }
  } finally {
    for (const packaged of Object.values(packagedModules)) {
      fs.rmSync(packaged.remote.fixtureRoot, { recursive: true, force: true });
    }
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
