import { createHash } from 'node:crypto';

import { Context } from '@deepseek-ai/cordis';

import {
  CHANNEL_PROVIDER_HOST_SERVICE_ID,
  CHANNEL_THREAD_CALLBACK_API_VERSION,
  assertChannelDisposable,
  assertChannelProvider,
  assertChannelThreadCallback,
  type ChannelDisposable,
  type ChannelConversationIdentity,
  type ChannelProvider,
  type ChannelThreadRef,
  type ChannelThreadCallback,
  type ChannelTurnRef,
  type ChannelTurnTerminalEvent,
  type ChannelTurnTerminalObserver,
} from '../../authority/packages/index.ts';
import type {
  InstalledChannelProviderAttachment,
} from '../../adapters/integration/public/channel-provider-entrypoints.ts';
import {
  buildCordisPluginDescriptor,
  type CordisPluginDescriptor,
} from '../../authority/packages/index.ts';
import { boundedJsonValue } from '../../kernel/json-record.ts';
import { buildAppUiContributionsProjection } from '../../read-models/operator/index.ts';

export const CORDIS_CHANNEL_PROVIDER_HOST_PLUGIN_ID = 'opl-connect-channel-provider-host';
export const CORDIS_CHANNEL_PROVIDER_HOST_PLUGIN_API_VERSION = '1.0.0';
export const CORDIS_CHANNEL_PROVIDER_HOST_SERVICE = CHANNEL_PROVIDER_HOST_SERVICE_ID;
export const CORDIS_CHANNEL_PROVIDER_HOST_SOURCE_REF =
  'src/host/plugins/cordis-channel-provider-host.ts';
export const CORDIS_CHANNEL_PROVIDER_HOST_SOURCE_COMMIT =
  '2df54a39ab8f5022cb492b9d7213bc52d6d724c9';

export type CordisChannelProviderHostService = Readonly<{
  callback_api_version: typeof CHANNEL_THREAD_CALLBACK_API_VERSION;
  attach(provider: ChannelProvider): Promise<ChannelDisposable>;
  appStatePatch(): Readonly<Record<string, unknown>>;
  readChannelAccess(input: CordisChannelProviderContributionRequest): Promise<Readonly<Record<string, unknown>>>;
  executeChannelAccessAction(input: CordisChannelProviderContributionRequest): Promise<Readonly<Record<string, unknown>>>;
}>;

export type ChannelThreadBinding = ChannelConversationIdentity & ChannelThreadRef;

export type ChannelThreadHostCallback = ChannelThreadCallback & Readonly<{
  readTransportBindings?(): Promise<readonly ChannelThreadBinding[]>;
}>;

export type CordisChannelProviderHostPluginConfig = Readonly<{
  callback: ChannelThreadHostCallback;
  providers?: readonly ChannelProvider[];
  installedProviders?: readonly InstalledChannelProviderAttachment[];
}>;

export type CordisChannelProviderContributionRequest = Readonly<{
  package_id: string;
  ref: string;
  input?: Readonly<Record<string, unknown>>;
  confirmed?: boolean;
}>;

type ActiveProvider = Readonly<{
  status: 'starting' | 'active';
  provider: ChannelProvider;
  attachment?: InstalledChannelProviderAttachment;
  confirmationRequiredRefs: ReadonlySet<string>;
}>;

type ChannelTransportBinding = ChannelThreadBinding & Readonly<{
  binding_id: string;
  project_affinity: 'projectless';
  status: 'bound';
}>;

type ChannelTransportBindingsProjection = Readonly<{
  surface_kind: 'opl_app_transport_bindings_projection.v1';
  authority_boundary: typeof transportBindingAuthorityBoundary;
}> & (
  | Readonly<{
      status: 'available';
      bindings: readonly ChannelTransportBinding[];
    }>
  | Readonly<{
      status: 'unavailable';
      bindings: readonly ChannelTransportBinding[];
      unavailable_reason: 'producer_absent' | 'projection_unavailable' | 'invalid_projection';
    }>
);

declare module '@deepseek-ai/cordis' {
  interface Context {
    [CORDIS_CHANNEL_PROVIDER_HOST_SERVICE]: CordisChannelProviderHostService;
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Channel callback requires ${field}.`);
  }
  return value;
}

function requiredExactString(value: unknown, field: string): string {
  const exact = requiredString(value, field);
  if (exact !== exact.trim() || exact.length > 512) {
    throw new TypeError(`Channel callback requires exact ${field}.`);
  }
  return exact;
}

function contributionRef(value: unknown): string {
  const ref = requiredString(value, 'ref');
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?(?:#[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)?$/.test(ref)) {
    throw new TypeError('Channel provider app contribution ref is invalid.');
  }
  return ref;
}

function contributionInput(value: unknown): Readonly<Record<string, unknown>> {
  const input = boundedJsonValue(value ?? {}, 'Channel provider app contribution input');
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Channel provider app contribution input must be a JSON object.');
  }
  return Object.freeze(input as Record<string, unknown>);
}

function contributionReadback(
  active: ActiveProvider & { attachment: InstalledChannelProviderAttachment },
  ref: string,
  operation: 'read' | 'execute',
  result: unknown,
) {
  const { descriptor } = active.attachment;
  return Object.freeze({
    opl_app_contribution: {
      surface_kind: 'opl_app_package_contribution.v1',
      package_id: descriptor.manifest.package_id,
      ref,
      operation,
      confirmation_required: active.confirmationRequiredRefs.has(ref),
      carrier_readback: {
        kind: descriptor.carrier_readback.kind,
        identity: descriptor.carrier_readback.identity,
        lifecycle_authority: descriptor.carrier_readback.lifecycle_authority,
      },
      readiness: {
        installed: descriptor.readiness.installed,
        physical_status: descriptor.readiness.physical_status,
        callability: descriptor.readiness.callability,
      },
      response: {
        schema_version: 'opl-package-app-contribution-response.v1',
        ok: true,
        ref,
        operation,
        result: boundedJsonValue(result, 'Channel provider app contribution result'),
      },
    },
  });
}

function conversationIdentity(input: ChannelConversationIdentity): ChannelConversationIdentity {
  return Object.freeze({
    provider_id: requiredExactString(input?.provider_id, 'provider_id'),
    account_id: requiredExactString(input?.account_id, 'account_id'),
    channel_session_id: requiredExactString(input?.channel_session_id, 'channel_session_id'),
  });
}

function threadRef(input: ChannelThreadRef): ChannelThreadRef {
  return Object.freeze({
    canonical_thread_host: requiredExactString(
      input?.canonical_thread_host,
      'canonical_thread_host',
    ),
    canonical_thread_id: requiredExactString(input?.canonical_thread_id, 'canonical_thread_id'),
  });
}

function turnRef(input: ChannelTurnRef): ChannelTurnRef {
  return Object.freeze({
    ...threadRef(input),
    canonical_turn_id: requiredExactString(input?.canonical_turn_id, 'canonical_turn_id'),
  });
}

function transportBindingKey(identity: ChannelConversationIdentity): string {
  return JSON.stringify([
    identity.provider_id,
    identity.account_id,
    identity.channel_session_id,
  ]);
}

function transportThreadKey(thread: ChannelThreadRef): string {
  return JSON.stringify([thread.canonical_thread_host, thread.canonical_thread_id]);
}

function channelTransportBinding(
  input: ChannelThreadBinding,
): ChannelTransportBinding {
  const identity = conversationIdentity(input);
  const thread = threadRef(input);
  const key = transportBindingKey(identity);
  return Object.freeze({
    binding_id: `binding-${createHash('sha256').update(key).digest('hex')}`,
    ...identity,
    ...thread,
    project_affinity: 'projectless',
    status: 'bound',
  });
}

const transportBindingAuthorityBoundary = Object.freeze({
  raw_fact_owner: 'current_shell_exact_binding_store',
  projection_owner: 'one-person-lab-framework',
  thread_truth_owner: 'canonical_codex_app_server',
  consumer_role: 'render_and_join_only',
  persistence_role: 'none',
});

function unavailableTransportBindings(
  reason: 'producer_absent' | 'projection_unavailable' | 'invalid_projection',
): ChannelTransportBindingsProjection {
  return Object.freeze({
    surface_kind: 'opl_app_transport_bindings_projection.v1',
    status: 'unavailable',
    bindings: Object.freeze([]),
    unavailable_reason: reason,
    authority_boundary: transportBindingAuthorityBoundary,
  });
}

function availableTransportBindings(
  bindings: readonly ChannelTransportBinding[],
): ChannelTransportBindingsProjection {
  return Object.freeze({
    surface_kind: 'opl_app_transport_bindings_projection.v1',
    status: 'available',
    bindings: Object.freeze([...bindings]),
    authority_boundary: transportBindingAuthorityBoundary,
  });
}

async function readTransportBindingsProjection(
  callback: ChannelThreadHostCallback,
): Promise<ChannelTransportBindingsProjection> {
  if (callback.readTransportBindings === undefined) {
    return unavailableTransportBindings('producer_absent');
  }
  if (typeof callback.readTransportBindings !== 'function') {
    return unavailableTransportBindings('invalid_projection');
  }
  let rawBindings: unknown;
  try {
    rawBindings = await callback.readTransportBindings();
  } catch {
    return unavailableTransportBindings('projection_unavailable');
  }
  try {
    const bounded = boundedJsonValue(rawBindings, 'Channel transport bindings');
    if (!Array.isArray(bounded)) {
      throw new TypeError('Channel transport bindings must be an array.');
    }
    const identityKeys = new Set<string>();
    const threadKeys = new Set<string>();
    const bindings = bounded.map((input) => {
      const binding = channelTransportBinding(input as ChannelThreadBinding);
      const identityKey = transportBindingKey(binding);
      const canonicalThreadKey = transportThreadKey(binding);
      if (identityKeys.has(identityKey) || threadKeys.has(canonicalThreadKey)) {
        throw new TypeError('Channel transport bindings must contain unique exact identities and threads.');
      }
      identityKeys.add(identityKey);
      threadKeys.add(canonicalThreadKey);
      return binding;
    }).sort((left, right) => left.binding_id.localeCompare(right.binding_id));
    return availableTransportBindings(bindings);
  } catch {
    return unavailableTransportBindings('invalid_projection');
  }
}

function activeTransportBindingsProjection(
  projection: ChannelTransportBindingsProjection,
  activeProviderIds: ReadonlySet<string>,
): ChannelTransportBindingsProjection {
  if (activeProviderIds.size === 0) return unavailableTransportBindings('producer_absent');
  if (projection.status !== 'available') return projection;
  return availableTransportBindings(
    projection.bindings.filter((binding) => activeProviderIds.has(binding.provider_id)),
  );
}

function assertPersistedTransportBinding(
  projection: ChannelTransportBindingsProjection,
  identity: ChannelConversationIdentity,
  canonicalThread: ChannelThreadRef,
) {
  if (projection.status !== 'available') {
    throw new Error(
      `Channel transport binding readback is unavailable: ${projection.unavailable_reason}`,
    );
  }
  const expectedKey = transportBindingKey(identity);
  const binding = projection.bindings.find((candidate) => (
    transportBindingKey(candidate) === expectedKey
  ));
  if (!binding) {
    throw new Error('Channel callback did not persist the exact transport binding.');
  }
  sameThread(canonicalThread, binding);
}

function sameThread(expected: ChannelThreadRef, actual: ChannelThreadRef) {
  if (
    expected.canonical_thread_host !== actual.canonical_thread_host
    || expected.canonical_thread_id !== actual.canonical_thread_id
  ) {
    throw new Error('Channel callback returned a mismatched canonical thread ref.');
  }
}

function terminalEvent(
  expected: ChannelTurnRef,
  event: ChannelTurnTerminalEvent,
): ChannelTurnTerminalEvent {
  const actual = turnRef(event);
  sameThread(expected, actual);
  if (expected.canonical_turn_id !== actual.canonical_turn_id) {
    throw new Error('Channel callback observed a mismatched canonical turn ref.');
  }
  switch (event.status) {
    case 'completed':
      return Object.freeze({
        ...actual,
        status: event.status,
        response_text: requiredString(event.response_text, 'response_text'),
      });
    case 'failed':
      return Object.freeze({
        ...actual,
        status: event.status,
        error: Object.freeze({
          code: requiredString(event.error?.code, 'error.code'),
          message: requiredString(event.error?.message, 'error.message'),
        }),
      });
    case 'cancelled':
      return Object.freeze({ ...actual, status: event.status });
    default:
      throw new TypeError('Channel callback terminal status is invalid.');
  }
}

function terminalObserver(
  expected: ChannelTurnRef,
  observer: ChannelTurnTerminalObserver,
): ChannelTurnTerminalObserver {
  if (!observer || typeof observer.onTerminal !== 'function') {
    throw new TypeError('Channel turn subscription requires a terminal observer.');
  }
  return Object.freeze({
    onTerminal: (event) => observer.onTerminal(terminalEvent(expected, event)),
  });
}

export const cordisChannelProviderHostPlugin = {
  name: CORDIS_CHANNEL_PROVIDER_HOST_PLUGIN_ID,
  provide: CORDIS_CHANNEL_PROVIDER_HOST_SERVICE,
  async apply(ctx: Context, config: CordisChannelProviderHostPluginConfig) {
    assertChannelThreadCallback(config.callback);
    const activeProviders = new Map<string, ActiveProvider>();
    let transportBindingsProjection = await readTransportBindingsProjection(config.callback);
    const refreshTransportBindingsProjection = async () => {
      transportBindingsProjection = await readTransportBindingsProjection(config.callback);
      return transportBindingsProjection;
    };
    const attachProvider = async (
      provider: ChannelProvider,
      attachment?: InstalledChannelProviderAttachment,
    ): Promise<ChannelDisposable> => {
      assertChannelProvider(provider);
      if (activeProviders.has(provider.provider_id)) {
        throw new Error(`Channel provider is already attached: ${provider.provider_id}`);
      }
      const confirmationRequiredRefs = new Set(
        attachment?.descriptor.manifest.app_contributions?.commands
          .filter((entry) => entry.confirmation_required)
          .map((entry) => entry.action_ref) ?? [],
      );
      activeProviders.set(provider.provider_id, Object.freeze({
        status: 'starting',
        provider,
        ...(attachment ? { attachment } : {}),
        confirmationRequiredRefs,
      }));
      const boundedCallback: ChannelThreadCallback = Object.freeze({
        async startThread(input) {
          const identity = conversationIdentity(input);
          if (identity.provider_id !== provider.provider_id) {
            throw new Error(
              `Channel provider ${provider.provider_id} cannot bind another provider identity: ${identity.provider_id}`,
            );
          }
          const canonicalThread = threadRef(await config.callback.startThread(identity));
          assertPersistedTransportBinding(
            await refreshTransportBindingsProjection(),
            identity,
            canonicalThread,
          );
          return canonicalThread;
        },
        resumeThread: (input) => config.callback.resumeThread(threadRef(input)),
        async startTurn(input) {
          const canonicalThread = threadRef(input);
          const result = turnRef(await config.callback.startTurn({
            ...canonicalThread,
            text: requiredString(input?.text, 'text'),
          }));
          sameThread(canonicalThread, result);
          return result;
        },
        subscribeTurn(input, observer) {
          const canonicalTurn = turnRef(input);
          const subscription = config.callback.subscribeTurn(
            canonicalTurn,
            terminalObserver(canonicalTurn, observer),
          );
          assertChannelDisposable(subscription);
          return Object.freeze({ dispose: () => subscription.dispose() });
        },
      });
      let providerDisposable: ChannelDisposable;
      try {
        providerDisposable = await provider.start({
          callback_api_version: CHANNEL_THREAD_CALLBACK_API_VERSION,
          callback: boundedCallback,
        });
        assertChannelDisposable(providerDisposable);
      } catch (error) {
        activeProviders.delete(provider.provider_id);
        throw error;
      }
      activeProviders.set(provider.provider_id, Object.freeze({
        status: 'active',
        provider,
        ...(attachment ? { attachment } : {}),
        confirmationRequiredRefs,
      }));
      let disposed = false;
      const disposeEffect = ctx.effect(() => async () => {
        if (disposed) return;
        disposed = true;
        activeProviders.delete(provider.provider_id);
        await providerDisposable.dispose();
      }, `channel-provider:${provider.provider_id}`);
      return Object.freeze({
        async dispose() {
          await disposeEffect();
        },
      });
    };
    const contribution = (input: CordisChannelProviderContributionRequest) => {
      const packageId = requiredString(input?.package_id, 'package_id');
      const active = activeProviders.get(packageId);
      if (active?.status !== 'active' || !active.attachment || !active.provider.channel_access) {
        throw new Error(`Channel provider channel_access is unavailable: ${packageId}`);
      }
      return {
        active: active as ActiveProvider & { attachment: InstalledChannelProviderAttachment },
        controller: active.provider.channel_access,
      };
    };
    const service: CordisChannelProviderHostService = {
      callback_api_version: CHANNEL_THREAD_CALLBACK_API_VERSION,
      attach: (provider) => attachProvider(provider),
      appStatePatch() {
        const activeProviderIds = new Set([...activeProviders]
          .filter(([, active]) => active.status === 'active')
          .map(([providerId]) => providerId));
        const packageStatusById = Object.fromEntries([...activeProviders]
          .filter(([, active]) => (
            active.status === 'active'
            && active.attachment !== undefined
            && active.provider.channel_access !== undefined
          ))
          .map(([packageId, active]) => [packageId, {
            presence: { installed: true },
            capability_exposure: { status: 'enabled' },
            app_contributions: active.attachment!.descriptor.manifest.app_contributions,
          }]));
        return Object.freeze({
          ui_contributions: buildAppUiContributionsProjection(packageStatusById, {
            actionRoute: 'opl.connect.channel-provider-host',
          }),
          transport_bindings: activeTransportBindingsProjection(
            transportBindingsProjection,
            activeProviderIds,
          ),
        });
      },
      async readChannelAccess(input) {
        const { active, controller } = contribution(input);
        const ref = contributionRef(input.ref);
        if (controller.data_ref !== ref) {
          throw new Error(`Channel provider channel_access data ref is not declared: ${active.provider.provider_id}:${ref}`);
        }
        const result = await controller.read(contributionInput(input.input));
        return contributionReadback(active, ref, 'read', result);
      },
      async executeChannelAccessAction(input) {
        const { active, controller } = contribution(input);
        const ref = contributionRef(input.ref);
        if (!controller.action_refs.includes(ref)) {
          throw new Error(`Channel provider channel_access action ref is not declared: ${active.provider.provider_id}:${ref}`);
        }
        if (active.confirmationRequiredRefs.has(ref) && input.confirmed !== true) {
          throw new Error(`Channel provider channel_access action requires confirmation: ${active.provider.provider_id}:${ref}`);
        }
        const result = await controller.execute({
          action_ref: ref,
          input: contributionInput(input.input),
        });
        return contributionReadback(active, ref, 'execute', result);
      },
    };
    ctx.provide(CORDIS_CHANNEL_PROVIDER_HOST_SERVICE, service);
    for (const attachment of config.installedProviders ?? []) {
      await attachProvider(attachment.provider, attachment);
    }
    for (const provider of config.providers ?? []) await service.attach(provider);
  },
};

const forbiddenAuthorities = Object.freeze([
  'package_installed_truth',
  'package_currentness',
  'native_carrier_lifecycle',
  'temporal_workflow_history',
  'workspace_file_bytes',
  'workspace_binding_registry',
  'ledger_evidence_persistence',
  'ledger_receipt_authority',
  'app_product_truth',
  'credential_material',
  'security_sandbox',
]);

export const CORDIS_CHANNEL_PROVIDER_HOST_PLUGIN_DESCRIPTOR: CordisPluginDescriptor =
  buildCordisPluginDescriptor({
    plugin_id: CORDIS_CHANNEL_PROVIDER_HOST_PLUGIN_ID,
    plugin_api_version: CORDIS_CHANNEL_PROVIDER_HOST_PLUGIN_API_VERSION,
    source_ref: CORDIS_CHANNEL_PROVIDER_HOST_SOURCE_REF,
    source_commit: CORDIS_CHANNEL_PROVIDER_HOST_SOURCE_COMMIT,
    package_ref: {
      package_id: 'opl-framework',
      package_version: '0.3.5',
      package_ref: 'workspace:opl-framework@0.3.5',
    },
    required: false,
    provides: [CORDIS_CHANNEL_PROVIDER_HOST_SERVICE],
    injects: { required: [], optional: [] },
    events: [],
    scope: 'composition',
    trust: 'first_party_restricted',
    disposer: { required: true, boundary: 'plugin_fiber' },
    authority_boundary: { forbidden_authorities: forbiddenAuthorities },
  });
