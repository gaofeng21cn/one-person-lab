import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { isProcessAlive } from '@opl/core';
import {
  CodexAppServerClient,
  CodexExecutorAdapter,
  RunwayError,
  buildCodexExecArgs,
  buildCodexExecResumeArgs,
  resolveCodexBinary,
  type ExecutorEvent,
  type StageExecutionRequest,
} from '../src/index.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUB_CODEX_PATH = path.join(HERE, 'helpers', 'stub-codex.mjs');

test('resolveCodexBinary precedence and fail-closed on invalid OPL_CODEX_BIN', () => {
  const explicit = resolveCodexBinary(STUB_CODEX_PATH, {});
  assert.equal(explicit?.source, 'explicit');
  assert.equal(explicit?.path, STUB_CODEX_PATH);

  const fromEnv = resolveCodexBinary(undefined, { OPL_CODEX_BIN: STUB_CODEX_PATH });
  assert.equal(fromEnv?.source, 'env');

  assert.throws(
    () => resolveCodexBinary(undefined, { OPL_CODEX_BIN: '/nonexistent/codex-bin' }),
    (err: unknown) => err instanceof RunwayError && err.code === 'EXECUTOR_UNAVAILABLE',
  );
});

test('buildCodexExecArgs & buildCodexExecResumeArgs never pass --sandbox, --cd, or --add-dir on resume', () => {
  const req: StageExecutionRequest = {
    attempt_id: 'att-1',
    task_id: 'task-1',
    stage_run_id: 'sr-1',
    stage_id: 'impl',
    role: 'producer',
    workspace_root: '/tmp/ws',
    sandbox_mode: 'workspace-write',
    model_id: 'gpt-5-codex',
    reasoning_effort: 'high',
    prompt: 'Implement feature X',
    knowledge_snapshot_refs: ['/tmp/vault'],
    skill_dirs: ['/tmp/pkg/skills/a'],
    mcp_servers: [
      { id: 'relay', transport: 'stdio', command: 'node', args: ['relay.mjs'] },
    ],
  };

  const execArgs = buildCodexExecArgs(req);
  assert.equal(execArgs[0], 'exec');
  assert.ok(execArgs.includes('--json'));
  assert.ok(execArgs.includes('--add-dir'));
  assert.ok(execArgs.includes('sandbox_mode="workspace-write"'));
  assert.ok(execArgs.some((a) => a.startsWith('skills.config=')));
  assert.ok(execArgs.some((a) => a.startsWith('mcp_servers.relay.command=')));

  const resumeArgs = buildCodexExecResumeArgs('thread-42', req);
  assert.equal(resumeArgs[0], 'exec');
  assert.equal(resumeArgs[1], 'resume');
  assert.equal(resumeArgs.includes('--sandbox'), false, 'resume MUST NOT pass --sandbox');
  assert.equal(resumeArgs.includes('--cd'), false, 'resume MUST NOT pass --cd');
  assert.equal(resumeArgs.includes('-C'), false, 'resume MUST NOT pass -C');
  assert.equal(resumeArgs.includes('--add-dir'), false, 'resume MUST NOT pass --add-dir');
  assert.ok(resumeArgs.includes('sandbox_mode="workspace-write"'));
  assert.equal(resumeArgs[resumeArgs.length - 2], 'thread-42');
});

test('CodexExecutorAdapter executes exec, resume, app-server --stdio, and recovers JSONL session in reconcile()', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-test-'));
  const wsDir = path.join(tmpDir, 'ws');
  const codexHome = path.join(tmpDir, 'codex-home');
  const logFile = path.join(tmpDir, 'stub-codex.jsonl');
  fs.mkdirSync(wsDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const adapter = new CodexExecutorAdapter({
    binaryPath: STUB_CODEX_PATH,
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      OPL_STUB_CODEX_LOG: logFile,
      OPL_STUB_CODEX_THREAD_ID: 'codex-thread-rec-1',
    },
  });

  const health = await adapter.healthCheck();
  assert.equal(health.available, true);
  assert.equal(health.version, 'codex-cli 0.172.0-stub');

  // 1. Streaming exec --json
  const events: ExecutorEvent[] = [];
  const execOutcome = await adapter.execute(
    {
      attempt_id: 'att-exec-1',
      task_id: 't1',
      stage_run_id: 'sr-1',
      stage_id: 'impl',
      role: 'producer',
      workspace_root: wsDir,
      sandbox_mode: 'workspace-write',
      model_id: 'gpt-5-codex',
      prompt: 'Build chart',
      knowledge_snapshot_refs: [],
      skill_dirs: [],
      mcp_servers: [],
    },
    (ev) => events.push(ev),
    new AbortController().signal,
  );
  assert.equal(execOutcome.status, 'succeeded');
  assert.equal(execOutcome.session_ref, 'codex-thread-rec-1');
  assert.equal(execOutcome.usage?.input_tokens, 210);
  assert.equal(execOutcome.usage?.output_tokens, 85);
  assert.equal(execOutcome.usage?.cached_tokens, 40);
  assert.ok(events.some((e) => e.kind === 'session_bound'));
  assert.ok(events.some((e) => e.kind === 'tool_call'));
  assert.ok(events.some((e) => e.kind === 'text_delta'));
  assert.ok(events.some((e) => e.kind === 'usage'));

  // 2. reconcile() recovers completed output + usage from $CODEX_HOME/sessions/**/*.jsonl
  const rec = await adapter.reconcile({
    attempt_id: 'att-exec-1',
    session_ref: 'codex-thread-rec-1',
    workspace_root: wsDir,
  });
  assert.equal(rec.state, 'completed');
  assert.equal(rec.outcome?.status, 'succeeded');
  assert.equal(rec.outcome?.usage?.input_tokens, 210);

  // 3. exec resume (verify logged argv has NO --sandbox, --cd, --add-dir)
  const resumeOutcome = await adapter.execute(
    {
      attempt_id: 'att-resume-1',
      task_id: 't1',
      stage_run_id: 'sr-1',
      stage_id: 'impl',
      role: 'producer',
      workspace_root: wsDir,
      sandbox_mode: 'read-only',
      resume_session_ref: 'codex-thread-rec-1',
      prompt: 'Continue verification',
      knowledge_snapshot_refs: [wsDir],
      skill_dirs: [],
      mcp_servers: [],
    },
    () => {},
    new AbortController().signal,
  );
  assert.equal(resumeOutcome.status, 'succeeded');

  const logLines = fs
    .readFileSync(logFile, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { kind: string; argv: string[]; cwd: string });
  const resumeLog = logLines.find((l) => l.kind === 'exec_resume');
  assert.ok(resumeLog);
  assert.equal(resumeLog.cwd, fs.realpathSync(wsDir));
  assert.equal(resumeLog.argv.includes('--sandbox'), false);
  assert.equal(resumeLog.argv.includes('--cd'), false);
  assert.equal(resumeLog.argv.includes('--add-dir'), false);

  // 4. app-server --stdio transport
  const appOutcome = await adapter.execute(
    {
      attempt_id: 'att-app-1',
      task_id: 't1',
      stage_run_id: 'sr-2',
      stage_id: 'interactive',
      role: 'producer',
      workspace_root: wsDir,
      sandbox_mode: 'workspace-write',
      prompt: 'Run via app-server',
      knowledge_snapshot_refs: [],
      skill_dirs: [],
      mcp_servers: [],
      metadata: { transport: 'app-server' },
    },
    () => {},
    new AbortController().signal,
  );
  assert.equal(appOutcome.status, 'succeeded');
  assert.ok(appOutcome.summary_text?.includes('AppServer stub response'));
  assert.equal(appOutcome.usage?.input_tokens, 120);

  // 5. Watchdogs: unsupported_function_call & provider_error
  const unsupportedAdapter = new CodexExecutorAdapter({
    binaryPath: STUB_CODEX_PATH,
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      OPL_STUB_CODEX_MODE: 'unsupported_function_call',
    },
  });
  const unsupOutcome = await unsupportedAdapter.execute(
    {
      attempt_id: 'att-unsup-1',
      task_id: 't1',
      stage_run_id: 'sr-3',
      stage_id: 'impl',
      role: 'producer',
      workspace_root: wsDir,
      sandbox_mode: 'workspace-write',
      prompt: 'Trigger unsupported call',
      knowledge_snapshot_refs: [],
      skill_dirs: [],
      mcp_servers: [],
    },
    () => {},
    new AbortController().signal,
  );
  assert.equal(unsupOutcome.status, 'failed');
  assert.equal(unsupOutcome.error?.code, 'UNSUPPORTED_TOOL_PROTOCOL');
  assert.equal(unsupOutcome.error?.retryable, false);

  const errAdapter = new CodexExecutorAdapter({
    binaryPath: STUB_CODEX_PATH,
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      OPL_STUB_CODEX_MODE: 'provider_error',
    },
  });
  const errOutcome = await errAdapter.execute(
    {
      attempt_id: 'att-err-1',
      task_id: 't1',
      stage_run_id: 'sr-4',
      stage_id: 'impl',
      role: 'producer',
      workspace_root: wsDir,
      sandbox_mode: 'workspace-write',
      prompt: 'Trigger provider error',
      knowledge_snapshot_refs: [],
      skill_dirs: [],
      mcp_servers: [],
    },
    () => {},
    new AbortController().signal,
  );
  assert.equal(errOutcome.status, 'failed');
  assert.ok(errOutcome.error?.message.includes('503'));
});

test('Regression: CodexExecutorAdapter app-server enforces reviewer read-only, handles mid-turn crash & timeout, cleans up connect() failure, and quotes dotted TOML keys', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-reg-'));
  const wsDir = path.join(tmpDir, 'ws');
  const logFile = path.join(tmpDir, 'app-server.jsonl');
  fs.mkdirSync(wsDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  // 1. reviewer role must force sandbox: 'read-only' (NOT sandboxMode) in app-server thread/start
  const reviewerAdapter = new CodexExecutorAdapter({
    binaryPath: STUB_CODEX_PATH,
    env: { ...process.env, OPL_STUB_CODEX_LOG: logFile },
  });
  const reviewerOutcome = await reviewerAdapter.execute(
    {
      attempt_id: 'att-rev-app',
      task_id: 't1',
      stage_run_id: 'sr-rev',
      stage_id: 'review',
      role: 'reviewer',
      workspace_root: wsDir,
      sandbox_mode: 'workspace-write',
      prompt: 'Review changes',
      knowledge_snapshot_refs: [],
      skill_dirs: [],
      mcp_servers: [],
      metadata: { transport: 'app-server' },
    },
    () => {},
    new AbortController().signal,
  );
  assert.equal(reviewerOutcome.status, 'succeeded');
  const appLogs = fs
    .readFileSync(logFile, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { kind: string; params?: Record<string, unknown> });
  const threadStart = appLogs.find((l) => l.kind === 'app_server_thread_start');
  assert.equal(threadStart?.params?.sandbox, 'read-only');
  assert.equal('sandboxMode' in (threadStart?.params ?? {}), false);

  // 2. Abrupt app-server exit mid-turn settles promptly as 'failed' with EXECUTOR_FAILED (no hang)
  const crashAdapter = new CodexExecutorAdapter({
    binaryPath: STUB_CODEX_PATH,
    env: { ...process.env, OPL_STUB_CODEX_MODE: 'app_server_crash_mid_turn' },
  });
  const crashOutcome = await crashAdapter.execute(
    {
      attempt_id: 'att-crash-app',
      task_id: 't1',
      stage_run_id: 'sr-crash',
      stage_id: 'impl',
      role: 'producer',
      workspace_root: wsDir,
      sandbox_mode: 'workspace-write',
      prompt: 'Crash mid turn',
      knowledge_snapshot_refs: [],
      skill_dirs: [],
      mcp_servers: [],
      metadata: { transport: 'app-server' },
    },
    () => {},
    new AbortController().signal,
  );
  assert.equal(crashOutcome.status, 'failed');
  assert.equal(crashOutcome.error?.code, 'EXECUTOR_FAILED');

  // 3. req.timeout_ms honored in app-server transport
  const hangAdapter = new CodexExecutorAdapter({
    binaryPath: STUB_CODEX_PATH,
    gracefulInterruptMs: 50,
    env: { ...process.env, OPL_STUB_CODEX_MODE: 'app_server_hang' },
  });
  const timeoutOutcome = await hangAdapter.execute(
    {
      attempt_id: 'att-timeout-app',
      task_id: 't1',
      stage_run_id: 'sr-to',
      stage_id: 'impl',
      role: 'producer',
      workspace_root: wsDir,
      sandbox_mode: 'workspace-write',
      timeout_ms: 60,
      prompt: 'Timeout test',
      knowledge_snapshot_refs: [],
      skill_dirs: [],
      mcp_servers: [],
      metadata: { transport: 'app-server' },
    },
    () => {},
    new AbortController().signal,
  );
  assert.equal(timeoutOutcome.status, 'timed_out');
  assert.equal(timeoutOutcome.error?.code, 'TIMED_OUT');

  // 4. CodexAppServerClient.connect() cleans up child on initialize() failure
  const origPidFile = path.join(tmpDir, 'init-err.log');
  await assert.rejects(
    () =>
      CodexAppServerClient.connect({
        binaryPath: STUB_CODEX_PATH,
        cwd: wsDir,
        gracefulInterruptMs: 50,
        env: {
          ...process.env,
          OPL_STUB_CODEX_MODE: 'app_server_init_error_stay_alive',
          OPL_STUB_CODEX_LOG: origPidFile,
        },
      }),
    (err: unknown) => err instanceof RunwayError && err.code === 'EXECUTOR_FAILED',
  );
  const initLogs = fs
    .readFileSync(origPidFile, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { kind: string; pid?: number });
  const initPid = initLogs.find((l) => l.kind === 'app_server_initialize')?.pid;
  assert.ok(typeof initPid === 'number' && initPid > 0);
  assert.equal(isProcessAlive(initPid), false, 'connect() failure must kill app-server child');

  // 5. sanitizeTomlKey quotes dotted/special keys instead of colliding with underscore keys
  const args = buildCodexExecArgs({
    attempt_id: 'att-toml',
    task_id: 't1',
    stage_run_id: 'sr-toml',
    stage_id: 'impl',
    role: 'producer',
    workspace_root: wsDir,
    sandbox_mode: 'workspace-write',
    prompt: 'Check TOML keys',
    knowledge_snapshot_refs: [],
    skill_dirs: [],
    mcp_servers: [
      { id: 'a.b', transport: 'stdio', command: 'cmd1', env: { 'FOO.BAR': '1' } },
      { id: 'a_b', transport: 'stdio', command: 'cmd2' },
    ],
  });
  assert.ok(args.includes('mcp_servers."a.b".command="cmd1"'));
  assert.ok(args.includes('mcp_servers."a.b".env."FOO.BAR"="1"'));
  assert.ok(args.includes('mcp_servers.a_b.command="cmd2"'));
});

test('Regression (Iter 3): app-server thread/resume, pre-aborted signal, and RPC hang timeout/abort cleanup', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-r3-'));
  const wsDir = path.join(tmpDir, 'ws');
  fs.mkdirSync(wsDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  // 1. resume_session_ref invokes thread/resume with { threadId, cwd, sandbox } before turn/start
  const resumeLogFile = path.join(tmpDir, 'app-resume.jsonl');
  const resumeAdapter = new CodexExecutorAdapter({
    binaryPath: STUB_CODEX_PATH,
    env: { ...process.env, OPL_STUB_CODEX_LOG: resumeLogFile },
  });
  const resumeOutcome = await resumeAdapter.execute(
    {
      attempt_id: 'att-app-resume',
      task_id: 't1',
      stage_run_id: 'sr-app-resume',
      stage_id: 'review',
      role: 'reviewer',
      workspace_root: wsDir,
      sandbox_mode: 'workspace-write',
      model_id: 'gpt-5-codex',
      resume_session_ref: 'existing-thread-99',
      prompt: 'Resume and review',
      knowledge_snapshot_refs: [],
      skill_dirs: [],
      mcp_servers: [],
      metadata: { transport: 'app-server' },
    },
    () => {},
    new AbortController().signal,
  );
  assert.equal(resumeOutcome.status, 'succeeded');
  assert.equal(resumeOutcome.session_ref, 'existing-thread-99');

  const resumeLogs = fs
    .readFileSync(resumeLogFile, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { kind: string; params?: Record<string, unknown> });
  const resumeIdx = resumeLogs.findIndex((l) => l.kind === 'app_server_thread_resume');
  const turnIdx = resumeLogs.findIndex((l) => l.kind === 'app_server_turn_start');
  assert.ok(resumeIdx >= 0, 'thread/resume must be invoked');
  assert.ok(turnIdx > resumeIdx, 'turn/start must run after thread/resume');
  assert.equal(resumeLogs.some((l) => l.kind === 'app_server_thread_start'), false);
  assert.deepEqual(resumeLogs[resumeIdx]?.params, {
    threadId: 'existing-thread-99',
    cwd: wsDir,
    sandbox: 'read-only',
    model: 'gpt-5-codex',
  });

  // 2. Pre-aborted AbortSignal returns cancelled immediately without spawning app-server
  const preAbortLogFile = path.join(tmpDir, 'pre-abort.jsonl');
  const preAbortController = new AbortController();
  preAbortController.abort();
  const preAbortAdapter = new CodexExecutorAdapter({
    binaryPath: STUB_CODEX_PATH,
    env: {
      ...process.env,
      OPL_STUB_CODEX_MODE: 'hang_on_initialize',
      OPL_STUB_CODEX_LOG: preAbortLogFile,
    },
  });
  const tPreStart = Date.now();
  const preAbortOutcome = await preAbortAdapter.execute(
    {
      attempt_id: 'att-pre-abort',
      task_id: 't1',
      stage_run_id: 'sr-pre-abort',
      stage_id: 'impl',
      role: 'producer',
      workspace_root: wsDir,
      sandbox_mode: 'workspace-write',
      prompt: 'Should not spawn',
      knowledge_snapshot_refs: [],
      skill_dirs: [],
      mcp_servers: [],
      metadata: { transport: 'app-server' },
    },
    () => {},
    preAbortController.signal,
  );
  assert.equal(preAbortOutcome.status, 'cancelled');
  assert.equal(preAbortOutcome.error?.code, 'CANCELLED');
  assert.ok(Date.now() - tPreStart < 200);
  assert.equal(fs.existsSync(preAbortLogFile), false, 'Pre-aborted signal must not spawn app-server');

  // 3. hang_on_turn_start with timeout_ms: 80 settles in < 500ms as timed_out with dead child PID
  const hangTurnLogFile = path.join(tmpDir, 'hang-turn.jsonl');
  const hangTurnAdapter = new CodexExecutorAdapter({
    binaryPath: STUB_CODEX_PATH,
    env: {
      ...process.env,
      OPL_STUB_CODEX_MODE: 'hang_on_turn_start',
      OPL_STUB_CODEX_LOG: hangTurnLogFile,
    },
  });
  const tTurnStart = Date.now();
  const hangTurnOutcome = await hangTurnAdapter.execute(
    {
      attempt_id: 'att-hang-turn',
      task_id: 't1',
      stage_run_id: 'sr-hang-turn',
      stage_id: 'impl',
      role: 'producer',
      workspace_root: wsDir,
      sandbox_mode: 'workspace-write',
      timeout_ms: 80,
      prompt: 'Hang on turn/start',
      knowledge_snapshot_refs: [],
      skill_dirs: [],
      mcp_servers: [],
      metadata: { transport: 'app-server' },
    },
    () => {},
    new AbortController().signal,
  );
  const hangTurnElapsed = Date.now() - tTurnStart;
  assert.equal(hangTurnOutcome.status, 'timed_out');
  assert.equal(hangTurnOutcome.error?.code, 'TIMED_OUT');
  assert.ok(hangTurnElapsed < 500, `Expected < 500ms, got ${hangTurnElapsed}ms`);
  if (fs.existsSync(hangTurnLogFile)) {
    const hangTurnPid = (
      JSON.parse(fs.readFileSync(hangTurnLogFile, 'utf8').trim().split('\n')[0]!) as { pid: number }
    ).pid;
    assert.equal(isProcessAlive(hangTurnPid), false, 'Timed-out hang_on_turn_start child must be dead');
  }

  // 3b. Deterministic hang_on_turn_start reaching turn/start RPC and timing out in < 500ms
  const hangTurnDetLogFile = path.join(tmpDir, 'hang-turn-det.jsonl');
  const hangTurnDetAdapter = new CodexExecutorAdapter({
    binaryPath: STUB_CODEX_PATH,
    env: {
      ...process.env,
      OPL_STUB_CODEX_MODE: 'hang_on_turn_start',
      OPL_STUB_CODEX_LOG: hangTurnDetLogFile,
    },
  });
  const tTurnDetStart = Date.now();
  const hangTurnDetOutcome = await hangTurnDetAdapter.execute(
    {
      attempt_id: 'att-hang-turn-det',
      task_id: 't1',
      stage_run_id: 'sr-hang-turn-det',
      stage_id: 'impl',
      role: 'producer',
      workspace_root: wsDir,
      sandbox_mode: 'workspace-write',
      timeout_ms: 250,
      prompt: 'Hang deterministically on turn/start',
      knowledge_snapshot_refs: [],
      skill_dirs: [],
      mcp_servers: [],
      metadata: { transport: 'app-server' },
    },
    () => {},
    new AbortController().signal,
  );
  const hangTurnDetElapsed = Date.now() - tTurnDetStart;
  assert.equal(hangTurnDetOutcome.status, 'timed_out');
  assert.equal(hangTurnDetOutcome.error?.code, 'TIMED_OUT');
  assert.ok(hangTurnDetElapsed < 500, `Expected < 500ms, got ${hangTurnDetElapsed}ms`);
  const hangTurnDetLogs = fs
    .readFileSync(hangTurnDetLogFile, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { kind: string; pid: number });
  assert.ok(hangTurnDetLogs.some((l) => l.kind === 'app_server_turn_start'));
  assert.equal(isProcessAlive(hangTurnDetLogs[0]!.pid), false);

  // 4. hang_on_thread_start with AbortSignal at 50ms settles in < 500ms as cancelled with dead child PID
  const hangThreadLogFile = path.join(tmpDir, 'hang-thread.jsonl');
  const hangThreadAdapter = new CodexExecutorAdapter({
    binaryPath: STUB_CODEX_PATH,
    env: {
      ...process.env,
      OPL_STUB_CODEX_MODE: 'hang_on_thread_start',
      OPL_STUB_CODEX_LOG: hangThreadLogFile,
    },
  });
  const abortCtrl = new AbortController();
  const abortTimer = setTimeout(() => abortCtrl.abort(), 50);
  const tThreadStart = Date.now();
  const hangThreadOutcome = await hangThreadAdapter.execute(
    {
      attempt_id: 'att-hang-thread',
      task_id: 't1',
      stage_run_id: 'sr-hang-thread',
      stage_id: 'impl',
      role: 'producer',
      workspace_root: wsDir,
      sandbox_mode: 'workspace-write',
      prompt: 'Hang on thread/start',
      knowledge_snapshot_refs: [],
      skill_dirs: [],
      mcp_servers: [],
      metadata: { transport: 'app-server' },
    },
    () => {},
    abortCtrl.signal,
  );
  clearTimeout(abortTimer);
  const hangThreadElapsed = Date.now() - tThreadStart;
  assert.equal(hangThreadOutcome.status, 'cancelled');
  assert.equal(hangThreadOutcome.error?.code, 'CANCELLED');
  assert.ok(hangThreadElapsed < 500, `Expected < 500ms, got ${hangThreadElapsed}ms`);
  if (fs.existsSync(hangThreadLogFile)) {
    const hangThreadPid = (
      JSON.parse(fs.readFileSync(hangThreadLogFile, 'utf8').trim().split('\n')[0]!) as { pid: number }
    ).pid;
    assert.equal(isProcessAlive(hangThreadPid), false, 'Aborted hang_on_thread_start child must be dead');
  }

  // 4b. Deterministic hang_on_thread_start reaching thread/start RPC then aborting
  const hangThreadDetLogFile = path.join(tmpDir, 'hang-thread-det.jsonl');
  const hangThreadDetAdapter = new CodexExecutorAdapter({
    binaryPath: STUB_CODEX_PATH,
    env: {
      ...process.env,
      OPL_STUB_CODEX_MODE: 'hang_on_thread_start',
      OPL_STUB_CODEX_LOG: hangThreadDetLogFile,
    },
  });
  const abortDetCtrl = new AbortController();
  const pollForThreadStart = setInterval(() => {
    if (fs.existsSync(hangThreadDetLogFile)) {
      const content = fs.readFileSync(hangThreadDetLogFile, 'utf8');
      if (content.includes('app_server_thread_start')) {
        clearInterval(pollForThreadStart);
        abortDetCtrl.abort();
      }
    }
  }, 10);
  const tThreadDetStart = Date.now();
  const hangThreadDetOutcome = await hangThreadDetAdapter.execute(
    {
      attempt_id: 'att-hang-thread-det',
      task_id: 't1',
      stage_run_id: 'sr-hang-thread-det',
      stage_id: 'impl',
      role: 'producer',
      workspace_root: wsDir,
      sandbox_mode: 'workspace-write',
      prompt: 'Hang deterministically on thread/start',
      knowledge_snapshot_refs: [],
      skill_dirs: [],
      mcp_servers: [],
      metadata: { transport: 'app-server' },
    },
    () => {},
    abortDetCtrl.signal,
  );
  clearInterval(pollForThreadStart);
  const hangThreadDetElapsed = Date.now() - tThreadDetStart;
  assert.equal(hangThreadDetOutcome.status, 'cancelled');
  assert.equal(hangThreadDetOutcome.error?.code, 'CANCELLED');
  assert.ok(hangThreadDetElapsed < 500, `Expected < 500ms, got ${hangThreadDetElapsed}ms`);
  const hangThreadDetLogs = fs
    .readFileSync(hangThreadDetLogFile, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { kind: string; pid: number });
  assert.ok(hangThreadDetLogs.some((l) => l.kind === 'app_server_thread_start'));
  assert.equal(isProcessAlive(hangThreadDetLogs[0]!.pid), false);

  // 5. hang_on_initialize with timeout_ms: 80 settles in < 500ms as timed_out with dead child PID
  const hangInitLogFile = path.join(tmpDir, 'hang-init.jsonl');
  const hangInitAdapter = new CodexExecutorAdapter({
    binaryPath: STUB_CODEX_PATH,
    env: {
      ...process.env,
      OPL_STUB_CODEX_MODE: 'hang_on_initialize',
      OPL_STUB_CODEX_LOG: hangInitLogFile,
    },
  });
  const tInitStart = Date.now();
  const hangInitOutcome = await hangInitAdapter.execute(
    {
      attempt_id: 'att-hang-init',
      task_id: 't1',
      stage_run_id: 'sr-hang-init',
      stage_id: 'impl',
      role: 'producer',
      workspace_root: wsDir,
      sandbox_mode: 'workspace-write',
      timeout_ms: 80,
      prompt: 'Hang on initialize',
      knowledge_snapshot_refs: [],
      skill_dirs: [],
      mcp_servers: [],
      metadata: { transport: 'app-server' },
    },
    () => {},
    new AbortController().signal,
  );
  const hangInitElapsed = Date.now() - tInitStart;
  assert.equal(hangInitOutcome.status, 'timed_out');
  assert.equal(hangInitOutcome.error?.code, 'TIMED_OUT');
  assert.ok(hangInitElapsed < 500, `Expected < 500ms, got ${hangInitElapsed}ms`);
  if (fs.existsSync(hangInitLogFile)) {
    const hangInitPid = (
      JSON.parse(fs.readFileSync(hangInitLogFile, 'utf8').trim().split('\n')[0]!) as { pid: number }
    ).pid;
    assert.equal(isProcessAlive(hangInitPid), false, 'Timed-out hang_on_initialize child must be dead');
  }
});
