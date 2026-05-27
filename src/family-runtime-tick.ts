import { DatabaseSync } from 'node:sqlite';

import type {
  EnqueueInput,
  FamilyRuntimeDomainProfiles,
  FamilyRuntimeTaskScope,
} from './family-runtime-command.ts';
import { hydrateDomainTasks } from './family-runtime-domain-intake.ts';
import type { familyRuntimePaths, taskToPayload } from './family-runtime-store.ts';
import { insertEvent, type FamilyRuntimeTaskRow } from './family-runtime-store.ts';
import { taskRowMatchesScope } from './family-runtime-task-scope.ts';
import {
  listStageAttemptsForTask,
  syncStageAttemptFromTemporalTerminalObservation,
} from './family-runtime-stage-attempts.ts';
import {
  findLiveMasDefaultExecutorDispatchAttempt,
  ensureProviderHostedStageAttempt,
  isMasDefaultExecutorDispatchTask,
  masDefaultExecutorDispatchIdentity,
  masDefaultExecutorDomainSourceFingerprint,
  refreshMasDefaultExecutorLiveAttemptTaskLease,
} from './family-runtime-provider-hosted-attempts.ts';
import { redriveBlockedMasDefaultExecutorProviderTransportTask } from './family-runtime-redrive.ts';

type EnqueueTaskResult = {
  accepted?: boolean;
  requeued_from_terminal?: boolean;
  idempotent_noop?: boolean;
  task?: ReturnType<typeof taskToPayload>;
};

type EnqueueTask = (db: DatabaseSync, input: EnqueueInput) => EnqueueTaskResult;
type StageAttemptPayload = NonNullable<ReturnType<typeof findLiveMasDefaultExecutorDispatchAttempt>>;
type QueryTemporalStageAttempt = (attempt: StageAttemptPayload) => unknown | Promise<unknown>;

const PROVIDER_TRANSPORT_REDRIVE_REASONS = new Set([
  'temporal_stage_attempt_start_failed',
  'temporal_stage_attempt_not_completed',
  'temporal_stage_attempt_failed',
]);

type MasDefaultExecutorCurrentTask = {
  task_id: string;
  source_fingerprint: string | null;
  created_at: string;
};

const MISSING_STAGE_ATTEMPT_IDENTITY_REPAIR_REASON = 'missing_stage_attempt_identity';

function payloadFromTask(row: FamilyRuntimeTaskRow) {
  return JSON.parse(row.payload_json) as Record<string, unknown>;
}

function isNewerTask(left: Pick<FamilyRuntimeTaskRow, 'created_at' | 'task_id'>, right: MasDefaultExecutorCurrentTask) {
  if (left.created_at !== right.created_at) {
    return left.created_at > right.created_at;
  }
  return left.task_id > right.task_id;
}

function currentMasDefaultExecutorTasksByDispatch(rows: FamilyRuntimeTaskRow[]) {
  const currentByIdentity = new Map<string, MasDefaultExecutorCurrentTask>();
  for (const row of rows) {
    const payload = payloadFromTask(row);
    const identity = masDefaultExecutorDispatchIdentity(row, payload);
    if (!identity) {
      continue;
    }
    const current = currentByIdentity.get(identity);
    if (!current || isNewerTask(row, current)) {
      currentByIdentity.set(identity, {
        task_id: row.task_id,
        source_fingerprint: masDefaultExecutorDomainSourceFingerprint(payload),
        created_at: row.created_at,
      });
    }
  }
  return currentByIdentity;
}

function dropSupersededMasDefaultExecutorRows(
  candidateRows: FamilyRuntimeTaskRow[],
  allRows: FamilyRuntimeTaskRow[],
) {
  const currentByIdentity = currentMasDefaultExecutorTasksByDispatch(allRows);
  let supersededCount = 0;
  const rows = candidateRows.filter((row) => {
    const payload = payloadFromTask(row);
    const identity = masDefaultExecutorDispatchIdentity(row, payload);
    if (!identity) {
      return true;
    }
    const current = currentByIdentity.get(identity);
    const sourceFingerprint = masDefaultExecutorDomainSourceFingerprint(payload);
    if (
      current
      && current.source_fingerprint
      && sourceFingerprint
      && current.source_fingerprint !== sourceFingerprint
    ) {
      supersededCount += 1;
      return false;
    }
    return true;
  });
  return { rows, supersededCount };
}

function attemptCountForTask(db: DatabaseSync, taskId: string) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM stage_attempts
    WHERE task_id = ?
  `).get(taskId) as { count: number };
  return row.count;
}

function isExpiredOrUnleasedRunningTask(row: FamilyRuntimeTaskRow) {
  if (row.status !== 'running') {
    return false;
  }
  if (!row.lease_expires_at) {
    return true;
  }
  const leaseExpiresAt = Date.parse(row.lease_expires_at);
  return Number.isFinite(leaseExpiresAt) && leaseExpiresAt <= Date.now();
}

function repairRunningTasksWithoutStageAttemptIdentity(
  db: DatabaseSync,
  rows: FamilyRuntimeTaskRow[],
  source: string,
) {
  let repairedCount = 0;
  let deadLetteredCount = 0;
  const repairedTaskIds = new Set<string>();
  const repairedAt = new Date().toISOString();
  for (const row of rows) {
    if (!isExpiredOrUnleasedRunningTask(row) || listStageAttemptsForTask(db, row.task_id).length > 0) {
      continue;
    }
    const payload = payloadFromTask(row);
    const nextStatus = row.attempts >= row.max_attempts ? 'dead_letter' : 'retry_waiting';
    db.prepare(`
      UPDATE tasks
      SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
        last_error = ?, dead_letter_reason = ?, updated_at = ?
      WHERE task_id = ? AND status = 'running'
    `).run(
      nextStatus,
      MISSING_STAGE_ATTEMPT_IDENTITY_REPAIR_REASON,
      nextStatus === 'dead_letter' ? MISSING_STAGE_ATTEMPT_IDENTITY_REPAIR_REASON : null,
      repairedAt,
      row.task_id,
    );
    const stageAttempt = nextStatus === 'retry_waiting'
      ? ensureProviderHostedStageAttempt(db, {
        ...row,
        status: nextStatus,
        lease_owner: null,
        lease_expires_at: null,
        last_error: 'missing_stage_attempt_identity',
        dead_letter_reason: null,
        updated_at: repairedAt,
      }, payload, {
        newAttempt: true,
        eventSource: source,
      })
      : null;
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: nextStatus === 'dead_letter'
        ? 'task_dead_lettered_after_missing_stage_attempt_identity'
        : 'task_requeued_after_missing_stage_attempt_identity',
      source,
      payload: {
        previous_status: row.status,
        next_status: nextStatus,
        previous_attempts: row.attempts,
        max_attempts: row.max_attempts,
        repaired_stage_attempt_id: stageAttempt?.stage_attempt_id ?? null,
        reason: MISSING_STAGE_ATTEMPT_IDENTITY_REPAIR_REASON,
        authority_boundary: {
          opl: 'queue_attempt_identity_reconciliation_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
        },
      },
    });
    repairedTaskIds.add(row.task_id);
    repairedCount += 1;
    if (nextStatus === 'dead_letter') {
      deadLetteredCount += 1;
    }
  }
  return { repairedCount, deadLetteredCount, repairedTaskIds };
}

function autoRedriveBlockedMasDefaultExecutorProviderTasks(
  db: DatabaseSync,
  rows: FamilyRuntimeTaskRow[],
  source: string,
) {
  let autoRedrivenCount = 0;
  let autoDeadLetteredCount = 0;
  const redrivenAt = new Date().toISOString();
  const currentByIdentity = currentMasDefaultExecutorTasksByDispatch(rows);
  for (const row of rows) {
    if (
      row.status !== 'blocked'
      || !PROVIDER_TRANSPORT_REDRIVE_REASONS.has(row.dead_letter_reason ?? '')
    ) {
      continue;
    }
    const payload = payloadFromTask(row);
    if (!isMasDefaultExecutorDispatchTask(row, payload)) {
      continue;
    }
    const identity = masDefaultExecutorDispatchIdentity(row, payload);
    const current = identity ? currentByIdentity.get(identity) : null;
    const sourceFingerprint = masDefaultExecutorDomainSourceFingerprint(payload);
    if (
      current
      && current.task_id !== row.task_id
      && current.source_fingerprint
      && sourceFingerprint
      && current.source_fingerprint !== sourceFingerprint
    ) {
      continue;
    }
    const usedAttempts = attemptCountForTask(db, row.task_id);
    if (usedAttempts >= row.max_attempts) {
      db.prepare(`
        UPDATE tasks
        SET status = 'dead_letter', lease_owner = NULL, lease_expires_at = NULL,
          last_error = ?, dead_letter_reason = ?, updated_at = ?
        WHERE task_id = ?
      `).run('retry_budget_exhausted', 'retry_budget_exhausted', redrivenAt, row.task_id);
      insertEvent(db, {
        taskId: row.task_id,
        domainId: row.domain_id,
        eventType: 'task_auto_dead_lettered_after_provider_transport_retries',
        source,
        payload: {
          previous_status: row.status,
          previous_dead_letter_reason: row.dead_letter_reason,
          used_attempts: usedAttempts,
          max_attempts: row.max_attempts,
          authority_boundary: {
            opl: 'provider_transport_retry_budget_only',
            domain: 'truth_quality_artifact_gate_owner',
            domain_truth_mutation: false,
            publication_quality_mutation: false,
            artifact_gate_mutation: false,
            current_package_mutation: false,
          },
        },
      });
      autoDeadLetteredCount += 1;
      continue;
    }
    const redrive = redriveBlockedMasDefaultExecutorProviderTransportTask(db, row, payload, {
      trigger: 'auto',
      source,
      usedAttempts,
      maxAttempts: row.max_attempts,
      redrivenAt,
    });
    if (redrive.redriven) {
      autoRedrivenCount += 1;
    }
  }
  return { autoRedrivenCount, autoDeadLetteredCount };
}

function isLiveMasDefaultExecutorAttempt(attempt: StageAttemptPayload | null) {
  return Boolean(attempt && ['queued', 'running', 'checkpointed', 'human_gate'].includes(attempt.status));
}

function isExpiredMasDefaultExecutorTaskLease(row: FamilyRuntimeTaskRow) {
  if (row.status !== 'running' || !row.lease_expires_at) {
    return false;
  }
  const leaseExpiresAt = Date.parse(row.lease_expires_at);
  return Number.isFinite(leaseExpiresAt) && leaseExpiresAt <= Date.now();
}

function isObservableRunningMasDefaultExecutorAttempt(row: FamilyRuntimeTaskRow) {
  return (attempt: StageAttemptPayload) => {
    const observableStarted = attempt.provider_kind === 'temporal'
      && attempt.executor_kind === 'codex_cli'
      && ['running', 'checkpointed', 'human_gate'].includes(attempt.status);
    if (observableStarted) {
      return true;
    }
    return isExpiredMasDefaultExecutorTaskLease(row)
      && attempt.provider_kind === 'temporal'
      && attempt.executor_kind === 'codex_cli'
      && attempt.status === 'queued'
      && attempt.provider_run.provider_status === 'registered';
  };
}

function isProviderStartedMasDefaultExecutorAttempt(attempt: StageAttemptPayload) {
  return attempt.provider_kind === 'temporal'
    && attempt.executor_kind === 'codex_cli'
    && ['running', 'checkpointed', 'human_gate'].includes(attempt.status);
}

async function syncObservableMasDefaultExecutorAttempt(
  db: DatabaseSync,
  attempt: StageAttemptPayload,
  queryTemporalStageAttempt?: QueryTemporalStageAttempt,
) {
  if (!queryTemporalStageAttempt) {
    return attempt;
  }
  const observation = await queryTemporalStageAttempt(attempt);
  return syncStageAttemptFromTemporalTerminalObservation(db, observation) ?? attempt;
}

async function dropLiveMasDefaultExecutorRows(
  db: DatabaseSync,
  candidateRows: FamilyRuntimeTaskRow[],
  options: {
    queryTemporalStageAttempt?: QueryTemporalStageAttempt;
  } = {},
) {
  let liveSkippedCount = 0;
  const rows: FamilyRuntimeTaskRow[] = [];
  for (const row of candidateRows) {
    const payload = payloadFromTask(row);
    const liveAttempt = findLiveMasDefaultExecutorDispatchAttempt(db, row, payload);
    if (!liveAttempt) {
      rows.push(row);
      continue;
    }
    const syncedAttempt = await syncObservableMasDefaultExecutorAttempt(
      db,
      liveAttempt,
      options.queryTemporalStageAttempt,
    );
    if (!isLiveMasDefaultExecutorAttempt(syncedAttempt)) {
      rows.push(row);
      continue;
    }
    liveSkippedCount += 1;
    refreshMasDefaultExecutorLiveAttemptTaskLease(db, {
      attempt: syncedAttempt,
      source: 'opl-family-runtime-tick',
      reason: 'same_dispatch_live_stage_attempt_exists',
    });
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'task_default_executor_live_dispatch_tick_skip',
      source: 'opl-family-runtime-tick',
      payload: {
        reason: 'same_dispatch_live_stage_attempt_exists',
        live_task_id: liveAttempt.task_id,
        stage_attempt_id: liveAttempt.stage_attempt_id,
        dispatch_ref: payload.dispatch_ref ?? null,
        action_type: payload.action_type ?? null,
        study_id: payload.study_id ?? null,
      },
    });
  }
  return { rows, liveSkippedCount };
}

async function syncRunningMasDefaultExecutorTaskAttempts(
  db: DatabaseSync,
  rows: FamilyRuntimeTaskRow[],
  options: {
    queryTemporalStageAttempt?: QueryTemporalStageAttempt;
  } = {},
) {
  if (!options.queryTemporalStageAttempt) {
    return 0;
  }
  let terminalSyncedCount = 0;
  for (const row of rows) {
    if (row.status !== 'running') {
      continue;
    }
    const payload = payloadFromTask(row);
    if (!isMasDefaultExecutorDispatchTask(row, payload)) {
      continue;
    }
    const attempts = listStageAttemptsForTask(db, row.task_id).filter(
      isObservableRunningMasDefaultExecutorAttempt(row),
    );
    for (const attempt of attempts) {
      const syncedAttempt = await syncObservableMasDefaultExecutorAttempt(
        db,
        attempt,
        options.queryTemporalStageAttempt,
      );
      if (!isProviderStartedMasDefaultExecutorAttempt(syncedAttempt)) {
        terminalSyncedCount += 1;
      }
    }
  }
  return terminalSyncedCount;
}

export async function runFamilyRuntimeQueueTick<TDispatch = unknown>(
  db: DatabaseSync,
  paths: ReturnType<typeof familyRuntimePaths>,
  input: {
    source: string;
    limit: number;
    hydrate: boolean;
    taskScope?: FamilyRuntimeTaskScope;
    domainProfiles?: FamilyRuntimeDomainProfiles;
  },
  handlers: {
    enqueueTask: EnqueueTask;
    dispatchTask: (
      db: DatabaseSync,
      paths: ReturnType<typeof familyRuntimePaths>,
      row: FamilyRuntimeTaskRow,
    ) => TDispatch | Promise<TDispatch>;
    queryTemporalStageAttempt?: QueryTemporalStageAttempt;
  },
) {
  const hydration = input.hydrate
    ? hydrateDomainTasks(db, paths, {
      source: `${input.source}:hydrate`,
      taskScope: input.taskScope,
      domainProfiles: input.domainProfiles,
    }, handlers.enqueueTask)
    : {
      source: input.source,
      task_scope: input.taskScope ?? null,
      enqueued_count: 0,
      requeued_count: 0,
      idempotent_noop_count: 0,
      blocked_count: 0,
      filtered_count: 0,
      exports: [],
    };
  const allRowsBeforeAutoRedrive = db.prepare('SELECT * FROM tasks').all() as FamilyRuntimeTaskRow[];
  const scopedRowsBeforeAutoRedrive = allRowsBeforeAutoRedrive.filter((row) => taskRowMatchesScope(row, input.taskScope));
  const masDefaultExecutorTerminalSyncedCount = await syncRunningMasDefaultExecutorTaskAttempts(
    db,
    scopedRowsBeforeAutoRedrive,
    { queryTemporalStageAttempt: handlers.queryTemporalStageAttempt },
  );
  const allRowsAfterTerminalSync = db.prepare('SELECT * FROM tasks').all() as FamilyRuntimeTaskRow[];
  const scopedRowsAfterTerminalSync = allRowsAfterTerminalSync.filter((row) => taskRowMatchesScope(row, input.taskScope));
  const missingIdentityRepairSource = `${input.source}:missing-identity-repair`;
  const {
    repairedCount: repairedMissingIdentityRunningCount,
    deadLetteredCount: repairedMissingIdentityDeadLetteredCount,
    repairedTaskIds: repairedMissingIdentityTaskIdSet,
  } = repairRunningTasksWithoutStageAttemptIdentity(
    db,
    scopedRowsAfterTerminalSync,
    missingIdentityRepairSource,
  );
  const allRowsAfterMissingIdentityRepair = db.prepare('SELECT * FROM tasks').all() as FamilyRuntimeTaskRow[];
  const scopedRowsAfterMissingIdentityRepair = allRowsAfterMissingIdentityRepair.filter((row) =>
    taskRowMatchesScope(row, input.taskScope)
  );
  const {
    autoRedrivenCount: masDefaultExecutorAutoRedrivenCount,
    autoDeadLetteredCount: masDefaultExecutorAutoDeadLetteredCount,
  } = autoRedriveBlockedMasDefaultExecutorProviderTasks(
    db,
    scopedRowsAfterMissingIdentityRepair,
    `${input.source}:auto-redrive`,
  );
  const candidateRows = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('queued', 'retry_waiting')
    ORDER BY priority DESC, created_at ASC
  `).all() as FamilyRuntimeTaskRow[];
  const allRows = db.prepare('SELECT * FROM tasks').all() as FamilyRuntimeTaskRow[];
  const scopedRowsBeforeSupersededFilter = candidateRows.filter((row) =>
    taskRowMatchesScope(row, input.taskScope) && !repairedMissingIdentityTaskIdSet.has(row.task_id)
  );
  const {
    rows: scopedRowsAfterSuperseded,
    supersededCount: masDefaultExecutorSupersededCount,
  } = dropSupersededMasDefaultExecutorRows(scopedRowsBeforeSupersededFilter, allRows);
  const {
    rows: scopedRows,
    liveSkippedCount: masDefaultExecutorLiveSkippedCount,
  } = await dropLiveMasDefaultExecutorRows(db, scopedRowsAfterSuperseded, {
    queryTemporalStageAttempt: handlers.queryTemporalStageAttempt,
  });
  const rows = scopedRows.slice(0, input.limit);
  const filteredCount = candidateRows.length - scopedRows.length;
  insertEvent(db, {
    eventType: 'tick_started',
    source: input.source,
    payload: {
      limit: input.limit,
      selected_count: rows.length,
      filtered_count: filteredCount,
      mas_default_executor_superseded_count: masDefaultExecutorSupersededCount,
      mas_default_executor_live_skipped_count: masDefaultExecutorLiveSkippedCount,
      mas_default_executor_terminal_synced_count: masDefaultExecutorTerminalSyncedCount,
      repaired_missing_identity_running_count: repairedMissingIdentityRunningCount,
      repaired_missing_identity_dead_lettered_count: repairedMissingIdentityDeadLetteredCount,
      mas_default_executor_auto_redriven_count: masDefaultExecutorAutoRedrivenCount,
      mas_default_executor_auto_dead_lettered_count: masDefaultExecutorAutoDeadLetteredCount,
      task_scope: input.taskScope ?? null,
    },
  });
  const dispatches = await Promise.all(rows.map((row) => handlers.dispatchTask(db, paths, row)));
  insertEvent(db, {
    eventType: 'tick_completed',
    source: input.source,
    payload: { dispatches_count: dispatches.length },
  });
  return {
    source: input.source,
    task_scope: input.taskScope ?? null,
    hydration,
    selected_count: rows.length,
    filtered_count: filteredCount,
    mas_default_executor_superseded_count: masDefaultExecutorSupersededCount,
    mas_default_executor_live_skipped_count: masDefaultExecutorLiveSkippedCount,
    mas_default_executor_terminal_synced_count: masDefaultExecutorTerminalSyncedCount,
    repaired_missing_identity_running_count: repairedMissingIdentityRunningCount,
    repaired_missing_identity_dead_lettered_count: repairedMissingIdentityDeadLetteredCount,
    mas_default_executor_auto_redriven_count: masDefaultExecutorAutoRedrivenCount,
    mas_default_executor_auto_dead_lettered_count: masDefaultExecutorAutoDeadLetteredCount,
    dispatches,
  };
}
