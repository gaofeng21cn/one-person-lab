import http from 'node:http';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';

import { assert, fs, os, path, runCli, runCliAsync, runCliFailure, test } from '../helpers.ts';
import { formatJsonPayload, parseJsonText } from '../../../../src/kernel/json-file.ts';

function createPluginSourceFixture(input: { includeRequiredSkill?: boolean } = {}) {
  const pluginSourcePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-plugin-source-'));
  fs.mkdirSync(path.join(pluginSourcePath, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginSourcePath, '.codex-plugin', 'plugin.json'),
    formatJsonPayload({
      name: 'third-party-research',
      version: '1.2.3',
      displayName: 'Third Party Research',
      description: 'Fixture third-party OPL agent package plugin.',
    }),
    'utf8',
  );
  if (input.includeRequiredSkill !== false) {
    fs.mkdirSync(path.join(pluginSourcePath, 'skills', 'third-party-research'), { recursive: true });
    fs.writeFileSync(
      path.join(pluginSourcePath, 'skills', 'third-party-research', 'SKILL.md'),
      '# Third Party Research\n\nUse for fixture package materialization tests.\n',
      'utf8',
    );
  }
  return pluginSourcePath;
}

function sha256Fixture(value: string) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function remotePayloadManifest() {
  const pluginJson = formatJsonPayload({
    name: 'third-party-research',
    version: '1.2.3',
    displayName: 'Third Party Research',
    description: 'Fixture third-party OPL agent package plugin.',
  });
  const skillMarkdown = '# Third Party Research\n\nUse for fixture package materialization tests.\n';
  return {
    surface_kind: 'opl_agent_package_payload_manifest',
    files: [
      {
        path: '.codex-plugin/plugin.json',
        content_utf8: pluginJson,
        sha256: sha256Fixture(pluginJson),
      },
      {
        path: 'skills/third-party-research/SKILL.md',
        content_utf8: skillMarkdown,
        sha256: sha256Fixture(skillMarkdown),
      },
    ],
  };
}

function agentPackageManifest(input: {
  pluginSourcePath?: string;
  pluginPayloadManifestUrl?: string;
  packageId?: string;
  agentId?: string;
} = {}) {
  return {
    package_id: input.packageId ?? 'third.party.research',
    agent_id: input.agentId ?? 'third-party-research',
    display_name: 'Third Party Research',
    publisher: 'example-org',
    version: '1.2.3',
    source: 'third_party',
    codex_surface: {
      plugin_ids: ['third-party-research'],
      required_skill_ids: ['third-party-research'],
      optional_skill_ids: ['officecli-docx'],
      ...(input.pluginSourcePath ? { plugin_source_path: input.pluginSourcePath } : {}),
      ...(input.pluginPayloadManifestUrl ? { plugin_payload_manifest_url: input.pluginPayloadManifestUrl } : {}),
    },
    skill_packs: [
      {
        id: 'third-party-research-required-skills',
        source: 'github:example/third-party-research-skills',
        version: '1.2.3',
        lock_sha: 'sha256:fixture',
        install_mode: 'bundled_required',
      },
    ],
    entrypoints: [
      {
        shortcut_id: 'research',
        label: 'Research',
        required_skill_ids: ['third-party-research'],
        shortcut_eligible: true,
      },
    ],
    health_check: {
      kind: 'opl_package_receipt',
      required_surfaces: ['plugin_registry', 'required_skill_ids'],
    },
    permissions: [],
    update_channel: 'manifest_url',
    rollback_ref: 'package-receipt-ref:previous',
  };
}

function registryPayload(baseUrl: string, input: { packageId?: string } = {}) {
  return {
    registry_id: 'test-agent-registry',
    discovery_only: true,
    install_authority_allowed: false,
    entries: [
      {
        package_id: input.packageId ?? 'third.party.research',
        display_name: 'Third Party Research',
        publisher: 'example-org',
        source: 'third_party',
        manifest_url: `${baseUrl}/manifest.json`,
        latest_version: '1.2.3',
        trust_tier: 'third_party_verified',
        codex_visible_entry: 'third-party-research',
        required_skill_ids: ['third-party-research'],
        optional_skill_ids: ['officecli-docx'],
        home_shortcut_ids: ['research'],
        display_policy: 'refs_only_no_domain_verdict',
      },
    ],
  };
}

async function withAgentPackageServer(
  run: (baseUrl: string) => Promise<void>,
  manifest = agentPackageManifest(),
) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/manifest.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(formatJsonPayload(manifest));
      return;
    }
    if (url.pathname === '/registry.json') {
      const address = server.address();
      assert.equal(typeof address, 'object');
      const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(formatJsonPayload(registryPayload(baseUrl, { packageId: manifest.package_id })));
      return;
    }
    if (url.pathname === '/payload.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(formatJsonPayload(remotePayloadManifest()));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(formatJsonPayload({ error: 'not_found' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.equal(typeof address, 'object');
  const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function withRemotePayloadAgentPackageServer(run: (baseUrl: string) => Promise<void>) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const address = server.address();
    assert.equal(typeof address, 'object');
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
    if (url.pathname === '/manifest.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(formatJsonPayload(agentPackageManifest({
        pluginPayloadManifestUrl: `${baseUrl}/payload.json`,
      })));
      return;
    }
    if (url.pathname === '/registry.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(formatJsonPayload(registryPayload(baseUrl)));
      return;
    }
    if (url.pathname === '/payload.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(formatJsonPayload(remotePayloadManifest()));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(formatJsonPayload({ error: 'not_found' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.equal(typeof address, 'object');
  const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test('connect agent-packages fetches registry URL, validates manifest, and writes lock receipt', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-packages-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-packages-home-'));
  const codexHome = path.join(homeDir, '.codex');
  const pluginSourcePath = createPluginSourceFixture();
  const env = {
    OPL_STATE_DIR: stateDir,
    HOME: homeDir,
    CODEX_HOME: codexHome,
  };
  try {
    await withAgentPackageServer(async (baseUrl) => {
      const registryUrl = `${baseUrl}/registry.json`;
      const refresh = await runCliAsync([
        'connect',
        'agent-packages',
        'registry',
        'refresh',
        '--registry-url',
        registryUrl,
      ], env) as {
        opl_agent_package_registry: {
          status: string;
          registry_url: string;
          entry_count: number;
          cache_file: string;
          lifecycle_receipt: {
            action: string;
            writes_performed: boolean;
            authority_boundary: { can_write_domain_truth: boolean };
          };
        };
      };

      assert.equal(refresh.opl_agent_package_registry.status, 'refreshed');
      assert.equal(refresh.opl_agent_package_registry.registry_url, registryUrl);
      assert.equal(refresh.opl_agent_package_registry.entry_count, 1);
      assert.equal(refresh.opl_agent_package_registry.lifecycle_receipt.action, 'registry_refresh');
      assert.equal(refresh.opl_agent_package_registry.lifecycle_receipt.writes_performed, true);
      assert.equal(refresh.opl_agent_package_registry.lifecycle_receipt.authority_boundary.can_write_domain_truth, false);
      assert.equal(fs.existsSync(refresh.opl_agent_package_registry.cache_file), true);

      const validated = await runCliAsync([
        'connect',
        'agent-packages',
        'validate-manifest',
        '--registry-url',
        registryUrl,
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_manifest: {
          status: string;
          package_id: string;
          owner_route_readback: {
            owner_route: { readback_ref: string; package_manager_claim: boolean };
            packages: Array<{
              descriptor: { manifest_url: string; manifest_sha256: string; registry_url: string | null };
            }>;
            no_package_manager_boundary: { package_manager_claim: boolean };
          };
          lifecycle_receipt: {
            action: string;
            writes_performed: boolean;
          };
        };
      };

      assert.equal(validated.opl_agent_package_manifest.status, 'valid');
      assert.equal(validated.opl_agent_package_manifest.package_id, 'third.party.research');
      assert.equal(validated.opl_agent_package_manifest.lifecycle_receipt.action, 'manifest_validate');
      assert.equal(validated.opl_agent_package_manifest.lifecycle_receipt.writes_performed, true);
      assert.equal(validated.opl_agent_package_manifest.owner_route_readback.owner_route.readback_ref, 'opl connect agent-packages list --json');
      assert.equal(validated.opl_agent_package_manifest.owner_route_readback.packages[0].descriptor.manifest_url, `${baseUrl}/manifest.json`);
      assert.equal(validated.opl_agent_package_manifest.owner_route_readback.packages[0].descriptor.registry_url, registryUrl);
      assert.equal(validated.opl_agent_package_manifest.owner_route_readback.no_package_manager_boundary.package_manager_claim, false);

      const install = await runCliAsync([
        'connect',
        'agent-packages',
        'install',
        '--registry-url',
        registryUrl,
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_install: {
          status: string;
          package_lock: {
            package_id: string;
            trust_tier: string;
            source_kind: string;
            version_or_source_digest: string;
            action_receipt_id: string;
            lock_ref: string;
            rollback_ref: string;
            bundled_required_skill_ids: string[];
            physical_surface: {
            status: string;
            codex_plugin_cache_path: string;
            marketplace_path: string;
            codex_config_path: string;
            plugin_manifest_path: string;
            materialized_required_skill_ids: string[];
            materialized_required_skill_paths: string[];
          };
        };
          physical_surface: {
            status: string;
            codex_plugin_cache_path: string;
            marketplace_path: string;
            codex_config_path: string;
            plugin_manifest_path: string;
            materialized_required_skill_ids: string[];
            materialized_required_skill_paths: string[];
          };
          lifecycle_receipt: {
            receipt_ref: string;
            action: string;
            package_lock_ref: string;
            writes_performed: boolean;
            physical_surface: { status: string };
          };
          owner_route_readback: {
            selected_package_id: string;
            owner_route: { readback_ref: string; package_manager_claim: boolean };
            packages: Array<{
              digest: { version_or_source_digest: string; manifest_sha256: string };
              lock: { package_lock_ref: string; lifecycle_receipt_ref: string };
              materializer: { status: string; plugin_manifest_path: string; writes_performed: boolean };
            }>;
            no_package_manager_boundary: { package_manager_claim: boolean; forbidden_claims: string[] };
          };
          lock_file: string;
          lifecycle_ledger_file: string;
        };
      };

      assert.equal(install.opl_agent_package_install.status, 'installed');
      assert.equal(install.opl_agent_package_install.package_lock.package_id, 'third.party.research');
      assert.equal(install.opl_agent_package_install.package_lock.trust_tier, 'third_party_verified');
      assert.equal(install.opl_agent_package_install.package_lock.source_kind, 'manifest_url');
      assert.equal(
        install.opl_agent_package_install.package_lock.action_receipt_id,
        install.opl_agent_package_install.lifecycle_receipt.receipt_ref,
      );
      assert.equal(install.opl_agent_package_install.package_lock.rollback_ref, 'package-receipt-ref:previous');
      assert.deepEqual(
        install.opl_agent_package_install.package_lock.bundled_required_skill_ids,
        ['third-party-research'],
      );
      assert.equal(install.opl_agent_package_install.lifecycle_receipt.action, 'install');
      assert.equal(install.opl_agent_package_install.lifecycle_receipt.writes_performed, true);
      assert.equal(install.opl_agent_package_install.physical_surface.status, 'materialized');
      assert.equal(install.opl_agent_package_install.package_lock.physical_surface.status, 'materialized');
      assert.equal(install.opl_agent_package_install.lifecycle_receipt.physical_surface.status, 'materialized');
      assert.equal(install.opl_agent_package_install.owner_route_readback.selected_package_id, 'third.party.research');
      assert.equal(install.opl_agent_package_install.owner_route_readback.owner_route.readback_ref, 'opl connect agent-packages list --json');
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.packages[0].digest.version_or_source_digest,
        install.opl_agent_package_install.package_lock.version_or_source_digest,
      );
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.packages[0].lock.package_lock_ref,
        install.opl_agent_package_install.lifecycle_receipt.package_lock_ref,
      );
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.packages[0].materializer.plugin_manifest_path,
        install.opl_agent_package_install.physical_surface.plugin_manifest_path,
      );
      assert.equal(install.opl_agent_package_install.owner_route_readback.no_package_manager_boundary.package_manager_claim, false);
      assert.equal(
        install.opl_agent_package_install.owner_route_readback.no_package_manager_boundary.forbidden_claims.includes(
          'managed_update_kernel_is_package_manager',
        ),
        true,
      );
      assert.deepEqual(
        install.opl_agent_package_install.physical_surface.materialized_required_skill_ids,
        ['third-party-research'],
      );
      assert.equal(fs.existsSync(path.join(
        install.opl_agent_package_install.physical_surface.codex_plugin_cache_path,
        '.codex-plugin',
        'plugin.json',
      )), true);
      assert.equal(
        install.opl_agent_package_install.physical_surface.materialized_required_skill_paths[0],
        path.join(
          install.opl_agent_package_install.physical_surface.codex_plugin_cache_path,
          'skills',
          'third-party-research',
          'SKILL.md',
        ),
      );
      assert.equal(fs.existsSync(path.join(
        install.opl_agent_package_install.physical_surface.codex_plugin_cache_path,
        'skills',
        'third-party-research',
        'SKILL.md',
      )), true);
      assert.equal(fs.existsSync(install.opl_agent_package_install.physical_surface.marketplace_path), true);
      assert.match(
        fs.readFileSync(install.opl_agent_package_install.physical_surface.codex_config_path, 'utf8'),
        /\[plugins\."third-party-research@opl-agent-third.party.research-local"\]/,
      );
      assert.equal(fs.existsSync(install.opl_agent_package_install.lock_file), true);
      assert.equal(fs.existsSync(install.opl_agent_package_install.lifecycle_ledger_file), true);
      const installedCachePath = install.opl_agent_package_install.physical_surface.codex_plugin_cache_path;
      const installedMarketplacePath = install.opl_agent_package_install.physical_surface.marketplace_path;
      const installedConfigPath = install.opl_agent_package_install.physical_surface.codex_config_path;

      const list = runCli([
        'connect',
        'agent-packages',
        'list',
      ], env) as {
        opl_agent_packages: {
          installed_package_count: number;
          installed_packages: Array<{ package_id: string; physical_surface: { status: string } }>;
          home_shortcut_preferences: Array<{
            package_id: string;
            shortcut_id: string;
            visible: boolean;
            sort_order: number | null;
            source: string;
            installed: boolean;
          }>;
          lifecycle_receipt_count: number;
          registry_cache: { entry_count: number };
          owner_route_readback: {
            package_count: number;
            packages: Array<{ materializer: { status: string } }>;
          };
        };
      };

      assert.equal(list.opl_agent_packages.installed_package_count, 1);
      assert.equal(list.opl_agent_packages.installed_packages[0].package_id, 'third.party.research');
      assert.equal(list.opl_agent_packages.installed_packages[0].physical_surface.status, 'materialized');
      assert.deepEqual(list.opl_agent_packages.home_shortcut_preferences.map((entry) => ({
        package_id: entry.package_id,
        shortcut_id: entry.shortcut_id,
        visible: entry.visible,
        source: entry.source,
        installed: entry.installed,
      })), [{
        package_id: 'third.party.research',
        shortcut_id: 'research',
        visible: true,
        source: 'default',
        installed: true,
      }]);
      assert.equal(list.opl_agent_packages.lifecycle_receipt_count, 3);
      assert.equal(list.opl_agent_packages.registry_cache.entry_count, 1);
      assert.equal(list.opl_agent_packages.owner_route_readback.package_count, 1);
      assert.equal(list.opl_agent_packages.owner_route_readback.packages[0].materializer.status, 'materialized');

      const update = await runCliAsync([
        'connect',
        'agent-packages',
        'update',
        '--registry-url',
        registryUrl,
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_update: {
          status: string;
          package_lock: { package_id: string; physical_surface: { status: string } };
          physical_surface: { status: string };
          lifecycle_receipt: { action: string; writes_performed: boolean; physical_surface: { status: string } };
        };
      };

      assert.equal(update.opl_agent_package_update.status, 'updated');
      assert.equal(update.opl_agent_package_update.package_lock.package_id, 'third.party.research');
      assert.equal(update.opl_agent_package_update.physical_surface.status, 'materialized');
      assert.equal(update.opl_agent_package_update.lifecycle_receipt.physical_surface.status, 'materialized');
      assert.equal(update.opl_agent_package_update.lifecycle_receipt.action, 'update');
      assert.equal(update.opl_agent_package_update.lifecycle_receipt.writes_performed, true);

      const repair = runCli([
        'connect',
        'agent-packages',
        'repair',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_repair: {
          status: string;
          package_lock: { package_id: string; physical_surface: { status: string } };
          physical_surface: { status: string };
          lifecycle_receipt: { action: string; writes_performed: boolean; physical_surface: { status: string } };
        };
      };
      assert.equal(repair.opl_agent_package_repair.status, 'repaired');
      assert.equal(repair.opl_agent_package_repair.physical_surface.status, 'materialized');
      assert.equal(repair.opl_agent_package_repair.lifecycle_receipt.physical_surface.status, 'materialized');
      assert.equal(repair.opl_agent_package_repair.lifecycle_receipt.action, 'repair');

      const hide = runCli([
        'connect',
        'agent-packages',
        'hide',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_exposure: {
          status: string;
          action: string;
          package_lock: { exposure_state: string };
          lifecycle_receipt: { action: string };
        };
      };
      assert.equal(hide.opl_agent_package_exposure.status, 'hidden');
      assert.equal(hide.opl_agent_package_exposure.action, 'hide');
      assert.equal(hide.opl_agent_package_exposure.package_lock.exposure_state, 'hidden');
      assert.equal(hide.opl_agent_package_exposure.lifecycle_receipt.action, 'hide');

      const unhide = runCli([
        'connect',
        'agent-packages',
        'unhide',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_exposure: {
          status: string;
          action: string;
          package_lock: { exposure_state: string };
        };
      };
      assert.equal(unhide.opl_agent_package_exposure.status, 'visible');
      assert.equal(unhide.opl_agent_package_exposure.action, 'unhide');
      assert.equal(unhide.opl_agent_package_exposure.package_lock.exposure_state, 'visible');

      const disable = runCli([
        'connect',
        'agent-packages',
        'disable',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_exposure: { status: string; package_lock: { exposure_state: string } };
      };
      assert.equal(disable.opl_agent_package_exposure.status, 'disabled');
      assert.equal(disable.opl_agent_package_exposure.package_lock.exposure_state, 'disabled');

      const enable = runCli([
        'connect',
        'agent-packages',
        'enable',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_exposure: { status: string; package_lock: { exposure_state: string } };
      };
      assert.equal(enable.opl_agent_package_exposure.status, 'enabled');
      assert.equal(enable.opl_agent_package_exposure.package_lock.exposure_state, 'enabled');

      const rollback = await runCliAsync([
        'connect',
        'agent-packages',
        'rollback',
        '--registry-url',
        registryUrl,
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_rollback: {
          status: string;
          package_lock: { package_id: string };
          physical_surface: { status: string };
          lifecycle_receipt: { action: string; writes_performed: boolean; physical_surface: { status: string } };
        };
      };
      assert.equal(rollback.opl_agent_package_rollback.status, 'rolled_back');
      assert.equal(rollback.opl_agent_package_rollback.package_lock.package_id, 'third.party.research');
      assert.equal(rollback.opl_agent_package_rollback.physical_surface.status, 'materialized');
      assert.equal(rollback.opl_agent_package_rollback.lifecycle_receipt.action, 'rollback');
      assert.equal(rollback.opl_agent_package_rollback.lifecycle_receipt.writes_performed, true);

      const status = runCli([
        'connect',
        'agent-packages',
        'status',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_status: {
          status: string;
          installed_package_count: number;
          home_shortcut_preferences: Array<{ shortcut_id: string; visible: boolean; sort_order: number | null; source: string }>;
          lifecycle_receipts: Array<{ action: string }>;
          owner_route_readback: {
            selected_package_id: string;
            packages: Array<{ lock: { package_lock_ref: string | null } }>;
          };
        };
      };
      assert.equal(status.opl_agent_package_status.status, 'available');
      assert.equal(status.opl_agent_package_status.installed_package_count, 1);
      assert.equal(status.opl_agent_package_status.home_shortcut_preferences[0].shortcut_id, 'research');
      assert.equal(status.opl_agent_package_status.owner_route_readback.selected_package_id, 'third.party.research');
      assert.equal(
        status.opl_agent_package_status.owner_route_readback.packages[0].lock.package_lock_ref,
        install.opl_agent_package_install.package_lock.lock_ref,
      );
      assert.deepEqual(
        status.opl_agent_package_status.lifecycle_receipts.map((receipt) => receipt.action),
        ['rollback', 'enable', 'disable', 'unhide', 'hide', 'repair', 'update', 'install', 'manifest_validate'],
      );

      const uninstall = runCli([
        'connect',
        'agent-packages',
        'uninstall',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_uninstall: {
          status: string;
          removed_package_lock: { package_id: string };
          physical_surface: { status: string; removed_paths: string[] };
          lifecycle_receipt: { action: string; writes_performed: boolean; physical_surface: { status: string } };
        };
      };
      assert.equal(uninstall.opl_agent_package_uninstall.status, 'uninstalled');
      assert.equal(uninstall.opl_agent_package_uninstall.removed_package_lock.package_id, 'third.party.research');
      assert.equal(uninstall.opl_agent_package_uninstall.physical_surface.status, 'removed');
      assert.equal(uninstall.opl_agent_package_uninstall.lifecycle_receipt.physical_surface.status, 'removed');
      assert.equal(uninstall.opl_agent_package_uninstall.physical_surface.removed_paths.includes(installedCachePath), true);
      assert.equal(uninstall.opl_agent_package_uninstall.lifecycle_receipt.action, 'uninstall');
      assert.equal(uninstall.opl_agent_package_uninstall.lifecycle_receipt.writes_performed, true);
      assert.equal(fs.existsSync(installedCachePath), false);
      assert.equal(fs.existsSync(path.dirname(path.dirname(path.dirname(installedMarketplacePath)))), false);
      assert.equal(
        fs.readFileSync(installedConfigPath, 'utf8').includes('third-party-research@opl-agent-third.party.research-local'),
        false,
      );

      const afterUninstall = runCli([
        'connect',
        'agent-packages',
        'status',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_status: {
          status: string;
          installed_package_count: number;
          lifecycle_receipts: Array<{ action: string }>;
        };
      };
      assert.equal(afterUninstall.opl_agent_package_status.status, 'not_installed');
      assert.equal(afterUninstall.opl_agent_package_status.installed_package_count, 0);
      assert.equal(afterUninstall.opl_agent_package_status.lifecycle_receipts[0].action, 'uninstall');
    }, agentPackageManifest({ pluginSourcePath }));
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
  }
});

test('connect agent-packages materializes manifest-declared remote plugin payloads', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-remote-payload-state-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-remote-payload-home-'));
  const env = {
    OPL_STATE_DIR: stateDir,
    HOME: homeDir,
    CODEX_HOME: path.join(homeDir, '.codex'),
  };
  try {
    await withRemotePayloadAgentPackageServer(async (baseUrl) => {
      const install = await runCliAsync([
        'connect',
        'agent-packages',
        'install',
        '--registry-url',
        `${baseUrl}/registry.json`,
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_install: {
          status: string;
          package_lock: {
            physical_surface: {
              plugin_payload_manifest_url: string;
              plugin_payload_manifest_sha256: string;
              plugin_payload_cache_path: string;
              materialized_required_skill_ids: string[];
            };
          };
          physical_surface: {
            status: string;
            plugin_payload_manifest_url: string;
            plugin_payload_manifest_sha256: string;
            plugin_payload_cache_path: string;
            codex_plugin_cache_path: string;
            materialized_required_skill_paths: string[];
          };
          lifecycle_receipt: {
            physical_surface: {
              plugin_payload_manifest_url: string;
              plugin_payload_cache_path: string;
            };
          };
        };
      };

      const physicalSurface = install.opl_agent_package_install.physical_surface;
      assert.equal(install.opl_agent_package_install.status, 'installed');
      assert.equal(physicalSurface.status, 'materialized');
      assert.equal(physicalSurface.plugin_payload_manifest_url, `${baseUrl}/payload.json`);
      assert.match(physicalSurface.plugin_payload_manifest_sha256, /^[a-f0-9]{64}$/);
      assert.equal(fs.existsSync(path.join(
        physicalSurface.plugin_payload_cache_path,
        '.codex-plugin',
        'plugin.json',
      )), true);
      assert.equal(fs.existsSync(path.join(
        physicalSurface.codex_plugin_cache_path,
        'skills',
        'third-party-research',
        'SKILL.md',
      )), true);
      assert.deepEqual(
        install.opl_agent_package_install.package_lock.physical_surface.materialized_required_skill_ids,
        ['third-party-research'],
      );
      assert.equal(
        install.opl_agent_package_install.lifecycle_receipt.physical_surface.plugin_payload_cache_path,
        physicalSurface.plugin_payload_cache_path,
      );

      const uninstall = runCli([
        'connect',
        'agent-packages',
        'uninstall',
        '--package-id',
        'third.party.research',
      ], env) as {
        opl_agent_package_uninstall: {
          physical_surface: {
            status: string;
            removed_paths: string[];
          };
        };
      };

      assert.equal(uninstall.opl_agent_package_uninstall.physical_surface.status, 'removed');
      assert.equal(
        uninstall.opl_agent_package_uninstall.physical_surface.removed_paths.includes(physicalSurface.plugin_payload_cache_path),
        true,
      );
      assert.equal(fs.existsSync(physicalSurface.plugin_payload_cache_path), false);
    });
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test('connect agent-packages rejects local package payloads missing bundled required skills', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-missing-skill-state-'));
  const pluginSourcePath = createPluginSourceFixture({ includeRequiredSkill: false });
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-missing-skill-'));
  try {
    const manifestPath = path.join(fixtureDir, 'manifest.json');
    fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest({ pluginSourcePath })), 'utf8');
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
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_required_skill_missing');
    assert.deepEqual(failure.payload.error.details.missing_required_skill_ids, ['third-party-research']);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-locks.json')), false);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(pluginSourcePath, { recursive: true, force: true });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('app action execute routes install_from_manifest_url to Framework package lock receipt writer', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-app-action-state-'));
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-manifest-'));
  try {
    const manifestPath = path.join(fixtureDir, 'manifest.json');
    fs.writeFileSync(manifestPath, formatJsonPayload(agentPackageManifest()), 'utf8');
    const manifestUrl = pathToFileURL(manifestPath).href;
    const output = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'install_from_manifest_url',
      '--payload',
      JSON.stringify({
        manifest_url: manifestUrl,
        trust_tier: 'third_party_verified',
      }),
    ], { OPL_STATE_DIR: stateDir }) as {
      app_action_execution: {
        delegated_surface: string;
        result: {
          opl_agent_package_install: {
            status: string;
            package_lock: { package_id: string; source_kind: string };
            lifecycle_receipt: { writes_performed: boolean };
          };
        };
      };
    };

    assert.equal(output.app_action_execution.delegated_surface, 'opl connect agent-packages install --manifest-url <manifest_url>');
    assert.equal(output.app_action_execution.result.opl_agent_package_install.status, 'installed');
    assert.equal(output.app_action_execution.result.opl_agent_package_install.package_lock.package_id, 'third.party.research');
    assert.equal(output.app_action_execution.result.opl_agent_package_install.package_lock.source_kind, 'local_manifest_file');
    assert.equal(output.app_action_execution.result.opl_agent_package_install.lifecycle_receipt.writes_performed, true);

    const repair = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'agent_package_repair',
      '--payload',
      JSON.stringify({ package_id: 'third.party.research' }),
    ], { OPL_STATE_DIR: stateDir }) as {
      app_action_execution: {
        delegated_surface: string;
        result: {
          opl_agent_package_repair: {
            status: string;
            lifecycle_receipt: { action: string };
          };
        };
      };
    };
    assert.equal(repair.app_action_execution.delegated_surface, 'opl connect agent-packages repair --package-id <package_id>');
    assert.equal(repair.app_action_execution.result.opl_agent_package_repair.status, 'repaired');
    assert.equal(repair.app_action_execution.result.opl_agent_package_repair.lifecycle_receipt.action, 'repair');

    const shortcutPreference = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'agent_package_home_shortcut_preferences_set',
      '--payload',
      JSON.stringify({
        package_id: 'third.party.research',
        shortcut_id: 'research',
        visible: false,
        sort_order: 9,
      }),
    ], { OPL_STATE_DIR: stateDir }) as {
      app_action_execution: {
        delegated_surface: string;
        result: {
          opl_agent_package_home_shortcut_preferences: {
            status: string;
            preference: { shortcut_id: string; visible: boolean; sort_order: number };
            lifecycle_receipt: { action: string; writes_performed: boolean };
          };
        };
      };
    };
    assert.equal(
      shortcutPreference.app_action_execution.delegated_surface,
      'opl connect agent-packages home-shortcut-preferences set --package-id <package_id> --shortcut-id <shortcut_id>',
    );
    assert.equal(shortcutPreference.app_action_execution.result.opl_agent_package_home_shortcut_preferences.status, 'preferences_updated');
    assert.equal(shortcutPreference.app_action_execution.result.opl_agent_package_home_shortcut_preferences.preference.shortcut_id, 'research');
    assert.equal(shortcutPreference.app_action_execution.result.opl_agent_package_home_shortcut_preferences.preference.visible, false);
    assert.equal(shortcutPreference.app_action_execution.result.opl_agent_package_home_shortcut_preferences.preference.sort_order, 9);
    assert.equal(
      shortcutPreference.app_action_execution.result.opl_agent_package_home_shortcut_preferences.lifecycle_receipt.action,
      'home_shortcut_preferences_set',
    );

    const list = runCli(['connect', 'agent-packages', 'list'], { OPL_STATE_DIR: stateDir }) as {
      opl_agent_packages: {
        home_shortcut_preferences: Array<{ package_id: string; shortcut_id: string; visible: boolean; sort_order: number; source: string }>;
        files: { home_shortcut_preferences_file: string };
      };
    };
    assert.deepEqual(list.opl_agent_packages.home_shortcut_preferences.map((entry) => ({
      package_id: entry.package_id,
      shortcut_id: entry.shortcut_id,
      visible: entry.visible,
      sort_order: entry.sort_order,
      source: entry.source,
    })), [{
      package_id: 'third.party.research',
      shortcut_id: 'research',
      visible: false,
      sort_order: 9,
      source: 'user_preference',
    }]);
    assert.equal(fs.existsSync(list.opl_agent_packages.files.home_shortcut_preferences_file), true);

    const rollback = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'agent_package_rollback',
      '--payload',
      JSON.stringify({ package_id: 'third.party.research' }),
    ], { OPL_STATE_DIR: stateDir }) as {
      app_action_execution: {
        delegated_surface: string;
        result: {
          opl_agent_package_rollback: {
            status: string;
            lifecycle_receipt: { action: string };
          };
        };
      };
    };
    assert.equal(rollback.app_action_execution.delegated_surface, 'opl connect agent-packages rollback --manifest-url <manifest_url>');
    assert.equal(rollback.app_action_execution.result.opl_agent_package_rollback.status, 'rolled_back');
    assert.equal(rollback.app_action_execution.result.opl_agent_package_rollback.lifecycle_receipt.action, 'rollback');
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
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
