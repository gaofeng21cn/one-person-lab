import {
  isRecord,
  isTrustedHost,
  newId,
  nowIso,
  txImmediate,
  type ClientContext,
  type SqliteDb,
} from '@opl/core';

import { recordConnectAudit, requireTrustedHost } from '../audit.ts';
import { ConnectError, ConnectProviderError, type InvocationDisposition } from '../errors.ts';
import {
  ConnectionRegistry,
  toProviderRef,
  type RawConnectionRow,
} from '../registry/connection-registry.ts';
import {
  ID_PATTERN,
  assertNoSecretPayload,
  isVaultOwnedHandle,
  normalizeCapabilities,
  safeLabel,
} from '../sanitize.ts';
import type {
  AccessRequestResult,
  ApproveRequestInput,
  CapabilityDescriptor,
  CapabilityRisk,
  CheckGrantInput,
  CheckGrantResult,
  ConnectAuditContext,
  ConnectChangedEvent,
  ConnectEventBus,
  ConnectProjection,
  ConnectionProvider,
  ConnectionSummary,
  DenyRequestInput,
  GrantStatus,
  GrantSummary,
  InvocationRecord,
  InvokeInput,
  InvokeResult,
  PackageConnectPort,
  RequestAccessInput,
  RevokeInput,
  RuntimeDigestVerifier,
} from '../types.ts';
import type { SecretVault } from '../vault/types.ts';
import {
  ConsumerBindTokenAuthority,
  loadVerifiedInstalledPackage,
  type RawInstalledPackageRow,
} from './bind-token.ts';

const HISTORY_LIMIT = 256;
const MAX_CAPABILITIES_PER_REQUEST = 32;

interface RawGrantRow {
  readonly grant_id: string;
  readonly request_batch_id: string | null;
  readonly consumer_package_id: string;
  readonly consumer_content_digest: string;
  readonly connection_id: string;
  readonly connection_security_revision: number;
  readonly capability_id: string;
  readonly capability_title: string;
  readonly capability_risk: CapabilityRisk;
  readonly status: GrantStatus;
  readonly approved_by: string | null;
  readonly approved_at: string | null;
  readonly expires_at: string | null;
  readonly decided_at: string | null;
  readonly decided_by_client_kind: string | null;
  readonly revoked_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ConnectAuthorizationOptions {
  readonly db: SqliteDb;
  readonly registry: ConnectionRegistry;
  readonly vault: SecretVault;
  readonly bindTokenAuthority: ConsumerBindTokenAuthority;
  readonly providers?: ReadonlyMap<string, ConnectionProvider>;
  readonly eventBus?: ConnectEventBus;
  readonly verifyRuntimeDigest?: RuntimeDigestVerifier;
  readonly nowMs?: () => number;
}

function parseIsoTimestampOrNull(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ConnectError('INVALID_INPUT', 'expires_at must be a valid ISO timestamp or null.');
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    throw new ConnectError('INVALID_INPUT', 'expires_at must be a valid ISO timestamp.');
  }
  return new Date(ms).toISOString();
}

function parseCapabilitiesFromRow(row: RawConnectionRow): CapabilityDescriptor[] {
  try {
    const parsed = JSON.parse(row.capabilities_json) as unknown;
    return Array.isArray(parsed) ? (parsed as CapabilityDescriptor[]) : [];
  } catch {
    return [];
  }
}

function readPackageDisplayName(pkg: RawInstalledPackageRow | undefined, fallbackId: string): string {
  if (!pkg) return fallbackId;
  try {
    const manifest = JSON.parse(pkg.manifest_json) as unknown;
    if (isRecord(manifest)) {
      const identity = isRecord(manifest.identity) ? manifest.identity : manifest;
      const name = identity.name ?? identity.display_name;
      if (typeof name === 'string') return safeLabel(name, fallbackId);
      if (isRecord(name)) {
        const candidate = name['en-US'] ?? name['zh-CN'];
        if (typeof candidate === 'string') return safeLabel(candidate, fallbackId);
      }
    }
  } catch {
    // ignore malformed manifest_json in display projection
  }
  return fallbackId;
}

function toGrantSummary(
  row: RawGrantRow,
  consumerDisplayName: string,
  staleReason: string | null,
): GrantSummary {
  const effectiveStatus = row.status === 'granted' && staleReason ? 'stale' : row.status;
  return Object.freeze({
    grant_id: row.grant_id,
    request_id: row.request_batch_id ?? row.grant_id,
    consumer_package_id: row.consumer_package_id,
    consumer_display_name: consumerDisplayName,
    connection_id: row.connection_id,
    connection_security_revision: row.connection_security_revision,
    capability_id: row.capability_id,
    capability_title: row.capability_title,
    capability_risk: row.capability_risk,
    status: effectiveStatus,
    stale_reason: row.status === 'granted' ? staleReason : null,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    expires_at: row.expires_at,
    decided_at: row.decided_at,
    decided_by_client_kind: row.decided_by_client_kind,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

export class ConnectAuthorizationService {
  readonly #db: SqliteDb;
  readonly #registry: ConnectionRegistry;
  readonly #vault: SecretVault;
  readonly #bindTokens: ConsumerBindTokenAuthority;
  readonly #providers: Map<string, ConnectionProvider>;
  readonly #eventBus?: ConnectEventBus;
  readonly #verifyRuntimeDigest?: RuntimeDigestVerifier;
  readonly #nowMs: () => number;
  readonly #invocations: InvocationRecord[] = [];

  constructor(options: ConnectAuthorizationOptions) {
    this.#db = options.db;
    this.#registry = options.registry;
    this.#vault = options.vault;
    this.#bindTokens = options.bindTokenAuthority;
    this.#providers = new Map(options.providers ?? []);
    this.#eventBus = options.eventBus;
    this.#verifyRuntimeDigest = options.verifyRuntimeDigest;
    this.#nowMs = options.nowMs ?? (() => Date.now());
  }

  registerProvider(provider: ConnectionProvider): void {
    if (typeof provider?.provider_type !== 'string' || !ID_PATTERN.test(provider.provider_type)) {
      throw new ConnectError('INVALID_INPUT', 'Provider requires a valid provider_type.');
    }
    this.#providers.set(provider.provider_type, provider);
  }

  async requestAccess(input: RequestAccessInput): Promise<AccessRequestResult> {
    let consumerPackageId: string;
    if (input.consumer_bind_token !== undefined) {
      const claims = await this.#bindTokens.verifyConsumerBindToken(input.consumer_bind_token, {
        session_id: input.session_id,
        consumer_package_id: input.consumer_package_id,
      });
      consumerPackageId = claims.consumer_package_id;
    } else if (typeof input.consumer_package_id === 'string' && input.consumer_package_id.trim()) {
      consumerPackageId = input.consumer_package_id.trim();
    } else {
      throw new ConnectError(
        'INVALID_INPUT',
        'requestAccess requires consumer_package_id or consumer_bind_token.',
      );
    }

    if (typeof input.connection_id !== 'string' || !ID_PATTERN.test(input.connection_id)) {
      throw new ConnectError('INVALID_INPUT', 'connection_id must be a valid identifier.');
    }
    if (
      !Array.isArray(input.capability_ids)
      || input.capability_ids.length < 1
      || input.capability_ids.length > MAX_CAPABILITIES_PER_REQUEST
      || input.capability_ids.some((c) => typeof c !== 'string' || !ID_PATTERN.test(c))
      || new Set(input.capability_ids).size !== input.capability_ids.length
    ) {
      throw new ConnectError(
        'INVALID_INPUT',
        'capability_ids must be a unique non-empty list of valid capability identifiers.',
      );
    }

    const expiresAt = parseIsoTimestampOrNull(input.expires_at);
    const consumer = await loadVerifiedInstalledPackage(
      this.#db,
      consumerPackageId,
      this.#verifyRuntimeDigest,
    );
    const initialConn = this.#registry.getRawRowOrThrow(input.connection_id);
    if (initialConn.status !== 'active') {
      throw new ConnectError(
        'CONNECTION_DISABLED',
        `Connection '${initialConn.connection_id}' is ${initialConn.status}.`,
      );
    }

    const liveCaps = await this.resolveLiveCapabilities(initialConn);
    const capById = new Map(liveCaps.map((cap) => [cap.capability_id, cap]));
    const selectedCaps = input.capability_ids.map((capId) => {
      const cap = capById.get(capId);
      if (!cap) {
        throw new ConnectError(
          'PROVIDER_CAPABILITY_MISSING',
          `Capability '${capId}' is not declared by connection '${initialConn.connection_id}'.`,
        );
      }
      return cap;
    });

    const batchId = newId('req');
    const now = nowIso();
    const wasInTx = this.#db.isTransaction;

    const result = txImmediate(this.#db, () => {
      const conn = this.#registry.getRawRowOrThrow(input.connection_id);
      if (conn.status !== 'active') {
        throw new ConnectError(
          'CONNECTION_DISABLED',
          `Connection '${conn.connection_id}' is ${conn.status}.`,
        );
      }
      if (conn.security_revision !== initialConn.security_revision) {
        throw new ConnectError(
          'CONNECTION_REVISION_CHANGED',
          'Connection security_revision changed while preparing access request.',
        );
      }

      const grants: GrantSummary[] = [];
      const insertStmt = this.#db.prepare(
        'INSERT INTO connection_grants (grant_id, request_batch_id, consumer_package_id, consumer_content_digest, connection_id, connection_security_revision, capability_id, capability_title, capability_risk, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );

      for (const cap of selectedCaps) {
        const grantId = newId('grant');
        insertStmt.run(
          grantId,
          batchId,
          consumer.package_id,
          consumer.content_digest,
          conn.connection_id,
          conn.security_revision,
          cap.capability_id,
          cap.title,
          cap.risk,
          'requested',
          expiresAt,
          now,
          now,
        );
        grants.push(
          toGrantSummary(
            this.getGrantRowOrThrow(grantId),
            consumer.package_id,
            null,
          ),
        );
      }

      recordConnectAudit({
        db: this.#db,
        kind: 'access_requested',
        connection_id: conn.connection_id,
        grant_id: grants[0]?.grant_id ?? null,
        consumer_package_id: consumer.package_id,
        capability_id: selectedCaps.map((c) => c.capability_id).join(','),
        actor_kind: 'consumer_port',
        summary: `Access requested by ${consumer.package_id} on ${conn.connection_id} (${selectedCaps.length} capability/ies)`,
        evidence_refs: [`connect/requests/${batchId}`],
      });

      return Object.freeze({
        request_id: batchId,
        consumer_package_id: consumer.package_id,
        connection_id: conn.connection_id,
        connection_security_revision: conn.security_revision,
        grants: Object.freeze(grants),
        status: 'requested' as const,
        created_at: now,
      });
    });

    if (!wasInTx) {
      this.emitChanged({
        kind: 'access_requested',
        connection_id: result.connection_id,
        request_id: result.request_id,
        grant_id: result.grants[0]?.grant_id,
        consumer_package_id: result.consumer_package_id,
        security_revision: result.connection_security_revision,
        timestamp: now,
      });
    }

    return result;
  }

  async approveRequest(
    clientContext: ClientContext,
    input: ApproveRequestInput,
    auditContext?: ConnectAuditContext,
  ): Promise<GrantSummary[]> {
    const trusted = requireTrustedHost(clientContext, 'connect.approveRequest');
    const pendingRows = this.findTargetedPendingRows(input.grant_id, input.request_id);
    if (pendingRows.length === 0) {
      throw new ConnectError('REQUEST_NOT_PENDING', 'No pending access request found to approve.');
    }

    const overrideExpiresAt = input.expires_at !== undefined
      ? parseIsoTimestampOrNull(input.expires_at)
      : undefined;

    // Pre-verify consumer & live provider capabilities before entering write lock
    const firstRow = pendingRows[0]!;
    const initialConn = this.#registry.getRawRowOrThrow(firstRow.connection_id);
    const liveCaps = await this.resolveLiveCapabilities(initialConn);
    const capById = new Map(liveCaps.map((c) => [c.capability_id, c]));

    for (const row of pendingRows) {
      const consumer = await loadVerifiedInstalledPackage(
        this.#db,
        row.consumer_package_id,
        this.#verifyRuntimeDigest,
      );
      if (consumer.content_digest !== row.consumer_content_digest) {
        throw new ConnectError(
          'CONSUMER_DIGEST_MISMATCH',
          `Consumer '${row.consumer_package_id}' digest changed since access request.`,
        );
      }
      const liveCap = capById.get(row.capability_id);
      if (!liveCap) {
        throw new ConnectError(
          'PROVIDER_CAPABILITY_MISSING',
          `Capability '${row.capability_id}' is no longer available on '${row.connection_id}'.`,
        );
      }
      if (liveCap.risk !== row.capability_risk) {
        throw new ConnectError(
          'CAPABILITY_RISK_ESCALATION',
          `Capability '${row.capability_id}' risk changed from '${row.capability_risk}' to '${liveCap.risk}'.`,
        );
      }
      if (liveCap.title !== row.capability_title) {
        throw new ConnectError(
          'CAPABILITY_MISMATCH',
          `Capability '${row.capability_id}' title changed since request.`,
        );
      }
    }

    const now = nowIso();
    const approvedBy = safeLabel(
      input.approved_by ?? auditContext?.actor_id ?? trusted.client_kind,
      trusted.client_kind,
      128,
    );
    const wasInTx = this.#db.isTransaction;

    const approved = txImmediate(this.#db, () => {
      const lockedRows = this.findTargetedPendingRows(input.grant_id, input.request_id);
      if (lockedRows.length !== pendingRows.length) {
        throw new ConnectError('REQUEST_NOT_PENDING', 'Pending access request state changed concurrently.');
      }

      const out: GrantSummary[] = [];
      for (const row of lockedRows) {
        const conn = this.#registry.getRawRowOrThrow(row.connection_id);
        if (conn.status !== 'active') {
          throw new ConnectError('CONNECTION_DISABLED', `Connection '${conn.connection_id}' is ${conn.status}.`);
        }
        if (conn.security_revision !== row.connection_security_revision) {
          throw new ConnectError(
            'CONNECTION_REVISION_CHANGED',
            `Connection '${conn.connection_id}' security_revision changed since request.`,
          );
        }
        const effectiveExpiresAt = overrideExpiresAt !== undefined ? overrideExpiresAt : row.expires_at;
        if (effectiveExpiresAt !== null && Date.parse(effectiveExpiresAt) <= this.#nowMs()) {
          throw new ConnectError('GRANT_EXPIRED', 'Cannot approve a grant that is already expired.');
        }

        const updateRes = this.#db
          .prepare(
            "UPDATE connection_grants SET status = 'granted', approved_by = ?, approved_at = ?, expires_at = ?, decided_at = ?, decided_by_client_kind = ?, updated_at = ? WHERE grant_id = ? AND status = 'requested'",
          )
          .run(
            approvedBy,
            now,
            effectiveExpiresAt,
            now,
            trusted.client_kind,
            now,
            row.grant_id,
          );
        if (updateRes.changes !== 1) {
          throw new ConnectError('REQUEST_NOT_PENDING', `Grant '${row.grant_id}' is no longer pending.`);
        }

        recordConnectAudit({
          db: this.#db,
          kind: 'grant_approved',
          connection_id: row.connection_id,
          grant_id: row.grant_id,
          consumer_package_id: row.consumer_package_id,
          capability_id: row.capability_id,
          capability_risk: row.capability_risk,
          actor_kind: trusted.client_kind,
          summary: `Approved grant ${row.grant_id} for ${row.consumer_package_id} (${row.capability_id})`,
          audit_context: auditContext,
          ledger_kind: 'human_decision',
          ledger_decision: 'grant_approved',
          evidence_refs: [`connect/grants/${row.grant_id}`],
        });

        out.push(toGrantSummary(this.getGrantRowOrThrow(row.grant_id), row.consumer_package_id, null));
      }

      return out;
    });

    if (!wasInTx) {
      for (const grant of approved) {
        this.emitChanged({
          kind: 'grant_approved',
          connection_id: grant.connection_id,
          grant_id: grant.grant_id,
          request_id: grant.request_id,
          consumer_package_id: grant.consumer_package_id,
          capability_id: grant.capability_id,
          security_revision: grant.connection_security_revision,
          timestamp: now,
        });
      }
    }

    return approved;
  }

  denyRequest(
    clientContext: ClientContext,
    input: DenyRequestInput,
    auditContext?: ConnectAuditContext,
  ): GrantSummary[] {
    const trusted = requireTrustedHost(clientContext, 'connect.denyRequest');
    const now = nowIso();
    const wasInTx = this.#db.isTransaction;

    const denied = txImmediate(this.#db, () => {
      const pendingRows = this.findTargetedPendingRows(input.grant_id, input.request_id);
      if (pendingRows.length === 0) {
        throw new ConnectError('REQUEST_NOT_PENDING', 'No pending access request found to deny.');
      }

      const out: GrantSummary[] = [];
      for (const row of pendingRows) {
        const res = this.#db
          .prepare(
            "UPDATE connection_grants SET status = 'denied', decided_at = ?, decided_by_client_kind = ?, updated_at = ? WHERE grant_id = ? AND status = 'requested'",
          )
          .run(now, trusted.client_kind, now, row.grant_id);
        if (res.changes !== 1) {
          throw new ConnectError('REQUEST_NOT_PENDING', `Grant '${row.grant_id}' is no longer pending.`);
        }

        recordConnectAudit({
          db: this.#db,
          kind: 'grant_denied',
          connection_id: row.connection_id,
          grant_id: row.grant_id,
          consumer_package_id: row.consumer_package_id,
          capability_id: row.capability_id,
          capability_risk: row.capability_risk,
          actor_kind: trusted.client_kind,
          summary: input.reason?.trim()
            ? `Denied grant ${row.grant_id}: ${input.reason.trim()}`
            : `Denied grant ${row.grant_id} for ${row.consumer_package_id}`,
          audit_context: auditContext,
          ledger_kind: 'human_decision',
          ledger_decision: 'grant_denied',
          evidence_refs: [`connect/grants/${row.grant_id}`],
        });

        out.push(toGrantSummary(this.getGrantRowOrThrow(row.grant_id), row.consumer_package_id, null));
      }
      return out;
    });

    if (!wasInTx) {
      for (const grant of denied) {
        this.emitChanged({
          kind: 'grant_denied',
          connection_id: grant.connection_id,
          grant_id: grant.grant_id,
          request_id: grant.request_id,
          consumer_package_id: grant.consumer_package_id,
          capability_id: grant.capability_id,
          timestamp: now,
        });
      }
    }

    return denied;
  }

  async revoke(
    clientContext: ClientContext,
    input: RevokeInput,
    auditContext?: ConnectAuditContext,
  ): Promise<GrantSummary | ConnectionSummary> {
    const trusted = requireTrustedHost(clientContext, 'connect.revoke');
    if (input.grant_id !== undefined) {
      const now = nowIso();
      const wasInTx = this.#db.isTransaction;
      const revoked = txImmediate(this.#db, () => {
        const row = this.getGrantRow(input.grant_id!);
        if (!row) {
          throw new ConnectError('GRANT_NOT_FOUND', `Grant '${input.grant_id}' not found.`);
        }
        if (row.status !== 'granted' && row.status !== 'requested') {
          throw new ConnectError('GRANT_NOT_ACTIVE', `Grant '${row.grant_id}' is ${row.status}.`);
        }
        this.#db
          .prepare(
            "UPDATE connection_grants SET status = 'revoked', revoked_at = ?, updated_at = ? WHERE grant_id = ?",
          )
          .run(now, now, row.grant_id);

        recordConnectAudit({
          db: this.#db,
          kind: 'grant_revoked',
          connection_id: row.connection_id,
          grant_id: row.grant_id,
          consumer_package_id: row.consumer_package_id,
          capability_id: row.capability_id,
          capability_risk: row.capability_risk,
          actor_kind: trusted.client_kind,
          summary: input.reason?.trim()
            ? `Revoked grant ${row.grant_id}: ${input.reason.trim()}`
            : `Revoked grant ${row.grant_id} for ${row.consumer_package_id}`,
          audit_context: auditContext,
          ledger_kind: 'human_decision',
          ledger_decision: 'grant_revoked',
          evidence_refs: [`connect/grants/${row.grant_id}`],
        });

        return toGrantSummary(this.getGrantRowOrThrow(row.grant_id), row.consumer_package_id, null);
      });

      if (!wasInTx) {
        this.emitChanged({
          kind: 'grant_revoked',
          connection_id: revoked.connection_id,
          grant_id: revoked.grant_id,
          consumer_package_id: revoked.consumer_package_id,
          capability_id: revoked.capability_id,
          timestamp: now,
        });
      }
      return revoked;
    }

    if (input.connection_id !== undefined) {
      return this.#registry.revokeConnection(
        trusted,
        {
          connection_id: input.connection_id,
          delete_permanently: input.delete_permanently,
          purge_secret: input.purge_secret,
          reason: input.reason,
        },
        auditContext,
      );
    }

    throw new ConnectError('INVALID_INPUT', 'revoke requires grant_id or connection_id.');
  }

  async checkGrant(input: CheckGrantInput): Promise<CheckGrantResult> {
    if (input.consumer_bind_token !== undefined) {
      try {
        await this.#bindTokens.verifyConsumerBindToken(input.consumer_bind_token, {
          session_id: input.session_id,
          consumer_package_id: input.consumer_package_id,
        });
      } catch (error) {
        return {
          allowed: false,
          reason: error instanceof ConnectError ? error.reason_code : 'unauthorized_bind_token',
        };
      }
    }

    let pkg;
    try {
      pkg = await loadVerifiedInstalledPackage(
        this.#db,
        input.consumer_package_id,
        this.#verifyRuntimeDigest,
      );
    } catch (error) {
      return {
        allowed: false,
        reason: error instanceof ConnectError ? error.reason_code : 'consumer_unavailable',
      };
    }

    if (
      input.expected_consumer_digest !== undefined
      && pkg.content_digest !== input.expected_consumer_digest
    ) {
      return { allowed: false, reason: 'consumer_digest_mismatch' };
    }

    const conn = this.#registry.getRawRow(input.connection_id);
    if (!conn) {
      return { allowed: false, reason: 'connection_not_found' };
    }
    if (conn.status !== 'active') {
      return { allowed: false, reason: `connection_${conn.status}` };
    }

    const grantRow = this.#db
      .prepare(
        "SELECT grant_id, request_batch_id, consumer_package_id, consumer_content_digest, connection_id, connection_security_revision, capability_id, capability_title, capability_risk, status, approved_by, approved_at, expires_at, decided_at, decided_by_client_kind, revoked_at, created_at, updated_at FROM connection_grants WHERE consumer_package_id = ? AND connection_id = ? AND capability_id = ? AND status = 'granted' ORDER BY created_at DESC, rowid DESC LIMIT 1",
      )
      .get(input.consumer_package_id, input.connection_id, input.capability_id) as unknown as
      | RawGrantRow
      | undefined;

    if (!grantRow) {
      return { allowed: false, reason: 'grant_not_found' };
    }

    if (grantRow.consumer_content_digest !== pkg.content_digest) {
      return { allowed: false, reason: 'consumer_digest_mismatch' };
    }

    if (grantRow.connection_security_revision !== conn.security_revision) {
      return { allowed: false, reason: 'connection_revision_changed' };
    }

    if (grantRow.expires_at !== null) {
      const expiresMs = Date.parse(grantRow.expires_at);
      if (!Number.isFinite(expiresMs) || expiresMs <= this.#nowMs()) {
        return { allowed: false, reason: 'grant_expired' };
      }
    }

    let liveCaps: CapabilityDescriptor[];
    try {
      liveCaps = await this.resolveLiveCapabilities(conn);
    } catch {
      return { allowed: false, reason: 'provider_unavailable' };
    }

    const liveCap = liveCaps.find((c) => c.capability_id === input.capability_id);
    if (!liveCap) {
      return { allowed: false, reason: 'provider_capability_missing' };
    }
    if (liveCap.risk !== grantRow.capability_risk) {
      return { allowed: false, reason: 'capability_risk_escalation' };
    }
    if (liveCap.title !== grantRow.capability_title) {
      return { allowed: false, reason: 'capability_title_mismatch' };
    }

    if (input.expected_risk !== undefined && grantRow.capability_risk !== input.expected_risk) {
      return { allowed: false, reason: 'capability_risk_escalation' };
    }
    if (input.expected_title !== undefined && grantRow.capability_title !== input.expected_title) {
      return { allowed: false, reason: 'capability_title_mismatch' };
    }

    return {
      allowed: true,
      grant: toGrantSummary(grantRow, pkg.package_id, null),
      connection_security_revision: conn.security_revision,
      consumer_content_digest: pkg.content_digest,
    };
  }

  async invoke(input: InvokeInput): Promise<InvokeResult> {
    let consumerPackageId: string;
    let actorKind: ClientContext['client_kind'] | 'consumer_port' = 'consumer_port';

    if (input.consumer_bind_token !== undefined) {
      const claims = await this.#bindTokens.verifyConsumerBindToken(input.consumer_bind_token, {
        session_id: input.session_id,
        consumer_package_id: input.consumer_package_id,
      });
      consumerPackageId = claims.consumer_package_id;
    } else if (input.client_context && isTrustedHost(input.client_context.client_kind) && input.client_context.trusted_host) {
      actorKind = input.client_context.client_kind;
      if (typeof input.consumer_package_id !== 'string' || !input.consumer_package_id.trim()) {
        throw new ConnectError('INVALID_INPUT', 'consumer_package_id is required.');
      }
      consumerPackageId = input.consumer_package_id.trim();
    } else if (input.client_context) {
      throw new ConnectError(
        'TRUSTED_HOST_REQUIRED',
        `connect.invoke requires a valid consumerBindToken or trusted host; got client_kind='${input.client_context.client_kind}'.`,
      );
    } else {
      throw new ConnectError(
        'UNAUTHORIZED_BIND_TOKEN',
        'connect.invoke requires a valid consumerBindToken or trusted host context.',
      );
    }

    if (typeof input.connection_id !== 'string' || !ID_PATTERN.test(input.connection_id)) {
      throw new ConnectError('INVALID_INPUT', 'connection_id must be a valid identifier.');
    }
    if (typeof input.capability_id !== 'string' || !ID_PATTERN.test(input.capability_id)) {
      throw new ConnectError('INVALID_INPUT', 'capability_id must be a valid identifier.');
    }

    const safeInput = assertNoSecretPayload(input.input, 'Invocation input');
    const preCheck = await this.checkGrantOrThrow({
      consumer_package_id: consumerPackageId,
      connection_id: input.connection_id,
      capability_id: input.capability_id,
    });

    const conn = this.#registry.getRawRowOrThrow(input.connection_id);
    if (conn.security_revision !== preCheck.connection_security_revision) {
      throw new ConnectError('CONNECTION_REVISION_CHANGED', 'Connection security_revision changed before dispatch.');
    }
    const provider = this.#providers.get(conn.provider_type);
    if (!provider) {
      throw new ConnectError(
        'PROVIDER_UNAVAILABLE',
        `No provider registered for provider_type '${conn.provider_type}'.`,
      );
    }

    let secret: string | null = null;
    if (isVaultOwnedHandle(conn.credential_handle)) {
      secret = await this.#vault.getSecret(conn.credential_handle);
      if (secret === null) {
        throw new ConnectError(
          'VAULT_ERROR',
          `Credential missing from vault for connection '${conn.connection_id}'.`,
        );
      }
    }

    const invocationId = newId('inv');
    const startedAt = nowIso();
    const record: {
      invocation_id: string;
      consumer_package_id: string;
      connection_id: string;
      capability_id: string;
      capability_title: string;
      capability_risk: CapabilityRisk;
      grant_id: string;
      disposition: InvocationDisposition;
      started_at: string;
      finished_at: string | null;
    } = {
      invocation_id: invocationId,
      consumer_package_id: consumerPackageId,
      connection_id: conn.connection_id,
      capability_id: input.capability_id,
      capability_title: preCheck.grant.capability_title,
      capability_risk: preCheck.grant.capability_risk,
      grant_id: preCheck.grant.grant_id,
      disposition: 'unknown_after_dispatch',
      started_at: startedAt,
      finished_at: null,
    };
    this.pushInvocationHistory(record);

    let rawResult: unknown;
    try {
      rawResult = await provider.invoke({
        connection: toProviderRef(conn),
        secret,
        consumer_package_id: consumerPackageId,
        capability_id: input.capability_id,
        invocation_id: invocationId,
        input: safeInput,
      });
    } catch (error) {
      const disposition = error instanceof ConnectProviderError
        ? error.disposition
        : 'unknown_after_dispatch';
      const finishedAt = nowIso();
      record.disposition = disposition;
      record.finished_at = finishedAt;

      this.recordInvocationOutcomeAudit({
        kind: 'capability_invoke_failed',
        connection_id: conn.connection_id,
        grant_id: preCheck.grant.grant_id,
        consumer_package_id: consumerPackageId,
        capability_id: input.capability_id,
        capability_risk: preCheck.grant.capability_risk,
        disposition,
        actor_kind: actorKind,
        summary: `Invocation ${invocationId} failed (${disposition})`,
        audit_context: input.audit_context,
        ledger_kind: 'typed_blocker',
        ledger_blocker_code: error instanceof ConnectProviderError ? error.providerCode : 'provider_outcome_unknown',
        evidence_refs: [`connect/invocations/${invocationId}`],
      });

      throw new ConnectError(
        'PROVIDER_INVOCATION_FAILED',
        error instanceof ConnectProviderError
          ? `Provider invocation failed (${error.providerCode}).`
          : 'Provider invocation failed with unknown outcome.',
        {
          reason_code: error instanceof ConnectProviderError ? error.providerCode : 'provider_outcome_unknown',
          disposition,
          details: { invocation_id: invocationId },
        },
      );
    }

    let safeResult: Record<string, unknown>;
    try {
      safeResult = assertNoSecretPayload(rawResult, 'Invocation result');
    } catch (error) {
      const finishedAt = nowIso();
      record.disposition = 'provider_reported';
      record.finished_at = finishedAt;

      this.recordInvocationOutcomeAudit({
        kind: 'capability_invoke_failed',
        connection_id: conn.connection_id,
        grant_id: preCheck.grant.grant_id,
        consumer_package_id: consumerPackageId,
        capability_id: input.capability_id,
        capability_risk: preCheck.grant.capability_risk,
        disposition: 'provider_reported',
        actor_kind: actorKind,
        summary: `Invocation ${invocationId} returned unsafe result payload`,
        audit_context: input.audit_context,
        ledger_kind: 'typed_blocker',
        ledger_blocker_code: 'unsafe_provider_result',
        evidence_refs: [`connect/invocations/${invocationId}`],
      });

      if (error instanceof ConnectError) {
        throw new ConnectError(error.code, 'Provider result rejected by non-leakage policy.', {
          reason_code: error.reason_code,
          disposition: 'provider_reported',
          details: { invocation_id: invocationId },
        });
      }
      throw error;
    }

    // Post-dispatch fail-closed re-verification
    const postCheck = await this.checkGrant({
      consumer_package_id: consumerPackageId,
      connection_id: input.connection_id,
      capability_id: input.capability_id,
      expected_consumer_digest: preCheck.consumer_content_digest,
      expected_risk: preCheck.grant.capability_risk,
      expected_title: preCheck.grant.capability_title,
      ...(input.consumer_bind_token !== undefined
        ? { consumer_bind_token: input.consumer_bind_token, session_id: input.session_id }
        : {}),
    });

    if (
      !postCheck.allowed
      || postCheck.grant.grant_id !== preCheck.grant.grant_id
      || postCheck.connection_security_revision !== preCheck.connection_security_revision
    ) {
      const finishedAt = nowIso();
      record.disposition = 'unknown_after_dispatch';
      record.finished_at = finishedAt;

      const reason = !postCheck.allowed ? postCheck.reason : 'grant_or_revision_changed_midflight';
      this.recordInvocationOutcomeAudit({
        kind: 'capability_invoke_failed',
        connection_id: conn.connection_id,
        grant_id: preCheck.grant.grant_id,
        consumer_package_id: consumerPackageId,
        capability_id: input.capability_id,
        capability_risk: preCheck.grant.capability_risk,
        disposition: 'unknown_after_dispatch',
        actor_kind: actorKind,
        summary: `Invocation ${invocationId} withheld after post-dispatch verification failed (${reason})`,
        audit_context: input.audit_context,
        ledger_kind: 'typed_blocker',
        ledger_blocker_code: 'authorization_changed_after_dispatch',
        evidence_refs: [`connect/invocations/${invocationId}`],
      });

      throw new ConnectError(
        'AUTHORIZATION_CHANGED_AFTER_DISPATCH',
        `Authorization changed during dispatch (${reason}); result withheld without retry.`,
        {
          reason_code: reason,
          disposition: 'unknown_after_dispatch',
          details: { invocation_id: invocationId },
        },
      );
    }

    const finishedAt = nowIso();
    record.disposition = 'completed';
    record.finished_at = finishedAt;

    this.recordInvocationOutcomeAudit({
      kind: 'capability_invoked',
      connection_id: conn.connection_id,
      grant_id: preCheck.grant.grant_id,
      consumer_package_id: consumerPackageId,
      capability_id: input.capability_id,
      capability_risk: preCheck.grant.capability_risk,
      disposition: 'completed',
      actor_kind: actorKind,
      summary: `Invoked ${conn.connection_id}:${input.capability_id} for ${consumerPackageId}`,
      audit_context: input.audit_context,
      ledger_kind: 'owner_receipt',
      evidence_refs: [`connect/invocations/${invocationId}`],
    });

    return Object.freeze({
      invocation_id: invocationId,
      disposition: 'completed',
      grant_id: preCheck.grant.grant_id,
      connection_id: conn.connection_id,
      capability_id: input.capability_id,
      result: Object.freeze(safeResult),
    });
  }

  forPackage(
    packageId: string,
    options: {
      readonly session_id?: string;
      readonly consumer_bind_token?: string;
      readonly audit_context?: ConnectAuditContext;
    } = {},
  ): PackageConnectPort {
    if (typeof packageId !== 'string' || !packageId.trim()) {
      throw new ConnectError('CONSUMER_UNAVAILABLE', 'forPackage requires a valid package_id.');
    }
    const cleanPackageId = packageId.trim();
    const row = this.#db
      .prepare(
        'SELECT package_id, version, intent, install_path, content_digest, manifest_json, enabled FROM installed_packages WHERE package_id = ?',
      )
      .get(cleanPackageId) as unknown as RawInstalledPackageRow | undefined;

    if (!row || row.enabled !== 1 || !row.content_digest.trim()) {
      throw new ConnectError(
        'CONSUMER_UNAVAILABLE',
        `Package '${cleanPackageId}' is unavailable or disabled for Connect port binding.`,
      );
    }

    const boundDigest = row.content_digest;
    let disposed = false;

    const assertLivePort = async (): Promise<void> => {
      if (disposed) {
        throw new ConnectError('PORT_DISPOSED', `Connect port for '${cleanPackageId}' has been disposed.`);
      }
      const fresh = await loadVerifiedInstalledPackage(
        this.#db,
        cleanPackageId,
        this.#verifyRuntimeDigest,
      );
      if (fresh.content_digest !== boundDigest) {
        throw new ConnectError(
          'CONSUMER_DIGEST_MISMATCH',
          `Package '${cleanPackageId}' content_digest changed after forPackage() binding.`,
        );
      }
      if (options.consumer_bind_token !== undefined) {
        await this.#bindTokens.verifyConsumerBindToken(options.consumer_bind_token, {
          session_id: options.session_id,
          consumer_package_id: cleanPackageId,
        });
      }
    };

    const assertLivePortSync = (): void => {
      if (disposed) {
        throw new ConnectError('PORT_DISPOSED', `Connect port for '${cleanPackageId}' has been disposed.`);
      }
      if (
        options.consumer_bind_token !== undefined
        && (typeof options.session_id !== 'string' || !options.session_id.trim())
      ) {
        throw new ConnectError(
          'BIND_TOKEN_SESSION_MISMATCH',
          'consumerBindToken session_id is missing or empty.',
        );
      }
      const fresh = this.#db
        .prepare('SELECT content_digest, enabled FROM installed_packages WHERE package_id = ?')
        .get(cleanPackageId) as { content_digest: string; enabled: number } | undefined;
      if (!fresh || fresh.enabled !== 1) {
        throw new ConnectError('CONSUMER_UNAVAILABLE', `Package '${cleanPackageId}' is unavailable.`);
      }
      if (fresh.content_digest !== boundDigest) {
        throw new ConnectError(
          'CONSUMER_DIGEST_MISMATCH',
          `Package '${cleanPackageId}' content_digest changed after forPackage() binding.`,
        );
      }
    };

    const port: PackageConnectPort = {
      package_id: cleanPackageId,
      listConnections: () => {
        assertLivePortSync();
        return this.#registry.list({ status: 'active' });
      },
      listGrants: () => {
        assertLivePortSync();
        return this.listProjection({ consumer_package_id: cleanPackageId }).grants;
      },
      requestAccess: async (req) => {
        await assertLivePort();
        return this.requestAccess({
          consumer_package_id: cleanPackageId,
          ...(options.consumer_bind_token !== undefined
            ? { consumer_bind_token: options.consumer_bind_token, session_id: options.session_id }
            : {}),
          connection_id: req.connection_id,
          capability_ids: req.capability_ids,
          expires_at: req.expires_at,
        });
      },
      checkGrant: async (req) => {
        await assertLivePort();
        return this.checkGrant({
          consumer_package_id: cleanPackageId,
          connection_id: req.connection_id,
          capability_id: req.capability_id,
          expected_risk: req.expected_risk,
          expected_title: req.expected_title,
          expected_consumer_digest: boundDigest,
          ...(options.consumer_bind_token !== undefined
            ? { consumer_bind_token: options.consumer_bind_token, session_id: options.session_id }
            : {}),
        });
      },
      invoke: async (req) => {
        await assertLivePort();
        if (options.consumer_bind_token !== undefined) {
          return this.invoke({
            consumer_package_id: cleanPackageId,
            consumer_bind_token: options.consumer_bind_token,
            session_id: options.session_id,
            connection_id: req.connection_id,
            capability_id: req.capability_id,
            input: req.input,
            audit_context: req.audit_context ?? options.audit_context,
          });
        }
        const pre = await this.checkGrantOrThrow({
          consumer_package_id: cleanPackageId,
          connection_id: req.connection_id,
          capability_id: req.capability_id,
          expected_consumer_digest: boundDigest,
        });
        return this.invokeInternalFromVerifiedPort({
          consumer_package_id: cleanPackageId,
          bound_digest: boundDigest,
          preCheck: pre,
          connection_id: req.connection_id,
          capability_id: req.capability_id,
          input: req.input,
          audit_context: req.audit_context ?? options.audit_context,
        });
      },
      dispose: () => {
        disposed = true;
      },
    };
    return Object.freeze(port);
  }

  listProjection(filter: { readonly consumer_package_id?: string } = {}): ConnectProjection {
    const connections = this.#registry.list({ include_deleted: false });
    const connMap = new Map<string, RawConnectionRow>();
    for (const c of connections) {
      const raw = this.#registry.getRawRow(c.connection_id);
      if (raw) connMap.set(c.connection_id, raw);
    }

    const pkgRows = this.#db
      .prepare('SELECT package_id, version, intent, install_path, content_digest, manifest_json, enabled FROM installed_packages')
      .all() as unknown as RawInstalledPackageRow[];
    const pkgMap = new Map(pkgRows.map((p) => [p.package_id, p]));

    const grantSql = filter.consumer_package_id
      ? 'SELECT grant_id, request_batch_id, consumer_package_id, consumer_content_digest, connection_id, connection_security_revision, capability_id, capability_title, capability_risk, status, approved_by, approved_at, expires_at, decided_at, decided_by_client_kind, revoked_at, created_at, updated_at FROM connection_grants WHERE consumer_package_id = ? ORDER BY created_at ASC, rowid ASC'
      : 'SELECT grant_id, request_batch_id, consumer_package_id, consumer_content_digest, connection_id, connection_security_revision, capability_id, capability_title, capability_risk, status, approved_by, approved_at, expires_at, decided_at, decided_by_client_kind, revoked_at, created_at, updated_at FROM connection_grants ORDER BY created_at ASC, rowid ASC';
    const grantRows = (filter.consumer_package_id
      ? this.#db.prepare(grantSql).all(filter.consumer_package_id)
      : this.#db.prepare(grantSql).all()) as unknown as RawGrantRow[];

    const grants = grantRows.map((row) => {
      const conn = connMap.get(row.connection_id) ?? this.#registry.getRawRow(row.connection_id);
      const pkg = pkgMap.get(row.consumer_package_id);
      const staleReason = this.computeStaleReason(row, conn, pkg);
      return toGrantSummary(row, readPackageDisplayName(pkg, row.consumer_package_id), staleReason);
    });

    const invocations = filter.consumer_package_id
      ? this.#invocations.filter((i) => i.consumer_package_id === filter.consumer_package_id)
      : [...this.#invocations];

    return Object.freeze({
      connections: Object.freeze(connections),
      grants: Object.freeze(grants),
      invocations: Object.freeze(invocations.map((r) => Object.freeze({ ...r }))),
    });
  }

  private async invokeInternalFromVerifiedPort(params: {
    readonly consumer_package_id: string;
    readonly bound_digest: string;
    readonly preCheck: Extract<CheckGrantResult, { allowed: true }>;
    readonly connection_id: string;
    readonly capability_id: string;
    readonly input: Readonly<Record<string, unknown>>;
    readonly audit_context?: ConnectAuditContext;
  }): Promise<InvokeResult> {
    const safeInput = assertNoSecretPayload(params.input, 'Invocation input');
    const conn = this.#registry.getRawRowOrThrow(params.connection_id);
    if (conn.security_revision !== params.preCheck.connection_security_revision) {
      throw new ConnectError('CONNECTION_REVISION_CHANGED', 'Connection security_revision changed before dispatch.');
    }
    const provider = this.#providers.get(conn.provider_type);
    if (!provider) {
      throw new ConnectError(
        'PROVIDER_UNAVAILABLE',
        `No provider registered for provider_type '${conn.provider_type}'.`,
      );
    }

    let secret: string | null = null;
    if (isVaultOwnedHandle(conn.credential_handle)) {
      secret = await this.#vault.getSecret(conn.credential_handle);
      if (secret === null) {
        throw new ConnectError(
          'VAULT_ERROR',
          `Credential missing from vault for connection '${conn.connection_id}'.`,
        );
      }
    }

    const invocationId = newId('inv');
    const record: {
      invocation_id: string;
      consumer_package_id: string;
      connection_id: string;
      capability_id: string;
      capability_title: string;
      capability_risk: CapabilityRisk;
      grant_id: string;
      disposition: InvocationDisposition;
      started_at: string;
      finished_at: string | null;
    } = {
      invocation_id: invocationId,
      consumer_package_id: params.consumer_package_id,
      connection_id: conn.connection_id,
      capability_id: params.capability_id,
      capability_title: params.preCheck.grant.capability_title,
      capability_risk: params.preCheck.grant.capability_risk,
      grant_id: params.preCheck.grant.grant_id,
      disposition: 'unknown_after_dispatch',
      started_at: nowIso(),
      finished_at: null,
    };
    this.pushInvocationHistory(record);

    let rawResult: unknown;
    try {
      rawResult = await provider.invoke({
        connection: toProviderRef(conn),
        secret,
        consumer_package_id: params.consumer_package_id,
        capability_id: params.capability_id,
        invocation_id: invocationId,
        input: safeInput,
      });
    } catch (error) {
      const disposition = error instanceof ConnectProviderError
        ? error.disposition
        : 'unknown_after_dispatch';
      record.disposition = disposition;
      record.finished_at = nowIso();
      this.recordInvocationOutcomeAudit({
        kind: 'capability_invoke_failed',
        connection_id: conn.connection_id,
        grant_id: params.preCheck.grant.grant_id,
        consumer_package_id: params.consumer_package_id,
        capability_id: params.capability_id,
        capability_risk: params.preCheck.grant.capability_risk,
        disposition,
        actor_kind: 'consumer_port',
        summary: `Invocation ${invocationId} failed (${disposition})`,
        audit_context: params.audit_context,
        ledger_kind: 'typed_blocker',
        ledger_blocker_code: error instanceof ConnectProviderError ? error.providerCode : 'provider_outcome_unknown',
        evidence_refs: [`connect/invocations/${invocationId}`],
      });
      throw new ConnectError(
        'PROVIDER_INVOCATION_FAILED',
        error instanceof ConnectProviderError
          ? `Provider invocation failed (${error.providerCode}).`
          : 'Provider invocation failed with unknown outcome.',
        {
          reason_code: error instanceof ConnectProviderError ? error.providerCode : 'provider_outcome_unknown',
          disposition,
          details: { invocation_id: invocationId },
        },
      );
    }

    let safeResult: Record<string, unknown>;
    try {
      safeResult = assertNoSecretPayload(rawResult, 'Invocation result');
    } catch (error) {
      record.disposition = 'provider_reported';
      record.finished_at = nowIso();
      this.recordInvocationOutcomeAudit({
        kind: 'capability_invoke_failed',
        connection_id: conn.connection_id,
        grant_id: params.preCheck.grant.grant_id,
        consumer_package_id: params.consumer_package_id,
        capability_id: params.capability_id,
        capability_risk: params.preCheck.grant.capability_risk,
        disposition: 'provider_reported',
        actor_kind: 'consumer_port',
        summary: `Invocation ${invocationId} returned unsafe result payload`,
        audit_context: params.audit_context,
        ledger_kind: 'typed_blocker',
        ledger_blocker_code: 'unsafe_provider_result',
        evidence_refs: [`connect/invocations/${invocationId}`],
      });
      if (error instanceof ConnectError) {
        throw new ConnectError(error.code, 'Provider result rejected by non-leakage policy.', {
          reason_code: error.reason_code,
          disposition: 'provider_reported',
          details: { invocation_id: invocationId },
        });
      }
      throw error;
    }

    const postCheck = await this.checkGrant({
      consumer_package_id: params.consumer_package_id,
      connection_id: params.connection_id,
      capability_id: params.capability_id,
      expected_consumer_digest: params.bound_digest,
      expected_risk: params.preCheck.grant.capability_risk,
      expected_title: params.preCheck.grant.capability_title,
    });
    if (
      !postCheck.allowed
      || postCheck.grant.grant_id !== params.preCheck.grant.grant_id
      || postCheck.connection_security_revision !== params.preCheck.connection_security_revision
    ) {
      record.disposition = 'unknown_after_dispatch';
      record.finished_at = nowIso();
      const reason = !postCheck.allowed ? postCheck.reason : 'grant_or_revision_changed_midflight';
      this.recordInvocationOutcomeAudit({
        kind: 'capability_invoke_failed',
        connection_id: conn.connection_id,
        grant_id: params.preCheck.grant.grant_id,
        consumer_package_id: params.consumer_package_id,
        capability_id: params.capability_id,
        capability_risk: params.preCheck.grant.capability_risk,
        disposition: 'unknown_after_dispatch',
        actor_kind: 'consumer_port',
        summary: `Invocation ${invocationId} withheld after post-dispatch verification failed (${reason})`,
        audit_context: params.audit_context,
        ledger_kind: 'typed_blocker',
        ledger_blocker_code: 'authorization_changed_after_dispatch',
        evidence_refs: [`connect/invocations/${invocationId}`],
      });
      throw new ConnectError(
        'AUTHORIZATION_CHANGED_AFTER_DISPATCH',
        `Authorization changed during dispatch (${reason}); result withheld without retry.`,
        {
          reason_code: reason,
          disposition: 'unknown_after_dispatch',
          details: { invocation_id: invocationId },
        },
      );
    }

    record.disposition = 'completed';
    record.finished_at = nowIso();
    this.recordInvocationOutcomeAudit({
      kind: 'capability_invoked',
      connection_id: conn.connection_id,
      grant_id: params.preCheck.grant.grant_id,
      consumer_package_id: params.consumer_package_id,
      capability_id: params.capability_id,
      capability_risk: params.preCheck.grant.capability_risk,
      disposition: 'completed',
      actor_kind: 'consumer_port',
      summary: `Invoked ${conn.connection_id}:${params.capability_id} for ${params.consumer_package_id}`,
      audit_context: params.audit_context,
      ledger_kind: 'owner_receipt',
      evidence_refs: [`connect/invocations/${invocationId}`],
    });

    return Object.freeze({
      invocation_id: invocationId,
      disposition: 'completed',
      grant_id: params.preCheck.grant.grant_id,
      connection_id: conn.connection_id,
      capability_id: params.capability_id,
      result: Object.freeze(safeResult),
    });
  }

  private async checkGrantOrThrow(
    input: CheckGrantInput,
  ): Promise<Extract<CheckGrantResult, { allowed: true }>> {
    const check = await this.checkGrant(input);
    if (check.allowed) return check;
    const codeMap: Record<string, ConnectError['code']> = {
      consumer_unavailable: 'CONSUMER_UNAVAILABLE',
      consumer_digest_mismatch: 'CONSUMER_DIGEST_MISMATCH',
      connection_not_found: 'CONNECTION_NOT_FOUND',
      connection_disabled: 'CONNECTION_DISABLED',
      connection_deleted: 'CONNECTION_DELETED',
      connection_expired: 'CONNECTION_DISABLED',
      connection_revision_changed: 'CONNECTION_REVISION_CHANGED',
      grant_not_found: 'GRANT_NOT_ACTIVE',
      grant_expired: 'GRANT_EXPIRED',
      provider_unavailable: 'PROVIDER_UNAVAILABLE',
      provider_capability_missing: 'PROVIDER_CAPABILITY_MISSING',
      capability_risk_escalation: 'CAPABILITY_RISK_ESCALATION',
      capability_title_mismatch: 'CAPABILITY_MISMATCH',
      unauthorized_bind_token: 'UNAUTHORIZED_BIND_TOKEN',
      bind_token_expired: 'BIND_TOKEN_EXPIRED',
      bind_token_session_mismatch: 'BIND_TOKEN_SESSION_MISMATCH',
      bind_token_package_mismatch: 'BIND_TOKEN_PACKAGE_MISMATCH',
    };
    throw new ConnectError(
      codeMap[check.reason] ?? 'GRANT_NOT_ACTIVE',
      `Connect grant check failed (${check.reason}).`,
      { reason_code: check.reason },
    );
  }

  private async resolveLiveCapabilities(conn: RawConnectionRow): Promise<CapabilityDescriptor[]> {
    const provider = this.#providers.get(conn.provider_type);
    if (provider) {
      const raw = await provider.listCapabilities(toProviderRef(conn));
      return normalizeCapabilities(raw);
    }
    return parseCapabilitiesFromRow(conn);
  }

  private computeStaleReason(
    grant: RawGrantRow,
    conn: RawConnectionRow | null | undefined,
    pkg: RawInstalledPackageRow | undefined,
  ): string | null {
    if (!conn) return 'connection_missing';
    if (conn.status === 'deleted') return 'connection_deleted';
    if (conn.status !== 'active') return `connection_${conn.status}`;
    if (conn.security_revision !== grant.connection_security_revision) {
      return 'connection_revision_changed';
    }
    if (!pkg || pkg.enabled !== 1) return 'consumer_descriptor_unavailable';
    if (pkg.content_digest !== grant.consumer_content_digest) {
      return 'consumer_descriptor_changed';
    }
    if (grant.expires_at !== null) {
      const exp = Date.parse(grant.expires_at);
      if (!Number.isFinite(exp) || exp <= this.#nowMs()) return 'grant_expired';
    }
    return null;
  }

  private findTargetedPendingRows(grantId?: string, requestId?: string): RawGrantRow[] {
    if (grantId !== undefined && typeof grantId === 'string' && grantId.trim()) {
      const row = this.getGrantRow(grantId.trim());
      if (!row) {
        throw new ConnectError('REQUEST_NOT_FOUND', `Grant/request '${grantId}' not found.`);
      }
      return row.status === 'requested' ? [row] : [];
    }
    if (requestId !== undefined && typeof requestId === 'string' && requestId.trim()) {
      const cleanId = requestId.trim();
      const byBatch = this.#db
        .prepare(
          "SELECT grant_id, request_batch_id, consumer_package_id, consumer_content_digest, connection_id, connection_security_revision, capability_id, capability_title, capability_risk, status, approved_by, approved_at, expires_at, decided_at, decided_by_client_kind, revoked_at, created_at, updated_at FROM connection_grants WHERE request_batch_id = ? AND status = 'requested' ORDER BY created_at ASC, rowid ASC",
        )
        .all(cleanId) as unknown as RawGrantRow[];
      if (byBatch.length > 0) return byBatch;
      const anyBatchRow = this.#db
        .prepare('SELECT 1 FROM connection_grants WHERE request_batch_id = ? LIMIT 1')
        .get(cleanId);
      if (anyBatchRow) return [];
      const single = this.getGrantRow(cleanId);
      if (single) return single.status === 'requested' ? [single] : [];
      throw new ConnectError('REQUEST_NOT_FOUND', `Request '${cleanId}' not found.`);
    }
    throw new ConnectError('INVALID_INPUT', 'Either grant_id or request_id must be provided.');
  }

  private getGrantRow(grantId: string): RawGrantRow | null {
    const row = this.#db
      .prepare(
        'SELECT grant_id, request_batch_id, consumer_package_id, consumer_content_digest, connection_id, connection_security_revision, capability_id, capability_title, capability_risk, status, approved_by, approved_at, expires_at, decided_at, decided_by_client_kind, revoked_at, created_at, updated_at FROM connection_grants WHERE grant_id = ?',
      )
      .get(grantId) as unknown as RawGrantRow | undefined;
    return row ?? null;
  }

  private getGrantRowOrThrow(grantId: string): RawGrantRow {
    const row = this.getGrantRow(grantId);
    if (!row) {
      throw new ConnectError('GRANT_NOT_FOUND', `Grant '${grantId}' not found.`);
    }
    return row;
  }

  private pushInvocationHistory(record: InvocationRecord): void {
    this.#invocations.push(record);
    if (this.#invocations.length > HISTORY_LIMIT) {
      this.#invocations.splice(0, this.#invocations.length - HISTORY_LIMIT);
    }
  }

  private recordInvocationOutcomeAudit(params: {
    readonly kind: 'capability_invoked' | 'capability_invoke_failed';
    readonly connection_id: string;
    readonly grant_id: string;
    readonly consumer_package_id: string;
    readonly capability_id: string;
    readonly capability_risk: CapabilityRisk;
    readonly disposition: InvocationDisposition;
    readonly actor_kind: ClientContext['client_kind'] | 'consumer_port';
    readonly summary: string;
    readonly audit_context?: ConnectAuditContext;
    readonly ledger_kind: 'owner_receipt' | 'typed_blocker';
    readonly ledger_blocker_code?: string;
    readonly evidence_refs: readonly string[];
  }): void {
    const wasInTx = this.#db.isTransaction;
    txImmediate(this.#db, () => {
      recordConnectAudit({
        db: this.#db,
        kind: params.kind,
        connection_id: params.connection_id,
        grant_id: params.grant_id,
        consumer_package_id: params.consumer_package_id,
        capability_id: params.capability_id,
        capability_risk: params.capability_risk,
        disposition: params.disposition,
        actor_kind: params.actor_kind,
        summary: params.summary,
        audit_context: params.audit_context,
        ledger_kind: params.ledger_kind,
        ledger_blocker_code: params.ledger_blocker_code,
        evidence_refs: params.evidence_refs,
      });
    });

    if (!wasInTx) {
      this.emitChanged({
        kind: params.kind,
        connection_id: params.connection_id,
        grant_id: params.grant_id,
        consumer_package_id: params.consumer_package_id,
        capability_id: params.capability_id,
        disposition: params.disposition,
        timestamp: nowIso(),
      });
    }
  }

  private emitChanged(event: ConnectChangedEvent): void {
    this.#eventBus?.emit('event.connect.changed', event);
  }
}
