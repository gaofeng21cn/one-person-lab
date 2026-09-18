import {
  agentPackageManifest,
  assert,
  formatJsonPayload,
  fs,
  os,
  path,
  parseJsonText,
  removeFixtureTree,
  repoRoot,
  registryPayload,
  runCli,
  runCliAsync,
  runCliFailure,
  test,
  pathToFileURL,
  crypto,
  validateJsonSchemaPayload,
  normalizeAgentPluginName,
  resolveAgentPluginManifest,
  createMemoizedCodexPluginListRunner,
  githubArchiveFileSource,
  githubMarketplaceSourceIdentity,
  isTransientConfiguredDownloadFailure,
  runConfiguredDownloadWithTransientRetry,
  runConfiguredCodexPluginCarrier,
  listAgentPackageSettingsActions,
  discoverAvailablePackageDescriptors,
  discoverInstalledPackageDescriptors,
  listCurrentPackageProjections,
  normalizePackageManifest,
  createOplAgentPackageStatusReader,
  runOplAgentPackageBulkUpdate,
  packageId,
  pluginSelector,
  ownerPackageVersion,
  descriptor,
  pluginList,
  writePluginSource,
  writePluginManifest,
  installedOwnerDescriptor,
  assertCommandOutputSchema,
  writeFakeCodex,
  writeDiscoveryThenUnavailableCodex,
  writeUnavailableCodex,
  writeNativeMarketplace,
  unavailableCodexRunner,
} from '../configured-codex-plugin-carrier-shared.ts';
import type { CodexPluginCommandRunner } from '../configured-codex-plugin-carrier-shared.ts';

test('configured Codex carrier exposes exact identity and fails closed on duplicate source precedence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configured-carrier-identity-'));
  const selectedSource = path.join(root, 'selected');
  const duplicateSource = path.join(root, 'duplicate');
  writePluginSource(selectedSource, 'selected');
  writePluginSource(duplicateSource, 'duplicate');
  const runner: CodexPluginCommandRunner = () => ({
    status: 0,
    stdout: pluginList([
      {
        pluginId: pluginSelector,
        version: '1.0.1',
        sourcePath: selectedSource,
        marketplaceSource: 'fixture-carrier',
      },
      {
        pluginId: 'third-party-research@historical-carrier',
        version: '1.0.1',
        sourcePath: duplicateSource,
        marketplaceSource: 'historical-carrier',
      },
    ]),
    stderr: '',
    error: null,
  });
  try {
    const readback = runConfiguredCodexPluginCarrier({ descriptor, action: 'list', runner });
    assert.equal(readback.status, 'installed');
    assert.equal(readback.carrier.precedence, 'ambiguous_same_plugin_name');
    assert.equal(readback.executor.status, 'attention_needed');
    assert.equal(readback.reason, 'configured_native_carrier_source_ambiguous');
    assert.equal(readback.installed_version, null);
    assert.equal(readback.plugin_source_path, null);
    assert.equal(readback.carrier.observed_sources.length, 2);
    assert.notEqual(
      readback.carrier.observed_sources[0].source_tree_sha256,
      readback.carrier.observed_sources[1].source_tree_sha256,
    );
    assert.equal(readback.native_action_dispatched, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('configured Codex carrier ignores a disabled duplicate source for launch precedence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configured-carrier-disabled-duplicate-'));
  const selectedSource = path.join(root, 'selected');
  const duplicateSource = path.join(root, 'duplicate');
  writePluginSource(selectedSource, 'selected');
  writePluginSource(duplicateSource, 'duplicate');
  const runner: CodexPluginCommandRunner = () => ({
    status: 0,
    stdout: pluginList([
      {
        pluginId: pluginSelector,
        version: '1.0.1',
        sourcePath: selectedSource,
        marketplaceSource: 'fixture-carrier',
      },
      {
        pluginId: 'third-party-research@historical-carrier',
        version: '1.0.1',
        sourcePath: duplicateSource,
        marketplaceSource: 'historical-carrier',
        enabled: false,
      },
    ]),
    stderr: '',
    error: null,
  });
  try {
    const readback = runConfiguredCodexPluginCarrier({ descriptor, action: 'list', runner });
    assert.equal(readback.status, 'installed');
    assert.equal(readback.carrier.precedence, 'exact_single_source');
    assert.equal(readback.executor.status, 'callable');
    assert.equal(readback.reason, null);
    assert.equal(readback.installed_version, '1.0.1');
    assert.equal(readback.plugin_source_path, selectedSource);
    assert.equal(readback.carrier.observed_sources.length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('standard Agent carrier accepts its single canonical local wrapper selector', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-carrier-wrapper-'));
  const source = path.join(root, 'wrapper');
  const skillRoot = path.join(source, 'skills', 'med-autoscience');
  fs.mkdirSync(path.join(source, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), '# MedAutoScience\n', 'utf8');
  fs.writeFileSync(path.join(source, '.codex-plugin', 'plugin.json'), formatJsonPayload({
    name: 'med-autoscience',
    version: '0.2.26',
    skills: './skills/',
  }));
  try {
    const readback = runConfiguredCodexPluginCarrier({
      descriptor: {
        packageId: 'mas',
        carrier: {
          kind: 'codex_plugin_manager',
          pluginId: 'med-autoscience@med-autoscience',
          marketplaceSource: null,
        },
        executor: {
          route: 'codex_cli',
          requiredSkillIds: ['med-autoscience'],
        },
        publicationRef: null,
      },
      action: 'list',
      runner: () => ({
        status: 0,
        stdout: pluginList([{
          pluginId: 'med-autoscience@med-autoscience-local',
          version: '0.2.26',
          sourcePath: source,
          marketplaceSource: path.join(root, 'med-autoscience-local'),
        }]),
        stderr: '',
        error: null,
      }),
    });
    assert.equal(readback.status, 'installed');
    assert.equal(readback.installed_version, '0.2.26');
    assert.equal(readback.carrier.precedence, 'exact_single_source');
    assert.equal(readback.executor.status, 'callable');
    assert.equal(readback.reason, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('required OPL Package status accepts installed local carriers consistently', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-required-agent-local-carriers-'));
  const binary = path.join(root, 'fake-codex.mjs');
  const requiredAgents = [
    { packageId: 'mag', pluginId: 'med-autogrant@med-autogrant-local' },
    { packageId: 'mas', pluginId: 'med-autoscience@med-autoscience-local' },
    { packageId: 'obf', pluginId: 'opl-bookforge@opl-bookforge-local' },
    { packageId: 'oma', pluginId: 'opl-meta-agent@opl-meta-agent-local' },
    { packageId: 'rca', pluginId: 'redcube-ai@redcube-ai-local' },
  ] as const;
  const requiredPackages = [
    ...requiredAgents,
    { packageId: 'mas-scholar-skills', pluginId: 'mas-scholar-skills@mas-scholar-skills' },
  ] as const;
  const installedPackages = requiredPackages.map(({ packageId, pluginId }) => {
    const sourcePath = path.join(root, 'plugins', packageId);
    const manifest = fs.readFileSync(
      path.join(repoRoot, 'contracts', 'opl-framework', 'packages', `${packageId}.json`),
      'utf8',
    );
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.writeFileSync(path.join(sourcePath, 'opl-package.json'), manifest, 'utf8');
    if (packageId !== 'mas-scholar-skills') {
      fs.mkdirSync(path.join(sourcePath, 'contracts'), { recursive: true });
      fs.writeFileSync(path.join(sourcePath, 'contracts/domain_descriptor.json'), '{}\n');
      fs.writeFileSync(path.join(sourcePath, 'contracts/action_catalog.json'), '{}\n');
    }
    if (packageId === 'mas-scholar-skills') {
      const providerManifest = parseJsonText(manifest) as any;
      for (const skillId of providerManifest.exports.all_skill_ids) {
        fs.mkdirSync(path.join(sourcePath, 'skills', skillId), { recursive: true });
        fs.writeFileSync(path.join(sourcePath, 'skills', skillId, 'SKILL.md'), `# ${skillId}\n`, 'utf8');
      }
    }
    return {
      pluginId,
      version: (parseJsonText(manifest) as any).version,
      installed: true,
      enabled: packageId !== 'mas-scholar-skills',
      source: { source: 'local', path: sourcePath },
      marketplaceSource: {
        sourceType: 'local',
        source: path.join(root, 'marketplaces', pluginId.split('@')[1]),
      },
    };
  });
  fs.writeFileSync(binary, `#!/usr/bin/env node
const args = process.argv.slice(2).join(' ');
if (args === 'plugin list --json' || args === 'plugin list --available --json') {
  process.stdout.write(${JSON.stringify(JSON.stringify({ installed: installedPackages, available: [] }))});
} else {
  process.exitCode = 2;
}
`);
  fs.chmodSync(binary, 0o755);
  const env = {
    HOME: root,
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_STATE_DIR: path.join(root, 'opl-state'),
    OPL_CODEX_PLUGIN_BIN: binary,
    OPL_MODULE_PATH_SCHOLARSKILLS: path.join(root, 'plugins', 'mas-scholar-skills'),
  };
  try {
    const directory = (runCli(['packages', 'list', '--detail', 'full'], env) as any)
      .opl_agent_packages.directory;
    for (const { packageId } of requiredPackages) {
      const entry = directory.entries.find((candidate: any) => candidate.package_id === packageId);
      if (packageId === 'mas-scholar-skills') {
        assert.equal(entry, undefined, packageId);
        continue;
      }
      assert.ok(entry, packageId);
      assert.equal(entry.installed, true, packageId);
      assert.equal(entry.activated, true, packageId);
      assert.equal(entry.configured_carrier.status, 'installed', packageId);
      assert.equal(entry.installed_readiness.installed, true, packageId);
      assert.equal(entry.readiness.status, 'ready', packageId);
      assert.equal(entry.readiness.launch_allowed, true, packageId);

      const status = (runCli(['packages', 'status', '--package-id', packageId], env) as any)
        .opl_agent_package_status;
      assert.equal(status.status, 'available', packageId);
      assert.equal(status.installed_package_count, 1, packageId);
      assert.equal(status.configured_carrier.status, 'installed', packageId);
      assert.equal(status.configured_carrier.carrier.precedence, 'exact_single_source', packageId);
      assert.equal(status.installed_readiness.installed, true, packageId);
      assert.equal(status.installed_readiness.physical_status, 'available', packageId);
      assert.equal(status.installed_readiness.callability, 'callable', packageId);
      assert.equal(status.package_operational.status, 'operational', packageId);
      assert.equal(status.operational_ready, true, packageId);
      assert.equal(status.launch_allowed, true, packageId);
      if (requiredAgents.some((agent) => agent.packageId === packageId)) {
        assert.ok(status.home_shortcut_preferences.length > 0, packageId);
        assert.equal(
          status.home_shortcut_preferences.every((shortcut: any) => shortcut.installed === true),
          true,
          packageId,
        );
      }
    }
  } finally {
    removeFixtureTree(root);
  }
});

test('standard Agent Package status rejects an unregistered same-name local carrier', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-required-agent-unregistered-carrier-'));
  const sourcePath = path.join(root, 'plugin');
  const binary = path.join(root, 'fake-codex.mjs');
  fs.mkdirSync(sourcePath, { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'packages', 'mag.json'),
    path.join(sourcePath, 'opl-package.json'),
  );
  fs.writeFileSync(binary, `#!/usr/bin/env node
const args = process.argv.slice(2).join(' ');
if (args === 'plugin list --json' || args === 'plugin list --available --json') {
  process.stdout.write(JSON.stringify({
    installed: [{
      pluginId: 'med-autogrant@unregistered-local',
      version: '0.3.11',
      installed: true,
      enabled: true,
      source: { source: 'local', path: ${JSON.stringify(sourcePath)} },
      marketplaceSource: { sourceType: 'local', source: ${JSON.stringify(root)} },
    }],
    available: [],
  }));
} else {
  process.exitCode = 2;
}
`);
  fs.chmodSync(binary, 0o755);
  try {
    const status = (runCli(['packages', 'status', '--package-id', 'mag'], {
      HOME: root,
      CODEX_HOME: path.join(root, 'codex-home'),
      OPL_STATE_DIR: path.join(root, 'opl-state'),
      OPL_CODEX_PLUGIN_BIN: binary,
    }) as any).opl_agent_package_status;
    assert.equal(status.status, 'not_installed');
    assert.equal(status.installed_package_count, 0);
    assert.equal(status.configured_carrier.status, 'not_installed');
    assert.equal(status.configured_carrier.carrier.precedence, 'unexpected_same_plugin_name');
    assert.equal(status.launch_allowed, false);
    assert.equal(status.home_shortcut_preferences.every((shortcut: any) => shortcut.installed === false), true);
  } finally {
    removeFixtureTree(root);
  }
});

test('configured Codex carrier resolves the plugin-declared Skill root and rejects unsafe roots', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configured-carrier-skill-root-'));
  const sourcePath = path.join(root, 'source');
  const nestedSkillsRoot = './plugins/med-autoscience/skills/';
  const readback = () => runConfiguredCodexPluginCarrier({
    descriptor,
    action: 'list',
    runner: () => ({
      status: 0,
      stdout: pluginList([{
        pluginId: pluginSelector,
        version: '1.0.1',
        sourcePath,
        marketplaceSource: 'fixture-carrier',
      }]),
      stderr: '',
      error: null,
    }),
  });
  try {
    writePluginSource(sourcePath, 'nested owner Skill root', nestedSkillsRoot);
    assert.equal(readback().executor.status, 'callable');

    const outsideSkillsRoot = path.join(root, 'outside-skills');
    fs.mkdirSync(path.join(outsideSkillsRoot, 'third-party-research'), { recursive: true });
    fs.writeFileSync(
      path.join(outsideSkillsRoot, 'third-party-research', 'SKILL.md'),
      '# Escaped Skill\n',
    );
    writePluginManifest(sourcePath, '1.0.1', '../outside-skills');
    assert.equal(readback().reason, 'required_skill_unavailable:third-party-research');

    writePluginManifest(sourcePath, '1.0.1', nestedSkillsRoot);
    const nestedRoot = path.resolve(sourcePath, nestedSkillsRoot);
    const displacedRoot = path.join(root, 'displaced-skills');
    fs.renameSync(nestedRoot, displacedRoot);
    fs.symlinkSync(displacedRoot, nestedRoot, 'dir');
    assert.equal(readback().reason, 'required_skill_unavailable:third-party-research');

    fs.rmSync(nestedRoot);
    writePluginManifest(sourcePath, '1.0.1', './missing-skills/');
    assert.equal(readback().reason, 'required_skill_unavailable:third-party-research');
  } finally {
    removeFixtureTree(root);
  }
});

test('configured Codex carrier keeps native failures Package-local and rejects selector injection', () => {
  let calls = 0;
  assert.throws(
    () => runConfiguredCodexPluginCarrier({
      descriptor,
      action: 'update',
      runner: () => {
        calls += 1;
        return {
          status: 1,
          stdout: '',
          stderr: 'fixture failure',
          error: null,
        };
      },
    }),
    (error: any) => error?.details?.failure_code === 'configured_codex_plugin_carrier_action_failed'
      && error?.details?.package_id === packageId,
  );
  assert.equal(calls, 1);
  assert.throws(
    () => runConfiguredCodexPluginCarrier({
      descriptor: {
        ...descriptor,
        carrier: {
          kind: 'codex_plugin_manager',
          pluginId: '--help',
          marketplaceSource: null,
        },
      },
      action: 'install',
      runner: () => {
        calls += 1;
        return { status: 0, stdout: pluginList([]), stderr: '', error: null };
      },
    }),
    (error: any) => error?.details?.failure_code
      === 'configured_codex_plugin_carrier_descriptor_invalid',
  );
  assert.equal(calls, 1);
});

test('configured Codex carrier refreshes an existing Git marketplace before update or repair', () => {
  for (const action of ['update', 'repair'] as const) {
    const calls: string[] = [];
    const readback = runConfiguredCodexPluginCarrier({
      descriptor: {
        ...descriptor,
        carrier: { ...descriptor.carrier, marketplaceSource: 'gaofeng21cn/example' },
      },
      action,
      runner: ({ args }) => {
        calls.push(args.join(' '));
        if (args.join(' ') === 'plugin marketplace list --json') {
          return {
            status: 0,
            stdout: JSON.stringify({
              marketplaces: [{
                name: 'fixture-carrier',
                marketplaceSource: {
                  sourceType: 'git',
                  source: 'https://github.com/gaofeng21cn/example.git',
                },
              }],
            }),
            stderr: '',
            error: null,
          };
        }
        if (args.join(' ') === 'plugin list --json') {
          return { status: 0, stdout: pluginList([]), stderr: '', error: null };
        }
        return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
      },
    });
    assert.equal(readback.operation, action);
    assert.deepEqual(calls, [
      'plugin marketplace list --json',
      'plugin marketplace upgrade fixture-carrier --json',
      `plugin add ${pluginSelector} --json`,
      'plugin list --json',
    ]);
  }
});

test('configured Codex carrier adds a missing marketplace and dry-run never refreshes it', () => {
  const calls: string[] = [];
  const configured = {
    ...descriptor,
    carrier: { ...descriptor.carrier, marketplaceSource: 'gaofeng21cn/example' },
  };
  const runner: CodexPluginCommandRunner = ({ args }) => {
    calls.push(args.join(' '));
    if (args.join(' ') === 'plugin marketplace list --json') {
      return {
        status: 0,
        stdout: JSON.stringify({ marketplaces: [] }),
        stderr: '',
        error: null,
      };
    }
    if (args.join(' ') === 'plugin list --json') {
      return { status: 0, stdout: pluginList([]), stderr: '', error: null };
    }
    return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
  };
  runConfiguredCodexPluginCarrier({ descriptor: configured, action: 'install', runner });
  assert.deepEqual(calls.slice(0, 3), [
    'plugin marketplace list --json',
    'plugin marketplace add gaofeng21cn/example --json',
    `plugin add ${pluginSelector} --json`,
  ]);

  calls.length = 0;
  runConfiguredCodexPluginCarrier({ descriptor: configured, action: 'update', dryRun: true, runner });
  assert.deepEqual(calls, ['plugin list --json']);
});

test('configured Codex carrier reuses an equivalent SSH-over-443 marketplace on install', () => {
  const calls: string[] = [];
  runConfiguredCodexPluginCarrier({
    descriptor: {
      ...descriptor,
      carrier: { ...descriptor.carrier, marketplaceSource: 'gaofeng21cn/example' },
    },
    action: 'install',
    runner: ({ args }) => {
      calls.push(args.join(' '));
      if (args.join(' ') === 'plugin marketplace list --json') {
        return {
          status: 0,
          stdout: JSON.stringify({
            marketplaces: [{
              name: 'fixture-carrier',
              marketplaceSource: {
                sourceType: 'git',
                source: 'ssh://git@ssh.github.com:443/gaofeng21cn/example.git',
              },
            }],
          }),
          stderr: '',
          error: null,
        };
      }
      if (args.join(' ') === 'plugin list --json') {
        return { status: 0, stdout: pluginList([]), stderr: '', error: null };
      }
      return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
    },
  });
  assert.deepEqual(calls, [
    'plugin marketplace list --json',
    `plugin add ${pluginSelector} --json`,
    'plugin list --json',
  ]);
});

test('configured Codex carrier replaces a same-name marketplace when developer update changes its source', () => {
  const calls: string[] = [];
  const localSource = '/tmp/fixture-carrier';
  runConfiguredCodexPluginCarrier({
    descriptor: {
      ...descriptor,
      carrier: { ...descriptor.carrier, marketplaceSource: localSource },
    },
    action: 'update',
    runner: ({ args }) => {
      calls.push(args.join(' '));
      if (args.join(' ') === 'plugin marketplace list --json') {
        return {
          status: 0,
          stdout: JSON.stringify({
            marketplaces: [{
              name: 'fixture-carrier',
              marketplaceSource: {
                sourceType: 'git',
                source: 'https://github.com/gaofeng21cn/fixture-carrier.git',
              },
            }],
          }),
          stderr: '',
          error: null,
        };
      }
      if (args.join(' ') === 'plugin list --json') {
        return { status: 0, stdout: pluginList([]), stderr: '', error: null };
      }
      return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
    },
  });
  assert.deepEqual(calls, [
    'plugin marketplace list --json',
    'plugin marketplace remove fixture-carrier --json',
    `plugin marketplace add ${localSource} --json`,
    `plugin add ${pluginSelector} --json`,
    'plugin list --json',
  ]);
});

test('configured Codex carrier restores the prior marketplace when a source transition cannot be added', () => {
  const calls: string[] = [];
  const priorSource = 'https://github.com/gaofeng21cn/fixture-carrier.git';
  const localSource = '/tmp/fixture-carrier';
  assert.throws(
    () => runConfiguredCodexPluginCarrier({
      descriptor: {
        ...descriptor,
        carrier: { ...descriptor.carrier, marketplaceSource: localSource },
      },
      action: 'update',
      runner: ({ args }) => {
        const command = args.join(' ');
        calls.push(command);
        if (command === 'plugin marketplace list --json') {
          return {
            status: 0,
            stdout: JSON.stringify({
              marketplaces: [{
                name: 'fixture-carrier',
                marketplaceSource: { sourceType: 'git', source: priorSource },
              }],
            }),
            stderr: '',
            error: null,
          };
        }
        if (command === `plugin marketplace add ${localSource} --json`) {
          return { status: 1, stdout: '', stderr: 'fixture failure', error: null };
        }
        return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
      },
    }),
    (error: any) => error?.details?.failure_code === 'configured_codex_plugin_carrier_action_failed',
  );
  assert.deepEqual(calls, [
    'plugin marketplace list --json',
    'plugin marketplace remove fixture-carrier --json',
    `plugin marketplace add ${localSource} --json`,
    `plugin marketplace add ${priorSource} --json`,
  ]);
});

test('configured Codex carrier reports an unexpected same-name source without selecting it', () => {
  const readback = runConfiguredCodexPluginCarrier({
    descriptor,
    action: 'list',
    runner: () => ({
      status: 0,
      stdout: pluginList([{
        pluginId: 'third-party-research@historical-carrier',
        version: '1.0.1',
        sourcePath: '/missing/historical-carrier',
        marketplaceSource: 'historical-carrier',
      }]),
      stderr: '',
      error: null,
    }),
  });
  assert.equal(readback.status, 'not_installed');
  assert.equal(readback.carrier.precedence, 'unexpected_same_plugin_name');
  assert.equal(readback.executor.status, 'attention_needed');
  assert.equal(readback.reason, 'configured_native_carrier_unexpected_source_present');
  assert.equal(readback.carrier.observed_sources.length, 1);
});

test('package status repair targets the declared carrier after observing a historical same-name source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configured-carrier-repair-selector-'));
  const stateDir = path.join(root, 'opl-state');
  const codexHome = path.join(root, 'codex-home');
  const sourcePath = path.join(root, 'historical-carrier');
  const binary = path.join(root, 'fake-codex.mjs');
  const ownerDescriptor = installedOwnerDescriptor() as any;
  const manifest = {
    ...ownerDescriptor,
    codex_surface: {
      ...ownerDescriptor.codex_surface,
      configured_codex_plugin_carrier: {
        kind: 'codex_plugin_manager',
        plugin_selector: pluginSelector,
        marketplace_source: 'fixture-carrier',
        executor_route: 'codex_cli',
        publication_ref: null,
      },
    },
  };
  writePluginSource(sourcePath, 'historical carrier');
  fs.writeFileSync(path.join(sourcePath, 'opl-package.json'), formatJsonPayload(manifest));
  fs.writeFileSync(binary, `#!/usr/bin/env node
const installed = {
  pluginId: 'third-party-research@historical-carrier',
  version: '1.0.1',
  installed: true,
  enabled: true,
  source: { source: 'local', path: ${JSON.stringify(sourcePath)} },
  marketplaceSource: { sourceType: 'local', source: 'historical-carrier' },
};
const args = process.argv.slice(2).join(' ');
if (args === 'plugin list --json' || args === 'plugin list --available --json') {
  process.stdout.write(JSON.stringify({ installed: [installed], available: [] }));
} else {
  process.exitCode = 2;
}
`);
  fs.chmodSync(binary, 0o755);
  try {
    const result = runCli(['packages', 'status', '--package-id', packageId], {
      HOME: root,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: stateDir,
      OPL_CODEX_PLUGIN_BIN: binary,
    }) as any;
    const status = result.opl_agent_package_status;
    assert.equal(status.configured_carrier.carrier.precedence, 'unexpected_same_plugin_name');
    assert.equal(status.package_operational.repair_command, `codex plugin add ${pluginSelector}`);
    assert.equal(status.repair_action, `codex plugin add ${pluginSelector}`);
  } finally {
    removeFixtureTree(root);
  }
});

test('configured Codex carrier repair replaces a stale same-name source after the target is ready', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configured-carrier-replace-source-'));
  const targetSource = path.join(root, 'target');
  const staleSource = path.join(root, 'stale');
  const calls: string[] = [];
  let targetInstalled = false;
  let staleInstalled = true;
  writePluginSource(targetSource, 'target');
  writePluginSource(staleSource, 'stale');
  const configured = {
    ...descriptor,
    carrier: { ...descriptor.carrier, marketplaceSource: root },
  };
  try {
    const readback = runConfiguredCodexPluginCarrier({
      descriptor: configured,
      action: 'repair',
      runner: ({ args }) => {
        const command = args.join(' ');
        calls.push(command);
        if (command === 'plugin marketplace list --json') {
          return {
            status: 0,
            stdout: JSON.stringify({
              marketplaces: [{
                name: 'fixture-carrier',
                marketplaceSource: { sourceType: 'local', source: root },
              }],
            }),
            stderr: '',
            error: null,
          };
        }
        if (command === `plugin add ${pluginSelector} --json`) {
          targetInstalled = true;
          return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
        }
        if (command === 'plugin remove third-party-research@historical-carrier --json') {
          assert.equal(targetInstalled, true);
          staleInstalled = false;
          return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
        }
        if (command === 'plugin list --json') {
          return {
            status: 0,
            stdout: pluginList([
              ...(targetInstalled ? [{
                pluginId: pluginSelector,
                version: '1.0.1',
                sourcePath: targetSource,
                marketplaceSource: root,
              }] : []),
              ...(staleInstalled ? [{
                pluginId: 'third-party-research@historical-carrier',
                version: '1.0.1',
                sourcePath: staleSource,
                marketplaceSource: 'historical-carrier',
              }] : []),
            ]),
            stderr: '',
            error: null,
          };
        }
        return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
      },
    });
    assert.equal(readback.carrier.precedence, 'exact_single_source');
    assert.equal(readback.executor.status, 'callable');
    assert.deepEqual(calls, [
      'plugin marketplace list --json',
      `plugin add ${pluginSelector} --json`,
      'plugin list --json',
      'plugin remove third-party-research@historical-carrier --json',
      'plugin list --json',
    ]);
  } finally {
    removeFixtureTree(root);
  }
});

test('configured Codex carrier update replaces an accepted managed wrapper after a developer source is ready', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configured-carrier-managed-to-developer-'));
  const targetSource = path.join(root, 'target');
  const managedSource = path.join(root, 'managed');
  const calls: string[] = [];
  let targetInstalled = false;
  let managedInstalled = true;
  writePluginSource(targetSource, 'target');
  writePluginSource(managedSource, 'managed');
  const configured = {
    ...descriptor,
    packageId: 'mas',
    carrier: {
      ...descriptor.carrier,
      pluginId: 'med-autoscience@med-autoscience',
      marketplaceSource: targetSource,
    },
    executor: {
      ...descriptor.executor,
      requiredSkillIds: ['third-party-research'],
    },
  };
  try {
    const readback = runConfiguredCodexPluginCarrier({
      descriptor: configured,
      action: 'update',
      runner: ({ args }) => {
        const command = args.join(' ');
        calls.push(command);
        if (command === 'plugin marketplace list --json') {
          return {
            status: 0,
            stdout: JSON.stringify({
              marketplaces: [{
                name: 'med-autoscience',
                marketplaceSource: { sourceType: 'local', source: targetSource },
              }],
            }),
            stderr: '',
            error: null,
          };
        }
        if (command === 'plugin add med-autoscience@med-autoscience --json') {
          targetInstalled = true;
          return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
        }
        if (command === 'plugin remove med-autoscience@med-autoscience-local --json') {
          assert.equal(targetInstalled, true);
          managedInstalled = false;
          return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
        }
        if (command === 'plugin list --json') {
          return {
            status: 0,
            stdout: pluginList([
              ...(managedInstalled ? [{
                pluginId: 'med-autoscience@med-autoscience-local',
                version: '0.2.27',
                sourcePath: managedSource,
                marketplaceSource: managedSource,
              }] : []),
              ...(targetInstalled ? [{
                pluginId: 'med-autoscience@med-autoscience',
                version: '0.2.27',
                sourcePath: targetSource,
                marketplaceSource: targetSource,
              }] : []),
            ]),
            stderr: '',
            error: null,
          };
        }
        return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
      },
    });
    assert.equal(readback.carrier.precedence, 'exact_single_source');
    assert.equal(readback.carrier.marketplace_source, targetSource);
    assert.equal(readback.executor.status, 'callable');
    assert.deepEqual(calls, [
      'plugin marketplace list --json',
      'plugin add med-autoscience@med-autoscience --json',
      'plugin list --json',
      'plugin remove med-autoscience@med-autoscience-local --json',
      'plugin list --json',
    ]);
  } finally {
    removeFixtureTree(root);
  }
});

test('configured Codex carrier update completes a same-source marketplace rename', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configured-carrier-marketplace-rename-'));
  const source = 'https://github.com/gaofeng21cn/opl-flow.git';
  const pluginSource = path.join(root, 'plugin');
  const calls: string[] = [];
  let targetMarketplace = false;
  let targetInstalled = false;
  let legacyInstalled = true;
  let legacyMarketplace = true;
  writePluginSource(pluginSource, 'flow');
  const configured = {
    ...descriptor,
    packageId: 'opl-flow',
    carrier: {
      ...descriptor.carrier,
      pluginId: 'opl-flow@opl-flow',
      marketplaceSource: 'gaofeng21cn/opl-flow',
    },
    executor: {
      ...descriptor.executor,
      requiredSkillIds: ['third-party-research'],
    },
  };
  try {
    const readback = runConfiguredCodexPluginCarrier({
      descriptor: configured,
      action: 'update',
      runner: ({ args }) => {
        const command = args.join(' ');
        calls.push(command);
        if (command === 'plugin marketplace list --json') {
          return {
            status: 0,
            stdout: JSON.stringify({
              marketplaces: [
                ...(legacyMarketplace ? [{
                  name: 'opl-flow-local',
                  marketplaceSource: { sourceType: 'git', source },
                }] : []),
                ...(targetMarketplace ? [{
                  name: 'opl-flow',
                  marketplaceSource: { sourceType: 'git', source },
                }] : []),
              ],
            }),
            stderr: '',
            error: null,
          };
        }
        if (command === 'plugin marketplace add gaofeng21cn/opl-flow --json') {
          targetMarketplace = true;
          return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
        }
        if (command === 'plugin add opl-flow@opl-flow --json') {
          targetInstalled = true;
          return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
        }
        if (command === 'plugin remove opl-flow@opl-flow-local --json') {
          assert.equal(targetInstalled, true);
          legacyInstalled = false;
          return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
        }
        if (command === 'plugin marketplace remove opl-flow-local --json') {
          assert.equal(legacyInstalled, false);
          legacyMarketplace = false;
          return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
        }
        if (command === 'plugin list --json') {
          return {
            status: 0,
            stdout: pluginList([
              ...(legacyInstalled ? [{
                pluginId: 'opl-flow@opl-flow-local',
                version: '0.1.52',
                sourcePath: pluginSource,
                marketplaceSource: source,
              }] : []),
              ...(targetInstalled ? [{
                pluginId: 'opl-flow@opl-flow',
                version: '0.1.53',
                sourcePath: pluginSource,
                marketplaceSource: source,
              }] : []),
            ]),
            stderr: '',
            error: null,
          };
        }
        return { status: 1, stdout: '', stderr: `unexpected command: ${command}`, error: null };
      },
    });
    assert.equal(readback.carrier.plugin_id, 'opl-flow@opl-flow');
    assert.equal(readback.carrier.precedence, 'exact_single_source');
    assert.equal(readback.executor.status, 'callable');
    assert.deepEqual(calls, [
      'plugin marketplace list --json',
      'plugin marketplace add gaofeng21cn/opl-flow --json',
      'plugin add opl-flow@opl-flow --json',
      'plugin list --json',
      'plugin remove opl-flow@opl-flow-local --json',
      'plugin list --json',
      'plugin marketplace list --json',
      'plugin marketplace remove opl-flow-local --json',
    ]);
  } finally {
    removeFixtureTree(root);
  }
});

test('configured Codex carrier reports a declared selector without a physical source as unavailable', () => {
  const readback = runConfiguredCodexPluginCarrier({
    descriptor,
    action: 'list',
    runner: () => ({
      status: 0,
      stdout: pluginList([]),
      stderr: '',
      error: null,
    }),
  });
  assert.equal(readback.status, 'physical_unavailable');
  assert.equal(readback.carrier.precedence, 'not_present');
  assert.equal(readback.executor.status, 'attention_needed');
  assert.equal(readback.reason, 'native_carrier_reports_not_installed');
  assert.equal(readback.carrier.observed_sources.length, 0);
});

test('an absent default Codex carrier does not masquerade as a failed native read', () => {
  const previousBinary = process.env.OPL_CODEX_PLUGIN_BIN;
  const error = Object.assign(new Error('spawnSync codex ENOENT'), { code: 'ENOENT' });
  delete process.env.OPL_CODEX_PLUGIN_BIN;
  try {
    const discovered = discoverInstalledPackageDescriptors({
      failClosedOnCarrierError: true,
      runner: () => ({
        status: null,
        stdout: '',
        stderr: '',
        error,
      }),
    });
    assert.equal([...discovered.values()].filter((entry) => entry.carrier_readback.kind !== 'project_local_owner_projection').length, 0);
  } finally {
    if (previousBinary === undefined) delete process.env.OPL_CODEX_PLUGIN_BIN;
    else process.env.OPL_CODEX_PLUGIN_BIN = previousBinary;
  }
});

test('exposure actions require an installed native descriptor', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-exposure-owner-required-'));
  const stateDir = path.join(root, 'opl-state');
  const binary = path.join(root, 'empty-codex.mjs');
  const env = {
    HOME: root,
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: binary,
  };
  try {
    fs.writeFileSync(binary, `#!/usr/bin/env node
if (process.argv.slice(2).join(' ') === 'plugin list --json') {
  process.stdout.write(JSON.stringify({ installed: [], available: [] }));
} else {
  process.exitCode = 2;
}
`);
    fs.chmodSync(binary, 0o755);
    for (const action of ['hide', 'unhide', 'enable', 'disable']) {
      const failure = runCliFailure(['packages', action, '--package-id', 'legacy.package'], env);
      assert.equal(
        failure.payload.error.details.failure_code,
        'agent_package_not_installed',
      );
      assert.equal(failure.payload.error.details.action, action);
    }
    assert.deepEqual(fs.existsSync(stateDir) ? fs.readdirSync(stateDir) : [], []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
