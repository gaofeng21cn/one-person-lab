import {
  agentPackageManifest,
  assert,
  createPluginSourceFixture,
  distributionPayload,
  formatJsonPayload,
  fs,
  os,
  parseJsonText,
  path,
  pathToFileURL,
  repoRoot,
  registryPayload,
  runCli,
  runCliAsync,
  runCliFailure,
  test,
  withAgentPackageServer,
  withRemotePayloadAgentPackageServer,
} from './helpers.ts';
import {
  normalizeManifest,
  normalizeRegistry,
} from '../../../../../src/modules/connect/agent-package-registry-parts/manifest-normalizers.ts';
import { assertManifestMatchesRegistrySelection } from '../../../../../src/modules/connect/agent-package-registry-parts/selection.ts';

test('published registry entry rejects a source-only manifest without distribution payload', () => {
  const manifestUrl = 'https://registry.example/manifest.json';
  const registryEntry = normalizeRegistry(
    registryPayload('https://registry.example'),
    'https://registry.example/registry.json',
    'fixture-sha256',
  ).entries[0];
  const manifest = normalizeManifest(agentPackageManifest({ distributionPayload: null }), manifestUrl);

  assert.throws(
    () => assertManifestMatchesRegistrySelection(manifest, {
      packageId: manifest.package_id,
      registryEntry,
      registryUrl: 'https://registry.example/registry.json',
      manifestUrl,
    }),
    /Published registry entries require a distribution payload/,
  );
});

test('connect agent-packages rejects registry manifest identity drift before writing locks', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-drift-state-'));
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-drift-'));
  try {
    const manifestPath = path.join(fixtureDir, 'manifest.json');
    const registryPath = path.join(fixtureDir, 'registry.json');
    fs.writeFileSync(
      manifestPath,
      formatJsonPayload({
        ...agentPackageManifest(),
        package_id: 'different.package',
      }),
      'utf8',
    );
    fs.writeFileSync(
      registryPath,
      formatJsonPayload({
        ...registryPayload(pathToFileURL(fixtureDir).href),
        entries: [
          {
            ...registryPayload(pathToFileURL(fixtureDir).href).entries[0],
            manifest_url: pathToFileURL(manifestPath).href,
          },
        ],
      }),
      'utf8',
    );
    const failure = runCliFailure([
      'connect',
      'agent-packages',
      'install',
      '--registry-url',
      pathToFileURL(registryPath).href,
      '--package-id',
      'third.party.research',
    ], { OPL_STATE_DIR: stateDir });

    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(failure.payload.error.details.failure_code, 'registry_manifest_package_id_mismatch');
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle-ledger.json')), false);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('connect agent-packages fails closed when latest is treated as install truth', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-latest-truth-state-'));
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-latest-truth-'));
  try {
    const manifestPath = path.join(fixtureDir, 'manifest.json');
    fs.writeFileSync(
      manifestPath,
      formatJsonPayload(agentPackageManifest({
        distributionPayload: {
          ...distributionPayload(),
          payload_digest_ref: 'registry.latest_version',
        },
      })),
      'utf8',
    );
    const failure = runCliFailure([
      'connect',
      'agent-packages',
      'install',
      '--manifest-url',
      pathToFileURL(manifestPath).href,
      '--trust-tier',
      'third_party_verified',
    ], { OPL_STATE_DIR: stateDir });

    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_distribution_digest_required');
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('connect agent-packages rejects developer checkout auto-update and permission scope drift', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-policy-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-policy-home-'));
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-policy-fixtures-'));
  const env = {
    OPL_STATE_DIR: stateDir,
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
  };
  try {
    const manifestPath = path.join(fixtureDir, 'manifest.json');
    const permissionManifestPath = path.join(fixtureDir, 'manifest-permission-change.json');
    fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest()), 'utf8');
    fs.writeFileSync(
      permissionManifestPath,
      formatJsonPayload(agentPackageManifest({ permissions: [{ id: 'filesystem.write' }] })),
      'utf8',
    );

    await runCliAsync([
      'connect',
      'agent-packages',
      'install',
      '--manifest-url',
      pathToFileURL(manifestPath).href,
      '--trust-tier',
      'third_party_verified',
    ], env);

    const developerUpdateFailure = runCliFailure([
      'connect',
      'agent-packages',
      'update',
      '--manifest-url',
      pathToFileURL(manifestPath).href,
      '--trust-tier',
      'third_party_verified',
      '--source-kind',
      'developer_checkout_override',
    ], env);
    assert.equal(developerUpdateFailure.payload.error.details.failure_code, 'agent_package_developer_checkout_auto_update_forbidden');

    const permissionFailure = runCliFailure([
      'connect',
      'agent-packages',
      'update',
      '--manifest-url',
      pathToFileURL(permissionManifestPath).href,
      '--trust-tier',
      'third_party_verified',
    ], env);
    assert.equal(permissionFailure.payload.error.details.failure_code, 'agent_package_permission_scope_change_requires_manual_confirmation');
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('connect agent-packages preserves installed lock and receipt trail when update materialization fails', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-update-failure-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-update-failure-home-'));
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-update-failure-fixtures-'));
  const pluginSourcePath = createPluginSourceFixture();
  const brokenPluginSourcePath = createPluginSourceFixture({ includeRequiredSkill: false });
  const env = {
    OPL_STATE_DIR: stateDir,
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
  };
  try {
    const manifestPath = path.join(fixtureDir, 'manifest.json');
    const brokenManifestPath = path.join(fixtureDir, 'manifest-broken.json');
    fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest({ pluginSourcePath })), 'utf8');
    fs.writeFileSync(brokenManifestPath, formatJsonPayload(agentPackageManifest({ pluginSourcePath: brokenPluginSourcePath })), 'utf8');

    const install = runCli([
      'connect',
      'agent-packages',
      'install',
      '--manifest-url',
      pathToFileURL(manifestPath).href,
      '--trust-tier',
      'third_party_verified',
    ], env) as {
      opl_agent_package_install: {
        lock_file: string;
        lifecycle_ledger_file: string;
        package_lock: {
          action_receipt_id: string;
          lock_ref: string;
          physical_surface: { codex_plugin_cache_path: string };
        };
      };
    };
    const lockFileBefore = fs.readFileSync(install.opl_agent_package_install.lock_file, 'utf8');
    const ledgerBefore = fs.readFileSync(install.opl_agent_package_install.lifecycle_ledger_file, 'utf8');
    const installedCachePath = install.opl_agent_package_install.package_lock.physical_surface.codex_plugin_cache_path;

    const failure = runCliFailure([
      'connect',
      'agent-packages',
      'update',
      '--manifest-url',
      pathToFileURL(brokenManifestPath).href,
      '--trust-tier',
      'third_party_verified',
    ], env);
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_required_skill_missing');
    assert.equal(fs.existsSync(installedCachePath), true);
    assert.equal(fs.readFileSync(install.opl_agent_package_install.lock_file, 'utf8'), lockFileBefore);
    assert.equal(fs.readFileSync(install.opl_agent_package_install.lifecycle_ledger_file, 'utf8'), ledgerBefore);

    const status = runCli([
      'connect',
      'agent-packages',
      'status',
      '--package-id',
      'third.party.research',
    ], env) as {
      opl_agent_package_status: {
        installed_package_count: number;
        installed_packages: Array<{
          action_receipt_id: string;
          lock_ref: string;
          physical_surface: { codex_plugin_cache_path: string };
        }>;
        lifecycle_receipts: Array<{ action: string }>;
      };
    };
    assert.equal(status.opl_agent_package_status.installed_package_count, 1);
    assert.equal(
      status.opl_agent_package_status.installed_packages[0].action_receipt_id,
      install.opl_agent_package_install.package_lock.action_receipt_id,
    );
    assert.equal(
      status.opl_agent_package_status.installed_packages[0].lock_ref,
      install.opl_agent_package_install.package_lock.lock_ref,
    );
    assert.equal(status.opl_agent_package_status.installed_packages[0].physical_surface.codex_plugin_cache_path, installedCachePath);
    assert.deepEqual(status.opl_agent_package_status.lifecycle_receipts.map((receipt) => receipt.action), ['install']);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
    fs.rmSync(brokenPluginSourcePath, { recursive: true, force: true });
  }
});

test('connect agent-packages rejects invalid manifests before writing locks', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-invalid-state-'));
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-invalid-'));
  try {
    const manifestPath = path.join(fixtureDir, 'manifest.json');
    fs.writeFileSync(
      manifestPath,
      formatJsonPayload({
        package_id: 'invalid.package',
        agent_id: 'invalid',
        display_name: 'Invalid',
        publisher: 'example',
        version: '0.0.1',
      }),
      'utf8',
    );
    const failure = runCliFailure([
      'connect',
      'agent-packages',
      'install',
      '--manifest-url',
      pathToFileURL(manifestPath).href,
      '--trust-tier',
      'third_party_verified',
    ], { OPL_STATE_DIR: stateDir });

    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(failure.payload.error.details.failure_code, 'invalid_package_manifest');
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle-ledger.json')), false);
    assert.doesNotThrow(() => parseJsonText(JSON.stringify(failure.payload)));
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('connect agent-packages validates first-party agent package manifest shape', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-first-party-manifest-state-'));
  try {
    const manifestPath = path.join(repoRoot, 'contracts', 'opl-framework', 'agent-packages', 'oma.json');
    const validation = runCli([
      'connect',
      'agent-packages',
      'validate-manifest',
      '--manifest-url',
      pathToFileURL(manifestPath).href,
      '--trust-tier',
      'first_party',
      '--source-kind',
      'local_file',
    ], { OPL_STATE_DIR: stateDir }) as {
      opl_agent_package_manifest: {
        status: string;
        package_id: string;
        codex_visible_entry: string;
        bundled_required_skill_ids: string[];
        distribution_payload: null;
        rollback_ref: string;
      };
    };

    assert.equal(validation.opl_agent_package_manifest.status, 'valid');
    assert.equal(validation.opl_agent_package_manifest.package_id, 'opl-meta-agent');
    assert.equal(validation.opl_agent_package_manifest.codex_visible_entry, 'opl-meta-agent');
    assert.deepEqual(validation.opl_agent_package_manifest.bundled_required_skill_ids, ['opl-meta-agent']);
    assert.equal(validation.opl_agent_package_manifest.distribution_payload, null);
    assert.equal(validation.opl_agent_package_manifest.rollback_ref, 'rollback-ref:opl-meta-agent/unavailable'); // reuse-first: allow owner-routed package provenance assertion.
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('connect agent-packages canonicalizes legacy alias input and writes canonical package ids', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-alias-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-alias-home-'));
  const pluginSourcePath = createPluginSourceFixture();
  const env = {
    OPL_STATE_DIR: stateDir,
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
  };
  try {
    await withAgentPackageServer(async (baseUrl) => {
      const refresh = await runCliAsync([
        'connect',
        'agent-packages',
        'registry',
        'refresh',
        '--registry-url',
        `${baseUrl}/registry.json`,
      ], env) as {
        opl_agent_package_registry: {
          entries: Array<{ package_id: string }>;
        };
      };
      assert.equal(refresh.opl_agent_package_registry.entries[0].package_id, 'med-autoscience');

      const install = await runCliAsync([
        'connect',
        'agent-packages',
        'install',
        '--registry-url',
        `${baseUrl}/registry.json`,
        '--package-id',
        'mas',
      ], env) as {
        opl_agent_package_install: {
          package_lock: { package_id: string; agent_id: string };
          owner_route_readback: { selected_package_id: string };
        };
      };
      assert.equal(install.opl_agent_package_install.package_lock.package_id, 'med-autoscience');
      assert.equal(install.opl_agent_package_install.package_lock.agent_id, 'med-autoscience');
      assert.equal(install.opl_agent_package_install.owner_route_readback.selected_package_id, 'med-autoscience');

      const shortcut = await runCliAsync([
        'connect',
        'agent-packages',
        'home-shortcut-preferences',
        'set',
        '--package-id',
        'mas',
        '--shortcut-id',
        'research',
      ], env) as {
        opl_agent_package_home_shortcut_preferences: {
          preference: { package_id: string };
        };
      };
      assert.equal(shortcut.opl_agent_package_home_shortcut_preferences.preference.package_id, 'med-autoscience');

      const status = runCli(['connect', 'agent-packages', 'status', '--package-id', 'mas'], env) as {
        opl_agent_package_status: {
          package_id: string;
          installed_packages: Array<{ package_id: string; agent_id: string }>;
          home_shortcut_preferences: Array<{ package_id: string }>;
          owner_route_readback: {
            selected_package_id: string;
            packages: Array<{ package_id: string }>;
          };
        };
      };
      assert.equal(status.opl_agent_package_status.package_id, 'med-autoscience');
      assert.equal(status.opl_agent_package_status.installed_packages[0].package_id, 'med-autoscience');
      assert.equal(status.opl_agent_package_status.installed_packages[0].agent_id, 'med-autoscience');
      assert.equal(status.opl_agent_package_status.home_shortcut_preferences[0].package_id, 'med-autoscience');
      assert.equal(status.opl_agent_package_status.owner_route_readback.selected_package_id, 'med-autoscience');
      assert.equal(status.opl_agent_package_status.owner_route_readback.packages[0].package_id, 'med-autoscience');
    }, agentPackageManifest({
      packageId: 'medautoscience',
      agentId: 'mas',
      pluginSourcePath,
    }));
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});

test('connect agent-packages canonicalizes legacy registry lock lifecycle and home shortcut state on readback', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-legacy-state-'));
  try {
    fs.writeFileSync(path.join(stateDir, 'agent-package-registry-cache.json'), formatJsonPayload({
      surface_kind: 'opl_agent_package_registry_cache',
      version: 'opl-agent-package-registry-cache.v1',
      refreshed_at: '2026-01-01T00:00:00.000Z',
      registry_url: 'https://example.test/registry.json',
      registry_sha256: 'fixture-registry-sha',
      entry_count: 2,
      entries: [
        {
          package_id: 'medautoscience',
          display_name: 'Med Auto Science',
          publisher: 'one-person-lab',
          source: 'first_party',
          manifest_url: 'https://example.test/mas.json',
          latest_version: '1.0.0',
          trust_tier: 'first_party_managed',
          required_skill_ids: ['mas'],
          optional_skill_ids: [],
          home_shortcut_ids: ['research'],
        },
        {
          package_id: 'bookforge',
          display_name: 'OPL Book Forge',
          publisher: 'one-person-lab',
          source: 'first_party',
          manifest_url: 'https://example.test/bookforge.json',
          latest_version: '1.0.0',
          trust_tier: 'first_party_managed',
          required_skill_ids: ['opl-bookforge'],
          optional_skill_ids: [],
          home_shortcut_ids: ['book'],
        },
      ],
    }), 'utf8');
    fs.writeFileSync(path.join(stateDir, 'agent-package-locks.json'), formatJsonPayload({
      surface_kind: 'opl_agent_package_lock_index',
      version: 'opl-agent-package-lock-index.v1',
      packages: [
        {
          surface_kind: 'opl_agent_package_lock',
          package_id: 'redcube',
          agent_id: 'rca',
          display_name: 'RedCube AI',
          publisher: 'one-person-lab',
          version_or_source_digest: '1.0.0+sha256:fixture',
          package_version: '1.0.0',
          installed_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          codex_visible_entry: 'rca',
          bundled_required_skill_ids: ['rca'],
          optional_skill_refs: [],
          source_kind: 'manifest_url',
          trust_tier: 'first_party_managed',
          action_receipt_id: 'opl://agent-package/install/rca/fixture',
          rollback_ref: 'rollback://fixture',
          manifest_url: 'https://example.test/rca.json',
          manifest_sha256: 'fixture-manifest',
          lock_ref: 'opl://agent-package-lock/rca/1.0.0/fixture',
        },
      ],
    }), 'utf8');
    fs.writeFileSync(path.join(stateDir, 'agent-package-lifecycle-ledger.json'), formatJsonPayload({
      surface_kind: 'opl_agent_package_lifecycle_ledger',
      version: 'opl-agent-package-lifecycle-ledger.v1',
      receipts: [
        {
          surface_kind: 'opl_agent_package_lifecycle_receipt',
          receipt_ref: 'opl://agent-package/install/oma/fixture',
          receipt_status: 'recorded',
          recorded_at: '2026-01-01T00:00:00.000Z',
          action: 'install',
          action_status: 'completed',
          package_id: 'oma',
          registry_url: 'https://example.test/registry.json',
          manifest_url: 'https://example.test/oma.json',
          manifest_sha256: 'fixture-manifest',
          package_lock_ref: 'opl://agent-package-lock/oma/1.0.0/fixture',
          rollback_ref: 'rollback://fixture',
          source_kind: 'manifest_url',
          trust_tier: 'first_party_managed',
          writes_performed: true,
          source_surface: 'opl_connect_agent_package_registry',
          authority_boundary: { can_write_domain_truth: false },
          physical_surface: {
            surface_kind: 'opl_agent_package_physical_codex_surface',
            status: 'materialized',
            package_id: 'oma',
            plugin_id: 'opl-meta-agent',
            marketplace_id: null,
            codex_home: '/tmp/.codex',
            codex_config_path: '/tmp/.codex/config.toml',
            plugin_source_path: null,
            plugin_manifest_path: null,
            codex_plugin_cache_path: null,
            marketplace_root: null,
            marketplace_path: null,
            marketplace_plugin_path: null,
            plugin_payload_manifest_url: null,
            plugin_payload_manifest_sha256: null,
            plugin_payload_cache_path: null,
            materialized_required_skill_ids: [],
            materialized_required_skill_paths: [],
            removed_paths: [],
            writes_performed: true,
            reload_required: false,
            note: null,
            authority_boundary: { can_write_domain_truth: false },
          },
        },
      ],
    }), 'utf8');
    fs.writeFileSync(path.join(stateDir, 'agent-package-home-shortcut-preferences.json'), formatJsonPayload({
      surface_kind: 'opl_agent_package_home_shortcut_preferences',
      version: 'g1',
      updated_at: '2026-01-01T00:00:00.000Z',
      preferences: [
        {
          package_id: 'bookforge',
          shortcut_id: 'book',
          visible: false,
          sort_order: 7,
          updated_at: '2026-01-01T00:00:00.000Z',
          installed: false,
        },
      ],
    }), 'utf8');

    const list = runCli(['connect', 'agent-packages', 'list'], { OPL_STATE_DIR: stateDir }) as {
      opl_agent_packages: {
        registry_cache: { entries: Array<{ package_id: string }> } | null;
        installed_packages: Array<{ package_id: string; agent_id: string }>;
        lifecycle_receipts: Array<{ package_id: string | null; physical_surface?: { package_id: string } }>;
        home_shortcut_preferences: Array<{ package_id: string; shortcut_id: string }>;
      };
    };

    assert.deepEqual(
      list.opl_agent_packages.registry_cache?.entries.map((entry) => entry.package_id),
      ['med-autoscience', 'opl-bookforge'],
    );
    assert.equal(list.opl_agent_packages.installed_packages[0].package_id, 'redcube-ai');
    assert.equal(list.opl_agent_packages.installed_packages[0].agent_id, 'redcube-ai');
    assert.equal(list.opl_agent_packages.lifecycle_receipts[0].package_id, 'opl-meta-agent');
    assert.equal(list.opl_agent_packages.lifecycle_receipts[0].physical_surface?.package_id, 'opl-meta-agent');
    assert.equal(
      list.opl_agent_packages.home_shortcut_preferences.find((entry) => entry.shortcut_id === 'book')?.package_id,
      'opl-bookforge',
    );
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});
