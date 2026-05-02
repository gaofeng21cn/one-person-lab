import { assert, createGitModuleRemoteFixture, fs, os, path, runCli, test } from '../helpers.ts';

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
    assert.equal(initial.modules.summary.total_modules_count, 4);
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

    const readMasModule = () => (
      runCli(['modules'], env) as {
        modules: { items: Array<{ module_id: string; recommended_action: string | null; available_actions: string[]; git: Record<string, unknown> | null }> };
      }
    ).modules.items.find((entry) => entry.module_id === 'medautoscience');
    const syncedMas = readMasModule();
    assert.ok(syncedMas);
    assert.equal(syncedMas.git?.sync_status, 'synced');
    assert.equal(syncedMas.git?.ahead_count, 0);
    assert.equal(syncedMas.git?.behind_count, 0);
    assert.equal(syncedMas.recommended_action, null);
    assert.equal(syncedMas.available_actions.includes('update'), false);

    const nextSha = medAutoScienceRemote.advance(
      'CHANGELOG.md',
      '# Changelog\n\n- Added module update test\n',
      'Advance module remote',
    );
    const behindMas = readMasModule();
    assert.ok(behindMas);
    assert.equal(behindMas.git?.sync_status, 'behind');
    assert.equal(behindMas.git?.behind_count, 1);
    assert.equal(behindMas.recommended_action, 'update');
    assert.equal(behindMas.available_actions.includes('update'), true);

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

test('module install materializes Full runtime payloads into standard managed module roots', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-full-home-'));
  const runtimeRoot = path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
  const rcaRoot = path.join(runtimeRoot, 'modules', 'rca');
  const modulesRoot = path.join(homeRoot, 'opl-state', 'modules');
  const managedRcaRoot = path.join(modulesRoot, 'redcube-ai');
  const turnkeyLogPath = path.join(homeRoot, 'full-runtime-turnkey.log');
  fs.mkdirSync(path.join(rcaRoot, 'plugins', 'rca', '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(rcaRoot, 'plugins', 'rca', 'skills', 'rca'), { recursive: true });
  fs.mkdirSync(path.join(rcaRoot, 'scripts'), { recursive: true });
  fs.writeFileSync(
    path.join(rcaRoot, 'opl-runtime-module.json'),
    JSON.stringify({
      marker_version: 1,
      module_id: 'redcube',
      repo_name: 'redcube-ai',
      packaged_runtime: true,
      source_git: { head_sha: 'rca-full-sha' },
    }),
  );
  fs.writeFileSync(
    path.join(rcaRoot, 'plugins', 'rca', '.codex-plugin', 'plugin.json'),
    JSON.stringify({ name: 'rca', skills: './skills/' }, null, 2),
  );
  fs.writeFileSync(
    path.join(rcaRoot, 'plugins', 'rca', 'skills', 'rca', 'SKILL.md'),
    [
      '---',
      'name: rca',
      'description: Operate RedCube AI through its OPL-managed product entry.',
      '---',
      '',
      '# RCA Skill',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(rcaRoot, 'scripts', 'install-codex-plugin.ts'),
    `import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(turnkeyLogPath)}, 'skill-sync\\n');
process.stdout.write(JSON.stringify({ repo: 'redcube-ai', sync: 'ok' }) + '\\n');
`,
  );
  fs.writeFileSync(
    path.join(rcaRoot, 'scripts', 'opl-module-healthcheck.sh'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'health\\n' >> ${JSON.stringify(turnkeyLogPath)}
`,
    { mode: 0o755 },
  );

  const env = {
    HOME: homeRoot,
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    OPL_MODULE_PATH_REDCUBE: rcaRoot,
  };

  try {
    const beforeInstall = runCli(['modules'], env) as {
      modules: { items: Array<{ module_id: string; installed: boolean; install_origin: string; checkout_path: string }> };
    };
    const beforeRca = beforeInstall.modules.items.find((entry) => entry.module_id === 'redcube');
    assert.equal(beforeRca?.installed, false);
    assert.equal(beforeRca?.install_origin, 'missing');
    assert.equal(beforeRca?.checkout_path, managedRcaRoot);

    const install = runCli(['module', 'install', '--module', 'redcube'], env) as {
      module_action: {
        module: {
          module_id: string;
          install_origin: string;
          checkout_path: string;
          git: { head_sha: string | null } | null;
        };
        turnkey: {
          bootstrap: { status: string };
          skill_sync: { status: string; domain_id: string | null };
          health_check: { status: string };
        };
      };
    };

    assert.equal(install.module_action.module.module_id, 'redcube');
    assert.equal(install.module_action.module.install_origin, 'managed_root');
    assert.equal(install.module_action.module.checkout_path, managedRcaRoot);
    assert.equal(install.module_action.module.git?.head_sha, 'rca-full-sha');
    assert.equal(install.module_action.turnkey.bootstrap.status, 'skipped');
    assert.equal(install.module_action.turnkey.skill_sync.status, 'completed');
    assert.equal(install.module_action.turnkey.skill_sync.domain_id, 'redcube');
    assert.equal(install.module_action.turnkey.health_check.status, 'completed');
    assert.deepEqual(fs.readFileSync(turnkeyLogPath, 'utf8').trim().split('\n'), ['skill-sync', 'health']);
    assert.equal(fs.existsSync(path.join(homeRoot, '.codex', 'skills', 'rca', 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(managedRcaRoot, 'opl-runtime-module.json')), true);
    assert.equal(fs.existsSync(path.join(managedRcaRoot, 'plugins', 'rca', 'skills', 'rca', 'SKILL.md')), true);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
