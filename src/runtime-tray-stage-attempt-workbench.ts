import * as fs from 'fs';
import { DatabaseSync } from 'node:sqlite';

import { buildFamilyRuntimeControlledApplyContract } from './family-runtime-controlled-apply.ts';
import { buildFamilyRuntimeLifecyclePrimitives } from './family-runtime-lifecycle.ts';
import {
  inspectFamilyRuntimeProviderWithLifecycle,
  isFamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';
import { familyRuntimePaths } from './family-runtime-store.ts';
import {
  latestStageAttemptCloseoutPacketsByAttempt,
  listStageAttemptRows,
  stageAttemptSignalsByAttempt,
} from './family-runtime-stage-attempt-ledger.ts';
import type { FamilyRuntimeDomainId, FamilyRuntimeProviderKind } from './family-runtime-types.ts';
import {
  buildAttemptGenericProjections,
  buildWorkbenchGenericProjections,
} from './runtime-tray-stage-attempt-generic-projections.ts';
import { fileSourceRef, optionalString } from './runtime-tray-snapshot-utils.ts';
import type { JsonRecord, RuntimeTraySourceRef } from './runtime-tray-snapshot-types.ts';

type ProviderReadinessOptions = {
  managedProviderProjection?: {
    managed_temporal_state_consistency?: Record<string, unknown> | null;
  } | null;
};

type StageAttemptWorkbenchRow = ReturnType<typeof listStageAttemptRows>[number] & {
  domain_id: FamilyRuntimeDomainId;
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

function providerKindForRow(row: StageAttemptWorkbenchRow): FamilyRuntimeProviderKind | null {
  return isFamilyRuntimeProviderKind(row.provider_kind) ? row.provider_kind : null;
}

function currentProviderReadinessProjection(
  providerKind: FamilyRuntimeProviderKind | null,
  provider: Awaited<ReturnType<typeof inspectFamilyRuntimeProviderWithLifecycle>> | null,
) {
  if (!providerKind || !provider) {
    return null;
  }
  return {
    surface_kind: 'stage_attempt_current_provider_readiness',
    provider_kind: providerKind,
    provider_ready: provider.ready,
    status: provider.status,
    degraded_reason: provider.degraded_reason,
    capabilities: provider.capabilities,
    details: provider.details,
    provider_receipt_is_creation_time_snapshot: true,
    authority_boundary: {
      opl: 'current_provider_lifecycle_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

async function currentProviderReadinessByKind(
  rows: StageAttemptWorkbenchRow[],
  paths: Pick<ReturnType<typeof familyRuntimePaths>, 'root'>,
  options: ProviderReadinessOptions,
) {
  const providerKinds = [...new Set(rows.map(providerKindForRow).filter((kind): kind is FamilyRuntimeProviderKind => Boolean(kind)))];
  const entries = await Promise.all(providerKinds.map(async (providerKind) => [
    providerKind,
    await inspectFamilyRuntimeProviderWithLifecycle(providerKind, paths, options),
  ] as const));
  return new Map(entries);
}

function attemptProjection(
  row: StageAttemptWorkbenchRow,
  latestCloseout: JsonRecord | null,
  signals: JsonRecord[],
  providerReadiness: Awaited<ReturnType<typeof inspectFamilyRuntimeProviderWithLifecycle>> | null,
) {
  const providerRun = parseRecord(row.provider_run_json);
  const activityEvents = recordList(parseList(row.activity_events_json));
  const routeImpact = parseRecord(row.route_impact_json);
  const workspaceLocator = parseRecord(row.workspace_locator_json);
  const activity = latestActivity(activityEvents);
  const checkpointRefs = stringList(parseList(row.checkpoint_refs_json));
  const closeoutRefs = stringList(parseList(row.closeout_refs_json));
  const humanGateRefs = stringList(parseList(row.human_gate_refs_json));
  const humanGateLedger = signals.filter((signal) => signal.signal_kind === 'human_gate');
  const userInstructionLedger = signals.filter((signal) => signal.signal_kind === 'user_instruction');
  const resumeLedger = signals.filter((signal) => signal.signal_kind === 'resume');
  const domainReadyVerdict = optionalString(latestCloseout?.domain_ready_verdict)
    ?? optionalString(routeImpact.domain_ready_verdict);
  const consumedRefs = stringList(Array.isArray(latestCloseout?.consumed_refs) ? latestCloseout.consumed_refs : []);
  const consumedMemoryRefs = stringList(Array.isArray(latestCloseout?.consumed_memory_refs) ? latestCloseout.consumed_memory_refs : []);
  const writebackReceiptRefs = stringList(Array.isArray(latestCloseout?.writeback_receipt_refs) ? latestCloseout.writeback_receipt_refs : []);
  const rejectedWrites = Array.isArray(latestCloseout?.rejected_writes) ? latestCloseout.rejected_writes : [];
  const controlledApplyContract = buildFamilyRuntimeControlledApplyContract({
    domainId: row.domain_id,
    stageId: row.stage_id,
    workspaceLocator,
  });
  const lifecyclePrimitives = buildFamilyRuntimeLifecyclePrimitives({
    workspaceLocator,
    artifactRefs: [
      ...closeoutRefs,
      ...consumedRefs,
      ...writebackReceiptRefs,
    ],
  });
  const isHumanGate = attemptHasHumanGate(row, humanGateRefs, humanGateLedger);
  const isDeadLetter = row.status === 'dead_lettered';
  const isBlocked = Boolean(row.blocked_reason);
  const nextOwner = optionalString(latestCloseout?.next_owner) ?? optionalString(routeImpact.next_owner) ?? row.domain_id;
  const attentionFlags = [
    isHumanGate ? 'human_gate' : null,
    resumeLedger.length > 0 ? 'resume_available' : null,
    isDeadLetter ? 'dead_lettered' : null,
    isBlocked ? 'blocked' : null,
    rejectedWrites.length > 0 ? 'rejected_writes' : null,
  ].filter((flag): flag is string => Boolean(flag));
  const deadLetter = row.status === 'dead_lettered'
    ? {
        reason: row.blocked_reason,
        task: null,
      }
    : null;
  const artifactRefs = [
    ...closeoutRefs,
    ...consumedRefs,
    ...writebackReceiptRefs,
  ];
  const currentProviderReadiness = currentProviderReadinessProjection(providerKindForRow(row), providerReadiness);
  const genericProjections = buildAttemptGenericProjections({
    stage_attempt_id: row.stage_attempt_id,
    domain_id: row.domain_id,
    stage_id: row.stage_id,
    next_owner: nextOwner,
    route_impact: routeImpact,
    workspace_locator: workspaceLocator,
    source_fingerprint: row.source_fingerprint,
    checkpoint_refs: checkpointRefs,
    closeout_refs: closeoutRefs,
    consumed_refs: consumedRefs,
    consumed_memory_refs: consumedMemoryRefs,
    writeback_receipt_refs: writebackReceiptRefs,
    artifact_refs: artifactRefs,
    rejected_writes: rejectedWrites,
    attention_flags: attentionFlags,
    human_gate_refs: humanGateRefs,
    human_gate_ledger: humanGateLedger,
    resume_ledger: resumeLedger,
    dead_letter: deadLetter,
    domain_ready_verdict: domainReadyVerdict,
    controlled_apply_contract: controlledApplyContract,
    lifecycle_primitives: lifecyclePrimitives,
    current_provider_readiness: currentProviderReadiness,
  });

  return {
    stage_attempt_id: row.stage_attempt_id,
    provider_kind: row.provider_kind,
    domain_id: row.domain_id,
    stage_id: row.stage_id,
    workflow_id: row.workflow_id,
    workspace_locator: workspaceLocator,
    source_fingerprint: row.source_fingerprint,
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
    consumed_refs: consumedRefs,
    consumed_memory_refs: consumedMemoryRefs,
    writeback_receipt_refs: writebackReceiptRefs,
    closeout_refs: closeoutRefs,
    artifact_refs: artifactRefs,
    closeout_receipt_status: row.closeout_receipt_status,
    domain_ready_verdict: domainReadyVerdict,
    rejected_writes: rejectedWrites,
    route_impact: routeImpact,
    ...genericProjections,
    next_owner: nextOwner,
    human_gate_refs: humanGateRefs,
    human_gate_ledger: humanGateLedger,
    user_instruction_ledger: userInstructionLedger,
    resume_ledger: resumeLedger,
    user_instructions: userInstructionLedger,
    resume_signals: resumeLedger,
    dead_letter: deadLetter,
    completion_boundary: {
      provider_completion: row.status === 'completed' ? 'completed' : 'not_completed',
      domain_ready_verdict: domainReadyVerdict,
      provider_completion_is_domain_ready: false,
    },
    controlled_apply_contract: controlledApplyContract,
    lifecycle_primitives: lifecyclePrimitives,
    current_provider_readiness: currentProviderReadiness,
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
      ...buildWorkbenchGenericProjections(attempts),
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
    ...buildWorkbenchGenericProjections([]),
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

export async function buildStageAttemptWorkbench(options: ProviderReadinessOptions = {}) {
  const paths = familyRuntimePaths();
  const queueDb = paths.queue_db;
  if (!fs.existsSync(queueDb)) {
    return {
      surface_kind: 'opl_stage_attempt_workbench',
      availability: 'missing_ledger',
      provider_completion_is_domain_ready: false,
      attempts: [],
      ...EMPTY_WORKBENCH_METADATA,
      artifact_gallery: EMPTY_WORKBENCH_METADATA.summary.artifact_gallery,
      route_decision_graph: EMPTY_WORKBENCH_METADATA.summary.route_decision_graph,
      review_repair_queue: EMPTY_WORKBENCH_METADATA.summary.review_repair_queue,
      quality_readiness: EMPTY_WORKBENCH_METADATA.summary.quality_readiness,
      observability_slo: EMPTY_WORKBENCH_METADATA.summary.observability_slo,
      workspace_source_intake: EMPTY_WORKBENCH_METADATA.summary.workspace_source_intake,
      memory_locator_index: EMPTY_WORKBENCH_METADATA.summary.memory_locator_index,
      package_export_lifecycle: EMPTY_WORKBENCH_METADATA.summary.package_export_lifecycle,
      action_routing: EMPTY_WORKBENCH_METADATA.summary.action_routing,
      source_refs: sourceRefs(queueDb),
      authority_boundary: {
        opl: 'attempt_control_metadata_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
  }

  const db = new DatabaseSync(queueDb, { readOnly: true });
  try {
    const rows = listStageAttemptRows(db, 25) as StageAttemptWorkbenchRow[];
    const attemptIds = rows.map((row) => row.stage_attempt_id);
    const latestCloseouts = latestStageAttemptCloseoutPacketsByAttempt(db, attemptIds);
    const signals = stageAttemptSignalsByAttempt(db, attemptIds);
    const providerReadiness = await currentProviderReadinessByKind(rows, paths, options);
    const attempts = rows.map((row) => {
      const providerKind = providerKindForRow(row);
      return attemptProjection(
        row,
        latestCloseouts.get(row.stage_attempt_id) ?? null,
        signals.get(row.stage_attempt_id) ?? [],
        providerKind ? providerReadiness.get(providerKind) ?? null : null,
      );
    });
    const metadata = workbenchMetadata(attempts);
    return {
      surface_kind: 'opl_stage_attempt_workbench',
      availability: 'available',
      provider_completion_is_domain_ready: false,
      ...metadata,
      artifact_gallery: metadata.summary.artifact_gallery,
      route_decision_graph: metadata.summary.route_decision_graph,
      review_repair_queue: metadata.summary.review_repair_queue,
      quality_readiness: metadata.summary.quality_readiness,
      observability_slo: metadata.summary.observability_slo,
      workspace_source_intake: metadata.summary.workspace_source_intake,
      memory_locator_index: metadata.summary.memory_locator_index,
      package_export_lifecycle: metadata.summary.package_export_lifecycle,
      action_routing: metadata.summary.action_routing,
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
      artifact_gallery: EMPTY_WORKBENCH_METADATA.summary.artifact_gallery,
      route_decision_graph: EMPTY_WORKBENCH_METADATA.summary.route_decision_graph,
      review_repair_queue: EMPTY_WORKBENCH_METADATA.summary.review_repair_queue,
      quality_readiness: EMPTY_WORKBENCH_METADATA.summary.quality_readiness,
      observability_slo: EMPTY_WORKBENCH_METADATA.summary.observability_slo,
      workspace_source_intake: EMPTY_WORKBENCH_METADATA.summary.workspace_source_intake,
      memory_locator_index: EMPTY_WORKBENCH_METADATA.summary.memory_locator_index,
      package_export_lifecycle: EMPTY_WORKBENCH_METADATA.summary.package_export_lifecycle,
      action_routing: EMPTY_WORKBENCH_METADATA.summary.action_routing,
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
