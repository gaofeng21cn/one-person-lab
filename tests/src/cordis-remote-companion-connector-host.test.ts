import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { catalogFixtureManifestPath } from './helpers/catalog-fixture.ts';

import {
  assertRemoteCompanionActivationContext,
  assertRemoteCompanionConnector,
  assertRemoteCompanionConversationBridge,
  assertRemoteCompanionProtectedBlobBytes,
  REMOTE_COMPANION_CONVERSATION_BRIDGE_METHODS,
  REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES,
  type RemoteCompanionActivationContext,
  type RemoteCompanionConnector,
  type RemoteCompanionConversationBridge,
  type RemoteCompanionProtectedBlobPort,
} from '../../src/authority/packages/index.ts';
import {
  createCordisAppFullComposition,
} from '../../src/host/composition-profiles.ts';
import {
  CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_PLUGIN_ID,
} from '../../src/host/plugins/cordis-remote-companion-connector-host.ts';
import {
  loadInstalledRemoteCompanionConnectors,
} from '../../src/adapters/integration/public/remote-companion-connector-entrypoints.ts';
import type {
  InstalledPackageDescriptor,
} from '../../src/adapters/integration/agent-package-registry/installed-codex-plugin-directory.ts';
import {
  normalizeCapabilityPackageManifest,
} from '../../src/adapters/integration/agent-package-registry/manifest-normalizers.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';
import { assertJsonSchemaPayload } from '../../src/kernel/schema-registry.ts';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

function digest(char: string): string {
  return `sha256:${char.repeat(64)}`;
}

function activationContext(
  packageId: string,
  contentDigest = digest('c'),
  artifactDigest = digest('a'),
): RemoteCompanionActivationContext {
  return {
    surface_kind: 'opl_remote_companion_activation_context.v1',
    package_id: packageId,
    environment: 'app-full',
    cohort_id: 'test-cohort',
    protocol_version: 'opl_remote_transport.v1',
    provider: 'remote-companion-test',
    service_origin: 'https://remote-companion.example.test',
    config_digest: digest('d'),
    package_content_digest: contentDigest,
    package_artifact_digest: artifactDigest,
  };
}

function callbackFixture(): RemoteCompanionConversationBridge {
  return {
    async listDirectory() { return { entries: [] }; },
    async readHistory() { return { messages: [] }; },
    async startConversation() { return { conversation_id: 'conversation-1' }; },
    async openConversation() { return { conversation_id: 'conversation-1' }; },
    async sendMessage() { return { accepted: true }; },
    subscribeEvents() { return { dispose() {} }; },
    async stopTurn() { return { stopped: true }; },
    async respondApproval() { return { accepted: true }; },
    async refresh() { return { refreshed: true }; },
  };
}

function appContributions() {
  return {
    schema_version: 'opl-app-contributions.v1',
    navigation: [],
    views: [{
      view_id: 'remote-companion-access',
      view_type: 'remote_companion_access',
      title_i18n: { en: 'Remote companion access' },
      data_ref: 'remote_companion_access#state',
      command_ids: ['remote-companion-connect'],
      badge_ids: [],
    }],
    commands: [{
      command_id: 'remote-companion-connect',
      label_i18n: { en: 'Connect' },
      action_ref: 'remote_companion_access#pair.start',
      confirmation_required: false,
    }],
    badges: [],
    ui: [{
      contribution_id: 'remote-companion-access',
      slot: 'settings.section',
      contribution_kind: 'view',
      trust_tier: 'declarative',
      scope: 'root',
      sort_order: 0,
      view_id: 'remote-companion-access',
    }],
  };
}

function remoteCompanionAccessController(packageId: string) {
  let state = 'disconnected';
  return {
    data_ref: 'remote_companion_access#state',
    action_refs: ['remote_companion_access#pair.start'],
    async read() {
      return { package_id: packageId, connection_state: state };
    },
    async execute({ action_ref }: { action_ref: string }) {
      assert.equal(action_ref, 'remote_companion_access#pair.start');
      state = 'connected';
      return { package_id: packageId, connection_state: state };
    },
  };
}

function descriptorFor(
  packageId: string,
  options: Readonly<{
    sourcePath?: string;
    moduleRef?: string;
    entrypoints?: readonly Record<string, unknown>[];
    contentDigest?: string;
    artifactDigest?: string;
    contributions?: Record<string, unknown> | null;
  }> = {},
): InstalledPackageDescriptor {
  const moduleRef = options.moduleRef ?? 'connector.mjs';
  const contentDigest = options.contentDigest ?? digest('c');
  const artifactDigest = options.artifactDigest ?? digest('a');
  return {
    manifest: {
      package_id: packageId,
      agent_id: null,
      package_role: 'capability_package',
      display_name: packageId,
      publisher: 'test',
      version: '1.0.0',
      source: 'test',
      source_repo: null,
      codex_surface: {},
      codex_default_exposure: true,
      codex_visible_entry: packageId,
      required_skill_ids: [],
      optional_skill_refs: [],
      presentation: null,
      profile_surface: null,
      managed_policy_surface: null,
      capability_dependencies: [],
      capability_provider: null,
      runtime_module_bindings: [],
      content_lock_canonicalization: 'ordered_path_length_file_length_bytes',
      content_lock_paths: [moduleRef],
      configured_codex_plugin_carrier: null,
      app_contributions: options.contributions === undefined
        ? appContributions()
        : options.contributions,
      entrypoints: [...(options.entrypoints ?? [])],
      content_digest: contentDigest,
      artifact_digest: artifactDigest,
    } as unknown as InstalledPackageDescriptor['manifest'],
    manifestPath: path.join(options.sourcePath ?? os.tmpdir(), 'opl-package.json'),
    manifest_sha256: digest('m'),
    sourcePath: options.sourcePath ?? os.tmpdir(),
    pluginId: packageId,
    marketplaceSource: null,
    enabled: true,
    carrier: {} as InstalledPackageDescriptor['carrier'],
    carrier_readback: {
      kind: 'test',
      identity: packageId,
      source_ref: options.sourcePath ?? os.tmpdir(),
      version: '1.0.0',
      enabled: true,
      lifecycle_authority: 'carrier_owned',
    },
    readiness: {
      installed: true,
      physical_status: 'available',
      callability: 'callable',
    },
  };
}

function attachmentFor(
  packageId: string,
  connector: RemoteCompanionConnector,
  options: Parameters<typeof descriptorFor>[1] = {},
) {
  const descriptor = descriptorFor(packageId, options);
  return {
    descriptor,
    connector,
    activation_context: activationContext(
      packageId,
      descriptor.manifest.content_digest!,
      (descriptor.manifest as Record<string, unknown>).artifact_digest as string,
    ),
  };
}

function emptyDescriptorDiscovery() {
  return { discover: () => new Map() };
}

function connectorWithAccess(packageId: string, lifecycle: string[]) {
  return {
    remote_companion_access: remoteCompanionAccessController(packageId),
    async start({ canonical_conversation_bridge, protected_blob, activation_context }: any) {
      assert.equal(activation_context.package_id, packageId);
      assert.deepEqual(
        Object.keys(canonical_conversation_bridge).sort(),
        [...REMOTE_COMPANION_CONVERSATION_BRIDGE_METHODS].sort(),
      );
      await protected_blob.replace('token', new Uint8Array([packageId.endsWith('a') ? 1 : 2]));
      lifecycle.push(`start:${packageId}`);
      return {
        async dispose() {
          lifecycle.push(`dispose:${packageId}`);
        },
      };
    },
  } satisfies RemoteCompanionConnector;
}

function memoryBlobPort(
  readKeys: string[],
  values = new Map<string, Uint8Array>(),
): RemoteCompanionProtectedBlobPort & { values: Map<string, Uint8Array> } {
  const port: RemoteCompanionProtectedBlobPort = {
    async read(key: string) {
      readKeys.push(key);
      const value = values.get(key);
      return value ? new Uint8Array(value) : null;
    },
    async replace(key: string, value: Uint8Array) {
      values.set(key, new Uint8Array(value));
    },
    async clear(key: string) {
      values.delete(key);
    },
  };
  Object.defineProperty(port, 'values', { value: values, enumerable: false });
  return port as RemoteCompanionProtectedBlobPort & { values: Map<string, Uint8Array> };
}

test('remote companion public ABI rejects bridge and connector shape drift', () => {
  const callback = callbackFixture();
  assert.doesNotThrow(() => assertRemoteCompanionConversationBridge(callback));
  assert.throws(
    () => assertRemoteCompanionConversationBridge({ ...callback, unexpected: () => undefined }),
    /extra: unexpected/,
  );
  const missingMethod = { ...callback } as Record<string, unknown>;
  delete missingMethod.refresh;
  assert.throws(
    () => assertRemoteCompanionConversationBridge(missingMethod),
    /missing: refresh/,
  );

  const connector = { start() { return { dispose() {} }; } } satisfies RemoteCompanionConnector;
  assert.doesNotThrow(() => assertRemoteCompanionConnector(connector));
  assert.throws(
    () => assertRemoteCompanionConnector({ ...connector, package_id: 'not-connector-identity' }),
    /extra: package_id/,
  );

  assertRemoteCompanionProtectedBlobBytes(new Uint8Array(REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES));
  assert.throws(
    () => assertRemoteCompanionProtectedBlobBytes(new Uint8Array(REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES + 1)),
    /exceeds 262144 bytes/,
  );
  const context = activationContext('opl-remote-test');
  assert.doesNotThrow(() => assertRemoteCompanionActivationContext(context));
  assert.throws(
    () => assertRemoteCompanionActivationContext({ ...context, environment: { profile_id: 'app-full' } }),
    /environment must be an exact bounded string/,
  );
  assert.throws(
    () => {
      const legacy = {
        ...context,
        cohort: 'legacy-field',
        protocol: { version: '1' },
      } as Record<string, unknown>;
      delete legacy.cohort_id;
      delete legacy.protocol_version;
      assertRemoteCompanionActivationContext(legacy);
    },
    /missing: cohort_id,protocol_version; extra: cohort,protocol/,
  );
});

test('remote companion manifest and loader require a locked synchronous factory and matching digests', async () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-remote-companion-'));
  const moduleRef = 'connector.mjs';
  const modulePath = path.join(packageRoot, moduleRef);
  fs.writeFileSync(modulePath, [
    'export function createConnector() {',
    '  return {',
    '    remote_companion_access: {',
    '      data_ref: "remote_companion_access#state",',
    '      action_refs: ["remote_companion_access#pair.start"],',
    '      read() { return {}; },',
    '      execute() { return {}; }',
    '    },',
    '    start() { return { dispose() {} }; }',
    '  };',
    '}',
    'export function invalidConnector() {',
    '  return { start() {}, extra() {} };',
    '}',
    'export function requiresOptions(_options) {',
    '  return { start() { return { dispose() {} }; } };',
    '}',
    'export async function asyncConnector() {',
    '  return { start() { return { dispose() {} }; } };',
    '}',
  ].join('\n'));
  try {
    const ownerManifest = parseJsonText(fs.readFileSync(
      catalogFixtureManifestPath('opl-relay'),
      'utf8',
    )) as Record<string, any>;
    const manifestPayload = {
      ...ownerManifest,
      package_id: 'opl-remote-companion-test',
      exports: {
        ...ownerManifest.exports,
        core_skill_ids: [],
        specialty_skill_ids: [],
      },
      entrypoints: [{
        entrypoint_id: 'remote-companion',
        kind: 'remote_companion_connector',
        module_ref: moduleRef,
        export_name: 'createConnector',
      }],
      app_contributions: appContributions(),
      content_lock: {
        ...ownerManifest.content_lock,
        paths: [
          ...ownerManifest.content_lock.paths.filter((entry: string) => !entry.startsWith('skills/')),
          moduleRef,
        ],
      },
    };
    const manifestSchema = parseJsonText(fs.readFileSync(
      path.join(repoRoot, 'contracts/opl-framework/capability-package-manifest.schema.json'),
      'utf8',
    )) as Record<string, unknown>;
    assert.doesNotThrow(() => assertJsonSchemaPayload({
      schemaId: String(manifestSchema.$id),
      schema: manifestSchema,
      sourceRef: 'contracts/opl-framework/capability-package-manifest.schema.json',
    }, manifestPayload));
    const normalized = normalizeCapabilityPackageManifest(manifestPayload, path.join(packageRoot, 'opl-package.json'));
    assert.deepEqual(normalized.required_skill_ids, []);
    assert.equal(normalized.entrypoints[0]?.kind, 'remote_companion_connector');

    const descriptor = descriptorFor('opl-remote-companion-test', {
      sourcePath: packageRoot,
      moduleRef,
      entrypoints: manifestPayload.entrypoints,
    });
    const loaded = await loadInstalledRemoteCompanionConnectors([descriptor], {
      activationContext: activationContext('opl-remote-companion-test'),
    });
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0]?.descriptor.manifest.package_id, 'opl-remote-companion-test');
    assert.equal(typeof loaded[0]?.connector.start, 'function');
    const headless = await loadInstalledRemoteCompanionConnectors([{
      ...descriptor,
      enabled: false,
      carrier_readback: { ...descriptor.carrier_readback, enabled: false },
      readiness: {
        ...descriptor.readiness,
        callability: 'disabled',
        projection_callability: 'callable',
      },
      manifest: { ...descriptor.manifest, codex_interaction_mode: 'headless_internal' },
    }], {
      activationContext: activationContext('opl-remote-companion-test'),
    });
    assert.equal(headless[0]?.descriptor.enabled, false);
    assert.equal(typeof headless[0]?.connector.start, 'function');

    const forExport = (exportName: string) => ({
      ...descriptor,
      manifest: { ...descriptor.manifest, entrypoints: [{
        entrypoint_id: 'remote-companion',
        kind: 'remote_companion_connector',
        module_ref: moduleRef,
        export_name: exportName,
      }] },
    });
    await assert.rejects(
      () => loadInstalledRemoteCompanionConnectors([forExport('invalidConnector')], {
        activationContext: activationContext('opl-remote-companion-test'),
      }),
      /extra: extra/,
    );
    await assert.rejects(
      () => loadInstalledRemoteCompanionConnectors([forExport('requiresOptions')], {
        activationContext: activationContext('opl-remote-companion-test'),
      }),
      /zero-argument factory/,
    );
    await assert.rejects(
      () => loadInstalledRemoteCompanionConnectors([forExport('asyncConnector')], {
        activationContext: activationContext('opl-remote-companion-test'),
      }),
      /return synchronously/,
    );
    await assert.rejects(
      () => loadInstalledRemoteCompanionConnectors([descriptor], {
        activationContext: activationContext('opl-remote-companion-test', digest('b')),
      }),
      /content digest does not match/,
    );
    await assert.rejects(
      () => loadInstalledRemoteCompanionConnectors([descriptor], {
        activationContext: activationContext('opl-remote-companion-test', digest('c'), digest('b')),
      }),
      /artifact digest does not match/,
    );
    await assert.rejects(
      () => loadInstalledRemoteCompanionConnectors([descriptor], {
        activationContext: activationContext('different-package'),
      }),
      /package identity does not match/,
    );
    assert.throws(
      () => normalizeCapabilityPackageManifest({
        ...manifestPayload,
        entrypoints: [
          ...manifestPayload.entrypoints,
          { ...manifestPayload.entrypoints[0], entrypoint_id: 'remote-companion-2' },
        ],
      }, path.join(packageRoot, 'opl-package.json')),
      /only one remote companion connector entrypoint/,
    );
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test('remote companion Host uses one Cordis composition, isolates Blob keys, and disposes connectors', async () => {
  const lifecycle: string[] = [];
  const rawKeys: string[] = [];
  const rawBlob = memoryBlobPort(rawKeys);
  const connectorA = connectorWithAccess('opl-remote-a', lifecycle);
  const connectorB = connectorWithAccess('opl-remote-b', lifecycle);
  const composition = await createCordisAppFullComposition({
    runtimeSnapshotProvider: async () => ({ runtime_tray_snapshot: {} }),
    connect: emptyDescriptorDiscovery(),
    remoteCompanion: {
      canonical_conversation_bridge: callbackFixture(),
      connectors: [
        attachmentFor('opl-remote-b', connectorB),
        attachmentFor('opl-remote-a', connectorA),
      ],
      protectedBlobPort: rawBlob,
    },
  });
  try {
    assert.ok(composition.services.remoteCompanionHost);
    assert.equal(
      composition.snapshot.plugins.find(
        (plugin) => plugin.plugin_id === CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_PLUGIN_ID,
      )?.required,
      false,
    );
    assert.deepEqual([...lifecycle].filter((entry) => entry.startsWith('start:')).sort(), [
      'start:opl-remote-a',
      'start:opl-remote-b',
    ]);
    assert.deepEqual([...rawBlob.values.keys()].sort(), [
      'opl-remote-a\0token',
      'opl-remote-b\0token',
    ]);
    assert.deepEqual(rawKeys, []);

    const projection = composition.services.remoteCompanionHost!.appStatePatch()
      .remote_companion as any;
    assert.equal(projection.status, 'available');
    assert.deepEqual(projection.connectors.map((entry: any) => entry.package_id), [
      'opl-remote-a',
      'opl-remote-b',
    ]);
    assert.deepEqual(projection.connectors.map((entry: any) => entry.remote_companion_access), [
      'available',
      'available',
    ]);

    const readA = await composition.services.remoteCompanionHost!.readRemoteCompanionAccess({
      package_id: 'opl-remote-a',
      ref: 'remote_companion_access#state',
      input: {},
    }) as any;
    assert.equal(readA.opl_app_contribution.response.result.package_id, 'opl-remote-a');
    await composition.services.remoteCompanionHost!.executeRemoteCompanionAction({
      package_id: 'opl-remote-b',
      ref: 'remote_companion_access#pair.start',
      input: {},
    });

    const blobPorts = new Map<string, RemoteCompanionProtectedBlobPort>();
    const protectedBlobHostCalls: string[] = [];
    const protectedBlobHostPort = memoryBlobPort([]);
    const probeComposition = await createCordisAppFullComposition({
      runtimeSnapshotProvider: async () => ({ runtime_tray_snapshot: {} }),
      connect: emptyDescriptorDiscovery(),
      remoteCompanion: {
        canonical_conversation_bridge: callbackFixture(),
        connectors: [attachmentFor('opl-remote-a', {
          async start({ protected_blob }) {
            blobPorts.set('opl-remote-a', protected_blob);
            return { dispose() {} };
          },
        })],
        protectedBlobHost: {
          forPackage(packageId: string) {
            protectedBlobHostCalls.push(packageId);
            return protectedBlobHostPort;
          },
        },
      },
    });
    try {
      assert.deepEqual(protectedBlobHostCalls, ['opl-remote-a']);
      const blob = blobPorts.get('opl-remote-a')!;
      await blob.replace('maximum', new Uint8Array(REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES));
      await assert.rejects(
        () => blob.replace('oversized', new Uint8Array(REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES + 1)),
        /exceeds 262144 bytes/,
      );
    } finally {
      await probeComposition.dispose();
    }
  } finally {
    await composition.dispose();
  }
  assert.deepEqual([...lifecycle].filter((entry) => entry.startsWith('dispose:')).sort(), [
    'dispose:opl-remote-a',
    'dispose:opl-remote-b',
  ]);
});

test('remote companion Host is unavailable without Blob Host and stays dormant without an installed Package', async () => {
  let startCount = 0;
  const connector: RemoteCompanionConnector = {
    async start() {
      startCount += 1;
      return { dispose() {} };
    },
  };
  const unavailable = await createCordisAppFullComposition({
    runtimeSnapshotProvider: async () => ({ runtime_tray_snapshot: {} }),
    connect: emptyDescriptorDiscovery(),
    remoteCompanion: {
      canonical_conversation_bridge: callbackFixture(),
      connectors: [attachmentFor('opl-remote-no-blob', connector, { contributions: null })],
    },
  });
  try {
    assert.equal(startCount, 0);
    const projection = unavailable.services.remoteCompanionHost!.appStatePatch()
      .remote_companion as any;
    const unavailablePatch = unavailable.services.remoteCompanionHost!.appStatePatch() as any;
    assert.equal(projection.status, 'unavailable');
    assert.equal(unavailablePatch.ui_contributions.contribution_count, 0);
    assert.deepEqual(unavailablePatch.ui_contributions.slots['settings.section'], []);
    assert.deepEqual(projection.connectors, [{
      package_id: 'opl-remote-no-blob',
      status: 'unavailable',
      remote_companion_access: 'unavailable',
      unavailable_reason: 'protected_blob_host_absent',
    }]);
  } finally {
    await unavailable.dispose();
  }

  const dormant = await createCordisAppFullComposition({
    runtimeSnapshotProvider: async () => ({ runtime_tray_snapshot: {} }),
    connect: emptyDescriptorDiscovery(),
    remoteCompanion: {
      canonical_conversation_bridge: callbackFixture(),
      activationContext: activationContext('never-loaded'),
    },
  });
  try {
    assert.equal(dormant.services.remoteCompanionHost, null);
    assert.equal(
      dormant.snapshot.plugins.some(
        (plugin) => plugin.plugin_id === CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_PLUGIN_ID,
      ),
      false,
    );
  } finally {
    await dormant.dispose();
  }
});
