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

test('configured Codex carrier toggles only its native plugin table and verifies fresh enabled state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configured-carrier-toggle-'));
  const binary = path.join(root, 'fake-codex');
  const configHome = path.join(root, 'codex-home');
  const stateDir = path.join(root, 'opl-state');
  const stateFile = path.join(root, 'plugin-state.json');
  const sourcePath = path.join(root, 'plugin-source');
  const configPath = path.join(configHome, 'config.toml');
  const env = {
    CODEX_HOME: configHome,
    FIXTURE_PLUGIN_SOURCE: sourcePath,
    FIXTURE_PLUGIN_STATE: stateFile,
    OPL_STATE_DIR: stateDir,
  };
  try {
    writePluginSource(sourcePath, 'toggle');
    writeFakeCodex(binary);
    fs.mkdirSync(configHome, { recursive: true });
    fs.writeFileSync(configPath, [
      'model = "user-model"',
      '',
      '[plugins."unrelated@fixture-carrier"]',
      'enabled = true',
      '',
      '[plugins."third-party-research@fixture-carrier"]',
      'enabled = true',
      'custom = "preserved"',
      '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(stateFile, JSON.stringify({
      installed: true,
      version: '1.0.1',
      marketplaceSource: 'fixture-carrier',
    }), 'utf8');

    const disabled = runConfiguredCodexPluginCarrier({
      descriptor,
      action: 'disable',
      binary,
      env,
    });
    assert.equal(disabled.status, 'installed');
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.executor.status, 'attention_needed');
    assert.equal(disabled.native_command.join(' '), 'plugin list --json');
    assert.equal(disabled.native_action_dispatched, false);
    const disabledConfig = fs.readFileSync(configPath, 'utf8');
    assert.match(disabledConfig, /model = "user-model"/);
    assert.match(disabledConfig, /\[plugins\."unrelated@fixture-carrier"\]\nenabled = true/);
    assert.match(disabledConfig, /\[plugins\."third-party-research@fixture-carrier"\]\nenabled = false\ncustom = "preserved"/);

    const enabled = runConfiguredCodexPluginCarrier({
      descriptor,
      action: 'enable',
      binary,
      env,
    });
    assert.equal(enabled.status, 'installed');
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.executor.status, 'callable');
    assert.match(fs.readFileSync(configPath, 'utf8'), /\[plugins\."third-party-research@fixture-carrier"\]\nenabled = true\ncustom = "preserved"/);
    assert.equal(fs.existsSync(stateDir), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('headless internal carrier stays installed and Framework-callable while Codex exposure is disabled', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-headless-carrier-'));
  const binary = path.join(root, 'fake-codex');
  const configHome = path.join(root, 'codex-home');
  const stateFile = path.join(root, 'plugin-state.json');
  const sourcePath = path.join(root, 'plugin-source');
  const configPath = path.join(configHome, 'config.toml');
  const headlessDescriptor = { ...descriptor, interactionMode: 'headless_internal' as const };
  const env = {
    CODEX_HOME: configHome,
    FIXTURE_PLUGIN_SOURCE: sourcePath,
    FIXTURE_PLUGIN_STATE: stateFile,
  };
  try {
    writePluginSource(sourcePath, 'headless');
    writeFakeCodex(binary);
    fs.mkdirSync(configHome, { recursive: true });
    fs.writeFileSync(configPath, '', 'utf8');
    fs.writeFileSync(stateFile, JSON.stringify({
      installed: true,
      version: '1.0.1',
      marketplaceSource: 'fixture-carrier',
    }), 'utf8');

    const repaired = runConfiguredCodexPluginCarrier({
      descriptor: headlessDescriptor,
      action: 'repair',
      binary,
      env,
    });
    assert.equal(repaired.status, 'installed');
    assert.equal(repaired.enabled, false);
    assert.equal(repaired.executor.status, 'callable');
    assert.equal(repaired.reason, null);
    assert.match(
      fs.readFileSync(configPath, 'utf8'),
      /\[plugins\."third-party-research@fixture-carrier"\]\nenabled = false/,
    );

    assert.throws(
      () => runConfiguredCodexPluginCarrier({
        descriptor: headlessDescriptor,
        action: 'enable',
        dryRun: true,
        binary,
        env,
      }),
      (error: any) => error?.details?.failure_code
        === 'configured_codex_plugin_carrier_headless_enable_forbidden',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('headless internal carrier rejects an enabled same-name source outside its owner selector', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-headless-carrier-duplicate-'));
  const selectedSource = path.join(root, 'selected');
  const duplicateSource = path.join(root, 'duplicate');
  writePluginSource(selectedSource, 'selected');
  writePluginSource(duplicateSource, 'duplicate');
  try {
    const readback = runConfiguredCodexPluginCarrier({
      descriptor: { ...descriptor, interactionMode: 'headless_internal' },
      action: 'list',
      runner: () => ({
        status: 0,
        stdout: pluginList([{
          pluginId: pluginSelector,
          version: '1.0.1',
          sourcePath: selectedSource,
          marketplaceSource: 'fixture-carrier',
          enabled: false,
        }, {
          pluginId: 'third-party-research@historical-carrier',
          version: '1.0.1',
          sourcePath: duplicateSource,
          marketplaceSource: 'historical-carrier',
          enabled: true,
        }]),
        stderr: '',
        error: null,
      }),
    });
    assert.equal(readback.executor.status, 'attention_needed');
    assert.equal(readback.reason, 'configured_native_carrier_source_ambiguous');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('configured Codex carrier refuses to overwrite concurrent native config changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configured-carrier-toggle-conflict-'));
  const binary = path.join(root, 'fake-codex');
  const configHome = path.join(root, 'codex-home');
  const stateFile = path.join(root, 'plugin-state.json');
  const sourcePath = path.join(root, 'plugin-source');
  const configPath = path.join(configHome, 'config.toml');
  const env = {
    CODEX_HOME: configHome,
    FIXTURE_PLUGIN_SOURCE: sourcePath,
    FIXTURE_PLUGIN_STATE: stateFile,
  };
  try {
    writePluginSource(sourcePath, 'toggle-conflict');
    writeFakeCodex(binary);
    fs.mkdirSync(configHome, { recursive: true });
    fs.writeFileSync(configPath, [
      'model = "user-model"',
      '',
      '[plugins."third-party-research@fixture-carrier"]',
      'enabled = true',
      '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(stateFile, JSON.stringify({
      installed: true,
      version: '1.0.1',
      marketplaceSource: 'fixture-carrier',
    }), 'utf8');

    assert.throws(
      () => runConfiguredCodexPluginCarrier({
        descriptor,
        action: 'disable',
        binary,
        env,
        beforeConfigReplace: () => fs.appendFileSync(configPath, 'developer_mode = true\n', 'utf8'),
      }),
      (error: any) => error?.details?.failure_code
        === 'configured_codex_plugin_carrier_config_apply_conflict',
    );
    const config = fs.readFileSync(configPath, 'utf8');
    assert.match(config, /enabled = true/);
    assert.match(config, /developer_mode = true/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('configured Codex carrier initializes a missing home only before a native mutation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configured-carrier-first-mutation-'));
  const codexHome = path.join(root, 'codex-home');
  const env = { HOME: root, CODEX_HOME: codexHome };
  const calls: string[][] = [];
  try {
    runConfiguredCodexPluginCarrier({
      descriptor,
      action: 'list',
      env,
      runner: () => {
        assert.equal(fs.existsSync(codexHome), false);
        return { status: 0, stdout: pluginList([]), stderr: '', error: null };
      },
    });
    assert.equal(fs.existsSync(codexHome), false);

    runConfiguredCodexPluginCarrier({
      descriptor: { ...descriptor, carrier: { ...descriptor.carrier, marketplaceSource: null } },
      action: 'install',
      env,
      runner: ({ args }) => {
        assert.equal(fs.lstatSync(codexHome).isDirectory(), true);
        calls.push(args);
        return {
          status: 0,
          stdout: args.join(' ') === 'plugin list --json' ? pluginList([]) : JSON.stringify({ status: 'ok' }),
          stderr: '',
          error: null,
        };
      },
    });
    assert.deepEqual(calls, [
      ['plugin', 'add', pluginSelector, '--json'],
      ['plugin', 'list', '--json'],
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('configured Codex carrier ensures a descriptor-owned marketplace before native add', () => {
  const calls: string[][] = [];
  let marketplaceConfigured = false;
  let installed = false;
  const carrier = runConfiguredCodexPluginCarrier({
    descriptor: {
      ...descriptor,
      carrier: {
        ...descriptor.carrier,
        marketplaceSource: 'owner/third-party-marketplace@release',
      },
    },
    action: 'install',
    runner: ({ args }) => {
      calls.push(args);
      if (args.join(' ') === 'plugin marketplace list --json') {
        return {
          status: 0,
          stdout: JSON.stringify({
            marketplaces: marketplaceConfigured ? [{
              marketplaceSource: {
                source: 'owner/third-party-marketplace@release',
              },
            }] : [],
          }),
          stderr: '',
          error: null,
        };
      }
      if (args.join(' ') === 'plugin marketplace add owner/third-party-marketplace@release --json') {
        marketplaceConfigured = true;
        return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
      }
      if (args.join(' ') === `plugin add ${pluginSelector} --json`) {
        installed = true;
        return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
      }
      if (args.join(' ') === 'plugin list --json') {
        return {
          status: 0,
          stdout: installed ? pluginList([{
            pluginId: pluginSelector,
            version: '1.0.1',
            sourcePath: '/fixture/source',
            marketplaceSource: 'third-party-marketplace',
          }]) : pluginList([]),
          stderr: '',
          error: null,
        };
      }
      return { status: 1, stdout: '', stderr: `unexpected command: ${args.join(' ')}`, error: null };
    },
  });
  assert.equal(carrier.status, 'installed');
  assert.deepEqual(calls, [
    ['plugin', 'marketplace', 'list', '--json'],
    ['plugin', 'marketplace', 'add', 'owner/third-party-marketplace@release', '--json'],
    ['plugin', 'add', pluginSelector, '--json'],
    ['plugin', 'list', '--json'],
  ]);
});

test('owner descriptor lifecycle and read-model use the native carrier without OPL private state writes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configured-carrier-generic-'));
  const stateDir = path.join(root, 'opl-state');
  const binary = path.join(root, 'fake-codex.mjs');
  const pluginState = path.join(root, 'plugin-state.json');
  const pluginSource = path.join(root, 'plugin-source');
  writePluginSource(pluginSource, 'callable');
  fs.writeFileSync(
    path.join(pluginSource, 'opl-package.json'),
    // The installed owner descriptor deliberately has no legacy configured
    // carrier block. Subsequent actions must derive the native adapter from
    // the fresh installed carrier, not a Framework discovery cache.
    formatJsonPayload(installedOwnerDescriptor()),
  );
  writeFakeCodex(binary, ownerPackageVersion);
  const env = {
    HOME: root,
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: binary,
    FIXTURE_PLUGIN_STATE: pluginState,
    FIXTURE_PLUGIN_SOURCE: pluginSource,
  };
  const assertNoPrivateState = () => {
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-registry-cache.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle-ledger.json')), false);
  };
  try {
    const install = runCli([
      'packages', 'install', packageId,
    ], env) as any;
    assert.equal(install.opl_agent_package_install.status, 'installed');
    assert.equal(install.opl_agent_package_install.package_id, packageId);
    assert.equal(Object.hasOwn(install.opl_agent_package_install, 'package_lock'), false);
    assert.equal(Object.hasOwn(install.opl_agent_package_install, 'lifecycle_receipt'), false);
    assert.equal(Object.hasOwn(install.opl_agent_package_install, 'opl_private_state_writes'), false);
    assert.equal(Object.hasOwn(install.opl_agent_package_install, 'registry_entry'), false);
    assertNoPrivateState();

    const lockPath = path.join(stateDir, 'agent-package-locks.json');
    const invalidLegacyLock = '{ invalid legacy lock\n';
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(lockPath, invalidLegacyLock, 'utf8');
    const status = runCli(['packages', 'status', '--package-id', packageId], env) as any;
    assert.equal(status.opl_agent_package_status.status, 'available');
    assert.equal(status.opl_agent_package_status.operational_ready, true);
    assert.equal(status.opl_agent_package_status.launch_allowed, true);
    assert.equal(Object.hasOwn(status.opl_agent_package_status, 'installed_packages'), false);
    assert.equal(status.opl_agent_package_status.configured_carrier.status, 'installed');
    assert.equal(fs.readFileSync(lockPath, 'utf8'), invalidLegacyLock);

    assert.equal(fs.readFileSync(lockPath, 'utf8'), invalidLegacyLock);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle-ledger.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle.sqlite')), false);

    fs.rmSync(lockPath);
    assertNoPrivateState();

    const packageStatus = runCli(['packages', 'status', '--package-id', packageId], env) as any;
    assert.equal(packageStatus.opl_agent_package_status.operational_ready, true);
    assert.equal(packageStatus.opl_agent_package_status.launch_allowed, true);
    assertNoPrivateState();

    const hideDryRun = runCli(['packages', 'hide', '--package-id', packageId, '--dry-run'], env) as any;
    assert.equal(hideDryRun.opl_agent_package_exposure.status, 'validated_no_write');
    assert.equal(Object.hasOwn(hideDryRun.opl_agent_package_exposure, 'package_lock'), false);
    assert.equal(Object.hasOwn(hideDryRun.opl_agent_package_exposure, 'lifecycle_receipt'), false);
    assert.equal(hideDryRun.opl_agent_package_exposure.home_shortcut_preferences[0].visible, false);
    assertNoPrivateState();

    const hidden = runCli(['packages', 'hide', '--package-id', packageId], env) as any;
    assert.equal(hidden.opl_agent_package_exposure.status, 'hidden');
    assert.equal(Object.hasOwn(hidden.opl_agent_package_exposure, 'package_lock'), false);
    assert.equal(Object.hasOwn(hidden.opl_agent_package_exposure, 'lifecycle_receipt'), false);
    assert.equal(hidden.opl_agent_package_exposure.home_shortcut_preferences[0].visible, false);
    assertNoPrivateState();

    const hiddenPreferences = runCli(['packages', 'list'], env) as any;
    assert.deepEqual(
      hiddenPreferences.opl_agent_packages.home_shortcut_preferences.filter((entry: any) => entry.package_id === packageId),
      [{
        package_id: packageId,
        shortcut_id: 'research',
        visible: false,
        sort_order: null,
        source: 'user_preference',
        updated_at: hiddenPreferences.opl_agent_packages.home_shortcut_preferences.find((entry: any) => entry.package_id === packageId).updated_at,
        installed: true,
      }],
    );
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-home-shortcut-preferences.json')), true);
    assertNoPrivateState();

    const unhidden = runCli(['packages', 'unhide', '--package-id', packageId], env) as any;
    assert.equal(unhidden.opl_agent_package_exposure.status, 'visible');
    assert.equal(Object.hasOwn(unhidden.opl_agent_package_exposure, 'package_lock'), false);
    assert.equal(Object.hasOwn(unhidden.opl_agent_package_exposure, 'lifecycle_receipt'), false);
    assert.equal(unhidden.opl_agent_package_exposure.home_shortcut_preferences[0].visible, true);
    assertNoPrivateState();

    const disabled = runCli(['packages', 'disable', packageId], env) as any;
    assert.equal(disabled.opl_agent_package_exposure.status, 'disabled');
    assertNoPrivateState();

    const enabled = runCli(['packages', 'enable', packageId], env) as any;
    assert.equal(enabled.opl_agent_package_exposure.status, 'enabled');
    assertNoPrivateState();

    const list = runCli(['packages', 'list', '--detail', 'full'], env) as any;
    const entry = list.opl_agent_packages.directory.entries.find(
      (candidate: any) => candidate.package_id === packageId,
    );
    assert.equal(entry.installed, true);
    assert.equal(entry.configured_carrier.carrier.precedence, 'exact_single_source');
    assert.equal(Object.hasOwn(entry, 'legacy_private_lifecycle_state_present'), false);
    assertNoPrivateState();

    for (const action of ['update', 'repair']) {
      const readback = runCli(['packages', action, packageId], env) as any;
      assert.equal(Object.hasOwn(readback[`opl_agent_package_${action}`], 'package_lock'), false);
      assert.equal(Object.hasOwn(readback[`opl_agent_package_${action}`], 'lifecycle_receipt'), false);
      assertNoPrivateState();
    }
    const uninstall = runCli(['packages', 'uninstall', packageId], env) as any;
    assert.equal(uninstall.opl_agent_package_uninstall.status, 'uninstalled');
    assert.equal(
      uninstall.opl_agent_package_uninstall.configured_carrier.status,
      'physical_unavailable',
    );
    const afterRemoval = runCli(['packages', 'status', '--package-id', packageId], env) as any;
    assert.equal(afterRemoval.opl_agent_package_status.status, 'not_installed');
    assert.equal(afterRemoval.opl_agent_package_status.installed_package_count, 0);
    assert.equal(afterRemoval.opl_agent_package_status.operational_ready, false);
    assert.equal(afterRemoval.opl_agent_package_status.launch_allowed, false);
    assert.equal(afterRemoval.opl_agent_package_status.configured_carrier, null);
    assertNoPrivateState();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('published first-party owner descriptor routes a scoped native action without private lifecycle writes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-owner-carrier-'));
  const stateDir = path.join(root, 'opl-state');
  const binary = path.join(root, 'fake-codex.mjs');
  const pluginSource = path.join(root, 'plugin-source');
  const skillRoot = path.join(pluginSource, 'skills', 'opl-relay');
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), '# OPL Relay\n');
  fs.mkdirSync(path.join(pluginSource, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(path.join(pluginSource, '.codex-plugin', 'plugin.json'), formatJsonPayload({
    name: 'opl-relay',
    version: '0.5.3',
    description: 'OPL Relay native carrier fixture.',
    skills: './skills/',
  }));
  fs.writeFileSync(
    path.join(pluginSource, 'opl-package.json'),
    formatJsonPayload({
      surface_kind: 'opl_agent_package_manifest.v1',
      kind: 'agent',
      agent_id: 'opl-relay',
      package_id: 'opl-relay',
      domain_id: 'communications_mail',
      display_name: 'OPL Relay',
      publisher: 'one-person-lab',
      version: '0.5.2',
      source: 'first_party_repo_local',
      carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
      source_repo: 'https://github.com/gaofeng21cn/opl-relay.git',
      schema_ref: 'one-person-lab/contracts/opl-framework/agent-package-manifest.schema.json',
      domain_descriptor_ref: 'contracts/domain_descriptor.json',
      task_provider_ref: 'contracts/domain_descriptor.json#/standard_agent_interface/stage_catalog',
      action_catalog_ref: 'contracts/action_catalog.json',
      view_refs: [],
      entrypoints: [{
        entrypoint_id: 'codex_primary_skill',
        entrypoint_kind: 'codex_skill',
        source_ref: 'skills/opl-relay/SKILL.md',
        carrier_ref: 'skills/opl-relay/SKILL.md',
        authority: 'carrier_only_not_domain_truth',
      }],
      codex_surface: {
        plugin_id: 'opl-relay',
        plugin_source_path: '.',
        required_skill_ids: ['opl-relay'],
      },
      requires: [],
      capability_dependencies: [],
    }),
  );
  fs.writeFileSync(binary, `#!/usr/bin/env node
const args = process.argv.slice(2);
const installed = {
  pluginId: 'opl-relay@opl-relay',
  version: '0.5.3',
  installed: true,
  enabled: true,
  source: { source: 'local', path: process.env.FIXTURE_PLUGIN_SOURCE },
  marketplaceSource: { sourceType: 'github', source: 'gaofeng21cn/opl-relay' },
};
if (args.join(' ') === 'plugin list --json') {
  process.stdout.write(JSON.stringify({ installed: [installed], available: [] }));
} else if (args.join(' ') === 'plugin marketplace add gaofeng21cn/opl-relay --json') {
  process.stdout.write(JSON.stringify({ status: 'ok' }));
} else if (args.join(' ') === 'plugin add opl-relay@opl-relay --json') {
  process.stdout.write(JSON.stringify({ status: 'ok' }));
} else {
  process.exitCode = 2;
}
`);
  fs.chmodSync(binary, 0o755);
  const env = {
    HOME: root,
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: binary,
    FIXTURE_PLUGIN_SOURCE: pluginSource,
  };
  try {
    const update = runCli(['packages', 'update', 'opl-relay'], env) as any;
    const updateSurface = update.opl_agent_package_update;
    assert.equal(updateSurface.package_id, 'opl-relay');
    assert.equal(updateSurface.status, 'updated');
    assert.equal(Object.hasOwn(updateSurface, 'package_lock'), false);
    assert.equal(Object.hasOwn(updateSurface, 'lifecycle_receipt'), false);
    assert.equal(Object.hasOwn(updateSurface, 'opl_private_state_writes'), false);
    assert.equal(Object.hasOwn(updateSurface, 'registry_entry'), false);
    assert.equal(updateSurface.configured_carrier.status, 'installed');
    assert.equal(updateSurface.configured_carrier.operation, 'update');
    assert.deepEqual(
      updateSurface.configured_carrier.native_command,
      ['plugin', 'add', 'opl-relay@opl-relay', '--json'],
    );
    assert.equal(updateSurface.configured_carrier.native_action_dispatched, true);

    const status = runCli(['packages', 'status', '--package-id', 'opl-relay'], env) as any;
    const surface = status.opl_agent_package_status;
    assert.equal(surface.package_id, 'opl-relay');
    assert.equal(surface.status, 'available');
    assert.equal(surface.operational_ready, true);
    assert.equal(surface.launch_allowed, true);
    assert.equal(surface.configured_carrier.status, 'installed');
    assert.equal(surface.configured_carrier.operation, 'list');
    assert.equal(surface.configured_carrier.native_action_dispatched, true);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-registry-cache.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle-ledger.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle.sqlite')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('native descriptor visibility leaves an existing legacy lock diagnostic-only', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configured-carrier-legacy-exposure-'));
  const stateDir = path.join(root, 'opl-state');
  const manifestPath = path.join(root, 'manifest.json');
  const binary = path.join(root, 'fake-codex.mjs');
  const pluginState = path.join(root, 'plugin-state.json');
  const pluginSource = path.join(root, 'plugin-source');
  const workspace = path.join(root, 'workspace');
  const env = {
    HOME: root,
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: binary,
    FIXTURE_PLUGIN_STATE: pluginState,
    FIXTURE_PLUGIN_SOURCE: pluginSource,
  };
  try {
    fs.mkdirSync(workspace, { recursive: true });
    writePluginSource(pluginSource, 'legacy-exposure');
    fs.mkdirSync(path.join(pluginSource, '.codex-plugin'), { recursive: true });
    fs.writeFileSync(path.join(pluginSource, '.codex-plugin', 'plugin.json'), formatJsonPayload({
      name: 'third-party-research',
      version: '1.0.1',
      description: 'Legacy exposure fixture carried by Codex Plugin Manager.',
      skills: './skills/',
    }));
    fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest({
      pluginSourcePath: pluginSource,
      distributionPayload: null,
    })));
    writeFakeCodex(binary);

    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(stateDir, 'agent-package-locks.json'),
      formatJsonPayload({
        surface_kind: 'opl_agent_package_lock_index',
        version: 'opl-agent-package-lock-index.v1',
        packages: [],
      }),
    );
    const legacyLockBytes = fs.readFileSync(path.join(stateDir, 'agent-package-locks.json'), 'utf8');
    const legacyLedgerPath = path.join(stateDir, 'agent-package-lifecycle-ledger.json');
    assert.equal(fs.existsSync(legacyLedgerPath), false);

    fs.writeFileSync(
      path.join(pluginSource, 'opl-package.json'),
      formatJsonPayload(installedOwnerDescriptor()),
    );
    fs.writeFileSync(pluginState, JSON.stringify({
      installed: true,
      version: '1.0.1',
      marketplaceSource: 'fixture-carrier',
    }));

    const descriptorStatus = runCli(['packages', 'status', '--package-id', packageId], env) as any;
    assert.equal(descriptorStatus.opl_agent_package_status.status, 'available');
    assert.equal(descriptorStatus.opl_agent_package_status.operational_ready, true);
    assert.equal(descriptorStatus.opl_agent_package_status.launch_allowed, true);
    assert.equal(descriptorStatus.opl_agent_package_status.installed_package_count, 1);
    assert.equal(Object.hasOwn(descriptorStatus.opl_agent_package_status, 'installed_packages'), false);
    assert.equal(Object.hasOwn(descriptorStatus.opl_agent_package_status, 'owner_route_readback'), false);

    const descriptorDirectory = runCli(['packages', 'list', '--detail', 'full'], env) as any;
    const descriptorEntry = descriptorDirectory.opl_agent_packages.directory.entries.find(
      (entry: any) => entry.package_id === packageId,
    );
    assert.equal(Object.hasOwn(descriptorEntry, 'lock_ref'), false);
    assert.equal(Object.hasOwn(descriptorEntry, 'legacy_private_lifecycle_state_present'), false);
    assert.equal(descriptorDirectory.opl_agent_packages.installed_package_count, 1);
    assert.equal(descriptorDirectory.opl_agent_packages.status, 'available');
    assert.equal(descriptorDirectory.opl_agent_packages.directory.status, 'available');
    assert.equal(Object.hasOwn(descriptorDirectory.opl_agent_packages, 'legacy_authority'), false);
    assert.equal(Object.hasOwn(descriptorDirectory.opl_agent_packages.directory, 'legacy_authority'), false);
    assert.equal(Object.hasOwn(descriptorDirectory.opl_agent_packages, 'installed_packages'), false);
    assert.equal(Object.hasOwn(descriptorDirectory.opl_agent_packages, 'owner_route_readback'), false);
    assert.equal(fs.readFileSync(path.join(stateDir, 'agent-package-locks.json'), 'utf8'), legacyLockBytes);
    assert.equal(fs.existsSync(legacyLedgerPath), false);

    const packageStatus = runCli([
      'packages', 'status', '--package-id', packageId,
    ], env) as any;
    assert.equal(packageStatus.opl_agent_package_status.operational_ready, true);
    assert.equal(packageStatus.opl_agent_package_status.launch_allowed, true);
    assert.equal(fs.readFileSync(path.join(stateDir, 'agent-package-locks.json'), 'utf8'), legacyLockBytes);
    assert.equal(fs.existsSync(legacyLedgerPath), false);

    const hidden = runCli(['packages', 'hide', '--package-id', packageId], env) as any;
    assert.equal(hidden.opl_agent_package_exposure.status, 'hidden');
    assert.equal(Object.hasOwn(hidden.opl_agent_package_exposure, 'package_lock'), false);
    assert.equal(Object.hasOwn(hidden.opl_agent_package_exposure, 'lifecycle_receipt'), false);
    assert.deepEqual(hidden.opl_agent_package_exposure.home_shortcut_preferences.map((entry: any) => entry.visible), [false]);
    assert.equal(fs.readFileSync(path.join(stateDir, 'agent-package-locks.json'), 'utf8'), legacyLockBytes);
    assert.equal(fs.existsSync(legacyLedgerPath), false);

    const unhidden = runCli(['packages', 'unhide', '--package-id', packageId], env) as any;
    assert.equal(unhidden.opl_agent_package_exposure.status, 'visible');
    assert.equal(Object.hasOwn(unhidden.opl_agent_package_exposure, 'package_lock'), false);
    assert.equal(Object.hasOwn(unhidden.opl_agent_package_exposure, 'lifecycle_receipt'), false);
    assert.deepEqual(unhidden.opl_agent_package_exposure.home_shortcut_preferences.map((entry: any) => entry.visible), [true]);
    assert.equal(fs.readFileSync(path.join(stateDir, 'agent-package-locks.json'), 'utf8'), legacyLockBytes);
    assert.equal(fs.existsSync(legacyLedgerPath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('preloaded native status reader does not parse or replace a corrupt legacy lock', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-preloaded-native-status-'));
  const stateDir = path.join(root, 'opl-state');
  const binary = path.join(root, 'fake-codex.mjs');
  const pluginState = path.join(root, 'plugin-state.json');
  const pluginSource = path.join(root, 'plugin-source');
  const lockPath = path.join(stateDir, 'agent-package-locks.json');
  const invalidLegacyLock = '{ invalid legacy lock\n';
  const env = {
    HOME: root,
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: binary,
    FIXTURE_PLUGIN_STATE: pluginState,
    FIXTURE_PLUGIN_SOURCE: pluginSource,
  };
  const previous = new Map(
    Object.keys(env).map((name) => [name, process.env[name]]),
  );
  try {
    writePluginSource(pluginSource, 'preloaded-native-status');
    writePluginManifest(pluginSource);
    fs.writeFileSync(
      path.join(pluginSource, 'opl-package.json'),
      formatJsonPayload(installedOwnerDescriptor()),
    );
    writeFakeCodex(binary);
    fs.writeFileSync(pluginState, JSON.stringify({
      installed: true,
      version: '1.0.1',
      marketplaceSource: 'fixture-carrier',
    }));
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(lockPath, invalidLegacyLock, 'utf8');

    const directory = runCli(['packages', 'list', '--detail', 'full'], env) as any;
    const directoryEntry = directory.opl_agent_packages.directory.entries.find(
      (entry: any) => entry.package_id === packageId,
    );
    assert.equal(directory.opl_agent_packages.status, 'available');
    assert.equal(Object.hasOwn(directory.opl_agent_packages, 'legacy_authority'), false);
    assert.equal(Object.hasOwn(directory.opl_agent_packages.directory, 'legacy_authority'), false);
    assert.equal(directory.opl_agent_packages.directory.status, 'available');
    assert.equal(directoryEntry.installed, true);
    assert.equal(directory.opl_agent_packages.installed_package_count, 1);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), invalidLegacyLock);

    const globalStatus = runCli(['packages', 'status'], env) as any;
    assert.equal(globalStatus.opl_agent_package_status.status, 'available');
    assert.equal(globalStatus.opl_agent_package_status.installed_package_count, 1);
    assert.equal(Object.hasOwn(globalStatus.opl_agent_package_status, 'legacy_authority'), false);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), invalidLegacyLock);

    const appState = runCli(['app', 'state', '--profile', 'fast'], env) as any;
    assert.equal(appState.app_state.agent_packages.directory.entries.some(
      (entry: any) => entry.package_id === packageId,
    ), true);
    assert.equal(appState.app_state.agent_packages.directory.status, 'available');
    assert.equal(Object.hasOwn(appState.app_state.agent_packages.directory, 'legacy_authority'), false);
    assert.equal(appState.app_state.agent_packages.status_index.installed_package_count, 1);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), invalidLegacyLock);

    Object.assign(process.env, env);
    const readStatus = createOplAgentPackageStatusReader();
    const preloadedGlobalStatus = readStatus({
      detail: 'fast',
    }).opl_agent_package_status;
    assert.equal(preloadedGlobalStatus.status, 'available');
    assert.equal(preloadedGlobalStatus.installed_package_count, 1);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), invalidLegacyLock);

    const invalidLegacyShape = formatJsonPayload({
      surface_kind: 'opl_agent_package_lock_index',
      version: 'opl-agent-package-lock-index.v1',
      packages: [{
        package_id: 'NONCANONICAL.PACKAGE',
      }],
    });
    fs.writeFileSync(lockPath, invalidLegacyShape, 'utf8');

    for (let index = 0; index < 2; index += 1) {
      const status = readStatus({
        packageId,
        detail: 'fast',
      }).opl_agent_package_status;
      assert.equal(status.status, 'available');
      assert.equal(status.operational_ready, true);
      assert.equal(status.launch_allowed, true);
      assert.equal(status.installed_package_count, 1);
      assert.equal(Object.hasOwn(status, 'installed_packages'), false);
      assert.equal(Object.hasOwn(status, 'legacy_authority'), false);
    }
    const legacyOnly = readStatus({ packageId: 'legacy.package', detail: 'fast' })
      .opl_agent_package_status;
    assert.equal(legacyOnly.status, 'not_installed');
    assert.equal(legacyOnly.installed_package_count, 0);
      assert.equal(Object.hasOwn(legacyOnly, 'installed_packages'), false);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), invalidLegacyShape);
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
