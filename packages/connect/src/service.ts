import { EventBus, type ClientContext, type SqliteDb } from '@opl/core';

import { ConsumerBindTokenAuthority } from './auth/bind-token.ts';
import { ConnectAuthorizationService } from './auth/authorization.ts';
import { ensureConnectSchema } from './migrations.ts';
import { ConnectionRegistry } from './registry/connection-registry.ts';
import type {
  AccessRequestResult,
  AddConnectionInput,
  ApproveRequestInput,
  CheckGrantInput,
  CheckGrantResult,
  ConnectAuditContext,
  ConnectEventBus,
  ConnectEvents,
  ConnectProjection,
  ConnectionCheckResult,
  ConnectionProvider,
  ConnectionStatus,
  ConnectionSummary,
  DenyRequestInput,
  GrantSummary,
  IssueBindTokenInput,
  IssuedConsumerBindToken,
  ConsumerBindTokenClaims,
  InvokeInput,
  InvokeResult,
  PackageConnectPort,
  RequestAccessInput,
  RevokeInput,
  RotateCredentialInput,
  RuntimeDigestVerifier,
  UpdateCapabilitiesInput,
} from './types.ts';
import { createDefaultSecretVault } from './vault/factory.ts';
import type { SecretVault } from './vault/types.ts';

export interface CreateConnectServiceOptions {
  readonly db: SqliteDb;
  readonly vault?: SecretVault;
  readonly stateDir?: string;
  readonly eventBus?: ConnectEventBus;
  readonly signingSecret?: Uint8Array | string;
  readonly providers?: readonly ConnectionProvider[];
  readonly verifyRuntimeDigest?: RuntimeDigestVerifier;
  readonly nowMs?: () => number;
  readonly skipMigrations?: boolean;
}

export interface ConnectService {
  readonly vault: SecretVault;
  readonly eventBus: ConnectEventBus;
  readonly registry: ConnectionRegistry;
  registerProvider(provider: ConnectionProvider): void;
  list(filter?: {
    readonly provider_type?: string;
    readonly status?: ConnectionStatus;
    readonly include_deleted?: boolean;
  }): ConnectionSummary[];
  add(
    clientContext: ClientContext,
    input: AddConnectionInput,
    auditContext?: ConnectAuditContext,
  ): Promise<ConnectionSummary>;
  checkConnection(connectionId: string): Promise<ConnectionCheckResult>;
  rotateCredential(
    clientContext: ClientContext,
    input: RotateCredentialInput,
    auditContext?: ConnectAuditContext,
  ): Promise<ConnectionSummary>;
  updateCapabilities(
    clientContext: ClientContext,
    input: UpdateCapabilitiesInput,
    auditContext?: ConnectAuditContext,
  ): ConnectionSummary;
  setConnectionStatus(
    clientContext: ClientContext,
    input: { readonly connection_id: string; readonly status: 'active' | 'disabled' | 'expired' },
    auditContext?: ConnectAuditContext,
  ): ConnectionSummary;
  requestAccess(input: RequestAccessInput): Promise<AccessRequestResult>;
  approveRequest(
    clientContext: ClientContext,
    input: ApproveRequestInput,
    auditContext?: ConnectAuditContext,
  ): Promise<GrantSummary[]>;
  denyRequest(
    clientContext: ClientContext,
    input: DenyRequestInput,
    auditContext?: ConnectAuditContext,
  ): GrantSummary[];
  revoke(
    clientContext: ClientContext,
    input: RevokeInput,
    auditContext?: ConnectAuditContext,
  ): Promise<GrantSummary | ConnectionSummary>;
  checkGrant(input: CheckGrantInput): Promise<CheckGrantResult>;
  invoke(input: InvokeInput): Promise<InvokeResult>;
  issueConsumerBindToken(
    clientContext: ClientContext,
    input: IssueBindTokenInput,
  ): Promise<IssuedConsumerBindToken>;
  verifyConsumerBindToken(
    token: string,
    expected?: { readonly session_id?: string; readonly consumer_package_id?: string },
  ): Promise<ConsumerBindTokenClaims>;
  forPackage(
    packageId: string,
    options?: {
      readonly session_id?: string;
      readonly consumer_bind_token?: string;
      readonly audit_context?: ConnectAuditContext;
    },
  ): PackageConnectPort;
  listProjection(filter?: { readonly consumer_package_id?: string }): ConnectProjection;
}

export function createConnectService(options: CreateConnectServiceOptions): ConnectService {
  if (!options.skipMigrations) {
    ensureConnectSchema(options.db);
  }

  const vault = options.vault ?? createDefaultSecretVault({ stateDir: options.stateDir });
  const eventBus = options.eventBus ?? new EventBus<ConnectEvents>();
  const providerMap = new Map<string, ConnectionProvider>();
  for (const p of options.providers ?? []) {
    providerMap.set(p.provider_type, p);
  }

  const registry = new ConnectionRegistry({
    db: options.db,
    vault,
    eventBus,
    getProvider: (providerType) => providerMap.get(providerType),
  });

  const bindTokens = new ConsumerBindTokenAuthority({
    db: options.db,
    signingSecret: options.signingSecret,
    verifyRuntimeDigest: options.verifyRuntimeDigest,
    nowMs: options.nowMs,
  });

  const auth = new ConnectAuthorizationService({
    db: options.db,
    registry,
    vault,
    bindTokenAuthority: bindTokens,
    providers: providerMap,
    eventBus,
    verifyRuntimeDigest: options.verifyRuntimeDigest,
    nowMs: options.nowMs,
  });

  const service: ConnectService = {
    vault,
    eventBus,
    registry,
    registerProvider(provider: ConnectionProvider) {
      providerMap.set(provider.provider_type, provider);
      auth.registerProvider(provider);
    },
    list: (filter) => registry.list(filter),
    add: (clientContext, input, auditContext) => registry.add(clientContext, input, auditContext),
    checkConnection: (connectionId) => registry.checkConnection(connectionId),
    rotateCredential: (clientContext, input, auditContext) =>
      registry.rotateCredential(clientContext, input, auditContext),
    updateCapabilities: (clientContext, input, auditContext) =>
      registry.updateCapabilities(clientContext, input, auditContext),
    setConnectionStatus: (clientContext, input, auditContext) =>
      registry.setConnectionStatus(clientContext, input, auditContext),
    requestAccess: (input) => auth.requestAccess(input),
    approveRequest: (clientContext, input, auditContext) =>
      auth.approveRequest(clientContext, input, auditContext),
    denyRequest: (clientContext, input, auditContext) =>
      auth.denyRequest(clientContext, input, auditContext),
    revoke: (clientContext, input, auditContext) =>
      auth.revoke(clientContext, input, auditContext),
    checkGrant: (input) => auth.checkGrant(input),
    invoke: (input) => auth.invoke(input),
    issueConsumerBindToken: (clientContext, input) =>
      bindTokens.issueConsumerBindToken(clientContext, input),
    verifyConsumerBindToken: (token, expected) =>
      bindTokens.verifyConsumerBindToken(token, expected),
    forPackage: (packageId, portOptions) => auth.forPackage(packageId, portOptions),
    listProjection: (filter) => auth.listProjection(filter),
  };
  return Object.freeze(service);
}
