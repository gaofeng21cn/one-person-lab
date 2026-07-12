import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import {
  resolveOplFlowDependencyClosure,
  type OplFlowWorkflowPolicy,
} from '../../../../src/modules/connect/workflow-package-lifecycle.ts';

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeExecutable(filePath: string, content: string) {
  writeFile(filePath, content);
  fs.chmodSync(filePath, 0o755);
}

function writeWorkflowFixture(root: string) {
  const policy: OplFlowWorkflowPolicy = {
    schema: 'opl_flow_workflow_policy.v1',
    package: { id: 'opl-flow', version: 'test', owner: 'opl-flow', kind: 'workflow_profile' },
    workflow_generation: 'model-native-test',
    requires: [{
      id: 'opl-base',
      kind: 'base',
      offline_bundle: 'full',
      online_install_default: true,
      activation: 'always',
      source: 'fixture',
    }],
    recommends: [],
    compatible_optional: [],
    conflicts: [
      {
        id: 'upstream-superpowers',
        discovery_ids: ['superpowers'],
        auto_retire_on_optimize: true,
        reason: 'fixture',
      },
      {
        id: 'ponytail',
        discovery_ids: ['ponytail'],
        auto_retire_on_optimize: true,
        reason: 'fixture',
      },
      {
        id: 'codexcont-intelligence-enhancement',
        discovery_ids: ['codexcont'],
        auto_retire_on_optimize: true,
        reason: 'fixture',
      },
    ],
    retires: [
      {
        id: 'legacy-development-role-prompts',
        discovery_ids: ['planner'],
        auto_retire_on_optimize: true,
        reason: 'fixture',
      },
    ],
    codex_model_policy: {
      authority: 'opl-flow',
      mode_default: 'auto',
      configured_default: { model: 'gpt-5.6-sol', reasoning_effort: 'max' },
      override_precedence: ['explicit_user_override', 'opl_flow_recommendation'],
      catalog_policy: {},
    },
    migration_policy: {},
    historical_fingerprints: {},
  };
  writeFile(path.join(root, 'contracts', 'workflow-policy.json'), `${JSON.stringify(policy, null, 2)}\n`);
  writeFile(path.join(root, 'templates', 'AGENTS.md'), '你始终用中文回复。\n');
  writeFile(path.join(root, 'templates', 'TASTE.md'), '# TASTE\n');
  writeFile(path.join(root, '.codex-plugin', 'plugin.json'), `${JSON.stringify({
    name: 'opl-flow',
    version: 'test',
    skills: './skills/',
  }, null, 2)}\n`);
  writeFile(path.join(root, 'skills', 'opl-flow', 'SKILL.md'), '# OPL Flow\n');
  return policy;
}

test('OPL Flow dependency closure separates online defaults from the Full offline bundle', () => {
  const policy = writeWorkflowFixture(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-policy-')));
  policy.recommends = [
    {
      id: 'officecli',
      kind: 'codex_skill',
      offline_bundle: 'full',
      online_install_default: true,
      activation: 'task_routed',
      source: 'fixture',
    },
    {
      id: 'offline-only',
      kind: 'codex_skill',
      offline_bundle: 'full',
      online_install_default: false,
      activation: 'explicit',
      source: 'fixture',
    },
    {
      id: 'online-only',
      kind: 'runtime_capability',
      offline_bundle: 'none',
      online_install_default: true,
      activation: 'task_routed',
      source: 'fixture',
    },
  ];

  assert.deepEqual(
    resolveOplFlowDependencyClosure(policy, 'online').map((entry) => entry.id),
    ['opl-base', 'officecli', 'online-only'],
  );
  assert.deepEqual(
    resolveOplFlowDependencyClosure(policy, 'full').map((entry) => entry.id),
    ['opl-base', 'officecli', 'offline-only'],
  );
});

test('OPL Flow install archives declared conflicts and rollback restores exact config and services', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-lifecycle-'));
  const flowRoot = path.join(home, 'opl-flow');
  const codexHome = path.join(home, '.codex');
  const stateDir = path.join(home, 'opl-state');
  const binDir = path.join(home, 'bin');
  const configPath = path.join(codexHome, 'config.toml');
  const launchAgent = path.join(home, 'Library', 'LaunchAgents', 'com.opl.codexcont.plist');
  const systemdService = path.join(home, '.config', 'systemd', 'user', 'codexcont.service');
  const legacyPaths = [
    path.join(home, '.agents', 'skills', 'superpowers'),
    path.join(codexHome, '.tmp', 'plugins', 'plugins', 'superpowers'),
    path.join(codexHome, 'plugins', 'cache', 'ponytail'),
    path.join(codexHome, 'plugins', 'cache', 'ponytail-local'),
    path.join(codexHome, 'plugins', 'data', 'ponytail-ponytail'),
    path.join(codexHome, 'plugins', 'cache', 'opl-flow-local'),
    path.join(home, '.codexcont'),
    path.join(codexHome, 'prompts', 'planner.md'),
    launchAgent,
    systemdService,
  ];
  const originalConfig = [
    'model = "user-model"',
    '',
    '[plugins."superpowers@superpowers"]',
    'enabled = true',
    '',
    '[marketplaces.ponytail]',
    'source_type = "local"',
    'source = "/tmp/ponytail"',
    '',
    '[mcp_servers.codexcont]',
    'command = "codexcont"',
    '',
  ].join('\n');

  try {
    writeWorkflowFixture(flowRoot);
    for (const legacyPath of legacyPaths) {
      writeFile(
        path.extname(legacyPath) || legacyPath.endsWith('.codexcont') || legacyPath.endsWith('superpowers') || legacyPath.endsWith('ponytail')
          ? legacyPath
          : path.join(legacyPath, 'fixture.txt'),
        'legacy\n',
      );
    }
    writeFile(configPath, originalConfig);
    writeExecutable(path.join(binDir, 'launchctl'), '#!/bin/sh\nexit 0\n');
    writeExecutable(path.join(binDir, 'systemctl'), '#!/bin/sh\nexit 0\n');

    const env = {
      HOME: home,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: stateDir,
      OPL_FLOW_REPO_ROOT: flowRoot,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
      PATH: `${binDir}:/usr/bin:/bin`,
    };
    const installed = runCli(['packages', 'install', 'opl-flow'], env).workflow_package;

    assert.equal(installed.status, 'completed');
    assert.equal(installed.plugin.plugin_id, 'opl-flow@opl-agent-opl-flow-local');
    assert.deepEqual(installed.migration_ids, [
      'upstream-superpowers',
      'ponytail',
      'codexcont-intelligence-enhancement',
      'legacy-development-role-prompts',
    ]);
    for (const legacyPath of legacyPaths) assert.equal(fs.existsSync(legacyPath), false, legacyPath);
    assert.equal(installed.service_actions.length, 2);
    assert.equal(fs.existsSync(installed.receipt_path), true);
    assert.doesNotMatch(fs.readFileSync(configPath, 'utf8'), /superpowers|ponytail|codexcont/i);

    const repeated = runCli(['packages', 'install', 'opl-flow'], env).workflow_package;
    assert.deepEqual(repeated.migration_actions, []);

    const rolledBack = runCli([
      'packages',
      'rollback',
      'opl-flow',
      '--receipt',
      installed.receipt_path,
    ], env).workflow_package;

    assert.equal(rolledBack.status, 'rolled_back');
    assert.equal(fs.readFileSync(configPath, 'utf8'), originalConfig);
    for (const legacyPath of legacyPaths) assert.equal(fs.existsSync(legacyPath), true, legacyPath);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
