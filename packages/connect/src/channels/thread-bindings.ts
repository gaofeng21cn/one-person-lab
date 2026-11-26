import crypto from 'node:crypto';

import { newId, nowIso, txImmediate, type SqliteDb } from '@opl/core';

import {
  ChannelError,
  type ChannelConversationIdentity,
  type ChannelThreadBinding,
  type ChannelThreadRef,
} from './types.ts';

export interface ChannelPersistedThreadBinding extends ChannelThreadBinding {
  readonly binding_id: string;
  readonly workspace_id: string | null;
  readonly last_task_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly last_resumed_at: string | null;
}

interface RawChannelBindingRow {
  readonly binding_id: string;
  readonly provider_id: string;
  readonly account_id: string;
  readonly channel_session_id: string;
  readonly canonical_thread_host: string;
  readonly canonical_thread_id: string;
  readonly workspace_id: string | null;
  readonly last_task_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly last_resumed_at: string | null;
}

function assertExactChannelString(value: unknown, field: string): string {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
    || value !== value.trim()
    || value.length > 512
    || value.includes('\0')
  ) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', `Channel thread binding requires exact ${field}.`);
  }
  return value;
}

function computeBindingId(identity: ChannelConversationIdentity): string {
  const key = JSON.stringify([identity.provider_id, identity.account_id, identity.channel_session_id]);
  return `binding-${crypto.createHash('sha256').update(key).digest('hex')}`;
}

function toPersistedBinding(row: RawChannelBindingRow): ChannelPersistedThreadBinding {
  return Object.freeze({
    binding_id: row.binding_id,
    provider_id: row.provider_id,
    account_id: row.account_id,
    channel_session_id: row.channel_session_id,
    canonical_thread_host: row.canonical_thread_host,
    canonical_thread_id: row.canonical_thread_id,
    workspace_id: row.workspace_id,
    last_task_id: row.last_task_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_resumed_at: row.last_resumed_at,
  });
}

export class SqliteChannelThreadBindingStore {
  readonly #db: SqliteDb;
  readonly #threadHost: string;

  constructor(db: SqliteDb, options: { readonly threadHost?: string } = {}) {
    this.#db = db;
    this.#threadHost = assertExactChannelString(options.threadHost ?? 'opld', 'threadHost');
  }

  startThread(identity: ChannelConversationIdentity): ChannelThreadRef {
    const providerId = assertExactChannelString(identity?.provider_id, 'provider_id');
    const accountId = assertExactChannelString(identity?.account_id, 'account_id');
    const sessionId = assertExactChannelString(identity?.channel_session_id, 'channel_session_id');
    const ts = nowIso();

    return txImmediate(this.#db, () => {
      const existing = this.#db
        .prepare(
          'SELECT binding_id, canonical_thread_host, canonical_thread_id FROM channel_thread_bindings WHERE provider_id = ? AND account_id = ? AND channel_session_id = ?',
        )
        .get(providerId, accountId, sessionId) as
        | { binding_id: string; canonical_thread_host: string; canonical_thread_id: string }
        | undefined;

      if (existing) {
        this.#db
          .prepare('UPDATE channel_thread_bindings SET updated_at = ? WHERE binding_id = ?')
          .run(ts, existing.binding_id);
        return {
          canonical_thread_host: existing.canonical_thread_host,
          canonical_thread_id: existing.canonical_thread_id,
        };
      }

      const bindingId = computeBindingId({
        provider_id: providerId,
        account_id: accountId,
        channel_session_id: sessionId,
      });
      const threadId = newId('thread');
      this.#db
        .prepare(
          'INSERT INTO channel_thread_bindings (binding_id, provider_id, account_id, channel_session_id, canonical_thread_host, canonical_thread_id, workspace_id, last_task_id, created_at, updated_at, last_resumed_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL)',
        )
        .run(bindingId, providerId, accountId, sessionId, this.#threadHost, threadId, ts, ts);

      return {
        canonical_thread_host: this.#threadHost,
        canonical_thread_id: threadId,
      };
    });
  }

  resumeThread(ref: ChannelThreadRef): ChannelPersistedThreadBinding {
    const host = assertExactChannelString(ref?.canonical_thread_host, 'canonical_thread_host');
    const threadId = assertExactChannelString(ref?.canonical_thread_id, 'canonical_thread_id');
    const ts = nowIso();

    return txImmediate(this.#db, () => {
      const row = this.#db
        .prepare(
          'SELECT binding_id, provider_id, account_id, channel_session_id, canonical_thread_host, canonical_thread_id, workspace_id, last_task_id, created_at, updated_at, last_resumed_at FROM channel_thread_bindings WHERE canonical_thread_host = ? AND canonical_thread_id = ?',
        )
        .get(host, threadId) as RawChannelBindingRow | undefined;

      if (!row) {
        throw new ChannelError(
          'CHANNEL_IDENTITY_MISMATCH',
          `Channel thread binding not found: ${host}:${threadId}`,
        );
      }

      this.#db
        .prepare('UPDATE channel_thread_bindings SET last_resumed_at = ?, updated_at = ? WHERE binding_id = ?')
        .run(ts, ts, row.binding_id);

      return toPersistedBinding({
        ...row,
        updated_at: ts,
        last_resumed_at: ts,
      });
    });
  }

  getBindingByThread(ref: ChannelThreadRef): ChannelPersistedThreadBinding | null {
    const host = assertExactChannelString(ref?.canonical_thread_host, 'canonical_thread_host');
    const threadId = assertExactChannelString(ref?.canonical_thread_id, 'canonical_thread_id');
    const row = this.#db
      .prepare(
        'SELECT binding_id, provider_id, account_id, channel_session_id, canonical_thread_host, canonical_thread_id, workspace_id, last_task_id, created_at, updated_at, last_resumed_at FROM channel_thread_bindings WHERE canonical_thread_host = ? AND canonical_thread_id = ?',
      )
      .get(host, threadId) as RawChannelBindingRow | undefined;
    return row ? toPersistedBinding(row) : null;
  }

  recordTurnDispatch(input: {
    readonly binding_id: string;
    readonly workspace_id: string;
    readonly last_task_id: string;
  }): void {
    const bindingId = assertExactChannelString(input?.binding_id, 'binding_id');
    const workspaceId = assertExactChannelString(input?.workspace_id, 'workspace_id');
    const lastTaskId = assertExactChannelString(input?.last_task_id, 'last_task_id');
    const ts = nowIso();
    txImmediate(this.#db, () => {
      const res = this.#db
        .prepare(
          'UPDATE channel_thread_bindings SET workspace_id = COALESCE(workspace_id, ?), last_task_id = ?, updated_at = ? WHERE binding_id = ?',
        )
        .run(workspaceId, lastTaskId, ts, bindingId);
      if (Number(res.changes) !== 1) {
        throw new ChannelError(
          'CHANNEL_IDENTITY_MISMATCH',
          `Channel thread binding '${bindingId}' not found for turn dispatch.`,
        );
      }
    });
  }

  listBindings(): ChannelThreadBinding[] {
    const rows = this.#db
      .prepare(
        'SELECT provider_id, account_id, channel_session_id, canonical_thread_host, canonical_thread_id FROM channel_thread_bindings ORDER BY created_at ASC, rowid ASC',
      )
      .all() as unknown as ChannelThreadBinding[];
    return rows.map((r) => ({
      provider_id: r.provider_id,
      account_id: r.account_id,
      channel_session_id: r.channel_session_id,
      canonical_thread_host: r.canonical_thread_host,
      canonical_thread_id: r.canonical_thread_id,
    }));
  }
}
