import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { isProcessAlive, openSqliteStore } from '@opl/core';
import { queryTimeline } from '@opl/ledger';
import { createWorkspaceService, ensureWorkspaceSchema } from '@opl/workspace';
import {
  CodexExecutorAdapter,
  ExecutorRegistry,
  RunwayError,
  RunwayRuntime,
  SqliteRunwayStore,
  ensureRunwaySchema,
  type ExecutorAdapter,
  type ExecutorCapabilities,
} from '../src/index.ts';
import { createRunwayTestEnv } from './helpers/test-db.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUB_CODEX_PATH = path.join(HERE, 'helpers', 'stub-codex.mjs');

function makeMockAdapter(
  executorId: string,
  reconcileBehavior: ExecutorAdapter['reconcile'],
  executeBehavior?: ExecutorAdapter['execute'],
): ExecutorAdapter {
  const capabilities: ExecutorCapabilities = {
    executor_id: executorId,
    display_name: `Mock ${executorId}`,
    supports_streaming: true,
    supports_session_resume: true,
    supports_reconcile_after_restart: true,
    supports_mcp_tools: false,
    supports_sandbox_modes: ['read-only', 'workspace-write'],
    models: [{ id: 'mock-model', label: 'Mock Model', default: true }],
  };
  return {
    capabilities,
    async healthCheck() {
      return { available: true, version: 'mock-1.0' };
    },
    execute:
      executeBehavior
      ?? (async () => ({
        status: 'succeeded',
        artifact_refs: [],
      })),
    reconcile: reconcileBehavior,
  };
}

test('Guardrail 2: cold-boot reconcile() handles still_running, completed, failed/lost, orphaned stages, and strictly preserves paused_by_human & human_gate', async (t) => {
  const env = createRunwayTestEnv({ leaseTtlMs: 500 });
  const tempChild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: process.platform !== 'win32',
    stdio: 'ignore',
  });
  t.after(() => {
    try {
      if (tempChild.pid && isProcessAlive(tempChild.pid)) {
        process.kill(tempChild.pid, 'SIGKILL');
      }
    } catch {
      // ignore
    }
    env.cleanup();
  });

  // 1. still_running task (alive PID)
  const tStill = env.store.createTask({
    workspace_id: env.workspaceId,
    title: 'Still Running',
    goal_prompt: 'Still running across restart',
    stages: [{ stage_id: 's1', executor_id: 'mock_still' }],
  });
  const attStill = env.store.createAttempt({
    stage_run_id: tStill.stage_runs[0]!.stage_run_id,
    expected_stage_revision: tStill.stage_runs[0]!.revision,
    role: 'producer',
    executor_id: 'mock_still',
    lease_expires_at: new Date(Date.now() - 10_000).toISOString(),
  });
  env.store.bindAttemptSession({
    attempt_id: attStill.attempt.attempt_id,
    executor_session_ref: 'sess-still',
    local_pid: tempChild.pid ?? null,
  });

  // 2. completed task (already finished externally before reboot)
  const artifactRel = 'outputs/result.md';
  fs.mkdirSync(path.join(env.workspaceDir, 'outputs'), { recursive: true });
  fs.writeFileSync(path.join(env.workspaceDir, artifactRel), '# Reconciled Result\n');
  const tDone = env.store.createTask({
    workspace_id: env.workspaceId,
    agent_id: 'mas',
    title: 'Completed Externally',
    goal_prompt: 'Harvest without replay',
    stages: [{ stage_id: 's1', executor_id: 'mock_done' }],
  });
  const attDone = env.store.createAttempt({
    stage_run_id: tDone.stage_runs[0]!.stage_run_id,
    expected_stage_revision: tDone.stage_runs[0]!.revision,
    role: 'producer',
    executor_id: 'mock_done',
    lease_expires_at: new Date(Date.now() - 10_000).toISOString(),
  });
  env.store.bindAttemptSession({
    attempt_id: attDone.attempt.attempt_id,
    executor_session_ref: 'sess-done',
  });

  // 3. lost task (must go to human_gate + typed_blocker, NEVER blind replay!)
  const tLost = env.store.createTask({
    workspace_id: env.workspaceId,
    title: 'Lost Process',
    goal_prompt: 'Must gate on restart loss',
    stages: [{ stage_id: 's1', executor_id: 'mock_lost' }],
  });
  const attLost = env.store.createAttempt({
    stage_run_id: tLost.stage_runs[0]!.stage_run_id,
    expected_stage_revision: tLost.stage_runs[0]!.revision,
    role: 'producer',
    executor_id: 'mock_lost',
    lease_expires_at: new Date(Date.now() - 10_000).toISOString(),
  });
  env.store.bindAttemptSession({
    attempt_id: attLost.attempt.attempt_id,
    executor_session_ref: 'sess-lost',
  });

  // 4. paused_by_human task (even if a stale running attempt row existed before crash, MUST stay paused_by_human!)
  const tPaused = env.store.createTask({
    workspace_id: env.workspaceId,
    title: 'Paused Sovereignty',
    goal_prompt: 'Never auto-resume on restart',
    stages: [{ stage_id: 's1', executor_id: 'mock_still' }],
  });
  env.store.createAttempt({
    stage_run_id: tPaused.stage_runs[0]!.stage_run_id,
    expected_stage_revision: tPaused.stage_runs[0]!.revision,
    role: 'producer',
    executor_id: 'mock_still',
    lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  env.store.pauseTaskAtomic({ task_id: tPaused.task_id, reason: 'human paused before reboot' });

  // 5. Orphaned stage_run with status='running' and no running attempt
  const tOrphan = env.store.createTask({
    workspace_id: env.workspaceId,
    title: 'Orphaned Stage',
    goal_prompt: 'Orphan stage recovery',
    stages: [{ stage_id: 's1', executor_id: 'mock_lost' }],
  });
  env.db
    .prepare("UPDATE stage_runs SET status = 'running', revision = revision + 1 WHERE stage_run_id = ?")
    .run(tOrphan.stage_runs[0]!.stage_run_id);

  // Simulate cold boot by closing DB and reopening from disk!
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

  let executeCalls = 0;
  const ws2 = createWorkspaceService({ db: db2 });
  const store2 = new SqliteRunwayStore({ db: db2 });
  const reg2 = new ExecutorRegistry();
  reg2.register(
    makeMockAdapter(
      'mock_still',
      async (ref) => ({
        state: ref.local_pid && isProcessAlive(ref.local_pid) ? 'still_running' : 'lost',
      }),
      async () => {
        executeCalls += 1;
        return { status: 'succeeded', artifact_refs: [] };
      },
    ),
  );
  reg2.register(
    makeMockAdapter(
      'mock_done',
      async () => ({
        state: 'completed',
        outcome: {
          status: 'succeeded',
          session_ref: 'sess-done',
          artifact_refs: [{ path: artifactRel, sha256: 'ignored-recomputed' }],
          usage: { input_tokens: 100, output_tokens: 50, duration_ms: 10 },
        },
      }),
      async () => {
        executeCalls += 1;
        return { status: 'succeeded', artifact_refs: [] };
      },
    ),
  );
  reg2.register(
    makeMockAdapter(
      'mock_lost',
      async () => ({ state: 'lost' }),
      async () => {
        executeCalls += 1;
        return { status: 'succeeded', artifact_refs: [] };
      },
    ),
  );

  const runtime2 = new RunwayRuntime({
    db: db2,
    store: store2,
    registry: reg2,
    workspaceService: ws2,
    leaseTtlMs: 60_000,
  });

  const report = await runtime2.reconcile();
  assert.equal(report.reattached, 1);
  assert.equal(report.harvested, 1);
  assert.equal(report.interrupted, 2); // lost attempt + orphaned stage
  assert.equal(report.skipped_paused, 1);
  assert.equal(executeCalls, 0, 'reconcile() must NEVER blind-replay execute()');

  // Verify paused_by_human sovereignty across repeated reconciles & runNextStage attempts
  assert.equal(store2.getTask(tPaused.task_id).status, 'paused_by_human');
  assert.equal(store2.getTask(tPaused.task_id).stage_runs[0]!.status, 'paused_by_human');
  await assert.rejects(
    () => runtime2.runNextStage(tPaused.task_id),
    (err: unknown) => err instanceof RunwayError && err.code === 'TASK_PAUSED_BY_HUMAN',
  );
  const report2 = await runtime2.reconcile();
  assert.equal(store2.getTask(tPaused.task_id).status, 'paused_by_human');
  assert.equal(report2.reattached, 1); // still_running remains reattached

  // Verify harvested task & ledger
  const doneBundle = store2.getTask(tDone.task_id);
  assert.equal(doneBundle.status, 'completed');
  assert.equal(doneBundle.stage_runs[0]!.status, 'completed');
  const doneLedger = queryTimeline(db2, { task_id: tDone.task_id });
  assert.ok(doneLedger.some((e) => e.entry_kind === 'artifact_ref'));
  assert.ok(doneLedger.some((e) => e.entry_kind === 'owner_receipt'));

  // Verify lost task & orphan moved to human_gate + typed_blocker
  const lostBundle = store2.getTask(tLost.task_id);
  assert.equal(lostBundle.status, 'awaiting_human');
  assert.equal(lostBundle.stage_runs[0]!.status, 'human_gate');
  assert.equal(lostBundle.attempts[0]!.status, 'interrupted');
  const lostLedger = queryTimeline(db2, { task_id: tLost.task_id });
  assert.ok(lostLedger.some((e) => e.entry_kind === 'typed_blocker'));

  assert.equal(store2.getTask(tOrphan.task_id).status, 'awaiting_human');
  assert.equal(store2.getTask(tOrphan.task_id).stage_runs[0]!.status, 'human_gate');

  runtime2.leaseManager.detachAll();
});

test('Guardrail 3: lease heartbeat refreshes lease_expires_at and SIGTERM -> SIGKILL kills stubborn child with zero leaked PIDs', async (t) => {
  const env = createRunwayTestEnv({
    heartbeatIntervalMs: 25,
    leaseTtlMs: 250,
    gracefulInterruptMs: 80,
  });
  const codexHome = path.join(env.tmpDir, 'codex-home');
  t.after(() => env.cleanup());

  const codexAdapter = new CodexExecutorAdapter({
    binaryPath: STUB_CODEX_PATH,
    gracefulInterruptMs: 80,
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      OPL_STUB_CODEX_MODE: 'hang_ignore_sigterm',
    },
  });
  env.registry.register(codexAdapter);

  const bundle = env.store.createTask({
    workspace_id: env.workspaceId,
    title: 'Stubborn Hanging Child',
    goal_prompt: 'Verify heartbeat renewal and SIGTERM -> SIGKILL escalation',
    stages: [{ stage_id: 'exec', executor_id: 'codex' }],
  });

  let boundPid: number | undefined;
  let boundAttemptId: string | undefined;
  const runPromise = env.runtime.runNextStage(bundle.task_id);

  // Wait for session_bound + pid persistence
  for (let i = 0; i < 40; i++) {
    const cur = env.store.getTask(bundle.task_id);
    if (cur.attempts[0]?.local_pid) {
      boundPid = cur.attempts[0]!.local_pid;
      boundAttemptId = cur.attempts[0]!.attempt_id;
      break;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.ok(boundPid && isProcessAlive(boundPid), 'Stub child process must be running');
  assert.ok(boundAttemptId);

  const lease1 = env.store.getAttempt(boundAttemptId).lease_expires_at!;
  await new Promise((r) => setTimeout(r, 70));
  const lease2 = env.store.getAttempt(boundAttemptId).lease_expires_at!;
  assert.ok(lease2 > lease1, `Expected heartbeat to extend lease (${lease1} -> ${lease2})`);

  // Cancel task -> triggers AbortSignal -> SIGTERM -> 80ms grace -> SIGKILL escalation
  const cancelled = await env.runtime.cancelTask({
    task_id: bundle.task_id,
    reason: 'test_sigkill_escalation',
    actor_id: 'human_tester',
  });
  assert.equal(cancelled.status, 'cancelled');

  const stageResult = await runPromise;
  assert.ok(stageResult);
  assert.equal(isProcessAlive(boundPid), false, 'Child PID must be dead after SIGKILL escalation');

  const ledger = queryTimeline(env.db, { task_id: bundle.task_id });
  assert.ok(
    ledger.some(
      (e) => e.entry_kind === 'human_decision' && e.payload.reason === 'test_sigkill_escalation',
    ),
  );
});

test('Regression: standalone terminateProcessGroup & cancelTask without event-loop keepalive exit 0 (no exit-13) and kill stubborn child', async (t) => {
  const env = createRunwayTestEnv();
  t.after(() => env.cleanup());

  const spiUrl = new URL('../src/executors/spi.ts', import.meta.url).href;
  const readyFile = path.join(env.tmpDir, 'stubborn-ready.txt');
  const probeScript = [
    `import fs from 'node:fs';`,
    `import { spawn } from 'node:child_process';`,
    `const { terminateProcessGroup } = await import(${JSON.stringify(spiUrl)});`,
    `const ready = ${JSON.stringify(readyFile)};`,
    `const c = spawn(process.execPath, ['-e', 'const fs = require("node:fs"); process.on("SIGTERM", () => {}); fs.writeFileSync(' + JSON.stringify(ready) + ', "1"); setInterval(() => {}, 1000);'], { detached: true, stdio: 'ignore' });`,
    `c.unref();`,
    `for (let i = 0; i < 100 && !fs.existsSync(ready); i++) { await new Promise((r) => setTimeout(r, 15)); }`,
    `const res = await terminateProcessGroup(c.pid, 100);`,
    `let alive = true;`,
    `try { process.kill(c.pid, 0); } catch { alive = false; }`,
    `console.log(JSON.stringify({ pid: c.pid, res, alive }));`,
    `if (!res.escalatedToSigkill || !res.exited || alive) process.exit(2);`,
  ].join('\n');

  const runProbe = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '-e', probeScript],
    { encoding: 'utf8', timeout: 10_000 },
  );
  assert.equal(
    runProbe.status,
    0,
    `Standalone terminateProcessGroup probe failed (exit=${String(runProbe.status)}, stdout=${runProbe.stdout}, stderr=${runProbe.stderr})`,
  );
  const parsed = JSON.parse(runProbe.stdout.trim()) as {
    pid: number;
    res: { signalSent: string; escalatedToSigkill: boolean; exited: boolean };
    alive: boolean;
  };
  assert.equal(parsed.res.signalSent, 'SIGKILL');
  assert.equal(parsed.res.escalatedToSigkill, true);
  assert.equal(parsed.res.exited, true);
  assert.equal(parsed.alive, false);
  assert.equal(isProcessAlive(parsed.pid), false);

  // Also verify LeaseManager.interruptAttempt + cancelTask in standalone Node without keepalive
  const indexUrl = new URL('../src/index.ts', import.meta.url).href;
  const cancelScript = [
    `import { openSqliteStore, isProcessAlive } from '@opl/core';`,
    `import { createWorkspaceService, ensureWorkspaceSchema } from '@opl/workspace';`,
    `const runway = await import(${JSON.stringify(indexUrl)});`,
    `const db = openSqliteStore(${JSON.stringify(path.join(env.tmpDir, 'standalone-cancel.sqlite'))});`,
    `ensureWorkspaceSchema(db); runway.ensureRunwaySchema(db);`,
    `const wsSvc = createWorkspaceService({ db });`,
    `const ws = wsSvc.initWorkspace({ name: 'Standalone', root_path: ${JSON.stringify(env.workspaceDir)}, domain_id: 'mas' });`,
    `const store = new runway.SqliteRunwayStore({ db });`,
    `const reg = new runway.ExecutorRegistry();`,
    `reg.register(new runway.CodexExecutorAdapter({ binaryPath: ${JSON.stringify(STUB_CODEX_PATH)}, gracefulInterruptMs: 60, env: { ...process.env, OPL_STUB_CODEX_MODE: 'hang_ignore_sigterm' } }));`,
    `const runtime = new runway.RunwayRuntime({ db, store, registry: reg, workspaceService: wsSvc, gracefulInterruptMs: 60 });`,
    `const b = runtime.createTask({ workspace_id: ws.workspace_id, title: 'Standalone Cancel', goal_prompt: 'Cancel without exit 13', stages: [{ stage_id: 's1', executor_id: 'codex' }] });`,
    `const runP = runtime.runNextStage(b.task_id);`,
    `let pid;`,
    `for (let i = 0; i < 50; i++) { const cur = store.getTask(b.task_id); if (cur.attempts[0]?.local_pid) { pid = cur.attempts[0].local_pid; break; } await new Promise((r) => setTimeout(r, 20)); }`,
    `if (!pid) process.exit(3);`,
    `await runtime.cancelTask({ task_id: b.task_id, reason: 'standalone_cancel' });`,
    `await runP;`,
    `const finalBundle = store.getTask(b.task_id);`,
    `const alive = isProcessAlive(pid);`,
    `db.close();`,
    `console.log(JSON.stringify({ status: finalBundle.status, attemptStatus: finalBundle.attempts[0]?.status, alive }));`,
    `if (finalBundle.status !== 'cancelled' || finalBundle.attempts[0]?.status !== 'cancelled' || alive) process.exit(4);`,
  ].join('\n');

  const cancelProbe = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '-e', cancelScript],
    { encoding: 'utf8', timeout: 15_000 },
  );
  assert.equal(
    cancelProbe.status,
    0,
    `Standalone cancelTask probe failed (exit=${String(cancelProbe.status)}, stderr=${cancelProbe.stderr})`,
  );
});

test('Regression: reattached still_running settles on reattach() stream completion, settles via PID watcher without reattach(), and sends SIGTERM grace on cancelTask', async (t) => {
  // Part A: with reattach() stream completing -> harvests completed + owner_receipt + artifact_ref
  {
    const env = createRunwayTestEnv({ leaseTtlMs: 5_000 });
    t.after(() => env.cleanup());

    const artRel = 'outputs/reattach-done.md';
    fs.mkdirSync(path.join(env.workspaceDir, 'outputs'), { recursive: true });
    fs.writeFileSync(path.join(env.workspaceDir, artRel), '# Stream Completed\n');

    const bundle = env.store.createTask({
      workspace_id: env.workspaceId,
      agent_id: 'mas',
      title: 'Reattach Stream Task',
      goal_prompt: 'Settle after reattach stream completes',
      stages: [{ stage_id: 's1', executor_id: 'mock_stream' }],
    });
    const att = env.store.createAttempt({
      stage_run_id: bundle.stage_runs[0]!.stage_run_id,
      expected_stage_revision: bundle.stage_runs[0]!.revision,
      role: 'producer',
      executor_id: 'mock_stream',
      lease_expires_at: new Date(Date.now() + 5_000).toISOString(),
    });

    let streamDone = false;
    env.registry.register(
      makeMockAdapter('mock_stream', async () => {
        if (!streamDone) {
          return {
            state: 'still_running',
            reattach: async function* () {
              yield { kind: 'progress', message: 'streaming' };
              await new Promise((r) => setTimeout(r, 25));
              yield { kind: 'artifact_observed', path: artRel };
              streamDone = true;
            },
          };
        }
        return {
          state: 'completed',
          outcome: {
            status: 'succeeded',
            session_ref: 'sess-stream-1',
            artifact_refs: [],
          },
        };
      }),
    );

    const report = await env.runtime.reconcile();
    assert.equal(report.reattached, 1);

    for (let i = 0; i < 40; i++) {
      if (env.store.getTask(bundle.task_id).status === 'completed') break;
      await new Promise((r) => setTimeout(r, 25));
    }

    const finalBundle = env.store.getTask(bundle.task_id);
    assert.equal(finalBundle.status, 'completed');
    assert.equal(finalBundle.stage_runs[0]!.status, 'completed');
    assert.equal(finalBundle.attempts[0]!.status, 'succeeded');
    assert.equal(env.runtime.leaseManager.isTracked(att.attempt.attempt_id), false);
    const timeline = queryTimeline(env.db, { task_id: bundle.task_id });
    assert.ok(timeline.some((e) => e.entry_kind === 'artifact_ref'));
    assert.ok(timeline.some((e) => e.entry_kind === 'owner_receipt'));
  }

  // Part B: without reattach() when detached PID exits -> PID watcher harvests completion automatically
  {
    const env = createRunwayTestEnv({ leaseTtlMs: 5_000 });
    t.after(() => env.cleanup());

    const artRel = 'outputs/pid-watcher-done.md';
    fs.mkdirSync(path.join(env.workspaceDir, 'outputs'), { recursive: true });
    fs.writeFileSync(path.join(env.workspaceDir, artRel), '# PID Exited\n');

    const shortChild = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 120)'], {
      detached: process.platform !== 'win32',
      stdio: 'ignore',
    });
    t.after(() => {
      try {
        if (shortChild.pid && isProcessAlive(shortChild.pid)) process.kill(shortChild.pid, 'SIGKILL');
      } catch {
        // ignore
      }
    });

    const bundle = env.store.createTask({
      workspace_id: env.workspaceId,
      agent_id: 'mas',
      title: 'Detached PID Watcher',
      goal_prompt: 'Harvest when detached PID exits',
      stages: [{ stage_id: 's1', executor_id: 'mock_pid' }],
    });
    const att = env.store.createAttempt({
      stage_run_id: bundle.stage_runs[0]!.stage_run_id,
      expected_stage_revision: bundle.stage_runs[0]!.revision,
      role: 'producer',
      executor_id: 'mock_pid',
      lease_expires_at: new Date(Date.now() + 5_000).toISOString(),
    });
    env.store.bindAttemptSession({
      attempt_id: att.attempt.attempt_id,
      local_pid: shortChild.pid ?? null,
      executor_session_ref: 'sess-pid-1',
    });

    env.registry.register(
      makeMockAdapter('mock_pid', async (ref) => {
        if (ref.local_pid && isProcessAlive(ref.local_pid)) {
          return { state: 'still_running' };
        }
        return {
          state: 'completed',
          outcome: {
            status: 'succeeded',
            session_ref: 'sess-pid-1',
            artifact_refs: [{ path: artRel, sha256: 'ignored' }],
          },
        };
      }),
    );

    const report = await env.runtime.reconcile();
    assert.equal(report.reattached, 1);

    for (let i = 0; i < 60; i++) {
      if (env.store.getTask(bundle.task_id).status === 'completed') break;
      await new Promise((r) => setTimeout(r, 30));
    }

    const finalBundle = env.store.getTask(bundle.task_id);
    assert.equal(finalBundle.status, 'completed');
    assert.equal(finalBundle.stage_runs[0]!.status, 'completed');
    assert.equal(finalBundle.attempts[0]!.status, 'succeeded');
    assert.equal(env.runtime.leaseManager.isTracked(att.attempt.attempt_id), false);
    const timeline = queryTimeline(env.db, { task_id: bundle.task_id });
    assert.ok(timeline.some((e) => e.entry_kind === 'owner_receipt'));
  }

  // Part C: reattached detached PID interrupted via cancelTask receives SIGTERM before SIGKILL and unregisters
  {
    const env = createRunwayTestEnv({ leaseTtlMs: 5_000, gracefulInterruptMs: 300 });
    t.after(() => env.cleanup());

    const readyMarker = path.join(env.tmpDir, 'stubborn-ready-c.txt');
    const sigMarker = path.join(env.tmpDir, 'sigterm-seen.txt');
    const stubborn = spawn(
      process.execPath,
      [
        '-e',
        `const fs = require('node:fs'); process.on('SIGTERM', () => { fs.writeFileSync(${JSON.stringify(sigMarker)}, 'SIGTERM'); }); fs.writeFileSync(${JSON.stringify(readyMarker)}, '1'); setInterval(() => {}, 1000);`,
      ],
      { detached: process.platform !== 'win32', stdio: 'ignore' },
    );
    t.after(() => {
      try {
        if (stubborn.pid && isProcessAlive(stubborn.pid)) process.kill(stubborn.pid, 'SIGKILL');
      } catch {
        // ignore
      }
    });

    // Wait deterministically for child to install SIGTERM handler
    for (let i = 0; i < 100 && !fs.existsSync(readyMarker); i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(fs.existsSync(readyMarker), true, 'Stubborn child must become ready');

    const bundle = env.store.createTask({
      workspace_id: env.workspaceId,
      title: 'Reattached Interrupt Grace',
      goal_prompt: 'Verify SIGTERM grace on reattached handle',
      stages: [{ stage_id: 's1', executor_id: 'mock_stubborn' }],
    });
    const att = env.store.createAttempt({
      stage_run_id: bundle.stage_runs[0]!.stage_run_id,
      expected_stage_revision: bundle.stage_runs[0]!.revision,
      role: 'producer',
      executor_id: 'mock_stubborn',
      lease_expires_at: new Date(Date.now() + 5_000).toISOString(),
    });
    env.store.bindAttemptSession({
      attempt_id: att.attempt.attempt_id,
      local_pid: stubborn.pid ?? null,
    });

    env.registry.register(
      makeMockAdapter('mock_stubborn', async (ref) => ({
        state: ref.local_pid && isProcessAlive(ref.local_pid) ? 'still_running' : 'lost',
      })),
    );

    const report = await env.runtime.reconcile();
    assert.equal(report.reattached, 1);
    assert.equal(env.runtime.leaseManager.isTracked(att.attempt.attempt_id), true);

    const t0 = Date.now();
    await env.runtime.cancelTask({ task_id: bundle.task_id, reason: 'interrupt_reattached' });
    const elapsed = Date.now() - t0;

    assert.equal(fs.existsSync(sigMarker), true, 'Reattached child must receive SIGTERM before SIGKILL');
    assert.ok(elapsed >= 200, `Expected graceful SIGTERM window before SIGKILL, got ${elapsed}ms`);
    assert.equal(isProcessAlive(stubborn.pid!), false, 'Child must be dead after SIGKILL');
    assert.equal(env.runtime.leaseManager.isTracked(att.attempt.attempt_id), false);
    assert.equal(env.store.getAttempt(att.attempt.attempt_id).status, 'cancelled');
  }
});
