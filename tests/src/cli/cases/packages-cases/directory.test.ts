import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

import {
  agentPackageManifest,
  assert,
  formatJsonPayload,
  fs,
  os,
  parseJsonText,
  path,
  repoRoot,
  runCli,
  runCliFailure,
  test,
} from './helpers.ts';
import { createFakeCodexFixture } from '../../helpers.ts';
import {
  buildAgentPackageDirectory,
  normalizePackageCatalogDocument,
} from '../../../../../src/modules/connect/agent-package-registry-parts/directory.ts';
import {
  discoverInstalledCodexPluginDescriptors,
  discoverInstalledPackageDescriptors,
} from '../../../../../src/modules/connect/agent-package-registry-parts/installed-codex-plugin-directory.ts';
import { getOplPackageSpecs } from '../../../../../src/modules/connect/package-distribution.ts';
import {
  normalizePackageManifest,
  normalizeRegistryDocument,
} from '../../../../../src/modules/connect/agent-package-registry-parts/manifest-normalizers.ts';
import { fetchAndValidateRegistry } from '../../../../../src/modules/connect/agent-package-registry-parts/selection.ts';
import {
  defaultHomeShortcutPreferences,
  mergedHomeShortcutPreferences,
} from '../../../../../src/modules/connect/agent-package-registry-parts/home-shortcuts.ts';
import { validateJsonSchemaPayload } from '../../../../../src/kernel/schema-registry.ts';
import {
  listOplAgentPackages,
  runOplAgentPackageStatus,
} from '../../../../../src/modules/connect/agent-package-registry.ts';
import { buildAppAgentPackageStatuses } from '../../../../../src/modules/console/app-state.ts';

const CANONICAL_PACKAGE_ROLES = new Set([
  'standard_agent',
  'capability_package',
  'workflow_profile',
]);
const CANONICAL_PACKAGE_IDS = getOplPackageSpecs().map((spec) => spec.package_id);

test('installed Codex plugins project owner descriptors without a registry entry', () => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-installed-plugin-descriptor-'));
  const stateFixture = isolatedPackageEnv('installed-plugin-descriptor');
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateFixture.env.OPL_STATE_DIR;
  try {
    const descriptor = agentPackageManifest({
      packageId: 'unknown.installed.agent',
      agentId: 'unknown-installed-agent',
      pluginId: 'unknown-installed-agent',
    });
    fs.writeFileSync(path.join(sourceRoot, 'opl-package.json'), formatJsonPayload(descriptor));
    const discovered = discoverInstalledCodexPluginDescriptors({
      runner: () => ({
        status: 0,
        stdout: JSON.stringify({
          installed: [{
            pluginId: 'unknown-installed-agent@owner-carrier',
            version: '1.2.3',
            enabled: true,
            installed: true,
            source: { source: 'local', path: sourceRoot },
            marketplaceSource: { sourceType: 'local', source: '/tmp/owner-carrier' },
          }],
        }),
        stderr: '',
        error: null,
      }),
    });
    const owner = discovered.get('unknown.installed.agent');
    assert.ok(owner);
    assert.equal(owner.manifest.package_id, 'unknown.installed.agent');
    assert.equal(owner.manifest.display_name, 'Third Party Research');
    assert.equal(owner.sourcePath, sourceRoot);
    assert.equal(owner.carrier.carrier.pluginId, 'unknown-installed-agent@owner-carrier');
    assert.equal(owner.enabled, true);
    assert.equal(owner.carrier_readback.kind, 'local');
    assert.equal(owner.carrier_readback.identity, 'unknown-installed-agent@owner-carrier');
    assert.equal(owner.carrier_readback.lifecycle_authority, 'carrier_owned');
    assert.deepEqual(owner.readiness, {
      installed: true,
      physical_status: 'available',
      callability: 'callable',
    });

    const directory = buildAgentPackageDirectory({
      detail: 'fast',
      installedCodexPluginDescriptors: discovered,
      configuredCarrierReadbacks: new Map([[
        'unknown.installed.agent',
        {
          surface_kind: 'opl_configured_codex_plugin_carrier_readback.v1',
          package_id: 'unknown.installed.agent',
          carrier: {
            kind: 'codex_plugin_manager',
            plugin_id: 'unknown-installed-agent@owner-carrier',
            marketplace_source: '/tmp/owner-carrier',
            observed_sources: [{
              plugin_id: 'unknown-installed-agent@owner-carrier',
              marketplace_source: '/tmp/owner-carrier',
              installed_version: '1.2.3',
              enabled: true,
              plugin_source_path: sourceRoot,
              source_tree_sha256: null,
            }],
            precedence: 'exact_single_source',
          },
          executor: {
            route: 'codex_cli',
            required_skill_ids: ['unknown-installed-agent'],
            status: 'callable',
          },
          publication_ref: null,
          status: 'installed',
          installed_version: '1.2.3',
          enabled: true,
          plugin_source_path: sourceRoot,
          operation: 'list',
          native_command: ['plugin', 'list', '--json'],
          native_action_dispatched: false,
          reason: null,
        },
      ]]),
    });
    const entry = directory.entries.find((candidate) => candidate.package_id === 'unknown.installed.agent');
    assert.ok(entry);
    assert.equal(entry?.source_explanation.kind, 'installed_codex_plugin_descriptor');
    assert.equal(entry?.installed, true);
    assert.equal(entry?.configured_carrier?.carrier.plugin_id, 'unknown-installed-agent@owner-carrier');
    assert.equal(entry?.recommended_action, null);
    assert.equal(entry?.recommended_action_ref, null);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateFixture.home, { recursive: true, force: true });
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test('installed Codex plugins fall back to the native plugin manifest without package-id tables', () => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-plugin-descriptor-'));
  const skillRoot = path.join(sourceRoot, 'skills', 'native-capability');
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), '# Native capability\n');
  fs.mkdirSync(path.join(sourceRoot, '.codex-plugin'));
  fs.writeFileSync(
    path.join(sourceRoot, '.codex-plugin', 'plugin.json'),
    formatJsonPayload({
      name: 'unknown-native-plugin',
      version: '1.2.3',
      description: 'Unknown native plugin',
      author: { name: 'Example owner' },
      repository: 'https://example.test/unknown-native-plugin',
      skills: './skills/',
      interface: {
        displayName: 'Unknown Native Plugin',
        longDescription: 'A future plugin discovered from its own carrier manifest.',
      },
    }),
  );
  try {
    const discovered = discoverInstalledCodexPluginDescriptors({
      runner: () => ({
        status: 0,
        stdout: JSON.stringify({
          installed: [{
            pluginId: 'unknown-native-plugin@example-marketplace',
            version: '1.2.3',
            enabled: true,
            installed: true,
            source: { source: 'local', path: sourceRoot },
            marketplaceSource: { sourceType: 'local', source: '/tmp/example-marketplace' },
          }],
        }),
        stderr: '',
        error: null,
      }),
    });
    const descriptor = discovered.get('unknown-native-plugin');
    assert.ok(descriptor);
    assert.equal(descriptor.manifest.display_name, 'Unknown Native Plugin');
    assert.equal(descriptor.manifest.publisher, 'Example owner');
    assert.deepEqual(descriptor.manifest.required_skill_ids, ['native-capability']);
    assert.equal(descriptor.manifest.configured_codex_plugin_carrier?.carrier.pluginId, 'unknown-native-plugin@example-marketplace');
    assert.deepEqual(
      [
        'distribution_payload',
        'rollback_ref',
        'plugin_payload_manifest_url',
        'plugin_payload_manifest_sha256',
        'plugin_payload_cache_path',
        'content_digest',
        'content_lock_canonicalization',
        'content_lock_paths',
      ].filter((field) => field in descriptor.manifest),
      [],
    );
    assert.equal(descriptor.manifestPath, path.join(sourceRoot, '.codex-plugin', 'plugin.json'));
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test('carrier-neutral producer discovers an unknown installed carrier without Framework lifecycle state', () => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-neutral-carrier-descriptor-'));
  const stateFixture = isolatedPackageEnv('neutral-carrier-descriptor');
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousBinary = process.env.OPL_CODEX_PLUGIN_BIN;
  process.env.OPL_STATE_DIR = stateFixture.env.OPL_STATE_DIR;
  process.env.OPL_CODEX_PLUGIN_BIN = path.join(stateFixture.home, 'fake-codex');
  fs.mkdirSync(path.join(sourceRoot, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(sourceRoot, '.codex-plugin', 'plugin.json'),
    formatJsonPayload({
      name: 'future-carrier-package',
      version: '9.1.0',
      description: 'A package from a future carrier.',
      skills: [],
    }),
  );
  try {
    const discovered = discoverInstalledPackageDescriptors({
      runner: () => ({
        status: 0,
        stdout: JSON.stringify({
          installed: [{
            pluginId: 'future-carrier-package@future-carrier',
            version: '9.1.0',
            enabled: true,
            source: { source: 'future-carrier', path: sourceRoot },
            marketplaceSource: { sourceType: 'future', source: 'future://catalog' },
          }],
        }),
        stderr: '',
        error: null,
      }),
    });
    const descriptor = discovered.get('future-carrier-package');
    assert.ok(descriptor);
    assert.equal(descriptor?.carrier_readback.kind, 'future-carrier');
    assert.equal(descriptor?.carrier_readback.lifecycle_authority, 'carrier_owned');
    assert.equal('rollback_ref' in descriptor.manifest, false);
    assert.equal('content_lock_paths' in descriptor.manifest, false);
    assert.equal(descriptor?.manifest.configured_codex_plugin_carrier?.carrier.pluginId, 'future-carrier-package@future-carrier');
    const directory = buildAgentPackageDirectory({
      detail: 'fast',
      installedCodexPluginDescriptors: discovered,
    });
    const entry = directory.entries.find((candidate) => candidate.package_id === 'future-carrier-package');
    assert.ok(entry);
    assert.equal(entry?.installed, true);
    assert.equal(entry?.source_explanation.kind, 'installed_codex_plugin_descriptor');
    assert.deepEqual(entry?.installed_readiness, {
      installed: true,
      physical_status: 'available',
      callability: 'callable',
    });
    assert.equal(entry?.installed_carrier_readback?.kind, 'future-carrier');
    assert.equal(Object.hasOwn(entry ?? {}, 'legacy_private_lifecycle_state_present'), false);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    if (previousBinary === undefined) delete process.env.OPL_CODEX_PLUGIN_BIN;
    else process.env.OPL_CODEX_PLUGIN_BIN = previousBinary;
    assert.equal(fs.existsSync(path.join(stateFixture.env.OPL_STATE_DIR, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateFixture.env.OPL_STATE_DIR, 'agent-package-lifecycle-ledger.json')), false);
    fs.rmSync(stateFixture.home, { recursive: true, force: true });
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test('native manifest fallback does not synthesize a second first-party Package authority', () => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-party-native-plugin-'));
  fs.mkdirSync(path.join(sourceRoot, '.codex-plugin'));
  fs.writeFileSync(
    path.join(sourceRoot, '.codex-plugin', 'plugin.json'),
    formatJsonPayload({
      name: 'redcube-ai',
      version: '0.2.9',
      description: 'Installed first-party carrier observation.',
    }),
  );
  const runner = () => ({
    status: 0,
    stdout: JSON.stringify({
      installed: [{
        pluginId: 'redcube-ai@redcube-ai',
        version: '0.2.9',
        enabled: true,
        installed: true,
        source: { source: 'local', path: sourceRoot },
        marketplaceSource: { sourceType: 'local', source: '/tmp/redcube-ai' },
      }],
    }),
    stderr: '',
    error: null,
  });
  try {
    assert.equal(discoverInstalledCodexPluginDescriptors({ runner }).size, 0);
    assert.equal(discoverInstalledCodexPluginDescriptors({ packageId: 'rca', runner }).size, 0);

    fs.writeFileSync(
      path.join(sourceRoot, 'opl-package.json'),
      formatJsonPayload({
        surface_kind: 'opl_agent_package_manifest.v1',
        kind: 'agent',
        agent_id: 'rca',
        package_id: 'rca',
        domain_id: 'redcube_ai',
        display_name: 'RedCube AI',
        publisher: 'one-person-lab',
        version: '0.2.9',
        source: 'first_party_repo_local',
        carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
        source_repo: 'https://github.com/gaofeng21cn/redcube-ai.git',
        schema_ref: 'one-person-lab/contracts/opl-framework/agent-package-manifest.schema.json',
        domain_descriptor_ref: 'contracts/domain_descriptor.json',
        task_provider_ref: 'contracts/domain_descriptor.json#/standard_agent_interface/stage_catalog',
        action_catalog_ref: 'contracts/action_catalog.json',
        view_refs: [],
        entrypoints: [{
          entrypoint_id: 'codex_primary_skill',
          entrypoint_kind: 'codex_skill',
          source_ref: 'agent/primary_skill/SKILL.md',
          carrier_ref: 'skills/redcube-ai/SKILL.md',
          authority: 'carrier_only_not_domain_truth',
        }],
        codex_surface: {
          plugin_id: 'redcube-ai',
          plugin_source_path: '.',
          required_skill_ids: ['redcube-ai'],
        },
        requires: [],
        capability_dependencies: [],
      }),
    );
    fs.mkdirSync(path.join(sourceRoot, '.codex-plugin'), { recursive: true });
    fs.writeFileSync(
      path.join(sourceRoot, '.codex-plugin', 'plugin.json'),
      formatJsonPayload({
        name: 'unknown-capability',
        version: '1.0.0',
        skills: './skills',
      }),
    );
    const generic = discoverInstalledCodexPluginDescriptors({ runner });
    const scoped = discoverInstalledCodexPluginDescriptors({ packageId: 'rca', runner });
    assert.deepEqual([...generic.keys()], ['rca']);
    assert.deepEqual([...scoped.keys()], ['rca']);
    assert.equal(scoped.get('rca')?.manifestPath, path.join(sourceRoot, 'opl-package.json'));
    assert.equal(scoped.get('rca')?.carrier.carrier.pluginId, 'redcube-ai@redcube-ai');
    assert.equal(scoped.get('rca')?.carrier_readback.lifecycle_authority, 'carrier_owned');
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test('invalid installed Codex descriptors degrade locally without hiding valid plugins', () => {
  const validRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-installed-plugin-valid-'));
  const invalidRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-installed-plugin-invalid-'));
  try {
    fs.writeFileSync(
      path.join(validRoot, 'opl-package.json'),
      formatJsonPayload(agentPackageManifest({
        packageId: 'valid.installed.agent',
        agentId: 'valid-installed-agent',
        pluginId: 'valid-installed-agent',
      })),
    );
    fs.writeFileSync(path.join(invalidRoot, 'opl-package.json'), '{"surface_kind":"unknown"}\n');
    const discovered = discoverInstalledCodexPluginDescriptors({
      runner: () => ({
        status: 0,
        stdout: JSON.stringify({
          installed: [
            {
              pluginId: 'invalid-installed-agent@owner-carrier',
              version: '1.0.0',
              enabled: true,
              installed: true,
              source: { source: 'local', path: invalidRoot },
            },
            {
              pluginId: 'valid-installed-agent@owner-carrier',
              version: '1.0.0',
              enabled: true,
              installed: true,
              source: { source: 'local', path: validRoot },
            },
          ],
        }),
        stderr: '',
        error: null,
      }),
    });
    assert.deepEqual([...discovered.keys()], ['valid.installed.agent']);
  } finally {
    fs.rmSync(validRoot, { recursive: true, force: true });
    fs.rmSync(invalidRoot, { recursive: true, force: true });
  }
});

test('real directory, status, and App state project an unknown installed Agent without legacy lifecycle state', () => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-installed-plugin-list-source-'));
  const stateFixture = isolatedPackageEnv('installed-plugin-list');
  const binary = path.join(stateFixture.home, 'fake-codex');
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousBinary = process.env.OPL_CODEX_PLUGIN_BIN;
  process.env.OPL_STATE_DIR = stateFixture.env.OPL_STATE_DIR;
  process.env.OPL_CODEX_PLUGIN_BIN = binary;
  try {
    const packageId = 'unknown.installed.agent.readback';
    const pluginId = 'unknown-installed-agent-readback';
    fs.writeFileSync(
      path.join(sourceRoot, 'opl-package.json'),
      formatJsonPayload(agentPackageManifest({
        packageId,
        agentId: pluginId,
        pluginId,
      })),
    );
    fs.mkdirSync(path.join(sourceRoot, 'skills', pluginId), { recursive: true });
    fs.writeFileSync(
      path.join(sourceRoot, 'skills', pluginId, 'SKILL.md'),
      '# Unknown installed Agent\n',
    );
    fs.mkdirSync(path.join(sourceRoot, '.codex-plugin'), { recursive: true });
    fs.writeFileSync(
      path.join(sourceRoot, '.codex-plugin', 'plugin.json'),
      formatJsonPayload({ name: pluginId, version: '1.2.3', skills: './skills' }),
    );
    fs.writeFileSync(binary, `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  installed: [{
    pluginId: '${pluginId}@owner-carrier',
    version: '1.2.3',
    installed: true,
    enabled: true,
    source: { source: 'future-carrier', path: ${JSON.stringify(sourceRoot)} },
    marketplaceSource: { sourceType: 'future', source: 'future://owner-carrier' }
  }]
}));
`);
    fs.chmodSync(binary, 0o755);
    const readback = listOplAgentPackages({ detail: 'fast' }).opl_agent_packages;
    const entry = readback.directory.entries.find((candidate) => candidate.package_id === packageId);
    assert.ok(entry);
    assert.equal(Object.hasOwn(readback, 'registry_cache'), false);
    assert.equal(entry?.installed, true);
    assert.equal(entry?.readiness.operational_ready, true);
    assert.equal(entry?.readiness.launch_allowed, true);
    assert.equal(entry?.source_explanation.kind, 'installed_codex_plugin_descriptor');
    assert.equal(entry?.configured_carrier?.status, 'installed');
    assert.equal(entry?.configured_carrier?.executor.status, 'callable');
    assert.equal(entry?.installed_carrier_readback?.kind, 'future-carrier');
    assert.deepEqual(
      entry?.available_actions.map((action) => action.action_id),
      ['agent_package_update', 'agent_package_repair', 'agent_package_preferences_set', 'agent_package_uninstall'],
    );
    const status = runOplAgentPackageStatus({ packageId, detail: 'fast' }).opl_agent_package_status;
    assert.equal(status.status, 'available', JSON.stringify(status, null, 2));
    assert.equal(status.installed_package_count, 1);
    assert.equal(status.operational_ready, true);
    assert.equal(status.launch_allowed, true);
    assert.equal(status.launch_blocked_reason, null);
    assert.equal(status.installed_carrier_readback?.kind, 'future-carrier');
    assert.deepEqual(status.installed_readiness, {
      installed: true,
      physical_status: 'available',
      callability: 'callable',
    });
    const appPackage = buildAppAgentPackageStatuses({
      packageIds: [packageId],
      profile: 'fast',
      readStatus: (input) => runOplAgentPackageStatus(input),
    })[packageId] as any;
    assert.equal(appPackage.status, 'available');
    assert.equal(appPackage.operational_ready, true);
    assert.equal(appPackage.launch_allowed, true);
    assert.equal(appPackage.launch_blocked_reason, null);
    assert.equal(appPackage.currentness_detail_deferred, undefined);
    assert.equal(fs.existsSync(path.join(stateFixture.env.OPL_STATE_DIR, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateFixture.env.OPL_STATE_DIR, 'agent-package-lifecycle-ledger.json')), false);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    if (previousBinary === undefined) delete process.env.OPL_CODEX_PLUGIN_BIN;
    else process.env.OPL_CODEX_PLUGIN_BIN = previousBinary;
    fs.rmSync(stateFixture.home, { recursive: true, force: true });
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

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

async function withIsolatedStateDir<T>(prefix: string, run: () => T | Promise<T>): Promise<T> {
  const fixture = isolatedPackageEnv(prefix);
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = fixture.env.OPL_STATE_DIR;
    return await run();
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
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

const thirdPartyPresentation = {
  display_name_i18n: {
    'zh-CN': '未来研究代理',
    'en-US': 'Future Research Agent',
  },
  description_i18n: {
    'zh-CN': '从所有者清单投影的研究代理。',
    'en-US': 'Research Agent projected from its owner manifest.',
  },
  session_routing_summary_i18n: {
    'zh-CN': '启动新的研究会话。',
    'en-US': 'Start a new research session.',
  },
  home_shortcuts: [{
    shortcut_id: 'future-main',
    label_i18n: {
      'zh-CN': '开始研究',
      'en-US': 'Start Research',
    },
    default_visible: true,
    user_configurable: true,
    route: {
      route_kind: 'agent_package_shortcut',
      executor: 'codex_cli',
      codex_visible_entry: 'future-agent',
    },
  }],
};

const relayAppContributions = {
  schema_version: 'opl-app-contributions.v1',
  navigation: [{
    navigation_id: 'relay.inbox-nav',
    label_i18n: {
      'zh-CN': '收件箱',
      'en-US': 'Inbox',
    },
    view_id: 'relay.inbox',
    icon_id: 'mail',
    sort_order: 100,
  }],
  views: [{
    view_id: 'relay.inbox',
    view_type: 'list_detail',
    title_i18n: {
      'zh-CN': '收件箱',
      'en-US': 'Inbox',
    },
    data_ref: 'communications.mail.v1#inbox',
    command_ids: ['relay.compose'],
    badge_ids: ['relay.unread'],
  }],
  commands: [{
    command_id: 'relay.compose',
    label_i18n: {
      'zh-CN': '新建草稿',
      'en-US': 'New draft',
    },
    action_ref: 'communications.mail.v1#draft-create',
    confirmation_required: false,
  }],
  badges: [{
    badge_id: 'relay.unread',
    label_i18n: {
      'zh-CN': '未读',
      'en-US': 'Unread',
    },
    data_ref: 'communications.mail.v1#unread-count',
    tone: 'info',
  }],
} as const;

const HOME_PRESENTATION_CROSS_FIXTURE_SHA256 = 'b9986890f5af0d0004caad41b8bfd244e2fab7a7aa43ed98c9d5a7644221d8bf';
const homePresentationCrossFixture = `{
  "package_id": "future.agent-lab",
  "package_role": "standard_agent",
  "installed": true,
  "display_name": "Future Agent Lab",
  "description": "Generic directory description.",
  "display_name_i18n": {
    "zh-CN": "未来智能体实验室",
    "en-US": "Future Agent Lab"
  },
  "description_i18n": {
    "zh-CN": "由所有者清单投影的动态智能体。",
    "en-US": "A dynamic Agent projected from its owner manifest."
  },
  "session_routing_summary_i18n": {
    "zh-CN": "启动未来研究会话。",
    "en-US": "Start a future research session."
  },
  "home_shortcuts": [
    {
      "shortcut_id": "future-main",
      "label_i18n": {
        "zh-CN": "开始未来研究",
        "en-US": "Start Future Research"
      },
      "default_visible": true,
      "user_configurable": true,
      "route": {
        "route_kind": "agent_package_shortcut",
        "executor": "codex_cli",
        "codex_visible_entry": "future-agent"
      }
    },
    {
      "shortcut_id": "future-pinned",
      "label_i18n": {
        "zh-CN": "固定未来入口",
        "en-US": "Pinned Future Entry"
      },
      "default_visible": true,
      "user_configurable": false,
      "route": {
        "route_kind": "agent_package_shortcut",
        "executor": "codex_cli",
        "codex_visible_entry": "future-agent-pinned"
      }
    }
  ]
}
`;

test('Framework freezes the Shell Home public directory entry fixture bytes', () => {
  assert.equal(crypto.createHash('sha256').update(homePresentationCrossFixture).digest('hex'), HOME_PRESENTATION_CROSS_FIXTURE_SHA256);
  const entry = parseJsonText(homePresentationCrossFixture) as Record<string, unknown>;
  assert.equal(Object.hasOwn(entry, 'presentation'), false);
  assert.deepEqual(Object.keys(entry).filter((key) => key.endsWith('_i18n') || key === 'home_shortcuts'), [
    'display_name_i18n',
    'description_i18n',
    'session_routing_summary_i18n',
    'home_shortcuts',
  ]);
});

test('owner descriptor contributions normalize and project through an installed carrier', () =>
  withIsolatedStateDir('opl-app-contribution-descriptor', () => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-contribution-descriptor-'));
  const manifest = {
    ...agentPackageManifest({
      packageId: 'third.party.contribution',
      agentId: 'third-party-contribution',
      pluginId: 'third-party-contribution',
    }),
    app_contributions: relayAppContributions,
  };
  try {
    const agentSchemaManifest = {
      ...(parseJsonText(fs.readFileSync(
        path.join(repoRoot, 'contracts/opl-framework/packages/mas.json'),
        'utf8',
      )) as Record<string, unknown>),
      app_contributions: relayAppContributions,
    };
    const schemaCases = [
      {
        schemaRef: 'contracts/opl-framework/agent-package-manifest.schema.json',
        schemaId: 'opl.agent_package_manifest.app_contributions.v1',
        payload: agentSchemaManifest,
      },
      {
        schemaRef: 'contracts/opl-framework/capability-package-manifest.schema.json',
        schemaId: 'opl.capability_package_manifest.app_contributions.v1',
        payload: {
          ...(parseJsonText(fs.readFileSync(
            path.join(repoRoot, 'contracts/opl-framework/packages/mas-scholar-skills.json'),
            'utf8',
          )) as Record<string, unknown>),
          app_contributions: relayAppContributions,
        },
      },
      {
        schemaRef: 'contracts/opl-framework/workflow-profile-package-manifest.schema.json',
        schemaId: 'opl.workflow_profile_package_manifest.app_contributions.v1',
        payload: {
          ...(parseJsonText(fs.readFileSync(
            path.join(repoRoot, 'contracts/opl-framework/packages/opl-flow.json'),
            'utf8',
          )) as Record<string, unknown>),
          app_contributions: relayAppContributions,
        },
      },
    ];
    for (const schemaCase of schemaCases) {
      const schema = parseJsonText(fs.readFileSync(
        path.join(repoRoot, schemaCase.schemaRef),
        'utf8',
      )) as Parameters<typeof validateJsonSchemaPayload>[0]['schema'];
      assert.equal(validateJsonSchemaPayload({
        schemaId: schemaCase.schemaId,
        schema,
        sourceRef: schemaCase.schemaRef,
      }, schemaCase.payload).ok, true, schemaCase.schemaRef);
    }
    assert.deepEqual(
      normalizePackageManifest(manifest, 'file:///tmp/contribution-package.json').app_contributions,
      relayAppContributions,
    );
    for (const [payload, message] of [
      [{
        ...manifest,
        app_contributions: {
          ...relayAppContributions,
          views: [{ ...relayAppContributions.views[0], component_path: './Unsafe.tsx' }],
        },
      }, 'unsupported fields'],
      [{
        ...manifest,
        app_contributions: {
          ...relayAppContributions,
          views: [{ ...relayAppContributions.views[0], view_type: 'arbitrary_react_component' }],
        },
      }, 'view_type is unsupported'],
      [{
        ...manifest,
        app_contributions: {
          ...relayAppContributions,
          navigation: [{ ...relayAppContributions.navigation[0], view_id: 'missing.view' }],
        },
      }, 'references must resolve'],
    ] as const) {
      assert.throws(
        () => normalizePackageManifest(payload, 'file:///tmp/invalid-contribution.json'),
        (error: unknown) => error instanceof Error && error.message.includes(message),
      );
    }

    fs.writeFileSync(path.join(sourceRoot, 'opl-package.json'), formatJsonPayload(manifest));
    const discovered = discoverInstalledCodexPluginDescriptors({
      runner: () => ({
        status: 0,
        stdout: JSON.stringify({
          installed: [{
            pluginId: 'third-party-contribution@owner-carrier',
            version: '1.2.3',
            installed: true,
            enabled: true,
            source: { source: 'local', path: sourceRoot },
            marketplaceSource: { sourceType: 'local', source: '/tmp/contribution-owner' },
          }],
        }),
        stderr: '',
        error: null,
      }),
    });
    const entry = buildAgentPackageDirectory({
      detail: 'fast',
      installedCodexPluginDescriptors: discovered,
    }).entries.find((candidate) => candidate.package_id === 'third.party.contribution');
    assert.deepEqual(entry?.app_contributions, relayAppContributions);
    assert.equal(entry?.source_explanation.kind, 'installed_codex_plugin_descriptor');
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
  }));

test('external registry selectors reject forged claims and never become a directory cache', async () => {
  const fixture = isolatedPackageEnv('opl-package-external-selector');
  const registryPath = path.join(fixture.home, 'registry.json');
  const manifestPath = path.join(fixture.home, 'manifest.json');
  const manifestUrl = pathToFileURL(manifestPath).href;
  const registryUrl = pathToFileURL(registryPath).href;
  const writeRegistry = (entry: Record<string, unknown>) => {
    fs.writeFileSync(registryPath, formatJsonPayload({ registry_id: 'external-selector', entries: [entry] }));
  };
  const writeCatalog = (packageId: string) => {
    const manifest = agentPackageManifest({ packageId });
    fs.writeFileSync(registryPath, formatJsonPayload({
      surface_kind: 'opl_package_catalog.v1',
      packages: {
        package_catalog: {
          [packageId]: {
            package_id: packageId,
            package_role: 'standard_agent',
            source: 'third_party',
            trust_tier: 'third_party_verified',
            selected_version: '1.2.3',
            versions: [{
              package_version: '1.2.3',
              selection_status: 'selected_for_owner_channel',
              manifest_url: manifestUrl,
              manifest_json: formatJsonPayload(manifest),
            }],
          },
        },
      },
    }));
  };
  try {
    fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest()));
    const valid = registryPayload(manifestUrl).entries[0];
    writeRegistry({ ...valid, source: 'organization_registry', trust_tier: 'organization_verified' });
    const selected = await fetchAndValidateRegistry(registryUrl);
    assert.equal(selected.document.entries[0].package_id, 'third.party.research');
    assert.equal(selected.document.entries[0].source, 'organization_registry');

    writeCatalog('third.party.catalog');
    const catalog = await fetchAndValidateRegistry(registryUrl);
    assert.deepEqual(catalog.document.entries.map((entry) => ({
      package_id: entry.package_id,
      package_role: entry.package_role,
      source: entry.source,
      trust_tier: entry.trust_tier,
      selected_version: entry.selected_version,
    })), [{
      package_id: 'third.party.catalog',
      package_role: 'standard_agent',
      source: 'third_party',
      trust_tier: 'third_party_verified',
      selected_version: '1.2.3',
    }]);
    writeCatalog('mas');
    await assert.rejects(fetchAndValidateRegistry(registryUrl));

    for (const field of ['source', 'trust_tier'] as const) {
      const missing = { ...valid } as Record<string, unknown>;
      delete missing[field];
      writeRegistry(missing);
      await assert.rejects(fetchAndValidateRegistry(registryUrl));
    }
    for (const forged of [
      { ...valid, package_id: 'mas' },
      { ...valid, source: 'first_party_release_catalog' },
      { ...valid, trust_tier: 'first_party' },
    ]) {
      writeRegistry(forged);
      await assert.rejects(fetchAndValidateRegistry(registryUrl));
    }

    fs.mkdirSync(fixture.env.OPL_STATE_DIR, { recursive: true });
    fs.writeFileSync(path.join(fixture.env.OPL_STATE_DIR, 'agent-package-registry-cache.json'), formatJsonPayload({
      surface_kind: 'opl_agent_package_registry_cache',
      entries: [{ ...valid, package_id: 'attacker.cache-only' }],
    }));
    const list = runCli(['packages', 'list'], fixture.env) as any;
    assert.equal(Object.hasOwn(list.opl_agent_packages, 'registry_cache'), false);
    assert.equal(list.opl_agent_packages.directory.entries.some((entry: any) => entry.package_id === 'attacker.cache-only'), false);
    const app = runCli(['app', 'state', '--profile', 'fast'], fixture.env) as any;
    assert.equal(Object.hasOwn(app.app_state.agent_packages, 'registry_cache'), false);
    assert.equal(
      app.app_state.agent_packages.directory.entries.some((entry: any) => entry.package_id === 'attacker.cache-only'),
      false,
    );
    writeRegistry({ ...valid, package_id: 'mas' });
    const failure = runCliFailure([
      'packages', 'install', '--registry-url', registryUrl, '--package-id', 'mas',
    ], fixture.env);
    assert.equal(failure.payload.error.details.failure_code, 'first_party_package_explicit_source_forbidden');
    assert.equal(fs.existsSync(path.join(fixture.env.OPL_STATE_DIR, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(fixture.env.OPL_STATE_DIR, 'agent-package-lifecycle-ledger.json')), false);
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('ordinary directory accepts an owner-channel selected catalog version', () => {
  const manifest = agentPackageManifest({ packageId: 'third.party.owner-channel' });
  const manifestJson = formatJsonPayload(manifest);
  const normalized = normalizePackageCatalogDocument({
    surface_kind: 'opl_package_catalog.v1',
    packages: {
      package_catalog: {
        'third.party.owner-channel': {
          package_id: 'third.party.owner-channel',
          package_role: 'standard_agent',
          source: 'third_party',
          trust_tier: 'third_party_verified',
          selected_version: '1.2.3',
          versions: [{
            package_version: '1.2.3',
            selection_status: 'selected_for_owner_channel',
            manifest_url: 'file:///tmp/owner-channel.json',
            manifest_json: manifestJson,
          }],
        },
      },
    },
  }, 'file:///tmp/owner-channel-catalog.json', 'catalog-sha');
  assert.equal(normalized.entries[0].selected_version, '1.2.3');
});


test('ordinary list, status, App, and Home surfaces ignore retired Release Catalog cache files', () => {
  const fixture = isolatedPackageEnv('opl-package-directory');
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
exit 1
`);
  const previousStateDir = process.env.OPL_STATE_DIR;
  const cacheFile = path.join(
    fixture.env.OPL_STATE_DIR,
    'agent-package-release-catalog-cache.json',
  );
  const packageCatalog = Object.fromEntries(getOplPackageSpecs().map((spec) => {
    const manifest = parseJsonText(
      fs.readFileSync(path.join(repoRoot, spec.package_manifest_ref), 'utf8'),
    ) as Record<string, unknown>;
    const version = String(manifest.version);
    const manifestJson = formatJsonPayload({
      ...manifest,
      ...(spec.package_id === 'mas' ? { presentation: thirdPartyPresentation } : {}),
    });
    const sourceArtifactRef =
      `ghcr.io/fixture/one-person-lab-packages/${spec.package_id}:${version}`;
    return [spec.package_id, {
      package_id: spec.package_id,
      package_role: spec.package_role,
      selected_version: version,
      versions: [{
        package_version: version,
        selection_status: 'selected_for_release_set',
        manifest_url: `opl+oci://${sourceArtifactRef}#/package-manifest.json`,
        manifest_sha256: `sha256:${crypto.createHash('sha256').update(manifestJson).digest('hex')}`,
        manifest_json: manifestJson,
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
      }],
    }];
  }));
  const catalogPayload = {
    surface_kind: 'opl_package_catalog.v1',
    packages: { package_catalog: packageCatalog },
  };
  const appEnv = {
    ...fixture.env,
    OPL_MODULES_ROOT: path.join(fixture.home, 'opl-state', 'modules'),
    OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
    OPL_DEVELOPER_MODE_GH_BINARY: path.join(fixture.home, 'missing-gh'),
    PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
  };
  const homeShortcutPreferenceSnapshot = (preferences: any[]) => preferences.map(
    ({ updated_at: _updatedAt, ...preference }) => preference,
  );
  const readOrdinarySurfaces = () => {
    const list = runCli(['packages', 'list'], fixture.env) as any;
    const status = runCli(
      ['packages', 'status', '--package-id', 'mas'],
      fixture.env,
    ) as any;
    const app = Object.fromEntries((['fast', 'full'] as const).map((profile) => {
      const state = runCli(['app', 'state', '--profile', profile], appEnv) as any;
      const agentPackages = state.app_state.agent_packages;
      return [profile, {
        directory: agentPackages.directory,
        package_home_shortcut_preferences: Object.fromEntries(
          Object.entries(agentPackages.status_index.packages).map(([packageId, entry]: [string, any]) => [
            packageId,
            homeShortcutPreferenceSnapshot(entry.home_shortcut_preferences),
          ]),
        ),
        home_shortcut_preferences: homeShortcutPreferenceSnapshot(
          agentPackages.status_index.home_shortcut_preferences,
        ),
      }];
    }));
    return {
      list_directory: list.opl_agent_packages.directory,
      list_home_shortcut_preferences: homeShortcutPreferenceSnapshot(
        list.opl_agent_packages.home_shortcut_preferences,
      ),
      status_home_shortcut_preferences: homeShortcutPreferenceSnapshot(
        status.opl_agent_package_status.home_shortcut_preferences,
      ),
      app,
    };
  };
  try {
    fs.mkdirSync(fixture.env.OPL_STATE_DIR, { recursive: true });
    process.env.OPL_STATE_DIR = fixture.env.OPL_STATE_DIR;
    const baseline = readOrdinarySurfaces();
    const directory = baseline.list_directory;
    assert.equal(directory.surface_kind, 'opl_agent_package_directory.v1');
    assert.equal(directory.entry_count, CANONICAL_PACKAGE_IDS.length);
    assert.equal(directory.installed_package_count, 0);
    assert.equal(directory.installable_package_count, CANONICAL_PACKAGE_IDS.length);
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
    const mas = directory.entries.find((entry: any) => entry.package_id === 'mas');
    assert.deepEqual(mas.capability_metadata, {
      source: 'normalized_owner_manifest',
      required_skill_ids: ['med-autoscience'],
      optional_skill_refs: [],
    });
    assert.equal(flow.package_role, 'workflow_profile');
    assert.equal(flow.capability_metadata, null);
    assert.equal(flow.projected_version, '0.1.42');
    assert.equal(flow.selected_version, null);
    assert.equal(flow.stable_version, null);
    assert.equal(flow.source_explanation.kind, 'first_party_framework_projection');
    assert.equal(flow.version_currentness.status, 'framework_projection_only');
    assert.equal(flow.version_currentness.live_verified, false);
    assert.equal(directory.source_catalog_kind, 'opl_framework_package_projection+installed_descriptor');
    assert.equal(directory.first_party_owner_currentness.status, 'not_requested');
    assert.equal(directory.first_party_owner_currentness.channel_kind, 'per_package_owner_oci_latest_stable');
    assert.equal(Object.hasOwn(directory, 'first_party_release_currentness'), false);
    assert.equal(scholarSkills.package_role, 'capability_package');
    assert.equal(scholarSkills.capability_metadata, null);
    assert.deepEqual(
      baseline.list_home_shortcut_preferences
        .map((preference: any) => preference.package_id)
        .sort(),
      ['mag', 'mas', 'obf', 'oma', 'rca'],
    );
    assert.deepEqual(baseline.status_home_shortcut_preferences, [{
      shortcut_id: 'research',
      package_id: 'mas',
      visible: true,
      sort_order: 200,
      source: 'default',
      installed: false,
    }]);

    for (const [cacheCase, checkedAt] of [
      ['valid', new Date().toISOString()],
      ['stale', '2000-01-01T00:00:00.000Z'],
      ['future', '2999-01-01T00:00:00.000Z'],
      ['poisoned', null],
    ] as const) {
      fs.writeFileSync(cacheFile, cacheCase === 'poisoned'
        ? '{not-json'
        : formatJsonPayload({
          surface_kind: 'opl_agent_package_release_catalog_cache.v1',
          catalog_ref: 'ghcr.io/fixture/one-person-lab-manifest:latest-stable',
          catalog_digest: `sha256:${'a'.repeat(64)}`,
          checked_at: checkedAt,
          catalog_payload: catalogPayload,
        }));
      const actual = readOrdinarySurfaces();
      assert.deepEqual(actual, baseline, `${cacheCase} Release Catalog cache changed ordinary read models`);
      for (const profile of ['fast', 'full'] as const) {
        const projected = actual.app[profile].directory;
        assert.equal(projected.surface_kind, 'opl_agent_package_directory.v1');
        assert.equal(projected.detail, profile);
        assert.equal(projected.entries.length, CANONICAL_PACKAGE_IDS.length);
        assert.equal(projected.first_party_owner_currentness.status, 'not_requested');
        assert.equal(Object.hasOwn(projected, 'first_party_release_currentness'), false);
        assert.equal(projected.entries.every((entry: any) =>
          entry.package_id && entry.package_role && entry.installability && entry.recommended_action), true);
        assert.equal('directory' in projected, false);
        assert.deepEqual(
          Object.values(actual.app[profile].package_home_shortcut_preferences)
            .flatMap((preferences: any) => preferences)
            .map((preference: any) => preference.package_id)
            .sort(),
          ['mag', 'mas', 'obf', 'oma', 'rca'],
        );
        assert.deepEqual(
          actual.app[profile].home_shortcut_preferences
            .map((preference: any) => preference.package_id)
            .sort(),
          ['mag', 'mas', 'obf', 'oma', 'rca'],
        );
      }
    }
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});

test('Developer Mode selects every available first-party Package checkout', () => {
  const fixture = isolatedPackageEnv('opl-package-directory-developer-policy');
  const workspace = path.join(fixture.home, 'workspace');
  const repoNames = getOplPackageSpecs().map((spec) => spec.repo_name);
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

test('static owner presentation comes only from the Framework identity projection', () =>
  withIsolatedStateDir('opl-package-directory-static-owner-presentation', () => {
  const staticDirectory = buildAgentPackageDirectory({
    detail: 'fast',
  });
  for (const packageId of ['mag', 'rca', 'obf']) {
    const sourceManifest = parseJsonText(fs.readFileSync(
      path.join(repoRoot, `contracts/opl-framework/packages/${packageId}.json`),
      'utf8',
    )) as Record<string, any>;
    const entry = staticDirectory.entries.find((candidate) => candidate.package_id === packageId)!;
    assert.deepEqual(entry.display_name_i18n, sourceManifest.presentation.display_name_i18n);
    assert.deepEqual(entry.description_i18n, sourceManifest.presentation.description_i18n);
    assert.deepEqual(entry.session_routing_summary_i18n, sourceManifest.presentation.session_routing_summary_i18n);
    assert.deepEqual(entry.home_shortcuts, sourceManifest.presentation.home_shortcuts);
    assert.equal(Object.hasOwn(entry, 'presentation'), false);
  }

  }));

test('static Relay projection uses native readback as installed truth', () =>
  withIsolatedStateDir('opl-package-directory-static-relay', () => {
  const nativeNotInstalled = {
    surface_kind: 'opl_configured_codex_plugin_carrier_readback.v1',
    package_id: 'opl-relay',
    carrier: {
      kind: 'codex_plugin_manager',
      plugin_id: 'opl-relay@opl-relay',
      marketplace_source: 'gaofeng21cn/opl-relay',
      observed_sources: [],
      precedence: 'not_present',
    },
    executor: {
      route: 'codex_cli',
      required_skill_ids: ['opl-relay'],
      status: 'attention_needed',
    },
    publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/opl-relay:latest-stable',
    status: 'not_installed',
    operation: 'list',
    installed_version: null,
    enabled: null,
    plugin_source_path: null,
    reason: 'native_carrier_reports_not_installed',
  } as any;
  const directory = buildAgentPackageDirectory({
    detail: 'fast',
    configuredCarrierReadbacks: new Map([['opl-relay', nativeNotInstalled]]),
  });
  const entry = directory.entries.find((candidate) => candidate.package_id === 'opl-relay')!;
  assert.equal(entry.source_explanation.kind, 'first_party_framework_projection');
  assert.equal(entry.configured_carrier?.status, 'not_installed');
  assert.equal(entry.installed, false);
  assert.equal(entry.installed_version, null);
  assert.deepEqual(
    entry.available_actions.map((action) => action.action_id),
    ['install_from_manifest_url'],
  );
  assert.equal(entry.recommended_action, 'install_from_manifest_url');
  }));

test('legacy v1 Release Set cache file cannot restore ordinary directory currentness', () => {
  const fixture = isolatedPackageEnv('opl-package-directory-legacy-release-cache');
  const previousStateDir = process.env.OPL_STATE_DIR;
  const packageCatalog = {};
  const catalogPayload = {
    surface_kind: 'opl_package_catalog.v1',
    packages: { package_catalog: packageCatalog },
  };
  const legacyLayerDigest = `sha256:${'a'.repeat(64)}`;
  try {
    process.env.OPL_STATE_DIR = fixture.env.OPL_STATE_DIR;
    fs.mkdirSync(fixture.env.OPL_STATE_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(fixture.env.OPL_STATE_DIR, 'agent-package-release-catalog-cache.json'),
      formatJsonPayload({
        surface_kind: 'opl_agent_package_release_catalog_cache.v1',
        catalog_ref: 'ghcr.io/fixture/one-person-lab-manifest:latest-stable',
        catalog_digest: legacyLayerDigest,
        checked_at: '2000-01-01T00:00:00.000Z',
        catalog_payload: catalogPayload,
      }),
    );
    const directory = listOplAgentPackages().opl_agent_packages.directory;
    assert.equal(directory.first_party_owner_currentness.status, 'not_requested');
    assert.equal(Object.hasOwn(directory, 'first_party_release_currentness'), false);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});


test('invalid owner presentation fails closed while legacy manifests remain compatible', () => {
  const base = agentPackageManifest();
  assert.equal(normalizePackageCatalogDocument({
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
            manifest_url: 'file:///tmp/legacy.json',
            manifest_json: formatJsonPayload(base),
          }],
        },
      },
    },
  }, 'file:///tmp/legacy-catalog.json', 'catalog-sha').entries[0].presentation, null);

  assert.throws(() => normalizePackageCatalogDocument({
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
            manifest_url: 'file:///tmp/invalid-presentation.json',
            manifest_json: formatJsonPayload({
              ...base,
              presentation: {
                ...thirdPartyPresentation,
                home_shortcuts: [
                  ...thirdPartyPresentation.home_shortcuts,
                  thirdPartyPresentation.home_shortcuts[0],
                ],
              },
            }),
          }],
        },
      },
    },
  }, 'file:///tmp/invalid-presentation-catalog.json', 'catalog-sha'),
  (error: any) => error?.details?.failure_code === 'agent_package_presentation_invalid');
});

test('ordinary list ignores a legacy-only lock without rewriting its bytes', () => {
  const fixture = isolatedPackageEnv('opl-package-directory-scope');
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousHome = process.env.HOME;
  const previousCodexHome = process.env.CODEX_HOME;
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
  try {
    process.env.OPL_STATE_DIR = fixture.env.OPL_STATE_DIR;
    process.env.HOME = fixture.env.HOME;
    process.env.CODEX_HOME = fixture.env.CODEX_HOME;
    fs.mkdirSync(fixture.env.OPL_STATE_DIR, { recursive: true });
    const lockPath = path.join(fixture.env.OPL_STATE_DIR, 'agent-package-locks.json');
    const lockBytes = formatJsonPayload({
      surface_kind: 'opl_agent_package_lock_index',
      version: 'opl-agent-package-lock-index.v1',
      packages: [lock],
    });
    fs.writeFileSync(lockPath, lockBytes);
    for (const input of [
      { detail: 'fast' as const },
      { detail: 'fast' as const, statusContext: () => ({}) },
      {
        detail: 'fast' as const,
        statusContext: () => ({ scope: 'workspace' as const, targetWorkspace: workspace }),
      },
    ]) {
      const readback = listOplAgentPackages(input).opl_agent_packages;
      assert.equal(readback.status, 'available');
      assert.equal(readback.directory.entries.some((entry) => entry.package_id === lock.package_id), false);
      assert.equal(readback.installed_package_count, 0);
      assert.equal(Object.hasOwn(readback, 'installed_packages'), false);
      assert.equal(fs.readFileSync(lockPath, 'utf8'), lockBytes);
    }
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
});
