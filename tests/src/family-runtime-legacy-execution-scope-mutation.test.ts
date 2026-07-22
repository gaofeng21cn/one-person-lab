import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../src/modules/charter/contracts.ts';
import {
  executionScopeColumnsFromRow,
  requireRuntimeExecutionScopeMutationAllowed,
} from '../../src/modules/runway/family-runtime-execution-scope-persistence.ts';
import {
  createStageAttempt,
  createStageAttemptTable,
  inspectStageAttempt,
} from '../../src/modules/runway/family-runtime-stage-attempts.ts';
import {
  getStageAttemptRow,
  type StageAttemptRow,
} from '../../src/modules/runway/family-runtime-stage-attempt-ledger.ts';
import {
  persistStageAttemptLaunchBinding,
  recordTemporalStartOnAttempt,
} from '../../src/modules/runway/family-runtime-parts/stage-attempt-launch.ts';
import { persistStageAttemptUsageObservation } from '../../src/modules/runway/family-runtime-stage-attempt-usage-observation.ts';
import { runStageAttemptFixtureActivity } from '../../src/modules/runway/family-runtime-stage-attempts-parts/fixture-activity.ts';
import { updateStageAttemptsForTask } from '../../src/modules/runway/family-runtime-stage-attempts-parts/task-sync-summary.ts';
import {
  createStageQualityCycle,
  markStageQualityCycleCurrentAttempt,
  projectTemporalStageRunQualityCycle,
} from '../../src/modules/runway/family-runtime-stage-quality-cycle.ts';
import {
  reconcileTemporalStageAttemptRuntimeObservations,
} from '../../src/modules/runway/family-runtime-temporal-runtime-observation-reconciliation.ts';
import {
  blockLinkedDefaultExecutorTask,
  markLinkedDefaultExecutorTaskCompleted,
} from '../../src/modules/runway/family-runtime-linked-task-sync.ts';
import { markStageAttemptCancelRequested } from '../../src/modules/runway/family-runtime-stage-attempt-control.ts';
import {
  reconcileDomainRouteTerminalTaskForAttempt,
  reconcileDomainRouteTerminalTasks,
} from '../../src/modules/runway/family-runtime-domain-route-terminal-sync.ts';
import { runFamilyRuntime } from '../../src/modules/runway/family-runtime.ts';
import {
  createFamilyRuntimeQueueTables,
  openQueueDb,
  type FamilyRuntimeTaskRow,
} from '../../src/modules/runway/family-runtime-store.ts';
import type { TemporalStageRunWorkflowState } from '../../src/modules/runway/family-runtime-temporal.ts';
import {
  installLegacyV1RuntimeFixture,
  rawTableRows,
  validLegacyV1Scope,
} from './execution-scope-v1-fixture.ts';

function expectFailureCode(operation: () => unknown, failureCode: string) {
  assert.throws(operation, (error: unknown) => (
    error instanceof FrameworkContractError
    && error.details?.failure_code === failureCode
  ));
}

function withDb(operation: (db: DatabaseSync) => void | Promise<void>) {
  const db = new DatabaseSync(':memory:');
  return Promise.resolve(operation(db)).finally(() => db.close());
}

function insertRuntimeTask(db: DatabaseSync, input: {
  taskId: string;
  domainId?: string;
  taskKind?: string;
}) {
  const now = '2026-07-21T00:00:00.000Z';
  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, priority, status, attempts,
      max_attempts, source, requires_approval, created_at, updated_at
    ) VALUES (?, ?, ?, '{}', 0, 'running', 0, 3, 'legacy-v1-test', 0, ?, ?)
  `).run(
    input.taskId,
    input.domainId ?? 'medautoscience',
    input.taskKind ?? 'domain_route/stage-route',
    now,
    now,
  );
}

test('legacy v1 snapshot is diagnostic-only and malformed or conflicting carriers fail closed', () => {
  const scope = validLegacyV1Scope();
  assert.equal(
    scope.scope_digest,
    'sha256:6ae5d7299f8925003bfa4dabeaeebb7844cca8d730993e8a4c756522137d8eb0',
  );
  const db = new DatabaseSync(':memory:');
  try {
    const fixture = installLegacyV1RuntimeFixture(db, { scope });
    const row = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
      fixture.stageAttemptId,
    ) as Record<string, unknown>;
    expectFailureCode(
      () => requireRuntimeExecutionScopeMutationAllowed(db, row, 'test_valid_legacy_v1'),
      'runtime_execution_identity_unresolved',
    );
    assert.deepEqual(executionScopeColumnsFromRow(row), {
      scope_kind: 'identity_unresolved',
      project_scope_id: null,
      work_item_scope_id: null,
      workspace_binding_id: null,
      binding_version_id: null,
      scope_digest: null,
      execution_scope_json: row.execution_scope_json,
      identity_state: 'identity_unresolved',
    });
    const readback = inspectStageAttempt(db, fixture.stageAttemptId);
    assert.equal(readback.scope_kind, 'identity_unresolved');
    assert.equal(readback.execution_scope, null);

    expectFailureCode(() => requireRuntimeExecutionScopeMutationAllowed(db, {
      ...row,
      execution_scope_json: JSON.stringify({ ...scope, version: 'opl-execution-scope-snapshot.v999' }),
    }, 'test_unsupported_legacy_carrier'), 'runtime_execution_scope_carrier_unsupported');
    expectFailureCode(() => requireRuntimeExecutionScopeMutationAllowed(db, {
      ...row,
      execution_scope_json: '{',
    }, 'test_invalid_legacy_carrier'), 'runtime_execution_scope_carrier_invalid');

    const otherScope = validLegacyV1Scope({
      project_scope_id: 'project:legacy-v1-other',
      domain_work_item_id: 'study-legacy-v1-other',
      workspace_binding_id: 'binding:legacy-v1-other',
      binding_version_id: 'binding:legacy-v1-other',
      workspace_root: '/tmp/opl-legacy-v1-other',
      canonical_work_item_root: '/tmp/opl-legacy-v1-other/studies/study-legacy-v1-other',
    });
    expectFailureCode(() => requireRuntimeExecutionScopeMutationAllowed(db, {
      ...row,
      workspace_locator_json: JSON.stringify({
        workspace_root: otherScope.workspace_root,
        execution_scope: otherScope,
      }),
    }, 'test_conflicting_legacy_carriers'), 'runtime_execution_scope_carrier_conflict');
  } finally {
    db.close();
  }
});

test('legacy v1 launch, Temporal start, usage, and fixture mutations leave raw rows unchanged', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const fixture = installLegacyV1RuntimeFixture(db);
    const tables = [
      'execution_scopes',
      'stage_run_launches',
      'stage_attempts',
      'stage_attempt_signals',
      'stage_attempt_closeouts',
    ];
    const original = rawTableRows(db, tables);
    const attempt = inspectStageAttempt(db, fixture.stageAttemptId);
    for (const mutation of [
      () => persistStageAttemptLaunchBinding(db, attempt, {
        workspaceLocator: attempt.workspace_locator,
        packageUseBinding: null,
        domainPackRoot: null,
      }),
      () => recordTemporalStartOnAttempt(db, attempt, {
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        first_execution_run_id: 'run:legacy-v1',
      }),
      () => persistStageAttemptUsageObservation(db, {
        stageAttemptId: fixture.stageAttemptId,
        costSummary: null,
        observedAt: '2026-07-21T00:01:00.000Z',
      }),
      () => runStageAttemptFixtureActivity(db, {
        stageAttemptId: fixture.stageAttemptId,
        checkpointRefs: ['checkpoint:forbidden'],
      }),
    ]) {
      expectFailureCode(mutation, 'runtime_execution_identity_unresolved');
      assert.deepEqual(rawTableRows(db, tables), original);
    }
  } finally {
    db.close();
  }
});

test('legacy v1 top-level attempt start rejects before package or provider side effects', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-legacy-v1-attempt-start-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  const previousTemporalAddress = process.env.OPL_TEMPORAL_ADDRESS;
  const tables = [
    'execution_scopes',
    'stage_run_launches',
    'stage_attempts',
    'stage_attempt_signals',
    'stage_attempt_closeouts',
    'stage_quality_cycles',
    'tasks',
    'events',
    'notifications',
  ];
  let readinessCalls = 0;
  process.env.OPL_STATE_DIR = stateRoot;
  process.env.OPL_TEMPORAL_ADDRESS = '127.0.0.1:1';
  try {
    const seeded = openQueueDb();
    const fixture = installLegacyV1RuntimeFixture(seeded.db);
    const original = rawTableRows(seeded.db, tables);
    seeded.db.close();

    await assert.rejects(
      runFamilyRuntime(['attempt', 'start', fixture.stageAttemptId], {
        stageRunRuntime: {
          ensurePackageLaunchReady: async () => {
            readinessCalls += 1;
            assert.fail('legacy v1 admission must run before package readiness');
          },
        },
      }),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'runtime_execution_identity_unresolved',
    );
    assert.equal(readinessCalls, 0);

    const readback = openQueueDb();
    try {
      assert.deepEqual(rawTableRows(readback.db, tables), original);
    } finally {
      readback.db.close();
    }
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    if (previousTemporalAddress === undefined) delete process.env.OPL_TEMPORAL_ADDRESS;
    else process.env.OPL_TEMPORAL_ADDRESS = previousTemporalAddress;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('legacy v1 top-level cancel rejects before provider or persisted side effects', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-legacy-v1-attempt-cancel-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  const tables = [
    'execution_scopes',
    'stage_run_launches',
    'stage_attempts',
    'stage_attempt_signals',
    'stage_attempt_closeouts',
    'stage_quality_cycles',
    'tasks',
    'events',
    'notifications',
  ];
  let cancelCalls = 0;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const seeded = openQueueDb();
    const fixture = installLegacyV1RuntimeFixture(seeded.db, {
      taskId: 'task:legacy-v1-top-level-cancel',
    });
    const original = rawTableRows(seeded.db, tables);
    seeded.db.close();

    await assert.rejects(
      runFamilyRuntime([
        'attempt',
        'cancel',
        fixture.stageAttemptId,
        '--reason',
        'forbidden legacy cancel',
      ], {
        stageRunRuntime: {
          cancelWorkflow: async () => {
            cancelCalls += 1;
            assert.fail('legacy v1 admission must run before provider cancellation');
          },
        },
      }),
      (error: unknown) => error instanceof FrameworkContractError
        && error.details?.failure_code === 'runtime_execution_identity_unresolved',
    );
    assert.equal(cancelCalls, 0);

    const readback = openQueueDb();
    try {
      assert.deepEqual(rawTableRows(readback.db, tables), original);
    } finally {
      readback.db.close();
    }
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('linked task exports reread and admit the durable Attempt instead of trusting caller rows', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const fixture = installLegacyV1RuntimeFixture(db, {
      taskId: 'task:legacy-v1-linked',
    });
    const persisted = getStageAttemptRow(db, fixture.stageAttemptId)!;
    const forgedCallerRow = {
      ...persisted,
      scope_kind: 'domain',
      project_scope_id: null,
      work_item_scope_id: null,
      workspace_binding_id: null,
      binding_version_id: null,
      scope_digest: null,
      execution_scope_json: null,
      identity_state: 'resolved',
      workspace_locator_json: JSON.stringify({ workspace_root: '/tmp/forged-caller-row' }),
    } as StageAttemptRow;
    assert.doesNotThrow(() => requireRuntimeExecutionScopeMutationAllowed(
      db,
      forgedCallerRow,
      'test_forged_linked_task_caller_row',
    ));
    const tables = [
      'execution_scopes',
      'stage_run_launches',
      'stage_attempts',
      'tasks',
      'events',
      'notifications',
    ];
    const original = rawTableRows(db, tables);
    for (const mutation of [
      () => markLinkedDefaultExecutorTaskCompleted(db, {
        row: forgedCallerRow,
        observedAt: '2026-07-21T00:03:00.000Z',
      }),
      () => blockLinkedDefaultExecutorTask(db, {
        row: forgedCallerRow,
        reason: 'forbidden legacy terminal projection',
        observedAt: '2026-07-21T00:03:00.000Z',
        taskDeadLetterReason: 'temporal_stage_attempt_failed',
        eventType: 'legacy_v1_forbidden_terminal_projection',
      }),
    ]) {
      expectFailureCode(mutation, 'runtime_execution_identity_unresolved');
      assert.deepEqual(rawTableRows(db, tables), original);
    }
  } finally {
    db.close();
  }
});

test('cancel control rejects a legacy v1 Attempt before any persisted mutation', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const fixture = installLegacyV1RuntimeFixture(db, {
      taskId: 'task:legacy-v1-cancel',
    });
    const tables = [
      'execution_scopes',
      'stage_run_launches',
      'stage_attempts',
      'stage_attempt_signals',
      'stage_attempt_closeouts',
      'stage_quality_cycles',
      'tasks',
      'events',
      'notifications',
    ];
    const original = rawTableRows(db, tables);
    expectFailureCode(() => markStageAttemptCancelRequested(db, {
      stageAttemptId: fixture.stageAttemptId,
      reason: 'forbidden legacy cancel',
      source: 'legacy-v1-test',
      temporalCancel: { cancellation_requested: true },
    }), 'runtime_execution_identity_unresolved');
    assert.deepEqual(rawTableRows(db, tables), original);
  } finally {
    db.close();
  }
});

test('domain-route single reconciliation admits the durable Attempt before task lookup', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const fixture = installLegacyV1RuntimeFixture(db, {
      taskId: 'task:legacy-v1-domain-route-single',
    });
    const tables = [
      'execution_scopes',
      'stage_run_launches',
      'stage_attempts',
      'tasks',
      'events',
      'notifications',
    ];
    const original = rawTableRows(db, tables);
    expectFailureCode(() => reconcileDomainRouteTerminalTaskForAttempt(db, {
      stageAttemptId: fixture.stageAttemptId,
      source: 'legacy-v1-test',
    }), 'runtime_execution_identity_unresolved');
    assert.deepEqual(rawTableRows(db, tables), original);
  } finally {
    db.close();
  }
});

test('domain-route batch admits every durable Attempt before writing any task in the batch', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    createFamilyRuntimeQueueTables(db);
    const currentTaskId = 'task:0-current-domain-route';
    const legacyTaskId = 'task:1-legacy-domain-route';
    insertRuntimeTask(db, { taskId: currentTaskId, domainId: 'redcube' });
    insertRuntimeTask(db, { taskId: legacyTaskId });
    const current = createStageAttempt(db, {
      domainId: 'redcube',
      stageId: 'artifact_creation',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/current-domain-route-batch' },
      taskId: currentTaskId,
      newAttempt: true,
    }).attempt;
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'completed', closeout_refs_json = '["artifact:current-domain-route"]',
        closeout_receipt_status = 'accepted_typed_closeout'
      WHERE stage_attempt_id = ?
    `).run(current.stage_attempt_id);
    const legacy = installLegacyV1RuntimeFixture(db, {
      stageRunId: 'sr-legacy-v1-domain-route-batch',
      stageAttemptId: 'sat-legacy-v1-domain-route-batch',
      taskId: legacyTaskId,
    });
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'completed', closeout_refs_json = '["artifact:legacy-domain-route"]',
        closeout_receipt_status = 'accepted_typed_closeout'
      WHERE stage_attempt_id = ?
    `).run(legacy.stageAttemptId);
    const durableTaskRows = db.prepare('SELECT * FROM tasks ORDER BY task_id').all() as FamilyRuntimeTaskRow[];
    const taskRows = durableTaskRows.map((row): FamilyRuntimeTaskRow => (
      row.task_id === legacyTaskId
        ? { ...row, status: 'succeeded' }
        : row
    ));
    const tables = [
      'execution_scopes',
      'stage_run_launches',
      'stage_attempts',
      'tasks',
      'events',
      'notifications',
    ];
    const original = rawTableRows(db, tables);
    expectFailureCode(() => reconcileDomainRouteTerminalTasks(
      db,
      taskRows,
      'legacy-v1-test',
    ), 'runtime_execution_identity_unresolved');
    assert.deepEqual(rawTableRows(db, tables), original);
  } finally {
    db.close();
  }
});

test('task batch admission rejects a mixed current and legacy v1 batch atomically', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    createFamilyRuntimeQueueTables(db);
    const current = createStageAttempt(db, {
      domainId: 'redcube',
      stageId: 'baseline',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/current-batch-attempt' },
      taskId: 'task:mixed-execution-scope',
      newAttempt: true,
    }).attempt;
    const legacy = installLegacyV1RuntimeFixture(db, {
      stageAttemptId: 'sat-legacy-v1-batch',
      stageRunId: 'sr-legacy-v1-batch',
      taskId: 'task:mixed-execution-scope',
    });
    const original = rawTableRows(db, ['stage_attempts']);
    expectFailureCode(() => updateStageAttemptsForTask(db, {
      taskId: 'task:mixed-execution-scope',
      stageAttemptIds: [current.stage_attempt_id, legacy.stageAttemptId],
      status: 'running',
      incrementAttempt: true,
    }), 'runtime_execution_identity_unresolved');
    assert.deepEqual(rawTableRows(db, ['stage_attempts']), original);
  } finally {
    db.close();
  }
});

test('Temporal reconciliation does not query or emit an event for legacy v1 Attempts', async () => {
  await withDb(async (db) => {
    installLegacyV1RuntimeFixture(db);
    const original = rawTableRows(db, ['stage_attempts', 'events']);
    let queryCalls = 0;
    const report = await reconcileTemporalStageAttemptRuntimeObservations(db, { root: '/tmp' }, {
      trigger: 'provider_slo_tick',
      now: () => '2026-07-21T00:02:00.000Z',
      queryTemporalStageAttemptReadModel: async () => {
        queryCalls += 1;
        return {};
      },
    });
    assert.equal(queryCalls, 0);
    assert.equal(report.identity_unresolved_total, 1);
    assert.equal(report.selected_total, 0);
    assert.equal(report.event_id, null);
    assert.deepEqual(rawTableRows(db, ['stage_attempts', 'events']), original);
  });
});

test('legacy v1 StageRun blocks Attempt and quality-cycle writes before any business mutation', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const fixture = installLegacyV1RuntimeFixture(db);
    const originalAttempts = rawTableRows(db, ['stage_attempts']);
    expectFailureCode(() => createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: fixture.stageId,
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: fixture.scope.workspace_root },
      stageRunId: fixture.stageRunId,
      newAttempt: true,
    }), 'runtime_execution_identity_unresolved');
    assert.deepEqual(rawTableRows(db, ['stage_attempts']), originalAttempts);

    const emptyCycles = rawTableRows(db, ['stage_quality_cycles']);
    expectFailureCode(() => createStageQualityCycle(db, {
      qualityCycleId: 'sqc-legacy-v1-audit',
      stageRunId: fixture.stageRunId,
      domainId: 'medautoscience',
      stageId: fixture.stageId,
      policy: { formal_review: { required: true, risk_tier: 'high' } },
    }), 'runtime_execution_identity_unresolved');
    assert.deepEqual(rawTableRows(db, ['stage_quality_cycles']), emptyCycles);

    const now = '2026-07-21T00:00:00.000Z';
    db.prepare(`
      INSERT INTO stage_quality_cycles(
        quality_cycle_id, stage_run_id, domain_id, stage_id, policy_json, state_json,
        current_attempt_ref, created_at, updated_at
      ) VALUES (?, ?, ?, ?, '{}', '{}', NULL, ?, ?)
    `).run('sqc-legacy-v1-audit', fixture.stageRunId, 'medautoscience', fixture.stageId, now, now);
    const originalCycle = rawTableRows(db, ['stage_quality_cycles']);
    expectFailureCode(() => markStageQualityCycleCurrentAttempt(db, {
      qualityCycleId: 'sqc-legacy-v1-audit',
      attemptRef: `opl://stage_attempts/${fixture.stageAttemptId}`,
    }), 'runtime_execution_identity_unresolved');
    expectFailureCode(() => projectTemporalStageRunQualityCycle(db, {
      quality_cycle_id: 'sqc-legacy-v1-audit',
    } as TemporalStageRunWorkflowState), 'runtime_execution_identity_unresolved');
    assert.deepEqual(rawTableRows(db, ['stage_quality_cycles']), originalCycle);
  } finally {
    db.close();
  }
});
