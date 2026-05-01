import { GatewayContractError, PassThrough, assert, buildManifestCommand, buildProjectProgressBrief, cliPath, contractsDir, createCodexConfigFixture, createContractsFixtureRoot, createFakeCodexFixture, createFakeHermesFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createFakePsFixture, createFakeShellCommandFixture, createFamilyContractsFixtureRoot, createFamilyLocatorResolverFixture, createGitModuleRemoteFixture, createMasWorkspaceFixture, explainDomainBoundary, familyManifestFixtureDir, fs, loadFamilyManifestFixtures, loadGatewayContracts, once, os, path, readJsonFixture, readJsonLine, repoRoot, resolveRequestSurface, runCli, runCliAsync, runCliFailure, runCliFailureInCwd, runCliInCwd, runCliRaw, runCliViaEntryPathInCwd, shellSingleQuote, spawn, startCliServer, startFakeOplApiServer, stopCliPipeChild, stopCliServer, stopHttpServer, test, validateGatewayContracts, writeJsonLine, assertContractsContext, assertNoContractsProvenance, assertMagActionGraph, assertMasActionGraph, assertRedcubeActionGraph } from '../helpers.ts';
import { buildInternalCommandSpecs } from '../../../../src/cli/cases/private-command-specs.ts';
import { buildPublicCommandSpecs } from '../../../../src/cli/cases/public-command-specs.ts';

test('mcp-stdio lists OPL tools and proxies session/workspace calls through the configured OPL product API', async () => {
  const fakeApi = await startFakeOplApiServer();
  const activatedWorkspacePath = '/tmp/opl-activated-workspace';

  try {
    const child = spawn(
      process.execPath,
      [
        '--experimental-strip-types',
        cliPath,
        'mcp-stdio',
        '--api-base-url',
        fakeApi.apiBaseUrl,
        '--workspace-path',
        repoRoot,
        '--sessions-limit',
        '7',
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
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'opl-test-client',
            version: '0.0.0-test',
          },
        },
      });
      const initialize = await readJsonLine(child.stdout);
      assert.equal(initialize.jsonrpc, '2.0');
      assert.equal(initialize.id, 1);
      assert.equal(
        (initialize.result as { capabilities: { tools: object } }).capabilities.tools !== undefined,
        true,
      );

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      });
      const toolsList = await readJsonLine(child.stdout);
      const tools = (toolsList.result as {
        tools: Array<{ name: string; description?: string }>;
      }).tools;
      assert.deepEqual(
        tools.map((tool) => tool.name).sort(),
        [
          'opl_execute_request',
          'opl_project_progress',
          'opl_session',
          'opl_task_status',
          'opl_workspace',
        ],
      );
      assert.match(
        tools.find((tool) => tool.name === 'opl_project_progress')?.description ?? '',
        /哪篇论文|讲什么故事/,
      );
      assert.match(
        tools.find((tool) => tool.name === 'opl_task_status')?.description ?? '',
        /任务|进度|阶段/,
      );

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'opl_workspace',
          arguments: {
            action: 'activate',
            project_id: 'medautoscience',
            workspace_path: activatedWorkspacePath,
          },
        },
      });
      const activateCall = await readJsonLine(child.stdout);
      const activateContent = (activateCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(activateContent[0].type, 'text');
      assert.match(activateContent[0].text, /已切换工作区/);
      assert.match(activateContent[0].text, /medautoscience/);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'opl_project_progress',
          arguments: {},
        },
      });
      const progressCall = await readJsonLine(child.stdout);
      const progressContent = (progressCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(progressContent[0].type, 'text');
      assert.match(progressContent[0].text, /当前工作区：opl-activated-workspace/);
      assert.match(progressContent[0].text, /当前论文：004-invasive-architecture/);
      assert.match(progressContent[0].text, /论文题目：NF-PitNET invasive phenotype architecture/);
      assert.match(progressContent[0].text, /论文主线：当前主线是首术 NF-PitNET 的侵袭表型 architecture/);
      assert.match(progressContent[0].text, /当前阶段：论文主体内容已经完成，当前进入投稿打包收口。/);
      assert.match(progressContent[0].text, /系统下一步：优先核对 submission package 与 studies 目录中的交付面是否一致。/);
      assert.match(progressContent[0].text, /当前进度：004 论文当前仍在推进证据补强/);
      assert.match(progressContent[0].text, /最近活动：2m ago/);
      assert.match(progressContent[0].text, /当前卡点：submission package 仍需补更多主图后再建议用户审阅/);
      assert.match(progressContent[0].text, /查看位置：/);
      assert.doesNotMatch(progressContent[0].text, /entry_parity_status/);
      assert.doesNotMatch(progressContent[0].text, /continue bundle stage/i);
      assert.doesNotMatch(progressContent[0].text, /current_stage_summary|next_system_action|contract/i);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'opl_workspace',
          arguments: {},
        },
      });
      const projectsCall = await readJsonLine(child.stdout);
      const projectsContent = (projectsCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(projectsContent[0].type, 'text');
      assert.match(projectsContent[0].text, /medautoscience/);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'opl_session',
          arguments: {
            action: 'list',
            limit: 3,
          },
        },
      });
      const sessionsCall = await readJsonLine(child.stdout);
      const sessionsContent = (sessionsCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(sessionsContent[0].type, 'text');
      assert.match(sessionsContent[0].text, /最近会话：1 条/);
      assert.match(sessionsContent[0].text, /sess-frontdoor-001/);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'opl_session',
          arguments: {
            action: 'logs',
            lines: 10,
          },
        },
      });
      const runtimeLogsCall = await readJsonLine(child.stdout);
      const runtimeLogsContent = (runtimeLogsCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(runtimeLogsContent[0].type, 'text');
      assert.match(runtimeLogsContent[0].text, /runtime heartbeat ok/);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'opl_task_status',
          arguments: {
            task_id: 'task-frontdoor-001',
          },
        },
      });
      const toolCall = await readJsonLine(child.stdout);
      const content = (toolCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(content[0].type, 'text');
      assert.match(content[0].text, /任务状态：运行中/);
      assert.match(content[0].text, /当前阶段：撰写中/);
      assert.doesNotMatch(content[0].text, /任务状态：running/);
      assert.doesNotMatch(content[0].text, /当前阶段：writing/);
      assert.equal(fakeApi.requests.some((request) =>
        request.path === '/api/opl/workspaces/activate'
        && request.body?.project_id === 'medautoscience'
        && request.body?.workspace_path === activatedWorkspacePath
      ), true);
      assert.equal(fakeApi.requests.some((request) =>
        request.path === '/api/opl/sessions'
        && request.query.limit === '3'
      ), true);
      assert.equal(fakeApi.requests.some((request) =>
        request.path === '/api/opl/sessions/logs'
        && request.query.lines === '10'
      ), true);
      assert.equal(fakeApi.requests.some((request) =>
        request.path === '/api/opl/progress'
        && request.query.task_id === 'task-frontdoor-001'
      ), true);
    } finally {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  } finally {
    await stopHttpServer(fakeApi.server);
  }
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
        }, 400);
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

test('mcp-stdio defaults to the current shell protocol version when the client does not negotiate one', async () => {
  const fakeApi = await startFakeOplApiServer();

  try {
    const child = spawn(
      process.execPath,
      [
        '--experimental-strip-types',
        cliPath,
        'mcp-stdio',
        '--api-base-url',
        fakeApi.apiBaseUrl,
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
        method: 'initialize',
        params: {
          capabilities: {},
          clientInfo: {
            name: 'opl-test-client',
            version: '0.0.0-test',
          },
        },
      });
      const initialize = await readJsonLine(child.stdout);
      assert.equal((initialize.result as { protocolVersion: string }).protocolVersion, '2025-03-26');
    } finally {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  } finally {
    await stopHttpServer(fakeApi.server);
  }
});
