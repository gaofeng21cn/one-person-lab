import crypto from 'node:crypto';

import { EventBus, nowIso } from '@opl/core';

import { assertDeclaredChannelAccessMatches } from './discovery.ts';
import {
  CHANNEL_THREAD_CALLBACK_API_VERSION,
  ChannelError,
  assertChannelDisposable,
  assertChannelProvider,
  assertChannelThreadCallback,
  boundedChannelJsonValue,
  type ChannelConversationIdentity,
  type ChannelDisconnectReason,
  type ChannelDisposable,
  type ChannelEventBus,
  type ChannelHostEvents,
  type ChannelHostStatus,
  type ChannelPackageDiscovery,
  type ChannelProvider,
  type ChannelProviderContributionRequest,
  type ChannelThreadBinding,
  type ChannelThreadCallback,
  type ChannelThreadHostCallback,
  type ChannelThreadRef,
  type ChannelTransportBinding,
  type ChannelTransportBindingsProjection,
  type ChannelTurnRef,
  type ChannelTurnTerminalEvent,
  type ChannelTurnTerminalObserver,
  type ChannelUiViewDeclaration,
} from './types.ts';

interface ManagedProviderState {
  status: ChannelHostStatus;
  readonly package_id: string;
  readonly provider: ChannelProvider;
  readonly content_digest: string | null;
  readonly ui_views: readonly ChannelUiViewDeclaration[];
  readonly confirmation_required_refs: ReadonlySet<string>;
  readonly subscriptions: Set<ChannelDisposable>;
  provider_disposable: ChannelDisposable | null;
  disconnecting_promise: Promise<void> | null;
  last_reason?: ChannelDisconnectReason;
  last_error_code?: string;
}

export interface ChannelProviderHostOptions {
  readonly callback: ChannelThreadHostCallback;
  readonly eventBus?: ChannelEventBus;
  readonly discovery?: ChannelPackageDiscovery;
  readonly disconnectTimeoutMs?: number;
}

export interface AttachChannelProviderOptions {
  readonly package_id?: string;
  readonly content_digest?: string;
  readonly ui_views?: readonly ChannelUiViewDeclaration[];
}

export interface ChannelProviderStateEntry {
  readonly package_id: string;
  readonly provider_id: string;
  readonly status: ChannelHostStatus;
  readonly has_channel_access: boolean;
  readonly last_reason?: ChannelDisconnectReason;
  readonly last_error_code?: string;
}

export interface ChannelProviderHostProjection {
  readonly surface_kind: 'opl_connect_channel_provider_host_projection.v1';
  readonly callback_api_version: typeof CHANNEL_THREAD_CALLBACK_API_VERSION;
  readonly providers: readonly ChannelProviderStateEntry[];
  readonly transport_bindings: ChannelTransportBindingsProjection;
  readonly ui_views: readonly {
    readonly package_id: string;
    readonly views: readonly ChannelUiViewDeclaration[];
  }[];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', `Channel callback requires ${field}.`);
  }
  return value;
}

function requiredExactString(value: unknown, field: string): string {
  const exact = requiredString(value, field);
  if (exact !== exact.trim() || exact.length > 512 || exact.includes('\0')) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', `Channel callback requires exact ${field}.`);
  }
  return exact;
}

function contributionRef(value: unknown): string {
  const ref = requiredString(value, 'ref');
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?(?:#[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)?$/.test(ref)) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Channel contribution ref is invalid.');
  }
  return ref;
}

function contributionInput(value: unknown): Readonly<Record<string, unknown>> {
  const input = boundedChannelJsonValue(value ?? {}, 'Channel contribution input');
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Channel contribution input must be a JSON object.');
  }
  return Object.freeze(input as Record<string, unknown>);
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
    canonical_thread_host: requiredExactString(input?.canonical_thread_host, 'canonical_thread_host'),
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
  return JSON.stringify([identity.provider_id, identity.account_id, identity.channel_session_id]);
}

function transportThreadKey(thread: ChannelThreadRef): string {
  return JSON.stringify([thread.canonical_thread_host, thread.canonical_thread_id]);
}

function toTransportBinding(input: ChannelThreadBinding): ChannelTransportBinding {
  const identity = conversationIdentity(input);
  const thread = threadRef(input);
  const key = transportBindingKey(identity);
  return Object.freeze({
    binding_id: `binding-${crypto.createHash('sha256').update(key).digest('hex')}`,
    ...identity,
    ...thread,
    project_affinity: 'projectless',
    status: 'bound',
  });
}

function sameThread(expected: ChannelThreadRef, actual: ChannelThreadRef): void {
  if (
    expected.canonical_thread_host !== actual.canonical_thread_host
    || expected.canonical_thread_id !== actual.canonical_thread_id
  ) {
    throw new ChannelError('CHANNEL_IDENTITY_MISMATCH', 'Channel callback returned mismatched canonical thread ref.');
  }
}

function validateTerminalEvent(
  expected: ChannelTurnRef,
  event: ChannelTurnTerminalEvent,
): ChannelTurnTerminalEvent {
  const actual = turnRef(event);
  sameThread(expected, actual);
  if (expected.canonical_turn_id !== actual.canonical_turn_id) {
    throw new ChannelError('CHANNEL_IDENTITY_MISMATCH', 'Channel callback observed mismatched canonical turn ref.');
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
      throw new ChannelError('CHANNEL_INVALID_INPUT', 'Channel callback terminal status is invalid.');
  }
}

function classifyDisconnectError(error: unknown): {
  reason: 'transport_error' | 'auth_error' | 'callback_error';
  code: string;
} {
  if (error instanceof ChannelError) {
    if (error.code === 'CHANNEL_AUTH_ERROR') {
      return { reason: 'auth_error', code: error.code };
    }
    if (error.code === 'CHANNEL_TRANSPORT_ERROR') {
      return { reason: 'transport_error', code: error.code };
    }
    return { reason: 'callback_error', code: error.code };
  }
  if (error && typeof error === 'object') {
    const rec = error as Record<string, unknown>;
    if (rec.authError === true || rec.code === 'CHANNEL_AUTH_ERROR') {
      return { reason: 'auth_error', code: typeof rec.code === 'string' ? rec.code : 'CHANNEL_AUTH_ERROR' };
    }
    if (rec.transportError === true || rec.code === 'CHANNEL_TRANSPORT_ERROR') {
      return {
        reason: 'transport_error',
        code: typeof rec.code === 'string' ? rec.code : 'CHANNEL_TRANSPORT_ERROR',
      };
    }
  }
  return { reason: 'callback_error', code: 'CHANNEL_CALLBACK_ERROR' };
}

function isTransportOrAuthError(error: unknown): boolean {
  if (error instanceof ChannelError) {
    return error.code === 'CHANNEL_TRANSPORT_ERROR' || error.code === 'CHANNEL_AUTH_ERROR';
  }
  if (error && typeof error === 'object') {
    const rec = error as Record<string, unknown>;
    return (
      rec.transportError === true
      || rec.authError === true
      || rec.code === 'CHANNEL_TRANSPORT_ERROR'
      || rec.code === 'CHANNEL_AUTH_ERROR'
    );
  }
  return false;
}

async function disposeWithTimeout(
  disposable: { dispose(): void | Promise<void> },
  timeoutMs: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(() => disposable.dispose()),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    // Disposal errors are isolated so sibling subscriptions still clean up.
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export class ChannelProviderHost {
  readonly callback_api_version = CHANNEL_THREAD_CALLBACK_API_VERSION;
  readonly eventBus: ChannelEventBus;
  readonly #callback: ChannelThreadHostCallback;
  readonly #discovery?: ChannelPackageDiscovery;
  readonly #disconnectTimeoutMs: number;
  readonly #providers = new Map<string, ManagedProviderState>();
  #transportBindingsProjection: ChannelTransportBindingsProjection = Object.freeze({
    surface_kind: 'opl_app_transport_bindings_projection.v1',
    status: 'unavailable',
    bindings: Object.freeze([]),
    unavailable_reason: 'producer_absent',
  });

  constructor(options: ChannelProviderHostOptions) {
    assertChannelThreadCallback(options.callback);
    this.#callback = options.callback;
    this.eventBus = options.eventBus ?? new EventBus<ChannelHostEvents>();
    this.#discovery = options.discovery;
    this.#disconnectTimeoutMs = options.disconnectTimeoutMs ?? 2_000;
  }

  async attach(
    provider: ChannelProvider,
    options: AttachChannelProviderOptions = {},
  ): Promise<ChannelDisposable> {
    assertChannelProvider(provider);
    const packageId = options.package_id?.trim() || provider.provider_id;
    if (provider.provider_id !== packageId) {
      throw new ChannelError(
        'CHANNEL_IDENTITY_MISMATCH',
        `Channel provider_id '${provider.provider_id}' does not match package_id '${packageId}'.`,
      );
    }

    const existing = this.#providers.get(provider.provider_id);
    if (
      existing
      && existing.status !== 'disconnected'
      && existing.status !== 'error'
    ) {
      throw new ChannelError(
        'CHANNEL_PROVIDER_DUPLICATE',
        `Channel provider is already attached: ${provider.provider_id}`,
      );
    }

    const uiViews = options.ui_views ?? [];
    let confirmationRequiredRefs: ReadonlySet<string> = new Set();
    if (provider.channel_access && uiViews.length > 0) {
      confirmationRequiredRefs = assertDeclaredChannelAccessMatches(
        uiViews,
        provider.channel_access,
        'channel_access',
      );
    }

    const state: ManagedProviderState = {
      status: 'registered',
      package_id: packageId,
      provider,
      content_digest: options.content_digest ?? null,
      ui_views: [...uiViews],
      confirmation_required_refs: confirmationRequiredRefs,
      subscriptions: new Set(),
      provider_disposable: null,
      disconnecting_promise: null,
    };
    this.#providers.set(provider.provider_id, state);
    this.transitionStatus(state, 'starting');

    const assertActive = (): void => {
      if (state.status !== 'active' && state.status !== 'starting') {
        throw new ChannelError(
          'CHANNEL_PROVIDER_UNAVAILABLE',
          `Channel provider '${provider.provider_id}' is ${state.status}.`,
        );
      }
    };

    const rawCallback: ChannelThreadCallback = {
      startThread: async (input) => {
        assertActive();
        const identity = conversationIdentity(input);
        if (identity.provider_id !== provider.provider_id) {
          throw new ChannelError(
            'CHANNEL_IDENTITY_MISMATCH',
            `Channel provider ${provider.provider_id} cannot bind identity '${identity.provider_id}'.`,
          );
        }
        try {
          const canonicalThread = threadRef(await this.#callback.startThread(identity));
          const refreshed = await this.refreshTransportBindings();
          if (refreshed.status === 'available') {
            const expectedKey = transportBindingKey(identity);
            const binding = refreshed.bindings.find((b) => transportBindingKey(b) === expectedKey);
            if (!binding) {
              throw new ChannelError(
                'CHANNEL_IDENTITY_MISMATCH',
                'Channel callback did not persist the exact transport binding.',
              );
            }
            sameThread(canonicalThread, binding);
            this.eventBus.emit('channel.transport.bound', {
              binding_id: binding.binding_id,
              provider_id: binding.provider_id,
              account_id: binding.account_id,
              channel_session_id: binding.channel_session_id,
              canonical_thread_host: binding.canonical_thread_host,
              canonical_thread_id: binding.canonical_thread_id,
              timestamp: nowIso(),
            });
          }
          return canonicalThread;
        } catch (error) {
          if (isTransportOrAuthError(error)) {
            const classified = classifyDisconnectError(error);
            await this.safeDisconnect(provider.provider_id, classified.reason, error, state);
          }
          throw error;
        }
      },
      resumeThread: async (input) => {
        assertActive();
        const ref = threadRef(input);
        try {
          await this.#callback.resumeThread(ref);
        } catch (error) {
          if (isTransportOrAuthError(error)) {
            const classified = classifyDisconnectError(error);
            await this.safeDisconnect(provider.provider_id, classified.reason, error, state);
          }
          throw error;
        }
      },
      startTurn: async (input) => {
        assertActive();
        const canonicalThread = threadRef(input);
        const text = requiredString(input?.text, 'text');
        try {
          const result = turnRef(await this.#callback.startTurn({ ...canonicalThread, text }));
          sameThread(canonicalThread, result);
          return result;
        } catch (error) {
          if (isTransportOrAuthError(error)) {
            const classified = classifyDisconnectError(error);
            await this.safeDisconnect(provider.provider_id, classified.reason, error, state);
          }
          throw error;
        }
      },
      subscribeTurn: (input, observer: ChannelTurnTerminalObserver) => {
        assertActive();
        const canonicalTurn = turnRef(input);
        if (!observer || typeof observer.onTerminal !== 'function') {
          throw new ChannelError('CHANNEL_INVALID_INPUT', 'Channel turn subscription requires an observer.');
        }
        const rawObserver: ChannelTurnTerminalObserver = {
          onTerminal: (event) => observer.onTerminal(validateTerminalEvent(canonicalTurn, event)),
        };
        const wrappedObserver: ChannelTurnTerminalObserver = Object.freeze(rawObserver);
        const subscription = this.#callback.subscribeTurn(canonicalTurn, wrappedObserver);
        assertChannelDisposable(subscription);
        let subDisposed = false;
        const tracked: ChannelDisposable = Object.freeze({
          dispose: async () => {
            if (subDisposed) return;
            subDisposed = true;
            state.subscriptions.delete(tracked);
            await subscription.dispose();
          },
        });
        state.subscriptions.add(tracked);
        return tracked;
      },
    };
    const boundedCallback: ChannelThreadCallback = Object.freeze(rawCallback);

    try {
      const disposable = await provider.start({
        callback_api_version: CHANNEL_THREAD_CALLBACK_API_VERSION,
        callback: boundedCallback,
        reportError: (error) => {
          if (this.#providers.get(provider.provider_id) !== state) return;
          const classified = classifyDisconnectError(error);
          void this.safeDisconnect(provider.provider_id, classified.reason, error, state);
        },
      });
      assertChannelDisposable(disposable);
      if (state.disconnecting_promise) {
        await state.disconnecting_promise;
      }
      if (state.status !== 'starting' || this.#providers.get(provider.provider_id) !== state) {
        await disposeWithTimeout(disposable, this.#disconnectTimeoutMs);
        throw new ChannelError(
          'CHANNEL_PROVIDER_UNAVAILABLE',
          `Channel provider '${provider.provider_id}' transitioned to '${state.status}' during startup.`,
        );
      }
      state.provider_disposable = disposable;
      await this.refreshTransportBindings();
      if (state.disconnecting_promise) {
        await state.disconnecting_promise;
      }
      if (state.status !== 'starting' || this.#providers.get(provider.provider_id) !== state) {
        if (state.provider_disposable === disposable) {
          state.provider_disposable = null;
          await disposeWithTimeout(disposable, this.#disconnectTimeoutMs);
        }
        throw new ChannelError(
          'CHANNEL_PROVIDER_UNAVAILABLE',
          `Channel provider '${provider.provider_id}' transitioned to '${state.status}' during startup.`,
        );
      }
      this.transitionStatus(state, 'active');
    } catch (error) {
      if (this.#providers.get(provider.provider_id) === state) {
        await this.safeDisconnect(provider.provider_id, classifyDisconnectError(error).reason, error, state);
      }
      throw error;
    }

    return Object.freeze({
      dispose: async () => {
        if (this.#providers.get(provider.provider_id) !== state) return;
        await this.safeDisconnect(provider.provider_id, 'manual_detach', undefined, state);
      },
    });
  }

  async safeDisconnect(
    providerId: string,
    reason: ChannelDisconnectReason,
    error?: unknown,
    expectedState?: ManagedProviderState,
  ): Promise<void> {
    const state = this.#providers.get(providerId);
    if (!state) return;
    if (expectedState && state !== expectedState) return;
    if (state.status === 'disconnected' || state.status === 'error') return;
    if (state.disconnecting_promise) {
      await state.disconnecting_promise;
      return;
    }

    const runDisconnect = async (): Promise<void> => {
      const errCode = error instanceof ChannelError
        ? error.code
        : error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
          ? String((error as { code: unknown }).code)
          : undefined;

      this.transitionStatus(state, 'disconnecting', reason, errCode);

      const subs = [...state.subscriptions];
      state.subscriptions.clear();
      for (const sub of subs) {
        await disposeWithTimeout(sub, this.#disconnectTimeoutMs);
      }
      if (state.provider_disposable) {
        const disp = state.provider_disposable;
        state.provider_disposable = null;
        await disposeWithTimeout(disp, this.#disconnectTimeoutMs);
      }

      const terminalStatus: ChannelHostStatus =
        reason === 'manual_detach'
        || reason === 'host_dispose'
        || reason === 'package_disabled'
        || reason === 'package_uninstalled'
          ? 'disconnected'
          : 'error';

      this.transitionStatus(state, terminalStatus, reason, errCode);

      if (
        reason === 'transport_error'
        || reason === 'auth_error'
        || reason === 'callback_error'
        || reason === 'digest_changed'
      ) {
        this.eventBus.emit('channel.transport.error', {
          package_id: state.package_id,
          provider_id: state.provider.provider_id,
          reason,
          error_code: errCode ?? 'CHANNEL_DISCONNECTED',
          message: error instanceof Error ? error.message : 'Channel provider disconnected due to error.',
          safe_disconnected: true,
          timestamp: nowIso(),
        });
      }
    };

    state.disconnecting_promise = runDisconnect();
    try {
      await state.disconnecting_promise;
    } finally {
      state.disconnecting_promise = null;
    }
  }

  async detach(providerId: string): Promise<void> {
    await this.safeDisconnect(providerId, 'manual_detach');
  }

  async dispose(): Promise<void> {
    for (const providerId of [...this.#providers.keys()]) {
      await this.safeDisconnect(providerId, 'host_dispose');
    }
  }

  async reconcileWithInstalledPackages(): Promise<void> {
    if (!this.#discovery) return;
    const enabled = this.#discovery.listEnabledChannelPackages();
    const byId = new Map(enabled.map((pkg) => [pkg.package_id, pkg]));

    for (const [providerId, state] of [...this.#providers.entries()]) {
      if (state.status !== 'active' && state.status !== 'starting') continue;
      const pkg = byId.get(state.package_id);
      if (!pkg) {
        await this.safeDisconnect(providerId, 'package_disabled', undefined, state);
        continue;
      }
      if (state.content_digest !== null && pkg.content_digest !== state.content_digest) {
        await this.safeDisconnect(providerId, 'digest_changed', undefined, state);
      }
    }
  }

  async refreshTransportBindings(): Promise<ChannelTransportBindingsProjection> {
    if (!this.#callback.readTransportBindings) {
      this.#transportBindingsProjection = Object.freeze({
        surface_kind: 'opl_app_transport_bindings_projection.v1',
        status: 'unavailable',
        bindings: Object.freeze([]),
        unavailable_reason: 'producer_absent',
      });
      return this.#transportBindingsProjection;
    }

    let rawBindings: unknown;
    try {
      rawBindings = await this.#callback.readTransportBindings();
    } catch {
      this.#transportBindingsProjection = Object.freeze({
        surface_kind: 'opl_app_transport_bindings_projection.v1',
        status: 'unavailable',
        bindings: Object.freeze([]),
        unavailable_reason: 'projection_unavailable',
      });
      return this.#transportBindingsProjection;
    }

    try {
      const bounded = boundedChannelJsonValue(rawBindings, 'Channel transport bindings');
      if (!Array.isArray(bounded)) {
        throw new Error('Transport bindings must be an array.');
      }
      const idKeys = new Set<string>();
      const threadKeys = new Set<string>();
      const bindings = bounded
        .map((item) => {
          const binding = toTransportBinding(item as ChannelThreadBinding);
          const idKey = transportBindingKey(binding);
          const tKey = transportThreadKey(binding);
          if (idKeys.has(idKey) || threadKeys.has(tKey)) {
            throw new Error('Duplicate transport binding identity or thread.');
          }
          idKeys.add(idKey);
          threadKeys.add(tKey);
          return binding;
        })
        .sort((a, b) => a.binding_id.localeCompare(b.binding_id));

      this.#transportBindingsProjection = Object.freeze({
        surface_kind: 'opl_app_transport_bindings_projection.v1',
        status: 'available',
        bindings: Object.freeze(bindings),
      });
      return this.#transportBindingsProjection;
    } catch {
      this.#transportBindingsProjection = Object.freeze({
        surface_kind: 'opl_app_transport_bindings_projection.v1',
        status: 'unavailable',
        bindings: Object.freeze([]),
        unavailable_reason: 'invalid_projection',
      });
      return this.#transportBindingsProjection;
    }
  }

  async readChannelAccess(
    request: ChannelProviderContributionRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    const packageId = requiredString(request?.package_id, 'package_id');
    const state = this.#providers.get(packageId);
    if (!state || state.status !== 'active' || !state.provider.channel_access) {
      throw new ChannelError(
        'CHANNEL_PROVIDER_UNAVAILABLE',
        `Channel provider channel_access is unavailable: ${packageId}`,
      );
    }
    const ref = contributionRef(request.ref);
    const controller = state.provider.channel_access;
    if (controller.data_ref !== ref) {
      throw new ChannelError(
        'CHANNEL_ACCESS_UNDECLARED',
        `Channel provider data ref is not declared: ${packageId}:${ref}`,
      );
    }
    try {
      const result = await controller.read(contributionInput(request.input));
      return Object.freeze({
        ok: true,
        package_id: packageId,
        ref,
        operation: 'read',
        result: boundedChannelJsonValue(result, 'Channel access read result'),
      });
    } catch (error) {
      if (isTransportOrAuthError(error)) {
        const classified = classifyDisconnectError(error);
        await this.safeDisconnect(packageId, classified.reason, error, state);
      }
      throw error;
    }
  }

  async executeChannelAccessAction(
    request: ChannelProviderContributionRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    const packageId = requiredString(request?.package_id, 'package_id');
    const state = this.#providers.get(packageId);
    if (!state || state.status !== 'active' || !state.provider.channel_access) {
      throw new ChannelError(
        'CHANNEL_PROVIDER_UNAVAILABLE',
        `Channel provider channel_access is unavailable: ${packageId}`,
      );
    }
    const ref = contributionRef(request.ref);
    const controller = state.provider.channel_access;
    if (!controller.action_refs.includes(ref)) {
      throw new ChannelError(
        'CHANNEL_ACCESS_UNDECLARED',
        `Channel provider action ref is not declared: ${packageId}:${ref}`,
      );
    }
    if (state.confirmation_required_refs.has(ref) && request.confirmed !== true) {
      throw new ChannelError(
        'CHANNEL_CONFIRMATION_REQUIRED',
        `Channel provider action requires confirmation: ${packageId}:${ref}`,
      );
    }
    try {
      const result = await controller.execute({
        action_ref: ref,
        input: contributionInput(request.input),
      });
      return Object.freeze({
        ok: true,
        package_id: packageId,
        ref,
        operation: 'execute',
        result: boundedChannelJsonValue(result, 'Channel access action result'),
      });
    } catch (error) {
      if (isTransportOrAuthError(error)) {
        const classified = classifyDisconnectError(error);
        await this.safeDisconnect(packageId, classified.reason, error, state);
      }
      throw error;
    }
  }

  getStateProjection(): ChannelProviderHostProjection {
    const activeProviderIds = new Set(
      [...this.#providers.values()]
        .filter((s) => s.status === 'active')
        .map((s) => s.provider.provider_id),
    );
    const providers = [...this.#providers.values()]
      .map((s) =>
        Object.freeze({
          package_id: s.package_id,
          provider_id: s.provider.provider_id,
          status: s.status,
          has_channel_access: Boolean(s.provider.channel_access),
          ...(s.last_reason ? { last_reason: s.last_reason } : {}),
          ...(s.last_error_code ? { last_error_code: s.last_error_code } : {}),
        }),
      )
      .sort((a, b) => a.provider_id.localeCompare(b.provider_id));

    const transportBindings: ChannelTransportBindingsProjection =
      activeProviderIds.size === 0
        ? Object.freeze({
            surface_kind: 'opl_app_transport_bindings_projection.v1',
            status: 'unavailable',
            bindings: Object.freeze([]),
            unavailable_reason: 'producer_absent',
          })
        : this.#transportBindingsProjection.status === 'available'
          ? Object.freeze({
              surface_kind: 'opl_app_transport_bindings_projection.v1',
              status: 'available',
              bindings: Object.freeze(
                this.#transportBindingsProjection.bindings.filter((b) =>
                  activeProviderIds.has(b.provider_id),
                ),
              ),
            })
          : this.#transportBindingsProjection;

    const uiViews = [...this.#providers.values()]
      .filter((s) => s.status === 'active' && s.ui_views.length > 0)
      .map((s) =>
        Object.freeze({
          package_id: s.package_id,
          views: Object.freeze([...s.ui_views]),
        }),
      );

    return Object.freeze({
      surface_kind: 'opl_connect_channel_provider_host_projection.v1',
      callback_api_version: CHANNEL_THREAD_CALLBACK_API_VERSION,
      providers: Object.freeze(providers),
      transport_bindings: transportBindings,
      ui_views: Object.freeze(uiViews),
    });
  }

  private transitionStatus(
    state: ManagedProviderState,
    nextStatus: ChannelHostStatus,
    reason?: ChannelDisconnectReason,
    errorCode?: string,
  ): void {
    const previous = state.status;
    state.status = nextStatus;
    if (reason) state.last_reason = reason;
    if (errorCode) state.last_error_code = errorCode;

    this.eventBus.emit('channel.provider.status_changed', {
      package_id: state.package_id,
      provider_id: state.provider.provider_id,
      previous_status: previous,
      status: nextStatus,
      ...(reason ? { reason } : {}),
      ...(errorCode ? { error_code: errorCode } : {}),
      timestamp: nowIso(),
    });
  }
}
