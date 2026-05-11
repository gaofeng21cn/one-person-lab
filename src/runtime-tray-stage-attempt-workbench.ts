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

type StageAttemptProjection = ReturnType<typeof attemptProjection>;

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

function hasEntries(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function attemptHasHumanGate(row: StageAttemptWorkbenchRow, humanGateRefs: string[], humanGateLedger: JsonRecord[]) {
  return row.status === 'human_gate' || humanGateRefs.length > 0 || humanGateLedger.length > 0;
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
  const humanGateLedger = signals.filter((signal) => signal.signal_kind === 'human_gate');
  const userInstructionLedger = signals.filter((signal) => signal.signal_kind === 'user_instruction');
  const resumeLedger = signals.filter((signal) => signal.signal_kind === 'resume');
  const domainReadyVerdict = optionalString(latestCloseout?.domain_ready_verdict)
    ?? optionalString(routeImpact.domain_ready_verdict);
  const consumedMemoryRefs = Array.isArray(latestCloseout?.consumed_memory_refs) ? latestCloseout.consumed_memory_refs : [];
  const writebackReceiptRefs = Array.isArray(latestCloseout?.writeback_receipt_refs) ? latestCloseout.writeback_receipt_refs : [];
  const rejectedWrites = Array.isArray(latestCloseout?.rejected_writes) ? latestCloseout.rejected_writes : [];
  const isHumanGate = attemptHasHumanGate(row, humanGateRefs, humanGateLedger);
  const isDeadLetter = row.status === 'dead_lettered';
  const isBlocked = Boolean(row.blocked_reason);
  const attentionFlags = [
    isHumanGate ? 'human_gate' : null,
    resumeLedger.length > 0 ? 'resume_available' : null,
    isDeadLetter ? 'dead_lettered' : null,
    isBlocked ? 'blocked' : null,
    rejectedWrites.length > 0 ? 'rejected_writes' : null,
  ].filter((flag): flag is string => Boolean(flag));

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
    consumed_memory_refs: consumedMemoryRefs,
    writeback_receipt_refs: writebackReceiptRefs,
    closeout_refs: closeoutRefs,
    closeout_receipt_status: row.closeout_receipt_status,
    rejected_writes: rejectedWrites,
    route_impact: routeImpact,
    next_owner: optionalString(latestCloseout?.next_owner) ?? optionalString(routeImpact.next_owner) ?? row.domain_id,
    human_gate_refs: humanGateRefs,
    human_gate_ledger: humanGateLedger,
    user_instruction_ledger: userInstructionLedger,
    resume_ledger: resumeLedger,
    user_instructions: userInstructionLedger,
    resume_signals: resumeLedger,
    dead_letter: row.status === 'dead_lettered'
      ? {
        reason: row.blocked_reason,
        task: null,
      }
      : null,
    completion_boundary: {
      provider_completion: row.status === 'completed' ? 'completed' : 'not_completed',
      domain_ready_verdict: domainReadyVerdict,
      provider_completion_is_domain_ready: false,
    },
    filter_keys: {
      domain_id: row.domain_id,
      stage_id: row.stage_id,
      status: row.status,
      provider_kind: row.provider_kind,
      attention: attentionFlags.length > 0,
      human_gate: isHumanGate,
      resume_available: resumeLedger.length > 0,
      dead_lettered: isDeadLetter,
      has_consumed_memory_refs: consumedMemoryRefs.length > 0,
      has_writeback_receipt_refs: writebackReceiptRefs.length > 0,
    },
    attention_flags: attentionFlags,
    authority_boundary: {
      opl: 'attempt_control_metadata_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
    updated_at: row.updated_at,
    created_at: row.created_at,
  };
}

function countBy<T>(entries: T[], keyFor: (entry: T) => string) {
  return entries.reduce<Record<string, number>>((counts, entry) => {
    const key = keyFor(entry);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function projectionHasHumanGate(attempt: StageAttemptProjection) {
  return Boolean((attempt.filter_keys as JsonRecord).human_gate);
}

function projectionHasResume(attempt: StageAttemptProjection) {
  return Boolean((attempt.filter_keys as JsonRecord).resume_available);
}

function projectionIsDeadLetter(attempt: StageAttemptProjection) {
  return Boolean((attempt.filter_keys as JsonRecord).dead_lettered);
}

function projectionHasAttention(attempt: StageAttemptProjection) {
  return Boolean((attempt.filter_keys as JsonRecord).attention);
}

function memoryRefCounters(attempts: StageAttemptProjection[]) {
  return attempts.reduce((counters, attempt) => {
    const consumedMemoryRefs = Array.isArray(attempt.consumed_memory_refs) ? attempt.consumed_memory_refs : [];
    const writebackReceiptRefs = Array.isArray(attempt.writeback_receipt_refs) ? attempt.writeback_receipt_refs : [];
    counters.consumed_memory_ref_count += consumedMemoryRefs.length;
    counters.writeback_receipt_ref_count += writebackReceiptRefs.length;
    if (consumedMemoryRefs.length > 0) {
      counters.attempts_with_consumed_memory_refs += 1;
    }
    if (writebackReceiptRefs.length > 0) {
      counters.attempts_with_writeback_receipt_refs += 1;
    }
    return counters;
  }, {
    consumed_memory_ref_count: 0,
    writeback_receipt_ref_count: 0,
    attempts_with_consumed_memory_refs: 0,
    attempts_with_writeback_receipt_refs: 0,
  });
}

function groupAttempts(attempts: StageAttemptProjection[], keyFor: (attempt: StageAttemptProjection) => string) {
  return attempts.reduce<Record<string, JsonRecord>>((groups, attempt) => {
    const key = keyFor(attempt);
    const group = groups[key] ?? {
      key,
      total: 0,
      attempt_ids: [],
      by_status: {},
      attention_count: 0,
      human_gate_count: 0,
      resume_count: 0,
      dead_letter_count: 0,
      memory_ref_counters: {
        consumed_memory_ref_count: 0,
        writeback_receipt_ref_count: 0,
        attempts_with_consumed_memory_refs: 0,
        attempts_with_writeback_receipt_refs: 0,
      },
    };
    const attemptIds = Array.isArray(group.attempt_ids) ? group.attempt_ids : [];
    const byStatus = group.by_status && typeof group.by_status === 'object' && !Array.isArray(group.by_status)
      ? group.by_status as Record<string, number>
      : {};
    const counters = group.memory_ref_counters as Record<string, number>;
    const consumedMemoryRefs = Array.isArray(attempt.consumed_memory_refs) ? attempt.consumed_memory_refs : [];
    const writebackReceiptRefs = Array.isArray(attempt.writeback_receipt_refs) ? attempt.writeback_receipt_refs : [];

    attemptIds.push(attempt.stage_attempt_id);
    byStatus[attempt.local_status] = (byStatus[attempt.local_status] ?? 0) + 1;
    counters.consumed_memory_ref_count += consumedMemoryRefs.length;
    counters.writeback_receipt_ref_count += writebackReceiptRefs.length;
    if (consumedMemoryRefs.length > 0) {
      counters.attempts_with_consumed_memory_refs += 1;
    }
    if (writebackReceiptRefs.length > 0) {
      counters.attempts_with_writeback_receipt_refs += 1;
    }

    groups[key] = {
      ...group,
      total: Number(group.total) + 1,
      attempt_ids: attemptIds,
      by_status: byStatus,
      attention_count: Number(group.attention_count) + (projectionHasAttention(attempt) ? 1 : 0),
      human_gate_count: Number(group.human_gate_count) + (projectionHasHumanGate(attempt) ? 1 : 0),
      resume_count: Number(group.resume_count) + (projectionHasResume(attempt) ? 1 : 0),
      dead_letter_count: Number(group.dead_letter_count) + (projectionIsDeadLetter(attempt) ? 1 : 0),
      memory_ref_counters: counters,
    };
    return groups;
  }, {});
}

function workbenchMetadata(attempts: StageAttemptProjection[]) {
  const attentionCounters = {
    total: attempts.filter(projectionHasAttention).length,
    human_gate_count: attempts.filter(projectionHasHumanGate).length,
    resume_count: attempts.filter(projectionHasResume).length,
    dead_letter_count: attempts.filter(projectionIsDeadLetter).length,
    rejected_writes_count: attempts.filter((attempt) => hasEntries(attempt.rejected_writes)).length,
  };
  const groups = {
    by_domain: groupAttempts(attempts, (attempt) => attempt.domain_id),
    by_stage: groupAttempts(attempts, (attempt) => attempt.stage_id),
    by_status: groupAttempts(attempts, (attempt) => attempt.local_status),
  };
  return {
    summary: {
      total: attempts.length,
      by_status: countBy(attempts, (attempt) => attempt.local_status),
      by_domain: countBy(attempts, (attempt) => attempt.domain_id),
      by_stage: countBy(attempts, (attempt) => attempt.stage_id),
      attention_count: attentionCounters.total,
      attention_counters: attentionCounters,
      memory_ref_counters: memoryRefCounters(attempts),
      human_gate_count: attentionCounters.human_gate_count,
      resume_count: attentionCounters.resume_count,
      dead_letter_count: attentionCounters.dead_letter_count,
    },
    groups,
    filter_metadata: {
      group_keys: ['domain_id', 'stage_id', 'status'],
      attention_flags: ['human_gate', 'resume_available', 'dead_lettered', 'blocked', 'rejected_writes'],
      memory_ref_flags: ['has_consumed_memory_refs', 'has_writeback_receipt_refs'],
    },
  };
}

const EMPTY_WORKBENCH_METADATA = {
  summary: {
    total: 0,
    by_status: {},
    by_domain: {},
    by_stage: {},
    attention_count: 0,
    attention_counters: {
      total: 0,
      human_gate_count: 0,
      resume_count: 0,
      dead_letter_count: 0,
      rejected_writes_count: 0,
    },
    memory_ref_counters: {
      consumed_memory_ref_count: 0,
      writeback_receipt_ref_count: 0,
      attempts_with_consumed_memory_refs: 0,
      attempts_with_writeback_receipt_refs: 0,
    },
    human_gate_count: 0,
    resume_count: 0,
    dead_letter_count: 0,
  },
  groups: {
    by_domain: {},
    by_stage: {},
    by_status: {},
  },
  filter_metadata: {
    group_keys: ['domain_id', 'stage_id', 'status'],
    attention_flags: ['human_gate', 'resume_available', 'dead_lettered', 'blocked', 'rejected_writes'],
    memory_ref_flags: ['has_consumed_memory_refs', 'has_writeback_receipt_refs'],
  },
};

export function buildStageAttemptWorkbench() {
  const paths = familyRuntimePaths();
  const queueDb = paths.queue_db;
  if (!fs.existsSync(queueDb)) {
    return {
      surface_kind: 'opl_stage_attempt_workbench',
      availability: 'missing_ledger',
      provider_completion_is_domain_ready: false,
      attempts: [],
      ...EMPTY_WORKBENCH_METADATA,
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
    const metadata = workbenchMetadata(attempts);
    return {
      surface_kind: 'opl_stage_attempt_workbench',
      availability: 'available',
      provider_completion_is_domain_ready: false,
      ...metadata,
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
      ...EMPTY_WORKBENCH_METADATA,
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
