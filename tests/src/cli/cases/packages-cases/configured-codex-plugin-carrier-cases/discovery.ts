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
  configuredCarrierFromDescriptor,
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
import { execFileSync } from 'node:child_process';
import type { CodexPluginCommandRunner } from '../configured-codex-plugin-carrier-shared.ts';

test('GitHub archive payload reads the owner source path independently from its install path', () => {
  const commit = '1'.repeat(40);
  const source = new URL(
    `https://raw.githubusercontent.com/owner/repository/${commit}/plugins/example/.codex-plugin/plugin.json`,
  );

  assert.deepEqual(githubArchiveFileSource(source, commit), {
    key: `owner/repository@${commit}`,
    archiveUrl: `https://codeload.github.com/owner/repository/tar.gz/${commit}`,
    relativePath: 'plugins/example/.codex-plugin/plugin.json',
  });
});
test('configured payload downloads retry only bounded transient transport failures', () => {
  const transportFailure = {
    status: 35,
    stdout: Buffer.alloc(0),
    stderr: 'curl: (35) TLS connect error',
    error: null,
  };
  const success = {
    status: 0,
    stdout: Buffer.from('payload'),
    stderr: '',
    error: null,
  };
  const attempts = [transportFailure, transportFailure, success];
  const delays: number[] = [];
  const retried = runConfiguredDownloadWithTransientRetry(
    () => attempts.shift() ?? success,
    (delayMs) => delays.push(delayMs),
  );
  assert.equal(retried.status, 0);
  assert.equal(retried.attemptCount, 3);
  assert.deepEqual(delays, [250, 500]);

  assert.equal(isTransientConfiguredDownloadFailure({
    status: 22,
    stderr: 'curl: (22) The requested URL returned error: 503',
    error: null,
  }), true);
  assert.equal(isTransientConfiguredDownloadFailure({
    status: 16,
    stderr: 'curl: (16) Error in the HTTP2 framing layer',
    error: null,
  }), true);
  assert.equal(isTransientConfiguredDownloadFailure({
    status: 22,
    stderr: 'curl: (22) The requested URL returned error: 404',
    error: null,
  }), false);
  assert.equal(isTransientConfiguredDownloadFailure({
    status: null,
    stderr: '',
    error: Object.assign(new Error('spawn failed'), { code: 'ENOENT' }),
  }), false);

  let permanentAttempts = 0;
  const permanent = runConfiguredDownloadWithTransientRetry(() => {
    permanentAttempts += 1;
    return {
      status: 22,
      stdout: Buffer.alloc(0),
      stderr: 'curl: (22) The requested URL returned error: 403',
      error: null,
    };
  }, () => assert.fail('permanent failure must not wait for a retry'));
  assert.equal(permanent.status, 22);
  assert.equal(permanent.attemptCount, 1);
  assert.equal(permanentAttempts, 1);
});

test('configured carrier snapshot reuses one Codex plugin list across descriptors', () => {
  let calls = 0;
  const runner = createMemoizedCodexPluginListRunner(() => {
    calls += 1;
    return {
      status: 0,
      stdout: pluginList([]),
      stderr: '',
      error: null,
    };
  });
  runConfiguredCodexPluginCarrier({ descriptor, action: 'list', runner });
  runConfiguredCodexPluginCarrier({
    descriptor: {
      ...descriptor,
      packageId: 'another.package',
      carrier: { ...descriptor.carrier, pluginId: 'another-package@fixture-carrier' },
      executor: { ...descriptor.executor, requiredSkillIds: [] },
    },
    action: 'list',
    runner,
  });
  assert.equal(calls, 1);
});

test('available discovery failure does not erase installed Package truth', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-installed-package-survives-available-failure-'));
  const sourcePath = path.join(root, 'plugin-source');
  const binary = path.join(root, 'fake-codex.mjs');
  writePluginSource(sourcePath, 'installed truth');
  fs.writeFileSync(
    path.join(sourcePath, 'opl-package.json'),
    formatJsonPayload(installedOwnerDescriptor()),
  );
  fs.writeFileSync(binary, `#!/usr/bin/env node
const args = process.argv.slice(2).join(' ');
if (args === 'plugin list --json') {
  process.stdout.write(JSON.stringify({
    installed: [{
      pluginId: ${JSON.stringify(pluginSelector)},
      version: ${JSON.stringify(ownerPackageVersion)},
      installed: true,
      enabled: true,
      source: { source: 'local', path: process.env.FIXTURE_PLUGIN_SOURCE },
      marketplaceSource: { sourceType: 'local', source: 'fixture-carrier' },
    }],
    available: [],
  }));
} else if (args === 'plugin list --available --json') {
  process.stderr.write('available discovery unavailable');
  process.exitCode = 23;
} else {
  process.exitCode = 2;
}
`);
  fs.chmodSync(binary, 0o755);
  try {
    const result = runCli(['packages', 'list', '--detail', 'full'], {
      HOME: root,
      CODEX_HOME: path.join(root, 'codex-home'),
      OPL_STATE_DIR: path.join(root, 'opl-state'),
      OPL_CODEX_PLUGIN_BIN: binary,
      FIXTURE_PLUGIN_SOURCE: sourcePath,
    }) as any;
    const entry = result.opl_agent_packages.directory.entries.find(
      (value: any) => value.package_id === packageId,
    );
    assert.ok(entry);
    assert.equal(entry.installed, true);
    assert.deepEqual(entry.capability_metadata, {
      source: 'third_party',
      required_skill_ids: ['third-party-research'],
      optional_skill_refs: ['officecli-docx'],
    });
    assert.equal(result.opl_agent_packages.installed_package_count, 1);
  } finally {
    removeFixtureTree(root);
  }
});

test('carrier status does not relabel capability closure Skills as carrier requirements', () => {
  const normalized = normalizePackageManifest(
    installedOwnerDescriptor(),
    'file:///fixture/opl-package.json',
  ) as any;
  const descriptorWithCapabilityClosure = {
    manifest: {
      ...normalized,
      required_skill_ids: ['third-party-research', 'medical-single-cell-modeling'],
    },
    manifestPath: '/fixture/opl-package.json',
    manifest_sha256: 'fixture',
    sourcePath: '/fixture/plugin-source',
    pluginId: pluginSelector,
    marketplaceSource: 'fixture-carrier',
    enabled: true,
    carrier: {
      ...descriptor,
      executor: {
        route: 'codex_cli',
        requiredSkillIds: ['third-party-research'],
      },
    },
    carrier_readback: {
      kind: 'fixture-carrier',
      identity: pluginSelector,
      source_ref: '/fixture/plugin-source',
      version: ownerPackageVersion,
      enabled: true,
      lifecycle_authority: 'carrier_owned',
    },
    readiness: {
      installed: true,
      physical_status: 'available',
      callability: 'callable',
    },
  } as any;

  const readback = configuredCarrierFromDescriptor(descriptorWithCapabilityClosure);
  assert.deepEqual(readback.executor.required_skill_ids, ['third-party-research']);
});

test('clean Codex state projects current first-party carrier manifests as installable Packages', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-clean-package-directory-'));
  const binary = path.join(root, 'fake-codex.mjs');
  fs.writeFileSync(binary, `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ installed: [], available: [] }));
`);
  fs.chmodSync(binary, 0o755);
  try {
    const result = runCli(['packages', 'list', '--detail', 'full'], {
      HOME: root,
      CODEX_HOME: path.join(root, 'codex-home'),
      OPL_STATE_DIR: path.join(root, 'opl-state'),
      OPL_CODEX_PLUGIN_BIN: binary,
    }) as any;
    const expectedPackageIds = listCurrentPackageProjections()
      .flatMap((projection) => {
        const manifest = normalizePackageManifest(projection.payload, projection.source_ref);
        return manifest.configured_codex_plugin_carrier
          && !(manifest.package_role === 'capability_package'
            && manifest.codex_default_exposure === false
            && manifest.codex_interaction_mode === 'headless_internal'
            && (manifest.capability_provider?.consumer_profiles?.length ?? 0) > 0)
          ? [manifest.package_id]
          : [];
      })
      .sort();
    const entries = result.opl_agent_packages.directory.entries;
    assert.deepEqual(entries.map((entry: any) => entry.package_id).sort(), expectedPackageIds);
    assert.equal(entries.some((entry: any) => entry.package_id === 'mas-scholar-skills'), false);
    for (const packageId of [
      'opl-channel-weixin',
      'opl-fleet-agent',
      'opl-link-desktop-connector',
    ]) {
      assert.equal(entries.some((entry: any) => entry.package_id === packageId), true, packageId);
    }
    assert.equal(result.opl_agent_packages.installed_package_count, 0);
    assert.equal(result.opl_agent_packages.directory.installable_package_count, expectedPackageIds.length);
    for (const entry of entries) {
      assert.equal(entry.installed, false, entry.package_id);
      assert.equal(entry.installability.status, 'installable', entry.package_id);
      assert.equal(entry.recommended_action, 'agent_package_install', entry.package_id);
      assert.equal(entry.recommended_action_ref?.action_id, 'agent_package_install', entry.package_id);
    }
  } finally {
    removeFixtureTree(root);
  }
});

test('configured first-party carrier installs from a frozen local payload without Git', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-payload-carrier-install-'));
  const packageDirectory = path.join(root, 'packages');
  const sourceRoot = path.join(root, 'source');
  const stateDir = path.join(root, 'opl-state');
  const packageId = 'fixture-package';
  const pluginId = 'fixture-package';
  const marketplaceId = 'fixture-marketplace';
  const sourceCommit = '1'.repeat(40);
  const files = new Map([
    ['plugin.json', `${JSON.stringify({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: pluginId,
      version: '1.0.0',
      skills: './skills/',
    }, null, 2)}\n`],
    ['.codex-plugin/plugin.json', `${JSON.stringify({
      name: pluginId,
      version: '1.0.0',
      skills: './skills/',
    }, null, 2)}\n`],
    [`skills/${pluginId}/SKILL.md`, `# ${pluginId}\n`],
  ]);
  const contentHash = crypto.createHash('sha256');
  for (const [relativePath, content] of files) {
    const pathBytes = Buffer.from(relativePath);
    const contentBytes = Buffer.from(content);
    const pathLength = Buffer.allocUnsafe(8);
    const contentLength = Buffer.allocUnsafe(8);
    pathLength.writeBigUInt64BE(BigInt(pathBytes.length));
    contentLength.writeBigUInt64BE(BigInt(contentBytes.length));
    contentHash.update(pathLength);
    contentHash.update(pathBytes);
    contentHash.update(contentLength);
    contentHash.update(contentBytes);
  }
  fs.mkdirSync(packageDirectory, { recursive: true });
  for (const [relativePath, content] of files) {
    const sourcePath = path.join(sourceRoot, relativePath);
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, content);
  }
  fs.writeFileSync(path.join(packageDirectory, `${packageId}.json`), formatJsonPayload({
    package_id: packageId,
    version: '1.0.0',
    codex_surface: {
      plugin_id: pluginId,
      carrier_source_commit: sourceCommit,
      plugin_payload_manifest_url: 'payloads/fixture-package-1.0.0.json',
    },
  }));
  fs.mkdirSync(path.join(packageDirectory, 'payloads'), { recursive: true });
  fs.writeFileSync(
    path.join(packageDirectory, 'payloads', 'fixture-package-1.0.0.json'),
    formatJsonPayload({
      package_id: packageId,
      plugin_id: pluginId,
      package_version: '1.0.0',
      source_commit: sourceCommit,
      content_lock: {
        digest: `sha256:${contentHash.digest('hex')}`,
      },
      files: [...files].map(([relativePath, content]) => ({
        path: relativePath,
        mode: '100644',
        source_url: pathToFileURL(path.join(sourceRoot, relativePath)).toString(),
        sha256: `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`,
      })),
    }),
  );

  const calls: string[] = [];
  let installed = false;
  const marketplaceRoot = path.join(stateDir, 'codex-plugin-marketplaces', marketplaceId);
  try {
    const result = runConfiguredCodexPluginCarrier({
      descriptor: {
        packageId,
        carrier: {
          kind: 'codex_plugin_manager',
          pluginId: `${pluginId}@${marketplaceId}`,
          marketplaceSource: 'owner/fixture-package',
        },
        executor: { route: 'codex_cli', requiredSkillIds: [pluginId] },
        publicationRef: 'ghcr.io/owner/packages/fixture-package:latest-stable',
      },
      action: 'install',
      env: { HOME: root, CODEX_HOME: path.join(root, 'codex-home'), OPL_STATE_DIR: stateDir },
      packageDirectory,
      runner: ({ args }) => {
        const command = args.join(' ');
        calls.push(command);
        if (command === 'plugin marketplace list --json') {
          return { status: 0, stdout: JSON.stringify({ marketplaces: [] }), stderr: '', error: null };
        }
        if (command === `plugin marketplace add ${marketplaceRoot} --json`) {
          return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
        }
        if (command === `plugin add ${pluginId}@${marketplaceId} --json`) {
          installed = true;
          return { status: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '', error: null };
        }
        if (command === 'plugin list --json') {
          return {
            status: 0,
            stdout: pluginList(installed ? [{
              pluginId: `${pluginId}@${marketplaceId}`,
              version: '1.0.0',
              sourcePath: path.join(marketplaceRoot, 'plugins', pluginId),
              marketplaceSource: marketplaceRoot,
            }] : []),
            stderr: '',
            error: null,
          };
        }
        return { status: 2, stdout: '', stderr: `unexpected command: ${command}`, error: null };
      },
    });
    assert.equal(result.status, 'installed');
    assert.equal(result.executor.status, 'callable');
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(marketplaceRoot, 'plugins', pluginId, 'opl-package.json'), 'utf8')),
      JSON.parse(fs.readFileSync(path.join(packageDirectory, `${packageId}.json`), 'utf8')),
    );
    assert.equal(fs.existsSync(path.join(
      marketplaceRoot, 'plugins', pluginId, 'skills', pluginId, 'SKILL.md',
    )), true);
    assert.deepEqual(calls, [
      'plugin marketplace list --json',
      `plugin marketplace add ${marketplaceRoot} --json`,
      `plugin add ${pluginId}@${marketplaceId} --json`,
      'plugin list --json',
    ]);
    assert.equal(calls.some((command) => command.includes('git')), false);
  } finally {
    removeFixtureTree(root);
  }
});

test('installed descriptor wins over an available descriptor with the same carrier identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-installed-package-precedence-'));
  const installedSource = path.join(root, 'installed');
  const availableSource = path.join(root, 'available');
  for (const [sourcePath, marker] of [
    [installedSource, 'installed'],
    [availableSource, 'available'],
  ] as const) {
    writePluginSource(sourcePath, marker);
    fs.writeFileSync(
      path.join(sourcePath, 'opl-package.json'),
      formatJsonPayload(installedOwnerDescriptor()),
    );
  }
  try {
    const discovered = discoverAvailablePackageDescriptors({
      runner: () => ({
        status: 0,
        stdout: JSON.stringify({
          installed: [{
            pluginId: pluginSelector,
            version: ownerPackageVersion,
            installed: true,
            enabled: true,
            source: { source: 'local', path: installedSource },
            marketplaceSource: { sourceType: 'local', source: 'fixture-carrier' },
          }],
          available: [{
            pluginId: pluginSelector,
            version: '9.9.9',
            installed: false,
            enabled: false,
            source: { source: 'local', path: availableSource },
            marketplaceSource: { sourceType: 'local', source: 'fixture-carrier' },
          }],
        }),
        stderr: '',
        error: null,
      }),
    });
    const selected = discovered.get(packageId);
    assert.ok(selected);
    assert.equal(selected.sourcePath, installedSource);
    assert.equal(selected.readiness.installed, true);
    assert.equal(selected.enabled, true);
  } finally {
    removeFixtureTree(root);
  }
});

test('available-only descriptor reports an installable carrier without unexpected-source precedence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-available-package-precedence-'));
  const sourcePath = path.join(root, 'available');
  const binary = path.join(root, 'fake-codex.mjs');
  writePluginSource(sourcePath, 'available');
  fs.writeFileSync(
    path.join(sourcePath, 'opl-package.json'),
    formatJsonPayload(installedOwnerDescriptor()),
  );
  fs.writeFileSync(binary, `#!/usr/bin/env node
if (process.argv.slice(2).join(' ') === 'plugin list --available --json') {
  process.stdout.write(JSON.stringify({
    installed: [],
    available: [{
      pluginId: ${JSON.stringify(pluginSelector)},
      version: ${JSON.stringify(ownerPackageVersion)},
      installed: false,
      enabled: false,
      source: { source: 'local', path: process.env.FIXTURE_PLUGIN_SOURCE },
      marketplaceSource: { sourceType: 'local', source: 'fixture-carrier' },
    }],
  }));
} else if (process.argv.slice(2).join(' ') === 'plugin list --json') {
  process.stdout.write(JSON.stringify({ installed: [], available: [] }));
} else {
  process.exitCode = 2;
}
`);
  fs.chmodSync(binary, 0o755);
  try {
    const result = runCli(['packages', 'list', '--detail', 'full'], {
      HOME: root,
      CODEX_HOME: path.join(root, 'codex-home'),
      OPL_STATE_DIR: path.join(root, 'opl-state'),
      OPL_CODEX_PLUGIN_BIN: binary,
      FIXTURE_PLUGIN_SOURCE: sourcePath,
    }) as any;
    const entry = result.opl_agent_packages.directory.entries.find(
      (value: any) => value.package_id === packageId,
    );
    assert.ok(entry);
    assert.equal(entry.installed, false);
    assert.equal(entry.installability.status, 'installable');
    assert.equal(entry.configured_carrier.status, 'not_installed');
    assert.equal(entry.configured_carrier.carrier.precedence, 'not_present');
    assert.equal(entry.configured_carrier.reason, 'configured_native_carrier_not_installed');
    assert.equal(entry.recommended_action, 'agent_package_install');
    assert.equal(entry.recommended_action_ref?.action_id, 'agent_package_install');
    assert.deepEqual(entry.available_actions.map((action: any) => action.action_id), [
      'agent_package_install',
    ]);
    for (const retiredDirectoryField of [
      'trust_tier',
      'source_explanation',
      'manifest_url',
      'version_currentness',
      'selected_version',
      'stable_version',
      'migration_required_count',
      'manifest_sha256',
      'content_digest',
    ]) {
      assert.equal(Object.hasOwn(entry, retiredDirectoryField), false);
    }
  } finally {
    removeFixtureTree(root);
  }
});

test('directory actions project the exact settings ABI while the settings catalog stays new-style', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-directory-action-abi-'));
  const stateDir = path.join(root, 'opl-state');
  const binary = path.join(root, 'fake-codex.mjs');
  const pluginState = path.join(root, 'plugin-state.json');
  const pluginSource = path.join(root, 'plugin-source');
  writePluginSource(pluginSource, 'directory action ABI');
  fs.writeFileSync(
    path.join(pluginSource, 'opl-package.json'),
    formatJsonPayload(installedOwnerDescriptor()),
  );
  writeFakeCodex(binary, ownerPackageVersion);
  fs.mkdirSync(path.join(root, 'codex-home'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'codex-home', 'config.toml'),
    '[plugins."third-party-research@fixture-carrier"]\nenabled = false\n',
  );
  fs.writeFileSync(pluginState, JSON.stringify({
    installed: true,
    version: ownerPackageVersion,
    marketplaceSource: 'fixture-carrier',
  }));
  const env = {
    HOME: root,
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: binary,
    FIXTURE_PLUGIN_STATE: pluginState,
    FIXTURE_PLUGIN_SOURCE: pluginSource,
  };
  try {
    const directory = runCli(['packages', 'list', '--detail', 'full'], env) as any;
    const entry = directory.opl_agent_packages.directory.entries.find(
      (candidate: any) => candidate.package_id === packageId,
    );
    assert.ok(entry);
    assert.equal(entry.recommended_action, 'agent_package_repair');
    const expectedActions = [
      {
        action_id: 'agent_package_update',
        action_ref: 'app_state.actions#agent_package_update',
        payload: { package_id: packageId },
        required_payload_fields: ['package_id'],
        confirmation_required: true,
        semantic: 'update',
        surface: 'settings',
      },
      {
        action_id: 'agent_package_repair',
        action_ref: 'app_state.actions#agent_package_repair',
        payload: { package_id: packageId },
        required_payload_fields: ['package_id'],
        confirmation_required: true,
        semantic: 'repair',
        surface: 'settings',
      },
      {
        action_id: 'agent_package_uninstall',
        action_ref: 'app_state.actions#agent_package_uninstall',
        payload: { package_id: packageId },
        required_payload_fields: ['package_id'],
        confirmation_required: true,
        semantic: 'uninstall',
        surface: 'settings',
      },
      {
        action_id: 'agent_package_preferences_set',
        action_ref: 'app_state.actions#agent_package_preferences_set',
        payload: { package_id: packageId },
        required_payload_fields: ['package_id', 'exposure_action or shortcut_id'],
        confirmation_required: false,
        semantic: 'preferences',
        surface: 'settings',
      },
    ];
    assert.deepEqual(entry.available_actions, expectedActions);
    assert.deepEqual(entry.recommended_action_ref, expectedActions[1]);

    const settingsCatalog = listAgentPackageSettingsActions();
    assert.deepEqual(settingsCatalog.map((action) => action.action_id), [
      'install_from_manifest_url',
      'agent_package_install',
      'agent_package_update',
      'agent_package_repair',
      'agent_package_uninstall',
      'agent_package_preferences_set',
    ]);
    assert.equal(settingsCatalog.every((action) => !Object.hasOwn(action, 'action_ref')), true);
    assert.equal(settingsCatalog.find((action) => action.action_id === 'agent_package_update')?.task_kind, 'install');
    assert.deepEqual(
      settingsCatalog.find((action) => action.action_id === 'agent_package_preferences_set')?.payload_fields,
      ['package_id', 'exposure_action', 'shortcut_id', 'visible', 'sort_order'],
    );
  } finally {
    removeFixtureTree(root);
  }
});

test('manual Agent manifest install validates the manifest and keeps dry-run side-effect free', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-manual-agent-manifest-install-'));
  const manifestPath = path.join(root, 'agent.json');
  const binary = path.join(root, 'fake-codex.mjs');
  const callsPath = path.join(root, 'calls.log');
  const manifest = agentPackageManifest({
    packageId: 'third.party.manual',
    agentId: 'third-party-manual',
    pluginId: 'third-party-manual@manual-carrier',
  });
  (manifest.codex_surface as Record<string, unknown>).configured_codex_plugin_carrier = {
    kind: 'codex_plugin_manager',
    plugin_selector: 'third-party-manual@manual-carrier',
    marketplace_source: null,
    executor_route: 'codex_cli',
  };
  fs.writeFileSync(manifestPath, formatJsonPayload(manifest));
  fs.writeFileSync(binary, `#!/usr/bin/env node
import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(callsPath)}, process.argv.slice(2).join(' ') + '\\n');
if (process.argv.slice(2).join(' ') === 'plugin list --json') {
  process.stdout.write(JSON.stringify({ installed: [], available: [] }));
} else {
  process.exitCode = 23;
}
`);
  fs.chmodSync(binary, 0o755);
  try {
    const output = runCli([
      'packages', 'install',
      '--manifest-url', pathToFileURL(manifestPath).href,
      '--trust-tier', 'third_party_verified',
      '--dry-run',
    ], {
      HOME: root,
      CODEX_HOME: path.join(root, 'codex-home'),
      OPL_STATE_DIR: path.join(root, 'opl-state'),
      OPL_CODEX_PLUGIN_BIN: binary,
    }) as any;
    const result = output.opl_agent_package_install;
    assert.equal(result.status, 'validated_no_write');
    assert.equal(result.dry_run, true);
    assert.equal(result.package_id, 'third.party.manual');
    assert.equal(result.manifest_url, pathToFileURL(manifestPath).href);
    assert.equal(result.trust_tier, 'third_party_verified');
    assert.equal(result.configured_carrier.native_action_dispatched, false);
    assert.equal(fs.readFileSync(callsPath, 'utf8').trim(), 'plugin list --json');
    assert.equal(fs.existsSync(path.join(root, 'opl-state')), false);
  } finally {
    removeFixtureTree(root);
  }
});

test('GitHub marketplace source identity accepts only the exact SSH-over-443 spelling', () => {
  const expected = 'gaofeng21cn/fixture-carrier';
  for (const source of [
    'gaofeng21cn/fixture-carrier',
    'https://github.com/gaofeng21cn/fixture-carrier.git',
    'ssh://git@ssh.github.com:443/gaofeng21cn/fixture-carrier.git',
  ]) {
    assert.equal(githubMarketplaceSourceIdentity(source), expected, source);
  }
  for (const source of [
    'ssh://git@github.com:443/gaofeng21cn/fixture-carrier.git',
    'ssh://git@ssh.github.com:22/gaofeng21cn/fixture-carrier.git',
    'ssh://github@ssh.github.com:443/gaofeng21cn/fixture-carrier.git',
    'ssh://git@ssh.github.com:443/gaofeng21cn/fixture-carrier',
    'ssh://git@ssh.github.com:443/gaofeng21cn/fixture-carrier.git/',
    'ssh://git@ssh.github.com:443/gaofeng21cn/nested/fixture-carrier.git',
  ]) {
    assert.equal(githubMarketplaceSourceIdentity(source), null, source);
  }
});

test('installed descriptor accepts equivalent GitHub marketplace source spellings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-marketplace-source-identity-'));
  const sourcePath = path.join(root, 'installed');
  writePluginSource(sourcePath, 'installed');
  const ownerDescriptor = installedOwnerDescriptor() as any;
  ownerDescriptor.configured_codex_plugin_carrier = {
    packageId,
    carrier: {
      kind: 'codex_plugin_manager',
      pluginId: pluginSelector,
      marketplaceSource: 'gaofeng21cn/fixture-carrier',
    },
    executor: { route: 'codex_cli', requiredSkillIds: ['third-party-research'] },
    publicationRef: null,
  };
  fs.writeFileSync(
    path.join(sourcePath, 'opl-package.json'),
    formatJsonPayload(ownerDescriptor),
  );
  try {
    for (const marketplaceSource of [
      'gaofeng21cn/fixture-carrier',
      'https://github.com/gaofeng21cn/fixture-carrier.git',
      'ssh://git@ssh.github.com:443/gaofeng21cn/fixture-carrier.git',
    ]) {
      const discovered = discoverInstalledPackageDescriptors({
        runner: () => ({
          status: 0,
          stdout: pluginList([{
            pluginId: pluginSelector,
            version: ownerPackageVersion,
            sourcePath,
            marketplaceSource,
          }]),
          stderr: '',
          error: null,
        }),
      });
      const selected = discovered.get(packageId);
      assert.ok(selected, marketplaceSource);
      assert.equal(selected.readiness.installed, true, marketplaceSource);
      assert.equal(selected.enabled, true, marketplaceSource);
    }
  } finally {
    removeFixtureTree(root);
  }
});

test('disabled native plugin without a Framework owner descriptor stays non-callable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-disabled-native-plugin-'));
  const sourcePath = path.join(root, 'installed');
  writePluginSource(sourcePath, 'native plugin without owner descriptor');
  try {
    const discovered = discoverInstalledPackageDescriptors({
      runner: () => ({
        status: 0,
        stdout: pluginList([{
          pluginId: pluginSelector,
          version: '1.0.1',
          sourcePath,
          marketplaceSource: 'fixture-carrier',
          enabled: false,
        }]),
        stderr: '',
        error: null,
      }),
    });
    const selected = discovered.get('third-party-research');
    assert.ok(selected);
    assert.equal(selected.enabled, false);
    assert.equal(selected.readiness.callability, 'disabled');
    assert.equal(selected.readiness.projection_callability, undefined);
  } finally {
    removeFixtureTree(root);
  }
});

test('current headless owner projection keeps a disabled same-version install callable', () => {
  const projectionPath = path.resolve(
    'contracts',
    'opl-framework',
    'packages',
    'opl-fleet-agent.json',
  );
  const projected = normalizePackageManifest(
    parseJsonText(fs.readFileSync(projectionPath, 'utf8')),
    pathToFileURL(projectionPath).href,
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-current-headless-owner-projection-'));
  const sourcePath = path.join(root, 'installed');
  writePluginSource(sourcePath, 'stale interactive owner descriptor', './skills/');
  const staleOwner = parseJsonText(fs.readFileSync(projectionPath, 'utf8')) as any;
  delete staleOwner.codex_surface.interaction_mode;
  fs.writeFileSync(path.join(sourcePath, 'opl-package.json'), formatJsonPayload(staleOwner));
  try {
    const discovered = discoverInstalledPackageDescriptors({
      packageId: projected.package_id,
      runner: () => ({
        status: 0,
        stdout: pluginList([{
          pluginId: projected.configured_codex_plugin_carrier!.carrier.pluginId,
          version: projected.version,
          sourcePath,
          marketplaceSource: 'gaofeng21cn/opl-fleet-agent',
          enabled: false,
        }]),
        stderr: '',
        error: null,
      }),
    });
    const selected = discovered.get(projected.package_id);
    assert.ok(selected);
    assert.equal(selected.manifest.codex_interaction_mode, 'headless_internal');
    assert.equal(selected.readiness.callability, 'disabled');
    assert.equal(selected.readiness.projection_callability, 'callable');
  } finally {
    removeFixtureTree(root);
  }
});

function orderedPathLockDigest(root: string, paths: string[]) {
  const hash = crypto.createHash('sha256');
  for (const relativePath of paths) {
    const pathBytes = Buffer.from(relativePath, 'utf8');
    const fileBytes = fs.readFileSync(path.join(root, relativePath));
    const pathLength = Buffer.allocUnsafe(8);
    const fileLength = Buffer.allocUnsafe(8);
    pathLength.writeBigUInt64BE(BigInt(pathBytes.length));
    fileLength.writeBigUInt64BE(BigInt(fileBytes.length));
    hash.update(pathLength);
    hash.update(pathBytes);
    hash.update(fileLength);
    hash.update(fileBytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

function writeFleetOwnerCheckout(sourcePath: string, lockPaths: string[]) {
  fs.mkdirSync(path.join(sourcePath, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(sourcePath, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(sourcePath, 'skills', 'opl-fleet-agent', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(sourcePath, '.codex-plugin', 'plugin.json'), formatJsonPayload({
    name: 'opl-fleet-agent',
    version: '0.2.43',
    description: 'OPL Fleet Agent fixture.',
    skills: './skills/',
  }));
  fs.writeFileSync(path.join(sourcePath, 'plugin.json'), formatJsonPayload({ name: 'opl-fleet-agent' }));
  fs.writeFileSync(path.join(sourcePath, 'bin', 'opl-fleet-agent.mjs'), '#!/usr/bin/env node\n');
  fs.writeFileSync(path.join(sourcePath, 'skills', 'opl-fleet-agent', 'SKILL.md'), '# OPL Fleet Agent\n');
  fs.writeFileSync(
    path.join(sourcePath, 'skills', 'opl-fleet-agent', 'agents', 'openai.yaml'),
    'interface:\n  display_name: "OPL Fleet Agent"\n',
  );
  return lockPaths;
}

test('installed descriptor keeps the physical carrier content lock only when the carrier ships every locked file', () => {
  const projectionPath = path.resolve('contracts', 'opl-framework', 'packages', 'opl-fleet-agent.json');
  const projectionText = fs.readFileSync(projectionPath, 'utf8');
  const projected = normalizePackageManifest(parseJsonText(projectionText), pathToFileURL(projectionPath).href);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-physical-content-lock-'));
  try {
    // A developer checkout ships every file its own manifest locks, including a
    // repo-local file the published payload never carries.
    const checkoutRoot = path.join(root, 'owner-checkout');
    const ownerLockPaths = writeFleetOwnerCheckout(checkoutRoot, [
      ...(projected.content_lock_paths ?? []),
      'repo-local-notes.md',
    ]);
    fs.writeFileSync(path.join(checkoutRoot, 'repo-local-notes.md'), '# owner-only notes\n');
    const ownerManifest = parseJsonText(projectionText) as any;
    ownerManifest.source = 'first_party_repo_local';
    ownerManifest.content_lock.paths = ownerLockPaths;
    ownerManifest.content_lock.digest = orderedPathLockDigest(checkoutRoot, ownerLockPaths);
    fs.writeFileSync(path.join(checkoutRoot, 'opl-package.json'), formatJsonPayload(ownerManifest));

    // The published payload omits owner-only files, so its own over-declaring
    // manifest cannot describe those bytes.
    const payloadRoot = path.join(root, 'published-payload');
    writeFleetOwnerCheckout(payloadRoot, projected.content_lock_paths ?? []);
    fs.writeFileSync(path.join(payloadRoot, 'opl-package.json'), formatJsonPayload(ownerManifest));

    const discover = (sourcePath: string) => discoverInstalledPackageDescriptors({
      packageId: projected.package_id,
      runner: () => ({
        status: 0,
        stdout: pluginList([{
          pluginId: projected.configured_codex_plugin_carrier!.carrier.pluginId,
          version: projected.version,
          sourcePath,
          marketplaceSource: 'gaofeng21cn/opl-fleet-agent',
          enabled: false,
        }]),
        stderr: '',
        error: null,
      }),
    }).get(projected.package_id);

    const checkout = discover(checkoutRoot);
    assert.ok(checkout);
    assert.deepEqual(checkout.manifest.content_lock_paths, ownerLockPaths);
    assert.equal(checkout.manifest.content_digest, ownerManifest.content_lock.digest);
    // Identity, carrier and publication still come from the owner projection.
    assert.equal(checkout.manifest.source, projected.source);
    assert.equal(checkout.manifest.source_repo, projected.source_repo);
    assert.equal(checkout.manifest.version, projected.version);
    assert.equal(checkout.carrier.carrier.pluginId, projected.configured_codex_plugin_carrier?.carrier.pluginId);

    const payload = discover(payloadRoot);
    assert.ok(payload);
    assert.deepEqual(payload.manifest.content_lock_paths, projected.content_lock_paths);
    assert.equal(payload.manifest.content_digest, projected.content_digest);
  } finally {
    removeFixtureTree(root);
  }
});

test('installed discovery includes internal modules without exposing interactive plugins from that scope', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-internal-discovery-'));
  const stateDir = path.join(root, 'state');
  const internalHome = path.join(stateDir, 'internal-package-carrier');
  const userHome = path.join(root, 'user-codex');
  const sourcePath = path.join(root, 'internal-module');
  const interactivePath = path.join(root, 'interactive-plugin');
  const projectionPath = path.resolve('contracts/opl-framework/packages/opl-fleet-agent.json');
  const owner = JSON.parse(fs.readFileSync(projectionPath, 'utf8'));
  const normalized = normalizePackageManifest(owner, pathToFileURL(projectionPath).href);
  try {
    fs.mkdirSync(internalHome, { recursive: true });
    fs.writeFileSync(path.join(internalHome, 'config.toml'), '');
    writePluginSource(sourcePath, 'internal module', './skills/');
    fs.writeFileSync(path.join(sourcePath, 'opl-package.json'), formatJsonPayload(owner));
    writePluginSource(interactivePath, 'interactive plugin', './skills/');
    fs.writeFileSync(path.join(interactivePath, 'opl-package.json'), formatJsonPayload(installedOwnerDescriptor()));
    const calls: string[] = [];
    const discovered = discoverInstalledPackageDescriptors({
      env: { OPL_STATE_DIR: stateDir, CODEX_HOME: userHome },
      runner: ({ env }) => {
        calls.push(env.CODEX_HOME!);
        return { status: 0, stderr: '', error: null, stdout: pluginList(env.CODEX_HOME === internalHome ? [
          { pluginId: normalized.configured_codex_plugin_carrier!.carrier.pluginId,
            version: normalized.version, sourcePath, marketplaceSource: 'gaofeng21cn/opl-fleet-agent', enabled: false },
          { pluginId: pluginSelector, version: ownerPackageVersion, sourcePath: interactivePath,
            marketplaceSource: 'fixture-carrier', enabled: true },
        ] : []) };
      },
    });
    assert.deepEqual(calls, [userHome, internalHome]);
    const selected = discovered.get('opl-fleet-agent');
    assert.ok(selected);
    assert.equal(selected.sourcePath, sourcePath);
    assert.equal(selected.readiness.projection_callability, 'callable');
    assert.equal(discovered.has(packageId), false);
  } finally {
    removeFixtureTree(root);
  }
});

test('Agent Plugins 1.0 manifests win globally and fatal standard errors never fall back to legacy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-plugin-resolution-'));
  const legacyRoot = path.join(root, 'legacy');
  const portableRoot = path.join(root, 'portable');
  fs.mkdirSync(path.join(legacyRoot, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(portableRoot, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, '.codex-plugin', 'plugin.json'), formatJsonPayload({
    name: 'sample-agent',
    version: '0.9.0',
  }));
  fs.writeFileSync(path.join(portableRoot, '.codex-plugin', 'plugin.json'), formatJsonPayload({
    name: 'sample-agent',
    version: '0.8.0',
  }));
  const portablePath = path.join(portableRoot, 'plugin.json');
  fs.writeFileSync(portablePath, formatJsonPayload({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'sample-agent',
    version: '1.0.0',
    extensions: 'reported-and-ignored',
    future_field: true,
  }));
  try {
    assert.equal(normalizeAgentPluginName('sample_agent'), 'sample-agent');
    const resolved = resolveAgentPluginManifest([legacyRoot, portableRoot], {
      expectedName: 'sample-agent',
    });
    assert.ok(resolved);
    assert.equal(resolved.kind, 'agent_plugins_1_0');
    assert.equal(resolved.manifestPath, portablePath);
    assert.deepEqual(resolved.conformanceErrors, [
      'unknown_top_level_field:future_field',
      'non_object_extensions_ignored',
    ]);

    fs.writeFileSync(portablePath, formatJsonPayload({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: 'Sample_Agent',
    }));
    assert.throws(
      () => resolveAgentPluginManifest([legacyRoot, portableRoot], { expectedName: 'sample-agent' }),
      /failed its fatal core contract/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('package status projects and bulk update visits required installed owner descriptors', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configured-carrier-dependency-status-'));
  const stateDir = path.join(root, 'opl-state');
  const codexHome = path.join(root, 'codex-home');
  const rootSource = path.join(root, 'mas');
  const providerSource = path.join(root, 'scholar');
  const binary = path.join(root, 'fake-codex.mjs');
  const callsPath = path.join(root, 'codex-calls.txt');
  const writePlugin = (source: string, packageId: string, version: string) => {
    fs.mkdirSync(path.join(source, '.codex-plugin'), { recursive: true });
    fs.mkdirSync(path.join(source, 'skills', packageId), { recursive: true });
    fs.writeFileSync(path.join(source, 'skills', packageId, 'SKILL.md'), `# ${packageId}\n`);
    fs.writeFileSync(path.join(source, '.codex-plugin', 'plugin.json'), formatJsonPayload({
      name: packageId,
      version,
      skills: './skills/',
    }));
  };
  const dependency = {
    module_id: 'scholarskills',
    package_id: 'mas-scholar-skills',
    required: true,
    dependency_kind: 'hard_runtime_dependency' as const,
    version_requirement: '>=0.2.0 <0.3.0',
    capability_abi: 'mas-scholar-skills.v1',
    consumer_profile_id: 'mas-medical-paper.v1',
    required_export_ids: [] as string[],
    required_module_ids: [] as string[],
    bootstrap_manifest_url: null,
    dependency_source: null,
  };
  const rootManifest = agentPackageManifest({ packageId: 'mas', agentId: 'mas', pluginId: 'med-autoscience' }) as any;
  rootManifest.version = '0.2.25';
  rootManifest.codex_surface.required_skill_ids = ['mas'];
  rootManifest.capability_dependencies = [dependency];
  const providerProjection = listCurrentPackageProjections()
    .find((projection) => projection.payload.package_id === 'mas-scholar-skills');
  assert.ok(providerProjection, 'ScholarSkills owner projection is required for this fixture');
  const providerOwnerManifest = normalizePackageManifest(
    providerProjection.payload,
    providerProjection.source_ref,
  );
  const provider = providerOwnerManifest.capability_provider;
  assert.ok(provider, 'ScholarSkills capability provider is required for this fixture');
  dependency.required_export_ids = provider.exports.map((entry) => entry.export_id);
  dependency.required_module_ids = [...provider.module_export_ids];
  fs.mkdirSync(rootSource, { recursive: true });
  fs.mkdirSync(providerSource, { recursive: true });
  writePlugin(rootSource, 'mas', '0.2.25');
  for (const entry of provider.exports) {
    fs.mkdirSync(path.join(providerSource, 'skills', entry.skill_id), { recursive: true });
    fs.writeFileSync(path.join(providerSource, 'skills', entry.skill_id, 'SKILL.md'), `# ${entry.skill_id}\n`);
  }
  fs.writeFileSync(path.join(providerSource, 'opl-package.json'), formatJsonPayload(providerProjection.payload));
  execFileSync('git', ['init', '-q'], { cwd: providerSource });
  execFileSync('git', ['config', 'user.name', 'OPL Fixture'], { cwd: providerSource });
  execFileSync('git', ['config', 'user.email', 'opl-fixture@example.test'], { cwd: providerSource });
  execFileSync('git', ['add', '.'], { cwd: providerSource });
  execFileSync('git', ['commit', '-q', '-m', 'ScholarSkills fixture'], { cwd: providerSource });
  fs.writeFileSync(path.join(rootSource, 'opl-package.json'), formatJsonPayload(rootManifest));
  fs.writeFileSync(binary, `#!/usr/bin/env node\nimport fs from 'node:fs';\nfs.appendFileSync(process.env.FIXTURE_CODEX_CALLS, process.argv.slice(2).join(' ') + '\\n');\nprocess.stdout.write(${JSON.stringify(pluginList([
    { pluginId: 'med-autoscience@carrier', version: '0.2.25', sourcePath: rootSource, marketplaceSource: 'fixture' },
  ], [{
    name: 'carrier',
    marketplaceSource: { sourceType: 'local', source: 'fixture' },
  }]))});\n`);
  fs.chmodSync(binary, 0o755);
  const env = {
    HOME: root,
    CODEX_HOME: codexHome,
    OPL_STATE_DIR: stateDir,
    OPL_CODEX_PLUGIN_BIN: binary,
    OPL_MODULE_PATH_SCHOLARSKILLS: providerSource,
    FIXTURE_CODEX_CALLS: callsPath,
  };
  const previous = {
    home: process.env.HOME,
    codexHome: process.env.CODEX_HOME,
    stateDir: process.env.OPL_STATE_DIR,
    pluginBin: process.env.OPL_CODEX_PLUGIN_BIN,
    callsPath: process.env.FIXTURE_CODEX_CALLS,
    scholarSkillsPath: process.env.OPL_MODULE_PATH_SCHOLARSKILLS,
  };
  process.env.HOME = env.HOME;
  process.env.CODEX_HOME = env.CODEX_HOME;
  process.env.OPL_STATE_DIR = env.OPL_STATE_DIR;
  process.env.OPL_CODEX_PLUGIN_BIN = env.OPL_CODEX_PLUGIN_BIN;
  process.env.FIXTURE_CODEX_CALLS = env.FIXTURE_CODEX_CALLS;
  process.env.OPL_MODULE_PATH_SCHOLARSKILLS = providerSource;
  try {
    const status = runCli(['packages', 'status', '--package-id', 'mas'], env).opl_agent_package_status;
    assert.equal(status.package_dependency_readiness?.status, 'current');
    assert.equal(status.package_dependency_readiness?.operational_ready, true);
    assert.equal(status.package_dependency_readiness?.dependencies[0]?.package_id, 'mas-scholar-skills');
    assert.equal(status.operational_ready, true);
    assert.equal(status.launch_allowed, true);
    assert.deepEqual(fs.readFileSync(callsPath, 'utf8').trim().split('\n'), [
      'plugin list --json',
    ]);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);

    fs.writeFileSync(callsPath, '');
    await runCliAsync(['packages', 'install', 'mas'], env);
    assert.deepEqual(
      fs.readFileSync(callsPath, 'utf8').trim().split('\n')
        .filter((command) => command.startsWith('plugin add ')),
      [
        'plugin add med-autoscience@carrier --json',
      ],
    );

    fs.writeFileSync(callsPath, '');
    const bulkUpdate = await runOplAgentPackageBulkUpdate();
    assert.deepEqual(bulkUpdate.targets.map((target: any) => target.target_id), [
      'mas',
    ]);
    assert.deepEqual(bulkUpdate.targets.map((target: any) => target.status), [
      'failed',
    ], JSON.stringify(bulkUpdate, null, 2));
    assert.equal((bulkUpdate.targets[0] as any).error.error.details.failure_code,
      'agent_package_native_post_update_readback_failed');
    assert.deepEqual(
      fs.readFileSync(callsPath, 'utf8').trim().split('\n')
      .filter((command) => command.startsWith('plugin add ')),
      [
        'plugin add med-autoscience@med-autoscience --json',
      ],
    );

    const unavailableProviderSource = path.join(root, 'missing-scholar-source');
    env.OPL_MODULE_PATH_SCHOLARSKILLS = unavailableProviderSource;
    process.env.OPL_MODULE_PATH_SCHOLARSKILLS = unavailableProviderSource;
    fs.writeFileSync(binary, `#!/usr/bin/env node\nimport fs from 'node:fs';\nfs.appendFileSync(process.env.FIXTURE_CODEX_CALLS, process.argv.slice(2).join(' ') + '\\n');\nprocess.stdout.write(${JSON.stringify(pluginList([
      { pluginId: 'med-autoscience@carrier', version: '0.2.25', sourcePath: rootSource, marketplaceSource: 'fixture' },
      {
        pluginId: providerOwnerManifest.configured_codex_plugin_carrier!.carrier.pluginId,
        version: providerOwnerManifest.version,
        sourcePath: providerSource,
        marketplaceSource: 'gaofeng21cn/mas-scholar-skills',
        enabled: false,
      },
    ]))});\n`);
    fs.chmodSync(binary, 0o755);
    fs.writeFileSync(callsPath, '');

    const nativeFallbackStatus = runCli(
      ['packages', 'status', '--package-id', 'mas'],
      env,
    ).opl_agent_package_status;
    assert.equal(nativeFallbackStatus.package_dependency_readiness?.status, 'current');
    assert.equal(nativeFallbackStatus.package_dependency_readiness?.operational_ready, true);
    assert.deepEqual(nativeFallbackStatus.package_dependency_readiness?.dependencies[0]?.reasons, []);
    assert.equal(nativeFallbackStatus.operational_ready, true);
    assert.equal(nativeFallbackStatus.launch_allowed, true);

  } finally {
    if (previous.home === undefined) delete process.env.HOME;
    else process.env.HOME = previous.home;
    if (previous.codexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous.codexHome;
    if (previous.stateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous.stateDir;
    if (previous.pluginBin === undefined) delete process.env.OPL_CODEX_PLUGIN_BIN;
    else process.env.OPL_CODEX_PLUGIN_BIN = previous.pluginBin;
    if (previous.callsPath === undefined) delete process.env.FIXTURE_CODEX_CALLS;
    else process.env.FIXTURE_CODEX_CALLS = previous.callsPath;
    if (previous.scholarSkillsPath === undefined) delete process.env.OPL_MODULE_PATH_SCHOLARSKILLS;
    else process.env.OPL_MODULE_PATH_SCHOLARSKILLS = previous.scholarSkillsPath;
    removeFixtureTree(root);
  }
});
