import { pathToFileURL } from 'node:url';

import {
  agentPackageManifest,
  assert,
  formatJsonPayload,
  fs,
  os,
  path,
  repoRoot,
  runCli,
  runCliFailure,
  test,
} from './helpers.ts';
import { createFakeCodexFixture } from '../../helpers.ts';
import {
  buildAgentPackageDirectory,
  enrichRegistryCacheManifestMetadata,
  normalizePackageCatalogRegistry,
} from '../../../../../src/modules/connect/agent-package-registry-parts/directory.ts';
import { getOplPackageSpecs } from '../../../../../src/modules/connect/package-distribution.ts';
import { normalizeRegistry } from '../../../../../src/modules/connect/agent-package-registry-parts/manifest-normalizers.ts';
import { fetchAndValidateRegistry } from '../../../../../src/modules/connect/agent-package-registry-parts/selection.ts';
import { listOplAgentPackages } from '../../../../../src/modules/connect/agent-package-registry.ts';
import { agentPackageActivationPayload } from '../../../../../src/modules/console/app-state-parts/action-execute-payloads.ts';

const CANONICAL_PACKAGE_ROLES = new Set([
  'standard_agent',
  'framework_capability_package',
  'workflow_profile',
]);
const CANONICAL_PACKAGE_IDS = [
  'mas',
  'mag',
  'rca',
  'oma',
  'obf',
  'mas-scholar-skills',
  'opl-flow',
];

function isolatedPackageEnv(prefix: string) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-home-`));
  return {
    home,
    env: {
      HOME: home,
      CODEX_HOME: path.join(home, '.codex'),
      OPL_STATE_DIR: path.join(home, 'opl-state'),
    },
  };
}

function registryPayload(manifestUrl: string, packageRole: string | null = 'standard_agent') {
  return {
    registry_id: 'directory-test-registry',
    entries: [{
      package_id: 'third.party.research',
      display_name: 'Third Party Research',
      publisher: 'example-org',
      description: 'Third-party research workflow package.',
      tags: ['research'],
      ...(packageRole ? { package_role: packageRole } : {}),
      source: 'third_party',
      manifest_url: manifestUrl,
      version_source_ref: `${manifestUrl}#/version`,
      trust_tier: 'third_party_verified',
    }],
  };
}

function assertRecommendedActionMatchesAvailable(entry: any) {
  if (entry.recommended_action === null) {
    assert.equal(entry.recommended_action_ref, null);
    return;
  }
  const available = entry.available_actions.find(
    (action: any) => action.action_id === entry.recommended_action,
  );
  assert.deepEqual(entry.recommended_action_ref, available);
  assert.equal(available.action_ref, `app_state.actions#${entry.recommended_action}`);
  assert.equal(typeof available.payload, 'object');
}

test('packages list and app state expose the canonical public package directory before installation', () => {
  const fixture = isolatedPackageEnv('opl-package-directory');
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
exit 1
`);
  try {
    const list = runCli(['packages', 'list'], fixture.env) as any;
    const directory = list.opl_agent_packages.directory;
    assert.equal(directory.surface_kind, 'opl_agent_package_directory.v1');
    assert.equal(directory.entry_count, 7);
    assert.equal(directory.installed_package_count, 0);
    assert.equal(directory.installable_package_count, 7);
    for (const entry of directory.entries) {
      assert.equal(typeof entry.package_id, 'string');
      assert.equal(typeof entry.description, 'string');
      assert.equal(entry.description.length > 0, true);
      assert.equal(Array.isArray(entry.tags), true);
      assert.equal(entry.tags.length > 0, true);
      assert.equal(CANONICAL_PACKAGE_ROLES.has(entry.package_role), true);
      assert.equal(entry.installed, false);
      assert.equal(entry.activated, false);
      assert.equal(entry.installability.installable, true);
      assert.equal(entry.recommended_action, 'install_from_manifest_url');
      assert.deepEqual(entry.available_actions[0].payload, { package_id: entry.package_id });
      assertRecommendedActionMatchesAvailable(entry);
    }
    const flow = directory.entries.find((entry: any) => entry.package_id === 'opl-flow');
    const scholarSkills = directory.entries.find((entry: any) => entry.package_id === 'mas-scholar-skills');
    assert.equal(flow.package_role, 'workflow_profile');
    assert.equal(flow.projected_version, '0.1.22');
    assert.equal(flow.selected_version, null);
    assert.equal(flow.stable_version, null);
    assert.equal(flow.source_explanation.kind, 'first_party_framework_projection');
    assert.equal(flow.version_currentness.status, 'framework_projection_only');
    assert.equal(flow.version_currentness.live_verified, false);
    assert.equal(directory.first_party_release_currentness.status, 'unknown');
    assert.equal(scholarSkills.package_role, 'framework_capability_package');

    for (const profile of ['fast', 'full'] as const) {
      const appState = runCli(['app', 'state', '--profile', profile], {
        ...fixture.env,
        OPL_MODULES_ROOT: path.join(fixture.home, 'opl-state', 'modules'),
        OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
        OPL_DEVELOPER_MODE_GH_BINARY: path.join(fixture.home, 'missing-gh'),
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      }) as any;
      const projected = appState.app_state.agent_packages.directory;
      assert.equal(projected.surface_kind, 'opl_agent_package_directory.v1');
      assert.equal(projected.detail, profile);
      assert.equal(projected.entries.length, 7);
      assert.equal(projected.entries.every((entry: any) =>
        entry.package_id && entry.package_role && entry.installability && entry.recommended_action), true);
      assert.equal('directory' in projected, false);
    }
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('Developer Mode selects every available first-party Package checkout', () => {
  const fixture = isolatedPackageEnv('opl-package-directory-developer-policy');
  const workspace = path.join(fixture.home, 'workspace');
  const repoNames = [
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
    'opl-meta-agent',
    'opl-bookforge',
    'mas-scholar-skills',
    'opl-flow',
  ];
  try {
    fs.mkdirSync(fixture.env.OPL_STATE_DIR, { recursive: true });
    for (const repoName of repoNames) {
      fs.mkdirSync(path.join(workspace, repoName), { recursive: true });
    }
    fs.writeFileSync(path.join(fixture.env.OPL_STATE_DIR, 'developer-supervisor.json'), formatJsonPayload({
      version: 'g1',
      enabled: 'on',
      mode: 'developer_apply_safe',
      auto_enable_github_login: 'gaofeng21cn',
      module_source_preferences: {},
      updated_at: '2026-07-16T00:00:00.000Z',
    }));
    const directory = (runCli(['packages', 'list'], {
      ...fixture.env,
      OPL_WORKSPACE_ROOT: workspace,
    }) as any).opl_agent_packages.directory;
    for (const packageId of CANONICAL_PACKAGE_IDS) {
      const policy = directory.entries.find((entry: any) => entry.package_id === packageId)
        .source_explanation.effective_source_policy;
      assert.equal(policy.desired_source_kind, 'developer_checkout_override');
      assert.equal(policy.developer_checkout_available, true);
      assert.equal(policy.package_channel_auto_update, false);
    }
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('first-party Directory versions come only from the managed Release Set selector', () => {
  const versions = new Map(getOplPackageSpecs().map((spec) => {
    const packageVersion = spec.package_id === 'opl-flow' ? '0.1.19' : spec.selected_version;
    const sourceArtifactRef = `ghcr.io/fixture/one-person-lab-packages/${spec.package_id}:${packageVersion}`;
    return [spec.package_id, {
      package_id: spec.package_id,
      package_role: spec.package_role,
      selected_version: packageVersion,
      versions: [{
        package_version: packageVersion,
        capability_abi: null,
        manifest_url: `opl+oci://${sourceArtifactRef}#/package-manifest.json`,
        manifest_sha256: `sha256:${'1'.repeat(64)}`,
        manifest_json: '{}',
        payload_manifest_json: '{}',
        payload_manifest_sha256: `sha256:${'2'.repeat(64)}`,
        content_digest: `sha256:${'3'.repeat(64)}`,
        payload_digest: `sha256:${'4'.repeat(64)}`,
        source_artifact_ref: sourceArtifactRef,
        artifact_digest: `sha256:${'5'.repeat(64)}`,
        artifact_status: 'published_immutable',
        package_content_digest: `sha256:${'6'.repeat(64)}`,
        owner_source_commit: '7'.repeat(40),
        dependency_package_ids: [],
        selection_status: 'selected_for_release_set' as const,
      }],
    }];
  }));
  const directory = buildAgentPackageDirectory({
    registryCache: null,
    locks: [],
    detail: 'fast',
    firstPartyCatalog: {
      catalog: versions,
      freshness: 'live',
      catalog_ref: 'ghcr.io/fixture/one-person-lab-manifest:latest-stable',
      catalog_digest: `sha256:${'8'.repeat(64)}`,
      checked_at: '2026-07-15T00:00:00.000Z',
    },
  });
  const flow = directory.entries.find((entry) => entry.package_id === 'opl-flow')!;
  assert.equal(flow.projected_version, '0.1.22');
  assert.equal(flow.selected_version, '0.1.19');
  assert.equal(flow.stable_version, '0.1.19');
  assert.equal(flow.version_currentness.status, 'live_release_set');
  assert.equal(flow.version_currentness.live_verified, true);
  assert.equal(directory.first_party_release_currentness.status, 'live');
});

test('external package catalogs preserve third-party selection and reject first-party identity collisions', () => {
  const manifestJson = formatJsonPayload(agentPackageManifest());
  const manifestUrl = 'file:///tmp/third-party-research.json';
  const catalog = {
    surface_kind: 'opl_package_catalog.v1',
    packages: {
      package_catalog: {
        'third.party.research': {
          package_id: 'third.party.research',
          package_role: 'standard_agent',
          source: 'third_party',
          trust_tier: 'third_party_verified',
          selected_version: '1.2.3',
          versions: [{
            package_version: '1.2.3',
            selection_status: 'selected_for_release_set',
            manifest_url: manifestUrl,
            manifest_json: manifestJson,
          }],
        },
      },
    },
  };
  const cache = normalizePackageCatalogRegistry(catalog, 'file:///tmp/opl-catalog.json', 'catalog-sha');
  assert.equal(cache.entry_count, 1);
  assert.equal(cache.entries[0].package_role, 'standard_agent');
  assert.equal(cache.entries[0].selected_version, '1.2.3');
  assert.equal(cache.entries[0].stable_version, '1.2.3');
  assert.equal(cache.entries[0].manifest_validation, 'catalog_inline_manifest');
  assert.equal(cache.entries[0].source, 'third_party');
  assert.equal(cache.entries[0].trust_tier, 'third_party_verified');

  for (const [source, trustTier] of [
    ['organization_registry', 'organization_verified'],
    ['user_registry', 'third_party_unverified'],
  ]) {
    const entry = {
      ...catalog.packages.package_catalog['third.party.research'],
      source,
      trust_tier: trustTier,
    };
    const preserved = normalizePackageCatalogRegistry({
      ...catalog,
      packages: { package_catalog: { 'third.party.research': entry } },
    }, `file:///tmp/${source}-catalog.json`, 'catalog-sha');
    assert.equal(preserved.entries[0].source, source);
    assert.equal(preserved.entries[0].trust_tier, trustTier);
  }

  const reservedFirstPartyClaimVariants = [
    'first_party',
    'first-party-managed',
    'first party',
    'first.party',
    'firstParty',
    'firstPartyReleaseCatalog',
  ];
  for (const trustTier of [undefined, ...reservedFirstPartyClaimVariants]) {
    const entry = {
      ...catalog.packages.package_catalog['third.party.research'],
      ...(trustTier ? { trust_tier: trustTier } : {}),
    };
    if (!trustTier) delete (entry as Record<string, unknown>).trust_tier;
    assert.throws(
      () => normalizePackageCatalogRegistry({
        ...catalog,
        packages: { package_catalog: { 'third.party.research': entry } },
      }, 'file:///tmp/untrusted-catalog.json', 'catalog-sha'),
      (error: any) => error?.details?.failure_code === 'agent_package_directory_catalog_trust_tier_invalid',
    );
  }

  for (const source of [
    undefined,
    ...reservedFirstPartyClaimVariants,
  ]) {
    const entry = {
      ...catalog.packages.package_catalog['third.party.research'],
      ...(source ? { source } : {}),
    };
    if (!source) delete (entry as Record<string, unknown>).source;
    assert.throws(
      () => normalizePackageCatalogRegistry({
        ...catalog,
        packages: { package_catalog: { 'third.party.research': entry } },
      }, 'file:///tmp/invalid-source-catalog.json', 'catalog-sha'),
      (error: any) => error?.details?.failure_code === 'agent_package_directory_catalog_source_invalid',
    );
  }

  assert.throws(
    () => normalizePackageCatalogRegistry({
      ...catalog,
      packages: {
        package_catalog: {
          'third.party.research': {
            ...catalog.packages.package_catalog['third.party.research'],
            package_role: 'workflow_profile',
          },
        },
      },
    }, 'file:///tmp/invalid-catalog.json', 'catalog-sha'),
    (error: any) => error?.details?.failure_code === 'agent_package_directory_catalog_role_invalid',
  );

  const collisionEntries = Object.fromEntries(['mas', 'oma'].map((packageId) => [packageId, {
    package_id: packageId,
    package_role: 'standard_agent',
    selected_version: '9.9.9',
    versions: [{
      package_version: '9.9.9',
      selection_status: 'selected_for_release_set',
      manifest_url: `https://attacker.invalid/${packageId}.json`,
      manifest_json: formatJsonPayload(agentPackageManifest({
        packageId,
        agentId: packageId,
        pluginId: `attacker-${packageId}`,
      })),
    }],
  }]));
  assert.throws(
    () => normalizePackageCatalogRegistry({
      surface_kind: 'opl_package_catalog.v1',
      packages: { package_catalog: collisionEntries },
    }, 'file:///tmp/malicious-catalog.json', 'malicious-sha'),
    (error: any) => error?.details?.failure_code === 'agent_package_registry_first_party_identity_collision',
  );

  const baseline = buildAgentPackageDirectory({ registryCache: null, locks: [], detail: 'fast' });
  const staleCollisionCache = {
    surface_kind: 'opl_agent_package_registry_cache',
    version: 'opl-agent-package-registry-cache.v1',
    refreshed_at: new Date().toISOString(),
    registry_url: 'file:///tmp/malicious-catalog.json',
    registry_sha256: 'malicious-sha',
    entry_count: 2,
    entries: ['mas', 'oma'].map((packageId) => ({
      package_id: packageId,
      display_name: `Hijacked ${packageId}`,
      publisher: 'attacker',
      description: 'Malicious first-party identity collision.',
      tags: ['attacker'],
      package_role: 'standard_agent',
      source: 'first_party_release_catalog',
      manifest_url: `https://attacker.invalid/${packageId}.json`,
      version_source_ref: `https://attacker.invalid/${packageId}.json#/version`,
      selected_version: '9.9.9',
      stable_version: '9.9.9',
      manifest_validation: 'catalog_inline_manifest',
      trust_tier: 'first_party',
    })),
  } as any;
  const defended = buildAgentPackageDirectory({
    registryCache: staleCollisionCache,
    locks: [],
    detail: 'fast',
  });
  for (const packageId of ['mas', 'oma']) {
    const expected = baseline.entries.find((entry) => entry.package_id === packageId)!;
    const actual = defended.entries.find((entry) => entry.package_id === packageId)!;
    assert.deepEqual({
      display_name: actual.display_name,
      publisher: actual.publisher,
      manifest_url: actual.manifest_url,
      selected_version: actual.selected_version,
      stable_version: actual.stable_version,
      trust_tier: actual.trust_tier,
      source_explanation: actual.source_explanation,
    }, {
      display_name: expected.display_name,
      publisher: expected.publisher,
      manifest_url: expected.manifest_url,
      selected_version: expected.selected_version,
      stable_version: expected.stable_version,
      trust_tier: expected.trust_tier,
      source_explanation: expected.source_explanation,
    });
    assert.deepEqual(actual.recommended_action_ref?.payload, { package_id: packageId });
    assert.deepEqual(actual.recommended_action_ref?.required_payload_fields, ['package_id']);
    assert.equal(Object.hasOwn(actual.recommended_action_ref?.payload ?? {}, 'registry_url'), false);
    assert.equal(Object.hasOwn(actual.recommended_action_ref?.payload ?? {}, 'manifest_url'), false);
    assert.equal(Object.hasOwn(actual.recommended_action_ref?.payload ?? {}, 'trust_tier'), false);
  }
});

test('external registries preserve external claims and reject first-party authority', async () => {
  const fixture = isolatedPackageEnv('opl-package-directory-first-party-registry-collision');
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
exit 1
`);
  const registryPath = path.join(fixture.home, 'registry.json');
  const registryUrl = pathToFileURL(registryPath).href;
  const manifestUrl = pathToFileURL(path.join(fixture.home, 'manifest.json')).href;
  const baseEntry = registryPayload(manifestUrl).entries[0];
  try {
    for (const [source, trustTier] of [
      ['organization_registry', 'organization_verified'],
      ['user_registry', 'third_party_unverified'],
    ]) {
      const normalized = normalizeRegistry({
        registry_id: 'external-claims',
        entries: [{ ...baseEntry, source, trust_tier: trustTier }],
      }, registryUrl, 'registry-sha');
      assert.equal(normalized.entries[0].source, source);
      assert.equal(normalized.entries[0].trust_tier, trustTier);
    }

    for (const field of ['source', 'trust_tier'] as const) {
      const missing = { ...baseEntry } as Record<string, unknown>;
      delete missing[field];
      assert.throws(
        () => normalizeRegistry({ registry_id: 'missing-claim', entries: [missing] }, registryUrl, 'registry-sha'),
        (error: any) => error?.details?.missing_fields?.includes(field) === true,
      );
      for (const claim of [
        'first_party',
        'first-party-managed',
        'first party',
        'first.party',
        'firstParty',
        'firstPartyReleaseCatalog',
        'first_party_future',
      ]) {
        assert.throws(
          () => normalizeRegistry({
            registry_id: 'reserved-claim',
            entries: [{ ...baseEntry, [field]: claim }],
          }, registryUrl, 'registry-sha'),
          (error: any) => error?.details?.failure_code === `agent_package_registry_${field === 'source' ? 'source' : 'trust_tier'}_invalid`,
        );
      }
    }

    fs.writeFileSync(registryPath, formatJsonPayload({
      registry_id: 'malicious-first-party-collision',
      entries: ['mas', 'oma'].map((packageId) => ({
        package_id: packageId,
        display_name: `Hijacked ${packageId}`,
        publisher: 'attacker',
        description: 'Malicious first-party identity collision.',
        tags: ['attacker'],
        package_role: 'standard_agent',
        source: 'third_party',
        manifest_url: `https://attacker.invalid/${packageId}.json`,
        version_source_ref: `https://attacker.invalid/${packageId}.json#/version`,
        trust_tier: 'third_party_verified',
      })),
    }));
    await assert.rejects(
      fetchAndValidateRegistry(registryUrl),
      (error: any) => error?.details?.failure_code === 'agent_package_registry_first_party_identity_collision',
    );

    fs.writeFileSync(registryPath, formatJsonPayload({
      registry_id: 'malicious-noncanonical-trust-claim',
      entries: [{ ...baseEntry, source: 'first_party_release_catalog' }],
    }));
    const installFailure = runCliFailure([
      'packages', 'install', '--registry-url', registryUrl, '--package-id', baseEntry.package_id,
    ], fixture.env);
    assert.equal(installFailure.payload.error.details.failure_code, 'agent_package_registry_source_invalid');
    for (const relativePath of [
      'agent-package-registry-cache.json',
      'agent-package-locks.json',
      'agent-package-lifecycle-ledger.json',
    ]) {
      assert.equal(fs.existsSync(path.join(fixture.env.OPL_STATE_DIR, relativePath)), false);
    }
    assert.equal(fs.existsSync(fixture.env.CODEX_HOME), false);

    const baseline = buildAgentPackageDirectory({ registryCache: null, locks: [], detail: 'fast' });
    fs.mkdirSync(fixture.env.OPL_STATE_DIR, { recursive: true });
    fs.writeFileSync(path.join(fixture.env.OPL_STATE_DIR, 'agent-package-registry-cache.json'), formatJsonPayload({
      surface_kind: 'opl_agent_package_registry_cache',
      version: 'opl-agent-package-registry-cache.v1',
      refreshed_at: '2026-01-01T00:00:00.000Z',
      registry_url: registryUrl,
      registry_sha256: 'stale-cache-sha',
      entry_count: CANONICAL_PACKAGE_IDS.length + 3,
      entries: [
        ...CANONICAL_PACKAGE_IDS.map((packageId) => ({
          ...baseEntry,
          package_id: packageId,
          display_name: `Hijacked ${packageId}`,
          publisher: 'attacker',
          source: 'first_party_release_catalog',
          trust_tier: 'first_party',
        })),
        { ...baseEntry, package_id: 'attacker.source', source: 'first_party_managed' },
        { ...baseEntry, package_id: 'attacker.trust', trust_tier: 'first_party_managed_cohort' },
        { ...baseEntry, source: 'organization_registry', trust_tier: 'third_party_unverified' },
      ],
    }));
    const directory = (runCli(['packages', 'list'], fixture.env) as any).opl_agent_packages.directory;
    assert.equal(directory.entry_count, CANONICAL_PACKAGE_IDS.length + 1);
    assert.equal(directory.entries.some((entry: any) => entry.package_id.startsWith('attacker.')), false);
    const validExternal = directory.entries.find((entry: any) => entry.package_id === baseEntry.package_id);
    assert.equal(validExternal.source_explanation.source, 'organization_registry');
    assert.equal(validExternal.trust_tier, 'third_party_unverified');
    for (const packageId of CANONICAL_PACKAGE_IDS) {
      const expected = baseline.entries.find((entry) => entry.package_id === packageId)!;
      const actual = directory.entries.find((entry: any) => entry.package_id === packageId)!;
      assert.deepEqual({
        display_name: actual.display_name,
        publisher: actual.publisher,
        manifest_url: actual.manifest_url,
        trust_tier: actual.trust_tier,
      }, {
        display_name: expected.display_name,
        publisher: expected.publisher,
        manifest_url: expected.manifest_url,
        trust_tier: expected.trust_tier,
      });
    }
    const appDirectory = (runCli(['app', 'state', '--profile', 'fast'], {
      ...fixture.env,
      OPL_MODULES_ROOT: path.join(fixture.home, 'opl-state', 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(fixture.home, 'missing-gh'),
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as any).app_state.agent_packages.directory;
    assert.equal(appDirectory.entry_count, CANONICAL_PACKAGE_IDS.length + 1);
    assert.equal(appDirectory.entries.some((entry: any) => entry.package_id.startsWith('attacker.')), false);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('registry manifest enrichment admits third-party packages and rejects role or manifest drift', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-directory-registry-'));
  const manifestPath = path.join(root, 'manifest.json');
  const manifestUrl = pathToFileURL(manifestPath).toString();
  try {
    fs.writeFileSync(manifestPath, formatJsonPayload({
      ...agentPackageManifest(),
      description: 'Manifest-owned third-party research package.',
      tags: ['literature', 'analysis'],
    }));
    const cache = normalizeRegistry(registryPayload(manifestUrl), 'file:///tmp/registry.json', 'registry-sha');
    const enriched = await enrichRegistryCacheManifestMetadata(cache);
    assert.equal(enriched.entries[0].package_role, 'standard_agent');
    assert.equal(enriched.entries[0].selected_version, '1.2.3');
    assert.equal(enriched.entries[0].stable_version, '1.2.3');
    assert.equal(enriched.entries[0].manifest_validation, 'fetched_manifest');
    assert.equal(enriched.entries[0].tags.includes('literature'), true);
    const directoryEntry = buildAgentPackageDirectory({
      registryCache: enriched,
      locks: [],
      detail: 'fast',
    }).entries.find((entry) => entry.package_id === 'third.party.research')!;
    const installAction = directoryEntry.recommended_action_ref;
    assert.ok(installAction);
    assert.deepEqual(installAction.payload, {
      package_id: 'third.party.research',
      registry_url: 'file:///tmp/registry.json',
    });
    assert.equal(Object.hasOwn(installAction.payload, 'trust_tier'), false);
    const directManifestEntry = buildAgentPackageDirectory({
      registryCache: { ...enriched, registry_url: null } as any,
      locks: [],
      detail: 'fast',
    }).entries.find((entry) => entry.package_id === 'third.party.research')!;
    const directInstallAction = directManifestEntry.recommended_action_ref!;
    assert.deepEqual(Object.keys(directInstallAction).sort(), [
      'action_id',
      'action_ref',
      'confirmation_required',
      'payload',
      'required_payload_fields',
    ]);
    assert.deepEqual(directInstallAction.payload, {
      package_id: 'third.party.research',
      manifest_url: manifestUrl,
      trust_tier: 'third_party_verified',
    });
    assert.deepEqual(directInstallAction.required_payload_fields, ['manifest_url', 'trust_tier']);
    assert.equal(
      directInstallAction.required_payload_fields.every((field) => Object.hasOwn(directInstallAction.payload, field)),
      true,
    );

    const roleDrift = normalizeRegistry(
      registryPayload(manifestUrl, 'workflow_profile'),
      'file:///tmp/role-drift-registry.json',
      'registry-sha',
    );
    await assert.rejects(
      enrichRegistryCacheManifestMetadata(roleDrift),
      (error: any) => error?.details?.failure_code === 'registry_manifest_package_role_mismatch',
    );

    fs.writeFileSync(manifestPath, formatJsonPayload({
      ...agentPackageManifest(),
      codex_surface: undefined,
    }));
    await assert.rejects(
      enrichRegistryCacheManifestMetadata(cache),
      (error: any) => error?.details?.failure_code === 'invalid_package_manifest',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('registry refresh rejects declared version drift without writing cache or receipt', () => {
  for (const [field, failureCode] of [
    ['selected_version', 'registry_manifest_selected_version_mismatch'],
    ['stable_version', 'registry_manifest_stable_version_mismatch'],
  ] as const) {
    const fixture = isolatedPackageEnv(`opl-package-directory-${field}-drift`);
    const manifestPath = path.join(fixture.home, 'manifest.json');
    const registryPath = path.join(fixture.home, 'registry.json');
    const manifestUrl = pathToFileURL(manifestPath).toString();
    const registryUrl = pathToFileURL(registryPath).toString();
    try {
      fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest()));
      const payload = registryPayload(manifestUrl);
      (payload.entries[0] as Record<string, unknown>)[field] = '9.9.9';
      fs.writeFileSync(registryPath, formatJsonPayload(payload));

      const failure = runCliFailure([
        'packages', 'registry', 'refresh', '--registry-url', registryUrl,
      ], fixture.env);
      assert.equal(failure.payload.error.details.failure_code, failureCode);
      assert.equal(fs.existsSync(path.join(fixture.env.OPL_STATE_DIR, 'agent-package-registry-cache.json')), false);
      assert.equal(fs.existsSync(path.join(fixture.env.OPL_STATE_DIR, 'agent-package-lifecycle-ledger.json')), false);
    } finally {
      fs.rmSync(fixture.home, { recursive: true, force: true });
    }
  }
});

test('ordinary registries reject opl+oci manifest refs before refresh can cache them', () => {
  const fixture = isolatedPackageEnv('opl-package-directory-oci-registry');
  const registryPath = path.join(fixture.home, 'registry.json');
  const registryUrl = pathToFileURL(registryPath).toString();
  const manifestUrl = 'opl+oci://ghcr.io/example/third-party-research:1.2.3#/package-manifest.json';
  const payload = registryPayload(manifestUrl);
  try {
    assert.throws(
      () => normalizeRegistry(payload, registryUrl, 'registry-sha'),
      (error: any) => error?.details?.failure_code === 'agent_package_registry_manifest_scheme_unsupported',
    );
    fs.writeFileSync(registryPath, formatJsonPayload(payload));
    const failure = runCliFailure([
      'packages', 'registry', 'refresh', '--registry-url', registryUrl,
    ], fixture.env);
    assert.equal(
      failure.payload.error.details.failure_code,
      'agent_package_registry_manifest_scheme_unsupported',
    );
    assert.equal(fs.existsSync(path.join(fixture.env.OPL_STATE_DIR, 'agent-package-registry-cache.json')), false);
    assert.equal(fs.existsSync(path.join(fixture.env.OPL_STATE_DIR, 'agent-package-lifecycle-ledger.json')), false);
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('legacy registry entries derive capability and workflow roles from validated manifests', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-directory-generic-role-fixtures-'));
  const cases = [
    ['mas-scholar-skills', 'fixture.scholar-skills', 'framework_capability_package'],
    ['opl-flow', 'fixture.opl-flow', 'workflow_profile'],
  ] as const;
  try {
    for (const [sourcePackageId, packageId, expectedRole] of cases) {
      const sourceManifest = JSON.parse(fs.readFileSync(
        path.join(repoRoot, 'contracts', 'opl-framework', 'packages', `${sourcePackageId}.json`),
        'utf8',
      ));
      const manifestPath = path.join(root, `${packageId}.json`);
      fs.writeFileSync(manifestPath, formatJsonPayload({
        ...sourceManifest,
        package_id: packageId,
        source: 'third_party',
      }));
      const manifestUrl = pathToFileURL(manifestPath).toString();
      const cache = normalizeRegistry({
        registry_id: `legacy-${packageId}`,
        entries: [{
          package_id: packageId,
          display_name: packageId,
          publisher: 'example-org',
          source: 'organization_registry',
          manifest_url: manifestUrl,
          version_source_ref: `${manifestUrl}#/version`,
          trust_tier: 'third_party_unverified',
        }],
      }, `file:///tmp/${packageId}-registry.json`, 'registry-sha');
      assert.equal(cache.entries[0].package_role, null);
      const enriched = await enrichRegistryCacheManifestMetadata(cache);
      assert.equal(enriched.entries[0].package_role, expectedRole);
      assert.equal(enriched.entries[0].manifest_validation, 'fetched_manifest');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  assert.throws(
    () => normalizeRegistry(registryPayload('file:///tmp/manifest.json', 'unsupported_role'), 'file:///tmp/registry.json', 'registry-sha'),
    (error: any) => error?.details?.failure_code === 'agent_package_registry_role_invalid',
  );
});

test('legacy roleless cache keeps App state readable and recovers through registry refresh', () => {
  const fixture = isolatedPackageEnv('opl-package-directory-legacy-cache');
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
exit 1
`);
  const manifestPath = path.join(fixture.home, 'manifest.json');
  const registryPath = path.join(fixture.home, 'registry.json');
  const manifestUrl = pathToFileURL(manifestPath).toString();
  const registryUrl = pathToFileURL(registryPath).toString();
  try {
    const [legacyEntry] = registryPayload(manifestUrl, null).entries;
    assert.equal(Object.hasOwn(legacyEntry, 'package_role'), false);
    fs.mkdirSync(fixture.env.OPL_STATE_DIR, { recursive: true });
    fs.writeFileSync(path.join(fixture.env.OPL_STATE_DIR, 'agent-package-registry-cache.json'), formatJsonPayload({
      surface_kind: 'opl_agent_package_registry_cache',
      version: 'opl-agent-package-registry-cache.v1',
      refreshed_at: '2026-01-01T00:00:00.000Z',
      registry_url: registryUrl,
      registry_sha256: 'legacy-cache',
      entry_count: 1,
      entries: [legacyEntry],
    }));
    const staleList = runCli(['packages', 'list'], fixture.env) as any;
    const staleDirectory = staleList.opl_agent_packages.directory;
    const staleEntry = staleDirectory.entries.find((entry: any) => entry.package_id === 'third.party.research');
    assert.equal(staleDirectory.status, 'attention_required');
    assert.equal(staleDirectory.migration_required_count, 1);
    assert.equal(staleEntry.package_role, null);
    assert.equal(staleEntry.installed, false);
    assert.equal(staleEntry.installability.status, 'migration_required');
    assert.equal(staleEntry.installability.installable, false);
    assert.equal(staleEntry.readiness.operational_ready, false);
    assert.equal(staleEntry.recommended_action, 'refresh_registry');
    assert.deepEqual(staleEntry.recommended_action_ref.payload, { registry_url: registryUrl });
    assertRecommendedActionMatchesAvailable(staleEntry);

    const appState = runCli(['app', 'state', '--profile', 'fast'], {
      ...fixture.env,
      OPL_MODULES_ROOT: path.join(fixture.home, 'opl-state', 'modules'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(fixture.home, 'missing-gh'),
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as any;
    assert.equal(appState.app_state.agent_packages.directory.status, 'attention_required');
    assert.equal(
      appState.app_state.agent_packages.directory.entries.find(
        (entry: any) => entry.package_id === 'third.party.research',
      ).recommended_action,
      'refresh_registry',
    );

    fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest()));
    fs.writeFileSync(registryPath, formatJsonPayload(registryPayload(manifestUrl)));
    const refresh = runCli([
      'packages', 'registry', 'refresh', '--registry-url', registryUrl,
    ], fixture.env) as any;
    assert.equal(refresh.opl_agent_package_registry.entries[0].package_role, 'standard_agent');
    const recovered = runCli(['packages', 'list'], fixture.env) as any;
    const recoveredEntry = recovered.opl_agent_packages.directory.entries.find(
      (entry: any) => entry.package_id === 'third.party.research',
    );
    assert.equal(recovered.opl_agent_packages.directory.status, 'available');
    assert.equal(recoveredEntry.package_role, 'standard_agent');
    assert.equal(recoveredEntry.installability.installable, true);
    assert.equal(recoveredEntry.recommended_action, 'install_from_manifest_url');
    assertRecommendedActionMatchesAvailable(recoveredEntry);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('scope-less list and App workspace context project different activation state from one lock', () => {
  const fixture = isolatedPackageEnv('opl-package-directory-scope');
  const previousStateDir = process.env.OPL_STATE_DIR;
  const workspace = path.join(fixture.home, 'workspace');
  const lock = {
    surface_kind: 'opl_agent_package_lock',
    package_id: 'third.party.capability-consumer',
    agent_id: 'third.party.capability-consumer',
    package_role: 'standard_agent',
    display_name: 'Capability Consumer',
    publisher: 'example-org',
    package_version: '1.0.0',
    trust_tier: 'third_party_verified',
    source_kind: 'manifest_url',
    manifest_url: 'https://example.test/consumer.json',
    lock_ref: 'opl://agent-package-lock/third.party.capability-consumer/1.0.0/fixture',
    capability_provider: null,
    scope_materializations: [],
  };
  const statusReader = (input: any) => ({
    opl_agent_package_status: input.scope === 'workspace' && input.targetWorkspace === workspace
      ? {
          status: 'available',
          recommended_action: null,
          operational_ready: true,
          launch_allowed: true,
          launch_blocked_reason: null,
          materialization_readiness: { status: 'current' },
        }
      : {
          status: 'attention_needed',
          recommended_action: 'agent_package_activate',
          operational_ready: false,
          launch_allowed: false,
          launch_blocked_reason: 'scope_materialization_scope_required',
          materialization_readiness: { status: 'scope_required' },
        },
  });
  try {
    process.env.OPL_STATE_DIR = fixture.env.OPL_STATE_DIR;
    fs.mkdirSync(fixture.env.OPL_STATE_DIR, { recursive: true });
    fs.writeFileSync(path.join(fixture.env.OPL_STATE_DIR, 'agent-package-locks.json'), formatJsonPayload({
      surface_kind: 'opl_agent_package_lock_index',
      version: 'opl-agent-package-lock-index.v1',
      packages: [lock],
      last_known_good_transactions: [],
    }));
    const scopeLess = listOplAgentPackages({ detail: 'fast', readStatus: statusReader as any })
      .opl_agent_packages.directory.entries.find((entry) => entry.package_id === lock.package_id)!;
    assert.equal(scopeLess.activated, false);
    assert.equal(scopeLess.readiness.status, 'activation_required');
    assert.equal(scopeLess.recommended_action, 'agent_package_activate');
    assertRecommendedActionMatchesAvailable(scopeLess);

    const missingWorkspace = listOplAgentPackages({
      detail: 'fast',
      readStatus: statusReader as any,
      statusContext: () => ({}),
    }).opl_agent_packages.directory.entries.find((entry) => entry.package_id === lock.package_id)!;
    const targetlessActivation = missingWorkspace.available_actions.find(
      (action) => action.action_id === 'agent_package_activate',
    )!;
    assert.deepEqual(targetlessActivation.payload, { package_id: lock.package_id });
    assert.deepEqual(Object.keys(targetlessActivation).sort(), [
      'action_id',
      'action_ref',
      'confirmation_required',
      'payload',
      'required_payload_fields',
    ]);
    assert.equal(missingWorkspace.recommended_action, 'agent_package_activate');
    assertRecommendedActionMatchesAvailable(missingWorkspace);

    const appWorkspace = listOplAgentPackages({
      detail: 'fast',
      readStatus: statusReader as any,
      statusContext: () => ({ scope: 'workspace', targetWorkspace: workspace }),
    }).opl_agent_packages.directory.entries.find((entry) => entry.package_id === lock.package_id)!;
    assert.equal(appWorkspace.activated, true);
    assert.equal(appWorkspace.readiness.status, 'verification_deferred');
    assert.equal(appWorkspace.readiness.verification_deferred, true);
    assert.equal(appWorkspace.readiness.reason, 'live_verification_deferred');
    assert.equal(appWorkspace.recommended_action, null);
    assert.equal(appWorkspace.available_actions.some((action) => action.action_id === 'agent_package_activate'), false);
    assertRecommendedActionMatchesAvailable(appWorkspace);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('installed-only directory entries retain persisted role and consume canonical readiness', () => {
  const lock = {
    surface_kind: 'opl_agent_package_lock',
    package_id: 'third.party.workflow',
    agent_id: null,
    package_role: 'workflow_profile',
    display_name: 'Third Party Workflow',
    publisher: 'example-org',
    package_version: '2.0.0',
    trust_tier: 'third_party_verified',
    source_kind: 'manifest_url',
    manifest_url: 'https://example.test/workflow.json',
    lock_ref: 'opl://agent-package-lock/third.party.workflow/2.0.0/fixture',
    capability_provider: null,
    scope_materializations: [],
  } as any;
  const ready = buildAgentPackageDirectory({
    registryCache: null,
    locks: [lock],
    detail: 'fast',
    readStatus: () => ({
      status: 'available',
      recommended_action: null,
      operational_ready: true,
      launch_allowed: true,
      launch_blocked_reason: null,
      materialization_readiness: { status: 'not_required' },
    }),
  }).entries.find((entry) => entry.package_id === lock.package_id)!;
  assert.equal(ready.package_role, 'workflow_profile');
  assert.equal(ready.activated, true);
  assert.equal(ready.readiness.status, 'verification_deferred');
  assert.equal(ready.readiness.verification_deferred, true);
  assert.equal(ready.readiness.reason, 'live_verification_deferred');
  assert.equal(ready.recommended_action, null);
  assert.equal(ready.recommended_action_ref, null);
  assert.equal(ready.available_actions.some((action) => action.action_id === 'agent_package_activate'), false);
  assertRecommendedActionMatchesAvailable(ready);

  const fullyVerified = buildAgentPackageDirectory({
    registryCache: null,
    locks: [lock],
    detail: 'full',
    readStatus: () => ({
      status: 'available',
      recommended_action: null,
      operational_ready: true,
      launch_allowed: true,
      launch_blocked_reason: null,
      materialization_readiness: { status: 'not_required' },
    }),
  }).entries.find((entry) => entry.package_id === lock.package_id)!;
  assert.equal(fullyVerified.activated, true);
  assert.equal(fullyVerified.readiness.status, 'ready');
  assert.equal(fullyVerified.readiness.verification_deferred, false);
  assert.equal(fullyVerified.readiness.reason, null);

  const developerCheckout = buildAgentPackageDirectory({
    registryCache: null,
    locks: [{ ...lock, source_kind: 'developer_checkout_override' }],
    detail: 'full',
    readStatus: () => ({
      status: 'available',
      recommended_action: 'agent_package_update',
      operational_ready: true,
      launch_allowed: true,
      launch_blocked_reason: null,
      materialization_readiness: { status: 'not_required' },
    }),
  }).entries.find((entry) => entry.package_id === lock.package_id)!;
  assert.equal(
    developerCheckout.available_actions.some((action) => action.action_id === 'agent_package_update'),
    false,
  );
  assert.equal(developerCheckout.recommended_action, null);
  assert.deepEqual(
    developerCheckout.available_actions.map((action) => action.action_id),
    ['agent_package_repair', 'agent_package_preferences_set', 'agent_package_uninstall'],
  );

  const needsActivation = buildAgentPackageDirectory({
    registryCache: null,
    locks: [lock],
    detail: 'full',
    readStatus: () => ({
      status: 'attention_needed',
      recommended_action: 'agent_package_activate',
      operational_ready: false,
      launch_allowed: false,
      launch_blocked_reason: 'scope_materialization_missing',
      materialization_readiness: { status: 'missing' },
    }),
    actionContext: () => ({ scope: 'workspace', targetWorkspace: '/tmp/opl-workspace' }),
  }).entries.find((entry) => entry.package_id === lock.package_id)!;
  assert.equal(needsActivation.activated, false);
  assert.equal(needsActivation.readiness.status, 'activation_required');
  assert.equal(needsActivation.recommended_action, 'agent_package_activate');
  assert.deepEqual(
    needsActivation.recommended_action_ref,
    needsActivation.available_actions.find((action) => action.action_id === 'agent_package_activate'),
  );
  assert.deepEqual(agentPackageActivationPayload(needsActivation.recommended_action_ref!.payload), {
    packageId: lock.package_id,
    scope: 'workspace',
    targetWorkspace: '/tmp/opl-workspace',
    targetQuest: undefined,
    useBoundaryId: null,
  });
  assertRecommendedActionMatchesAvailable(needsActivation);

  const disabled = buildAgentPackageDirectory({
    registryCache: null,
    locks: [{ ...lock, exposure_state: 'disabled' }],
    detail: 'full',
    readStatus: () => ({
      status: 'attention_needed',
      recommended_action: 'agent_package_activate',
      operational_ready: false,
      launch_allowed: false,
      launch_blocked_reason: 'package_disabled',
      materialization_readiness: { status: 'missing' },
    }),
  }).entries.find((entry) => entry.package_id === lock.package_id)!;
  assert.equal(disabled.activated, false);
  assert.equal(disabled.recommended_action, null);
  assert.equal(disabled.available_actions.some((action) => action.action_id === 'agent_package_activate'), false);
  assert.equal(disabled.available_actions.some((action) => action.action_id === 'agent_package_preferences_set'), true);

  const legacyDirectory = buildAgentPackageDirectory({
    registryCache: null,
    locks: [{ ...lock, package_id: 'third.party.legacy', package_role: undefined }],
    detail: 'fast',
  });
  const legacy = legacyDirectory.entries.find((entry) => entry.package_id === 'third.party.legacy')!;
  assert.equal(legacyDirectory.status, 'attention_required');
  assert.equal(legacy.package_role, null);
  assert.equal(legacy.role_state.status, 'migration_required');
  assert.equal(legacy.role_state.source, 'unresolved_installed_lock');
  assert.equal(legacy.installability.status, 'migration_required');
  assert.equal(legacy.readiness.status, 'migration_required');
  assert.equal(legacy.recommended_action, 'agent_package_repair');
  assert.deepEqual(
    legacy.available_actions.map((action) => action.action_id),
    ['agent_package_repair', 'agent_package_uninstall'],
  );
  assertRecommendedActionMatchesAvailable(legacy);

  const invalidRoleDirectory = buildAgentPackageDirectory({
    registryCache: null,
    locks: [{ ...lock, package_id: 'opl-flow', package_role: 'invalid_role' }],
    detail: 'fast',
  });
  const invalidRole = invalidRoleDirectory.entries.find((entry) => entry.package_id === 'opl-flow')!;
  assert.equal(invalidRoleDirectory.status, 'attention_required');
  assert.equal(invalidRole.package_role, null);
  assert.equal(invalidRole.role_state.status, 'migration_required');
  assert.equal(invalidRole.role_state.source, 'unresolved_installed_lock');
  assert.equal(invalidRole.role_state.diagnostic?.code, 'contract_shape_invalid');
  assert.equal(invalidRole.recommended_action, 'agent_package_repair');
  assertRecommendedActionMatchesAvailable(invalidRole);

  const failedStatusDirectory = buildAgentPackageDirectory({
    registryCache: null,
    locks: [lock],
    detail: 'full',
    readStatus: () => {
      throw new Error('fixture status read failed');
    },
  });
  const failedStatus = failedStatusDirectory.entries.find((entry) => entry.package_id === lock.package_id)!;
  assert.equal(failedStatusDirectory.status, 'attention_required');
  assert.equal(failedStatus.activated, false);
  assert.equal(failedStatus.readiness.status, 'repair_required');
  assert.equal(failedStatus.readiness.reason, 'package_status_read_failed');
  assert.equal(failedStatus.readiness.status_read_error?.code, 'unexpected_error');
  assert.equal(failedStatus.recommended_action, 'agent_package_repair');
  assert.deepEqual(
    failedStatus.available_actions.map((action) => action.action_id),
    ['agent_package_repair'],
  );
  assertRecommendedActionMatchesAvailable(failedStatus);
});
