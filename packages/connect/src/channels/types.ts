import type { EventBus } from '@opl/core';

export const CHANNEL_THREAD_CALLBACK_API_VERSION = '1.0.0' as const;
export const REMOTE_COMPANION_CONNECTOR_CALLBACK_API_VERSION = '1.0.0' as const;
export const REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES = 262_144;
export const MAX_CHANNEL_JSON_BYTES = 1024 * 1024;

export type ChannelHostStatus =
  | 'registered'
  | 'starting'
  | 'active'
  | 'degraded'
  | 'disconnecting'
  | 'disconnected'
  | 'error';

export type RemoteCompanionStatus =
  | 'registered'
  | 'starting'
  | 'active'
  | 'unavailable'
  | 'disconnecting'
  | 'disconnected'
  | 'error';

export type ChannelDisconnectReason =
  | 'host_dispose'
  | 'manual_detach'
  | 'transport_error'
  | 'auth_error'
  | 'digest_changed'
  | 'package_disabled'
  | 'package_uninstalled'
  | 'callback_error';

export type ChannelErrorCode =
  | 'CHANNEL_INVALID_INPUT'
  | 'CHANNEL_PROVIDER_DUPLICATE'
  | 'CHANNEL_PROVIDER_UNAVAILABLE'
  | 'CHANNEL_IDENTITY_MISMATCH'
  | 'CHANNEL_ACCESS_UNDECLARED'
  | 'CHANNEL_CONFIRMATION_REQUIRED'
  | 'CHANNEL_TRANSPORT_ERROR'
  | 'CHANNEL_AUTH_ERROR'
  | 'CHANNEL_DIGEST_MISMATCH'
  | 'COMPANION_BLOB_LIMIT_EXCEEDED'
  | 'COMPANION_BLOB_UNAVAILABLE';

export class ChannelError extends Error {
  readonly code: ChannelErrorCode;
  readonly reason?: ChannelDisconnectReason;

  constructor(
    code: ChannelErrorCode,
    message: string,
    options: { readonly reason?: ChannelDisconnectReason; readonly cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ChannelError';
    this.code = code;
    this.reason = options.reason;
  }
}

export interface ChannelConversationIdentity {
  readonly provider_id: string;
  readonly account_id: string;
  readonly channel_session_id: string;
}

export interface ChannelThreadRef {
  readonly canonical_thread_host: string;
  readonly canonical_thread_id: string;
}

export interface ChannelTurnRef extends ChannelThreadRef {
  readonly canonical_turn_id: string;
}

export type ChannelThreadBinding = ChannelConversationIdentity & ChannelThreadRef;

export type ChannelTurnTerminalEvent = ChannelTurnRef & (
  | {
      readonly status: 'completed';
      readonly response_text: string;
    }
  | {
      readonly status: 'failed';
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    }
  | {
      readonly status: 'cancelled';
    }
);

export interface ChannelTurnTerminalObserver {
  onTerminal(event: ChannelTurnTerminalEvent): void | Promise<void>;
}

export interface ChannelDisposable {
  dispose(): void | Promise<void>;
}

export interface ChannelThreadCallback {
  startThread(input: ChannelConversationIdentity): Promise<ChannelThreadRef>;
  resumeThread(input: ChannelThreadRef): Promise<void>;
  startTurn(input: ChannelThreadRef & { readonly text: string }): Promise<ChannelTurnRef>;
  subscribeTurn(input: ChannelTurnRef, observer: ChannelTurnTerminalObserver): ChannelDisposable;
}

export interface ChannelThreadHostCallback extends ChannelThreadCallback {
  readTransportBindings?(): Promise<readonly ChannelThreadBinding[]>;
}

export interface ChannelAccessController {
  readonly data_ref: string;
  readonly action_refs: readonly string[];
  read(input: Readonly<Record<string, unknown>>): unknown | Promise<unknown>;
  execute(input: {
    readonly action_ref: string;
    readonly input: Readonly<Record<string, unknown>>;
  }): unknown | Promise<unknown>;
}

export interface ChannelProviderStartInput {
  readonly callback_api_version: typeof CHANNEL_THREAD_CALLBACK_API_VERSION;
  readonly callback: ChannelThreadCallback;
  readonly reportError?: (error: unknown) => void;
}

export interface ChannelProvider {
  readonly provider_id: string;
  readonly channel_access?: ChannelAccessController;
  start(input: ChannelProviderStartInput): ChannelDisposable | Promise<ChannelDisposable>;
}

export interface ChannelTransportBinding extends ChannelThreadBinding {
  readonly binding_id: string;
  readonly project_affinity: 'projectless';
  readonly status: 'bound';
}

export type ChannelTransportBindingsProjection =
  | {
      readonly surface_kind: 'opl_app_transport_bindings_projection.v1';
      readonly status: 'available';
      readonly bindings: readonly ChannelTransportBinding[];
    }
  | {
      readonly surface_kind: 'opl_app_transport_bindings_projection.v1';
      readonly status: 'unavailable';
      readonly bindings: readonly ChannelTransportBinding[];
      readonly unavailable_reason: 'producer_absent' | 'projection_unavailable' | 'invalid_projection';
    };

export interface ChannelUiActionDeclaration {
  readonly id: string;
  readonly action_ref: string;
  readonly confirm?: boolean;
}

export interface ChannelUiViewDeclaration {
  readonly id: string;
  readonly view_type: 'channel_access' | 'remote_companion_access' | (string & {});
  readonly data_ref: string;
  readonly actions: readonly ChannelUiActionDeclaration[];
}

export interface DiscoveredChannelEntrypoint {
  readonly kind: 'channel' | 'remote_companion';
  readonly channel_id: string;
  readonly module_ref: string;
  readonly resolved_module_path: string;
  readonly export_name: string;
}

export interface DiscoveredChannelPackage {
  readonly package_id: string;
  readonly version: string;
  readonly intent: 'agent' | 'app' | 'extension' | 'channel';
  readonly install_path: string;
  readonly content_digest: string;
  readonly artifact_digest: string | null;
  readonly channels: readonly DiscoveredChannelEntrypoint[];
  readonly remote_companions: readonly DiscoveredChannelEntrypoint[];
  readonly ui_views: readonly ChannelUiViewDeclaration[];
}

export interface ChannelPackageDiscovery {
  listEnabledChannelPackages(): readonly DiscoveredChannelPackage[];
}

export interface ChannelProviderContributionRequest {
  readonly package_id: string;
  readonly ref: string;
  readonly input?: Readonly<Record<string, unknown>>;
  readonly confirmed?: boolean;
}

export interface RemoteCompanionActivationContext {
  readonly surface_kind: 'opl_remote_companion_activation_context.v1';
  readonly package_id: string;
  readonly environment: string;
  readonly cohort_id: string;
  readonly protocol_version: string;
  readonly provider: string;
  readonly service_origin: string;
  readonly config_digest: string;
  readonly package_content_digest: string;
  readonly package_artifact_digest: string;
}

export type RemoteCompanionBridgeInput = Readonly<Record<string, unknown>>;

export interface RemoteCompanionEventObserver {
  onEvent(event: unknown): void | Promise<void>;
}

export interface RemoteCompanionDisposable {
  dispose(): void | Promise<void>;
}

export interface RemoteCompanionConversationBridge {
  listDirectory(input?: RemoteCompanionBridgeInput): Promise<unknown>;
  readHistory(input: RemoteCompanionBridgeInput): Promise<unknown>;
  startConversation(input: RemoteCompanionBridgeInput): Promise<unknown>;
  openConversation(input: RemoteCompanionBridgeInput): Promise<unknown>;
  sendMessage(input: RemoteCompanionBridgeInput): Promise<unknown>;
  subscribeEvents(
    observer: RemoteCompanionEventObserver,
    input?: RemoteCompanionBridgeInput,
  ): RemoteCompanionDisposable;
  stopTurn(input: RemoteCompanionBridgeInput): Promise<unknown>;
  respondApproval(input: RemoteCompanionBridgeInput): Promise<unknown>;
  refresh(input?: RemoteCompanionBridgeInput): Promise<unknown>;
}

export interface RemoteCompanionProtectedBlobPort {
  read(key: string): Promise<Uint8Array | null>;
  replace(key: string, value: Uint8Array): Promise<void>;
  clear(key: string): Promise<void>;
}

export interface RemoteCompanionProtectedBlobHost {
  forPackage(package_id: string): RemoteCompanionProtectedBlobPort;
}

export interface RemoteCompanionAccessController {
  readonly data_ref: string;
  readonly action_refs: readonly string[];
  read(input: Readonly<Record<string, unknown>>): unknown | Promise<unknown>;
  execute(input: {
    readonly action_ref: string;
    readonly input: Readonly<Record<string, unknown>>;
  }): unknown | Promise<unknown>;
}

export interface RemoteCompanionConnectorStartInput {
  readonly activation_context: RemoteCompanionActivationContext;
  readonly canonical_conversation_bridge: RemoteCompanionConversationBridge;
  readonly protected_blob: RemoteCompanionProtectedBlobPort;
  readonly reportError?: (error: unknown) => void;
}

export interface RemoteCompanionConnector {
  readonly remote_companion_access?: RemoteCompanionAccessController;
  start(
    input: RemoteCompanionConnectorStartInput,
  ): RemoteCompanionDisposable | Promise<RemoteCompanionDisposable>;
}

export interface InstalledRemoteCompanionAttachment {
  readonly package_id: string;
  readonly content_digest: string;
  readonly artifact_digest: string;
  readonly activation_context: RemoteCompanionActivationContext;
  readonly connector: RemoteCompanionConnector;
  readonly ui_views?: readonly ChannelUiViewDeclaration[];
}

export interface ChannelHostEvents extends Record<string, unknown> {
  'channel.provider.status_changed': {
    readonly package_id: string;
    readonly provider_id: string;
    readonly previous_status: ChannelHostStatus;
    readonly status: ChannelHostStatus;
    readonly reason?: ChannelDisconnectReason;
    readonly error_code?: string;
    readonly timestamp: string;
  };
  'channel.transport.bound': {
    readonly binding_id: string;
    readonly provider_id: string;
    readonly account_id: string;
    readonly channel_session_id: string;
    readonly canonical_thread_host: string;
    readonly canonical_thread_id: string;
    readonly timestamp: string;
  };
  'channel.transport.error': {
    readonly package_id: string;
    readonly provider_id: string;
    readonly reason: 'transport_error' | 'auth_error' | 'callback_error' | 'digest_changed';
    readonly error_code: string;
    readonly message: string;
    readonly safe_disconnected: boolean;
    readonly timestamp: string;
  };
  'channel.companion.status_changed': {
    readonly package_id: string;
    readonly previous_status: RemoteCompanionStatus;
    readonly status: RemoteCompanionStatus;
    readonly reason?: ChannelDisconnectReason;
    readonly unavailable_reason?: 'protected_blob_host_absent' | 'protected_blob_host_unavailable';
    readonly error_code?: string;
    readonly timestamp: string;
  };
  'channel.companion.error': {
    readonly package_id: string;
    readonly reason: 'transport_error' | 'auth_error' | 'digest_changed' | 'callback_error';
    readonly error_code: string;
    readonly message: string;
    readonly safe_disconnected: boolean;
    readonly timestamp: string;
  };
}

export type ChannelEventBus = EventBus<ChannelHostEvents>;

export const REMOTE_COMPANION_CONVERSATION_BRIDGE_METHODS = Object.freeze([
  'listDirectory',
  'readHistory',
  'startConversation',
  'openConversation',
  'sendMessage',
  'subscribeEvents',
  'stopTurn',
  'respondApproval',
  'refresh',
] as const);

export const REMOTE_COMPANION_PROTECTED_BLOB_METHODS = Object.freeze([
  'read',
  'replace',
  'clear',
] as const);

function hasMethod(value: unknown, method: string): boolean {
  return Boolean(
    value && typeof value === 'object' && typeof (value as Record<string, unknown>)[method] === 'function',
  );
}

export function boundedChannelJsonValue(value: unknown, field: string): unknown {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new ChannelError('CHANNEL_INVALID_INPUT', `${field} must be JSON serializable.`);
  }
  if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > MAX_CHANNEL_JSON_BYTES) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', `${field} exceeds ${MAX_CHANNEL_JSON_BYTES} byte limit.`);
  }
  return JSON.parse(encoded) as unknown;
}

export function assertChannelThreadCallback(value: unknown): asserts value is ChannelThreadCallback {
  for (const method of ['startThread', 'resumeThread', 'startTurn', 'subscribeTurn']) {
    if (!hasMethod(value, method)) {
      throw new ChannelError('CHANNEL_INVALID_INPUT', `Channel thread callback requires ${method}().`);
    }
  }
}

export function assertChannelDisposable(value: unknown): asserts value is ChannelDisposable {
  if (!hasMethod(value, 'dispose')) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Channel provider lifecycle requires a Disposable.');
  }
}

export function assertChannelProvider(value: unknown): asserts value is ChannelProvider {
  const providerId = value && typeof value === 'object'
    ? (value as Record<string, unknown>).provider_id
    : null;
  if (typeof providerId !== 'string' || !/^[a-z][a-z0-9._-]*$/.test(providerId)) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Channel provider requires a stable provider_id.');
  }
  if (!hasMethod(value, 'start')) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', `Channel provider ${providerId} requires start().`);
  }
  const controller = (value as Record<string, unknown>).channel_access;
  if (controller === undefined) return;
  if (!controller || typeof controller !== 'object') {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Channel provider channel_access controller must be an object.');
  }
  const rec = controller as Record<string, unknown>;
  if (typeof rec.data_ref !== 'string' || !rec.data_ref) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Channel provider channel_access controller requires data_ref.');
  }
  if (
    !Array.isArray(rec.action_refs)
    || rec.action_refs.length === 0
    || rec.action_refs.some((ref) => typeof ref !== 'string' || ref.length === 0)
    || new Set(rec.action_refs).size !== rec.action_refs.length
  ) {
    throw new ChannelError(
      'CHANNEL_INVALID_INPUT',
      'Channel provider channel_access controller requires unique action_refs.',
    );
  }
  for (const method of ['read', 'execute']) {
    if (!hasMethod(controller, method)) {
      throw new ChannelError(
        'CHANNEL_INVALID_INPUT',
        `Channel provider channel_access controller requires ${method}().`,
      );
    }
  }
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value);
  const expectedSet = new Set(expected);
  const unexpected = actual.filter((key) => !expectedSet.has(key));
  const missing = expected.filter((key) => !actual.includes(key));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new ChannelError(
      'CHANNEL_INVALID_INPUT',
      `${label} keys must exactly match ABI (missing: ${missing.join(',') || 'none'}; extra: ${unexpected.join(',') || 'none'}).`,
    );
  }
}

function assertBoundedContextString(value: unknown, field: string): asserts value is string {
  if (
    typeof value !== 'string'
    || !value.trim()
    || value !== value.trim()
    || value.length > 512
    || value.includes('\0')
  ) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', `${field} must be an exact bounded string.`);
  }
}

function assertSha256Digest(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new ChannelError('CHANNEL_DIGEST_MISMATCH', `${field} must be a sha256 digest.`);
  }
}

export function assertRemoteCompanionActivationContext(
  value: unknown,
): asserts value is RemoteCompanionActivationContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Remote companion activation context must be an object.');
  }
  const record = value as Record<string, unknown>;
  assertExactKeys(
    record,
    [
      'surface_kind',
      'package_id',
      'environment',
      'cohort_id',
      'protocol_version',
      'provider',
      'service_origin',
      'config_digest',
      'package_content_digest',
      'package_artifact_digest',
    ],
    'Remote companion activation context',
  );
  if (record.surface_kind !== 'opl_remote_companion_activation_context.v1') {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Unsupported remote companion activation context surface_kind.');
  }
  if (typeof record.package_id !== 'string' || !/^[a-z][a-z0-9._-]*$/.test(record.package_id)) {
    throw new ChannelError('CHANNEL_IDENTITY_MISMATCH', 'Remote companion activation context requires valid package_id.');
  }
  assertBoundedContextString(record.environment, 'environment');
  assertBoundedContextString(record.cohort_id, 'cohort_id');
  assertBoundedContextString(record.protocol_version, 'protocol_version');
  assertBoundedContextString(record.provider, 'provider');
  if (record.protocol_version !== 'opl_remote_transport.v1') {
    throw new ChannelError(
      'CHANNEL_INVALID_INPUT',
      'Remote companion activation context protocol_version must be opl_remote_transport.v1.',
    );
  }
  if (typeof record.service_origin !== 'string') {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Remote companion activation context requires service_origin.');
  }
  let origin: URL;
  try {
    origin = new URL(record.service_origin);
  } catch {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Remote companion service_origin must be an absolute URL.');
  }
  if (
    origin.protocol !== 'https:'
    || origin.username
    || origin.password
    || origin.search
    || origin.hash
    || (origin.pathname !== '/' && origin.pathname !== '')
  ) {
    throw new ChannelError(
      'CHANNEL_INVALID_INPUT',
      'Remote companion service_origin must be a pathless HTTPS origin without credentials.',
    );
  }
  assertSha256Digest(record.config_digest, 'config_digest');
  assertSha256Digest(record.package_content_digest, 'package_content_digest');
  assertSha256Digest(record.package_artifact_digest, 'package_artifact_digest');
}

export function assertRemoteCompanionConversationBridge(
  value: unknown,
): asserts value is RemoteCompanionConversationBridge {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Remote companion conversation bridge must be an object.');
  }
  const record = value as Record<string, unknown>;
  assertExactKeys(record, REMOTE_COMPANION_CONVERSATION_BRIDGE_METHODS, 'Remote companion conversation bridge');
  for (const method of REMOTE_COMPANION_CONVERSATION_BRIDGE_METHODS) {
    if (typeof record[method] !== 'function') {
      throw new ChannelError('CHANNEL_INVALID_INPUT', `Remote companion conversation bridge requires ${method}().`);
    }
  }
}

export function assertRemoteCompanionDisposable(
  value: unknown,
): asserts value is RemoteCompanionDisposable {
  if (!hasMethod(value, 'dispose')) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Remote companion lifecycle requires a Disposable.');
  }
}

export function assertRemoteCompanionProtectedBlobBytes(
  value: unknown,
  field = 'protected blob',
): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new ChannelError('COMPANION_BLOB_UNAVAILABLE', `${field} must be Uint8Array bytes.`);
  }
  if (value.byteLength > REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES) {
    throw new ChannelError(
      'COMPANION_BLOB_LIMIT_EXCEEDED',
      `${field} exceeds ${REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES} bytes.`,
    );
  }
}

export function assertRemoteCompanionProtectedBlobPort(
  value: unknown,
): asserts value is RemoteCompanionProtectedBlobPort {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChannelError('COMPANION_BLOB_UNAVAILABLE', 'Protected blob port must be an object.');
  }
  const record = value as Record<string, unknown>;
  assertExactKeys(record, REMOTE_COMPANION_PROTECTED_BLOB_METHODS, 'Remote companion protected blob port');
  for (const method of REMOTE_COMPANION_PROTECTED_BLOB_METHODS) {
    if (typeof record[method] !== 'function') {
      throw new ChannelError('COMPANION_BLOB_UNAVAILABLE', `Protected blob port requires ${method}().`);
    }
  }
}

export function assertRemoteCompanionConnector(
  value: unknown,
): asserts value is RemoteCompanionConnector {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Remote companion connector must be an object.');
  }
  const record = value as Record<string, unknown>;
  const expected = record.remote_companion_access === undefined
    ? (['start'] as const)
    : (['remote_companion_access', 'start'] as const);
  assertExactKeys(record, expected, 'Remote companion connector');
  if (typeof record.start !== 'function') {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Remote companion connector requires start().');
  }
  if (record.remote_companion_access !== undefined) {
    const ctrl = record.remote_companion_access;
    if (!ctrl || typeof ctrl !== 'object' || Array.isArray(ctrl)) {
      throw new ChannelError('CHANNEL_INVALID_INPUT', 'remote_companion_access must be an object.');
    }
    const ctrlRec = ctrl as Record<string, unknown>;
    assertExactKeys(ctrlRec, ['data_ref', 'action_refs', 'read', 'execute'], 'remote_companion_access');
    if (typeof ctrlRec.data_ref !== 'string' || !ctrlRec.data_ref) {
      throw new ChannelError('CHANNEL_INVALID_INPUT', 'remote_companion_access requires data_ref.');
    }
    if (
      !Array.isArray(ctrlRec.action_refs)
      || ctrlRec.action_refs.length === 0
      || ctrlRec.action_refs.some((r) => typeof r !== 'string' || !r)
      || new Set(ctrlRec.action_refs).size !== ctrlRec.action_refs.length
    ) {
      throw new ChannelError('CHANNEL_INVALID_INPUT', 'remote_companion_access requires unique action_refs.');
    }
    if (typeof ctrlRec.read !== 'function' || typeof ctrlRec.execute !== 'function') {
      throw new ChannelError('CHANNEL_INVALID_INPUT', 'remote_companion_access requires read() and execute().');
    }
  }
}
