import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { isProcessAlive } from '@opl/core';
import {
  AntigravityExecutorAdapter,
  buildAgyArgs,
  type ExecutorEvent,
} from '../src/index.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUB_AGY_PATH = path.join(HERE, 'helpers', 'stub-agy.mjs');

test('buildAgyArgs enforces --mode plan --sandbox for reviewer or read-only', () => {
  const reviewerArgs = buildAgyArgs({
    attempt_id: 'att-1',
    task_id: 't1',
    stage_run_id: 'sr-1',
    stage_id: 'review',
    role: 'reviewer',
    workspace_root: '/tmp/ws',
    sandbox_mode: 'workspace-write', // Even if workspace-write passed, reviewer forces plan + sandbox!
    model_id: 'gemini-4-neon-xhigh',
    prompt: 'Review artifacts',
    knowledge_snapshot_refs: ['/tmp/vault'],
    skill_dirs: [],
    mcp_servers: [],
  });

  assert.equal(reviewerArgs[reviewerArgs.indexOf('--mode') + 1], 'plan');
  assert.ok(reviewerArgs.includes('--sandbox'));
  assert.equal(reviewerArgs[reviewerArgs.indexOf('--effort') + 1], 'xhigh');
  assert.ok(reviewerArgs.includes('--add-dir'));

  const roArgs = buildAgyArgs({
    attempt_id: 'att-2',
    task_id: 't1',
    stage_run_id: 'sr-2',
    stage_id: 'inspect',
    role: 'utility',
    workspace_root: '/tmp/ws',
    sandbox_mode: 'read-only',
    model_id: 'gemini-4-neon-low',
    resume_session_ref: 'ag-conv-1',
    prompt: 'Inspect',
    knowledge_snapshot_refs: [],
    skill_dirs: [],
    mcp_servers: [],
  });
  assert.equal(roArgs[roArgs.indexOf('--mode') + 1], 'plan');
  assert.ok(roArgs.includes('--sandbox'));
  assert.equal(roArgs[roArgs.indexOf('--conversation') + 1], 'ag-conv-1');
  assert.equal(roArgs[roArgs.indexOf('--effort') + 1], 'low');

  // Regression (E2E-M4/M6 2d): deduplicated --add-dir with workspace_root first, skipping relative/NUL paths
  const addDirArgs = buildAgyArgs({
    attempt_id: 'att-3',
    task_id: 't1',
    stage_run_id: 'sr-3',
    stage_id: 'review',
    role: 'reviewer',
    workspace_root: '/tmp/ws',
    sandbox_mode: 'read-only',
    model_id: 'gemini-4-neon-xhigh',
    prompt: 'Audit',
    knowledge_snapshot_refs: ['/tmp/ws', '/tmp/vault', 'relative/dir', '/tmp/bad\0dir', '/tmp/vault'],
    skill_dirs: [],
    mcp_servers: [],
  });
  const addDirs: string[] = [];
  for (let i = 0; i < addDirArgs.length; i++) {
    if (addDirArgs[i] === '--add-dir') addDirs.push(addDirArgs[i + 1]!);
  }
  assert.deepEqual(addDirs, ['/tmp/ws', '/tmp/vault']);
  assert.equal(addDirArgs[addDirArgs.indexOf('--mode') + 1], 'plan');
  assert.ok(addDirArgs.includes('--sandbox'));
});

test('AntigravityExecutorAdapter healthCheck, ephemeral --settings cleanup, stream-json, and spool reconcile()', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agy-test-'));
  const wsDir = path.join(tmpDir, 'ws');
  const spoolDir = path.join(tmpDir, 'spools');
  const logFile = path.join(tmpDir, 'stub-agy.jsonl');
  fs.mkdirSync(wsDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const adapter = new AntigravityExecutorAdapter({
    binaryPath: STUB_AGY_PATH,
    spoolDir,
    env: {
      ...process.env,
      OPL_STUB_AGY_LOG: logFile,
      OPL_STUB_AGY_CONV_ID: 'ag-conv-neon-77',
    },
  });

  const health = await adapter.healthCheck();
  assert.equal(health.available, true);
  assert.equal(health.version, '1.5.17');
  assert.ok(health.models?.includes('gemini-4-neon-xhigh'));
  assert.ok(health.models?.includes('gemini-4-neon-high'));

  const events: ExecutorEvent[] = [];
  const outcome = await adapter.execute(
    {
      attempt_id: 'att-agy-1',
      task_id: 't1',
      stage_run_id: 'sr-1',
      stage_id: 'review',
      role: 'reviewer',
      workspace_root: wsDir,
      sandbox_mode: 'read-only',
      model_id: 'gemini-4-neon-xhigh',
      prompt: 'Audit plan',
      knowledge_snapshot_refs: [],
      skill_dirs: ['/tmp/skills/mas'],
      mcp_servers: [{ id: 'relay', transport: 'stdio', command: 'node', args: ['srv.mjs'] }],
    },
    (ev) => events.push(ev),
    new AbortController().signal,
  );

  assert.equal(outcome.status, 'succeeded');
  assert.equal(outcome.session_ref, 'ag-conv-neon-77');
  assert.equal(outcome.usage?.input_tokens, 320);
  assert.equal(outcome.usage?.output_tokens, 110);
  assert.equal(outcome.usage?.cached_tokens, 50);
  assert.ok(events.some((e) => e.kind === 'session_bound'));
  assert.ok(events.some((e) => e.kind === 'tool_call'));
  assert.ok(events.some((e) => e.kind === 'text_delta'));

  // Ephemeral --settings file was captured by stub during execution AND deleted immediately in finally!
  const logEntry = JSON.parse(fs.readFileSync(logFile, 'utf8').trim()) as {
    argv: string[];
    settingsSnapshot: { path: string; content: { mcpServers: Record<string, unknown> } };
  };
  assert.ok(logEntry.argv.includes('--mode') && logEntry.argv.includes('plan'));
  assert.ok(logEntry.argv.includes('--sandbox'));
  assert.ok(logEntry.settingsSnapshot?.content?.mcpServers?.relay);
  assert.equal(
    fs.existsSync(logEntry.settingsSnapshot.path),
    false,
    'Ephemeral --settings file MUST be deleted in finally',
  );

  // Spool-based reconcile() recovers completed outcome after restart
  const rec = await adapter.reconcile({
    attempt_id: 'att-agy-1',
    session_ref: 'ag-conv-neon-77',
    workspace_root: wsDir,
  });
  assert.equal(rec.state, 'completed');
  assert.equal(rec.outcome?.status, 'succeeded');
  assert.equal(rec.outcome?.session_ref, 'ag-conv-neon-77');
});

test('AntigravityExecutorAdapter SIGTERM -> SIGKILL cleanup on abort leaves zero leaked processes and cleans ephemeral settings', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agy-kill-'));
  const wsDir = path.join(tmpDir, 'ws');
  const logFile = path.join(tmpDir, 'stub-agy-kill.jsonl');
  fs.mkdirSync(wsDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const adapter = new AntigravityExecutorAdapter({
    binaryPath: STUB_AGY_PATH,
    gracefulInterruptMs: 60,
    spoolDir: path.join(tmpDir, 'spools'),
    env: {
      ...process.env,
      OPL_STUB_AGY_LOG: logFile,
      OPL_STUB_AGY_MODE: 'hang_ignore_sigterm',
    },
  });

  const controller = new AbortController();
  let pid: number | undefined;
  const runPromise = adapter.execute(
    {
      attempt_id: 'att-agy-hang',
      task_id: 't1',
      stage_run_id: 'sr-1',
      stage_id: 'plan',
      role: 'producer',
      workspace_root: wsDir,
      sandbox_mode: 'workspace-write',
      model_id: 'gemini-4-neon-high',
      prompt: 'Hang forever',
      knowledge_snapshot_refs: [],
      skill_dirs: [],
      mcp_servers: [{ id: 'relay', transport: 'streamable_http', url: 'http://127.0.0.1:9999/mcp' }],
    },
    (ev) => {
      if (ev.kind === 'session_bound' && ev.local_pid) {
        pid = ev.local_pid;
      }
    },
    controller.signal,
  );

  for (let i = 0; i < 40; i++) {
    if (pid) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.ok(pid && isProcessAlive(pid));

  controller.abort(new Error('abort_test'));
  const outcome = await runPromise;
  assert.equal(outcome.status, 'cancelled');
  assert.equal(isProcessAlive(pid), false, 'Hung agy child PID must be killed via SIGKILL');

  const logEntry = JSON.parse(fs.readFileSync(logFile, 'utf8').trim()) as {
    settingsSnapshot: { path: string };
  };
  assert.equal(fs.existsSync(logEntry.settingsSnapshot.path), false);
});
