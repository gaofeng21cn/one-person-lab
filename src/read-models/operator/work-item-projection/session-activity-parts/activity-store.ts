import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { isRecord } from '../../../../kernel/contract-validation.ts';
import { stringValue } from '../../../../kernel/json-record.ts';
import {
  ACTIVE_SESSION_MAX_TTL_MS,
  ACTIVE_SESSION_REF_LIMIT,
  ACTIVE_SESSION_TTL_MS,
  STALE_SESSION_GRACE_MS,
  TERMINAL_ACTIVITY_STATES,
} from './policy.ts';
import {
  activityKind,
  activityState,
  identityForItem,
  normalizedIdentity,
  optionalString,
  requiredString,
} from './identity-admission.ts';
import type {
  SessionActivityReadResult,
  WorkItemExecutionSessionBinding,
} from './types.ts';
import type { WorkItemProjectionDiagnostic, WorkItemProjectionItem } from '../types.ts';
import { resolveOplStatePaths } from '../../../../kernel/runtime-state-paths.ts';

export function normalizeBindingRow(value: unknown): WorkItemExecutionSessionBinding | null {
  if (!isRecord(value)) return null;
  try {
    const identity = normalizedIdentity({
      agent_id: value.agent_id as string,
      project_id: value.project_id as string,
      project_scope_id: value.project_scope_id as string,
      work_item_id: value.work_item_id as string,
      work_item_scope_id: value.work_item_scope_id as string,
      workspace_binding_id: value.workspace_binding_id as string,
      observed_generation: value.observed_generation as string,
      execution_session_ref: String(value.execution_session_ref ?? ''),
      activity_state: activityState(value.activity_state),
      observed_at: String(value.observed_at ?? ''),
      sequence: Number(value.sequence),
    });
    const kind = activityKind(value.activity_kind);
    const state = activityState(value.activity_state);
    const observedAt = requiredString(value.observed_at, 'observed_at');
    const expiresAt = requiredString(value.expires_at, 'expires_at');
    const observedTime = Date.parse(observedAt);
    const expiresTime = Date.parse(expiresAt);
    const ttlMs = Number(value.ttl_ms);
    const sequence = Number(value.sequence);
    if (
      !Number.isFinite(observedTime)
      || !Number.isFinite(expiresTime)
      || !Number.isSafeInteger(ttlMs)
      || ttlMs <= 0
      || ttlMs > ACTIVE_SESSION_MAX_TTL_MS
      || !Number.isSafeInteger(sequence)
      || sequence < 0
      || (!TERMINAL_ACTIVITY_STATES.has(state) && expiresTime - observedTime !== ttlMs)
      || (TERMINAL_ACTIVITY_STATES.has(state) && expiresTime !== observedTime)
    )
      return null;
    return {
      binding_id: requiredString(value.binding_id, 'binding_id'),
      execution_session_ref: requiredString(value.execution_session_ref, 'execution_session_ref'),
      identity,
      activity_kind: kind,
      activity_state: state,
      stage_attempt_id: null,
      workflow_id: null,
      observed_at: observedAt,
      ttl_ms: ttlMs,
      expires_at: expiresAt,
      sequence,
      source_ref: optionalString(value.source_ref),
      recorded_at: requiredString(value.recorded_at, 'recorded_at'),
    };
  } catch {
    return null;
  }
}

export function ledgerPath() {
  const paths = resolveOplStatePaths() as ReturnType<typeof resolveOplStatePaths> & {
    work_item_execution_session_db?: string;
  };
  return (
    paths.work_item_execution_session_db
    ?? path.join(paths.state_dir, 'work-item-execution-session-bindings.sqlite')
  );
}

const BINDING_SELECT_COLUMNS = `
  execution_session_ref, binding_id,
  agent_id, project_id, project_scope_id, work_item_id, work_item_scope_id,
  workspace_binding_id, observed_generation,
  activity_kind, activity_state,
  observed_at, ttl_ms, expires_at, sequence, source_ref, recorded_at
`;

export function readWorkItemExecutionSessionBindings(
  options: {
    items?: WorkItemProjectionItem[];
    executionSessionRef?: string;
    now?: () => number;
  } = {},
): SessionActivityReadResult {
  const sourceRef = ledgerPath();
  if (!fs.existsSync(sourceRef)) {
    return {
      bindings: [] as WorkItemExecutionSessionBinding[],
      source_ref: sourceRef,
      diagnostics: [] as WorkItemProjectionDiagnostic[],
    };
  }
  const db = new DatabaseSync(sourceRef, { readOnly: true });
  try {
    const table = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'work_item_execution_session_bindings'",
      )
      .get();
    if (!table) {
      return {
        bindings: [] as WorkItemExecutionSessionBinding[],
        source_ref: sourceRef,
        diagnostics: [] as WorkItemProjectionDiagnostic[],
      };
    }
    const rows: Array<Record<string, unknown>> = [];
    if (options.executionSessionRef) {
      const row = db
        .prepare(`
        SELECT ${BINDING_SELECT_COLUMNS}
        FROM work_item_execution_session_bindings
        WHERE execution_session_ref = ?
          AND activity_kind = 'coordination'
      `)
        .get(options.executionSessionRef) as Record<string, unknown> | undefined;
      if (row) rows.push(row);
    } else if (options.items && options.items.length > 0) {
      const cutoff = new Date(
        (options.now ?? Date.now)() - ACTIVE_SESSION_MAX_TTL_MS,
      ).toISOString();
      const readNonterminalForItem = db.prepare(`
        SELECT ${BINDING_SELECT_COLUMNS}
        FROM work_item_execution_session_bindings
        WHERE agent_id = ?
          AND project_id = ?
          AND project_scope_id = ?
          AND work_item_id = ?
          AND work_item_scope_id = ?
          AND workspace_binding_id = ?
          AND observed_generation = ?
          AND observed_at >= ?
          AND activity_kind = 'coordination'
          AND activity_state NOT IN ('completed', 'failed', 'cancelled')
        ORDER BY observed_at DESC, execution_session_ref ASC
        LIMIT ?
      `);
      const readLatestForItem = db.prepare(`
        SELECT ${BINDING_SELECT_COLUMNS}
        FROM work_item_execution_session_bindings
        WHERE agent_id = ?
          AND project_id = ?
          AND project_scope_id = ?
          AND work_item_id = ?
          AND work_item_scope_id = ?
          AND workspace_binding_id = ?
          AND observed_generation = ?
          AND observed_at >= ?
          AND activity_kind = 'coordination'
        ORDER BY observed_at DESC, execution_session_ref ASC
        LIMIT 1
      `);
      const seen = new Set<string>();
      for (const item of options.items) {
        const identity = identityForItem(item);
        const parameters = [
          identity.agent_id,
          identity.project_id,
          identity.project_scope_id,
          identity.work_item_id,
          identity.work_item_scope_id,
          identity.workspace_binding_id,
          identity.observed_generation,
          cutoff,
        ] as const;
        const itemRows = [
          ...readNonterminalForItem.all(...parameters, ACTIVE_SESSION_REF_LIMIT),
          ...readLatestForItem.all(...parameters),
        ] as Array<Record<string, unknown>>;
        for (const row of itemRows) {
          const ref = typeof row.execution_session_ref === 'string' ? row.execution_session_ref : '';
          if (!ref || seen.has(ref)) continue;
          seen.add(ref);
          rows.push(row);
        }
      }
    }
    const bindings = rows
      .map(normalizeBindingRow)
      .filter((binding): binding is WorkItemExecutionSessionBinding => Boolean(binding));
    return {
      bindings,
      source_ref: sourceRef,
      diagnostics: [] as WorkItemProjectionDiagnostic[],
    };
  } catch (error) {
    return {
      bindings: [] as WorkItemExecutionSessionBinding[],
      source_ref: sourceRef,
      diagnostics: [
        {
          reason: 'work_item_execution_session_binding_ledger_invalid',
          ref: sourceRef,
          details: { error: error instanceof Error ? error.message : String(error) },
        },
      ] as WorkItemProjectionDiagnostic[],
    };
  } finally {
    db.close();
  }
}

export function createBindingTable(db: DatabaseSync) {
  db.exec('PRAGMA busy_timeout = 5000;');
  const journalMode = db.prepare('PRAGMA journal_mode').get() as
    | { journal_mode?: unknown }
    | undefined;
  if (stringValue(journalMode?.journal_mode)?.toLowerCase() !== 'wal') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_item_execution_session_bindings (
      execution_session_ref TEXT PRIMARY KEY,
      binding_id TEXT NOT NULL UNIQUE,
      agent_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      project_scope_id TEXT NOT NULL,
      work_item_id TEXT NOT NULL,
      work_item_scope_id TEXT NOT NULL,
      workspace_binding_id TEXT NOT NULL,
      observed_generation TEXT NOT NULL,
      activity_kind TEXT NOT NULL CHECK(activity_kind = 'coordination'),
      activity_state TEXT NOT NULL CHECK(activity_state IN ('running', 'waiting', 'completed', 'failed', 'cancelled')),
      observed_at TEXT NOT NULL,
      ttl_ms INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      sequence INTEGER NOT NULL CHECK(sequence >= 0),
      source_ref TEXT,
      recorded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_work_item_execution_session_identity
      ON work_item_execution_session_bindings(
        agent_id, project_id, work_item_id, observed_generation, expires_at
      );
    CREATE TABLE IF NOT EXISTS work_item_execution_session_events (
      receipt_ref TEXT PRIMARY KEY,
      execution_session_ref TEXT NOT NULL,
      binding_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      project_scope_id TEXT NOT NULL,
      work_item_id TEXT NOT NULL,
      work_item_scope_id TEXT NOT NULL,
      workspace_binding_id TEXT NOT NULL,
      observed_generation TEXT NOT NULL,
      activity_kind TEXT NOT NULL CHECK(activity_kind = 'coordination'),
      activity_state TEXT NOT NULL CHECK(activity_state IN ('running', 'waiting', 'completed', 'failed', 'cancelled')),
      observed_at TEXT NOT NULL,
      ttl_ms INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      sequence INTEGER NOT NULL CHECK(sequence >= 0),
      source_ref TEXT,
      recorded_at TEXT NOT NULL,
      UNIQUE(execution_session_ref, sequence)
    );
    CREATE INDEX IF NOT EXISTS idx_work_item_execution_session_events_identity
      ON work_item_execution_session_events(
        agent_id, project_id, work_item_id, observed_generation, recorded_at
      );
  `);
}

function bindingRow(binding: WorkItemExecutionSessionBinding) {
  const { identity, stage_attempt_id: _stageAttemptId, workflow_id: _workflowId, ...row } = binding;
  return {
    ...row,
    ...identity,
  };
}

export function readBinding(db: DatabaseSync, executionSessionRef: string) {
  return normalizeBindingRow(
    db
      .prepare(`
    SELECT * FROM work_item_execution_session_bindings WHERE execution_session_ref = ?
  `)
      .get(executionSessionRef),
  );
}

export function persistBinding(db: DatabaseSync, binding: WorkItemExecutionSessionBinding) {
  db.prepare(`
    INSERT INTO work_item_execution_session_bindings (
      execution_session_ref, binding_id,
      agent_id, project_id, project_scope_id, work_item_id, work_item_scope_id,
      workspace_binding_id, observed_generation,
      activity_kind, activity_state,
      observed_at, ttl_ms, expires_at, sequence, source_ref, recorded_at
    ) VALUES (
      @execution_session_ref, @binding_id,
      @agent_id, @project_id, @project_scope_id, @work_item_id, @work_item_scope_id,
      @workspace_binding_id, @observed_generation,
      @activity_kind, @activity_state,
      @observed_at, @ttl_ms, @expires_at, @sequence, @source_ref, @recorded_at
    )
    ON CONFLICT(execution_session_ref) DO UPDATE SET
      observed_generation = CASE
        WHEN excluded.activity_state IN ('completed', 'failed', 'cancelled')
          THEN excluded.observed_generation
        ELSE work_item_execution_session_bindings.observed_generation
      END,
      activity_state = excluded.activity_state,
      observed_at = excluded.observed_at,
      ttl_ms = excluded.ttl_ms,
      expires_at = excluded.expires_at,
      sequence = excluded.sequence,
      source_ref = excluded.source_ref,
      recorded_at = excluded.recorded_at
    WHERE excluded.sequence > work_item_execution_session_bindings.sequence
  `).run(bindingRow(binding));
}

export function receiptRef(binding: WorkItemExecutionSessionBinding) {
  return `${binding.binding_id}#sequence=${binding.sequence}`;
}

export function persistBindingEvent(db: DatabaseSync, binding: WorkItemExecutionSessionBinding) {
  db.prepare(`
    INSERT INTO work_item_execution_session_events (
      receipt_ref, execution_session_ref, binding_id,
      agent_id, project_id, project_scope_id, work_item_id, work_item_scope_id,
      workspace_binding_id, observed_generation,
      activity_kind, activity_state,
      observed_at, ttl_ms, expires_at, sequence, source_ref, recorded_at
    ) VALUES (
      @receipt_ref, @execution_session_ref, @binding_id,
      @agent_id, @project_id, @project_scope_id, @work_item_id, @work_item_scope_id,
      @workspace_binding_id, @observed_generation,
      @activity_kind, @activity_state,
      @observed_at, @ttl_ms, @expires_at, @sequence, @source_ref, @recorded_at
    )
  `).run({ ...bindingRow(binding), receipt_ref: receiptRef(binding) });
}

export function bindingId(executionSessionRef: string) {
  const digest = createHash('sha256').update(executionSessionRef, 'utf8').digest('hex');
  return `opl://work-item-execution-session/${digest}`;
}

export function buildReceipt(
  binding: WorkItemExecutionSessionBinding,
  status: 'dry_run' | 'applied' | 'unchanged',
) {
  return {
    surface_kind: 'opl_work_item_execution_session_binding_receipt',
    schema_version: 'work-item-execution-session-binding-receipt.v1',
    status,
    action_id: 'work_item_execution_session_observe',
    receipt_ref: receiptRef(binding),
    binding,
    ledger: {
      source_ref: ledgerPath(),
      current_binding_table: 'work_item_execution_session_bindings',
      append_only_event_table: 'work_item_execution_session_events',
      append_only_receipt_persisted: status !== 'dry_run',
    },
    authority_boundary: {
      projection_only: true,
      coordination_is_execution_proof: false,
      can_write_stage_attempt: false,
      can_change_work_item_lifecycle: false,
      can_clear_human_gate: false,
      can_write_domain_truth: false,
    },
    producer_contract: {
      producer_owners: ['explicit_caller', 'temporal_stage_activity'],
      automatic_temporal_stage_activity_producer_included: true,
      automatic_shell_watcher_included: false,
      activity_kind: 'coordination',
      controlled_execution_source: 'exact_stage_attempt_binding_plus_fresh_runtime_observation',
      events: ['turn_start', 'heartbeat', 'terminal'],
      recommended_heartbeat_cadence_ms: 60_000,
      heartbeat_cadence_must_be_less_than_ttl: true,
      active_ttl_ms: ACTIVE_SESSION_TTL_MS,
      stale_grace_ms: STALE_SESSION_GRACE_MS,
      max_readback_refs_per_work_item: ACTIVE_SESSION_REF_LIMIT,
      terminal_close_requires_existing_binding: true,
      terminal_close_allows_observed_generation_drift_only: true,
      stable_command: 'opl app action execute --action work_item_execution_session_observe --payload <json> --json',
    },
  } as const;
}
