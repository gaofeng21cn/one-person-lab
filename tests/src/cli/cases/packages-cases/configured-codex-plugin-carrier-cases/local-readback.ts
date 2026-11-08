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
import { readInstalledCarrierEntries } from '../../../../../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory-lifecycle.ts';
import { CODEX_PLUGIN_LIST_TIMEOUT_MS } from '../../../../../../src/adapters/integration/agent-package-registry-parts/configured-codex-plugin-carrier-native.ts';

test('installed carrier discovery terminates a hung native readback and rejects partial output', { timeout: 20_000 }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-carrier-discovery-timeout-'));
  const binary = path.join(root, 'hung-codex');
  try {
    fs.writeFileSync(binary, [
      `#!${process.execPath}`,
      'process.stdout.write(JSON.stringify({ installed: [] }));',
      'process.on("SIGTERM", () => {});',
      'setInterval(() => {}, 1_000);',
    ].join('\n'), { mode: 0o755 });
    const startedAt = Date.now();
    assert.throws(() => readInstalledCarrierEntries({
      binary, includeInternal: false, failClosedOnCarrierError: true,
    }), (error: any) => error?.details?.failure_code === 'configured_codex_plugin_carrier_unavailable'
      && /timed out|ETIMEDOUT/.test(error.details.error));
    assert.ok(Date.now() - startedAt < CODEX_PLUGIN_LIST_TIMEOUT_MS + 5_000);
  } finally {
    removeFixtureTree(root);
  }
});

test('configured Codex carrier validates a local readback when the CLI is unavailable without extending the fallback to writes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configured-carrier-local-readback-'));
  const marketplaceRoot = path.join(root, 'marketplace');
  const codexHome = path.join(root, 'codex-home');
  const configPath = path.join(codexHome, 'config.toml');
  const nativeDescriptor = {
    ...descriptor,
    carrier: {
      ...descriptor.carrier,
      marketplaceSource: marketplaceRoot,
    },
  };
  const env = { CODEX_HOME: codexHome };
  try {
    writeNativeMarketplace(marketplaceRoot, '1.0.7');
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(configPath, [
      '[marketplaces.fixture-carrier]',
      'source_type = "local"',
      `source = ${JSON.stringify(marketplaceRoot)}`,
      '',
      '[plugins."third-party-research@fixture-carrier"]',
      'enabled = true',
      '',
    ].join('\n'), 'utf8');

    const readback = runConfiguredCodexPluginCarrier({
      descriptor: nativeDescriptor,
      action: 'list',
      env,
      runner: unavailableCodexRunner(),
    });
    assert.equal(readback.status, 'installed');
    assert.equal(readback.installed_version, '1.0.7');
    assert.equal(readback.enabled, true);
    assert.equal(readback.executor.status, 'callable');
    assert.equal(readback.carrier.precedence, 'exact_single_source');
    assert.equal(readback.carrier.marketplace_source, marketplaceRoot);
    assert.equal(
      readback.plugin_source_path,
      path.join(marketplaceRoot, 'plugins', 'third-party-research'),
    );
    assert.equal(readback.native_action_dispatched, false);

    assert.throws(
      () => runConfiguredCodexPluginCarrier({
        descriptor: nativeDescriptor,
        action: 'update',
        env,
        runner: unavailableCodexRunner(),
      }),
      (error: any) => error?.details?.failure_code
        === 'configured_codex_plugin_carrier_unavailable',
    );

    fs.appendFileSync(configPath, [
      '[plugins."third-party-research@other-marketplace"]',
      'enabled = true',
      '',
    ].join('\n'), 'utf8');
    const ambiguous = runConfiguredCodexPluginCarrier({
      descriptor: nativeDescriptor,
      action: 'list',
      env,
      runner: unavailableCodexRunner(),
    });
    assert.equal(ambiguous.status, 'physical_unavailable');
    assert.equal(ambiguous.reason, 'configured_codex_plugin_carrier_local_config_ambiguous');
  } finally {
    removeFixtureTree(root);
  }
});
test('configured Codex carrier local readback rejects marketplace path escape and symlink sources', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configured-carrier-local-readback-safety-'));
  const marketplaceRoot = path.join(root, 'marketplace');
  const codexHome = path.join(root, 'codex-home');
  const configPath = path.join(codexHome, 'config.toml');
  const marketplacePath = path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json');
  const nativeDescriptor = {
    ...descriptor,
    carrier: {
      ...descriptor.carrier,
      marketplaceSource: marketplaceRoot,
    },
  };
  const env = { CODEX_HOME: codexHome };
  const readback = () => runConfiguredCodexPluginCarrier({
    descriptor: nativeDescriptor,
    action: 'list',
    env,
    runner: unavailableCodexRunner(),
  });
  try {
    writeNativeMarketplace(marketplaceRoot, '1.0.7');
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(configPath, [
      '[marketplaces.fixture-carrier]',
      'source_type = "local"',
      `source = ${JSON.stringify(marketplaceRoot)}`,
      '',
      '[plugins."third-party-research@fixture-carrier"]',
      'enabled = true',
      '',
    ].join('\n'), 'utf8');

    const manifest = parseJsonText(fs.readFileSync(marketplacePath, 'utf8')) as any;
    manifest.plugins[0].source.path = '../../outside';
    fs.writeFileSync(marketplacePath, formatJsonPayload(manifest));
    assert.equal(
      readback().reason,
      'configured_codex_plugin_carrier_local_source_unsafe',
    );

    writeNativeMarketplace(marketplaceRoot, '1.0.7');
    const pluginRoot = path.join(marketplaceRoot, 'plugins', 'third-party-research');
    const displaced = path.join(root, 'displaced-plugin');
    fs.renameSync(pluginRoot, displaced);
    fs.symlinkSync(displaced, pluginRoot, 'dir');
    assert.equal(
      readback().reason,
      'configured_codex_plugin_carrier_local_source_unsafe',
    );
  } finally {
    removeFixtureTree(root);
  }
});

test('configured Codex carrier executes native install/list/update/repair/remove with fresh readback', {
  skip: process.env.OPL_RUN_CODEX_PLUGIN_CARRIER_INTEGRATION === '1'
    ? false
    : 'set OPL_RUN_CODEX_PLUGIN_CARRIER_INTEGRATION=1 to exercise the configured native carrier',
}, () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configured-codex-plugin-carrier-'));
  const marketplaceRoot = path.join(fixtureRoot, 'marketplace');
  const codexHome = path.join(fixtureRoot, 'codex-home');
  const oplStateDir = path.join(fixtureRoot, 'opl-state');
  const binary = process.env.OPL_CODEX_PLUGIN_BIN?.trim() || 'codex';
  fs.mkdirSync(codexHome, { recursive: true });
  const env = { ...process.env, CODEX_HOME: codexHome, OPL_STATE_DIR: oplStateDir };
  const nativeDescriptor = {
    ...descriptor,
    carrier: {
      ...descriptor.carrier,
      marketplaceSource: marketplaceRoot,
    },
  };
  try {
    writeNativeMarketplace(marketplaceRoot, '1.0.0');

    const absent = runConfiguredCodexPluginCarrier({
      descriptor: nativeDescriptor,
      action: 'list',
      binary,
      env,
    });
    assert.equal(absent.status, 'physical_unavailable');

    const installed = runConfiguredCodexPluginCarrier({
      descriptor: nativeDescriptor,
      action: 'install',
      binary,
      env,
    });
    assert.equal(installed.status, 'installed');
    assert.equal(installed.installed_version, '1.0.0');
    assert.equal(installed.executor.status, 'callable');
    assert.equal(installed.native_action_dispatched, true);
    assert.equal(fs.existsSync(oplStateDir), false);

    const requiredSkill = path.join(
      marketplaceRoot,
      'plugins',
      'third-party-research',
      'skills',
      'third-party-research',
      'SKILL.md',
    );
    fs.rmSync(requiredSkill);
    const drifted = runConfiguredCodexPluginCarrier({
      descriptor: nativeDescriptor,
      action: 'list',
      binary,
      env,
    });
    assert.equal(drifted.status, 'installed');
    assert.equal(drifted.executor.status, 'attention_needed');
    assert.match(drifted.reason ?? '', /required_skill_unavailable/);

    writeNativeMarketplace(marketplaceRoot, '1.0.1');
    const updated = runConfiguredCodexPluginCarrier({
      descriptor: nativeDescriptor,
      action: 'update',
      binary,
      env,
    });
    assert.equal(updated.status, 'installed');
    assert.equal(updated.installed_version, '1.0.1');
    assert.equal(fs.existsSync(oplStateDir), false);

    const repaired = runConfiguredCodexPluginCarrier({
      descriptor: nativeDescriptor,
      action: 'repair',
      binary,
      env,
    });
    assert.equal(repaired.status, 'installed');
    assert.equal(repaired.installed_version, '1.0.1');
    assert.equal(fs.existsSync(oplStateDir), false);

    const disabled = runConfiguredCodexPluginCarrier({
      descriptor: nativeDescriptor,
      action: 'disable',
      binary,
      env,
    });
    assert.equal(disabled.status, 'installed');
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.executor.status, 'attention_needed');
    assert.equal(disabled.reason, 'configured_native_carrier_disabled');
    assert.equal(fs.existsSync(oplStateDir), false);

    const enabled = runConfiguredCodexPluginCarrier({
      descriptor: nativeDescriptor,
      action: 'enable',
      binary,
      env,
    });
    assert.equal(enabled.status, 'installed');
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.executor.status, 'callable');
    assert.equal(fs.existsSync(oplStateDir), false);

    const removed = runConfiguredCodexPluginCarrier({
      descriptor: nativeDescriptor,
      action: 'remove',
      binary,
      env,
    });
    assert.equal(removed.status, 'physical_unavailable');
    assert.equal(removed.executor.status, 'attention_needed');
    assert.equal(fs.existsSync(path.join(oplStateDir, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(oplStateDir, 'agent-package-lifecycle-ledger.json')), false);
    assert.equal(fs.existsSync(path.join(oplStateDir, 'agent-package-lifecycle.sqlite')), false);
    assert.equal(fs.existsSync(oplStateDir), false);
  } finally {
    removeFixtureTree(fixtureRoot);
  }
});
