import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const cliPath = path.join(repoRoot, 'src', 'cli.ts');

type JsonRpcTestResponse = {
  id?: string | number | null;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
  };
};

function createFakeCodexFixture(handlerBody: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-fixture-'));
  const codexPath = path.join(fixtureRoot, 'codex');
  fs.writeFileSync(
    codexPath,
    `#!/usr/bin/env bash
set -euo pipefail
${handlerBody}
`,
    { mode: 0o755 },
  );
  return {
    fixtureRoot,
    codexPath,
  };
}

function createJsonLineReader(stream: Readable) {
  const lines = createInterface({
    input: stream,
    crlfDelay: Infinity,
  });
  const iterator = lines[Symbol.asyncIterator]();

  return {
    async read() {
      const next = await iterator.next();
      if (next.done) {
        throw new Error('ACP bridge closed before returning the next JSON line.');
      }
      const line = next.value.trim();
      if (!line) {
        throw new Error('Received empty JSON line from ACP bridge.');
      }
      return JSON.parse(line) as JsonRpcTestResponse;
    },
    close() {
      lines.close();
    },
  };
}

function writeJsonLine(stream: NodeJS.WritableStream, payload: Record<string, unknown>) {
  stream.write(`${JSON.stringify(payload)}\n`);
}

function spawnAcpRuntime(codexPath?: string) {
  return spawn(
    process.execPath,
    ['--experimental-strip-types', cliPath, 'session', 'runtime', '--acp'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...(codexPath ? { OPL_CODEX_BIN: codexPath } : {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
}

test('acp json-rpc prompt lifecycle keeps mode compatibility without leaking bridge status chatter into chat output', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"opl-acp-thread-1"}
{"type":"turn.started"}
EOF
  sleep 6
  cat <<'EOF'
{"item":{"type":"agent_message","text":"ACP HELLO FROM CODEX"}}
{"type":"turn.completed"}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  const child = spawnAcpRuntime(codexPath);
  const reader = createJsonLineReader(child.stdout);

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
    await reader.read();

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 2,
      method: 'session/new',
      params: {
        cwd: repoRoot,
      },
    });
    const created = await reader.read();
    const bridgeSessionId = (created.result as { sessionId: string }).sessionId;

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 3,
      method: 'session/set_mode',
      params: {
        sessionId: bridgeSessionId,
        modeId: 'default',
      },
    });
    const setMode = await reader.read();
    assert.equal((setMode.result as { modes: { currentModeId: string } }).modes.currentModeId, 'default');

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 4,
      method: 'session/prompt',
      params: {
        sessionId: bridgeSessionId,
        prompt: [{ type: 'text', text: 'Say hello from the OPL ACP bridge.' }],
      },
    });

    const notifications: Array<Record<string, unknown>> = [];
    let promptResponse: Record<string, unknown> | null = null;
    while (!promptResponse) {
      const message = await reader.read();
      if (message.id === 4) {
        promptResponse = message;
        break;
      }
      notifications.push(message);
    }

    assert.equal((promptResponse.result as { stopReason: string }).stopReason, 'end_turn');
    assert.equal(
      notifications.some(
        (entry) =>
          (entry.params as { update?: { sessionUpdate?: string } } | undefined)?.update?.sessionUpdate ===
          'user_message_chunk',
      ),
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
      notifications.some((entry) => JSON.stringify(entry).includes('ACP HELLO FROM CODEX')),
      true,
    );
  } finally {
    reader.close();
    child.stdin.end();
    child.kill();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('acp json-rpc load resumes bridge sessions through codex exec resume', async () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ] && [ "\${2:-}" = "resume" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"opl-acp-thread-2"}
{"type":"turn.started"}
{"item":{"type":"agent_message","text":"ACP RESUME TURN"}}
{"type":"turn.completed"}
EOF
  exit 0
fi
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"opl-acp-thread-2"}
{"type":"turn.started"}
{"item":{"type":"agent_message","text":"ACP INITIAL TURN"}}
{"type":"turn.completed"}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  const child = spawnAcpRuntime(codexPath);
  const reader = createJsonLineReader(child.stdout);

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
    await reader.read();

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 2,
      method: 'session/new',
      params: {
        cwd: repoRoot,
      },
    });
    const created = await reader.read();
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
      const message = await reader.read();
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
    const loaded = await reader.read();
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
      const message = await reader.read();
      if (message.id === 5) {
        resumedPrompt = message;
        break;
      }
      resumedNotifications.push(message);
    }

    assert.equal((resumedPrompt.result as { stopReason: string }).stopReason, 'end_turn');
    assert.equal(
      resumedNotifications.some((entry) => JSON.stringify(entry).includes('ACP RESUME TURN')),
      true,
    );
  } finally {
    reader.close();
    child.stdin.end();
    child.kill();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('acp json-rpc lifecycle fails closed for unsupported methods', async () => {
  const child = spawnAcpRuntime();
  const reader = createJsonLineReader(child.stdout);

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
    await reader.read();

    writeJsonLine(child.stdin, {
      jsonrpc: '2.0',
      id: 2,
      method: 'session/delete',
      params: {},
    });
    const response = await reader.read();
    assert.equal(response.error?.code, -32601);
    assert.match(String(response.error?.message), /Method not found: session\/delete/);
  } finally {
    reader.close();
    child.stdin.end();
    child.kill();
  }
});
