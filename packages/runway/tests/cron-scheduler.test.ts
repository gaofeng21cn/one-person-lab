import assert from 'node:assert/strict';
import test from 'node:test';
import { openSqliteStore } from '@opl/core';
import { queryTimeline } from '@opl/ledger';
import { ensureWorkspaceSchema } from '@opl/workspace';
import {
  RunwayError,
  ScheduleRunner,
  SqliteRunwayStore,
  computeNextCronTime,
  ensureRunwaySchema,
  normalizeOverlapPolicy,
  parseCronExpr,
} from '../src/index.ts';
import { createRunwayTestEnv } from './helpers/test-db.ts';

test('Cron parser, macros, timezone validation, and alias normalization', () => {
  const hourly = parseCronExpr('@hourly');
  assert.ok(hourly.minutes.has(0));
  assert.equal(hourly.minutes.size, 1);

  const nextUtc = computeNextCronTime('*/15 * * * *', 'UTC', new Date('2026-11-25T10:07:00Z'));
  assert.equal(nextUtc, '2026-11-25T10:15:00.000Z');

  const nextNy = computeNextCronTime('0 9 * * 1-5', 'America/New_York', new Date('2026-11-25T13:00:00Z'));
  assert.ok(new Date(nextNy).getTime() > new Date('2026-11-25T13:00:00Z').getTime());

  assert.throws(
    () => parseCronExpr('invalid cron'),
    (err: unknown) => err instanceof RunwayError && err.code === 'INVALID_INPUT',
  );
  assert.throws(
    () => computeNextCronTime('* * * * *', 'Mars/Olympus'),
    (err: unknown) => err instanceof RunwayError && err.code === 'INVALID_INPUT',
  );

  assert.equal(normalizeOverlapPolicy('skip'), 'skip');
  assert.equal(normalizeOverlapPolicy('buffer_one'), 'buffer_one');
  assert.equal(normalizeOverlapPolicy('queue'), 'buffer_one');
  assert.equal(normalizeOverlapPolicy('cancel_other'), 'cancel_other');
  assert.equal(normalizeOverlapPolicy('allow'), 'cancel_other');

  // DST Spring Forward: 2026-03-08 -> 2026-03-09 in America/New_York (23-hour day must not skip 00:30 EDT)
  assert.equal(
    computeNextCronTime('30 0 * * 1', 'America/New_York', new Date('2026-03-08T04:59:00Z')),
    '2026-03-09T04:30:00.000Z',
  );
  assert.equal(
    computeNextCronTime('0 0 * * *', 'America/New_York', new Date('2026-03-08T05:00:00Z')),
    '2026-03-09T04:00:00.000Z',
  );
});

test('Guardrail 4: persistent overlap policies (skip, buffer_one across restart, cancel_other) and wake-from-sleep cap', async (t) => {
  const env = createRunwayTestEnv();
  t.after(() => env.cleanup());

  const cancelledInRuntime: Array<{ taskId: string; reason: string }> = [];
  const runner = new ScheduleRunner({
    store: env.store,
    tickIntervalMs: 25,
    onCancelTask: (taskId, reason) => {
      cancelledInRuntime.push({ taskId, reason });
    },
  });

  // 1. skip policy
  const schSkip = env.store.upsertSchedule({
    schedule_id: 'sch-skip',
    workspace_id: env.workspaceId,
    cron_expr: '* * * * *',
    timezone: 'UTC',
    overlap_policy: 'skip',
    payload: { title: 'Skip Job', goal_prompt: 'Run skip' },
    next_run_at: '2026-11-25T10:00:00.000Z',
  });
  assert.equal(schSkip.overlap_policy, 'skip');

  const tick1 = await runner.tickOnce(new Date('2026-11-25T10:00:30.000Z'));
  assert.equal(tick1.length, 1);
  assert.equal(tick1[0]!.action, 'launched');
  const firstTaskId = tick1[0]!.created_task_id!;

  // Wake-from-sleep: jump 3 hours ahead (180 missed 1-minute intervals!) while first task is active
  const tick2 = await runner.tickOnce(new Date('2026-11-25T13:00:30.000Z'));
  assert.equal(tick2.length, 1);
  assert.equal(tick2[0]!.action, 'skipped_overlap');
  assert.equal(tick2[0]!.created_task_id, null);
  assert.equal(tick2[0]!.next_run_at, '2026-11-25T13:01:00.000Z');

  // Complete first task -> wake-from-sleep cap on next due window launches AT MOST 1 catch-up run
  env.store.updateTaskStatus({ task_id: firstTaskId, status: 'completed' });
  const tick3 = await runner.tickOnce(new Date('2026-11-25T16:00:30.000Z'));
  assert.equal(tick3.length, 1);
  assert.equal(tick3[0]!.action, 'launched');
  assert.equal(tick3[0]!.next_run_at, '2026-11-25T16:01:00.000Z');
  env.store.updateTaskStatus({ task_id: tick3[0]!.created_task_id!, status: 'completed' });
  env.store.toggleSchedule('sch-skip', false);

  // 2. buffer_one (via 'queue' alias) persisted across DB close/reopen
  const schBuf = env.store.upsertSchedule({
    schedule_id: 'sch-buf',
    workspace_id: env.workspaceId,
    cron_expr: '* * * * *',
    timezone: 'UTC',
    overlap_policy: 'queue',
    payload: { title: 'Buffered Job', goal_prompt: 'Run buffered' },
    next_run_at: '2026-11-25T10:00:00.000Z',
  });
  assert.equal(schBuf.overlap_policy, 'buffer_one');

  const bufLaunch = await runner.tickOnce(new Date('2026-11-25T10:00:05.000Z'));
  const bufTask1 = bufLaunch[0]!.created_task_id!;

  // Trigger multiple missed ticks while task1 is active -> buffered_pending stays capped at 1
  const bufOverlap1 = await runner.tickOnce(new Date('2026-11-25T10:05:05.000Z'));
  assert.equal(bufOverlap1[0]!.action, 'buffered_one');
  assert.equal(bufOverlap1[0]!.buffered_pending, 1);
  const bufOverlap2 = await runner.tickOnce(new Date('2026-11-25T10:10:05.000Z'));
  assert.equal(bufOverlap2[0]!.buffered_pending, 1);

  // Close & reopen DB to verify buffered_pending survives restart
  env.db.close();
  const db2 = openSqliteStore(env.dbPath);
  t.after(() => {
    try {
      db2.close();
    } catch {
      // ignore
    }
  });
  ensureWorkspaceSchema(db2);
  ensureRunwaySchema(db2);
  const store2 = new SqliteRunwayStore({ db: db2 });
  const runner2 = new ScheduleRunner({ store: store2 });

  assert.equal(store2.getSchedule('sch-buf').buffered_pending, 1);
  store2.updateTaskStatus({ task_id: bufTask1, status: 'completed' });

  // Next tick before next_run_at (10:10:30 < 10:11:00) drains the 1 buffered run!
  const drained = await runner2.tickOnce(new Date('2026-11-25T10:10:30.000Z'));
  assert.equal(drained.length, 1);
  assert.equal(drained[0]!.action, 'launched');
  assert.equal(drained[0]!.buffered_pending, 0);
  assert.ok(drained[0]!.created_task_id && drained[0]!.created_task_id !== bufTask1);
  store2.updateTaskStatus({ task_id: drained[0]!.created_task_id!, status: 'completed' });
  store2.toggleSchedule('sch-buf', false);

  // 3. cancel_other (via 'allow' alias)
  const schCancel = store2.upsertSchedule({
    schedule_id: 'sch-cancel',
    workspace_id: env.workspaceId,
    cron_expr: '* * * * *',
    timezone: 'UTC',
    overlap_policy: 'allow',
    payload: { title: 'Cancel Other Job', goal_prompt: 'Cancel prior' },
    next_run_at: '2026-11-25T11:00:00.000Z',
  });
  assert.equal(schCancel.overlap_policy, 'cancel_other');

  const cancelledHits: string[] = [];
  const runner3 = new ScheduleRunner({
    store: store2,
    tickIntervalMs: 25,
    onCancelTask: (taskId) => {
      cancelledHits.push(taskId);
    },
  });
  const c1 = await runner3.tickOnce(new Date('2026-11-25T11:00:05.000Z'));
  const prevId = c1[0]!.created_task_id!;

  const c2 = await runner3.tickOnce(new Date('2026-11-25T11:05:05.000Z'));
  assert.equal(c2.length, 1);
  assert.equal(c2[0]!.action, 'cancelled_other_and_launched');
  assert.equal(c2[0]!.cancelled_task_id, prevId);
  assert.ok(c2[0]!.created_task_id && c2[0]!.created_task_id !== prevId);
  assert.equal(store2.getTask(prevId).status, 'cancelled');
  assert.deepEqual(cancelledHits, [prevId]);
  assert.ok(
    queryTimeline(db2, { task_id: prevId }).some((e) => e.entry_kind === 'human_decision'),
  );
  store2.toggleSchedule('sch-cancel', false);

  // 4. Live interval tick via start() / stop()
  const launchedLive: string[] = [];
  store2.upsertSchedule({
    schedule_id: 'sch-live',
    workspace_id: env.workspaceId,
    cron_expr: '* * * * *',
    timezone: 'UTC',
    overlap_policy: 'skip',
    payload: { title: 'Live Tick Job', goal_prompt: 'Live tick' },
    next_run_at: '2020-01-01T00:00:00.000Z',
  });
  const liveRunner = new ScheduleRunner({
    store: store2,
    tickIntervalMs: 25,
    onTaskLaunched: (taskId) => {
      launchedLive.push(taskId);
    },
  });
  liveRunner.start();
  assert.equal(liveRunner.running, true);
  for (let i = 0; i < 40 && launchedLive.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  liveRunner.stop();
  assert.equal(liveRunner.running, false);
  assert.equal(launchedLive.length, 1);

  // 5. upsertSchedule normalizes non-UTC offsets (+08:00) to UTC ISO string and rejects invalid timestamps
  const tzSchedule = store2.upsertSchedule({
    schedule_id: 'sch-offset',
    workspace_id: env.workspaceId,
    cron_expr: '0 10 * * *',
    timezone: 'Asia/Shanghai',
    overlap_policy: 'skip',
    payload: { title: 'Offset Job', goal_prompt: 'Verify +08:00 normalization' },
    next_run_at: '2026-11-25T10:00:00+08:00',
  });
  assert.equal(tzSchedule.next_run_at, '2026-11-25T02:00:00.000Z');
  const tzTick = await new ScheduleRunner({ store: store2 }).tickOnce(new Date('2026-11-25T02:05:00.000Z'));
  assert.equal(tzTick.length, 1);
  assert.equal(tzTick[0]!.schedule_id, 'sch-offset');
  assert.equal(tzTick[0]!.action, 'launched');
  store2.toggleSchedule('sch-offset', false);

  assert.throws(
    () =>
      store2.upsertSchedule({
        workspace_id: env.workspaceId,
        cron_expr: '* * * * *',
        next_run_at: 'not-a-valid-date',
      }),
    (err: unknown) => err instanceof RunwayError && err.code === 'INVALID_INPUT',
  );

  void cancelledInRuntime;
});

test('Regression (E2E-M4/M6 2e): cancel_other cancels all non-paused active tasks in workspace while preserving paused_by_human sovereignty', async (t) => {
  const env = createRunwayTestEnv();
  t.after(() => env.cleanup());

  const cancelledHooks: string[] = [];
  const runner = new ScheduleRunner({
    store: env.store,
    onCancelTask: (taskId) => {
      cancelledHooks.push(taskId);
    },
  });

  // Two independent active tasks in the same workspace (not created by schedule)
  const manualA = env.store.createTask({
    workspace_id: env.workspaceId,
    title: 'Manual A',
    goal_prompt: 'Independent task A',
  });
  const manualB = env.store.createTask({
    workspace_id: env.workspaceId,
    title: 'Manual B',
    goal_prompt: 'Independent task B',
  });

  env.store.upsertSchedule({
    schedule_id: 'sch-cancel-ws',
    workspace_id: env.workspaceId,
    cron_expr: '* * * * *',
    timezone: 'UTC',
    overlap_policy: 'cancel_other',
    payload: { title: 'WS Sweep', goal_prompt: 'Cancel workspace active tasks' },
    next_run_at: '2026-11-25T12:00:00.000Z',
  });

  const tick1 = await runner.tickOnce(new Date('2026-11-25T12:00:05.000Z'));
  assert.equal(tick1.length, 1);
  assert.equal(tick1[0]!.action, 'cancelled_other_and_launched');
  assert.deepEqual(tick1[0]!.cancelled_task_ids, [manualA.task_id, manualB.task_id]);
  assert.equal(tick1[0]!.cancelled_task_id, manualA.task_id);
  assert.deepEqual(cancelledHooks, [manualA.task_id, manualB.task_id]);
  assert.equal(env.store.getTask(manualA.task_id).status, 'cancelled');
  assert.equal(env.store.getTask(manualB.task_id).status, 'cancelled');

  // If a paused_by_human task exists in the workspace, cancel_other MUST NOT cancel it
  const createdId = tick1[0]!.created_task_id!;
  env.store.pauseTaskAtomic({ task_id: createdId, reason: 'human sovereign pause' });
  const tick2 = await runner.tickOnce(new Date('2026-11-25T12:05:05.000Z'));
  assert.equal(tick2.length, 1);
  assert.equal(tick2[0]!.action, 'skipped_overlap');
  assert.equal(tick2[0]!.created_task_id, null);
  assert.equal(env.store.getTask(createdId).status, 'paused_by_human');
});

test('ScheduleRunner arms with zero active timers when idle and activates on demand when woken', () => {
  const env = createRunwayTestEnv();
  try {
    const runner = new ScheduleRunner({ store: env.store, tickIntervalMs: 50 });
    runner.start();
    assert.equal(runner.running, true);
    assert.equal(runner.getHealth().status, 'running');
    assert.equal(runner.hasActiveTimer, false);

    env.store.upsertSchedule({
      schedule_id: 'sch-ondemand',
      workspace_id: env.workspaceId,
      cron_expr: '* * * * *',
      timezone: 'UTC',
      payload: { title: 'On Demand', goal_prompt: 'Wake timer' },
      next_run_at: '2099-01-01T00:00:00.000Z',
    });
    runner.wake();
    assert.equal(runner.hasActiveTimer, true);

    env.store.toggleSchedule('sch-ondemand', false);
    runner.wake();
    assert.equal(runner.hasActiveTimer, false);
    runner.stop();
    assert.equal(runner.running, false);
  } finally {
    env.cleanup();
  }
});
