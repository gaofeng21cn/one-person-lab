import { Context } from '@deepseek-ai/cordis';

import {
  assertRemoteCompanionActivationContext,
  assertRemoteCompanionConnector,
  assertRemoteCompanionConversationBridge,
  assertRemoteCompanionDisposable,
  assertRemoteCompanionProtectedBlobBytes,
  assertRemoteCompanionProtectedBlobPort,
  REMOTE_COMPANION_CONNECTOR_CALLBACK_API_VERSION,
  REMOTE_COMPANION_CONNECTOR_HOST_SERVICE_ID,
  type RemoteCompanionActivationContext,
  type RemoteCompanionConnector,
  type RemoteCompanionConversationBridge,
  type RemoteCompanionDisposable,
  type RemoteCompanionEventObserver,
  type RemoteCompanionProtectedBlobHost,
  type RemoteCompanionProtectedBlobPort,
} from '../../authority/packages/index.ts';
import type {
  InstalledRemoteCompanionConnectorAttachment,
} from '../../adapters/integration/public/remote-companion-connector-entrypoints.ts';
import {
  buildCordisPluginDescriptor,
  type CordisPluginDescriptor,
} from '../../authority/packages/index.ts';
import { boundedJsonValue } from '../../kernel/json-record.ts';
import { buildAppUiContributionsProjection } from '../../read-models/operator/index.ts';

export const CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_PLUGIN_ID =
  'opl-connect-remote-companion-connector-host';
export const CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_PLUGIN_API_VERSION = '1.0.0';
export const CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_SERVICE =
  REMOTE_COMPANION_CONNECTOR_HOST_SERVICE_ID;
export const CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_SOURCE_REF =
  'src/host/plugins/cordis-remote-companion-connector-host.ts';
export const CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_SOURCE_COMMIT =
  '31f07588182c78c90c46075e6a65920023d9d805';

export type CordisRemoteCompanionConnectorHostService = Readonly<{
  callback_api_version: typeof REMOTE_COMPANION_CONNECTOR_CALLBACK_API_VERSION;
  attach(attachment: InstalledRemoteCompanionConnectorAttachment): Promise<RemoteCompanionDisposable>;
  appStatePatch(): Readonly<Record<string, unknown>>;
  readRemoteCompanionAccess(
    input: CordisRemoteCompanionAccessRequest,
  ): Promise<Readonly<Record<string, unknown>>>;
  executeRemoteCompanionAction(
    input: CordisRemoteCompanionAccessRequest,
  ): Promise<Readonly<Record<string, unknown>>>;
}>;

export type CordisRemoteCompanionConnectorHostPluginConfig = Readonly<{
  canonical_conversation_bridge: RemoteCompanionConversationBridge;
  connectors?: readonly InstalledRemoteCompanionConnectorAttachment[];
  protectedBlobHost?: RemoteCompanionProtectedBlobHost;
  protectedBlobPort?: RemoteCompanionProtectedBlobPort;
}>;

export type CordisRemoteCompanionAccessRequest = Readonly<{
  package_id: string;
  ref: string;
  input?: Readonly<Record<string, unknown>>;
  confirmed?: boolean;
}>;

type ActiveRemoteCompanion = Readonly<{
  status: 'active' | 'unavailable';
  attachment: InstalledRemoteCompanionConnectorAttachment;
  connector: RemoteCompanionConnector;
  confirmationRequiredRefs: ReadonlySet<string>;
  unavailable_reason?: 'protected_blob_host_absent' | 'protected_blob_host_unavailable';
}>;

type RemoteCompanionConnectorProjection = Readonly<{
  surface_kind: 'opl_app_remote_companion_connector_projection.v1';
  status: 'available' | 'unavailable';
  connectors: readonly Readonly<{
    package_id: string;
    status: 'active' | 'unavailable';
    remote_companion_access: 'available' | 'unavailable';
    unavailable_reason?: 'protected_blob_host_absent' | 'protected_blob_host_unavailable';
  }>[];
  authority_boundary: typeof remoteCompanionAuthorityBoundary;
}>;

declare module '@deepseek-ai/cordis' {
  interface Context {
    [CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_SERVICE]: CordisRemoteCompanionConnectorHostService;
  }
}

const remoteCompanionAuthorityBoundary = Object.freeze({
  package_identity_owner: 'installed_manifest_package_id',
  lifecycle_owner: 'opl_framework_cordis_composition',
  conversation_truth_owner: 'canonical_codex_app_server',
  provider_history_truth: 'forbidden',
  persistence_role: 'protected_blob_only_and_package_scoped',
  credential_role: 'no_credential_material',
  product_truth_owner: 'opl_link',
});

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Remote companion callback requires ${field}.`);
  }
  return value;
}

function exactString(value: unknown, field: string): string {
  const result = requiredString(value, field);
  if (result !== result.trim() || result.length > 512 || result.includes('\0')) {
    throw new TypeError(`Remote companion callback requires exact ${field}.`);
  }
  return result;
}

function contributionRef(value: unknown): string {
  const ref = requiredString(value, 'ref');
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?(?:#[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)?$/.test(ref)) {
    throw new TypeError('Remote companion app contribution ref is invalid.');
  }
  return ref;
}

function contributionInput(value: unknown): Readonly<Record<string, unknown>> {
  const input = boundedJsonValue(value ?? {}, 'Remote companion app contribution input');
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Remote companion app contribution input must be a JSON object.');
  }
  return Object.freeze(input as Record<string, unknown>);
}

function contributionReadback(
  active: ActiveRemoteCompanion,
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
        result: boundedJsonValue(result, 'Remote companion app contribution result'),
      },
    },
  });
}

function descriptorArtifactDigest(
  attachment: InstalledRemoteCompanionConnectorAttachment,
): string | null {
  const manifest = attachment.descriptor.manifest as Record<string, unknown>;
  const candidate = manifest.artifact_digest
    ?? manifest.package_artifact_digest
    ?? attachment.descriptor.manifest.content_digest
    ?? null;
  return typeof candidate === 'string' && /^sha256:[0-9a-f]{64}$/.test(candidate)
    ? candidate
    : null;
}

function assertActivationContext(
  attachment: InstalledRemoteCompanionConnectorAttachment,
) {
  const { descriptor } = attachment;
  const context: RemoteCompanionActivationContext = attachment.activation_context;
  assertRemoteCompanionActivationContext(context);
  if (context.package_id !== descriptor.manifest.package_id) {
    throw new Error(`Remote companion activation context package identity mismatch: ${descriptor.manifest.package_id}`);
  }
  if (
    typeof descriptor.manifest.content_digest !== 'string'
    || context.package_content_digest !== descriptor.manifest.content_digest
  ) {
    throw new Error(`Remote companion activation context content digest mismatch: ${descriptor.manifest.package_id}`);
  }
  if (context.package_artifact_digest !== descriptorArtifactDigest(attachment)) {
    throw new Error(`Remote companion activation context artifact digest mismatch: ${descriptor.manifest.package_id}`);
  }
}

function packageBlobKey(packageId: string, key: unknown): string {
  const normalizedPackageId = exactString(packageId, 'package_id');
  const normalizedKey = exactString(key, 'protected_blob_key');
  if (normalizedKey.length > 512 || normalizedKey.includes('\0')) {
    throw new TypeError('Remote companion protected blob key is invalid.');
  }
  return `${normalizedPackageId}\0${normalizedKey}`;
}

function scopedProtectedBlobPort(
  raw: RemoteCompanionProtectedBlobPort,
  packageId: string,
  alreadyScoped: boolean,
): RemoteCompanionProtectedBlobPort {
  assertRemoteCompanionProtectedBlobPort(raw);
  const key = (value: unknown) => alreadyScoped
    ? exactString(value, 'protected_blob_key')
    : packageBlobKey(packageId, value);
  return Object.freeze({
    async read(value: string) {
      const bytes = await raw.read(key(value));
      if (bytes === null) return null;
      assertRemoteCompanionProtectedBlobBytes(bytes, 'protected blob readback');
      return new Uint8Array(bytes);
    },
    async replace(value: string, bytes: Uint8Array) {
      assertRemoteCompanionProtectedBlobBytes(bytes);
      await raw.replace(key(value), new Uint8Array(bytes));
    },
    async clear(value: string) {
      await raw.clear(key(value));
    },
  });
}

type ProtectedBlobResolution = Readonly<{
  port: RemoteCompanionProtectedBlobPort | null;
  unavailable_reason:
    | 'protected_blob_host_absent'
    | 'protected_blob_host_unavailable'
    | null;
}>;

function resolveProtectedBlobPort(
  attachment: InstalledRemoteCompanionConnectorAttachment,
  config: CordisRemoteCompanionConnectorHostPluginConfig,
): ProtectedBlobResolution {
  const packageId = attachment.descriptor.manifest.package_id;
  if (!config.protectedBlobHost && !config.protectedBlobPort) {
    return Object.freeze({
      port: null,
      unavailable_reason: 'protected_blob_host_absent',
    });
  }
  try {
    const raw = config.protectedBlobHost
      ? config.protectedBlobHost.forPackage(packageId)
      : config.protectedBlobPort!;
    return Object.freeze({
      port: scopedProtectedBlobPort(
        raw,
        packageId,
        Boolean(config.protectedBlobHost),
      ),
      unavailable_reason: null,
    });
  } catch {
    return Object.freeze({
      port: null,
      unavailable_reason: 'protected_blob_host_unavailable',
    });
  }
}

function connectorProjection(
  activeConnectors: readonly ActiveRemoteCompanion[],
): RemoteCompanionConnectorProjection {
  const connectors = activeConnectors
    .map((active) => ({
      package_id: active.attachment.descriptor.manifest.package_id,
      status: active.status,
      remote_companion_access: active.status === 'active' && active.connector.remote_companion_access
        ? 'available' as const
        : 'unavailable' as const,
      ...(active.unavailable_reason ? { unavailable_reason: active.unavailable_reason } : {}),
    }))
    .sort((left, right) => left.package_id.localeCompare(right.package_id));
  return Object.freeze({
    surface_kind: 'opl_app_remote_companion_connector_projection.v1',
    status: connectors.some((connector) => connector.status !== 'active')
      ? 'unavailable'
      : 'available',
    connectors: Object.freeze(connectors),
    authority_boundary: remoteCompanionAuthorityBoundary,
  });
}

function callbackBridge(
  callback: RemoteCompanionConversationBridge,
): RemoteCompanionConversationBridge {
  assertRemoteCompanionConversationBridge(callback);
  return Object.freeze({
    listDirectory: (input = {}) => callback.listDirectory(input),
    readHistory: (input) => callback.readHistory(input),
    startConversation: (input) => callback.startConversation(input),
    openConversation: (input) => callback.openConversation(input),
    sendMessage: (input) => callback.sendMessage(input),
    subscribeEvents(observer: RemoteCompanionEventObserver, input = {}) {
      if (!observer || typeof observer.onEvent !== 'function') {
        throw new TypeError('Remote companion event subscription requires an event observer.');
      }
      const subscription = callback.subscribeEvents(observer, input);
      assertRemoteCompanionDisposable(subscription);
      return Object.freeze({ dispose: () => subscription.dispose() });
    },
    stopTurn: (input) => callback.stopTurn(input),
    respondApproval: (input) => callback.respondApproval(input),
    refresh: (input = {}) => callback.refresh(input),
  });
}

export const cordisRemoteCompanionConnectorHostPlugin = {
  name: CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_PLUGIN_ID,
  provide: CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_SERVICE,
  async apply(ctx: Context, config: CordisRemoteCompanionConnectorHostPluginConfig) {
    const boundedConversationBridge = callbackBridge(config.canonical_conversation_bridge);
    const activeConnectors = new Map<string, ActiveRemoteCompanion>();
    const attach = async (
      attachment: InstalledRemoteCompanionConnectorAttachment,
    ): Promise<RemoteCompanionDisposable> => {
      assertRemoteCompanionConnector(attachment.connector);
      assertActivationContext(attachment);
      const packageId = attachment.descriptor.manifest.package_id;
      if (activeConnectors.has(packageId)) {
        throw new Error(`Remote companion connector is already attached: ${packageId}`);
      }
      const confirmationRequiredRefs = new Set(
        attachment.descriptor.manifest.app_contributions?.commands
          .filter((entry) => entry.confirmation_required)
          .map((entry) => entry.action_ref) ?? [],
      );
      const protectedBlobResolution = resolveProtectedBlobPort(attachment, config);
      if (protectedBlobResolution.unavailable_reason) {
        const state: ActiveRemoteCompanion = Object.freeze({
          status: 'unavailable',
          attachment,
          connector: attachment.connector,
          confirmationRequiredRefs,
          unavailable_reason: protectedBlobResolution.unavailable_reason,
        });
        activeConnectors.set(packageId, state);
        let disposed = false;
        const disposeEffect = ctx.effect(() => async () => {
          if (disposed) return;
          disposed = true;
          activeConnectors.delete(packageId);
        }, `remote-companion-connector:${packageId}`);
        return Object.freeze({ dispose: () => disposeEffect() });
      }
      let connectorDisposable: RemoteCompanionDisposable;
      try {
        connectorDisposable = await attachment.connector.start({
          activation_context: attachment.activation_context,
          canonical_conversation_bridge: boundedConversationBridge,
          protected_blob: protectedBlobResolution.port!,
        });
        assertRemoteCompanionDisposable(connectorDisposable);
      } catch (error) {
        activeConnectors.delete(packageId);
        throw error;
      }
      const state: ActiveRemoteCompanion = Object.freeze({
        status: 'active',
        attachment,
        connector: attachment.connector,
        confirmationRequiredRefs,
      });
      activeConnectors.set(packageId, state);
      let disposed = false;
      const disposeEffect = ctx.effect(() => async () => {
        if (disposed) return;
        disposed = true;
        activeConnectors.delete(packageId);
        await connectorDisposable.dispose();
      }, `remote-companion-connector:${packageId}`);
      return Object.freeze({ dispose: () => disposeEffect() });
    };
    const contribution = (input: CordisRemoteCompanionAccessRequest) => {
      const packageId = requiredString(input?.package_id, 'package_id');
      const active = activeConnectors.get(packageId);
      if (active?.status !== 'active' || !active.connector.remote_companion_access) {
        throw new Error(`Remote companion remote_companion_access is unavailable: ${packageId}`);
      }
      return {
        active,
        controller: active.connector.remote_companion_access,
      };
    };
    const service: CordisRemoteCompanionConnectorHostService = {
      callback_api_version: REMOTE_COMPANION_CONNECTOR_CALLBACK_API_VERSION,
      attach,
      appStatePatch() {
        const packageStatusById = Object.fromEntries([...activeConnectors]
          .filter(([, active]) => active.status === 'active' && active.connector.remote_companion_access)
          .map(([packageId, active]) => [packageId, {
            presence: { installed: true },
            capability_exposure: { status: 'enabled' },
            app_contributions: active.attachment.descriptor.manifest.app_contributions,
          }]));
        return Object.freeze({
          ui_contributions: buildAppUiContributionsProjection(packageStatusById, {
            actionRoute: 'opl.connect.remote-companion-connector-host',
          }),
          remote_companion: connectorProjection([...activeConnectors.values()]),
        });
      },
      async readRemoteCompanionAccess(input) {
        const { active, controller } = contribution(input);
        const ref = contributionRef(input.ref);
        if (controller.data_ref !== ref) {
          throw new Error(`Remote companion remote_companion_access data ref is not declared: ${active.attachment.descriptor.manifest.package_id}:${ref}`);
        }
        const result = await controller.read(contributionInput(input.input));
        return contributionReadback(active, ref, 'read', result);
      },
      async executeRemoteCompanionAction(input) {
        const { active, controller } = contribution(input);
        const ref = contributionRef(input.ref);
        if (!controller.action_refs.includes(ref)) {
          throw new Error(`Remote companion remote_companion_access action ref is not declared: ${active.attachment.descriptor.manifest.package_id}:${ref}`);
        }
        if (active.confirmationRequiredRefs.has(ref) && input.confirmed !== true) {
          throw new Error(`Remote companion remote_companion_access action requires confirmation: ${active.attachment.descriptor.manifest.package_id}:${ref}`);
        }
        const result = await controller.execute({
          action_ref: ref,
          input: contributionInput(input.input),
        });
        return contributionReadback(active, ref, 'execute', result);
      },
    };
    ctx.provide(CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_SERVICE, service);
    for (const attachment of config.connectors ?? []) await attach(attachment);
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
  'conversation_history_persistence',
  'provider_history_as_conversation_truth',
]);

export const CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_PLUGIN_DESCRIPTOR: CordisPluginDescriptor =
  buildCordisPluginDescriptor({
    plugin_id: CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_PLUGIN_ID,
    plugin_api_version: CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_PLUGIN_API_VERSION,
    source_ref: CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_SOURCE_REF,
    source_commit: CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_SOURCE_COMMIT,
    package_ref: {
      package_id: 'opl-framework',
      package_version: '0.3.5',
      package_ref: 'workspace:opl-framework@0.3.5',
    },
    required: false,
    provides: [CORDIS_REMOTE_COMPANION_CONNECTOR_HOST_SERVICE],
    injects: { required: [], optional: [] },
    events: [],
    scope: 'composition',
    trust: 'first_party_restricted',
    disposer: { required: true, boundary: 'plugin_fiber' },
    authority_boundary: { forbidden_authorities: forbiddenAuthorities },
  });
