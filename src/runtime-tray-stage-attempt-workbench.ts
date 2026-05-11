import * as fs from 'fs';
import { DatabaseSync } from 'node:sqlite';

import { familyRuntimePaths } from './family-runtime-store.ts';
import { fileSourceRef, optionalString } from './runtime-tray-snapshot-utils.ts';
import type { JsonRecord, RuntimeTraySourceRef } from './runtime-tray-snapshot-types.ts';

type StageAttemptWorkbenchRow = {
  stage_attempt_id: string;
  provider_kind: string;
  workflow_id: string;
  domain_id: string;
  stage_id: string;
  status: string;
  checkpoint_refs_json: string;
  closeout_refs_json: string;
  human_gate_refs_json: string;
  blocked_reason: string | null;
  provider_run_json: string;
  activity_events_json: string;
  route_impact_json: string;
  closeout_receipt_status: string | null;
  updated_at: string;
  created_at: string;
};

type StageAttemptCloseoutRow = {
  stage_attempt_id: string;
  packet_json: string;
  created_at: string;
};

type StageAttemptSignalRow = {
  stage_attempt_id: string;
  signal_kind: string;
  payload_json: string;
  source: string;
  created_at: string;
};

function parseRecord(value: string): JsonRecord {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : {};
  } catch {
    return {};
  }
}

function parseList(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stringList(value: unknown[]) {
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function recordList(value: unknown[]) {
  return value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry));
}

function latestActivity(events: JsonRecord[]) {
  return events.at(-1) ?? null;
}

function sourceRefs(queueDb: string): RuntimeTraySourceRef[] {
  return [
    fileSourceRef(`${queueDb}#stage_attempts`, 'stage_attempt_ledger', 'OPL stage attempt ledger'),
    fileSourceRef(`${queueDb}#stage_attempt_closeouts`, 'stage_attempt_closeout_ledger', 'OPL stage closeout ledger'),
  ];
}

function closeoutByAttempt(db: DatabaseSync, attemptIds: string[]) {
  if (attemptIds.length === 0) {
    return new Map<string, JsonRecord>();
  }
  const rows = db.prepare(`
    SELECT stage_attempt_id, packet_json, created_at
    FROM stage_attempt_closeouts
    WHERE stage_attempt_id IN (${attemptIds.map(() => '?').join(',')})
    ORDER BY stage_attempt_id ASC, created_at ASC
  `).all(...attemptIds) as StageAttemptCloseoutRow[];
  const byAttempt = new Map<string, JsonRecord>();
  for (const row of rows) {
    byAttempt.set(row.stage_attempt_id, parseRecord(row.packet_json));
  }
  return byAttempt;
}

function signalsByAttempt(db: DatabaseSync, attemptIds: string[]) {
  const byAttempt = new Map<string, JsonRecord[]>();
  if (attemptIds.length === 0) {
    return byAttempt;
  }
  const rows = db.prepare(`
    SELECT stage_attempt_id, signal_kind, payload_json, source, created_at
    FROM stage_attempt_signals
    WHERE stage_attempt_id IN (${attemptIds.map(() => '?').join(',')})
    ORDER BY stage_attempt_id ASC, created_at ASC
  `).all(...attemptIds) as StageAttemptSignalRow[];
  for (const row of rows) {
    const signals = byAttempt.get(row.stage_attempt_id) ?? [];
    signals.push({
      signal_kind: row.signal_kind,
      payload: parseRecord(row.payload_json),
      source: row.source,
      created_at: row.created_at,
    });
    byAttempt.set(row.stage_attempt_id, signals);
  }
  return byAttempt;
}

function attemptProjection(row: StageAttemptWorkbenchRow, latestCloseout: JsonRecord | null, signals: JsonRecord[]) {
  const providerRun = parseRecord(row.provider_run_json);
  const activityEvents = recordList(parseList(row.activity_events_json));
  const routeImpact = parseRecord(row.route_impact_json);
  const activity = latestActivity(activityEvents);
  const checkpointRefs = stringList(parseList(row.checkpoint_refs_json));
  const closeoutRefs = stringList(parseList(row.closeout_refs_json));
  const humanGateRefs = stringList(parseList(row.human_gate_refs_json));
  const domainReadyVerdict = optionalString(latestCloseout?.domain_ready_verdict)
    ?? optionalString(routeImpact.domain_ready_verdict);

  return {
    stage_attempt_id: row.stage_attempt_id,
    provider_kind: row.provider_kind,
    domain_id: row.domain_id,
    stage_id: row.stage_id,
    workflow_id: row.workflow_id,
    workflow_status: optionalString(providerRun.provider_status) ?? row.status,
    activity_status: optionalString(activity?.activity_status),
    activity_kind: optionalString(activity?.activity_kind),
    local_status: row.status,
    heartbeat: {
      last_updated_at: row.updated_at,
      last_heartbeat_at: optionalString(providerRun.last_heartbeat_at),
      checkpoint_refs: checkpointRefs,
    },
    checkpoint_refs: checkpointRefs,
    consumed_refs: Array.isArray(latestCloseout?.consumed_refs) ? latestCloseout.consumed_refs : [],
    consumed_memory_refs: Array.isArray(latestCloseout?.consumed_memory_refs) ? latestCloseout.consumed_memory_refs : [],
    writeback_receipt_refs: Array.isArray(latestCloseout?.writeback_receipt_refs) ? latestCloseout.writeback_receipt_refs : [],
    closeout_refs: closeoutRefs,
    closeout_receipt_status: row.closeout_receipt_status,
    rejected_writes: Array.isArray(latestCloseout?.rejected_writes) ? latestCloseout.rejected_writes : [],
    route_impact: routeImpact,
    next_owner: optionalString(latestCloseout?.next_owner) ?? optionalString(routeImpact.next_owner) ?? row.domain_id,
    human_gate_refs: humanGateRefs,
    user_instructions: signals.filter((signal) => signal.signal_kind === 'user_instruction'),
    resume_signals: signals.filter((signal) => signal.signal_kind === 'resume'),
    dead_letter: row.status === 'dead_lettered' ? row.blocked_reason : null,
    completion_boundary: {
      provider_completion: row.status === 'completed' ? 'completed' : 'not_completed',
      domain_ready_verdict: domainReadyVerdict,
      provider_completion_is_domain_ready: false,
    },
    authority_boundary: {
      opl: 'attempt_control_metadata_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
    updated_at: row.updated_at,
    created_at: row.created_at,
  };
}

function statusCounts(rows: StageAttemptWorkbenchRow[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});
}

export function buildStageAttemptWorkbench() {
  const paths = familyRuntimePaths();
  const queueDb = paths.queue_db;
  if (!fs.existsSync(queueDb)) {
    return {
      surface_kind: 'opl_stage_attempt_workbench',
      availability: 'missing_ledger',
      provider_completion_is_domain_ready: false,
      attempts: [],
      summary: {
        total: 0,
        by_status: {},
        human_gate_count: 0,
        dead_letter_count: 0,
      },
      source_refs: sourceRefs(queueDb),
      authority_boundary: {
        opl: 'attempt_control_metadata_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
  }

  const db = new DatabaseSync(queueDb, { readOnly: true });
  try {
    const rows = db.prepare(`
      SELECT stage_attempt_id, provider_kind, workflow_id, domain_id, stage_id, status,
        checkpoint_refs_json, closeout_refs_json, human_gate_refs_json, blocked_reason,
        provider_run_json, activity_events_json, route_impact_json, closeout_receipt_status,
        updated_at, created_at
      FROM stage_attempts
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 25
    `).all() as StageAttemptWorkbenchRow[];
    const latestCloseouts = closeoutByAttempt(db, rows.map((row) => row.stage_attempt_id));
    const signals = signalsByAttempt(db, rows.map((row) => row.stage_attempt_id));
    const attempts = rows.map((row) => attemptProjection(
      row,
      latestCloseouts.get(row.stage_attempt_id) ?? null,
      signals.get(row.stage_attempt_id) ?? [],
    ));
    return {
      surface_kind: 'opl_stage_attempt_workbench',
      availability: 'available',
      provider_completion_is_domain_ready: false,
      summary: {
        total: rows.length,
        by_status: statusCounts(rows),
        human_gate_count: rows.filter((row) => row.status === 'human_gate').length,
        dead_letter_count: rows.filter((row) => row.status === 'dead_lettered').length,
      },
      attempts,
      source_refs: sourceRefs(queueDb),
      authority_boundary: {
        opl: 'attempt_control_metadata_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
  } catch {
    return {
      surface_kind: 'opl_stage_attempt_workbench',
      availability: 'unavailable',
      provider_completion_is_domain_ready: false,
      attempts: [],
      summary: {
        total: 0,
        by_status: {},
        human_gate_count: 0,
        dead_letter_count: 0,
      },
      source_refs: sourceRefs(queueDb),
      authority_boundary: {
        opl: 'attempt_control_metadata_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
  } finally {
    db.close();
  }
}
