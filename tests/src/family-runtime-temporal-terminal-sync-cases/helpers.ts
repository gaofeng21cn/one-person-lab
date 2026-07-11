import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  createStageAttempt,
  createStageAttemptTable,
} from '../../../src/modules/runway/family-runtime-stage-attempts.ts';
import { createFamilyRuntimeQueueTables } from '../../../src/modules/runway/family-runtime-store.ts';

export function withStageAttemptDb(fn: (db: DatabaseSync) => void) {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-terminal-sync-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  const db = new DatabaseSync(':memory:');
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    createStageAttemptTable(db);
    fn(db);
  } finally {
    db.close();
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(stateRoot, { recursive: true, force: true });
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
    payload?: Record<string, unknown>;
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
    JSON.stringify({
      action_type: 'complete_medical_paper_readiness_surface',
      work_unit_id: 'complete_medical_paper_readiness_surface',
      next_executable_owner: 'medautoscience',
      ...input.payload,
    }),
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
    'redcube',
    'domain_route/stage-route',
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

type TerminalObservationIdentity = {
  domainId?: string;
  stageId?: string;
  checkpointRef?: string;
  nextOwner?: string;
};

type TerminalObservationInput = TerminalObservationIdentity & {
  stageAttemptId: string;
  workflowId: string;
  createdAt: string;
  blockedReason?: string;
};

function terminalObservation(input: TerminalObservationInput & { status: 'blocked' | 'completed' | 'failed' }) {
  const completed = input.status === 'completed';
  const blockedReason = input.blockedReason ?? 'typed_closeout_packet_required';
  const closeoutRefs = completed ? ['receipt:domain-closeout'] : [];
  return {
    surface_kind: 'temporal_stage_attempt_query_receipt',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    workflow_status: input.status === 'failed' ? 'FAILED' : 'COMPLETED',
    query: {
      surface_kind: 'temporal_stage_attempt_query',
      provider_kind: 'temporal',
      stage_attempt_id: input.stageAttemptId,
      workflow_id: input.workflowId,
      domain_id: input.domainId ?? 'medautoscience',
      stage_id: input.stageId ?? 'domain_owner/default-executor-dispatch',
      status: input.status,
      started_at: input.createdAt,
      updated_at: input.createdAt,
      activity_events: [],
      checkpoint_refs: [input.checkpointRef ?? 'checkpoint:mas-default-writer-start'],
      closeout_refs: closeoutRefs,
      consumed_refs: [],
      consumed_memory_refs: [],
      writeback_receipt_refs: [],
      rejected_writes: [],
      next_owner: input.nextOwner ?? 'med-autoscience',
      route_impact: {},
      human_gate_refs: [],
      signals: [],
      closeout_packet: completed
        ? { surface_kind: 'temporal_domain_handler_dispatch_receipt',
            closeout_packet_surface_kind: 'domain_stage_closeout_packet', closeout_refs: closeoutRefs }
        : input.status === 'blocked'
          ? { blocked_reason: blockedReason }
          : null,
      completion_boundary: {
        provider_completion: completed ? 'completed' : 'not_completed',
        domain_ready_verdict: completed ? 'domain_gate_pending' : null,
        provider_completion_is_domain_ready: false,
      },
      authority_boundary: {
        opl: 'temporal_workflow_transport_and_control_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    },
  } as const;
}

export function blockedTemporalObservation(input: TerminalObservationInput) {
  return terminalObservation({ ...input, status: 'blocked' });
}

export function completedTemporalObservation(input: TerminalObservationInput) {
  return terminalObservation({ ...input, status: 'completed' });
}

export function failedTemporalObservation(input: TerminalObservationInput) {
  return terminalObservation({ ...input, status: 'failed' });
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
      message: `Temporal workflow is already ${workflowStatus}.`,
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
    error: { code: 'temporal_workflow_not_found', message: 'workflow not found' },
  } as const;
}

export function createMasDefaultExecutorAttempt(
  db: DatabaseSync,
  input: { taskId?: string; sourceFingerprint?: string } = {},
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
