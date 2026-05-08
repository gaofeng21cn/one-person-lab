import { assert, cliPath, createFakeCodexFixture, fs, readJsonLine, repoRoot, runCliFailure, spawn, stopCliPipeChild, test, writeJsonLine } from '../helpers.ts';

test('mcp-stdio is retired and fails closed before opening a live MCP bridge', () => {
  const result = runCliFailure(['mcp-stdio']);

  assert.equal(result.status, 2);
  assert.equal(result.payload.error.code, 'cli_usage_error');
  assert.equal(result.payload.error.details.retired, true);
  assert.equal(result.payload.error.details.command, 'mcp-stdio');
  assert.match(result.payload.error.message, /Command "mcp-stdio" has been retired/);
  assert.match(result.payload.error.message, /OPL GUI \/ AionUI WebUI path/);
});

test('session runtime --acp exposes a callable stdio bridge entry for external shells', async () => {
  const child = spawn(
    process.execPath,
      [
        '--experimental-strip-types',
        cliPath,
        'session',
        'runtime',
        '--acp',
      ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  try {
    writeJsonLine(child.stdin, {
      id: 'bridge-init-1',
      command: 'initialize',
    });
    const initialize = await readJsonLine(child.stdout);
    assert.equal(initialize.id, 'bridge-init-1');
    assert.equal(initialize.command, 'initialize');
    assert.equal(initialize.ok, true);
    assert.equal((initialize.result as { surface_id: string }).surface_id, 'opl_acp_stdio_bridge');

    writeJsonLine(child.stdin, {
      id: 'bridge-create-1',
      command: 'session_create',
      payload: {
        version: 'g2',
        session_create: {
          surface_id: 'opl_session_create',
          request_mode: 'submitted',
          payload: {
            product_entry: {
              entry_surface: 'opl_session_api',
              mode: 'ask',
              seed: {
                session_id: 'sess-bridge-1',
              },
              task: {
                task_id: 'task-bridge-1',
                status: 'accepted',
                stage: 'queued',
                summary: 'request accepted',
                executor_backend: 'codex',
                session_id: null,
              },
            },
          },
        },
      },
    });
    const created = await readJsonLine(child.stdout);
    assert.equal(created.id, 'bridge-create-1');
    assert.equal(created.command, 'session_create');
    assert.equal(created.ok, true);
    assert.equal((created.result as { session_id: string }).session_id, 'sess-bridge-1');
    assert.equal(
      (created.result as { task_acceptance: { task_id: string } }).task_acceptance.task_id,
      'task-bridge-1',
    );
  } finally {
    await stopCliPipeChild(child);
  }
});

test('session runtime --acp supports ACP JSON-RPC lifecycle with prompt streaming and pollable session updates', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"opl-acp-thread-1"}
{"type":"turn.started"}
{"item":{"type":"agent_message","text":"ACP "}}
EOF
  sleep 1
  cat <<'EOF'
{"item":{"type":"agent_message","text":"HELLO FROM CODEX"}}
{"type":"turn.completed"}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  const child = spawn(
    process.execPath,
    [
      '--experimental-strip-types',
      cliPath,
      'session',
      'runtime',
      '--acp',
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_CODEX_BIN: codexPath,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  try {
    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: 1,
        clientCapabilities: {},
      },
    });
    const initialize = await readJsonLine(child.stdout);
    assert.equal(initialize.jsonrpc, '2.0');
    assert.equal(initialize.id, 1);
    assert.equal((initialize.result as { protocolVersion: number }).protocolVersion, 1);

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 2,
      method: 'session/new',
      params: {
        cwd: repoRoot,
        mcpServers: [],
      },
    });
    const sessionCreated = await readJsonLine(child.stdout);
    const bridgeSessionId = (sessionCreated.result as { sessionId: string }).sessionId;
    assert.match(bridgeSessionId, /^opl-acp-session-/);

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 22,
      method: 'session/set_mode',
      params: {
        sessionId: bridgeSessionId,
        modeId: 'default',
      },
    });
    const setModeResponse = await readJsonLine(child.stdout);
    assert.equal(setModeResponse.id, 22);
    assert.equal((setModeResponse.result as { modes: { currentModeId: string } }).modes.currentModeId, 'default');

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 3,
      method: 'session/prompt',
      params: {
        sessionId: bridgeSessionId,
        prompt: [{ type: 'text', text: 'Say hello from the OPL ACP bridge.' }],
      },
    });

    const notifications: Array<Record<string, unknown>> = [];
    const firstNotification = await Promise.race([
      readJsonLine(child.stdout),
      new Promise<Record<string, unknown>>((_, reject) => {
        setTimeout(() => {
          reject(new Error('ACP runtime did not emit a streaming assistant update before turn completion.'));
        }, 1500);
      }),
    ]);
    notifications.push(firstNotification);
    assert.equal(firstNotification.method, 'session/update');
    assert.equal(
      (
        firstNotification.params as {
          update?: { sessionUpdate?: string; content?: { type?: string; text?: string } };
        }
      ).update?.sessionUpdate,
      'agent_message_chunk',
    );
    assert.equal(
      (
        firstNotification.params as {
          update?: { content?: { type?: string; text?: string } };
        }
      ).update?.content?.text,
      'ACP ',
    );

    let promptResponse: Record<string, unknown> | null = null;
    while (!promptResponse) {
      const message = await readJsonLine(child.stdout);
      if (message.id === 3) {
        promptResponse = message;
        break;
      }
      notifications.push(message);
    }

    assert.equal((promptResponse.result as { stopReason: string }).stopReason, 'end_turn');
    assert.equal(
      notifications.some((entry) => entry.method === 'session/update'),
      true,
    );
    assert.equal(
      notifications.some((entry) => JSON.stringify(entry).includes('OPL ACP 正在通过 Codex 默认运行时处理当前会话请求。')),
      false,
    );
    assert.equal(
      notifications.some((entry) => JSON.stringify(entry).includes('Codex 已接管任务，会话 opl-acp-thread-1 已创建。')),
      false,
    );
    assert.equal(
      notifications.some((entry) => JSON.stringify(entry).includes('Codex 正在读取上下文并规划下一步。')),
      false,
    );
    assert.equal(
      notifications.some((entry) => JSON.stringify(entry).includes('"text":"ACP "')),
      true,
    );
    assert.equal(
      notifications.some((entry) => JSON.stringify(entry).includes('"text":"HELLO FROM CODEX"')),
      true,
    );

    writeJsonLine(child.stdin, {
      id: 'bridge-updates-1',
      command: 'session_updates',
      payload: {
        session_id: bridgeSessionId,
      },
    });
    const updates = await readJsonLine(child.stdout);
    assert.equal(updates.ok, true);
    assert.equal((updates.result as { session_id: string }).session_id, bridgeSessionId);
    assert.deepEqual(
      ((updates.result as { updates: Array<{ text: string; source: string }> }).updates).map((entry) => ({
        source: entry.source,
        text: entry.text,
      })),
      [
        { source: 'assistant', text: 'ACP ' },
        { source: 'assistant', text: 'HELLO FROM CODEX' },
      ],
    );

    writeJsonLine(child.stdin, {
      id: 'bridge-list-1',
      command: 'session_list',
      payload: {
        limit: 5,
      },
    });
    const listed = await readJsonLine(child.stdout);
    assert.equal(listed.ok, true);
    assert.equal(
      ((listed.result as { items: Array<{ session_id: string }> }).items).some((entry) =>
        entry.session_id === bridgeSessionId
      ),
      true,
    );
  } finally {
    await stopCliPipeChild(child);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('session runtime --acp loads existing bridge sessions and routes follow-up prompts through codex exec resume', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ] && [ "\${2:-}" = "resume" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"opl-acp-thread-1"}
{"type":"turn.started"}
{"item":{"type":"agent_message","text":"ACP RESUME TURN"}}
{"type":"turn.completed"}
EOF
  exit 0
fi
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"opl-acp-thread-1"}
{"type":"turn.started"}
{"item":{"type":"agent_message","text":"ACP INITIAL TURN"}}
{"type":"turn.completed"}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  const child = spawn(
    process.execPath,
    [
      '--experimental-strip-types',
      cliPath,
      'session',
      'runtime',
      '--acp',
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_CODEX_BIN: codexPath,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  try {
    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: 1,
        clientCapabilities: {},
      },
    });
    await readJsonLine(child.stdout);

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 2,
      method: 'session/new',
      params: {
        cwd: repoRoot,
      },
    });
    const created = await readJsonLine(child.stdout);
    const bridgeSessionId = (created.result as { sessionId: string }).sessionId;

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 3,
      method: 'session/prompt',
      params: {
        sessionId: bridgeSessionId,
        prompt: [{ type: 'text', text: 'First turn' }],
      },
    });
    while (true) {
      const message = await readJsonLine(child.stdout);
      if (message.id === 3) {
        break;
      }
    }

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 4,
      method: 'session/load',
      params: {
        sessionId: bridgeSessionId,
        cwd: repoRoot,
      },
    });
    const loaded = await readJsonLine(child.stdout);
    assert.equal((loaded.result as { sessionId: string }).sessionId, bridgeSessionId);

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 5,
      method: 'session/prompt',
      params: {
        sessionId: bridgeSessionId,
        prompt: [{ type: 'text', text: 'Follow-up turn' }],
      },
    });

    let resumedPrompt: Record<string, unknown> | null = null;
    const resumedNotifications: Array<Record<string, unknown>> = [];
    while (!resumedPrompt) {
      const message = await readJsonLine(child.stdout);
      if (message.id === 5) {
        resumedPrompt = message;
        break;
      }
      resumedNotifications.push(message);
    }

    assert.equal((resumedPrompt.result as { stopReason: string }).stopReason, 'end_turn');
    assert.equal(
      resumedNotifications.some((entry) =>
        JSON.stringify(entry).includes('ACP RESUME TURN')
      ),
      true,
    );
  } finally {
    await stopCliPipeChild(child);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('session runtime --acp fails closed for unsupported ACP methods', async () => {
  const child = spawn(
    process.execPath,
    [
      '--experimental-strip-types',
      cliPath,
      'session',
      'runtime',
      '--acp',
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  try {
    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 1,
      method: 'unknown/method',
      params: {},
    });
    const response = await readJsonLine(child.stdout);
    assert.equal(response.jsonrpc, '2.0');
    assert.equal(response.id, 1);
    assert.equal((response.error as { code: number }).code, -32601);
  } finally {
    await stopCliPipeChild(child);
  }
});
