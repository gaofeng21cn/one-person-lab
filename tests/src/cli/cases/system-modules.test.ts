import {
  assert,
  createGitModuleRemoteFixture,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  runCliInCwd,
  test,
} from '../helpers.ts';
import { runGitFixtureCommand } from '../helpers-parts/family-fixtures.ts';
import { writeFakeOmaGeneratedSurfacePack } from '../../cli-codex-default-shell-helpers.ts';
import { parseGitStatusPorcelainV2 } from '../../../../src/modules/connect/system-installation/module-git.ts';
import { DOMAIN_MODULE_SPECS } from '../../../../src/modules/connect/system-installation/module-specs.ts';
import './system-modules-cases/mds-skill-boundary.ts';

test('git status porcelain v2 parser preserves sync and dirty state', () => {
  assert.deepEqual(
    parseGitStatusPorcelainV2([
      '# branch.oid 0123456789abcdef0123456789abcdef01234567',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -3',
      '1 .M N... 100644 100644 100644 0123456 0123456 tracked.txt',
      '',
    ].join('\n')),
    {
      branch: 'main',
      head_sha: '0123456789abcdef0123456789abcdef01234567',
      upstream_ref: 'origin/main',
      ahead_count: 2,
      behind_count: 3,
      sync_status: 'diverged',
      dirty: true,
    },
  );

  assert.deepEqual(
    parseGitStatusPorcelainV2([
      '# branch.oid fedcba9876543210fedcba9876543210fedcba98',
      '# branch.head (detached)',
      '',
    ].join('\n')),
    {
      branch: null,
      head_sha: 'fedcba9876543210fedcba9876543210fedcba98',
      upstream_ref: null,
      ahead_count: null,
      behind_count: null,
      sync_status: 'no_upstream',
      dirty: false,
    },
  );
});

test('Book Forge fallback bootstrap does not create an untracked package lock', () => {
  const checkoutPath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bookforge-bootstrap-'));
  try {
    const bookForge = DOMAIN_MODULE_SPECS.find((module) => module.module_id === 'oplbookforge');
    assert.deepEqual(bookForge?.bootstrap_command?.(checkoutPath), {
      command: 'npm',
      args: ['install', '--no-package-lock'],
    });
  } finally {
    fs.rmSync(checkoutPath, { recursive: true, force: true });
  }
});

test('MAS runtime preparation probes its declarative carrier without a private exec entry', () => {
  const checkoutPath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mas-runtime-spec-'));
  try {
    const mas = DOMAIN_MODULE_SPECS.find((module) => module.module_id === 'medautoscience');
    const expectedProbe = {
      command: 'node',
      args: [
        '-e',
        'const fs=require("node:fs");for(const p of process.argv.slice(1)){if(!fs.statSync(p).isFile())process.exit(1)}',
        path.join(checkoutPath, 'contracts', 'action_catalog.json'),
        path.join(checkoutPath, 'contracts', 'domain_handler_registry.json'),
        path.join(checkoutPath, 'contracts', 'pack_compiler_input.json'),
        path.join(checkoutPath, 'agent', 'stages', 'manifest.json'),
        path.join(checkoutPath, 'agent', 'primary_skill', 'SKILL.md'),
      ],
    };
    assert.deepEqual(mas?.bootstrap_command?.(checkoutPath), expectedProbe);
    assert.deepEqual(mas?.health_check_command?.(checkoutPath), expectedProbe);
    assert.deepEqual(mas?.runtime_probe_command?.(checkoutPath), expectedProbe);
    assert.equal(mas?.exec_command, undefined);
  } finally {
    fs.rmSync(checkoutPath, { recursive: true, force: true });
  }
});

test('RCA runtime preparation uses only its repo-owned healthcheck and exposes no private exec entry', () => {
  const checkoutPath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-rca-runtime-spec-'));
  const scriptsPath = path.join(checkoutPath, 'scripts');
  const healthcheckPath = path.join(scriptsPath, 'opl-module-healthcheck.sh');
  fs.mkdirSync(scriptsPath, { recursive: true });
  fs.writeFileSync(healthcheckPath, '#!/usr/bin/env bash\n');
  try {
    const rca = DOMAIN_MODULE_SPECS.find((module) => module.module_id === 'redcube');
    const expectedHealthcheck = {
      command: 'bash',
      args: [healthcheckPath],
    };
    assert.deepEqual(rca?.health_check_command?.(checkoutPath), expectedHealthcheck);
    assert.deepEqual(rca?.package_health_check_command?.(checkoutPath), expectedHealthcheck);
    assert.deepEqual(rca?.runtime_probe_command?.(checkoutPath), expectedHealthcheck);
    assert.equal(rca?.exec_command, undefined);
  } finally {
    fs.rmSync(checkoutPath, { recursive: true, force: true });
  }
});

function createBasicMasModuleRemoteFixture(turnkeyLogPath: string) {
  return createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'plugins/med-autoscience/.codex-plugin/plugin.json': JSON.stringify({
        name: 'med-autoscience',
        skills: './skills/',
      }, null, 2),
      'plugins/med-autoscience/skills/med-autoscience/SKILL.md': [
        '---',
        'name: med-autoscience',
        'description: Use MAS runtime through its OPL-managed product entry.',
        '---',
        '',
        '# MAS App Skill',
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
printf 'health\\n' >> ${JSON.stringify(turnkeyLogPath)}
`,
    },
  });
}

function readLines(filePath: string) {
  return fs.readFileSync(filePath, 'utf8').trim().split('\n');
}

test('modules and module actions manage OPL-owned domain module installs and updates', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-modules-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const turnkeyLogPath = path.join(homeRoot, 'turnkey.log');
  const medAutoScienceRemote = createBasicMasModuleRemoteFixture(turnkeyLogPath);
  const env = {
    HOME: homeRoot,
    OPL_MODULES_ROOT: modulesRoot,
    OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: medAutoScienceRemote.remoteRoot,
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
  };

  try {
    const initial = runCli(['connect', 'modules'], env) as any;
    assert.equal(initial.modules.summary.total_modules_count, 7);
    const initialMasDependencyReadback = initial.modules.items.find((entry: any) => entry.module_id === 'medautoscience');
    assert.deepEqual(
      initialMasDependencyReadback?.capability_dependencies.map((dependency: any) => ({
        package_id: dependency.package_id,
        codex_distribution: dependency.codex_distribution,
        opl_distribution: dependency.opl_distribution,
        developer_distribution: dependency.developer_distribution,
      })),
      [
        {
          package_id: 'mas-scholar-skills',
          codex_distribution: 'bundled',
          opl_distribution: 'managed_dependency',
          developer_distribution: 'source_checkout',
        },
      ],
    );
    const initialMas = initial.modules.items.find((entry: any) => entry.module_id === 'medautoscience');
    assert.ok(initialMas);
    assert.equal(initialMas.installed, false);
    assert.equal(initialMas.install_origin, 'missing');
    assert.equal(initialMas.available_actions.includes('install'), true);

    const install = runCli(
      ['connect', 'install', '--module', 'medautoscience'],
      env,
    ) as any;
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
    assert.equal(fs.existsSync(turnkeyLogPath), false);
    const globalMasSkillPath = path.join(homeRoot, '.codex', 'skills', 'mas', 'SKILL.md');
    assert.equal(fs.existsSync(globalMasSkillPath), false);

    const readMasModule = () => (
      runCli(['connect', 'modules'], env) as any
    ).modules.items.find((entry: any) => entry.module_id === 'medautoscience');
    const syncedMas = readMasModule();
    assert.ok(syncedMas);
    assert.equal(syncedMas.git?.sync_status, 'synced');
    assert.equal(syncedMas.git?.ahead_count, 0);
    assert.equal(syncedMas.git?.behind_count, 0);
    assert.equal(syncedMas.recommended_action, null);
    assert.equal(syncedMas.available_actions.includes('update'), false);

    const nextSha = medAutoScienceRemote.advance(
      'plugins/med-autoscience/skills/med-autoscience/SKILL.md',
      [
        '---',
        'name: med-autoscience',
        'description: Use when Codex should operate MedAutoScience through the updated global skill mirror.',
        '---',
        '',
        '# MAS App Skill',
        '',
        'Use this updated fixture after module update.',
        '',
      ].join('\n'),
      'Advance module remote',
    );
    const behindMas = readMasModule();
    assert.ok(behindMas);
    assert.equal(behindMas.git?.sync_status, 'behind');
    assert.equal(behindMas.git?.behind_count, 1);
    assert.equal(behindMas.recommended_action, 'update');
    assert.equal(behindMas.available_actions.includes('update'), true);

    const update = runCli(
      ['connect', 'update', '--module', 'medautoscience'],
      env,
    ) as any;
    assert.equal(update.module_action.action, 'update');
    assert.equal(update.module_action.status, 'completed');
    assert.equal(update.module_action.module.git.head_sha, nextSha);
    assert.equal(fs.existsSync(turnkeyLogPath), false);
    assert.equal(fs.existsSync(globalMasSkillPath), false);

    const remove = runCli(
      ['connect', 'remove', '--module', 'medautoscience'],
      env,
    ) as any;
    assert.equal(remove.module_action.action, 'remove');
    assert.equal(remove.module_action.status, 'completed');
    assert.equal(remove.module_action.module.installed, false);
    assert.equal(fs.existsSync(remove.module_action.module.checkout_path), false);
  } finally {
    fs.rmSync(medAutoScienceRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('module install creates an OPL-managed root even when a sibling checkout is visible', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-sibling-install-home-'));
  const workspaceRoot = path.join(homeRoot, 'workspace');
  const onePersonLabRoot = path.join(workspaceRoot, 'one-person-lab');
  const siblingCheckout = path.join(workspaceRoot, 'opl-meta-agent');
  const modulesRoot = path.join(homeRoot, 'opl-state', 'modules');
  const healthcheckLogPath = path.join(homeRoot, 'oma-healthcheck.log');
  const omaExtraFiles: Record<string, string> = {
    'scripts/opl-module-bootstrap.sh': '#!/usr/bin/env bash\nset -euo pipefail\n',
    'scripts/verify.sh': [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `printf '%s\\n' "$1" > ${JSON.stringify(healthcheckLogPath)}`,
      'test "$1" = "smoke"',
      '',
    ].join('\n'),
  };
  const metaRemote = createGitModuleRemoteFixture('opl-meta-agent', {
    extraFiles: omaExtraFiles,
    executableFiles: ['scripts/verify.sh'],
  });
  writeFakeOmaGeneratedSurfacePack(metaRemote.sourceRoot);
  runGitFixtureCommand(metaRemote.sourceRoot, ['add', 'agent', 'contracts', 'plugins', 'runtime']);
  runGitFixtureCommand(metaRemote.sourceRoot, ['commit', '-m', 'Add OMA generated surface contract pack']);
  runGitFixtureCommand(metaRemote.sourceRoot, ['push', 'origin', 'main']);

  try {
    fs.mkdirSync(onePersonLabRoot, { recursive: true });
    runGitFixtureCommand(workspaceRoot, ['clone', metaRemote.remoteRoot, siblingCheckout]);
    fs.writeFileSync(path.join(siblingCheckout, 'LOCAL_EDIT.txt'), 'dirty sibling\n', 'utf8');

    const env = {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_MODULE_REPO_URL_OPLMETAAGENT: metaRemote.remoteRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_DEVELOPER_MODE_GH_FIXTURE: JSON.stringify({ login: 'ordinary-user' }),
    };

    const beforeInstall = runCliInCwd(['connect', 'modules'], onePersonLabRoot, env) as any;
    const beforeMeta = beforeInstall.modules.items.find((entry: any) => entry.module_id === 'oplmetaagent');
    assert.equal(beforeMeta?.install_origin, 'sibling_workspace');
    assert.equal(beforeMeta?.checkout_path, siblingCheckout);
    assert.equal(beforeMeta?.health_status, 'dirty');

    const install = runCliInCwd(
      ['connect', 'install', '--module', 'oplmetaagent'],
      onePersonLabRoot,
      env,
    ) as any;

    const managedCheckout = path.join(modulesRoot, 'opl-meta-agent');
    assert.equal(install.module_action.action, 'install');
    assert.equal(install.module_action.module.module_id, 'oplmetaagent');
    assert.equal(install.module_action.module.install_origin, 'managed_root');
    assert.equal(install.module_action.module.checkout_path, managedCheckout);
    assert.equal(install.module_action.module.managed_checkout_path, managedCheckout);
    assert.equal(install.module_action.module.git.dirty, false);
    assert.equal(install.module_action.turnkey.skill_sync.status, 'completed');
    assert.equal(install.module_action.turnkey.skill_sync.domain_id, 'oplmetaagent');
    assert.equal(install.module_action.turnkey.health_check.status, 'completed');
    assert.equal(fs.readFileSync(healthcheckLogPath, 'utf8').trim(), 'smoke');
    assert.equal(fs.existsSync(path.join(managedCheckout, 'README.md')), true);
    assert.equal(fs.existsSync(path.join(siblingCheckout, 'LOCAL_EDIT.txt')), true);
  } finally {
    fs.rmSync(metaRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('module install is idempotent when the managed checkout already exists', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-existing-managed-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const turnkeyLogPath = path.join(homeRoot, 'turnkey.log');
  const medAutoScienceRemote = createBasicMasModuleRemoteFixture(turnkeyLogPath);
  const managedCheckout = path.join(modulesRoot, 'med-autoscience');

  try {
    fs.mkdirSync(modulesRoot, { recursive: true });
    runGitFixtureCommand(modulesRoot, ['clone', medAutoScienceRemote.remoteRoot, managedCheckout]);

    const env = {
      HOME: homeRoot,
      OPL_MODULES_ROOT: modulesRoot,
      OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: medAutoScienceRemote.remoteRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    };

    const install = runCli(
      ['connect', 'install', '--module', 'medautoscience'],
      env,
    ) as any;

    assert.equal(install.module_action.action, 'install');
    assert.equal(install.module_action.status, 'completed');
    assert.equal(install.module_action.module.installed, true);
    assert.equal(install.module_action.module.install_origin, 'managed_root');
    assert.equal(install.module_action.module.checkout_path, managedCheckout);
    assert.equal(fs.existsSync(turnkeyLogPath), false);
  } finally {
    fs.rmSync(medAutoScienceRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('module install replaces a non-empty invalid managed checkout', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-invalid-managed-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const turnkeyLogPath = path.join(homeRoot, 'turnkey.log');
  const medAutoScienceRemote = createBasicMasModuleRemoteFixture(turnkeyLogPath);
  const managedCheckout = path.join(modulesRoot, 'med-autoscience');

  try {
    fs.mkdirSync(managedCheckout, { recursive: true });
    fs.writeFileSync(path.join(managedCheckout, 'stale-partial-install.txt'), 'partial\n');

    const env = {
      HOME: homeRoot,
      OPL_MODULES_ROOT: modulesRoot,
      OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: medAutoScienceRemote.remoteRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    };

    const install = runCli(
      ['connect', 'install', '--module', 'medautoscience'],
      env,
    ) as any;

    assert.equal(install.module_action.action, 'install');
    assert.equal(install.module_action.status, 'completed');
    assert.equal(install.module_action.module.installed, true);
    assert.equal(install.module_action.module.install_origin, 'managed_root');
    assert.equal(install.module_action.module.checkout_path, managedCheckout);
    assert.equal(fs.existsSync(path.join(managedCheckout, '.git')), true);
    assert.equal(fs.existsSync(path.join(managedCheckout, 'stale-partial-install.txt')), false);
    assert.equal(fs.existsSync(turnkeyLogPath), false);
  } finally {
    fs.rmSync(medAutoScienceRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('modules projection prefers local developer checkouts when Developer Mode is explicitly on', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-developer-mode-home-'));
  const workspaceRoot = path.join(homeRoot, 'workspace');
  const onePersonLabRoot = path.join(workspaceRoot, 'one-person-lab');
  const siblingCheckout = path.join(workspaceRoot, 'med-autoscience');
  const modulesRoot = path.join(homeRoot, 'opl-state', 'modules');
  const stateDir = path.join(homeRoot, 'opl-state');
  const medAutoScienceRemote = createGitModuleRemoteFixture('med-autoscience');

  try {
    fs.mkdirSync(onePersonLabRoot, { recursive: true });
    runGitFixtureCommand(workspaceRoot, ['clone', medAutoScienceRemote.remoteRoot, siblingCheckout]);
    runGitFixtureCommand(workspaceRoot, ['clone', medAutoScienceRemote.remoteRoot, path.join(modulesRoot, 'med-autoscience')]);

    const env = {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_DEVELOPER_MODE_GH_FIXTURE: JSON.stringify({
        user: { login: 'gaofeng21cn' },
        permissions: {
          'gaofeng21cn/one-person-lab': 'admin',
          'gaofeng21cn/med-autoscience': 'write',
          'gaofeng21cn/med-autogrant': 'maintain',
          'gaofeng21cn/opl-meta-agent': 'write',
          'gaofeng21cn/redcube-ai': 'admin',
        },
      }),
    };

    runCliInCwd(['workspace', 'root', 'set', '--path', workspaceRoot], onePersonLabRoot, env);

    runCliInCwd(
      [
        'system',
        'developer-supervisor',
        '--enabled',
        'on',
        '--mode',
        'developer_apply_safe',
        '--github-login',
        'gaofeng21cn',
      ],
      onePersonLabRoot,
      env,
    );

    const output = runCliInCwd(['connect', 'modules'], onePersonLabRoot, env) as any;

    const mas = output.modules.items.find((entry: any) => entry.module_id === 'medautoscience');
    assert.equal(mas?.install_origin, 'sibling_workspace');
    assert.equal(mas?.checkout_path, siblingCheckout);
    assert.equal(mas?.managed_checkout_path, path.join(modulesRoot, 'med-autoscience'));
    assert.equal(mas?.source_policy.source_preference, 'auto');
    assert.equal(mas?.source_policy.developer_checkout_path, siblingCheckout);
    assert.deepEqual(mas?.capabilities.source_channel, {
      status: 'ready',
      level: 'local_checkout',
      source: 'developer_mode',
      impact: 'This module is read from a local developer checkout.',
    });
    assert.equal(output.modules.summary.managed_default_modules_count, 0);

    runCliInCwd(
      ['system', 'developer-supervisor', '--mode', 'external_observe'],
      onePersonLabRoot,
      env,
    );
    const observeOnlyOutput = runCliInCwd(['connect', 'modules'], onePersonLabRoot, env) as any;
    const observeOnlyMas = observeOnlyOutput.modules.items.find((entry: any) => entry.module_id === 'medautoscience');
    assert.equal(observeOnlyMas?.install_origin, 'sibling_workspace');
    assert.equal(observeOnlyMas?.source_policy.configured_by, 'developer_mode');

    runCliInCwd(
      ['system', 'developer-supervisor', '--module', 'medautoscience', '--module-source', 'managed'],
      onePersonLabRoot,
      env,
    );
    const managedOutput = runCliInCwd(['connect', 'modules'], onePersonLabRoot, env) as any;
    const managedMas = managedOutput.modules.items.find((entry: any) => entry.module_id === 'medautoscience');
    assert.equal(managedMas?.install_origin, 'managed_root');
    assert.equal(managedMas?.source_policy.source_preference, 'managed');
    assert.equal(managedMas?.source_policy.configured_by, 'developer_mode_managed_override');

    runCliInCwd(
      ['system', 'developer-supervisor', '--enabled', 'off'],
      onePersonLabRoot,
      env,
    );
    runCliInCwd(
      ['system', 'developer-supervisor', '--module', 'medautoscience', '--module-source', 'developer'],
      onePersonLabRoot,
      env,
    );
    const developerOutput = runCliInCwd(['connect', 'modules'], onePersonLabRoot, env) as any;
    const developerMas = developerOutput.modules.items.find((entry: any) => entry.module_id === 'medautoscience');
    assert.equal(developerMas?.install_origin, 'sibling_workspace');
    assert.equal(developerMas?.source_policy.source_preference, 'developer');
    assert.equal(developerMas?.source_policy.configured_by, 'developer_mode_package_override');

    fs.rmSync(siblingCheckout, { recursive: true, force: true });
    fs.mkdirSync(siblingCheckout, { recursive: true });
    const fallbackOutput = runCliInCwd(['connect', 'modules'], onePersonLabRoot, env) as any;
    const fallbackMas = fallbackOutput.modules.items.find((entry: any) => entry.module_id === 'medautoscience');
    assert.equal(fallbackMas?.install_origin, 'managed_root');
    assert.equal(fallbackMas?.source_policy.source_preference, 'developer');
    assert.equal(fallbackMas?.source_policy.fallback_reason, 'developer_checkout_unavailable');
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
  const primarySkill = [
    '---',
    'name: rca',
    'description: Operate RedCube AI through its OPL-managed product entry.',
    '---',
    '',
    '# RCA Skill',
    '',
  ].join('\n');
  fs.mkdirSync(path.join(rcaRoot, 'agent', 'primary_skill'), { recursive: true });
  fs.mkdirSync(path.join(rcaRoot, 'plugins', 'redcube-ai', '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(rcaRoot, 'plugins', 'redcube-ai', 'skills', 'redcube-ai'), { recursive: true });
  fs.mkdirSync(path.join(rcaRoot, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(rcaRoot, 'agent', 'primary_skill', 'SKILL.md'), primarySkill);
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
    path.join(rcaRoot, 'plugins', 'redcube-ai', '.codex-plugin', 'plugin.json'),
    JSON.stringify({ name: 'redcube-ai', skills: './skills/' }, null, 2),
  );
  fs.writeFileSync(
    path.join(rcaRoot, 'plugins', 'redcube-ai', 'skills', 'redcube-ai', 'SKILL.md'),
    primarySkill,
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
printf 'health-should-not-run\\n' >> ${JSON.stringify(turnkeyLogPath)}
git ls-files >/dev/null
`,
    { mode: 0o755 },
  );

  const env = {
    HOME: homeRoot,
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    OPL_MODULE_PATH_REDCUBE: rcaRoot,
  };

  try {
    const beforeInstall = runCli(['connect', 'modules'], env) as any;
    const beforeRca = beforeInstall.modules.items.find((entry: any) => entry.module_id === 'redcube');
    assert.equal(beforeRca?.installed, false);
    assert.equal(beforeRca?.install_origin, 'missing');
    assert.equal(beforeRca?.checkout_path, managedRcaRoot);

    const install = runCli(['connect', 'install', '--module', 'redcube'], env) as any;

    assert.equal(install.module_action.module.module_id, 'redcube');
    assert.equal(install.module_action.module.install_origin, 'managed_root');
    assert.equal(install.module_action.module.checkout_path, managedRcaRoot);
    assert.equal(install.module_action.module.git?.head_sha, 'rca-full-sha');
    assert.equal(install.module_action.turnkey.bootstrap.status, 'skipped');
    assert.equal(install.module_action.turnkey.skill_sync.status, 'completed');
    assert.equal(install.module_action.turnkey.skill_sync.domain_id, 'redcube');
    assert.equal(install.module_action.turnkey.health_check.status, 'completed');
    assert.equal(install.module_action.turnkey.health_check.result.packaged_runtime, true);
    assert.equal(fs.existsSync(turnkeyLogPath), false);
    assert.equal(fs.existsSync(path.join(homeRoot, '.codex', 'skills', 'rca', 'SKILL.md')), false);
    assert.equal(fs.existsSync(path.join(managedRcaRoot, 'opl-runtime-module.json')), true);
    assert.equal(fs.existsSync(path.join(managedRcaRoot, 'plugins', 'redcube-ai', 'skills', 'redcube-ai', 'SKILL.md')), true);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('modules projection treats Full runtime packaged overrides as launch sources', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-full-launch-home-'));
  const runtimeRoot = path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
  const packagedModules = [
    ['medautoscience', 'med-autoscience', 'mas'],
    ['medautogrant', 'med-autogrant', 'mag'],
    ['redcube', 'redcube-ai', 'rca'],
    ['oplmetaagent', 'opl-meta-agent', 'meta-agent'],
    ['oplbookforge', 'opl-bookforge', 'opl-bookforge'],
    ['scholarskills', 'mas-scholar-skills', 'mas-scholar-skills'],
  ] as const;

  try {
    const env: Record<string, string> = {
      HOME: homeRoot,
      OPL_FULL_RUNTIME_HOME: runtimeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
    };

    for (const [moduleId, repoName, runtimeSlot] of packagedModules) {
      const moduleRoot = path.join(runtimeRoot, 'modules', runtimeSlot);
      fs.mkdirSync(path.join(moduleRoot, 'agent'), { recursive: true });
      fs.mkdirSync(path.join(moduleRoot, 'plugins'), { recursive: true });
      fs.writeFileSync(
        path.join(moduleRoot, 'opl-runtime-module.json'),
        JSON.stringify({
          marker_version: 1,
          module_id: moduleId,
          repo_name: repoName,
          packaged_runtime: true,
          source_git: { head_sha: `${moduleId}-full-sha` },
        }),
      );
      env[`OPL_MODULE_PATH_${moduleId.toUpperCase()}`] = moduleRoot;
    }

    const output = runCli(['connect', 'modules'], env) as any;

    const defaultPackagedModuleCount = packagedModules.filter(([moduleId]) => moduleId !== 'scholarskills').length;
    assert.equal(output.modules.summary.installed_default_modules_count, defaultPackagedModuleCount);
    assert.equal(output.modules.summary.healthy_default_modules_count, defaultPackagedModuleCount);
    const modulesById = new Map<string, any>(output.modules.items.map((entry: any) => [entry.module_id, entry]));
    for (const [moduleId] of packagedModules) {
      const module = modulesById.get(moduleId);
      assert.equal(module?.installed, true);
      assert.equal(module?.install_origin, 'env_override');
      assert.equal(module?.health_status, 'ready');
      assert.equal(module?.available_actions.length, 0);
      assert.equal(module?.recommended_action, null);
      assert.equal(module?.git?.head_sha, `${moduleId}-full-sha`);
      assert.equal(module?.git?.sync_status, 'no_upstream');
    }
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('module exec runs supported domain CLIs from the current checkout and rejects retired private entries', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-exec-home-'));
  const fakeBinRoot = path.join(homeRoot, 'fake-bin');
  const magRunnerArgvPath = path.join(homeRoot, 'mag-runner.argv');
  const magRunnerCwdPath = path.join(homeRoot, 'mag-runner.cwd');
  const uvArgvPath = path.join(homeRoot, 'uv.argv');
  const uvCwdPath = path.join(homeRoot, 'uv.cwd');
  const npmArgvPath = path.join(homeRoot, 'npm.argv');
  const npmCwdPath = path.join(homeRoot, 'npm.cwd');
  fs.mkdirSync(fakeBinRoot, { recursive: true });
  fs.writeFileSync(
    path.join(fakeBinRoot, 'uv'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$PWD" > ${JSON.stringify(uvCwdPath)}
: > ${JSON.stringify(uvArgvPath)}
for arg in "$@"; do
  printf '%s\\n' "$arg" >> ${JSON.stringify(uvArgvPath)}
done
printf '{"ok":true,"runner":"uv"}\\n'
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(fakeBinRoot, 'medautosci'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'PATH medautosci should not be used\\n' >&2
exit 43
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(fakeBinRoot, 'npm'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$PWD" > ${JSON.stringify(npmCwdPath)}
: > ${JSON.stringify(npmArgvPath)}
for arg in "$@"; do
  printf '%s\\n' "$arg" >> ${JSON.stringify(npmArgvPath)}
done
printf '{"ok":true,"runner":"npm"}\\n'
`,
    { mode: 0o755 },
  );
  const masFixture = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'scripts/run-python-clean.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf 'retired MAS CLI entry must not run\\n' >&2`,
        'exit 43',
        '',
      ].join('\n'),
    },
    executableFiles: ['scripts/run-python-clean.sh'],
  });
  const magFixture = createGitModuleRemoteFixture('med-autogrant', {
    extraFiles: {
      'scripts/run-python-clean.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf '%s\\n' "$PWD" > ${JSON.stringify(magRunnerCwdPath)}`,
        `: > ${JSON.stringify(magRunnerArgvPath)}`,
        `for arg in "$@"; do printf '%s\\n' "$arg" >> ${JSON.stringify(magRunnerArgvPath)}; done`,
        `printf '{"ok":true,"runner":"mag-clean-runner"}\\n'`,
        '',
      ].join('\n'),
    },
    executableFiles: ['scripts/run-python-clean.sh'],
  });
  const rcaFixture = createGitModuleRemoteFixture('redcube-ai');
  const metaFixture = createGitModuleRemoteFixture('opl-meta-agent');
  const mdsFixture = createGitModuleRemoteFixture('med-deepscientist');
  const env = {
    HOME: homeRoot,
    PATH: `${fakeBinRoot}:${process.env.PATH ?? ''}`,
    OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masFixture.sourceRoot,
    OPL_MODULE_PATH_MEDAUTOGRANT: magFixture.sourceRoot,
    OPL_MODULE_PATH_REDCUBE: rcaFixture.sourceRoot,
    OPL_MODULE_PATH_OPLMETAAGENT: metaFixture.sourceRoot,
    OPL_MODULE_PATH_MEDDEEPSCIENTIST: mdsFixture.sourceRoot,
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
  };
  const realpath = (filePath: string) => fs.realpathSync(filePath);

  try {
    const masFailure = runCliFailure(
      ['connect', 'exec', '--module', 'medautoscience', '--', 'doctor', 'entry-modes', '--json'],
      env,
    );
    assert.equal(masFailure.status, 2);
    assert.equal(masFailure.payload.error.code, 'cli_usage_error');
    assert.match(masFailure.payload.error.message, /does not expose an OPL module exec entry/);
    assert.equal(fs.existsSync(uvCwdPath), false);

    const magExec = runCli(
      ['connect', 'exec', '--module', 'mag', '--', '--help'],
      env,
    ) as any;
    assert.equal(magExec.module_exec.module_id, 'medautogrant');
    assert.equal(magExec.module_exec.working_directory, magFixture.sourceRoot);
    assert.deepEqual(magExec.module_exec.result, { ok: true, runner: 'mag-clean-runner' });
    assert.deepEqual(magExec.module_exec.command_preview, [
      path.join(magFixture.sourceRoot, 'scripts', 'run-python-clean.sh'),
      '-m',
      'med_autogrant.cli',
      '--help',
    ]);
    assert.equal(realpath(fs.readFileSync(magRunnerCwdPath, 'utf8').trim()), realpath(magFixture.sourceRoot));
    assert.deepEqual(readLines(magRunnerArgvPath), magExec.module_exec.command_preview.slice(1));
    assert.equal(fs.existsSync(uvCwdPath), false);
    assert.equal(fs.existsSync(uvArgvPath), false);

    const rcaFailure = runCliFailure(
      ['connect', 'exec', '--module', 'redcube', '--', 'product', 'manifest', '--workspace-root', '/tmp/demo'],
      env,
    );
    assert.equal(rcaFailure.status, 2);
    assert.equal(rcaFailure.payload.error.code, 'cli_usage_error');
    assert.match(rcaFailure.payload.error.message, /does not expose an OPL module exec entry/);
    assert.equal(fs.existsSync(npmCwdPath), false);
    assert.equal(fs.existsSync(npmArgvPath), false);

    const mdsFailure = runCliFailure(
      ['connect', 'exec', '--module', 'mds', '--', '--help'],
      env,
    );
    assert.equal(mdsFailure.status, 2);
    assert.equal(mdsFailure.payload.error.code, 'cli_usage_error');
    assert.match(mdsFailure.payload.error.message, /does not expose an OPL module exec entry/);
  } finally {
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(magFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(rcaFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(metaFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(mdsFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('module exec captures large domain CLI stdout without default spawnSync ENOBUFS', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-exec-buffer-home-'));
  const magFixture = createGitModuleRemoteFixture('med-autogrant', {
    extraFiles: {
      'scripts/run-python-clean.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf '%*s' ${2 * 1024 * 1024} '' | tr ' ' x`,
        '',
      ].join('\n'),
    },
    executableFiles: ['scripts/run-python-clean.sh'],
  });
  const fakeBinRoot = path.join(homeRoot, 'fake-bin');
  fs.mkdirSync(fakeBinRoot, { recursive: true });
  const env = {
    HOME: homeRoot,
    PATH: `${fakeBinRoot}:${process.env.PATH ?? ''}`,
    OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
    OPL_MODULE_PATH_MEDAUTOGRANT: magFixture.sourceRoot,
    OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
  };

  try {
    const magExec = runCli(
      ['connect', 'exec', '--module', 'medautogrant', '--', 'sidecar', 'export', '--format', 'json'],
      env,
    ) as any;

    assert.equal(magExec.module_exec.module_id, 'medautogrant');
    assert.equal(magExec.module_exec.exit_code, 0);
    assert.equal(magExec.module_exec.stdout.length, 2 * 1024 * 1024);
    assert.equal(magExec.module_exec.result, null);
    assert.equal(magExec.module_exec.max_buffer_bytes >= 2 * 1024 * 1024, true);
  } finally {
    fs.rmSync(magFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
