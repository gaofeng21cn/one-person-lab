import assert from 'node:assert/strict';
import test from 'node:test';
import { LedgerError, queryTimeline } from '@opl/ledger';
import { RunwayError } from '../src/index.ts';
import { createRunwayTestEnv } from './helpers/test-db.ts';

test('Guardrail 1: SQLite WAL 5 pragmas, DQS=0 enforcement, and 12+1 schema tables', (t) => {
  const env = createRunwayTestEnv();
  t.after(() => env.cleanup());

  const health = env.store.healthCheck();
  assert.equal(health.ok, true);
  assert.equal(health.journal_mode, 'wal');
  assert.equal(health.foreign_keys, 1);
  assert.equal(health.busy_timeout, 5000);

  // DQS=0 must reject double-quoted string literals at runtime
  assert.throws(() => {
    env.db.prepare('SELECT "bad_double_quote" AS x').get();
  });

  const tables = env.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as Array<{ name: string }>;
  const names = new Set(tables.map((r) => r.name));
  for (const required of [
    'schema_migrations',
    'workspaces',
    'knowledge_sources',
    'knowledge_snapshots',
    'installed_packages',
    'package_operations',
    'connections',
    'connection_grants',
    'tasks',
    'stage_runs',
    'attempts',
    'ledger_entries',
    'schedules',
  ]) {
    assert.ok(names.has(required), `Missing required table: ${required}`);
  }

  const schedCols = env.db.prepare('PRAGMA table_info(schedules)').all() as Array<{ name: string }>;
  const schedColNames = new Set(schedCols.map((c) => c.name));
  assert.ok(schedColNames.has('buffered_pending'));
  assert.ok(schedColNames.has('last_status'));
});

test('Guardrail 1: atomic Runway + Ledger commit, REVISION_CONFLICT rollback, REFS_ONLY rollback, zero leaked events', (t) => {
  const env = createRunwayTestEnv();
  t.after(() => env.cleanup());

  const bundle = env.store.createTask({
    workspace_id: env.workspaceId,
    agent_id: 'mas',
    title: 'Atomic Tx Task',
    goal_prompt: 'Verify atomic Runway + Ledger commits',
    stages: [{ stage_id: 'analysis', executor_id: 'codex', model_id: 'gpt-5-codex' }],
  });
  const sr = bundle.stage_runs[0]!;
  const att = env.store.createAttempt({
    stage_run_id: sr.stage_run_id,
    expected_stage_revision: sr.revision,
    role: 'producer',
    executor_id: 'codex',
    lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
  });

  const eventsBefore = env.events.length;
  const ledgerBefore = env.ledgerEvents.length;
  const mutatesBefore = env.mutateCount.value;

  // 1. Stale revision must throw REVISION_CONFLICT and roll back BOTH stage/attempt AND ledger_entries + emit ZERO events
  assert.throws(
    () => {
      env.store.commitStageTransitionAtomic({
        stage_run_id: sr.stage_run_id,
        expected_revision: 999,
        next_stage_status: 'completed',
        task_status: 'completed',
        attempt_update: { attempt_id: att.attempt.attempt_id, status: 'succeeded' },
        ledger_entries: [
          {
            task_id: bundle.task_id,
            stage_run_id: sr.stage_run_id,
            attempt_id: att.attempt.attempt_id,
            entry_kind: 'artifact_ref',
            owner_id: 'mas',
            payload: { path: 'should_rollback.md', sha256: 'sha256:aaa' },
          },
        ],
      });
    },
    (err: unknown) => err instanceof RunwayError && err.code === 'REVISION_CONFLICT',
  );
  assert.equal(env.events.length, eventsBefore);
  assert.equal(env.ledgerEvents.length, ledgerBefore);
  assert.equal(env.mutateCount.value, mutatesBefore);
  assert.equal(queryTimeline(env.db, { task_id: bundle.task_id }).length, 0);

  // 2. Ledger REFS_ONLY violation (oversized payload / inline content) must roll back stage_run & attempt too!
  const oversizedText = 'x'.repeat(25_000);
  assert.throws(
    () => {
      env.store.commitStageTransitionAtomic({
        stage_run_id: sr.stage_run_id,
        expected_revision: att.stage_run.revision,
        next_stage_status: 'completed',
        task_status: 'completed',
        attempt_update: { attempt_id: att.attempt.attempt_id, status: 'succeeded' },
        ledger_entries: [
          {
            task_id: bundle.task_id,
            stage_run_id: sr.stage_run_id,
            attempt_id: att.attempt.attempt_id,
            entry_kind: 'artifact_ref',
            owner_id: 'mas',
            payload: { path: 'bad.md', content: oversizedText },
          },
        ],
      });
    },
    (err: unknown) => err instanceof LedgerError,
  );
  assert.equal(env.store.getStageRun(sr.stage_run_id).status, 'running');
  assert.equal(env.store.getAttempt(att.attempt.attempt_id).status, 'running');
  assert.equal(env.events.length, eventsBefore);
  assert.equal(env.ledgerEvents.length, ledgerBefore);

  // 3. Valid commit persists stage + attempt + ledger atomically and emits events post-COMMIT
  const committed = env.store.commitStageTransitionAtomic({
    stage_run_id: sr.stage_run_id,
    expected_revision: att.stage_run.revision,
    next_stage_status: 'completed',
    task_status: 'completed',
    attempt_update: { attempt_id: att.attempt.attempt_id, status: 'succeeded' },
    ledger_entries: [
      {
        task_id: bundle.task_id,
        stage_run_id: sr.stage_run_id,
        attempt_id: att.attempt.attempt_id,
        entry_kind: 'artifact_ref',
        owner_id: 'mas',
        payload: { path: 'analysis/plan.md', sha256: 'sha256:abc123' },
      },
    ],
  });
  assert.equal(committed.stage_run.status, 'completed');
  assert.equal(committed.stage_run.revision, att.stage_run.revision + 1);
  assert.equal(committed.task.status, 'completed');
  assert.equal(committed.attempt?.status, 'succeeded');
  assert.equal(committed.ledger_entries.length, 1);
  assert.equal(env.events.length, eventsBefore + 1);
  assert.equal(env.ledgerEvents.length, ledgerBefore + 1);
});

test('Human gate resolution and task pause/resume/cancel atomic controls', (t) => {
  const env = createRunwayTestEnv();
  t.after(() => env.cleanup());

  const bundle = env.store.createTask({
    workspace_id: env.workspaceId,
    agent_id: 'mas',
    title: 'Control Task',
    goal_prompt: 'Test pause/resume/humanGate/cancel',
  });
  const sr = bundle.stage_runs[0]!;

  // Move stage to human_gate
  const gated = env.store.commitStageTransitionAtomic({
    stage_run_id: sr.stage_run_id,
    expected_revision: sr.revision,
    next_stage_status: 'human_gate',
    human_gate_json: JSON.stringify({ question: 'Proceed?' }),
    task_status: 'awaiting_human',
    ledger_entries: [
      {
        task_id: bundle.task_id,
        stage_run_id: sr.stage_run_id,
        entry_kind: 'typed_blocker',
        owner_id: 'opl.runway',
        payload: { code: 'approval_needed', summary: 'Proceed?' },
      },
    ],
  });

  // Stale expected_revision fails
  assert.throws(
    () =>
      env.store.resolveHumanGateAtomic({
        stage_run_id: sr.stage_run_id,
        decision: 'approve',
        expected_revision: gated.stage_run.revision - 1,
      }),
    (err: unknown) => err instanceof RunwayError && err.code === 'REVISION_CONFLICT',
  );

  // Valid resolve transitions human_gate -> queued and writes human_decision
  const resolved = env.store.resolveHumanGateAtomic({
    stage_run_id: sr.stage_run_id,
    decision: 'approve',
    expected_revision: gated.stage_run.revision,
    actor_id: 'human_pi',
    notes: 'Looks good',
  });
  assert.equal(resolved.status, 'queued');
  assert.equal(resolved.revision, gated.stage_run.revision + 1);
  assert.equal(env.store.getTask(bundle.task_id).status, 'active');

  // Pause & Resume
  const paused = env.store.pauseTaskAtomic({ task_id: bundle.task_id, reason: 'weekend break' });
  assert.equal(paused.status, 'paused_by_human');
  assert.equal(paused.stage_runs[0]!.status, 'paused_by_human');

  const resumed = env.store.resumeTaskAtomic({ task_id: bundle.task_id, reason: 'back' });
  assert.equal(resumed.status, 'active');
  assert.equal(resumed.stage_runs[0]!.status, 'queued');

  const cancelled = env.store.cancelTaskAtomic({ task_id: bundle.task_id, reason: 'obsolete' });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.stage_runs[0]!.status, 'cancelled');
});

test('Regression: resolveHumanGateAtomic, resumeTaskAtomic, and cancelTaskAtomic enforce state machine invariants', (t) => {
  const env = createRunwayTestEnv();
  t.after(() => env.cleanup());

  const b1 = env.store.createTask({
    workspace_id: env.workspaceId,
    title: 'State Guards',
    goal_prompt: 'Verify state validation and running attempt convergence',
  });
  const sr1 = b1.stage_runs[0]!;

  // 1. resolveHumanGateAtomic rejects 'queued' and 'running' stages
  assert.throws(
    () =>
      env.store.resolveHumanGateAtomic({
        stage_run_id: sr1.stage_run_id,
        decision: 'approve',
      }),
    (err: unknown) => err instanceof RunwayError && err.code === 'INVALID_STAGE_STATE',
  );

  const att1 = env.store.createAttempt({
    stage_run_id: sr1.stage_run_id,
    expected_stage_revision: sr1.revision,
    role: 'producer',
    executor_id: 'codex',
    lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.throws(
    () =>
      env.store.resolveHumanGateAtomic({
        stage_run_id: sr1.stage_run_id,
        decision: 'approve',
      }),
    (err: unknown) => err instanceof RunwayError && err.code === 'INVALID_STAGE_STATE',
  );

  // Pause and resume while att1 is running -> resumeTaskAtomic must mark att1 'interrupted'
  env.store.pauseTaskAtomic({ task_id: b1.task_id, reason: 'pause running' });
  env.store.resumeTaskAtomic({ task_id: b1.task_id, reason: 'resume running' });
  const att1After = env.store.getAttempt(att1.attempt.attempt_id);
  assert.equal(att1After.status, 'interrupted');
  assert.ok(att1After.finished_at);

  const sr1AfterResume = env.store.getStageRun(sr1.stage_run_id);
  const att2 = env.store.createAttempt({
    stage_run_id: sr1.stage_run_id,
    expected_stage_revision: sr1AfterResume.revision,
    role: 'producer',
    executor_id: 'codex',
    lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  const runningRows = env.db
    .prepare("SELECT COUNT(*) AS c FROM attempts WHERE stage_run_id = ? AND status = 'running'")
    .get(sr1.stage_run_id) as { c: number };
  assert.equal(runningRows.c, 1);

  // Cancel task while att2 is running -> att2 must become 'cancelled' in same tx
  env.store.cancelTaskAtomic({ task_id: b1.task_id, reason: 'cancel active' });
  assert.equal(env.store.getAttempt(att2.attempt.attempt_id).status, 'cancelled');
  assert.ok(env.store.getAttempt(att2.attempt.attempt_id).finished_at);

  // resolveHumanGateAtomic rejects 'cancelled' stage
  assert.throws(
    () =>
      env.store.resolveHumanGateAtomic({
        stage_run_id: sr1.stage_run_id,
        decision: 'approve',
      }),
    (err: unknown) => err instanceof RunwayError && err.code === 'INVALID_STAGE_STATE',
  );

  // 2. Completed and failed tasks reject cancelTaskAtomic & completed stages reject resolveHumanGateAtomic
  const b2 = env.store.createTask({
    workspace_id: env.workspaceId,
    title: 'Terminal Task',
    goal_prompt: 'Completed stage cannot be cancelled or gate-resolved',
  });
  const sr2 = b2.stage_runs[0]!;
  const attDone = env.store.createAttempt({
    stage_run_id: sr2.stage_run_id,
    expected_stage_revision: sr2.revision,
    role: 'producer',
    executor_id: 'codex',
    lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  env.store.commitStageTransitionAtomic({
    stage_run_id: sr2.stage_run_id,
    expected_revision: attDone.stage_run.revision,
    next_stage_status: 'completed',
    task_status: 'completed',
    attempt_update: { attempt_id: attDone.attempt.attempt_id, status: 'succeeded' },
    ledger_entries: [],
  });

  assert.throws(
    () =>
      env.store.resolveHumanGateAtomic({
        stage_run_id: sr2.stage_run_id,
        decision: 'approve',
      }),
    (err: unknown) => err instanceof RunwayError && err.code === 'INVALID_STAGE_STATE',
  );
  assert.throws(
    () => env.store.cancelTaskAtomic({ task_id: b2.task_id, reason: 'too late' }),
    (err: unknown) => err instanceof RunwayError && err.code === 'INVALID_TASK_STATE',
  );

  const b3 = env.store.createTask({
    workspace_id: env.workspaceId,
    title: 'Failed Task',
    goal_prompt: 'Failed task cannot be cancelled',
  });
  env.store.updateTaskStatus({ task_id: b3.task_id, status: 'failed' });
  assert.throws(
    () => env.store.cancelTaskAtomic({ task_id: b3.task_id, reason: 'already failed' }),
    (err: unknown) => err instanceof RunwayError && err.code === 'INVALID_TASK_STATE',
  );
});

test('Regression (Iter 3): resolveHumanGateAtomic on paused_by_human converges lingering running attempts cleanly', (t) => {
  const env = createRunwayTestEnv();
  t.after(() => env.cleanup());

  // 1. approve -> queued converges lingering 'running' attempt to 'interrupted' with finished_at
  const bApprove = env.store.createTask({
    workspace_id: env.workspaceId,
    title: 'HumanGate Paused Approve',
    goal_prompt: 'Verify lingering running attempt becomes interrupted',
  });
  const srApprove = bApprove.stage_runs[0]!;
  const attApprove = env.store.createAttempt({
    stage_run_id: srApprove.stage_run_id,
    expected_stage_revision: srApprove.revision,
    role: 'producer',
    executor_id: 'codex',
    lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  env.store.pauseTaskAtomic({ task_id: bApprove.task_id, reason: 'pause directly' });

  const resolvedApprove = env.store.resolveHumanGateAtomic({
    stage_run_id: srApprove.stage_run_id,
    decision: 'approve',
    actor_id: 'human_reviewer',
  });
  assert.equal(resolvedApprove.status, 'queued');
  const attApproveAfter = env.store.getAttempt(attApprove.attempt.attempt_id);
  assert.equal(attApproveAfter.status, 'interrupted');
  assert.ok(attApproveAfter.finished_at);

  // 2. reject -> cancelled converges lingering 'running' attempt to 'cancelled' with finished_at
  const bReject = env.store.createTask({
    workspace_id: env.workspaceId,
    title: 'HumanGate Paused Reject',
    goal_prompt: 'Verify lingering running attempt becomes cancelled',
  });
  const srReject = bReject.stage_runs[0]!;
  const attReject = env.store.createAttempt({
    stage_run_id: srReject.stage_run_id,
    expected_stage_revision: srReject.revision,
    role: 'producer',
    executor_id: 'codex',
    lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  env.store.pauseTaskAtomic({ task_id: bReject.task_id, reason: 'pause before reject' });

  const resolvedReject = env.store.resolveHumanGateAtomic({
    stage_run_id: srReject.stage_run_id,
    decision: 'reject',
    actor_id: 'human_reviewer',
  });
  assert.equal(resolvedReject.status, 'cancelled');
  const attRejectAfter = env.store.getAttempt(attReject.attempt.attempt_id);
  assert.equal(attRejectAfter.status, 'cancelled');
  assert.ok(attRejectAfter.finished_at);
});

test('Regression (E2E-M4/M6 2c): resolveHumanGateAtomic checks expected_revision (-32009) before sr.status (-32602)', (t) => {
  const env = createRunwayTestEnv();
  t.after(() => env.cleanup());

  const bundle = env.store.createTask({
    workspace_id: env.workspaceId,
    title: 'Revision Precedence',
    goal_prompt: 'Check expected_revision before INVALID_STAGE_STATE',
  });
  const sr = bundle.stage_runs[0]!;

  // Stage is 'queued' (not human_gate) AND expected_revision is stale -> MUST throw REVISION_CONFLICT (-32009)
  assert.throws(
    () =>
      env.store.resolveHumanGateAtomic({
        stage_run_id: sr.stage_run_id,
        decision: 'approve',
        expected_revision: sr.revision + 99,
      }),
    (err: unknown) =>
      err instanceof RunwayError && err.code === 'REVISION_CONFLICT' && err.rpcCode === -32009,
  );

  // Stage is 'queued' AND expected_revision matches (or omitted) -> MUST throw INVALID_STAGE_STATE (-32602)
  assert.throws(
    () =>
      env.store.resolveHumanGateAtomic({
        stage_run_id: sr.stage_run_id,
        decision: 'approve',
        expected_revision: sr.revision,
      }),
    (err: unknown) =>
      err instanceof RunwayError && err.code === 'INVALID_STAGE_STATE' && err.rpcCode === -32602,
  );

  const errInvalidTask = new RunwayError('INVALID_TASK_STATE', 'invalid task state');
  assert.equal(errInvalidTask.rpcCode, -32602);
});
