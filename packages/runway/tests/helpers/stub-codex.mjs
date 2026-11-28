#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const args = process.argv.slice(2);
const logFile = process.env.OPL_STUB_CODEX_LOG;
const mode = process.env.OPL_STUB_CODEX_MODE || 'normal';
const codexHome = process.env.CODEX_HOME || '';
const threadId = process.env.OPL_STUB_CODEX_THREAD_ID || `stub-thread-${process.pid}`;

function mcpCompletion(exec) {
  return {
    id: exec ? 'item_1' : 'call_fixture', type: exec ? 'mcp_tool_call' : 'mcpToolCall',
    server: 'fixture', tool: 'lookup', status: 'completed', arguments: { query: 'synthetic private input' },
    result: {
      content: [{ type: 'text', text: 'synthetic private output' }],
      [exec ? 'structured_content' : 'structuredContent']: null,
      _meta: { 'onepersonlab.org/bindingDigest': 'sha256:' + 'a'.repeat(64) },
    },
    error: null,
  };
}

function appendLog(entry) {
  if (!logFile) return;
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const line = `${JSON.stringify(entry)}\n`;
  if (!fs.existsSync(logFile)) {
    // Publish the first PID record atomically so timeout observers can always parse it.
    const first = `${logFile}.${process.pid}.first`;
    fs.writeFileSync(first, line);
    try {
      fs.linkSync(first, logFile);
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    } finally {
      fs.unlinkSync(first);
    }
  }
  fs.appendFileSync(logFile, line);
}

if (args[0] === '--version') {
  process.stdout.write('codex-cli 0.172.0-stub\n');
  process.exit(0);
}

if (args[0] === 'debug' && args[1] === 'models' && args.includes('--bundled')) {
  process.stdout.write(
    `${JSON.stringify({
      models: [
        { slug: 'codex-stub-model', visibility: 'list' },
        { slug: 'codex-hidden-model', visibility: 'hide' },
      ],
    })}\n`,
  );
  process.exit(0);
}

if (args[0] === 'app-server' && args.includes('--stdio')) {
  appendLog({ kind: 'app-server', argv: args, cwd: process.cwd(), pid: process.pid });
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (msg.method === 'initialize' && msg.id !== undefined) {
      appendLog({ kind: 'app_server_initialize', pid: process.pid });
      if (mode === 'hang_on_initialize' || mode === 'app_server_hang_on_initialize') {
        setInterval(() => {}, 1000);
      } else if (mode === 'app_server_init_error_stay_alive') {
        setInterval(() => {}, 1000);
        process.stdout.write(`${JSON.stringify({ id: msg.id, error: { code: -32000, message: 'Handshake rejected' } })}\n`);
      } else {
        process.stdout.write(`${JSON.stringify({ id: msg.id, result: { serverInfo: { name: 'codex-stub', version: '0.172.0-stub' } } })}\n`);
      }
    } else if (msg.method === 'initialized') {
      appendLog({ kind: 'app_server_initialized', pid: process.pid });
    } else if (msg.method === 'plugin/list' && msg.id !== undefined) {
      process.stdout.write(`${JSON.stringify({ id: msg.id, result: { marketplaces: [], marketplaceLoadErrors: [] } })}\n`);
    } else if (msg.method === 'thread/start' && msg.id !== undefined) {
      appendLog({ kind: 'app_server_thread_start', pid: process.pid, params: msg.params ?? {} });
      if (mode === 'hang_on_thread_start' || mode === 'app_server_hang_on_thread_start') {
        setInterval(() => {}, 1000);
      } else {
        process.stdout.write(`${JSON.stringify({ id: msg.id, result: { threadId } })}\n`);
      }
    } else if (msg.method === 'thread/resume' && msg.id !== undefined) {
      appendLog({ kind: 'app_server_thread_resume', pid: process.pid, params: msg.params ?? {} });
      if (mode === 'hang_on_thread_resume' || mode === 'app_server_hang_on_thread_resume') {
        setInterval(() => {}, 1000);
      } else {
        const resumedThreadId =
          msg.params && typeof msg.params.threadId === 'string' && msg.params.threadId
            ? msg.params.threadId
            : threadId;
        process.stdout.write(`${JSON.stringify({ id: msg.id, result: { threadId: resumedThreadId } })}\n`);
      }
    } else if (msg.method === 'turn/start' && msg.id !== undefined) {
      appendLog({ kind: 'app_server_turn_start', pid: process.pid, params: msg.params ?? {} });
      const thisThread = msg.params.threadId;
      const turnId = 'turn-1';
      const send = (method, params) => process.stdout.write(`${JSON.stringify({ method, params: { threadId: thisThread, ...params } })}\n`);
      if (mode === 'hang_on_turn_start' || mode === 'app_server_hang_on_turn_start') {
        setInterval(() => {}, 1000);
      } else {
        if (mode === 'mcp_receipt') {
          for (const [otherThread, otherTurn] of [[thisThread, turnId], [thisThread, 'another-turn'], ['another-thread', turnId]]) {
            send('item/completed', { item: mcpCompletion(false), threadId: otherThread, turnId: otherTurn });
          }
          send('item/agentMessage/delta', { turnId: 'another-turn', itemId: 'msg', delta: 'foreign' });
          send('turn/completed', { turn: { id: 'another-turn', status: 'failed' } });
        }
        process.stdout.write(`${JSON.stringify({ id: msg.id, result: { turn: { id: 'turn-1' } } })}\n`);
        if (mode === 'app_server_crash_mid_turn') {
          setTimeout(() => process.exit(1), 15);
        } else if (mode === 'app_server_hang') {
          setInterval(() => {}, 1000);
        } else {
          setTimeout(() => {
            const text = 'AppServer stub response';
            send('item/agentMessage/delta', { turnId, itemId: 'msg', delta: text });
            send('item/completed', { turnId, item: { type: 'agentMessage', id: 'msg', text } });
            const tokens = { inputTokens: 120, cachedInputTokens: 20, outputTokens: 45,
              reasoningOutputTokens: 10, totalTokens: 165 };
            send('thread/tokenUsage/updated', { turnId, tokenUsage: { total: tokens, last: tokens } });
            const status = mode === 'provider_error' ? 'failed' : mode === 'turn_interrupted' ? 'interrupted' : 'completed';
            send('turn/completed', { turn: {
              id: turnId, status, error: status === 'failed' ? { message: 'Upstream status 400' } : null,
            } });
          }, 15);
        }
      }
    } else if (msg.method === 'turn/interrupt') {
      process.stdout.write(`${JSON.stringify({ method: 'turn/failed', params: { message: 'Interrupted' } })}\n`);
    }
  });
  process.on('SIGTERM', () => process.exit(0));
} else if (args[0] === 'exec') {
  let stdinText = '';
  if (!process.stdin.isTTY) {
    try {
      stdinText = fs.readFileSync(0, 'utf8');
    } catch {
      stdinText = '';
    }
  }
  const isResume = args[1] === 'resume';
  const effectiveThreadId = isResume
    ? (args[args.length - 2] || threadId)
    : threadId;

  appendLog({
    kind: isResume ? 'exec_resume' : 'exec',
    argv: args,
    cwd: process.cwd(),
    codexHome,
    stdinText,
  });

  const writeSessionJsonl = (lines) => {
    if (!codexHome) return;
    const sessDir = path.join(codexHome, 'sessions', '2026', '11', '25');
    fs.mkdirSync(sessDir, { recursive: true });
    const sessFile = path.join(sessDir, `rollout-${effectiveThreadId}.jsonl`);
    fs.writeFileSync(sessFile, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
  };

  if (mode === 'hang_ignore_sigterm') {
    process.on('SIGTERM', () => {
      // Intentionally ignore SIGTERM to test SIGKILL escalation
    });
    process.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: effectiveThreadId })}\n`);
    process.stdout.write(`${JSON.stringify({ type: 'turn.started' })}\n`);
    setInterval(() => {}, 1000);
  } else if (mode === 'hang_cooperative_sigterm') {
    process.on('SIGTERM', () => {
      process.exit(0);
    });
    process.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: effectiveThreadId })}\n`);
    process.stdout.write(`${JSON.stringify({ type: 'turn.started' })}\n`);
    setInterval(() => {}, 1000);
  } else if (mode === 'provider_error') {
    process.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: effectiveThreadId })}\n`);
    process.stdout.write(`${JSON.stringify({ type: 'error', message: 'Upstream status 503 unavailable' })}\n`);
    process.exit(1);
  } else if (mode === 'unsupported_function_call') {
    process.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: effectiveThreadId })}\n`);
    process.stdout.write(`${JSON.stringify({
      type: 'response_item',
      payload: { type: 'function_call', call_id: 'call-1', name: 'unknown_native_tool', arguments: '{}' },
    })}\n`);
    setTimeout(() => process.exit(1), 50);
  } else {
    const promptArg = stdinText || args[args.length - 1] || '';
    if (process.env.OPL_STUB_ARTIFACT_REL) {
      const target = path.join(process.cwd(), process.env.OPL_STUB_ARTIFACT_REL);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, process.env.OPL_STUB_ARTIFACT_CONTENT || '<svg><text>KM Curve</text></svg>');
    }

    const msgText = `Codex stub completed for: ${promptArg.slice(0, 120)}`;
    const events = [
      { type: 'thread.started', thread_id: effectiveThreadId },
      { type: 'turn.started' },
      ...(mode === 'mcp_receipt' ? [{ type: 'item.completed', item: mcpCompletion(true) }] : []),
      {
        type: 'item.completed',
        item: {
          id: 'cmd-1',
          type: 'command_execution',
          command: 'ls -la',
          status: 'completed',
          aggregated_output: 'ok',
        },
      },
      {
        type: 'item.completed',
        item: {
          id: 'msg-1',
          type: 'agent_message',
          text: msgText,
        },
      },
      {
        type: 'turn.completed',
        usage: {
          input_tokens: 210,
          cached_input_tokens: 40,
          output_tokens: 85,
          reasoning_output_tokens: 15,
          total_tokens: 295,
        },
      },
    ];

    for (const ev of events) {
      process.stdout.write(`${JSON.stringify(ev)}\n`);
    }

    writeSessionJsonl([
      { type: 'session_meta', timestamp: '2026-11-25T14:00:00Z', payload: { id: effectiveThreadId } },
      { type: 'event_msg', timestamp: '2026-11-25T14:00:01Z', payload: { type: 'agent_message', message: msgText } },
      {
        type: 'event_msg',
        timestamp: '2026-11-25T14:00:02Z',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 210,
              cached_input_tokens: 40,
              output_tokens: 85,
              reasoning_output_tokens: 15,
              total_tokens: 295,
            },
          },
        },
      },
      { type: 'event_msg', timestamp: '2026-11-25T14:00:03Z', payload: { type: 'task_complete', last_agent_message: msgText } },
    ]);
    process.exit(0);
  }
} else {
  process.stderr.write(`Unsupported stub-codex args: ${args.join(' ')}\n`);
  process.exit(2);
}
