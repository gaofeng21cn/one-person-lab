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
  findLiveMasDefaultExecutorDispatchAttempt,
  masDefaultExecutorDispatchIdentity,
  masDefaultExecutorDomainSourceFingerprint,
  refreshMasDefaultExecutorLiveAttemptTaskLease,
} from './family-runtime-provider-hosted-attempts.ts';

type EnqueueTaskResult = {
  accepted?: boolean;
  requeued_from_terminal?: boolean;
  idempotent_noop?: boolean;
  task?: ReturnType<typeof taskToPayload>;
};

type EnqueueTask = (db: DatabaseSync, input: EnqueueInput) => EnqueueTaskResult;

type MasDefaultExecutorCurrentTask = {
  task_id: string;
  source_fingerprint: string | null;
  created_at: string;
};

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

function dropLiveMasDefaultExecutorRows(
  db: DatabaseSync,
  candidateRows: FamilyRuntimeTaskRow[],
) {
  let liveSkippedCount = 0;
  const rows = candidateRows.filter((row) => {
    const payload = payloadFromTask(row);
    const liveAttempt = findLiveMasDefaultExecutorDispatchAttempt(db, row, payload);
    if (!liveAttempt) {
      return true;
    }
    liveSkippedCount += 1;
    refreshMasDefaultExecutorLiveAttemptTaskLease(db, {
      attempt: liveAttempt,
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
    return false;
  });
  return { rows, liveSkippedCount };
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
  const candidateRows = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('queued', 'retry_waiting')
    ORDER BY priority DESC, created_at ASC
  `).all() as FamilyRuntimeTaskRow[];
  const allRows = db.prepare('SELECT * FROM tasks').all() as FamilyRuntimeTaskRow[];
  const scopedRowsBeforeSupersededFilter = candidateRows.filter((row) => taskRowMatchesScope(row, input.taskScope));
  const {
    rows: scopedRowsAfterSuperseded,
    supersededCount: masDefaultExecutorSupersededCount,
  } = dropSupersededMasDefaultExecutorRows(scopedRowsBeforeSupersededFilter, allRows);
  const {
    rows: scopedRows,
    liveSkippedCount: masDefaultExecutorLiveSkippedCount,
  } = dropLiveMasDefaultExecutorRows(db, scopedRowsAfterSuperseded);
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
    dispatches,
  };
}
