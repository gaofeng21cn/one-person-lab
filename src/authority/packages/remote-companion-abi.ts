/**
 * Public ABI for a Framework-hosted OPL Link style remote companion.
 *
 * This module intentionally contains only transport-neutral shapes. The
 * connector owns product/provider semantics; the Framework owns lifecycle,
 * package identity, and the bounded ports supplied at activation time.
 */

export const REMOTE_COMPANION_CONNECTOR_CALLBACK_API_VERSION = '1.0.0' as const;
export const REMOTE_COMPANION_CONNECTOR_HOST_SERVICE_ID =
  'opl.connect.remote-companion-connector-host' as const;
export const REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES = 256 * 1024;

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

export type RemoteCompanionActivationContext = Readonly<{
  surface_kind: 'opl_remote_companion_activation_context.v1';
  package_id: string;
  environment: string;
  cohort_id: string;
  protocol_version: string;
  provider: string;
  service_origin: string;
  config_digest: string;
  package_content_digest: string;
  package_artifact_digest: string;
}>;

export type RemoteCompanionBridgeInput = Readonly<Record<string, unknown>>;

export type RemoteCompanionEventObserver = Readonly<{
  onEvent(event: unknown): void | Promise<void>;
}>;

export type RemoteCompanionDisposable = Readonly<{
  dispose(): void | Promise<void>;
}>;

export type RemoteCompanionConversationBridge = Readonly<{
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
}>;

export type RemoteCompanionProtectedBlobPort = Readonly<{
  read(key: string): Promise<Uint8Array | null>;
  replace(key: string, value: Uint8Array): Promise<void>;
  clear(key: string): Promise<void>;
}>;

export type RemoteCompanionProtectedBlobHost = Readonly<{
  forPackage(package_id: string): RemoteCompanionProtectedBlobPort;
}>;

export type RemoteCompanionAccessController = Readonly<{
  data_ref: string;
  action_refs: readonly string[];
  read(input: Readonly<Record<string, unknown>>): unknown | Promise<unknown>;
  execute(input: Readonly<{
    action_ref: string;
    input: Readonly<Record<string, unknown>>;
  }>): unknown | Promise<unknown>;
}>;

export type RemoteCompanionConnectorStartInput = Readonly<{
  activation_context: RemoteCompanionActivationContext;
  canonical_conversation_bridge: RemoteCompanionConversationBridge;
  protected_blob: RemoteCompanionProtectedBlobPort;
}>;

export type RemoteCompanionConnector = Readonly<{
  /** Connector identity is deliberately absent; the installed manifest owns it. */
  remote_companion_access?: RemoteCompanionAccessController;
  start(input: RemoteCompanionConnectorStartInput): RemoteCompanionDisposable | Promise<RemoteCompanionDisposable>;
}>;

function hasMethod(value: unknown, method: string): boolean {
  return Boolean(value && typeof value === 'object'
    && typeof (value as Record<string, unknown>)[method] === 'function');
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(value);
  const expectedSet = new Set(expected);
  const unexpected = actual.filter((key) => !expectedSet.has(key));
  const missing = expected.filter((key) => !actual.includes(key));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new TypeError(
      `${label} keys must exactly match the public ABI (missing: ${missing.join(',') || 'none'}; extra: ${unexpected.join(',') || 'none'}).`,
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
    throw new TypeError(`Remote companion activation context ${field} must be an exact bounded string.`);
  }
}

function assertDigest(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new TypeError(`Remote companion activation context ${field} must be a sha256 digest.`);
  }
}

export function assertRemoteCompanionActivationContext(
  value: unknown,
): asserts value is RemoteCompanionActivationContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Remote companion activation context must be an object.');
  }
  const record = value as Record<string, unknown>;
  assertExactKeys(record, [
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
  ], 'Remote companion activation context');
  if (record.surface_kind !== 'opl_remote_companion_activation_context.v1') {
    throw new TypeError('Remote companion activation context has an unsupported surface_kind.');
  }
  if (typeof record.package_id !== 'string' || !/^[a-z][a-z0-9._-]*$/.test(record.package_id)) {
    throw new TypeError('Remote companion activation context requires the manifest package_id.');
  }
  assertBoundedContextString(record.environment, 'environment');
  assertBoundedContextString(record.cohort_id, 'cohort_id');
  assertBoundedContextString(record.protocol_version, 'protocol_version');
  assertBoundedContextString(record.provider, 'provider');
  if (record.protocol_version !== 'opl_remote_transport.v1') {
    throw new TypeError('Remote companion activation context protocol_version must be opl_remote_transport.v1.');
  }
  if (typeof record.service_origin !== 'string') {
    throw new TypeError('Remote companion activation context requires service_origin.');
  }
  let origin: URL;
  try {
    origin = new URL(record.service_origin);
  } catch {
    throw new TypeError('Remote companion service_origin must be an absolute URL.');
  }
  if (
    origin.protocol !== 'https:'
    || origin.username
    || origin.password
    || origin.search
    || origin.hash
    || (origin.pathname !== '/' && origin.pathname !== '')
  ) {
    throw new TypeError('Remote companion service_origin must be a pathless HTTPS origin without credentials.');
  }
  assertDigest(record.config_digest, 'config_digest');
  assertDigest(record.package_content_digest, 'package_content_digest');
  assertDigest(record.package_artifact_digest, 'package_artifact_digest');
}

export function assertRemoteCompanionConversationBridge(
  value: unknown,
): asserts value is RemoteCompanionConversationBridge {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Remote companion conversation callback must be an object.');
  }
  const record = value as Record<string, unknown>;
  assertExactKeys(record, REMOTE_COMPANION_CONVERSATION_BRIDGE_METHODS, 'Remote companion conversation callback');
  for (const method of REMOTE_COMPANION_CONVERSATION_BRIDGE_METHODS) {
    if (typeof record[method] !== 'function') {
      throw new TypeError(`Remote companion conversation callback requires ${method}().`);
    }
  }
}

export function assertRemoteCompanionDisposable(
  value: unknown,
): asserts value is RemoteCompanionDisposable {
  if (!hasMethod(value, 'dispose')) {
    throw new TypeError('Remote companion lifecycle requires a Disposable.');
  }
}

export function assertRemoteCompanionProtectedBlobBytes(
  value: unknown,
  field = 'protected blob',
): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`${field} must be opaque Uint8Array bytes.`);
  }
  if (value.byteLength > REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES) {
    throw new TypeError(
      `${field} exceeds ${REMOTE_COMPANION_PROTECTED_BLOB_MAX_BYTES} bytes.`,
    );
  }
}

export function assertRemoteCompanionProtectedBlobPort(
  value: unknown,
): asserts value is RemoteCompanionProtectedBlobPort {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Remote companion protected blob port must be an object.');
  }
  const record = value as Record<string, unknown>;
  assertExactKeys(record, REMOTE_COMPANION_PROTECTED_BLOB_METHODS, 'Remote companion protected blob port');
  for (const method of REMOTE_COMPANION_PROTECTED_BLOB_METHODS) {
    if (typeof record[method] !== 'function') {
      throw new TypeError(`Remote companion protected blob port requires ${method}().`);
    }
  }
}

function assertRemoteCompanionAccessController(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Remote companion remote_companion_access controller must be an object.');
  }
  const record = value as Record<string, unknown>;
  assertExactKeys(
    record,
    ['data_ref', 'action_refs', 'read', 'execute'],
    'Remote companion remote_companion_access controller',
  );
  if (typeof record.data_ref !== 'string' || !record.data_ref) {
    throw new TypeError('Remote companion remote_companion_access controller requires data_ref.');
  }
  const actionRefs = record.action_refs;
  if (
    !Array.isArray(actionRefs)
    || actionRefs.length === 0
    || actionRefs.some((ref) => typeof ref !== 'string' || !ref)
    || new Set(actionRefs).size !== actionRefs.length
  ) {
    throw new TypeError('Remote companion remote_companion_access controller requires unique action_refs.');
  }
  if (typeof record.read !== 'function' || typeof record.execute !== 'function') {
    throw new TypeError('Remote companion remote_companion_access controller requires read() and execute().');
  }
}

export function assertRemoteCompanionConnector(
  value: unknown,
): asserts value is RemoteCompanionConnector {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Remote companion connector must be an object.');
  }
  const record = value as Record<string, unknown>;
  const expected = record.remote_companion_access === undefined
    ? ['start'] as const
    : ['remote_companion_access', 'start'] as const;
  assertExactKeys(record, expected, 'Remote companion connector');
  if (typeof record.start !== 'function') {
    throw new TypeError('Remote companion connector requires start().');
  }
  if (record.remote_companion_access !== undefined) {
    assertRemoteCompanionAccessController(record.remote_companion_access);
  }
}
