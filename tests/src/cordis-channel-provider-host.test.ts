import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  CHANNEL_THREAD_CALLBACK_API_VERSION,
  buildPackageHostContext,
  readCapabilityPackageHostContract,
  type ChannelProvider,
} from '../../src/authority/packages/index.ts';
import {
  CHANNEL_PROVIDER_EXCLUSION_ABI,
  createCordisAppFullComposition,
  startCordisChannelProviderHost,
} from '../../src/host/composition-profiles.ts';
import {
  CORDIS_CHANNEL_PROVIDER_HOST_PLUGIN_ID,
  type ChannelThreadBinding,
  type ChannelThreadHostCallback,
} from '../../src/host/plugins/cordis-channel-provider-host.ts';
import {
  normalizeCapabilityPackageManifest,
} from '../../src/adapters/integration/agent-package-registry/manifest-normalizers.ts';
import type {
  InstalledPackageDescriptor,
} from '../../src/adapters/integration/agent-package-registry/installed-codex-plugin-directory.ts';
import { loadInstalledChannelProviders } from '../../src/adapters/integration/public/channel-provider-entrypoints.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';
import { assertJsonSchemaPayload } from '../../src/kernel/schema-registry.ts';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const relayFixture = path.join(repoRoot, 'tests/fixtures/catalog/packages/applications/opl-relay.json');

function emptyDescriptorDiscovery() {
  return { discover: () => new Map() };
}

function callbackFixture(
  events: string[] = [],
  readTransportBindings?: ChannelThreadHostCallback['readTransportBindings'],
): ChannelThreadHostCallback {
  return {
    async startThread(identity) {
      assert.deepEqual(Object.keys(identity).sort(), [
        'account_id',
        'channel_session_id',
        'provider_id',
      ]);
      events.push(`thread:start:${identity.provider_id}:${identity.channel_session_id}`);
      return { canonical_thread_host: 'studio', canonical_thread_id: 'thread-1' };
    },
    async resumeThread({ canonical_thread_id: threadId }) {
      events.push(`thread:resume:${threadId}`);
    },
    async startTurn({ canonical_thread_host: threadHost, canonical_thread_id: threadId, text }) {
      events.push(`turn:start:${threadId}:${text}`);
      return {
        canonical_thread_host: threadHost,
        canonical_thread_id: threadId,
        canonical_turn_id: 'turn-1',
      };
    },
    subscribeTurn(turn, observer) {
      events.push(`turn:subscribe:${turn.canonical_turn_id}`);
      void observer.onTerminal({
        ...turn,
        status: 'completed',
        response_text: 'done',
      });
      return {
        dispose() {
          events.push(`turn:unsubscribe:${turn.canonical_turn_id}`);
        },
      };
    },
    ...(readTransportBindings ? { readTransportBindings } : {}),
  };
}

test('app-full channel provider is dormant unless a Shell callback is injected', async () => {
  const composition = await createCordisAppFullComposition({
    runtimeSnapshotProvider: async () => ({ runtime_tray_snapshot: {} }),
  });
  try {
    assert.equal(composition.services.channelProviderHost, null);
    assert.equal(
      composition.snapshot.plugins.some(
        (plugin) => plugin.plugin_id === CORDIS_CHANNEL_PROVIDER_HOST_PLUGIN_ID,
      ),
      false,
    );
  } finally {
    await composition.dispose();
  }
});

test('app-full attaches a long-lived provider to the bounded callback and tears it down', async () => {
  const events: string[] = [];
  let persistedBindings: readonly ChannelThreadBinding[] = [];
  const baseCallback = callbackFixture(events);
  const callback: ChannelThreadHostCallback = {
    ...baseCallback,
    async startThread(identity) {
      const canonicalThread = await baseCallback.startThread(identity);
      persistedBindings = [{ ...identity, ...canonicalThread }];
      return canonicalThread;
    },
    readTransportBindings: async () => persistedBindings,
  };
  const provider: ChannelProvider = {
    provider_id: 'opl-channel-weixin',
    async start({ callback_api_version: apiVersion, callback: injected }) {
      assert.equal(apiVersion, CHANNEL_THREAD_CALLBACK_API_VERSION);
      assert.notEqual(injected, callback);
      assert.deepEqual(Object.keys(injected).sort(), [
        'resumeThread',
        'startThread',
        'startTurn',
        'subscribeTurn',
      ]);
      await assert.rejects(
        () => injected.startThread({
          provider_id: 'other-provider',
          account_id: 'account-1',
          channel_session_id: 'session-1',
        }),
        /cannot bind another provider identity/,
      );
      await assert.rejects(
        () => injected.startThread({
          provider_id: 'opl-channel-weixin',
          account_id: ' account-1',
          channel_session_id: 'session-1',
        }),
        /requires exact account_id/,
      );
      const thread = await injected.startThread({
        provider_id: 'opl-channel-weixin',
        account_id: 'account-1',
        channel_session_id: 'session-1',
        ignored: 'not-forwarded',
      } as any);
      await injected.resumeThread(thread);
      const turn = await injected.startTurn({ ...thread, text: 'hello' });
      const subscription = injected.subscribeTurn(turn, {
        onTerminal(event) {
          events.push(`turn:terminal:${event.status}`);
        },
      });
      return {
        async dispose() {
          await subscription.dispose();
          events.push('provider:dispose');
        },
      };
    },
  };
  const composition = await createCordisAppFullComposition({
    runtimeSnapshotProvider: async () => ({ runtime_tray_snapshot: {} }),
    channelProvider: { callback, providers: [provider] },
    connect: emptyDescriptorDiscovery(),
  });
  assert.ok(composition.services.channelProviderHost);
  assert.equal(composition.services.channelProviderHost.callback_api_version, '1.0.0');
  assert.equal(
    composition.snapshot.plugins.find(
      (plugin) => plugin.plugin_id === CORDIS_CHANNEL_PROVIDER_HOST_PLUGIN_ID,
    )?.required,
    false,
  );
  assert.deepEqual(events, [
    'thread:start:opl-channel-weixin:session-1',
    'thread:resume:thread-1',
    'turn:start:thread-1:hello',
    'turn:subscribe:turn-1',
    'turn:terminal:completed',
  ]);
  const transportBindings = composition.services.channelProviderHost!.appStatePatch()
    .transport_bindings as any;
  assert.equal(transportBindings.surface_kind, 'opl_app_transport_bindings_projection.v1');
  assert.equal(transportBindings.status, 'available');
  assert.equal(transportBindings.unavailable_reason, undefined);
  assert.deepEqual(transportBindings.bindings.map(({ binding_id: _bindingId, ...binding }: any) => binding), [{
    provider_id: 'opl-channel-weixin',
    account_id: 'account-1',
    channel_session_id: 'session-1',
    canonical_thread_host: 'studio',
    canonical_thread_id: 'thread-1',
    project_affinity: 'projectless',
    status: 'bound',
  }]);
  assert.match(transportBindings.bindings[0].binding_id, /^binding-[a-f0-9]{64}$/);
  assert.deepEqual(transportBindings.authority_boundary, {
    raw_fact_owner: 'current_shell_exact_binding_store',
    projection_owner: 'one-person-lab-framework',
    thread_truth_owner: 'canonical_codex_app_server',
    consumer_role: 'render_and_join_only',
    persistence_role: 'none',
  });
  await assert.rejects(
    () => composition.services.channelProviderHost!.attach(provider),
    /already attached/,
  );
  const host = composition.services.channelProviderHost;
  await composition.dispose();
  assert.deepEqual((host!.appStatePatch() as any).transport_bindings, {
    surface_kind: 'opl_app_transport_bindings_projection.v1',
    status: 'unavailable',
    bindings: [],
    unavailable_reason: 'producer_absent',
    authority_boundary: {
      raw_fact_owner: 'current_shell_exact_binding_store',
      projection_owner: 'one-person-lab-framework',
      thread_truth_owner: 'canonical_codex_app_server',
      consumer_role: 'render_and_join_only',
      persistence_role: 'none',
    },
  });
  assert.deepEqual(events.slice(-2), ['turn:unsubscribe:turn-1', 'provider:dispose']);
});

test('channel transport projection validates the Shell-owned persisted binding readback', async () => {
  const first: ChannelThreadBinding = {
    provider_id: 'opl-channel-weixin',
    account_id: 'account-1',
    channel_session_id: 'session-1',
    canonical_thread_host: 'studio',
    canonical_thread_id: 'thread-1',
  };
  const inactiveOtherProvider = {
    ...first,
    provider_id: 'other-provider',
    account_id: 'account-2',
    channel_session_id: 'session-2',
    canonical_thread_id: 'thread-2',
  };
  const provider: ChannelProvider = {
    provider_id: 'opl-channel-weixin',
    async start() { return { dispose() {} }; },
  };
  const projectionFor = async (
    readTransportBindings?: ChannelThreadHostCallback['readTransportBindings'],
  ) => {
    const composition = await createCordisAppFullComposition({
      runtimeSnapshotProvider: async () => ({ runtime_tray_snapshot: {} }),
      channelProvider: {
        callback: callbackFixture([], readTransportBindings),
        providers: [provider],
      },
      connect: emptyDescriptorDiscovery(),
    });
    return {
      composition,
      projection: (composition.services.channelProviderHost!.appStatePatch() as any)
        .transport_bindings,
    };
  };

  const valid = await projectionFor(async () => [first, inactiveOtherProvider]);
  try {
    assert.equal(valid.projection.status, 'available');
    assert.deepEqual(
      valid.projection.bindings.map(({ binding_id: _bindingId, ...binding }: any) => binding),
      [{ ...first, project_affinity: 'projectless', status: 'bound' }],
    );
  } finally {
    await valid.composition.dispose();
  }

  for (const invalid of [
    [{ ...first, provider_id: ' opl-channel-weixin' }],
    [{ ...first, account_id: 'a'.repeat(513) }],
    [first, { ...first, canonical_thread_id: 'thread-2' }],
    [first, { ...first, account_id: 'account-2', channel_session_id: 'session-2' }],
  ]) {
    const result = await projectionFor(async () => invalid);
    try {
      assert.equal(result.projection.status, 'unavailable');
      assert.equal(result.projection.unavailable_reason, 'invalid_projection');
    } finally {
      await result.composition.dispose();
    }
  }

  const failed = await projectionFor(async () => { throw new Error('store unavailable'); });
  try {
    assert.equal(failed.projection.unavailable_reason, 'projection_unavailable');
  } finally {
    await failed.composition.dispose();
  }

  const legacy = await projectionFor();
  try {
    assert.equal(legacy.projection.status, 'unavailable');
    assert.equal(legacy.projection.unavailable_reason, 'producer_absent');
  } finally {
    await legacy.composition.dispose();
  }

  const nonPersistingProvider: ChannelProvider = {
    provider_id: 'opl-channel-weixin',
    async start({ callback: injected }) {
      await injected.startThread({
        provider_id: 'opl-channel-weixin',
        account_id: 'account-1',
        channel_session_id: 'session-1',
      });
      return { dispose() {} };
    },
  };
  await assert.rejects(
    () => createCordisAppFullComposition({
      runtimeSnapshotProvider: async () => ({ runtime_tray_snapshot: {} }),
      channelProvider: {
        callback: callbackFixture([], async () => []),
        providers: [nonPersistingProvider],
      },
      connect: emptyDescriptorDiscovery(),
    }),
    /did not persist the exact transport binding/,
  );
});

test('app-full loads a callable channel provider from an installed descriptor entrypoint', async () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-channel-provider-'));
  const moduleRef = 'channel-provider.mjs';
  const modulePath = path.join(packageRoot, moduleRef);
  fs.writeFileSync(modulePath, [
    'export let factoryCount = 0;',
    'export let startCount = 0;',
    'export let disposeCount = 0;',
    'function provider(providerId = "opl-channel-test") {',
    '  let connectionState = "disconnected";',
    '  return {',
    '    provider_id: providerId,',
    '    channel_access: {',
    '      data_ref: "channel.state",',
    '      action_refs: ["channel.connect", "channel.disconnect"],',
    '      async read() { return { connection_state: connectionState }; },',
    '      async execute({ action_ref }) {',
    '        connectionState = action_ref === "channel.connect" ? "connected" : "disconnected";',
    '        return { connection_state: connectionState };',
    '      },',
    '    },',
    '    async start() {',
    '      startCount += 1;',
    '      return { async dispose() { disposeCount += 1; } };',
    '    },',
    '  };',
    '}',
    'export function createChannelProvider() {',
    '  factoryCount += 1;',
    '  return provider();',
    '}',
    'export const channelProvider = provider();',
    'export function requiresOptions(_options) { return provider(); }',
    'export async function asyncFactory() { return provider(); }',
    'export function invalidFactory() { return {}; }',
    'export function wrongIdentityFactory() { return provider("other-provider"); }',
    'export function mismatchedRefsFactory() {',
    '  const value = provider();',
    '  value.channel_access = { ...value.channel_access, action_refs: ["channel.connect"] };',
    '  return value;',
    '}',
  ].join('\n'));
  const ownerManifest = parseJsonText(fs.readFileSync(
    relayFixture,
    'utf8',
  )) as Record<string, any>;
  const manifestPath = path.join(packageRoot, 'opl-package.json');
  const packageManifestPayload: Record<string, any> = {
    ...ownerManifest,
    package_id: 'opl-channel-test',
    display_name: 'Channel test provider',
    exports: {
      ...ownerManifest.exports,
      core_skill_ids: [],
      specialty_skill_ids: [],
    },
    consumer_profiles: [],
    entrypoints: [{
      entrypoint_id: 'channel-provider',
      kind: 'channel_provider',
      module_ref: moduleRef,
      export_name: 'createChannelProvider',
    }],
    app_contributions: {
      schema_version: 'opl-app-contributions.v1',
      navigation: [],
      views: [{
        view_id: 'channel-access',
        view_type: 'channel_access',
        title_i18n: { en: 'Channel access' },
        data_ref: 'channel.state',
        command_ids: ['channel-connect', 'channel-disconnect'],
        badge_ids: [],
      }],
      commands: [{
        command_id: 'channel-connect',
        label_i18n: { en: 'Connect' },
        action_ref: 'channel.connect',
        confirmation_required: false,
      }, {
        command_id: 'channel-disconnect',
        label_i18n: { en: 'Disconnect' },
        action_ref: 'channel.disconnect',
        confirmation_required: true,
      }],
      badges: [],
      ui: [{
        contribution_id: 'channel-access',
        slot: 'settings.section',
        contribution_kind: 'view',
        trust_tier: 'declarative',
        scope: 'root',
        sort_order: 0,
        view_id: 'channel-access',
      }],
    },
    codex_surface: {
      ...ownerManifest.codex_surface,
      plugin_id: 'opl-channel-test',
      configured_codex_plugin_carrier: {
        ...ownerManifest.codex_surface.configured_codex_plugin_carrier,
        plugin_selector: 'opl-channel-test@opl-channel-test',
      },
    },
  };
  const manifestSchema = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/capability-package-manifest.schema.json'),
    'utf8',
  )) as Record<string, unknown>;
  const ordinaryZeroSkillPackage = {
    ...packageManifestPayload,
    entrypoints: [],
  };
  assert.throws(
    () => assertJsonSchemaPayload({
      schemaId: String(manifestSchema.$id),
      schema: manifestSchema,
      sourceRef: 'contracts/opl-framework/capability-package-manifest.schema.json',
    }, ordinaryZeroSkillPackage),
    /JSON Schema validation/,
  );
  assert.throws(
    () => normalizeCapabilityPackageManifest(ordinaryZeroSkillPackage, manifestPath),
    /at least one core skill unless it provides a channel provider entrypoint/,
  );
  assert.throws(
    () => normalizeCapabilityPackageManifest(packageManifestPayload, manifestPath),
    /content lock/,
  );
  packageManifestPayload.content_lock = {
    ...ownerManifest.content_lock,
    paths: [
      ...ownerManifest.content_lock.paths.filter(
        (entry: string) => !entry.startsWith('skills/'),
      ),
      moduleRef,
    ],
  };
  const hostSpecificPath = 'dist\\channel-provider.js';
  assert.throws(
    () => normalizeCapabilityPackageManifest({
      ...packageManifestPayload,
      entrypoints: [{
        ...packageManifestPayload.entrypoints[0],
        module_ref: hostSpecificPath,
      }],
      content_lock: {
        ...packageManifestPayload.content_lock,
        paths: [
          ...packageManifestPayload.content_lock.paths.filter(
            (entry: string) => entry !== moduleRef,
          ),
          hostSpecificPath,
        ],
      },
    }, manifestPath),
    /must use POSIX separators/,
  );
  assert.doesNotThrow(() => assertJsonSchemaPayload({
    schemaId: String(manifestSchema.$id),
    schema: manifestSchema,
    sourceRef: 'contracts/opl-framework/capability-package-manifest.schema.json',
  }, packageManifestPayload));
  const manifest = normalizeCapabilityPackageManifest(packageManifestPayload, manifestPath);
  assert.deepEqual(manifest.required_skill_ids, []);
  const descriptor = {
    manifest,
    manifestPath,
    manifest_sha256: 'test',
    sourcePath: packageRoot,
    pluginId: 'opl-channel-test',
    marketplaceSource: null,
    enabled: true,
    carrier: manifest.configured_codex_plugin_carrier!,
    carrier_readback: {
      kind: 'test',
      identity: 'opl-channel-test',
      source_ref: packageRoot,
      version: manifest.version,
      enabled: true,
      lifecycle_authority: 'carrier_owned',
    },
    readiness: {
      installed: true,
      physical_status: 'available',
      callability: 'callable',
    },
  } as InstalledPackageDescriptor;
  const descriptorForExport = (exportName: string): InstalledPackageDescriptor => ({
    ...descriptor,
    manifest: {
      ...descriptor.manifest,
      entrypoints: [{
        entrypoint_id: 'channel-provider',
        kind: 'channel_provider',
        module_ref: moduleRef,
        export_name: exportName,
      }],
    },
  });
  const first = (await loadInstalledChannelProviders([descriptor]))[0];
  const second = (await loadInstalledChannelProviders([descriptor]))[0];
  assert.notEqual(first?.provider, second?.provider);
  await assert.rejects(
    () => loadInstalledChannelProviders([descriptorForExport('channelProvider')]),
    /zero-argument factory/,
  );
  await assert.rejects(
    () => loadInstalledChannelProviders([descriptorForExport('requiresOptions')]),
    /zero-argument factory/,
  );
  await assert.rejects(
    () => loadInstalledChannelProviders([descriptorForExport('asyncFactory')]),
    /return synchronously/,
  );
  await assert.rejects(
    () => loadInstalledChannelProviders([descriptorForExport('invalidFactory')]),
    /stable provider_id/,
  );
  await assert.rejects(
    () => loadInstalledChannelProviders([descriptorForExport('wrongIdentityFactory')]),
    /identity must match/,
  );
  await assert.rejects(
    () => loadInstalledChannelProviders([descriptorForExport('mismatchedRefsFactory')]),
    /refs must exactly match/,
  );
  const excludedId = 'native-channel-test';
  const excludedDescriptor: InstalledPackageDescriptor = {
    ...descriptor,
    manifest: { ...descriptor.manifest, package_id: excludedId },
    sourcePath: path.join(packageRoot, 'legacy-carrier-does-not-exist'),
  };
  const nativeBinding: ChannelThreadBinding = {
    provider_id: excludedId,
    account_id: 'native-account',
    channel_session_id: 'native-session',
    canonical_thread_host: 'studio',
    canonical_thread_id: 'native-thread',
  };
  const unexpectedProvider: ChannelProvider = {
    provider_id: excludedId,
    start() { throw new Error('Excluded provider started.'); },
  };
  const composition = await createCordisAppFullComposition({
    runtimeSnapshotProvider: async () => ({ runtime_tray_snapshot: {} }),
    channelProvider: {
      callback: callbackFixture([], async () => [nativeBinding]),
      excludedProviderIds: [excludedId],
      providers: [unexpectedProvider],
    },
    connect: { discover: () => new Map([[manifest.package_id, descriptor], [excludedId, excludedDescriptor]]) },
  });
  try {
    const loaded = await import(pathToFileURL(modulePath).href);
    assert.equal(loaded.factoryCount, 3);
    assert.equal(loaded.startCount, 1);
    assert.ok(composition.services.channelProviderHost);
    await assert.rejects(
      () => composition.services.channelProviderHost!.attach(unexpectedProvider),
      /excluded by the active native host/,
    );
    await assert.rejects(
      () => composition.services.channelProviderHost!.readChannelAccess({ package_id: excludedId, ref: 'channel.state' }),
      /channel_access is unavailable/,
    );
    const patch = composition.services.channelProviderHost!.appStatePatch() as any;
    assert.equal(patch.transport_bindings.status, 'available');
    assert.deepEqual(patch.transport_bindings.bindings, []);
    assert.equal(patch.ui_contributions.entries[0].view.view_type, 'channel_access');
    assert.equal(
      patch.ui_contributions.entries[0].action_boundary,
      'opl.connect.channel-provider-host',
    );
    assert.equal(Object.hasOwn(patch, 'actions'), false);
    const disconnected = await composition.services.channelProviderHost!.readChannelAccess({
      package_id: 'opl-channel-test',
      ref: 'channel.state',
      input: {},
    }) as any;
    assert.equal(
      disconnected.opl_app_contribution.response.result.connection_state,
      'disconnected',
    );
    await assert.rejects(
      () => composition.services.channelProviderHost!.executeChannelAccessAction({
        package_id: 'opl-channel-test',
        ref: 'channel.disconnect',
        input: {},
      }),
      /requires confirmation/,
    );
    await composition.services.channelProviderHost!.executeChannelAccessAction({
      package_id: 'opl-channel-test',
      ref: 'channel.connect',
      input: {},
    });
    const connected = await composition.services.channelProviderHost!.readChannelAccess({
      package_id: 'opl-channel-test',
      ref: 'channel.state',
      input: {},
    }) as any;
    assert.equal(connected.opl_app_contribution.response.result.connection_state, 'connected');
    const isolatedComposition = await createCordisAppFullComposition({
      runtimeSnapshotProvider: async () => ({ runtime_tray_snapshot: {} }),
      channelProvider: { callback: callbackFixture() },
      connect: { discover: () => new Map([[manifest.package_id, descriptor]]) },
    });
    try {
      const isolated = await isolatedComposition.services.channelProviderHost!.readChannelAccess({
        package_id: 'opl-channel-test',
        ref: 'channel.state',
        input: {},
      }) as any;
      assert.equal(isolated.opl_app_contribution.response.result.connection_state, 'disconnected');
    } finally {
      await isolatedComposition.dispose();
    }
  } finally {
    const host = composition.services.channelProviderHost!;
    await composition.dispose();
    await assert.rejects(
      () => host.readChannelAccess({
        package_id: 'opl-channel-test',
        ref: 'channel.state',
        input: {},
      }),
      /unavailable/,
    );
    const loaded = await import(pathToFileURL(modulePath).href);
    assert.equal(loaded.disposeCount, 2);
    const headless = (await loadInstalledChannelProviders([{
      ...descriptor,
      enabled: false,
      carrier_readback: { ...descriptor.carrier_readback, enabled: false },
      readiness: {
        ...descriptor.readiness,
        callability: 'disabled',
        projection_callability: 'callable',
      },
      manifest: { ...descriptor.manifest, codex_interaction_mode: 'headless_internal' },
    }]))[0];
    assert.equal(headless?.descriptor.enabled, false);
    assert.equal(headless?.provider.provider_id, 'opl-channel-test');
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test('public channel-provider bootstrap owns the app-full Host lifecycle', async () => {
  assert.equal(CHANNEL_PROVIDER_EXCLUSION_ABI, 1);
  const previousBinary = process.env.OPL_CODEX_PLUGIN_BIN;
  process.env.OPL_CODEX_PLUGIN_BIN = path.join(
    os.tmpdir(),
    `missing-codex-plugin-manager-${process.pid}`,
  );
  try {
    const host = await startCordisChannelProviderHost({
      callback: callbackFixture(),
      excludedProviderIds: ['opl-channel-weixin'],
    });
    assert.equal(typeof host.dispose, 'function');
    assert.equal(typeof host.readChannelAccess, 'function');
    assert.equal(typeof host.executeChannelAccessAction, 'function');
    const patch = host.appStatePatch() as any;
    assert.equal(patch.transport_bindings.unavailable_reason, 'producer_absent');
    await host.dispose();
  } finally {
    if (previousBinary === undefined) delete process.env.OPL_CODEX_PLUGIN_BIN;
    else process.env.OPL_CODEX_PLUGIN_BIN = previousBinary;
  }
});

test('capability Package channel-provider context requires the optional app-full host', async () => {
  const dormant = await createCordisAppFullComposition({
    runtimeSnapshotProvider: async () => ({ runtime_tray_snapshot: {} }),
  });
  const configured = await createCordisAppFullComposition({
    runtimeSnapshotProvider: async () => ({ runtime_tray_snapshot: {} }),
    channelProvider: { callback: callbackFixture() },
    connect: emptyDescriptorDiscovery(),
  });
  try {
    const manifest = parseJsonText(fs.readFileSync(
      relayFixture,
      'utf8',
    )) as { surface_kind: 'opl_capability_package_manifest.v2'; package_id: string };
    const integration = readCapabilityPackageHostContract();
    const dormantContext = buildPackageHostContext({
      package_id: manifest.package_id,
      integration,
      integration_trigger: 'channel_provider',
      environment: {
        profile_id: 'app-full',
        snapshots: [{ composition_id: 'profile:app-full', snapshot: dormant.snapshot }],
      },
    });
    const configuredContext = buildPackageHostContext({
      package_id: manifest.package_id,
      integration,
      integration_trigger: 'channel_provider',
      environment: {
        profile_id: 'app-full',
        snapshots: [{ composition_id: 'profile:app-full', snapshot: configured.snapshot }],
      },
    });
    assert.equal(dormantContext.status, 'blocked');
    assert.deepEqual(dormantContext.blockers, [
      'required_host_capability_missing:opl.connect.channel-provider-host',
    ]);
    assert.equal(configuredContext.status, 'ready');
    assert.equal(configuredContext.capabilities.required[0]?.status, 'resolved');
  } finally {
    await configured.dispose();
    await dormant.dispose();
  }
});
