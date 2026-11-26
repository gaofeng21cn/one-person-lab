import { EventBus, nowIso } from '@opl/core';

import { assertDeclaredChannelAccessMatches } from './discovery.ts';
import {
  ChannelError,
  REMOTE_COMPANION_CONNECTOR_CALLBACK_API_VERSION,
  assertRemoteCompanionActivationContext,
  assertRemoteCompanionConnector,
  assertRemoteCompanionConversationBridge,
  assertRemoteCompanionDisposable,
  assertRemoteCompanionProtectedBlobBytes,
  assertRemoteCompanionProtectedBlobPort,
  boundedChannelJsonValue,
  type ChannelDisconnectReason,
  type ChannelEventBus,
  type ChannelHostEvents,
  type ChannelPackageDiscovery,
  type ChannelUiViewDeclaration,
  type InstalledRemoteCompanionAttachment,
  type RemoteCompanionConversationBridge,
  type RemoteCompanionDisposable,
  type RemoteCompanionEventObserver,
  type RemoteCompanionProtectedBlobHost,
  type RemoteCompanionProtectedBlobPort,
  type RemoteCompanionStatus,
} from './types.ts';

interface ManagedCompanionState {
  status: RemoteCompanionStatus;
  readonly attachment: InstalledRemoteCompanionAttachment;
  readonly confirmation_required_refs: ReadonlySet<string>;
  readonly subscriptions: Set<RemoteCompanionDisposable>;
  connector_disposable: RemoteCompanionDisposable | null;
  disconnecting_promise: Promise<void> | null;
  unavailable_reason?: 'protected_blob_host_absent' | 'protected_blob_host_unavailable';
  last_reason?: ChannelDisconnectReason;
  last_error_code?: string;
}

export interface RemoteCompanionConnectorHostOptions {
  readonly bridge: RemoteCompanionConversationBridge;
  readonly protectedBlobHost?: RemoteCompanionProtectedBlobHost;
  readonly protectedBlobPort?: RemoteCompanionProtectedBlobPort;
  readonly eventBus?: ChannelEventBus;
  readonly discovery?: ChannelPackageDiscovery;
  readonly disconnectTimeoutMs?: number;
}

export interface RemoteCompanionAccessRequest {
  readonly package_id: string;
  readonly ref: string;
  readonly input?: Readonly<Record<string, unknown>>;
  readonly confirmed?: boolean;
}

export interface RemoteCompanionConnectorProjectionEntry {
  readonly package_id: string;
  readonly status: RemoteCompanionStatus;
  readonly remote_companion_access: 'available' | 'unavailable';
  readonly unavailable_reason?: 'protected_blob_host_absent' | 'protected_blob_host_unavailable';
  readonly last_reason?: ChannelDisconnectReason;
  readonly last_error_code?: string;
}

export interface RemoteCompanionHostProjection {
  readonly surface_kind: 'opl_connect_remote_companion_host_projection.v1';
  readonly callback_api_version: typeof REMOTE_COMPANION_CONNECTOR_CALLBACK_API_VERSION;
  readonly status: 'available' | 'unavailable';
  readonly connectors: readonly RemoteCompanionConnectorProjectionEntry[];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', `Remote companion callback requires ${field}.`);
  }
  return value;
}

function exactString(value: unknown, field: string): string {
  const result = requiredString(value, field);
  if (result !== result.trim() || result.length > 512 || result.includes('\0')) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', `Remote companion requires exact ${field}.`);
  }
  return result;
}

function contributionRef(value: unknown): string {
  const ref = requiredString(value, 'ref');
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?(?:#[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)?$/.test(ref)) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Remote companion contribution ref is invalid.');
  }
  return ref;
}

function contributionInput(value: unknown): Readonly<Record<string, unknown>> {
  const input = boundedChannelJsonValue(value ?? {}, 'Remote companion contribution input');
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Remote companion contribution input must be an object.');
  }
  return Object.freeze(input as Record<string, unknown>);
}

function packageBlobKey(packageId: string, key: unknown): string {
  const cleanPkg = exactString(packageId, 'package_id');
  const cleanKey = exactString(key, 'protected_blob_key');
  return `${cleanPkg}\0${cleanKey}`;
}

function scopedProtectedBlobPort(
  raw: RemoteCompanionProtectedBlobPort,
  packageId: string,
  alreadyScoped: boolean,
): RemoteCompanionProtectedBlobPort {
  assertRemoteCompanionProtectedBlobPort(raw);
  const resolveKey = (key: unknown): string =>
    alreadyScoped ? exactString(key, 'protected_blob_key') : packageBlobKey(packageId, key);

  return Object.freeze({
    read: async (key: string) => {
      const bytes = await raw.read(resolveKey(key));
      if (bytes === null) return null;
      assertRemoteCompanionProtectedBlobBytes(bytes, 'protected blob readback');
      return new Uint8Array(bytes);
    },
    replace: async (key: string, value: Uint8Array) => {
      assertRemoteCompanionProtectedBlobBytes(value);
      await raw.replace(resolveKey(key), new Uint8Array(value));
    },
    clear: async (key: string) => {
      await raw.clear(resolveKey(key));
    },
  });
}

function classifyDisconnectError(error: unknown): {
  reason: 'transport_error' | 'auth_error' | 'callback_error' | 'digest_changed';
  code: string;
} {
  if (error instanceof ChannelError) {
    if (error.code === 'CHANNEL_AUTH_ERROR') return { reason: 'auth_error', code: error.code };
    if (error.code === 'CHANNEL_TRANSPORT_ERROR') return { reason: 'transport_error', code: error.code };
    if (error.code === 'CHANNEL_DIGEST_MISMATCH') return { reason: 'digest_changed', code: error.code };
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
    // Isolate disposal failure.
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export class RemoteCompanionConnectorHost {
  readonly callback_api_version = REMOTE_COMPANION_CONNECTOR_CALLBACK_API_VERSION;
  readonly eventBus: ChannelEventBus;
  readonly #bridge: RemoteCompanionConversationBridge;
  readonly #protectedBlobHost?: RemoteCompanionProtectedBlobHost;
  readonly #protectedBlobPort?: RemoteCompanionProtectedBlobPort;
  readonly #discovery?: ChannelPackageDiscovery;
  readonly #disconnectTimeoutMs: number;
  readonly #connectors = new Map<string, ManagedCompanionState>();

  constructor(options: RemoteCompanionConnectorHostOptions) {
    assertRemoteCompanionConversationBridge(options.bridge);
    this.#bridge = options.bridge;
    this.#protectedBlobHost = options.protectedBlobHost;
    this.#protectedBlobPort = options.protectedBlobPort;
    this.eventBus = options.eventBus ?? new EventBus<ChannelHostEvents>();
    this.#discovery = options.discovery;
    this.#disconnectTimeoutMs = options.disconnectTimeoutMs ?? 2_000;
  }

  async attach(attachment: InstalledRemoteCompanionAttachment): Promise<RemoteCompanionDisposable> {
    assertRemoteCompanionConnector(attachment.connector);
    assertRemoteCompanionActivationContext(attachment.activation_context);

    const ctx = attachment.activation_context;
    if (ctx.package_id !== attachment.package_id) {
      throw new ChannelError(
        'CHANNEL_IDENTITY_MISMATCH',
        `Activation context package_id '${ctx.package_id}' does not match '${attachment.package_id}'.`,
      );
    }
    if (ctx.package_content_digest !== attachment.content_digest) {
      throw new ChannelError(
        'CHANNEL_DIGEST_MISMATCH',
        `Activation context content_digest mismatch for '${attachment.package_id}'.`,
      );
    }
    if (ctx.package_artifact_digest !== attachment.artifact_digest) {
      throw new ChannelError(
        'CHANNEL_DIGEST_MISMATCH',
        `Activation context artifact_digest mismatch for '${attachment.package_id}'.`,
      );
    }

    const existing = this.#connectors.get(attachment.package_id);
    if (
      existing
      && existing.status !== 'disconnected'
      && existing.status !== 'error'
    ) {
      throw new ChannelError(
        'CHANNEL_PROVIDER_DUPLICATE',
        `Remote companion connector is already attached: ${attachment.package_id}`,
      );
    }

    const uiViews: readonly ChannelUiViewDeclaration[] = attachment.ui_views ?? [];
    let confirmationRequiredRefs: ReadonlySet<string> = new Set();
    if (attachment.connector.remote_companion_access && uiViews.length > 0) {
      confirmationRequiredRefs = assertDeclaredChannelAccessMatches(
        uiViews,
        attachment.connector.remote_companion_access,
        'remote_companion_access',
      );
    }

    const state: ManagedCompanionState = {
      status: 'registered',
      attachment,
      confirmation_required_refs: confirmationRequiredRefs,
      subscriptions: new Set(),
      connector_disposable: null,
      disconnecting_promise: null,
    };
    this.#connectors.set(attachment.package_id, state);

    const blobResolution = this.resolveProtectedBlobPort(attachment.package_id);
    if (blobResolution.unavailable_reason) {
      state.unavailable_reason = blobResolution.unavailable_reason;
      this.transitionStatus(state, 'unavailable', undefined, undefined, blobResolution.unavailable_reason);
      return Object.freeze({
        dispose: async () => {
          if (this.#connectors.get(attachment.package_id) !== state) return;
          await this.safeDisconnect(attachment.package_id, 'manual_detach', undefined, state);
        },
      });
    }

    this.transitionStatus(state, 'starting');

    const wrapBridgeCall = async <T>(fn: () => Promise<T>): Promise<T> => {
      if (state.status !== 'active' && state.status !== 'starting') {
        throw new ChannelError(
          'CHANNEL_PROVIDER_UNAVAILABLE',
          `Remote companion connector '${attachment.package_id}' is ${state.status}.`,
        );
      }
      try {
        return await fn();
      } catch (error) {
        if (isTransportOrAuthError(error)) {
          const classified = classifyDisconnectError(error);
          await this.safeDisconnect(attachment.package_id, classified.reason, error, state);
        }
        throw error;
      }
    };

    const rawBridge: RemoteCompanionConversationBridge = {
      listDirectory: (input = {}) => wrapBridgeCall(() => this.#bridge.listDirectory(input)),
      readHistory: (input) => wrapBridgeCall(() => this.#bridge.readHistory(input)),
      startConversation: (input) => wrapBridgeCall(() => this.#bridge.startConversation(input)),
      openConversation: (input) => wrapBridgeCall(() => this.#bridge.openConversation(input)),
      sendMessage: (input) => wrapBridgeCall(() => this.#bridge.sendMessage(input)),
      subscribeEvents: (observer: RemoteCompanionEventObserver, input = {}) => {
        if (state.status !== 'active' && state.status !== 'starting') {
          throw new ChannelError(
            'CHANNEL_PROVIDER_UNAVAILABLE',
            `Remote companion connector '${attachment.package_id}' is ${state.status}.`,
          );
        }
        if (!observer || typeof observer.onEvent !== 'function') {
          throw new ChannelError('CHANNEL_INVALID_INPUT', 'Remote companion event subscription requires an observer.');
        }
        const rawSub = this.#bridge.subscribeEvents(observer, input);
        assertRemoteCompanionDisposable(rawSub);
        let subDisposed = false;
        const tracked: RemoteCompanionDisposable = Object.freeze({
          dispose: async () => {
            if (subDisposed) return;
            subDisposed = true;
            state.subscriptions.delete(tracked);
            await rawSub.dispose();
          },
        });
        state.subscriptions.add(tracked);
        return tracked;
      },
      stopTurn: (input) => wrapBridgeCall(() => this.#bridge.stopTurn(input)),
      respondApproval: (input) => wrapBridgeCall(() => this.#bridge.respondApproval(input)),
      refresh: (input = {}) => wrapBridgeCall(() => this.#bridge.refresh(input)),
    };
    const boundedBridge: RemoteCompanionConversationBridge = Object.freeze(rawBridge);

    try {
      const disposable = await attachment.connector.start({
        activation_context: attachment.activation_context,
        canonical_conversation_bridge: boundedBridge,
        protected_blob: blobResolution.port!,
        reportError: (error) => {
          if (this.#connectors.get(attachment.package_id) !== state) return;
          const classified = classifyDisconnectError(error);
          void this.safeDisconnect(attachment.package_id, classified.reason, error, state);
        },
      });
      assertRemoteCompanionDisposable(disposable);
      if (state.disconnecting_promise) {
        await state.disconnecting_promise;
      }
      if (state.status !== 'starting' || this.#connectors.get(attachment.package_id) !== state) {
        await disposeWithTimeout(disposable, this.#disconnectTimeoutMs);
        throw new ChannelError(
          'CHANNEL_PROVIDER_UNAVAILABLE',
          `Remote companion connector '${attachment.package_id}' transitioned to '${state.status}' during startup.`,
        );
      }
      state.connector_disposable = disposable;
      this.transitionStatus(state, 'active');
    } catch (error) {
      if (this.#connectors.get(attachment.package_id) === state) {
        await this.safeDisconnect(attachment.package_id, classifyDisconnectError(error).reason, error, state);
      }
      throw error;
    }

    return Object.freeze({
      dispose: async () => {
        if (this.#connectors.get(attachment.package_id) !== state) return;
        await this.safeDisconnect(attachment.package_id, 'manual_detach', undefined, state);
      },
    });
  }

  async safeDisconnect(
    packageId: string,
    reason: ChannelDisconnectReason,
    error?: unknown,
    expectedState?: ManagedCompanionState,
  ): Promise<void> {
    const state = this.#connectors.get(packageId);
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
      if (state.connector_disposable) {
        const disp = state.connector_disposable;
        state.connector_disposable = null;
        await disposeWithTimeout(disp, this.#disconnectTimeoutMs);
      }

      const terminalStatus: RemoteCompanionStatus =
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
        || reason === 'digest_changed'
        || reason === 'callback_error'
      ) {
        this.eventBus.emit('channel.companion.error', {
          package_id: packageId,
          reason,
          error_code: errCode ?? 'CHANNEL_DISCONNECTED',
          message: error instanceof Error ? error.message : 'Remote companion disconnected due to error.',
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

  async detach(packageId: string): Promise<void> {
    await this.safeDisconnect(packageId, 'manual_detach');
  }

  async dispose(): Promise<void> {
    for (const packageId of [...this.#connectors.keys()]) {
      await this.safeDisconnect(packageId, 'host_dispose');
    }
  }

  async reconcileWithInstalledPackages(): Promise<void> {
    if (!this.#discovery) return;
    const enabled = this.#discovery.listEnabledChannelPackages();
    const byId = new Map(enabled.map((pkg) => [pkg.package_id, pkg]));

    for (const [packageId, state] of [...this.#connectors.entries()]) {
      if (state.status !== 'active' && state.status !== 'starting' && state.status !== 'unavailable') {
        continue;
      }
      const pkg = byId.get(packageId);
      if (!pkg) {
        await this.safeDisconnect(packageId, 'package_disabled', undefined, state);
        continue;
      }
      if (
        pkg.content_digest !== state.attachment.content_digest
        || (
          pkg.artifact_digest !== null
          && pkg.artifact_digest !== undefined
          && pkg.artifact_digest !== state.attachment.artifact_digest
        )
      ) {
        await this.safeDisconnect(packageId, 'digest_changed', undefined, state);
      }
    }
  }

  async readRemoteCompanionAccess(
    request: RemoteCompanionAccessRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    const packageId = requiredString(request?.package_id, 'package_id');
    const state = this.#connectors.get(packageId);
    if (!state) {
      throw new ChannelError(
        'CHANNEL_PROVIDER_UNAVAILABLE',
        `Remote companion access is unavailable: ${packageId}`,
      );
    }
    const ref = contributionRef(request.ref);

    if (state.status === 'unavailable') {
      const declared = (state.attachment.ui_views ?? []).some(
        (v) => v.view_type === 'remote_companion_access' && v.data_ref === ref,
      );
      if (!declared) {
        throw new ChannelError(
          'CHANNEL_ACCESS_UNDECLARED',
          `Remote companion data ref is not declared: ${packageId}:${ref}`,
        );
      }
      return Object.freeze({
        ok: true,
        package_id: packageId,
        ref,
        operation: 'read',
        result: {
          status: 'unavailable',
          unavailable_reason: state.unavailable_reason,
          actions: [],
        },
      });
    }

    if (state.status !== 'active' || !state.attachment.connector.remote_companion_access) {
      throw new ChannelError(
        'CHANNEL_PROVIDER_UNAVAILABLE',
        `Remote companion access is unavailable (${state.status}): ${packageId}`,
      );
    }
    const controller = state.attachment.connector.remote_companion_access;
    if (controller.data_ref !== ref) {
      throw new ChannelError(
        'CHANNEL_ACCESS_UNDECLARED',
        `Remote companion data ref is not declared: ${packageId}:${ref}`,
      );
    }
    try {
      const result = await controller.read(contributionInput(request.input));
      return Object.freeze({
        ok: true,
        package_id: packageId,
        ref,
        operation: 'read',
        result: boundedChannelJsonValue(result, 'Remote companion read result'),
      });
    } catch (error) {
      if (isTransportOrAuthError(error)) {
        const classified = classifyDisconnectError(error);
        await this.safeDisconnect(packageId, classified.reason, error, state);
      }
      throw error;
    }
  }

  async executeRemoteCompanionAction(
    request: RemoteCompanionAccessRequest,
  ): Promise<Readonly<Record<string, unknown>>> {
    const packageId = requiredString(request?.package_id, 'package_id');
    const state = this.#connectors.get(packageId);
    if (!state || state.status !== 'active' || !state.attachment.connector.remote_companion_access) {
      throw new ChannelError(
        'CHANNEL_PROVIDER_UNAVAILABLE',
        `Remote companion access is unavailable: ${packageId}`,
      );
    }
    const ref = contributionRef(request.ref);
    const controller = state.attachment.connector.remote_companion_access;
    if (!controller.action_refs.includes(ref)) {
      throw new ChannelError(
        'CHANNEL_ACCESS_UNDECLARED',
        `Remote companion action ref is not declared: ${packageId}:${ref}`,
      );
    }
    if (state.confirmation_required_refs.has(ref) && request.confirmed !== true) {
      throw new ChannelError(
        'CHANNEL_CONFIRMATION_REQUIRED',
        `Remote companion action requires confirmation: ${packageId}:${ref}`,
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
        result: boundedChannelJsonValue(result, 'Remote companion action result'),
      });
    } catch (error) {
      if (isTransportOrAuthError(error)) {
        const classified = classifyDisconnectError(error);
        await this.safeDisconnect(packageId, classified.reason, error, state);
      }
      throw error;
    }
  }

  getStateProjection(): RemoteCompanionHostProjection {
    const connectors: RemoteCompanionConnectorProjectionEntry[] = [...this.#connectors.values()]
      .map((s) =>
        Object.freeze({
          package_id: s.attachment.package_id,
          status: s.status,
          remote_companion_access:
            s.status === 'active' && s.attachment.connector.remote_companion_access
              ? ('available' as const)
              : ('unavailable' as const),
          ...(s.unavailable_reason ? { unavailable_reason: s.unavailable_reason } : {}),
          ...(s.last_reason ? { last_reason: s.last_reason } : {}),
          ...(s.last_error_code ? { last_error_code: s.last_error_code } : {}),
        }),
      )
      .sort((a, b) => a.package_id.localeCompare(b.package_id));

    return Object.freeze({
      surface_kind: 'opl_connect_remote_companion_host_projection.v1',
      callback_api_version: REMOTE_COMPANION_CONNECTOR_CALLBACK_API_VERSION,
      status: connectors.length > 0 && connectors.every((c) => c.status === 'active')
        ? 'available'
        : 'unavailable',
      connectors: Object.freeze(connectors),
    });
  }

  private resolveProtectedBlobPort(packageId: string): {
    readonly port: RemoteCompanionProtectedBlobPort | null;
    readonly unavailable_reason:
      | 'protected_blob_host_absent'
      | 'protected_blob_host_unavailable'
      | null;
  } {
    if (!this.#protectedBlobHost && !this.#protectedBlobPort) {
      return { port: null, unavailable_reason: 'protected_blob_host_absent' };
    }
    try {
      const raw = this.#protectedBlobHost
        ? this.#protectedBlobHost.forPackage(packageId)
        : this.#protectedBlobPort!;
      return {
        port: scopedProtectedBlobPort(raw, packageId, Boolean(this.#protectedBlobHost)),
        unavailable_reason: null,
      };
    } catch {
      return { port: null, unavailable_reason: 'protected_blob_host_unavailable' };
    }
  }

  private transitionStatus(
    state: ManagedCompanionState,
    nextStatus: RemoteCompanionStatus,
    reason?: ChannelDisconnectReason,
    errorCode?: string,
    unavailableReason?: 'protected_blob_host_absent' | 'protected_blob_host_unavailable',
  ): void {
    const previous = state.status;
    state.status = nextStatus;
    if (reason) state.last_reason = reason;
    if (errorCode) state.last_error_code = errorCode;

    this.eventBus.emit('channel.companion.status_changed', {
      package_id: state.attachment.package_id,
      previous_status: previous,
      status: nextStatus,
      ...(reason ? { reason } : {}),
      ...(unavailableReason ? { unavailable_reason: unavailableReason } : {}),
      ...(errorCode ? { error_code: errorCode } : {}),
      timestamp: nowIso(),
    });
  }
}
