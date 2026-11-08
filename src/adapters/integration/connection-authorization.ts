import crypto from 'node:crypto';
import fs from 'node:fs';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  installedDescriptorSupportsFrameworkCalls,
} from './agent-package-registry-parts/installed-codex-plugin-directory-descriptor.ts';
import type { InstalledPackageDescriptor } from './agent-package-registry-parts/installed-codex-plugin-directory-types.ts';
import { listOplConnections } from './connection-registry.ts';
import type { OplConnection } from './connection-registry-parts/types.ts';
import { connectionAuthorizationStorePath, withConnectionStateLock } from './connection-authorization-parts/state-lock.ts';

const HISTORY_LIMIT = 256;
const INPUT_LIMIT_BYTES = 64 * 1024;
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const FORBIDDEN_SECRET_FIELD = /(?:^|_)(?:api_key|token|secret|password|credential|credential_handle|credential_value|credential_material)$/i;

export type OplConnectionCapabilityRisk = 'read' | 'local_write' | 'external_write';
export type OplConnectionCapability = {
  capability_id: string;
  title: string;
  risk: OplConnectionCapabilityRisk;
};

export type OplConnectionProviderErrorDisposition =
  | 'not_dispatched'
  | 'provider_reported'
  | 'unknown_after_dispatch';

export class OplConnectionProviderError extends Error {
  readonly providerCode: string;
  readonly disposition: OplConnectionProviderErrorDisposition;

  constructor(providerCode: string, disposition: OplConnectionProviderErrorDisposition) {
    super('Connection provider operation failed.');
    this.name = 'OplConnectionProviderError';
    this.providerCode = /^[a-zA-Z0-9._-]{1,96}$/.test(providerCode) ? providerCode : 'provider_error';
    this.disposition = disposition;
  }
}

export type OplConnectionProvider = {
  provider_id: string;
  listCapabilities: (connection: Readonly<OplConnection>) => OplConnectionCapability[] | Promise<OplConnectionCapability[]>;
  invoke: (input: {
    connection: Readonly<OplConnection>;
    consumer_package_id: string;
    capability_id: string;
    invocation_id: string;
    input: Record<string, unknown>;
  }) => Promise<unknown>;
};

export type OplConnectionDescriptorDiscovery = {
  discover: () => Map<string, InstalledPackageDescriptor>;
};

type ConsumerIdentity = {
  package_id: string;
  manifest_sha256: string;
  content_digest: string;
};

type AccessRequest = ConsumerIdentity & {
  request_id: string;
  connection_id: string;
  connection_security_revision: string;
  capability_ids: string[];
  capabilities: OplConnectionCapability[];
  connection_name_snapshot: string;
  provider_type_snapshot: string;
  account_label_snapshot: string | null;
  status: 'requested' | 'denied' | 'granted' | 'superseded';
  created_at: string;
  decided_at: string | null;
};

type AccessGrant = ConsumerIdentity & {
  grant_id: string;
  request_id: string;
  connection_id: string;
  connection_security_revision: string;
  capability_ids: string[];
  capabilities: OplConnectionCapability[];
  connection_name_snapshot: string;
  provider_type_snapshot: string;
  account_label_snapshot: string | null;
  status: 'granted' | 'revoked' | 'stale';
  created_at: string;
  revoked_at: string | null;
};

type InvocationDisposition = 'completed' | OplConnectionProviderErrorDisposition;

type InvocationRecord = {
  invocation_id: string;
  consumer_package_id: string;
  connection_id: string;
  capability_id: string;
  consumer_display_name: string;
  connection_display_name: string;
  provider_type: string;
  account_label: string | null;
  capability_label: string;
  capability_risk: OplConnectionCapabilityRisk;
  grant_id: string;
  started_at: string;
  finished_at: string | null;
  disposition: InvocationDisposition;
};

type AuthorizationStore = {
  surface_kind: 'opl_connection_authorization_store.v1';
  version: 'g1';
  requests: AccessRequest[];
  grants: AccessGrant[];
  invocations: InvocationRecord[];
  updated_at: string;
};

function emptyStore(): AuthorizationStore {
  return { surface_kind: 'opl_connection_authorization_store.v1', version: 'g1', requests: [], grants: [], invocations: [], updated_at: new Date().toISOString() };
}

function fail(reasonCode: string, disposition: OplConnectionProviderErrorDisposition = 'not_dispatched'): never {
  throw new FrameworkContractError('contract_shape_invalid', 'Connection authorization check failed.', {
    reason_code: reasonCode,
    disposition,
  });
}

function readStore(): AuthorizationStore {
  const file = connectionAuthorizationStorePath();
  if (!fs.existsSync(file)) return emptyStore();
  try {
    const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!isRecord(value) || value.surface_kind !== 'opl_connection_authorization_store.v1'
      || !Array.isArray(value.requests) || !Array.isArray(value.grants) || !Array.isArray(value.invocations)) {
      throw new Error('invalid authorization store');
    }
    return {
      surface_kind: 'opl_connection_authorization_store.v1', version: 'g1',
      requests: value.requests.filter(isRecord).map((entry) => {
        if (Array.isArray(entry.capabilities)) return entry as unknown as AccessRequest;
        return {
          ...entry,
          capabilities: [],
          status: entry.status === 'requested' ? 'superseded' : entry.status,
        } as unknown as AccessRequest;
      }),
      grants: value.grants.filter(isRecord).map((entry) => {
        if (Array.isArray(entry.capabilities)) return entry as unknown as AccessGrant;
        return { ...entry, capabilities: [], status: 'stale' } as unknown as AccessGrant;
      }),
      invocations: value.invocations.filter(isRecord) as unknown as InvocationRecord[],
      updated_at: typeof value.updated_at === 'string' ? value.updated_at : new Date().toISOString(),
    };
  } catch {
    throw new FrameworkContractError('contract_shape_invalid', 'Connection authorization state is invalid.', {
      reason_code: 'connection_authorization_state_invalid',
    });
  }
}

function writeStore(store: AuthorizationStore) {
  store.updated_at = new Date().toISOString();
  const file = connectionAuthorizationStorePath();
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    const handle = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(handle, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function descriptorIdentity(
  discovery: OplConnectionDescriptorDiscovery,
  packageId: string,
): ConsumerIdentity {
  const descriptor = discovery.discover().get(packageId);
  if (!descriptor || descriptor.manifest.package_id !== packageId
    || !installedDescriptorSupportsFrameworkCalls(descriptor)) {
    fail('consumer_descriptor_unavailable');
  }
  const contentDigest = descriptor.manifest.content_digest;
  if (typeof descriptor.manifest_sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(descriptor.manifest_sha256)
    || typeof contentDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(contentDigest)) {
    fail('consumer_descriptor_digest_unavailable');
  }
  return {
    package_id: packageId,
    manifest_sha256: descriptor.manifest_sha256.toLowerCase(),
    content_digest: contentDigest.toLowerCase(),
  };
}

function sameConsumer(left: ConsumerIdentity, right: ConsumerIdentity) {
  return left.package_id === right.package_id
    && left.manifest_sha256 === right.manifest_sha256
    && left.content_digest === right.content_digest;
}

function safeLabel(value: unknown, fallback: string, maxLength = 160) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  return normalized || fallback;
}

function descriptorDisplayName(descriptor: InstalledPackageDescriptor | undefined, packageId: string) {
  if (!descriptor || descriptor.manifest.package_id !== packageId
    || !installedDescriptorSupportsFrameworkCalls(descriptor)) return packageId;
  const manifest = descriptor.manifest as unknown as Record<string, unknown>;
  return safeLabel(manifest.display_name ?? manifest.name, packageId);
}

function connectionById(connectionId: string) {
  const connection = listOplConnections().connections.find((entry) => entry.connection_id === connectionId);
  if (!connection) fail('connection_not_found');
  if (connection.status === 'disabled') fail('connection_disabled');
  return connection;
}

function providerFor(providers: OplConnectionProvider[], connection: OplConnection) {
  const provider = providers.find((entry) => entry.provider_id === connection.connection_type);
  if (!provider) fail('connection_provider_unavailable');
  return provider;
}

function capabilitiesFrom(value: OplConnectionCapability[]): OplConnectionCapability[] {
  if (!Array.isArray(value)) fail('provider_capability_descriptor_invalid');
  const result: OplConnectionCapability[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || typeof item.capability_id !== 'string' || !ID_PATTERN.test(item.capability_id)
      || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 160
      || !['read', 'local_write', 'external_write'].includes(String(item.risk))) {
      fail('provider_capability_descriptor_invalid');
    }
    if (seen.has(item.capability_id)) fail('provider_capability_descriptor_invalid');
    seen.add(item.capability_id);
    result.push({
      capability_id: item.capability_id,
      title: safeLabel(item.title, item.capability_id),
      risk: item.risk as OplConnectionCapabilityRisk,
    });
  }
  return result;
}

function readCapabilities(provider: OplConnectionProvider, connection: OplConnection) {
  return Promise.resolve()
    .then(() => provider.listCapabilities(connection))
    .then(capabilitiesFrom, () => fail('provider_capabilities_unavailable'));
}

function assertSafeJsonObject(value: unknown, reasonCode: string) {
  if (!isRecord(value)) fail(reasonCode);
  const visit = (entry: unknown) => {
    if (Array.isArray(entry)) { entry.forEach(visit); return; }
    if (!isRecord(entry)) return;
    for (const [key, nested] of Object.entries(entry)) {
      const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_');
      if (FORBIDDEN_SECRET_FIELD.test(normalized)) fail(reasonCode);
      visit(nested);
    }
  };
  visit(value);
  let serialized: string | undefined;
  try { serialized = JSON.stringify(value); } catch { fail(reasonCode); }
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > INPUT_LIMIT_BYTES) fail(reasonCode);
  const parsed: unknown = JSON.parse(serialized);
  if (!isRecord(parsed)) fail(reasonCode);
  return parsed;
}

function requestById(store: AuthorizationStore, requestId: string) {
  return store.requests.find((entry) => entry.request_id === requestId);
}

function grantById(store: AuthorizationStore, grantId: string) {
  return store.grants.find((entry) => entry.grant_id === grantId);
}

function activeGrant(
  store: AuthorizationStore,
  identity: ConsumerIdentity,
  connection: OplConnection,
  capabilityId: string,
) {
  const grant = [...store.grants].reverse().find((entry) => entry.status === 'granted'
    && sameConsumer(entry, identity) && entry.connection_id === connection.connection_id
    && entry.connection_security_revision === connection.security_revision
    && entry.capability_ids.includes(capabilityId));
  if (!grant) fail('connection_grant_missing');
  return grant;
}

function capabilitySet(capabilityIds: readonly string[]) {
  if (!Array.isArray(capabilityIds) || capabilityIds.length < 1 || capabilityIds.length > 32
    || capabilityIds.some((entry) => typeof entry !== 'string' || !ID_PATTERN.test(entry))
    || new Set(capabilityIds).size !== capabilityIds.length) fail('connection_capabilities_invalid');
  return [...capabilityIds].sort();
}

function sameCapabilities(left: OplConnectionCapability[], right: OplConnectionCapability[]) {
  return left.length === right.length && left.every((capability, index) => {
    const other = right[index];
    return capability.capability_id === other?.capability_id
      && capability.title === other?.title
      && capability.risk === other?.risk;
  });
}

function selectedCapabilities(available: OplConnectionCapability[], capabilityIds: string[]) {
  const byId = new Map(available.map((capability) => [capability.capability_id, capability]));
  const selected = capabilityIds.map((id) => byId.get(id));
  if (selected.some((capability) => !capability)) fail('provider_capability_missing');
  return selected as OplConnectionCapability[];
}

function publicCapability(capability: OplConnectionCapability) {
  return {
    capability_id: capability.capability_id,
    label: capability.title,
    risk: capability.risk,
  };
}

function publicRequest(
  request: AccessRequest,
  consumerName: string,
  connection: OplConnection | undefined,
  staleReason: string | null,
) {
  const connectionName = safeLabel(connection?.name, request.connection_name_snapshot);
  const providerType = safeLabel(connection?.connection_type, request.provider_type_snapshot);
  const accountLabel = safeLabel(connection?.account_label, request.account_label_snapshot ?? '', 240) || null;
  return {
    request_id: request.request_id,
    consumer_package_id: request.package_id,
    consumer_display_name: consumerName,
    connection_id: request.connection_id,
    connection_security_revision: request.connection_security_revision,
    security_revision: request.connection_security_revision,
    connection_display_name: connectionName,
    provider_type: providerType,
    account_label: accountLabel,
    capability_ids: [...request.capability_ids],
    capabilities: request.capabilities.map(publicCapability),
    status: request.status === 'requested' && staleReason ? 'superseded' : request.status,
    stale_reason: request.status === 'requested' ? staleReason : null,
    created_at: request.created_at,
    decided_at: request.decided_at,
  };
}

function publicGrant(
  grant: AccessGrant,
  consumerName: string,
  connection: OplConnection | undefined,
  staleReason: string | null,
) {
  const connectionName = safeLabel(connection?.name, grant.connection_name_snapshot);
  const providerType = safeLabel(connection?.connection_type, grant.provider_type_snapshot);
  const accountLabel = safeLabel(connection?.account_label, grant.account_label_snapshot ?? '', 240) || null;
  return {
    grant_id: grant.grant_id,
    request_id: grant.request_id,
    consumer_package_id: grant.package_id,
    consumer_display_name: consumerName,
    connection_id: grant.connection_id,
    connection_security_revision: grant.connection_security_revision,
    security_revision: grant.connection_security_revision,
    connection_display_name: connectionName,
    provider_type: providerType,
    account_label: accountLabel,
    capability_ids: [...grant.capability_ids],
    capabilities: grant.capabilities.map(publicCapability),
    status: grant.status === 'granted' && staleReason ? 'stale' : grant.status,
    stale_reason: grant.status === 'granted' ? staleReason : null,
    created_at: grant.created_at,
    revoked_at: grant.revoked_at,
  };
}

function staleBindingReason(input: {
  packageId: string;
  manifestSha256: string;
  contentDigest: string;
  connectionId: string;
  connectionRevision: string;
  connections: Map<string, OplConnection>;
  descriptors: Map<string, InstalledPackageDescriptor>;
}) {
  const connection = input.connections.get(input.connectionId);
  if (!connection) return 'connection_missing';
  if (connection.status === 'disabled') return 'connection_disabled';
  if (connection.security_revision !== input.connectionRevision) return 'connection_revision_changed';
  const descriptor = input.descriptors.get(input.packageId);
  if (!descriptor || descriptor.manifest.package_id !== input.packageId
    || !installedDescriptorSupportsFrameworkCalls(descriptor)) return 'consumer_descriptor_unavailable';
  if (descriptor.manifest_sha256.toLowerCase() !== input.manifestSha256
    || typeof descriptor.manifest.content_digest !== 'string'
    || descriptor.manifest.content_digest.toLowerCase() !== input.contentDigest) return 'consumer_descriptor_changed';
  return null;
}

function publicInvocation(invocation: InvocationRecord) {
  return {
    invocation_id: invocation.invocation_id,
    consumer_package_id: invocation.consumer_package_id,
    consumer_display_name: safeLabel(invocation.consumer_display_name, invocation.consumer_package_id),
    connection_id: invocation.connection_id,
    connection_display_name: safeLabel(invocation.connection_display_name, invocation.connection_id),
    provider_type: invocation.provider_type,
    account_label: invocation.account_label,
    capability_id: invocation.capability_id,
    capability_label: safeLabel(invocation.capability_label, invocation.capability_id),
    capability_risk: invocation.capability_risk,
    grant_id: invocation.grant_id,
    started_at: invocation.started_at,
    finished_at: invocation.finished_at,
    disposition: invocation.disposition,
  };
}

export function createOplConnectionAuthorizationService(input: {
  descriptorDiscovery: OplConnectionDescriptorDiscovery;
  providers: OplConnectionProvider[];
}) {
  if (!input.descriptorDiscovery || !Array.isArray(input.providers)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Connection authorization composition is invalid.', {
      reason_code: 'connection_authorization_composition_invalid',
    });
  }
  const providers = [...input.providers];

  function listProjection() {
    const snapshot = withConnectionStateLock(() => {
      const store = readStore();
      const connections = listOplConnections().connections;
      return { store, connections };
    });
    let descriptors = new Map<string, InstalledPackageDescriptor>();
    try { descriptors = input.descriptorDiscovery.discover(); } catch { /* Names fall back to package ids. */ }
    const connectionsById = new Map(snapshot.connections.map((connection) => [connection.connection_id, connection]));
    const capabilityMaps = new Map<string, Map<string, OplConnectionCapability>>();
    const riskRank: Record<OplConnectionCapabilityRisk, number> = {
      read: 0,
      local_write: 1,
      external_write: 2,
    };
    for (const entry of [...snapshot.store.requests, ...snapshot.store.grants]) {
      const capabilities = capabilityMaps.get(entry.connection_id) ?? new Map<string, OplConnectionCapability>();
      for (const capability of entry.capabilities) {
        const previous = capabilities.get(capability.capability_id);
        if (!previous || riskRank[capability.risk] > riskRank[previous.risk]) {
          capabilities.set(capability.capability_id, { ...capability });
        }
      }
      capabilityMaps.set(entry.connection_id, capabilities);
    }
    const connectionRows = snapshot.connections.map((connection) => ({
      connection_id: connection.connection_id,
      display_name: safeLabel(connection.name, connection.connection_id),
      provider_type: connection.connection_type,
      status: connection.status,
      security_revision: connection.security_revision,
      account_label: safeLabel(connection.account_label, '', 240) || null,
      capabilities: [...(capabilityMaps.get(connection.connection_id)?.values() ?? [])]
        .sort((left, right) => left.capability_id.localeCompare(right.capability_id))
        .map(publicCapability),
    }));
    const requestRows = snapshot.store.requests.map((request) => publicRequest(
      request,
      descriptorDisplayName(descriptors.get(request.package_id), request.package_id),
      connectionsById.get(request.connection_id),
      staleBindingReason({
        packageId: request.package_id,
        manifestSha256: request.manifest_sha256,
        contentDigest: request.content_digest,
        connectionId: request.connection_id,
        connectionRevision: request.connection_security_revision,
        connections: connectionsById,
        descriptors,
      }),
    ));
    const grantRows = snapshot.store.grants.map((grant) => publicGrant(
      grant,
      descriptorDisplayName(descriptors.get(grant.package_id), grant.package_id),
      connectionsById.get(grant.connection_id),
      staleBindingReason({
        packageId: grant.package_id,
        manifestSha256: grant.manifest_sha256,
        contentDigest: grant.content_digest,
        connectionId: grant.connection_id,
        connectionRevision: grant.connection_security_revision,
        connections: connectionsById,
        descriptors,
      }),
    ));
    return {
      surface_kind: 'opl_connection_authorization_projection.v1',
      connections: connectionRows,
      requests: requestRows,
      grants: grantRows,
      invocations: snapshot.store.invocations.slice(-20).map(publicInvocation),
      updated_at: snapshot.store.updated_at,
    };
  }

  async function approveRequest(requestId: string) {
    if (typeof requestId !== 'string' || !ID_PATTERN.test(requestId)) fail('connection_request_not_found');
    const pending = withConnectionStateLock(() => {
      const request = requestById(readStore(), requestId);
      if (!request || request.status !== 'requested') fail('connection_request_not_pending');
      const connection = connectionById(request.connection_id);
      if (connection.security_revision !== request.connection_security_revision) fail('connection_revision_changed');
      const identity = descriptorIdentity(input.descriptorDiscovery, request.package_id);
      if (!sameConsumer(request, identity)) fail('consumer_descriptor_changed');
      return { request: { ...request }, connection };
    });
    const provider = providerFor(providers, pending.connection);
    const available = await readCapabilities(provider, pending.connection);
    const approvedCapabilities = selectedCapabilities(available, pending.request.capability_ids);
    if (!sameCapabilities(pending.request.capabilities, approvedCapabilities)) fail('provider_capability_changed');
    const consumerName = descriptorDisplayName(
      input.descriptorDiscovery.discover().get(pending.request.package_id),
      pending.request.package_id,
    );
    return withConnectionStateLock(() => {
      const store = readStore();
      const request = requestById(store, requestId);
      if (!request || request.status !== 'requested') fail('connection_request_not_pending');
      const connection = connectionById(request.connection_id);
      if (connection.security_revision !== request.connection_security_revision) fail('connection_revision_changed');
      const identity = descriptorIdentity(input.descriptorDiscovery, request.package_id);
      if (!sameConsumer(request, identity)) fail('consumer_descriptor_changed');
      const currentProvider = providerFor(providers, connection);
      if (currentProvider !== provider) fail('connection_provider_unavailable');
      if (!sameCapabilities(request.capabilities, approvedCapabilities)) fail('provider_capability_changed');
      const now = new Date().toISOString();
      request.status = 'granted';
      request.decided_at = now;
      const grant: AccessGrant = {
        package_id: request.package_id,
        manifest_sha256: request.manifest_sha256,
        content_digest: request.content_digest,
        grant_id: crypto.randomUUID(),
        request_id: request.request_id,
        connection_id: request.connection_id,
        connection_security_revision: request.connection_security_revision,
        capability_ids: [...request.capability_ids],
        capabilities: request.capabilities.map((capability) => ({ ...capability })),
        connection_name_snapshot: request.connection_name_snapshot,
        provider_type_snapshot: request.provider_type_snapshot,
        account_label_snapshot: request.account_label_snapshot,
        status: 'granted', created_at: now, revoked_at: null,
      };
      store.grants.push(grant);
      writeStore(store);
      return publicGrant(
        grant,
        consumerName,
        connection,
        null,
      );
    });
  }

  function denyRequest(requestId: string) {
    return withConnectionStateLock(() => {
      const store = readStore();
      const request = requestById(store, requestId);
      if (!request || request.status !== 'requested') fail('connection_request_not_pending');
      request.status = 'denied';
      request.decided_at = new Date().toISOString();
      writeStore(store);
      const connection = listOplConnections().connections.find((entry) => entry.connection_id === request.connection_id);
      return publicRequest(request, request.package_id, connection, null);
    });
  }

  function revokeGrant(grantId: string) {
    return withConnectionStateLock(() => {
      const store = readStore();
      const grant = grantById(store, grantId);
      if (!grant || grant.status !== 'granted') fail('connection_grant_not_active');
      grant.status = 'revoked';
      grant.revoked_at = new Date().toISOString();
      writeStore(store);
      const connection = listOplConnections().connections.find((entry) => entry.connection_id === grant.connection_id);
      return publicGrant(grant, grant.package_id, connection, null);
    });
  }

  function forPackage(packageId: string) {
    if (typeof packageId !== 'string' || !ID_PATTERN.test(packageId)) fail('consumer_descriptor_unavailable');
    const bound = descriptorIdentity(input.descriptorDiscovery, packageId);
    function currentIdentity() {
      const fresh = descriptorIdentity(input.descriptorDiscovery, packageId);
      if (!sameConsumer(bound, fresh)) fail('consumer_descriptor_changed');
      return fresh;
    }

    async function listConnectionsForConsumer() {
      currentIdentity();
      return withConnectionStateLock(() => {
        currentIdentity();
        return listOplConnections().connections
        .filter((connection) => connection.status !== 'disabled')
        .map((connection) => ({
          connection_id: connection.connection_id,
          name: connection.name,
          connection_type: connection.connection_type,
          status: connection.status,
        }));
      });
    }

    async function requestAccess(
      requestOrConnectionId: { connection_id: string; capability_ids: readonly string[] } | string,
      capabilityIds?: readonly string[],
    ) {
      const request = typeof requestOrConnectionId === 'string'
        ? { connection_id: requestOrConnectionId, capability_ids: capabilityIds ?? [] }
        : requestOrConnectionId;
      const identity = currentIdentity();
      const connectionId = request?.connection_id;
      if (typeof connectionId !== 'string' || !ID_PATTERN.test(connectionId)) fail('connection_not_found');
      const requestedCapabilities = capabilitySet(request.capability_ids);
      const initial = withConnectionStateLock(() => ({ connection: connectionById(connectionId) }));
      const provider = providerFor(providers, initial.connection);
      const available = await readCapabilities(provider, initial.connection);
      const requestedDescriptors = selectedCapabilities(available, requestedCapabilities);
      const consumerName = descriptorDisplayName(
        input.descriptorDiscovery.discover().get(identity.package_id),
        identity.package_id,
      );
      return withConnectionStateLock(() => {
        const freshIdentity = currentIdentity();
        const connection = connectionById(connectionId);
        if (connection.security_revision !== initial.connection.security_revision) fail('connection_revision_changed');
        if (providerFor(providers, connection) !== provider) fail('connection_provider_unavailable');
        const store = readStore();
        const now = new Date().toISOString();
        const entry: AccessRequest = {
          ...freshIdentity,
          request_id: crypto.randomUUID(),
          connection_id: connection.connection_id,
          connection_security_revision: connection.security_revision,
          capability_ids: requestedCapabilities,
          capabilities: requestedDescriptors.map((capability) => ({ ...capability })),
          connection_name_snapshot: safeLabel(connection.name, connection.connection_id),
          provider_type_snapshot: connection.connection_type,
          account_label_snapshot: safeLabel(connection.account_label, '', 240) || null,
          status: 'requested', created_at: now, decided_at: null,
        };
        store.requests.push(entry);
        writeStore(store);
        return publicRequest(entry, consumerName, connection, null);
      });
    }

    async function invoke(
      requestOrConnectionId: { connection_id: string; capability_id: string; input: Readonly<Record<string, unknown>> } | string,
      capabilityId?: string,
      operationInput?: Readonly<Record<string, unknown>>,
    ) {
      const request = typeof requestOrConnectionId === 'string'
        ? { connection_id: requestOrConnectionId, capability_id: capabilityId ?? '', input: operationInput ?? {} }
        : requestOrConnectionId;
      const identity = currentIdentity();
      if (!request || typeof request.connection_id !== 'string' || !ID_PATTERN.test(request.connection_id)
        || typeof request.capability_id !== 'string' || !ID_PATTERN.test(request.capability_id)) fail('connection_invocation_invalid');
      const safeInput = assertSafeJsonObject(request.input, 'connection_invocation_input_invalid');
      const initial = withConnectionStateLock(() => {
        const connection = connectionById(request.connection_id);
        const store = readStore();
        const grant = activeGrant(store, identity, connection, request.capability_id);
        return { connection, grant };
      });
      const provider = providerFor(providers, initial.connection);
      const available = await readCapabilities(provider, initial.connection);
      const currentCapability = selectedCapabilities(available, [request.capability_id])[0]!;
      const approvedCapability = initial.grant.capabilities.find((capability) => capability.capability_id === request.capability_id);
      if (!approvedCapability || !sameCapabilities([approvedCapability], [currentCapability])) {
        fail('provider_capability_changed');
      }
      const consumerName = descriptorDisplayName(
        input.descriptorDiscovery.discover().get(identity.package_id),
        identity.package_id,
      );
      const invocationId = crypto.randomUUID();
      const invocation = withConnectionStateLock(() => {
        const freshIdentity = currentIdentity();
        const connection = connectionById(request.connection_id);
        if (connection.security_revision !== initial.connection.security_revision) fail('connection_revision_changed');
        const grant = activeGrant(readStore(), freshIdentity, connection, request.capability_id);
        if (grant.grant_id !== initial.grant.grant_id) fail('connection_grant_changed');
        if (providerFor(providers, connection) !== provider) fail('connection_provider_unavailable');
        const store = readStore();
        const record: InvocationRecord = {
          invocation_id: invocationId,
          consumer_package_id: packageId,
          connection_id: connection.connection_id,
          capability_id: request.capability_id,
          consumer_display_name: consumerName,
          connection_display_name: safeLabel(connection.name, connection.connection_id),
          provider_type: connection.connection_type,
          account_label: safeLabel(connection.account_label, '', 240) || null,
          capability_label: currentCapability.title,
          capability_risk: currentCapability.risk,
          grant_id: grant.grant_id,
          started_at: new Date().toISOString(),
          finished_at: null,
          disposition: 'unknown_after_dispatch',
        };
        store.invocations.push(record);
        store.invocations = store.invocations.slice(-HISTORY_LIMIT);
        writeStore(store);
        return { connection, grant: { ...grant }, record };
      });

      let result: unknown;
      let disposition: InvocationDisposition = 'completed';
      try {
        result = await provider.invoke({
          connection: invocation.connection,
          consumer_package_id: packageId,
          capability_id: request.capability_id,
          invocation_id: invocationId,
          input: safeInput,
        });
      } catch (error) {
        disposition = error instanceof OplConnectionProviderError ? error.disposition : 'unknown_after_dispatch';
        withConnectionStateLock(() => {
          const store = readStore();
          const record = store.invocations.find((entry) => entry.invocation_id === invocationId);
          if (record) { record.disposition = disposition; record.finished_at = new Date().toISOString(); writeStore(store); }
        });
        throw new FrameworkContractError('contract_shape_invalid', 'Connection provider operation failed.', {
          reason_code: error instanceof OplConnectionProviderError ? error.providerCode : 'provider_outcome_unknown',
          disposition,
          invocation_id: invocationId,
        });
      }

      let safeResult: Record<string, unknown>;
      try { safeResult = assertSafeJsonObject(result, 'provider_result_invalid'); }
      catch {
        disposition = 'provider_reported';
        withConnectionStateLock(() => {
          const store = readStore();
          const record = store.invocations.find((entry) => entry.invocation_id === invocationId);
          if (record) { record.disposition = disposition; record.finished_at = new Date().toISOString(); writeStore(store); }
        });
        throw new FrameworkContractError('contract_shape_invalid', 'Connection provider result cannot be released.', {
          reason_code: 'provider_result_invalid', disposition, invocation_id: invocationId,
        });
      }
      let stillAuthorized = false;
      try {
        stillAuthorized = withConnectionStateLock(() => {
          const freshIdentity = currentIdentity();
          const connection = connectionById(request.connection_id);
          if (connection.security_revision !== invocation.connection.security_revision) return false;
          try {
            return activeGrant(readStore(), freshIdentity, connection, request.capability_id).grant_id === invocation.grant.grant_id;
          } catch { return false; }
        });
      } catch {
        stillAuthorized = false;
      }
      if (!stillAuthorized) {
        disposition = 'unknown_after_dispatch';
        withConnectionStateLock(() => {
          const store = readStore();
          const record = store.invocations.find((entry) => entry.invocation_id === invocationId);
          if (record) { record.disposition = disposition; record.finished_at = new Date().toISOString(); writeStore(store); }
        });
        fail('connection_authorization_changed_after_dispatch', disposition);
      }
      withConnectionStateLock(() => {
        const store = readStore();
        const record = store.invocations.find((entry) => entry.invocation_id === invocationId);
        if (record) { record.disposition = 'completed'; record.finished_at = new Date().toISOString(); writeStore(store); }
      });
      return { invocation_id: invocationId, disposition: 'completed' as const, result: safeResult };
    }

    return { listConnections: listConnectionsForConsumer, requestAccess, invoke };
  }

  return { forPackage, listProjection, approveRequest, denyRequest, revokeGrant };
}

export type OplConnectionAuthorizationService = ReturnType<typeof createOplConnectionAuthorizationService>;
