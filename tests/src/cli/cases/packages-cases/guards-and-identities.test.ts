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
  sha256Fixture,
  test,
  withAgentPackageServer,
  withRemotePayloadAgentPackageServer,
} from './helpers.ts';
import {
  normalizeManifest,
  normalizePackageManifest,
  normalizeRegistry,
} from '../../../../../src/modules/connect/agent-package-registry-parts/manifest-normalizers.ts';
import { defaultHomeShortcutPreferences } from '../../../../../src/modules/connect/agent-package-registry-parts/home-shortcuts.ts';
import { assertManifestMatchesRegistrySelection } from '../../../../../src/modules/connect/agent-package-registry-parts/selection.ts';
import { writeManagedRuntimeSourceFixture } from './managed-runtime-source-fixture.ts';

test('default Home shortcut visibility follows registry starter_default', () => {
  const registry = normalizeRegistry({
    ...registryPayload('https://registry.example'),
    entries: [{
      ...registryPayload('https://registry.example').entries[0],
      package_id: 'oma',
      starter_default: false,
      home_shortcut_ids: ['oma'],
    }],
  }, 'https://registry.example/registry.json', 'fixture-sha256');

  const preferences = defaultHomeShortcutPreferences(registry, {
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages: [],
  });

  assert.equal(preferences[0].shortcut_id, 'oma');
  assert.equal(preferences[0].visible, false);
  assert.equal(preferences[0].installed, false);
});

test('package registry uses version_source_ref and rejects mutable latest_version truth', () => {
  const payload = registryPayload('https://registry.example');
  const registry = normalizeRegistry(
    payload,
    'https://registry.example/registry.json',
    'fixture-sha256',
  );
  assert.equal(registry.entries[0].version_source_ref, 'https://registry.example/manifest.json#/version');

  assert.throws(
    () => normalizeRegistry({
      ...payload,
      entries: [{ ...payload.entries[0], latest_version: '1.2.3' }],
    }, 'https://registry.example/registry.json', 'fixture-sha256'),
    /must not duplicate package version truth/,
  );
});

test('official aliases resolve offline and local manifests own runtime source install repair rollback and uninstall', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-positional-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-runtime-source-'));
  const modulesRoot = path.join(fixtureRoot, 'modules');
  const pluginSourcePath = createPluginSourceFixture();
  try {
    const fixtureEnv = writeManagedRuntimeSourceFixture({
      root: fixtureRoot,
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      version: '0.1.0',
      sourceHeadSha: 'runtime-source-v1',
    });
    const env = { OPL_STATE_DIR: stateDir, OPL_MODULES_ROOT: modulesRoot, ...fixtureEnv };
    const manifestPath = path.join(fixtureRoot, 'rca-local-manifest.json');
    fs.writeFileSync(manifestPath, formatJsonPayload({
      ...agentPackageManifest({
        packageId: 'rca',
        agentId: 'rca',
        pluginSourcePath,
      }),
      runtime_source_carrier: {
        carrier_kind: 'opl_managed_module_source',
        module_id: 'redcube',
      },
    }));

    const rca = runCli([
      'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party',
    ], env) as {
      opl_agent_package_install: { package_lock: { package_id: string; trust_tier: string; managed_runtime_source: any } };
    };
    assert.equal(rca.opl_agent_package_install.package_lock.package_id, 'rca');
    assert.equal(rca.opl_agent_package_install.package_lock.trust_tier, 'first_party');
    assert.equal(rca.opl_agent_package_install.package_lock.managed_runtime_source.preparation_status, 'completed');
    assert.match(rca.opl_agent_package_install.package_lock.managed_runtime_source.handler_probe_output_sha256, /^sha256:/);
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.0');

    const repaired = runCli(['packages', 'repair', '--package-id', 'redcube-ai'], env) as {
      opl_agent_package_repair: { package_lock: { package_id: string } };
    };
    assert.equal(repaired.opl_agent_package_repair.package_lock.package_id, 'rca');

    Object.assign(env, writeManagedRuntimeSourceFixture({
      root: fixtureRoot,
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      version: '0.1.1',
      sourceHeadSha: 'runtime-source-v2',
    }));
    const updated = runCli(['packages', 'update', '--package-id', 'redcube-ai'], env) as any;
    assert.equal(updated.opl_agent_package_update.package_lock.managed_runtime_source.source_git_head_sha, 'runtime-source-v2');
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.1');

    const rolledBack = runCli(['packages', 'rollback', '--package-id', 'redcube-ai'], env) as any;
    assert.equal(rolledBack.opl_agent_package_rollback.package_lock.managed_runtime_source.source_git_head_sha, 'runtime-source-v1');
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.1.0');

    const removed = runCli(['packages', 'uninstall', '--package-id', 'redcube-ai'], env) as {
      opl_agent_package_uninstall: { removed_package_lock: { package_id: string } };
    };
    assert.equal(removed.opl_agent_package_uninstall.removed_package_lock.package_id, 'rca');
    assert.equal(fs.existsSync(path.join(modulesRoot, 'redcube-ai')), false);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});

test('managed catalog payload cannot bypass the selected source archive with inline file content', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-artifact-bypass-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-artifact-bypass-fixture-'));
  const pluginSourcePath = createPluginSourceFixture({ pluginId: 'redcube-ai' });
  try {
    const pluginJson = fs.readFileSync(path.join(pluginSourcePath, '.codex-plugin', 'plugin.json'), 'utf8');
    const fixtureEnv = writeManagedRuntimeSourceFixture({
      root: fixtureRoot,
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      version: '0.2.1',
      sourceHeadSha: '1'.repeat(40),
      packageManifest: {
        ...agentPackageManifest({
          packageId: 'rca',
          agentId: 'rca',
          pluginId: 'redcube-ai',
          distributionPayload: null,
        }),
        version: '0.2.1',
        source: 'first_party',
      },
      payloadManifest: {
        surface_kind: 'opl_agent_package_payload_manifest',
        files: [{
          path: '.codex-plugin/plugin.json',
          content_utf8: pluginJson,
          sha256: sha256Fixture(pluginJson),
        }],
      },
      artifactBackedPayload: false,
    });
    const failure = runCliFailure(['packages', 'install', '--dry-run', 'rca'], {
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(fixtureRoot, 'modules'),
      HOME: path.join(fixtureRoot, 'home'),
      CODEX_HOME: path.join(fixtureRoot, 'home', '.codex'),
      ...fixtureEnv,
    });
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_payload_catalog_source_bypass');
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});

test('managed catalog payload requires the exact declared source_path without archive search fallback', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-artifact-path-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-artifact-path-fixture-'));
  const pluginSourcePath = createPluginSourceFixture({ pluginId: 'redcube-ai' });
  try {
    const pluginJson = fs.readFileSync(path.join(pluginSourcePath, '.codex-plugin', 'plugin.json'), 'utf8');
    const fixtureEnv = writeManagedRuntimeSourceFixture({
      root: fixtureRoot,
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      version: '0.2.1',
      sourceHeadSha: '2'.repeat(40),
      packageManifest: {
        ...agentPackageManifest({
          packageId: 'rca',
          agentId: 'rca',
          pluginId: 'redcube-ai',
          distributionPayload: null,
        }),
        version: '0.2.1',
        source: 'first_party',
      },
      payloadManifest: {
        surface_kind: 'opl_agent_package_payload_manifest',
        files: [{
          path: '.codex-plugin/plugin.json',
          source_path: 'plugins/redcube-ai/missing/plugin.json',
          sha256: sha256Fixture(pluginJson),
        }],
      },
      sourceFiles: [{
        sourcePath: 'plugins/redcube-ai/.codex-plugin/plugin.json',
        content: pluginJson,
      }],
    });
    const failure = runCliFailure(['packages', 'install', '--dry-run', 'rca'], {
      OPL_STATE_DIR: stateDir,
      OPL_MODULES_ROOT: path.join(fixtureRoot, 'modules'),
      HOME: path.join(fixtureRoot, 'home'),
      CODEX_HOME: path.join(fixtureRoot, 'home', '.codex'),
      ...fixtureEnv,
    });
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_payload_artifact_source_missing');
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});

test('repair migrates legacy Framework manifests to one stable catalog selection for plugin and runtime carriers', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-stable-repair-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-stable-repair-fixture-'));
  const homeDir = path.join(fixtureRoot, 'home');
  const modulesRoot = path.join(fixtureRoot, 'modules');
  const pluginSourcePath = createPluginSourceFixture({ pluginId: 'redcube-ai' });
  const manifestPath = path.join(fixtureRoot, 'contracts', 'opl-framework', 'packages', 'rca.json');
  const legacySourceHead = '3'.repeat(40);
  const stableSourceHead = '4'.repeat(40);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, formatJsonPayload({
    ...agentPackageManifest({
      packageId: 'rca',
      agentId: 'rca',
      pluginId: 'redcube-ai',
      pluginSourcePath,
      distributionPayload: null,
    }),
    version: '0.2.0',
    source: 'first_party',
    runtime_source_carrier: {
      carrier_kind: 'opl_managed_module_source',
      module_id: 'redcube',
    },
  }));
  const env = {
    OPL_STATE_DIR: stateDir,
    OPL_MODULES_ROOT: modulesRoot,
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    ...writeManagedRuntimeSourceFixture({
      root: fixtureRoot,
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      version: '0.2.0',
      sourceHeadSha: legacySourceHead,
    }),
  };
  try {
    runCli([
      'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party',
      '--source-kind', 'local_manifest_file',
    ], env);
    const pluginJson = fs.readFileSync(path.join(pluginSourcePath, '.codex-plugin', 'plugin.json'), 'utf8');
    const skillMarkdown = fs.readFileSync(path.join(pluginSourcePath, 'skills', 'redcube-ai', 'SKILL.md'), 'utf8');
    const stableFixtureEnv = writeManagedRuntimeSourceFixture({
      root: fixtureRoot,
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      version: '0.2.1',
      sourceHeadSha: stableSourceHead,
      packageManifest: {
        ...agentPackageManifest({
          packageId: 'rca',
          agentId: 'rca',
          pluginId: 'redcube-ai',
          distributionPayload: null,
        }),
        source: 'first_party',
        runtime_source_carrier: {
          carrier_kind: 'opl_managed_module_source',
          module_id: 'redcube',
        },
      },
      payloadManifest: {
        surface_kind: 'opl_agent_package_payload_manifest',
        files: [
          {
            path: '.codex-plugin/plugin.json',
            source_path: 'plugins/redcube-ai/.codex-plugin/plugin.json',
            sha256: sha256Fixture(pluginJson),
          },
          {
            path: 'skills/redcube-ai/SKILL.md',
            source_path: 'plugins/redcube-ai/skills/redcube-ai/SKILL.md',
            sha256: sha256Fixture(skillMarkdown),
          },
        ],
      },
      sourceFiles: [
        { sourcePath: 'plugins/redcube-ai/.codex-plugin/plugin.json', content: pluginJson },
        { sourcePath: 'plugins/redcube-ai/skills/redcube-ai/SKILL.md', content: skillMarkdown },
      ],
    });
    Object.assign(env, stableFixtureEnv);

    const preview = runCli(['packages', 'repair', 'rca', '--dry-run'], env) as any;
    const previewLock = preview.opl_agent_package_repair.package_lock;
    assert.equal(previewLock.package_version, '0.2.1');
    assert.equal(previewLock.source_kind, 'first_party_managed_cohort');
    assert.equal(previewLock.manifest_url, 'opl+oci://ghcr.io/fixture/one-person-lab-packages/rca:0.2.1#/package-manifest.json');
    assert.equal(previewLock.source_artifact_ref, 'ghcr.io/fixture/one-person-lab-packages/rca:0.2.1');
    assert.equal(previewLock.artifact_digest, stableFixtureEnv.OPL_FIXTURE_ARTIFACT_DIGEST);
    assert.equal(previewLock.managed_update_source.catalog_ref, 'ghcr.io/fixture/one-person-lab-manifest:latest-stable');
    assert.equal(previewLock.managed_runtime_source.channel_version, '0.2.1');
    assert.equal(previewLock.managed_runtime_source.source_git_head_sha, stableSourceHead);
    assert.equal(
      previewLock.managed_runtime_source.artifact_ref,
      `ghcr.io/fixture/one-person-lab-packages/rca:0.2.1@${stableFixtureEnv.OPL_FIXTURE_ARTIFACT_DIGEST}`,
    );
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.2.0');

    const repaired = runCli(['packages', 'repair', 'rca'], env) as any;
    const repairedLock = repaired.opl_agent_package_repair.package_lock;
    assert.equal(repairedLock.package_version, '0.2.1');
    assert.equal(repairedLock.managed_runtime_source.source_git_head_sha, stableSourceHead);
    assert.equal(fs.readFileSync(path.join(modulesRoot, 'redcube-ai', '.runtime-prepared'), 'utf8').trim(), '0.2.1');
    assert.equal(
      fs.readFileSync(path.join(repairedLock.physical_surface.codex_plugin_cache_path, 'skills', 'redcube-ai', 'SKILL.md'), 'utf8'),
      skillMarkdown,
    );
    const status = runCli(['packages', 'status', '--package-id', 'rca'], env) as any;
    assert.equal(status.opl_agent_package_status.launch_allowed, true);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});

test('package actions describe both positional and flagged package selection', () => {
  const failure = runCliFailure(['packages', 'repair']);

  assert.match(
    failure.payload.error.message,
    /requires a positional package id or --package-id/,
  );
  assert.deepEqual(
    failure.payload.error.details.required,
    ['<package_id> or --package-id'],
  );
});

test('OPL Flow manifest resolves its package-owned 0.1.20 carrier and managed policy payload', () => {
  const manifestPath = path.join(repoRoot, 'contracts', 'opl-framework', 'packages', 'opl-flow.json');
  const manifest = normalizePackageManifest(
    parseJsonText(fs.readFileSync(manifestPath, 'utf8')),
    pathToFileURL(manifestPath).href,
  );

  assert.equal(manifest.package_id, 'opl-flow');
  assert.equal(manifest.version, '0.1.20');
  assert.deepEqual(manifest.required_skill_ids, ['opl-flow']);
  assert.equal(
    manifest.plugin_payload_manifest_url,
    path.join(repoRoot, 'contracts', 'opl-framework', 'packages', 'payloads', 'opl-flow-0.1.20.json'),
  );
  assert.deepEqual(manifest.managed_policy_surface, {
    policy_kind: 'opl_flow_workflow_policy',
    source_path: 'contracts/workflow-policy.json',
    schema_path: 'contracts/workflow-policy.schema.json',
  });
});

test('RCA first-party manifest resolves the released 0.2.3 carrier payload', () => {
  const manifestPath = path.join(repoRoot, 'contracts', 'opl-framework', 'packages', 'rca.json');
  const manifest = normalizePackageManifest(
    parseJsonText(fs.readFileSync(manifestPath, 'utf8')),
    pathToFileURL(manifestPath).href,
  );

  assert.equal(manifest.package_id, 'rca');
  assert.equal(manifest.version, '0.2.3');
  assert.deepEqual(manifest.required_skill_ids, ['redcube-ai']);
  assert.equal(
    manifest.plugin_payload_manifest_url,
    path.join(repoRoot, 'contracts', 'opl-framework', 'packages', 'payloads', 'rca-0.2.3.json'),
  );
});

test('standard Agent manifests declare managed runtime source carriers while capability and policy packages do not', () => {
  const expected = new Map([
    ['mas.json', 'medautoscience'],
    ['mag.json', 'medautogrant'],
    ['rca.json', 'redcube'],
    ['oma.json', 'oplmetaagent'],
    ['obf.json', 'oplbookforge'],
  ]);
  const manifestRoot = path.join(repoRoot, 'contracts', 'opl-framework', 'packages');
  for (const [file, moduleId] of expected) {
    const manifestPath = path.join(manifestRoot, file);
    const manifest = normalizeManifest(parseJsonText(fs.readFileSync(manifestPath, 'utf8')), pathToFileURL(manifestPath).href);
    assert.deepEqual(manifest.runtime_source_carrier, {
      carrier_kind: 'opl_managed_module_source',
      module_id: moduleId,
    });
  }
  for (const file of ['opl-flow.json', 'mas-scholar-skills.json']) {
    const manifestPath = path.join(manifestRoot, file);
    const payload = parseJsonText(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal((payload as any).runtime_source_carrier, undefined);
  }
});

test('MAS package exposes ScholarSkills as a required managed capability dependency', () => {
  const manifestPath = path.join(repoRoot, 'contracts', 'opl-framework', 'packages', 'mas.json');
  const manifestPayload = parseJsonText(fs.readFileSync(manifestPath, 'utf8')) as {
    codex_surface: { bundled_capability_package_ids: string[] };
    capability_dependencies: Array<{
      module_id: string;
      package_id: string;
      kind: string;
      required: boolean;
      version_requirement: string;
      opl_distribution: string;
    }>;
  };
  const manifest = normalizeManifest(
    manifestPayload,
    pathToFileURL(manifestPath).href,
  );
  const dependency = manifestPayload.capability_dependencies.find(
    (entry) => entry.package_id === 'mas-scholar-skills',
  );

  assert.equal(manifest.package_id, 'mas');
  assert.deepEqual(manifestPayload.codex_surface.bundled_capability_package_ids, ['mas-scholar-skills']);
  assert.equal(dependency?.module_id, 'scholarskills');
  assert.equal(dependency?.kind, 'framework_capability_package');
  assert.equal(dependency?.required, true);
  assert.equal(dependency?.version_requirement, '>=0.2.0 <0.3.0');
  assert.equal(dependency?.opl_distribution, 'managed_dependency');

});

test('Home shortcut preferences can be changed before the package is installed', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-home-preference-state-'));
  try {
    const result = runCli([
      'packages',
      'preferences',
      'set',
      '--package-id',
      'opl-meta-agent',
      '--shortcut-id',
      'oma',
      '--visible',
    ], { OPL_STATE_DIR: stateDir }) as {
      opl_agent_package_home_shortcut_preferences: {
        preference: {
          package_id: string;
          shortcut_id: string;
          visible: boolean;
          sort_order: number | null;
          source: string;
          updated_at: string;
          installed: boolean;
        };
      };
    };

    assert.deepEqual(result.opl_agent_package_home_shortcut_preferences.preference, {
      package_id: 'oma',
      shortcut_id: 'oma',
      visible: true,
      sort_order: null,
      source: 'user_preference',
      updated_at: result.opl_agent_package_home_shortcut_preferences.preference.updated_at,
      installed: false,
    });
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

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

test('packages rejects registry manifest identity drift before writing locks', () => {
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
      'packages',
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

test('packages fails closed when latest is treated as install truth', () => {
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
      'packages',
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

test('packages rejects developer checkout auto-update and permission scope drift', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-policy-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-policy-home-'));
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-policy-fixtures-'));
  const pluginSourcePath = createPluginSourceFixture();
  const env = {
    OPL_STATE_DIR: stateDir,
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
  };
  try {
    const manifestPath = path.join(fixtureDir, 'manifest.json');
    const permissionManifestPath = path.join(fixtureDir, 'manifest-permission-change.json');
    fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest({ pluginSourcePath })), 'utf8');
    fs.writeFileSync(
      permissionManifestPath,
      formatJsonPayload(agentPackageManifest({ pluginSourcePath, permissions: [{ id: 'filesystem.write' }] })),
      'utf8',
    );

    await runCliAsync([
      'packages',
      'install',
      '--manifest-url',
      pathToFileURL(manifestPath).href,
      '--trust-tier',
      'third_party_verified',
    ], env);

    const developerUpdateFailure = runCliFailure([
      'packages',
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
      'packages',
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
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});

test('packages preserves installed lock and receipt trail when update materialization fails', () => {
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
      'packages',
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
      'packages',
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
      'packages',
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

test('packages rejects invalid manifests before writing locks', () => {
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
      'packages',
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

test('packages validates first-party agent package manifest shape', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-first-party-manifest-state-'));
  try {
    const manifestPath = path.join(repoRoot, 'contracts', 'opl-framework', 'packages', 'oma.json');
    const validation = runCli([
      'packages',
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
    assert.equal(validation.opl_agent_package_manifest.package_id, 'oma');
    assert.equal(validation.opl_agent_package_manifest.codex_visible_entry, 'opl-meta-agent');
    assert.deepEqual(validation.opl_agent_package_manifest.bundled_required_skill_ids, ['opl-meta-agent']);
    assert.equal(validation.opl_agent_package_manifest.distribution_payload, null);
    assert.equal(validation.opl_agent_package_manifest.rollback_ref, 'rollback-ref:oma/unavailable'); // reuse-first: allow owner-routed package provenance assertion.
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('packages resolves public aliases without rewriting manifest identity', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-alias-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-alias-home-'));
  const pluginSourcePath = createPluginSourceFixture();
  const runtimeFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-alias-runtime-'));
  const runtimeEnv = writeManagedRuntimeSourceFixture({
    root: runtimeFixtureRoot,
    moduleId: 'medautoscience',
    repoName: 'med-autoscience',
    version: '0.1.0a4',
    sourceHeadSha: 'alias-runtime-source-v1',
  });
  const env = {
    OPL_STATE_DIR: stateDir,
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
    OPL_MODULES_ROOT: path.join(runtimeFixtureRoot, 'modules'),
    ...runtimeEnv,
  };
  try {
    await withAgentPackageServer(async (baseUrl) => {
      const refresh = await runCliAsync([
        'packages',
        'registry',
        'refresh',
        '--registry-url',
        `${baseUrl}/registry.json`,
      ], env) as {
        opl_agent_package_registry: {
          entries: Array<{ package_id: string }>;
        };
      };
      assert.equal(refresh.opl_agent_package_registry.entries[0].package_id, 'mas');

      const install = await runCliAsync([
        'packages',
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
      assert.equal(install.opl_agent_package_install.package_lock.package_id, 'mas');
      assert.equal(install.opl_agent_package_install.package_lock.agent_id, 'mas');
      assert.equal(install.opl_agent_package_install.owner_route_readback.selected_package_id, 'mas');

      const shortcut = await runCliAsync([
        'packages',
        'preferences',
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
      assert.equal(shortcut.opl_agent_package_home_shortcut_preferences.preference.package_id, 'mas');

      const status = runCli(['packages', 'status', '--package-id', 'mas'], env) as {
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
      assert.equal(status.opl_agent_package_status.package_id, 'mas');
      assert.equal(status.opl_agent_package_status.installed_packages[0].package_id, 'mas');
      assert.equal(status.opl_agent_package_status.installed_packages[0].agent_id, 'mas');
      assert.equal(status.opl_agent_package_status.home_shortcut_preferences[0].package_id, 'mas');
      assert.equal(status.opl_agent_package_status.owner_route_readback.selected_package_id, 'mas');
      assert.equal(status.opl_agent_package_status.owner_route_readback.packages[0].package_id, 'mas');
    }, agentPackageManifest({
      packageId: 'mas',
      agentId: 'mas',
      pluginSourcePath,
    }));
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
    fs.rmSync(runtimeFixtureRoot, { recursive: true, force: true });
  }
});

test('packages rejects legacy persisted package identities instead of migrating them on readback', () => {
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

    const failure = runCliFailure(['packages', 'list'], { OPL_STATE_DIR: stateDir });
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_identity_not_canonical');
    assert.equal(failure.payload.error.details.declared_id, 'medautoscience');
    assert.equal(failure.payload.error.details.canonical_id, 'mas');
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});
