import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { queryTimeline } from '@opl/ledger';
import {
  AntigravityExecutorAdapter,
  CodexExecutorAdapter,
  ExecutorRegistry,
  RunwayError,
  RunwayRuntime,
  ScheduleRunner,
  analyzeCodexSessionJsonl,
  computeNextCronTime,
  parseAgyStreamJsonLine,
  type ExecutorAdapter,
  type ExecutorCapabilities,
} from '../src/index.ts';
import { createRunwayTestEnv } from './helpers/test-db.ts';

function makeMockAdapter(
  executorId: string,
  opts: {
    execute?: ExecutorAdapter['execute'];
    reconcile?: ExecutorAdapter['reconcile'];
  },
): ExecutorAdapter {
  const capabilities: ExecutorCapabilities = {
    executor_id: executorId,
    display_name: `Mock ${executorId}`,
    supports_streaming: true,
    supports_session_resume: true,
    supports_reconcile_after_restart: true,
    supports_mcp_tools: false,
    supports_sandbox_modes: ['read-only', 'workspace-write'],
    models: [{ id: 'mock-1', label: 'Mock 1', default: true }],
  };
  return {
    capabilities,
    async healthCheck() {
      return { available: true, version: 'mock-1.0' };
    },
    execute: opts.execute ?? (async () => ({ status: 'succeeded', artifact_refs: [] })),
    reconcile: opts.reconcile ?? (async () => ({ state: 'lost' })),
  };
}

test('T5-RUNWAY-01 (G-RUNWAY-01 / BUG-P1-01): sanitizes & truncates long, blank, and secret-bearing error messages in executeStage and reconcile', async (t) => {
  const env = createRunwayTestEnv();
  t.after(() => env.cleanup());

  const badMessages = [
    'X'.repeat(2500),
    'Auth failed with token sk-ant-api03-abcd1234_efgh5678_ijkl9012 and Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig123',
    '   \n\t  ',
  ];

  for (const [idx, badMsg] of badMessages.entries()) {
    const reg = new ExecutorRegistry();
    reg.register(
      makeMockAdapter(`fail_exec_${idx}`, {
        execute: async () => ({
          status: 'failed',
          artifact_refs: [],
          error: { code: 'MOCK_FAIL', message: badMsg, retryable: true },
        }),
      }),
    );
    const runtime = new RunwayRuntime({
      db: env.db,
      store: env.store,
      registry: reg,
      workspaceService: env.workspaceService,
    });
    const task = env.store.createTask({
      workspace_id: env.workspaceId,
      title: `Fail-${idx}`,
      goal_prompt: 'Verify sanitization',
      stages: [{ stage_id: 's1', executor_id: `fail_exec_${idx}` }],
    });
    const res = await runtime.executeStage(task.stage_runs[0]!.stage_run_id);
    assert.equal(res.stage_run.status, 'human_gate');
    assert.equal(res.task.status, 'awaiting_human');

    const tl = queryTimeline(env.db, { task_id: task.task_id });
    const serialized = JSON.stringify(tl);
    assert.equal(serialized.includes('sk-ant-api03-'), false);
    assert.equal(serialized.includes('eyJhbGciOiJIUzI1NiJ9'), false);
    const blocker = tl.find((e) => e.entry_kind === 'typed_blocker');
    assert.ok(blocker);
    assert.ok((blocker.payload as { summary: string }).summary.length <= 2048);
  }

  // Also test cold-boot reconcile() path with >2048 char + secret error message
  const regRec = new ExecutorRegistry();
  regRec.register(
    makeMockAdapter('fail_rec', {
      reconcile: async () => ({
        state: 'failed',
        outcome: {
          status: 'failed',
          artifact_refs: [],
          error: {
            code: 'REC_FAIL',
            message: `ghp_1234567890abcdefghij1234567890 ${'Y'.repeat(2500)}`,
            retryable: true,
          },
        },
      }),
    }),
  );
  const taskRec = env.store.createTask({
    workspace_id: env.workspaceId,
    title: 'Reconcile-Fail',
    goal_prompt: 'Reconcile sanitize',
    stages: [{ stage_id: 's1', executor_id: 'fail_rec' }],
  });
  const srId = taskRec.stage_runs[0]!.stage_run_id;
  env.store.createAttempt({
    stage_run_id: srId,
    expected_stage_revision: 1,
    role: 'producer',
    executor_id: 'fail_rec',
    lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  const recRuntime = new RunwayRuntime({
    db: env.db,
    store: env.store,
    registry: regRec,
    workspaceService: env.workspaceService,
  });
  const rep = await recRuntime.reconcile();
  assert.equal(rep.interrupted, 1);
  const after = env.store.getTask(taskRec.task_id)!;
  assert.equal(after.stage_runs[0]!.status, 'human_gate');
  assert.equal(JSON.stringify(queryTimeline(env.db, { task_id: taskRec.task_id })).includes('ghp_123456'), false);
});

test('T5-RUNWAY-02 (G-RUNWAY-04 / BUG-P1-02): analyzeCodexSessionJsonl resets completed on turn.started and reconciles crashed Turn 2 accurately', async () => {
  const twoTurnPendingCall = [
    JSON.stringify({ type: 'thread.started', thread_id: 'th-2turn-1' }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'custom_tool', call_id: 'fc-1' } }),
  ].join('\n');

  const analyzed1 = analyzeCodexSessionJsonl(twoTurnPendingCall);
  assert.equal(analyzed1.completed, false);
  assert.equal(analyzed1.failed, true);
  assert.equal(analyzed1.unsupportedCalls.length, 1);

  const twoTurnAbruptEof = [
    JSON.stringify({ type: 'thread.started', thread_id: 'th-2turn-2' }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'task_complete' } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'turn_started' } }),
    '{"truncated_trailing_line": ',
  ].join('\n');
  const analyzed2 = analyzeCodexSessionJsonl(twoTurnAbruptEof);
  assert.equal(analyzed2.completed, false);
  assert.equal(analyzed2.failed, false);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't5-codex-rec-'));
  try {
    const sessDir = path.join(tmpDir, 'sessions');
    fs.mkdirSync(sessDir, { recursive: true });
    fs.writeFileSync(path.join(sessDir, 'rollout-th-2turn-2.jsonl'), twoTurnAbruptEof, 'utf8');
    const adapter = new CodexExecutorAdapter({ env: { ...process.env, CODEX_HOME: tmpDir } });
    const rec = await adapter.reconcile({
      attempt_id: 'att-t5',
      session_ref: 'th-2turn-2',
      workspace_root: tmpDir,
    });
    assert.equal(rec.state, 'lost');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T5-RUNWAY-03 (G-RUNWAY-05 / BUG-P1-03): Antigravity handles is_error=true with empty/object error in execute() and reconcile()', async () => {
  const parsedEmpty = parseAgyStreamJsonLine('{"type":"result","is_error":true,"error":""}');
  assert.equal(parsedEmpty?.isError, true);
  assert.ok(parsedEmpty?.errorMessage && parsedEmpty.errorMessage.length > 0);

  const parsedObj = parseAgyStreamJsonLine('{"type":"result","is_error":true,"error":{"message":"quota_exceeded"}}');
  assert.equal(parsedObj?.isError, true);
  assert.equal(parsedObj?.errorMessage, 'quota_exceeded');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't5-agy-err-'));
  try {
    const stubBin = path.join(tmpDir, 'agy');
    fs.writeFileSync(
      stubBin,
      [
        '#!/usr/bin/env node',
        'process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id: "s-1", conversation_id: "c-1" }) + "\\n");',
        'process.stdout.write("non-json-stderr-like-noise\\n");',
        'process.stdout.write(JSON.stringify({ type: "result", is_error: true, error: "" }));', // no trailing \n
      ].join('\n'),
      { mode: 0o755 },
    );
    const spoolDir = path.join(tmpDir, 'spools');
    const adapter = new AntigravityExecutorAdapter({ binaryPath: stubBin, spoolDir });
    const outcome = await adapter.execute(
      {
        task_id: 't1',
        stage_run_id: 'sr1',
        attempt_id: 'att-agy-empty',
        stage_id: 's1',
        role: 'producer',
        executor_id: 'antigravity',
        model: 'gemini-4-neon-high',
        workspace_root: tmpDir,
        prompt: 'test',
        sandbox_mode: 'workspace-write',
        knowledge_snapshot_refs: [],
        mcp_servers: [],
        skill_dirs: [],
        timeout_ms: 5000,
      },
      () => {},
      new AbortController().signal,
    );
    assert.equal(outcome.status, 'failed');

    const rec = await adapter.reconcile({
      attempt_id: 'att-agy-empty',
      workspace_root: tmpDir,
    });
    assert.equal(rec.state, 'failed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T5-RUNWAY-04 (G-RUNWAY-03 / BUG-P1-08): DST Fall-Back, impossible cron date, and ScheduleRunner.tickOnce resilience on onCancelTask throw', async (t) => {
  // DST Fall-Back in America/New_York (2026-11-01): 01:30 occurs twice, must advance cleanly
  const fallBackNext = computeNextCronTime('30 1 * * *', 'America/New_York', new Date('2026-11-01T04:30:00Z'));
  assert.ok(new Date(fallBackNext).getTime() > new Date('2026-11-01T04:30:00Z').getTime());
  assert.throws(
    () => computeNextCronTime('0 0 31 2 *', 'UTC', new Date('2026-01-01T00:00:00Z')),
    (err: unknown) => err instanceof RunwayError && err.code === 'INVALID_INPUT',
  );

  const env = createRunwayTestEnv();
  t.after(() => env.cleanup());

  const existing = env.store.createTask({
    workspace_id: env.workspaceId,
    title: 'Active Task',
    goal_prompt: 'Will be cancelled',
    stages: [{ stage_id: 's1', executor_id: 'codex' }],
  });
  env.store.upsertSchedule({
    schedule_id: 'sch-cancel-err',
    workspace_id: env.workspaceId,
    cron_expr: '* * * * *',
    timezone: 'UTC',
    overlap_policy: 'cancel_other',
    payload: { title: 'Next Job', goal_prompt: 'Run' },
    next_run_at: '2026-11-25T10:00:00.000Z',
    last_task_id: existing.task_id,
  });

  const launched: string[] = [];
  const runner = new ScheduleRunner({
    store: env.store,
    onCancelTask: async () => {
      throw new Error('cancel_hook_boom');
    },
    onTaskLaunched: async (taskId) => {
      launched.push(taskId);
    },
  });

  await assert.rejects(
    () => runner.tickOnce(new Date('2026-11-25T10:00:30.000Z')),
    /cancel_hook_boom/,
  );
  assert.equal(launched.length, 1, 'Newly committed task MUST still invoke onTaskLaunched when onCancelTask throws');
});

test('T5-RUNWAY-05 (G-RUNWAY-02): concurrent pauseTask during reattach stream preserves paused_by_human and detachOnShutdown settles cleanly', async (t) => {
  const env = createRunwayTestEnv();
  t.after(() => env.cleanup());

  const reg = new ExecutorRegistry();
  reg.register(
    makeMockAdapter('mock_reattach', {
      reconcile: async () => ({
        state: 'still_running',
        reattach: async function* () {
          yield { kind: 'text_delta', delta: 'chunk-1' };
          await new Promise((r) => setTimeout(r, 80));
          yield { kind: 'text_delta', delta: 'chunk-2' };
        },
      }),
    }),
  );

  const task = env.store.createTask({
    workspace_id: env.workspaceId,
    title: 'Reattach Race',
    goal_prompt: 'Pause mid-reattach',
    stages: [{ stage_id: 's1', executor_id: 'mock_reattach' }],
  });
  const att = env.store.createAttempt({
    stage_run_id: task.stage_runs[0]!.stage_run_id,
    expected_stage_revision: 1,
    role: 'producer',
    executor_id: 'mock_reattach',
    lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
  });

  const runtime = new RunwayRuntime({
    db: env.db,
    store: env.store,
    registry: reg,
    workspaceService: env.workspaceService,
  });

  const rep = await runtime.reconcile();
  assert.equal(rep.reattached, 1);

  const paused = await runtime.pauseTask({ task_id: task.task_id, reason: 'human_pause_race' });
  assert.equal(paused.task.status, 'paused_by_human');
  await runtime.detachOnShutdown();

  const bundle = env.store.getTask(task.task_id)!;
  assert.equal(bundle.task.status, 'paused_by_human');
  assert.notEqual(att.attempt.status, 'succeeded');
});
