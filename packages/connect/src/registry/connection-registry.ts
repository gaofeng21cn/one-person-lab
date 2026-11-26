import { newId, nowIso, txImmediate, type ClientContext, type SqliteDb } from '@opl/core';

import { recordConnectAudit, requireTrustedHost } from '../audit.ts';
import { ConnectError } from '../errors.ts';
import {
  ID_PATTERN,
  assertCredentialHandleOnlyPayload,
  assertNoSecretValue,
  isVaultOwnedHandle,
  normalizeCapabilities,
  normalizeCredentialHandle,
  safeLabel,
  validateHttpEndpoint,
} from '../sanitize.ts';
import type {
  AddConnectionInput,
  CapabilityDescriptor,
  ConnectAuditContext,
  ConnectChangedEvent,
  ConnectEventBus,
  ConnectionCheckResult,
  ConnectionProvider,
  ConnectionProviderRef,
  ConnectionStatus,
  ConnectionSummary,
  RevokeConnectionInput,
  RotateCredentialInput,
  UpdateCapabilitiesInput,
} from '../types.ts';
import type { SecretVault } from '../vault/types.ts';

export interface RawConnectionRow {
  readonly connection_id: string;
  readonly provider_type: string;
  readonly display_name: string;
  readonly account_label: string | null;
  readonly credential_handle: string;
  readonly endpoint: string | null;
  readonly capabilities_json: string;
  readonly security_revision: number;
  readonly status: ConnectionStatus;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ConnectionRegistryOptions {
  readonly db: SqliteDb;
  readonly vault: SecretVault;
  readonly eventBus?: ConnectEventBus;
  readonly getProvider?: (providerType: string) => ConnectionProvider | undefined;
}

function parseCapabilitiesJson(raw: string): CapabilityDescriptor[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as CapabilityDescriptor[];
  } catch {
    return [];
  }
}

function toSummary(row: RawConnectionRow): ConnectionSummary {
  return Object.freeze({
    connection_id: row.connection_id,
    provider_type: row.provider_type,
    display_name: row.display_name,
    account_label: row.account_label,
    security_revision: row.security_revision,
    status: row.status,
    capabilities: Object.freeze(parseCapabilitiesJson(row.capabilities_json)),
    created_at: row.created_at || row.updated_at,
    updated_at: row.updated_at,
  });
}

export function toProviderRef(row: RawConnectionRow): ConnectionProviderRef {
  return Object.freeze({
    connection_id: row.connection_id,
    provider_type: row.provider_type,
    display_name: row.display_name,
    account_label: row.account_label,
    endpoint: row.endpoint,
    security_revision: row.security_revision,
    credential_handle: row.credential_handle,
  });
}

function capabilitiesChangedSecurity(
  prev: readonly CapabilityDescriptor[],
  next: readonly CapabilityDescriptor[],
): boolean {
  const nextById = new Map(next.map((c) => [c.capability_id, c]));
  for (const oldCap of prev) {
    const updated = nextById.get(oldCap.capability_id);
    if (!updated) return true;
    if (updated.title !== oldCap.title || updated.risk !== oldCap.risk) return true;
  }
  return false;
}

export class ConnectionRegistry {
  readonly #db: SqliteDb;
  readonly #vault: SecretVault;
  readonly #eventBus?: ConnectEventBus;
  readonly #getProvider?: (providerType: string) => ConnectionProvider | undefined;

  constructor(options: ConnectionRegistryOptions) {
    this.#db = options.db;
    this.#vault = options.vault;
    this.#eventBus = options.eventBus;
    this.#getProvider = options.getProvider;
  }

  async add(
    clientContext: ClientContext,
    input: AddConnectionInput,
    auditContext?: ConnectAuditContext,
  ): Promise<ConnectionSummary> {
    const trusted = requireTrustedHost(clientContext, 'connect.add');
    const rawRecord = input as unknown as Record<string, unknown>;
    // Ensure caller didn't smuggle raw secret fields alongside input
    const sanitizedProbe = { ...rawRecord };
    delete sanitizedProbe.secret;
    assertCredentialHandleOnlyPayload(sanitizedProbe);

    if (typeof input?.provider_type !== 'string' || !ID_PATTERN.test(input.provider_type.trim())) {
      throw new ConnectError('INVALID_INPUT', 'provider_type must be a valid identifier.');
    }
    const providerType = input.provider_type.trim();
    if (typeof input.display_name === 'string') {
      assertNoSecretValue(input.display_name, 'Connection display_name', '$.display_name');
    }
    const displayName = safeLabel(input.display_name, '', 160);
    if (!displayName) {
      throw new ConnectError('INVALID_INPUT', 'display_name must be a non-empty string.');
    }
    assertNoSecretValue(displayName, 'Connection display_name', '$.display_name');
    if (typeof input.account_label === 'string') {
      assertNoSecretValue(input.account_label, 'Connection account_label', '$.account_label');
    }
    const accountLabel = input.account_label === undefined || input.account_label === null
      ? null
      : safeLabel(input.account_label, '', 240) || null;
    if (accountLabel !== null) {
      assertNoSecretValue(accountLabel, 'Connection account_label', '$.account_label');
    }
    const endpoint = validateHttpEndpoint(input.endpoint);
    const capabilities = normalizeCapabilities(input.capabilities ?? []);

    let connectionId: string;
    if (input.connection_id !== undefined) {
      if (typeof input.connection_id !== 'string' || !ID_PATTERN.test(input.connection_id.trim())) {
        throw new ConnectError('INVALID_INPUT', 'connection_id must be a valid identifier.');
      }
      connectionId = input.connection_id.trim();
    } else {
      connectionId = newId('conn');
    }

    const hasSecret = input.secret !== undefined;
    const hasHandle = input.credential_handle !== undefined;
    if (hasSecret === hasHandle) {
      throw new ConnectError(
        'INVALID_INPUT',
        'Provide exactly one of secret or credential_handle when adding a connection.',
      );
    }

    let storedNewSecret = false;
    let credentialHandle: string;
    if (hasSecret) {
      if (typeof input.secret !== 'string' || input.secret.length === 0) {
        throw new ConnectError('INVALID_INPUT', 'secret must be a non-empty string.');
      }
      const meta = await this.#vault.putSecret({ namespace: providerType, secret: input.secret });
      credentialHandle = meta.handle;
      storedNewSecret = true;
    } else {
      credentialHandle = normalizeCredentialHandle(input.credential_handle);
      if (isVaultOwnedHandle(credentialHandle)) {
        const exists = await this.#vault.hasSecret(credentialHandle);
        if (!exists) {
          throw new ConnectError(
            'INVALID_CREDENTIAL_HANDLE',
            'Referenced vault credential handle does not exist.',
          );
        }
      }
    }

    const now = nowIso();
    const wasInTx = this.#db.isTransaction;
    try {
      const summary = txImmediate(this.#db, () => {
        const dup = this.#db
          .prepare('SELECT connection_id FROM connections WHERE connection_id = ?')
          .get(connectionId) as { connection_id: string } | undefined;
        if (dup) {
          throw new ConnectError(
            'CONNECTION_DUPLICATE',
            `Connection '${connectionId}' already exists.`,
          );
        }
        this.#db
          .prepare(
            'INSERT INTO connections (connection_id, provider_type, display_name, account_label, credential_handle, endpoint, capabilities_json, security_revision, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            connectionId,
            providerType,
            displayName,
            accountLabel,
            credentialHandle,
            endpoint,
            JSON.stringify(capabilities),
            1,
            'active',
            now,
            now,
          );

        recordConnectAudit({
          db: this.#db,
          kind: 'connection_added',
          connection_id: connectionId,
          actor_kind: trusted.client_kind,
          summary: `Added connection ${connectionId} (${providerType})`,
          audit_context: auditContext,
          ledger_kind: 'human_decision',
          ledger_decision: 'connection_added',
          evidence_refs: [`connect/connections/${connectionId}`],
        });

        return toSummary(this.getRawRowOrThrow(connectionId));
      });

      if (!wasInTx) {
        this.emitChanged({
          kind: 'connection_added',
          connection_id: summary.connection_id,
          security_revision: summary.security_revision,
          timestamp: now,
        });
      }
      return summary;
    } catch (error) {
      if (storedNewSecret) {
        await this.#vault.deleteSecret(credentialHandle).catch(() => false);
      }
      throw error;
    }
  }

  list(filter: {
    readonly provider_type?: string;
    readonly status?: ConnectionStatus;
    readonly include_deleted?: boolean;
  } = {}): ConnectionSummary[] {
    const conditions: string[] = [];
    const params: string[] = [];

    if (!filter.include_deleted && filter.status !== 'deleted') {
      conditions.push("status != 'deleted'");
    }
    if (filter.provider_type !== undefined) {
      conditions.push('provider_type = ?');
      params.push(filter.provider_type);
    }
    if (filter.status !== undefined) {
      conditions.push('status = ?');
      params.push(filter.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.#db
      .prepare(
        `SELECT connection_id, provider_type, display_name, account_label, credential_handle, endpoint, capabilities_json, security_revision, status, created_at, updated_at FROM connections ${where} ORDER BY created_at ASC, rowid ASC`,
      )
      .all(...params) as unknown as RawConnectionRow[];

    return rows.map((row) => toSummary(row));
  }

  get(connectionId: string): ConnectionSummary | null {
    const row = this.getRawRow(connectionId);
    return row ? toSummary(row) : null;
  }

  getRawRow(connectionId: string): RawConnectionRow | null {
    if (typeof connectionId !== 'string' || !connectionId.trim()) return null;
    const row = this.#db
      .prepare(
        'SELECT connection_id, provider_type, display_name, account_label, credential_handle, endpoint, capabilities_json, security_revision, status, created_at, updated_at FROM connections WHERE connection_id = ?',
      )
      .get(connectionId) as unknown as RawConnectionRow | undefined;
    return row ?? null;
  }

  getRawRowOrThrow(connectionId: string): RawConnectionRow {
    const row = this.getRawRow(connectionId);
    if (!row) {
      throw new ConnectError('CONNECTION_NOT_FOUND', `Connection '${connectionId}' not found.`);
    }
    return row;
  }

  async checkConnection(connectionId: string): Promise<ConnectionCheckResult> {
    const row = this.getRawRow(connectionId);
    if (!row) {
      throw new ConnectError('CONNECTION_NOT_FOUND', `Connection '${connectionId}' not found.`);
    }
    const credentialPresent = isVaultOwnedHandle(row.credential_handle)
      ? await this.#vault.hasSecret(row.credential_handle)
      : true;

    let providerHealthy = true;
    const provider = this.#getProvider?.(row.provider_type);
    if (provider?.healthCheck) {
      try {
        providerHealthy = await provider.healthCheck(toProviderRef(row));
      } catch {
        providerHealthy = false;
      }
    }

    const ok = row.status === 'active' && credentialPresent && providerHealthy;
    const reason = row.status !== 'active'
      ? `connection_${row.status}`
      : !credentialPresent
        ? 'credential_missing'
        : !providerHealthy
          ? 'provider_unhealthy'
          : null;

    return Object.freeze({
      ok,
      connection_id: row.connection_id,
      provider_type: row.provider_type,
      status: row.status,
      security_revision: row.security_revision,
      credential_present: credentialPresent,
      reason,
    });
  }

  async rotateCredential(
    clientContext: ClientContext,
    input: RotateCredentialInput,
    auditContext?: ConnectAuditContext,
  ): Promise<ConnectionSummary> {
    const trusted = requireTrustedHost(clientContext, 'connect.rotateCredential');
    const sanitizedProbe = { ...(input as unknown as Record<string, unknown>) };
    delete sanitizedProbe.secret;
    assertCredentialHandleOnlyPayload(sanitizedProbe);
    if (typeof input?.connection_id !== 'string' || !input.connection_id.trim()) {
      throw new ConnectError('INVALID_INPUT', 'connection_id is required.');
    }
    const existing = this.getRawRowOrThrow(input.connection_id);
    if (existing.status === 'deleted') {
      throw new ConnectError('CONNECTION_DELETED', `Connection '${existing.connection_id}' is deleted.`);
    }
    if (
      input.expected_security_revision !== undefined
      && existing.security_revision !== input.expected_security_revision
    ) {
      throw new ConnectError(
        'REVISION_CONFLICT',
        `Expected security_revision ${input.expected_security_revision}, got ${existing.security_revision}.`,
      );
    }

    const hasSecret = input.secret !== undefined;
    const hasHandle = input.credential_handle !== undefined;
    if (hasSecret === hasHandle) {
      throw new ConnectError(
        'INVALID_INPUT',
        'Provide exactly one of secret or credential_handle when rotating credential.',
      );
    }

    let createdVaultSecret = false;
    let newHandle: string;
    if (hasSecret) {
      if (typeof input.secret !== 'string' || input.secret.length === 0) {
        throw new ConnectError('INVALID_INPUT', 'secret must be a non-empty string.');
      }
      const meta = await this.#vault.putSecret({ namespace: existing.provider_type, secret: input.secret });
      newHandle = meta.handle;
      createdVaultSecret = true;
    } else {
      newHandle = normalizeCredentialHandle(input.credential_handle);
      if (isVaultOwnedHandle(newHandle)) {
        const exists = await this.#vault.hasSecret(newHandle);
        if (!exists) {
          throw new ConnectError('INVALID_CREDENTIAL_HANDLE', 'Referenced vault handle does not exist.');
        }
      }
    }

    const now = nowIso();
    const wasInTx = this.#db.isTransaction;
    try {
      const result = txImmediate(this.#db, () => {
        const current = this.getRawRowOrThrow(existing.connection_id);
        if (current.status === 'deleted') {
          throw new ConnectError('CONNECTION_DELETED', `Connection '${current.connection_id}' is deleted.`);
        }
        const expectedRev = input.expected_security_revision ?? current.security_revision;
        const updateRes = this.#db
          .prepare(
            "UPDATE connections SET credential_handle = ?, security_revision = security_revision + 1, status = 'active', updated_at = ? WHERE connection_id = ? AND security_revision = ?",
          )
          .run(newHandle, now, current.connection_id, expectedRev);
        if (updateRes.changes !== 1) {
          throw new ConnectError('REVISION_CONFLICT', 'Connection security_revision changed concurrently.');
        }

        this.#db
          .prepare(
            "UPDATE connection_grants SET status = 'superseded', updated_at = ? WHERE connection_id = ? AND status IN ('requested', 'granted')",
          )
          .run(now, current.connection_id);

        recordConnectAudit({
          db: this.#db,
          kind: 'credential_rotated',
          connection_id: current.connection_id,
          actor_kind: trusted.client_kind,
          summary: `Rotated credential for connection ${current.connection_id}`,
          audit_context: auditContext,
          ledger_kind: 'human_decision',
          ledger_decision: 'credential_rotated',
          evidence_refs: [`connect/connections/${current.connection_id}`],
        });

        return {
          oldHandle: current.credential_handle,
          summary: toSummary(this.getRawRowOrThrow(current.connection_id)),
        };
      });

      if (
        result.oldHandle !== newHandle
        && isVaultOwnedHandle(result.oldHandle)
      ) {
        await this.#vault.deleteSecret(result.oldHandle).catch(() => false);
      }

      if (!wasInTx) {
        this.emitChanged({
          kind: 'credential_rotated',
          connection_id: result.summary.connection_id,
          security_revision: result.summary.security_revision,
          timestamp: now,
        });
      }
      return result.summary;
    } catch (error) {
      if (createdVaultSecret) {
        await this.#vault.deleteSecret(newHandle).catch(() => false);
      }
      throw error;
    }
  }

  updateCapabilities(
    clientContext: ClientContext,
    input: UpdateCapabilitiesInput,
    auditContext?: ConnectAuditContext,
  ): ConnectionSummary {
    const trusted = requireTrustedHost(clientContext, 'connect.updateCapabilities');
    if (typeof input?.connection_id !== 'string' || !input.connection_id.trim()) {
      throw new ConnectError('INVALID_INPUT', 'connection_id is required.');
    }
    const nextCaps = normalizeCapabilities(input.capabilities);
    const now = nowIso();
    const wasInTx = this.#db.isTransaction;

    const summary = txImmediate(this.#db, () => {
      const current = this.getRawRowOrThrow(input.connection_id);
      if (current.status === 'deleted') {
        throw new ConnectError('CONNECTION_DELETED', `Connection '${current.connection_id}' is deleted.`);
      }
      if (
        input.expected_security_revision !== undefined
        && current.security_revision !== input.expected_security_revision
      ) {
        throw new ConnectError(
          'REVISION_CONFLICT',
          `Expected security_revision ${input.expected_security_revision}, got ${current.security_revision}.`,
        );
      }

      const prevCaps = parseCapabilitiesJson(current.capabilities_json);
      const shouldBump = input.bump_security_revision === true || capabilitiesChangedSecurity(prevCaps, nextCaps);

      if (shouldBump) {
        const res = this.#db
          .prepare(
            'UPDATE connections SET capabilities_json = ?, security_revision = security_revision + 1, updated_at = ? WHERE connection_id = ? AND security_revision = ?',
          )
          .run(JSON.stringify(nextCaps), now, current.connection_id, current.security_revision);
        if (res.changes !== 1) {
          throw new ConnectError('REVISION_CONFLICT', 'Connection security_revision changed concurrently.');
        }
        this.#db
          .prepare(
            "UPDATE connection_grants SET status = 'superseded', updated_at = ? WHERE connection_id = ? AND status IN ('requested', 'granted')",
          )
          .run(now, current.connection_id);
      } else {
        this.#db
          .prepare('UPDATE connections SET capabilities_json = ?, updated_at = ? WHERE connection_id = ?')
          .run(JSON.stringify(nextCaps), now, current.connection_id);
      }

      recordConnectAudit({
        db: this.#db,
        kind: 'connection_updated',
        connection_id: current.connection_id,
        actor_kind: trusted.client_kind,
        summary: `Updated capabilities for connection ${current.connection_id} (rev_bumped=${String(shouldBump)})`,
        audit_context: auditContext,
        ledger_kind: 'human_decision',
        ledger_decision: 'connection_capabilities_updated',
        evidence_refs: [`connect/connections/${current.connection_id}`],
      });

      return toSummary(this.getRawRowOrThrow(current.connection_id));
    });

    if (!wasInTx) {
      this.emitChanged({
        kind: 'connection_updated',
        connection_id: summary.connection_id,
        security_revision: summary.security_revision,
        timestamp: now,
      });
    }
    return summary;
  }

  setConnectionStatus(
    clientContext: ClientContext,
    input: { readonly connection_id: string; readonly status: 'active' | 'disabled' | 'expired' },
    auditContext?: ConnectAuditContext,
  ): ConnectionSummary {
    const trusted = requireTrustedHost(clientContext, 'connect.setConnectionStatus');
    if (typeof input?.connection_id !== 'string' || !input.connection_id.trim()) {
      throw new ConnectError('INVALID_INPUT', 'connection_id is required.');
    }
    if (!['active', 'disabled', 'expired'].includes(input.status)) {
      throw new ConnectError('INVALID_INPUT', `Unsupported connection status '${String(input.status)}'.`);
    }
    const now = nowIso();
    const wasInTx = this.#db.isTransaction;

    const summary = txImmediate(this.#db, () => {
      const current = this.getRawRowOrThrow(input.connection_id);
      if (current.status === 'deleted') {
        throw new ConnectError('CONNECTION_DELETED', `Connection '${current.connection_id}' is deleted.`);
      }
      const res = this.#db
        .prepare(
          'UPDATE connections SET status = ?, security_revision = security_revision + 1, updated_at = ? WHERE connection_id = ? AND security_revision = ?',
        )
        .run(input.status, now, current.connection_id, current.security_revision);
      if (res.changes !== 1) {
        throw new ConnectError('REVISION_CONFLICT', 'Connection security_revision changed concurrently.');
      }
      this.#db
        .prepare(
          "UPDATE connection_grants SET status = 'superseded', updated_at = ? WHERE connection_id = ? AND status IN ('requested', 'granted')",
        )
        .run(now, current.connection_id);

      recordConnectAudit({
        db: this.#db,
        kind: 'connection_updated',
        connection_id: current.connection_id,
        actor_kind: trusted.client_kind,
        summary: `Set connection ${current.connection_id} status=${input.status}`,
        audit_context: auditContext,
        ledger_kind: 'human_decision',
        ledger_decision: `connection_status_${input.status}`,
        evidence_refs: [`connect/connections/${current.connection_id}`],
      });

      return toSummary(this.getRawRowOrThrow(current.connection_id));
    });

    if (!wasInTx) {
      this.emitChanged({
        kind: 'connection_updated',
        connection_id: summary.connection_id,
        security_revision: summary.security_revision,
        timestamp: now,
      });
    }
    return summary;
  }

  async revokeConnection(
    clientContext: ClientContext,
    input: RevokeConnectionInput,
    auditContext?: ConnectAuditContext,
  ): Promise<ConnectionSummary> {
    const trusted = requireTrustedHost(clientContext, 'connect.revokeConnection');
    if (typeof input?.connection_id !== 'string' || !input.connection_id.trim()) {
      throw new ConnectError('INVALID_INPUT', 'connection_id is required.');
    }
    const now = nowIso();
    const wasInTx = this.#db.isTransaction;
    const nextStatus: ConnectionStatus = input.delete_permanently ? 'deleted' : 'disabled';

    const result = txImmediate(this.#db, () => {
      const current = this.getRawRowOrThrow(input.connection_id);
      if (current.status === 'deleted') {
        throw new ConnectError('CONNECTION_DELETED', `Connection '${current.connection_id}' is already deleted.`);
      }
      const res = this.#db
        .prepare(
          'UPDATE connections SET status = ?, security_revision = security_revision + 1, updated_at = ? WHERE connection_id = ? AND security_revision = ?',
        )
        .run(nextStatus, now, current.connection_id, current.security_revision);
      if (res.changes !== 1) {
        throw new ConnectError('REVISION_CONFLICT', 'Connection security_revision changed concurrently.');
      }

      this.#db
        .prepare(
          "UPDATE connection_grants SET status = 'revoked', revoked_at = ?, updated_at = ? WHERE connection_id = ? AND status IN ('requested', 'granted')",
        )
        .run(now, now, current.connection_id);

      recordConnectAudit({
        db: this.#db,
        kind: 'connection_revoked',
        connection_id: current.connection_id,
        actor_kind: trusted.client_kind,
        summary: input.reason?.trim()
          ? `Revoked connection ${current.connection_id}: ${input.reason.trim()}`
          : `Revoked connection ${current.connection_id} (status=${nextStatus})`,
        audit_context: auditContext,
        ledger_kind: 'human_decision',
        ledger_decision: nextStatus === 'deleted' ? 'connection_deleted' : 'connection_revoked',
        evidence_refs: [`connect/connections/${current.connection_id}`],
      });

      return {
        handle: current.credential_handle,
        summary: toSummary(this.getRawRowOrThrow(current.connection_id)),
      };
    });

    if ((input.purge_secret || input.delete_permanently) && isVaultOwnedHandle(result.handle)) {
      await this.#vault.deleteSecret(result.handle).catch(() => false);
    }

    if (!wasInTx) {
      this.emitChanged({
        kind: 'connection_revoked',
        connection_id: result.summary.connection_id,
        security_revision: result.summary.security_revision,
        timestamp: now,
      });
    }
    return result.summary;
  }

  private emitChanged(event: ConnectChangedEvent): void {
    this.#eventBus?.emit('event.connect.changed', event);
  }
}
