import { DatabaseSync } from 'node:sqlite';

import {
  createStageAttempt,
  createStageAttemptTable,
} from '../../../src/modules/runway/family-runtime-stage-attempts.ts';
import { createFamilyRuntimeQueueTables } from '../../../src/modules/runway/family-runtime-store.ts';

export function withStageAttemptDb(fn: (db: DatabaseSync) => void) {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    fn(db);
  } finally {
    db.close();
  }
}

export function createQueueTables(db: DatabaseSync) {
  createFamilyRuntimeQueueTables(db);
}

export function insertMasDefaultExecutorTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    status: 'queued' | 'running' | 'succeeded' | 'blocked';
    createdAt: string;
    lastError?: string | null;
    deadLetterReason?: string | null;
  },
) {
  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status, attempts,
      max_attempts, source, requires_approval, approved_at, lease_owner, lease_expires_at,
      last_error, dead_letter_reason, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.taskId,
    'medautoscience',
    'domain_owner/default-executor-dispatch',
    '{}',
    null,
    0,
    input.status,
    1,
    3,
    'test',
    0,
    null,
    null,
    null,
    input.lastError ?? null,
    input.deadLetterReason ?? null,
    input.createdAt,
    input.createdAt,
  );
}

export function insertDomainRouteTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    status: 'queued' | 'running' | 'succeeded' | 'blocked';
    createdAt: string;
  },
) {
  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status, attempts,
      max_attempts, source, requires_approval, approved_at, lease_owner, lease_expires_at,
      last_error, dead_letter_reason, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.taskId,
    'medautoscience',
    'domain_route/reconcile-apply',
    '{}',
    null,
    0,
    input.status,
    1,
    3,
    'test',
    0,
    null,
    null,
    null,
    null,
    null,
    input.createdAt,
    input.createdAt,
  );
}

export function blockedTemporalObservation(input: {
  stageAttemptId: string;
  workflowId: string;
  createdAt: string;
  blockedReason?: string;
}) {
  const blockedReason = input.blockedReason ?? 'typed_closeout_packet_required';
  return {
    surface_kind: 'temporal_stage_attempt_query_receipt',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    workflow_status: 'COMPLETED',
    query: {
      surface_kind: 'temporal_stage_attempt_query',
      provider_kind: 'temporal',
      stage_attempt_id: input.stageAttemptId,
      workflow_id: input.workflowId,
      domain_id: 'medautoscience',
      stage_id: 'domain_owner/default-executor-dispatch',
      status: 'blocked',
      started_at: input.createdAt,
      updated_at: input.createdAt,
      activity_events: [],
      checkpoint_refs: ['checkpoint:mas-default-writer-start'],
      closeout_refs: [],
      consumed_refs: [],
      consumed_memory_refs: [],
      writeback_receipt_refs: [],
      rejected_writes: [],
      next_owner: 'med-autoscience',
      route_impact: {},
      human_gate_refs: [],
      signals: [],
      closeout_packet: { blocked_reason: blockedReason },
      completion_boundary: {
        provider_completion: 'not_completed',
        domain_ready_verdict: null,
        provider_completion_is_domain_ready: false,
      },
      authority_boundary: {
        opl: 'temporal_workflow_transport_and_control_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    },
  } as const;
}

export function failedTemporalObservation(input: {
  stageAttemptId: string;
  workflowId: string;
  createdAt: string;
}) {
  return {
    surface_kind: 'temporal_stage_attempt_query_receipt',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    workflow_status: 'FAILED',
    query: {
      surface_kind: 'temporal_stage_attempt_query',
      provider_kind: 'temporal',
      stage_attempt_id: input.stageAttemptId,
      workflow_id: input.workflowId,
      domain_id: 'medautoscience',
      stage_id: 'domain_owner/default-executor-dispatch',
      status: 'failed',
      started_at: input.createdAt,
      updated_at: input.createdAt,
      activity_events: [],
      checkpoint_refs: ['checkpoint:mas-default-writer-start'],
      closeout_refs: [],
      consumed_refs: [],
      consumed_memory_refs: [],
      writeback_receipt_refs: [],
      rejected_writes: [],
      next_owner: 'med-autoscience',
      route_impact: {},
      human_gate_refs: [],
      signals: [],
      closeout_packet: null,
      completion_boundary: {
        provider_completion: 'not_completed',
        domain_ready_verdict: null,
        provider_completion_is_domain_ready: false,
      },
      authority_boundary: {
        opl: 'temporal_workflow_transport_and_control_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    },
  } as const;
}

export function canceledTemporalObservation(input: {
  stageAttemptId: string;
  workflowId: string;
  workflowStatus?: 'CANCELED' | 'CANCELLED';
}) {
  const workflowStatus = input.workflowStatus ?? 'CANCELED';
  return {
    surface_kind: 'temporal_stage_attempt_query_receipt',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    workflow_status: workflowStatus,
    query_error: {
      code: 'temporal_stage_attempt_query_unavailable_after_terminal',
      message: `Temporal workflow is already ${workflowStatus}; terminal cancellation is sufficient for provider sync.`,
    },
    authority_boundary: {
      opl: 'temporal_workflow_transport_and_control_metadata_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  } as const;
}

export function missingWorkflowObservation(input: {
  stageAttemptId: string;
  workflowId: string;
}) {
  return {
    surface_kind: 'temporal_stage_attempt_query_unavailable',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    status: 'unavailable',
    reason: 'temporal_workflow_not_started_or_not_found',
    error: {
      code: 'temporal_workflow_not_found',
      message: 'workflow not found',
    },
  } as const;
}

export function createMasDefaultExecutorAttempt(
  db: DatabaseSync,
  input: {
    taskId?: string;
    sourceFingerprint?: string;
  } = {},
) {
  return createStageAttempt(db, {
    domainId: 'medautoscience',
    stageId: 'domain_owner/default-executor-dispatch',
    providerKind: 'temporal',
    workspaceLocator: { workspace_root: '/tmp/mas' },
    sourceFingerprint: input.sourceFingerprint ?? 'sha256:mas-default-dispatch',
    executorKind: 'codex_cli',
    taskId: input.taskId,
    checkpointRefs: ['dispatch:mas-default-writer-start'],
  }).attempt;
}
