import type { ClientContext, ClientKind, EventBus, SqliteDb } from '@opl/core';
import type { ConnectErrorDisposition, InvocationDisposition } from './errors.ts';

export type ConnectionStatus = 'active' | 'disabled' | 'expired' | 'deleted';

export type CapabilityRisk = 'read' | 'local_write' | 'external_write';

export type GrantStatus = 'requested' | 'granted' | 'denied' | 'revoked' | 'superseded';

export interface CapabilityTitleI18n {
  readonly 'zh-CN'?: string;
  readonly 'en-US'?: string;
  readonly [locale: string]: string | undefined;
}

export interface CapabilityInput {
  readonly capability_id: string;
  readonly title: string | CapabilityTitleI18n;
  readonly risk: CapabilityRisk;
}

export interface CapabilityDescriptor {
  readonly capability_id: string;
  readonly title: string;
  readonly risk: CapabilityRisk;
}

export interface ConnectionSummary {
  readonly connection_id: string;
  readonly provider_type: string;
  readonly display_name: string;
  readonly account_label: string | null;
  readonly security_revision: number;
  readonly status: ConnectionStatus;
  readonly capabilities: readonly CapabilityDescriptor[];
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ConnectionProviderRef {
  readonly connection_id: string;
  readonly provider_type: string;
  readonly display_name: string;
  readonly account_label: string | null;
  readonly endpoint: string | null;
  readonly security_revision: number;
  readonly credential_handle: string;
}

export interface ConnectionCheckResult {
  readonly ok: boolean;
  readonly connection_id: string;
  readonly provider_type: string;
  readonly status: ConnectionStatus;
  readonly security_revision: number;
  readonly credential_present: boolean;
  readonly reason: string | null;
}

export interface ConnectAuditContext {
  readonly task_id?: string;
  readonly stage_run_id?: string | null;
  readonly attempt_id?: string | null;
  readonly owner_id?: string;
  readonly actor_id?: string;
}

export interface AddConnectionInput {
  readonly connection_id?: string;
  readonly provider_type: string;
  readonly display_name: string;
  readonly account_label?: string | null;
  readonly endpoint?: string | null;
  readonly capabilities?: readonly CapabilityInput[];
  readonly secret?: string;
  readonly credential_handle?: string;
}

export interface RotateCredentialInput {
  readonly connection_id: string;
  readonly secret?: string;
  readonly credential_handle?: string;
  readonly expected_security_revision?: number;
}

export interface UpdateCapabilitiesInput {
  readonly connection_id: string;
  readonly capabilities: readonly CapabilityInput[];
  readonly bump_security_revision?: boolean;
  readonly expected_security_revision?: number;
}

export interface RevokeConnectionInput {
  readonly connection_id: string;
  readonly delete_permanently?: boolean;
  readonly purge_secret?: boolean;
  readonly reason?: string;
}

export interface ConnectionProvider {
  readonly provider_type: string;
  listCapabilities(
    connection: ConnectionProviderRef,
  ): readonly CapabilityDescriptor[] | Promise<readonly CapabilityDescriptor[]>;
  healthCheck?(connection: ConnectionProviderRef): boolean | Promise<boolean>;
  invoke(input: {
    connection: ConnectionProviderRef;
    secret: string | null;
    consumer_package_id: string;
    capability_id: string;
    invocation_id: string;
    input: Readonly<Record<string, unknown>>;
  }): Promise<unknown>;
}

export interface InstalledPackageSnapshot {
  readonly package_id: string;
  readonly version: string;
  readonly intent: 'agent' | 'app' | 'extension' | 'channel';
  readonly install_path: string;
  readonly content_digest: string;
  readonly manifest_json: string;
  readonly enabled: boolean;
}

export type RuntimeDigestVerifier = (
  pkg: InstalledPackageSnapshot,
) => boolean | Promise<boolean>;

export interface GrantSummary {
  readonly grant_id: string;
  readonly request_id: string;
  readonly consumer_package_id: string;
  readonly consumer_display_name: string;
  readonly connection_id: string;
  readonly connection_security_revision: number;
  readonly capability_id: string;
  readonly capability_title: string;
  readonly capability_risk: CapabilityRisk;
  readonly status: GrantStatus | 'stale';
  readonly stale_reason: string | null;
  readonly approved_by: string | null;
  readonly approved_at: string | null;
  readonly expires_at: string | null;
  readonly decided_at: string | null;
  readonly decided_by_client_kind: string | null;
  readonly revoked_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AccessRequestResult {
  readonly request_id: string;
  readonly consumer_package_id: string;
  readonly connection_id: string;
  readonly connection_security_revision: number;
  readonly grants: readonly GrantSummary[];
  readonly status: 'requested';
  readonly created_at: string;
}

export interface RequestAccessInput {
  readonly consumer_package_id?: string;
  readonly consumer_bind_token?: string;
  readonly session_id?: string;
  readonly connection_id: string;
  readonly capability_ids: readonly string[];
  readonly expires_at?: string | null;
}

export interface ApproveRequestInput {
  readonly grant_id?: string;
  readonly request_id?: string;
  readonly approved_by?: string;
  readonly expires_at?: string | null;
  readonly reason?: string;
}

export interface DenyRequestInput {
  readonly grant_id?: string;
  readonly request_id?: string;
  readonly reason?: string;
}

export interface RevokeInput {
  readonly grant_id?: string;
  readonly connection_id?: string;
  readonly delete_permanently?: boolean;
  readonly purge_secret?: boolean;
  readonly reason?: string;
}

export interface CheckGrantInput {
  readonly consumer_package_id: string;
  readonly connection_id: string;
  readonly capability_id: string;
  readonly expected_risk?: CapabilityRisk;
  readonly expected_title?: string;
  readonly expected_consumer_digest?: string;
  readonly consumer_bind_token?: string;
  readonly session_id?: string;
}

export type CheckGrantResult =
  | {
      readonly allowed: true;
      readonly grant: GrantSummary;
      readonly connection_security_revision: number;
      readonly consumer_content_digest: string;
    }
  | {
      readonly allowed: false;
      readonly reason: string;
    };

export interface InvokeInput {
  readonly consumer_package_id?: string;
  readonly consumer_bind_token?: string;
  readonly session_id?: string;
  readonly client_context?: ClientContext;
  readonly connection_id: string;
  readonly capability_id: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly audit_context?: ConnectAuditContext;
}

export interface InvokeResult {
  readonly invocation_id: string;
  readonly disposition: 'completed';
  readonly grant_id: string;
  readonly connection_id: string;
  readonly capability_id: string;
  readonly result: Readonly<Record<string, unknown>>;
}

export interface InvocationRecord {
  readonly invocation_id: string;
  readonly consumer_package_id: string;
  readonly connection_id: string;
  readonly capability_id: string;
  readonly capability_title: string;
  readonly capability_risk: CapabilityRisk;
  readonly grant_id: string;
  readonly disposition: InvocationDisposition;
  readonly started_at: string;
  readonly finished_at: string | null;
}

export interface IssueBindTokenInput {
  readonly session_id: string;
  readonly consumer_package_id: string;
  readonly ttl_ms?: number;
}

export interface ConsumerBindTokenClaims {
  readonly v: 1;
  readonly jti: string;
  readonly session_id: string;
  readonly consumer_package_id: string;
  readonly consumer_content_digest: string;
  readonly issued_at: string;
  readonly expires_at: string;
}

export interface IssuedConsumerBindToken {
  readonly token: string;
  readonly claims: ConsumerBindTokenClaims;
}

export interface ConnectProjection {
  readonly connections: readonly ConnectionSummary[];
  readonly grants: readonly GrantSummary[];
  readonly invocations: readonly InvocationRecord[];
}

export type ConnectChangeKind =
  | 'connection_added'
  | 'connection_updated'
  | 'credential_rotated'
  | 'connection_revoked'
  | 'access_requested'
  | 'grant_approved'
  | 'grant_denied'
  | 'grant_revoked'
  | 'capability_invoked'
  | 'capability_invoke_failed';

export interface ConnectChangedEvent {
  readonly kind: ConnectChangeKind;
  readonly connection_id: string;
  readonly grant_id?: string;
  readonly request_id?: string;
  readonly consumer_package_id?: string;
  readonly capability_id?: string;
  readonly security_revision?: number;
  readonly disposition?: InvocationDisposition | ConnectErrorDisposition;
  readonly timestamp: string;
}

export interface ConnectEvents extends Record<string, unknown> {
  'event.connect.changed': ConnectChangedEvent;
}

export interface PackageConnectPort {
  readonly package_id: string;
  listConnections(): ConnectionSummary[];
  listGrants(): readonly GrantSummary[];
  requestAccess(input: {
    connection_id: string;
    capability_ids: readonly string[];
    expires_at?: string | null;
  }): Promise<AccessRequestResult>;
  checkGrant(input: {
    connection_id: string;
    capability_id: string;
    expected_risk?: CapabilityRisk;
    expected_title?: string;
  }): Promise<CheckGrantResult>;
  invoke(input: {
    connection_id: string;
    capability_id: string;
    input: Readonly<Record<string, unknown>>;
    audit_context?: ConnectAuditContext;
  }): Promise<InvokeResult>;
  dispose(): void;
}

export type ConnectEventBus = EventBus<ConnectEvents>;

export type ConnectAuditKind =
  | 'connection_added'
  | 'connection_updated'
  | 'credential_rotated'
  | 'connection_revoked'
  | 'access_requested'
  | 'grant_approved'
  | 'grant_denied'
  | 'grant_revoked'
  | 'capability_invoked'
  | 'capability_invoke_failed';

export interface ConnectAuditInput {
  readonly db: SqliteDb;
  readonly kind: ConnectAuditKind;
  readonly connection_id: string;
  readonly grant_id?: string | null;
  readonly consumer_package_id?: string | null;
  readonly capability_id?: string | null;
  readonly capability_risk?: CapabilityRisk | null;
  readonly disposition?: InvocationDisposition | null;
  readonly actor_kind: ClientKind | 'consumer_port';
  readonly summary: string;
  readonly audit_context?: ConnectAuditContext;
  readonly ledger_kind?: 'human_decision' | 'owner_receipt' | 'typed_blocker';
  readonly ledger_decision?: string;
  readonly ledger_blocker_code?: string;
  readonly evidence_refs?: readonly string[];
}
