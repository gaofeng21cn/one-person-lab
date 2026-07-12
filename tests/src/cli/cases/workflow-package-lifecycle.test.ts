import { spawnSync } from 'node:child_process';

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

function runGitFixture(args: string[], cwd: string) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
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
        config_markers: ['superpowers'],
        service_ids: [],
        auto_retire_on_optimize: true,
        reason: 'fixture',
      },
      {
        id: 'ponytail',
        discovery_ids: ['ponytail', 'ponytail-local', 'ponytail-ponytail'],
        config_markers: ['ponytail'],
        service_ids: [],
        auto_retire_on_optimize: true,
        reason: 'fixture',
      },
      {
        id: 'codexcont-intelligence-enhancement',
        discovery_ids: ['codexcont'],
        config_markers: ['codexcont'],
        service_ids: ['codexcont', 'com.opl.codexcont'],
        auto_retire_on_optimize: true,
        reason: 'fixture',
      },
    ],
    retires: [
      {
        id: 'superpowers-local-method-profile',
        discovery_ids: [
          'superpowers-lite',
          'superpowers-local-profile',
          'systematic-debugging',
          'test-driven-development',
          'verification-before-completion',
        ],
        config_markers: [],
        service_ids: [],
        auto_retire_on_optimize: true,
        reason: 'fixture',
      },
      {
        id: 'legacy-development-role-prompts',
        discovery_ids: ['planner'],
        config_markers: [],
        service_ids: [],
        auto_retire_on_optimize: true,
        reason: 'fixture',
      },
      {
        id: 'legacy-opl-flow-local-plugin',
        discovery_ids: ['opl-flow-local'],
        config_markers: [],
        service_ids: [],
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
    migration_policy: {
      discovery_root_ids: [
        'codex_skills',
        'agent_skills',
        'skills_manager_skills',
        'codex_plugin_cache',
        'codex_plugin_staging',
        'codex_plugin_data',
        'codex_prompts',
        'codex_agents',
        'launch_agents',
        'systemd_user_services',
        'legacy_config_roots',
      ],
      profile_optimization: { default_mode: 'codex_semantic_merge' },
    },
    historical_fingerprints: {
      agents_marker_pairs: [
        { start: '<!-- OPL_FLOW_MANAGED_START -->', end: '<!-- OPL_FLOW_MANAGED_END -->' },
        { start: '<!-- CODEGRAPH_START -->', end: '<!-- CODEGRAPH_END -->' },
      ],
      agents_legacy_section_headings: ['## Guardrails', '## CodeGraph'],
    },
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

test('OPL Flow update replaces an immutable Full bundle with a managed current checkout', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-full-update-'));
  const sourceRoot = path.join(home, 'source');
  const runtimeRoot = path.join(home, 'runtime');
  const bundledRoot = path.join(runtimeRoot, 'modules', 'opl-flow');
  const stateDir = path.join(home, 'state');
  const codexHome = path.join(home, '.codex');
  writeWorkflowFixture(sourceRoot);
  runGitFixture(['init', '--initial-branch=main'], sourceRoot);
  runGitFixture(['add', '.'], sourceRoot);
  runGitFixture(['-c', 'user.name=OPL Test', '-c', 'user.email=opl-test@example.com', 'commit', '-m', 'fixture'], sourceRoot);
  writeFile(path.join(bundledRoot, 'contracts', 'workflow-policy.json'), '{"schema":"legacy"}\n');
  writeFile(path.join(bundledRoot, 'opl-runtime-module.json'), '{}\n');

  try {
    const updated = runCli(['packages', 'update', 'opl-flow'], {
      HOME: home,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: stateDir,
      OPL_FULL_RUNTIME_HOME: runtimeRoot,
      OPL_FLOW_REPO_URL: sourceRoot,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    }).workflow_package;

    assert.equal(updated.status, 'completed');
    assert.equal(updated.action, 'update');
    assert.equal(updated.source_action, 'cloned');
    assert.equal(updated.source_root, path.join(stateDir, 'modules', 'opl-flow'));
    assert.equal(updated.package_version, 'test');
    assert.equal(fs.existsSync(path.join(updated.source_root, '.git')), true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
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
    '[[skills.config]]',
    'path = "/tmp/talk-normal/SKILL.md"',
    'enabled = false',
    '',
    '[[skills.config]]',
    'path = "/tmp/superpowers/skills/using-superpowers/SKILL.md"',
    'enabled = false',
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
      'superpowers-local-method-profile',
      'legacy-development-role-prompts',
      'legacy-opl-flow-local-plugin',
    ]);
    for (const legacyPath of legacyPaths) assert.equal(fs.existsSync(legacyPath), false, legacyPath);
    assert.equal(installed.service_actions.length, 2);
    assert.equal(fs.existsSync(installed.receipt_path), true);
    assert.doesNotMatch(fs.readFileSync(configPath, 'utf8'), /superpowers|ponytail|codexcont/i);
    assert.match(fs.readFileSync(configPath, 'utf8'), /talk-normal/);

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

test('OPL Flow optimize discovers bounded conflicts and uses Codex to simplify an existing AGENTS profile', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-optimize-'));
  const flowRoot = path.join(home, 'opl-flow');
  const codexHome = path.join(home, '.codex');
  const stateDir = path.join(home, 'opl-state');
  const fakeCodex = path.join(home, 'bin', 'codex');
  const agentsPath = path.join(codexHome, 'AGENTS.md');
  const conflictSkill = path.join(codexHome, 'skills', 'systematic-debugging', 'SKILL.md');
  const originalAgents = [
    '你始终用中文回复。',
    '',
    '## Guardrails',
    '',
    '- Always run the legacy verifier workflow.',
    '',
    '- 用户偏好：涉及医学内容时保留中英文术语。',
    '',
    '<!-- CODEGRAPH_START -->',
    '## CodeGraph',
    '- legacy injected block',
    '<!-- CODEGRAPH_END -->',
    '',
  ].join('\n');
  const mergedAgents = [
    '你始终用中文回复。',
    '',
    '- 用户偏好：涉及医学内容时保留中英文术语。',
    '',
  ].join('\n');

  try {
    writeWorkflowFixture(flowRoot);
    writeFile(agentsPath, originalAgents);
    writeFile(conflictSkill, '---\nname: systematic-debugging\n---\n');
    writeExecutable(fakeCodex, [
      '#!/bin/sh',
      'output=""',
      'while [ "$#" -gt 0 ]; do',
      '  if [ "$1" = "--output-last-message" ]; then output="$2"; shift 2; continue; fi',
      '  shift',
      'done',
      `printf '%s' '${JSON.stringify({
        agents_markdown: mergedAgents,
        merge_report: 'Removed legacy Guardrails and CodeGraph injection; preserved the medical terminology preference.',
      })}' > "$output"`,
      'exit 0',
      '',
    ].join('\n'));

    const env = {
      HOME: home,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: stateDir,
      OPL_FLOW_REPO_ROOT: flowRoot,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
      OPL_CODEX_BIN: fakeCodex,
    };
    const optimized = runCli(['packages', 'optimize', '--package-id', 'opl-flow'], env).workflow_package;

    assert.equal(optimized.action, 'optimize');
    assert.equal(optimized.status, 'completed');
    assert.equal(optimized.profile.status, 'optimized');
    assert.equal(optimized.profile.codex_merge.status, 'completed');
    assert.equal(fs.readFileSync(agentsPath, 'utf8'), mergedAgents);
    assert.equal(fs.existsSync(conflictSkill), false);
    assert.equal(
      optimized.migration_actions.some((entry: { source: string }) => entry.source === path.dirname(conflictSkill)),
      true,
    );

    const rolledBack = runCli([
      'packages',
      'rollback',
      'opl-flow',
      '--receipt',
      optimized.receipt_path,
    ], env).workflow_package;

    assert.equal(rolledBack.status, 'rolled_back');
    assert.equal(fs.readFileSync(agentsPath, 'utf8'), originalAgents);
    assert.equal(fs.existsSync(conflictSkill), true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('OPL Flow optimize preserves AGENTS when Codex semantic merge is unavailable', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-optimize-packet-'));
  const flowRoot = path.join(home, 'opl-flow');
  const codexHome = path.join(home, '.codex');
  const agentsPath = path.join(codexHome, 'AGENTS.md');
  const existing = 'Custom user preference that is not the OPL Flow template.\n';

  try {
    writeWorkflowFixture(flowRoot);
    writeFile(agentsPath, existing);
    const optimized = runCli(['packages', 'optimize', 'opl-flow'], {
      HOME: home,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: path.join(home, 'opl-state'),
      OPL_FLOW_REPO_ROOT: flowRoot,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
      OPL_FLOW_PROFILE_MERGE_MODE: 'packet',
    }).workflow_package;

    assert.equal(optimized.status, 'profile_merge_required');
    assert.equal(optimized.profile.codex_merge.status, 'skipped');
    assert.equal(fs.readFileSync(agentsPath, 'utf8'), existing);
    assert.equal(fs.existsSync(path.join(optimized.profile.merge_packet, 'merge-plan.json')), true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('OPL Flow optimize preserves a concurrently changed AGENTS file and still writes a rollback receipt', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-optimize-drift-'));
  const flowRoot = path.join(home, 'opl-flow');
  const codexHome = path.join(home, '.codex');
  const stateDir = path.join(home, 'opl-state');
  const fakeCodex = path.join(home, 'bin', 'codex');
  const agentsPath = path.join(codexHome, 'AGENTS.md');
  const originalAgents = 'Custom preference before merge.\n';
  const concurrentAgents = 'User changed this while Codex was merging.\n';

  try {
    writeWorkflowFixture(flowRoot);
    writeFile(agentsPath, originalAgents);
    writeExecutable(fakeCodex, [
      '#!/bin/sh',
      'output=""',
      'while [ "$#" -gt 0 ]; do',
      '  if [ "$1" = "--output-last-message" ]; then output="$2"; shift 2; continue; fi',
      '  shift',
      'done',
      `printf '%s' '${concurrentAgents}' > "$CODEX_HOME/AGENTS.md"`,
      `printf '%s' '${JSON.stringify({
        agents_markdown: '你始终用中文回复。\n\n- Concurrent merge candidate.\n',
        merge_report: 'Preserved the distinct preference.',
      })}' > "$output"`,
      'exit 0',
      '',
    ].join('\n'));

    const optimized = runCli(['packages', 'optimize', 'opl-flow'], {
      HOME: home,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: stateDir,
      OPL_FLOW_REPO_ROOT: flowRoot,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
      OPL_CODEX_BIN: fakeCodex,
    }).workflow_package;

    assert.equal(optimized.status, 'profile_merge_required');
    assert.equal(optimized.profile.next_action, 'rerun_optimize_after_target_drift');
    assert.match(optimized.profile.apply_error, /changed after the merge packet was created/);
    assert.equal(fs.readFileSync(agentsPath, 'utf8'), concurrentAgents);
    assert.equal(fs.existsSync(optimized.receipt_path), true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
