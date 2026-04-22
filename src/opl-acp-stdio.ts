import { randomUUID } from 'node:crypto';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline';

import {
  AcpBridgePayloadError,
  translateArtifactsPayload,
  translateProgressPayload,
  translateSessionCreatePayload,
  translateSessionLedgerPayload,
  translateSessionLogsPayload,
  translateSessionResumePayload,
  translateWorkspaceListPayload,
} from './opl-acp-bridge.ts';
import { buildCodexExecArgs, parseCodexExecOutput, runCodexCommand } from './codex.ts';
import { loadGatewayContracts } from './contracts.ts';
import { buildSessionLedger, recordSessionLedgerEntry } from './session-ledger.ts';
import { buildWorkspaceCatalog } from './workspace-registry.ts';

type AcpStdioCommand =
  | 'initialize'
  | 'session_list'
  | 'session_ledger'
  | 'session_create'
  | 'session_resume'
  | 'session_logs'
  | 'progress'
  | 'artifacts'
  | 'workspace_list'
  | 'prompt'
  | 'session_updates';

type AcpStdioRequest = {
  id?: string;
  command?: string;
  payload?: unknown;
};

type AcpStdioResponse = {
  id: string | null;
  command: string | null;
  ok: boolean;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
};

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
  };
};

type BridgeUpdateEntry = {
  cursor: number;
  session_id: string;
  runtime_session_id: string | null;
  source: 'status' | 'assistant';
  text: string;
  created_at: string;
  message_id: string;
};

type BridgeSessionRecord = {
  sessionId: string;
  runtimeSessionId: string | null;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  lastPrompt: string | null;
  lastResponse: string | null;
  updates: BridgeUpdateEntry[];
};

type AcpStdioBridgeState = {
  initialized: boolean;
  supportedCommands: AcpStdioCommand[];
  sessions: Map<string, BridgeSessionRecord>;
};

const SUPPORTED_COMMANDS: AcpStdioCommand[] = [
  'initialize',
  'session_list',
  'session_ledger',
  'session_create',
  'session_resume',
  'session_logs',
  'progress',
  'artifacts',
  'workspace_list',
  'prompt',
  'session_updates',
];

function buildErrorResponse(
  request: AcpStdioRequest,
  code: string,
  message: string,
): AcpStdioResponse {
  return {
    id: typeof request.id === 'string' ? request.id : null,
    command: typeof request.command === 'string' ? request.command : null,
    ok: false,
    error: {
      code,
      message,
    },
  };
}

function buildJsonRpcResult(id: string | number | null, result: Record<string, unknown>): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

function buildJsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  };
}

function requireInitialized(state: AcpStdioBridgeState, request: AcpStdioRequest) {
  if (state.initialized) {
    return;
  }

  throw buildErrorResponse(
    request,
    'bridge_not_initialized',
    'ACP stdio bridge requires initialize before runtime commands.',
  );
}

function requireInitializedJsonRpc(state: AcpStdioBridgeState, request: JsonRpcRequest) {
  if (state.initialized) {
    return;
  }

  throw buildJsonRpcError(
    request.id ?? null,
    -32000,
    'ACP stdio bridge requires initialize before runtime methods.',
  );
}

function toRecord(value: unknown) {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readPositiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function splitResponseText(text: string, chunkSize = 80) {
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }
  return chunks;
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  const record = toRecord(value);
  if (!record) {
    return false;
  }
  return record.jsonrpc === '2.0' || typeof record.method === 'string';
}

function isAcpStdioResponse(value: unknown): value is AcpStdioResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return 'ok' in value && 'command' in value;
}

function createBridgeSession(
  state: AcpStdioBridgeState,
  options: {
    sessionId?: string;
    cwd?: string;
  } = {},
) {
  const sessionId = options.sessionId ?? `opl-acp-session-${randomUUID()}`;
  const existing = state.sessions.get(sessionId);
  if (existing) {
    if (options.cwd) {
      existing.cwd = options.cwd;
    }
    return existing;
  }

  const timestamp = new Date().toISOString();
  const session: BridgeSessionRecord = {
    sessionId,
    runtimeSessionId: null,
    cwd: options.cwd ?? process.cwd(),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastPrompt: null,
    lastResponse: null,
    updates: [],
  };
  state.sessions.set(sessionId, session);
  return session;
}

function requireBridgeSession(
  state: AcpStdioBridgeState,
  sessionId: string,
): BridgeSessionRecord {
  const session = state.sessions.get(sessionId);
  if (!session) {
    throw new AcpBridgePayloadError(`Unknown bridge session: ${sessionId}`);
  }
  return session;
}

function recordBridgeUpdate(
  session: BridgeSessionRecord,
  source: BridgeUpdateEntry['source'],
  text: string,
) {
  const entry: BridgeUpdateEntry = {
    cursor: session.updates.length + 1,
    session_id: session.sessionId,
    runtime_session_id: session.runtimeSessionId,
    source,
    text,
    created_at: new Date().toISOString(),
    message_id: source === 'assistant' ? 'opl-acp-assistant' : 'opl-acp-status',
  };
  session.updates.push(entry);
  session.updatedAt = entry.created_at;
  if (source === 'assistant') {
    session.lastResponse = text;
  }
  return entry;
}

function emitJsonRpcNotification(
  writable: NodeJS.WritableStream,
  method: string,
  params: Record<string, unknown>,
) {
  writable.write(
    `${JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
    })}\n`,
  );
}

function emitAssistantChunk(
  writable: NodeJS.WritableStream,
  session: BridgeSessionRecord,
  text: string,
) {
  const update = recordBridgeUpdate(session, 'assistant', text);
  emitJsonRpcNotification(writable, 'session/update', {
    sessionId: session.sessionId,
    update: {
      sessionUpdate: 'agent_message_chunk',
      messageId: update.message_id,
      content: {
        type: 'text',
        text,
      },
    },
  });
}

function emitStatusChunk(
  writable: NodeJS.WritableStream,
  session: BridgeSessionRecord,
  text: string,
) {
  recordBridgeUpdate(session, 'status', text);
  emitJsonRpcNotification(writable, 'session/update', {
    sessionId: session.sessionId,
    update: {
      sessionUpdate: 'agent_message_chunk',
      messageId: 'opl-acp-status',
      content: {
        type: 'text',
        text,
      },
    },
  });
}

function buildBridgeSessionList(state: AcpStdioBridgeState, payload: unknown) {
  const options = toRecord(payload) ?? {};
  const limit = readPositiveInteger(options.limit);
  const items = Array.from(state.sessions.values())
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit ?? Number.MAX_SAFE_INTEGER)
    .map((session) => ({
      session_id: session.sessionId,
      source: 'opl_acp_runtime',
      preview: session.lastResponse ?? session.lastPrompt,
      updated_at: session.updatedAt,
      runtime_session_id: session.runtimeSessionId,
    }));

  return {
    surface_id: 'opl_acp_session_list',
    mode: 'opl_acp_runtime_sessions',
    limit: limit ?? null,
    items,
  };
}

function buildBridgeSessionResume(state: AcpStdioBridgeState, payload: unknown) {
  const options = toRecord(payload) ?? {};
  const sessionId = readOptionalString(options.session_id) ?? readOptionalString(options.sessionId);
  if (!sessionId) {
    throw new AcpBridgePayloadError('ACP bridge payload 缺少字符串字段: session_id');
  }
  const session = requireBridgeSession(state, sessionId);

  return {
    surface_id: 'opl_acp_session_resume',
    session_id: session.sessionId,
    runtime_session_id: session.runtimeSessionId,
    output: session.lastResponse ?? '',
    exit_code: 0,
    command_preview: session.runtimeSessionId
      ? ['codex', 'exec', 'resume', session.runtimeSessionId, '<prompt>']
      : ['codex', 'exec', '<prompt>'],
  };
}

function buildBridgeSessionUpdates(state: AcpStdioBridgeState, payload: unknown) {
  const options = toRecord(payload) ?? {};
  const sessionId = readOptionalString(options.session_id) ?? readOptionalString(options.sessionId);
  if (!sessionId) {
    throw new AcpBridgePayloadError('ACP bridge payload 缺少字符串字段: session_id');
  }
  const cursor =
    typeof options.cursor === 'number' && Number.isInteger(options.cursor) && options.cursor >= 0
      ? options.cursor
      : 0;
  const session = requireBridgeSession(state, sessionId);
  const updates = session.updates.filter((entry) => entry.cursor > cursor);

  return {
    surface_id: 'opl_acp_session_updates',
    session_id: session.sessionId,
    runtime_session_id: session.runtimeSessionId,
    cursor,
    next_cursor: session.updates.at(-1)?.cursor ?? cursor,
    updates,
  };
}

function buildPromptText(params: Record<string, unknown>) {
  const prompt = Array.isArray(params.prompt) ? params.prompt : [];
  const promptText = prompt
    .map((entry) => {
      const block = toRecord(entry);
      if (!block || block.type !== 'text') {
        return null;
      }
      return readOptionalString(block.text) ?? null;
    })
    .filter((entry): entry is string => Boolean(entry))
    .join('\n')
    .trim();

  if (!promptText) {
    throw new AcpBridgePayloadError('ACP bridge payload 缺少字符串字段: prompt[0].text');
  }

  return promptText;
}

function readMetaResumeSessionId(params: Record<string, unknown>) {
  const meta = toRecord(params._meta);
  const claudeCode = toRecord(meta?.claudeCode);
  const options = toRecord(claudeCode?.options);
  return readOptionalString(options?.resume);
}

function buildCodexResumeArgs(sessionId: string, prompt: string) {
  return [
    'exec',
    'resume',
    '--skip-git-repo-check',
    '--full-auto',
    '--json',
    sessionId,
    prompt,
  ];
}

function executeBridgePrompt(
  session: BridgeSessionRecord,
  promptText: string,
) {
  const args = session.runtimeSessionId
    ? buildCodexResumeArgs(session.runtimeSessionId, promptText)
    : buildCodexExecArgs(promptText, {
        cwd: session.cwd,
        json: true,
      });

  const result = runCodexCommand(args);
  if (result.exitCode !== 0) {
    throw new AcpBridgePayloadError(result.stderr.trim() || 'Codex prompt failed inside ACP bridge.');
  }

  const parsed = parseCodexExecOutput(result.stdout);
  session.runtimeSessionId = parsed.threadId ?? session.runtimeSessionId;
  session.lastPrompt = promptText;
  session.lastResponse = parsed.finalMessage;
  session.updatedAt = new Date().toISOString();
  recordSessionLedgerEntry({
    sessionId: session.sessionId,
    mode: 'prompt',
    sourceSurface: 'opl_acp_stdio_bridge',
    goalPreview: promptText,
    workspaceLocator: {
      absolute_path: session.cwd,
      source: 'acp_runtime',
    },
  });

  return {
    args,
    parsed,
  };
}

function createJsonRpcInitializeResult(): Record<string, unknown> {
  return {
    protocolVersion: 1,
    agentInfo: {
      name: 'opl-session-runtime',
      version: '0.1.0',
    },
    agentCapabilities: {
      loadSession: true,
      promptCapabilities: {
        image: false,
        audio: false,
        embeddedContext: false,
      },
      mcpCapabilities: {},
      sessionCapabilities: {
        resume: {},
        list: {},
        close: {},
      },
      _meta: {
        opl: {
          surfaceId: 'opl_acp_stdio_bridge',
        },
      },
    },
  };
}

export function createAcpStdioBridgeState(): AcpStdioBridgeState {
  loadGatewayContracts();
  return {
    initialized: false,
    supportedCommands: [...SUPPORTED_COMMANDS],
    sessions: new Map(),
  };
}

export function handleAcpStdioRequest(
  request: AcpStdioRequest,
  state: AcpStdioBridgeState,
): AcpStdioResponse {
  const command = typeof request.command === 'string' ? request.command : null;
  if (!command) {
    return buildErrorResponse(request, 'invalid_request', 'ACP stdio bridge requires a command.');
  }

  if (!SUPPORTED_COMMANDS.includes(command as AcpStdioCommand)) {
    return buildErrorResponse(request, 'unknown_command', `Unsupported ACP stdio command: ${command}`);
  }

  try {
    switch (command as AcpStdioCommand) {
      case 'initialize':
        state.initialized = true;
        return {
          id: typeof request.id === 'string' ? request.id : null,
          command,
          ok: true,
          result: {
            surface_id: 'opl_acp_stdio_bridge',
            version: 'opl_acp_stdio_bridge.v2',
            commands: state.supportedCommands,
          },
        };
      case 'session_list':
        requireInitialized(state, request);
        return {
          id: typeof request.id === 'string' ? request.id : null,
          command,
          ok: true,
          result: buildBridgeSessionList(state, request.payload),
        };
      case 'session_ledger':
        requireInitialized(state, request);
        return {
          id: typeof request.id === 'string' ? request.id : null,
          command,
          ok: true,
          result: toRecord(translateSessionLedgerPayload(buildSessionLedger(readPositiveInteger(toRecord(request.payload)?.limit) ?? 20))) ?? {},
        };
      case 'session_create': {
        requireInitialized(state, request);
        const translated = translateSessionCreatePayload(request.payload ?? {});
        if (translated.session_id) {
          createBridgeSession(state, {
            sessionId: translated.session_id,
          });
        }
        return {
          id: typeof request.id === 'string' ? request.id : null,
          command,
          ok: true,
          result: toRecord(translated) ?? {},
        };
      }
      case 'session_resume': {
        requireInitialized(state, request);
        const payload = toRecord(request.payload);
        const legacyEnvelope = payload && 'session_resume' in payload;
        return {
          id: typeof request.id === 'string' ? request.id : null,
          command,
          ok: true,
          result: legacyEnvelope
            ? toRecord(translateSessionResumePayload(request.payload ?? {})) ?? {}
            : buildBridgeSessionResume(state, request.payload),
        };
      }
      case 'session_logs':
        requireInitialized(state, request);
        return {
          id: typeof request.id === 'string' ? request.id : null,
          command,
          ok: true,
          result: toRecord(translateSessionLogsPayload(request.payload ?? {})) ?? {},
        };
      case 'progress':
        requireInitialized(state, request);
        return {
          id: typeof request.id === 'string' ? request.id : null,
          command,
          ok: true,
          result: toRecord(translateProgressPayload(request.payload ?? {})) ?? {},
        };
      case 'artifacts':
        requireInitialized(state, request);
        return {
          id: typeof request.id === 'string' ? request.id : null,
          command,
          ok: true,
          result: toRecord(translateArtifactsPayload(request.payload ?? {})) ?? {},
        };
      case 'workspace_list':
        requireInitialized(state, request);
        return {
          id: typeof request.id === 'string' ? request.id : null,
          command,
          ok: true,
          result: toRecord(translateWorkspaceListPayload(buildWorkspaceCatalog(loadGatewayContracts()))) ?? {},
        };
      case 'prompt': {
        requireInitialized(state, request);
        const payload = toRecord(request.payload) ?? {};
        const sessionId = readOptionalString(payload.session_id) ?? `opl-acp-session-${randomUUID()}`;
        const prompt = readOptionalString(payload.prompt);
        if (!prompt) {
          throw new AcpBridgePayloadError('ACP bridge payload 缺少字符串字段: prompt');
        }
        const session = createBridgeSession(state, {
          sessionId,
          cwd: readOptionalString(payload.cwd),
        });
        const executed = executeBridgePrompt(session, prompt);
        return {
          id: typeof request.id === 'string' ? request.id : null,
          command,
          ok: true,
          result: {
            surface_id: 'opl_acp_prompt',
            session_id: session.sessionId,
            runtime_session_id: session.runtimeSessionId,
            stop_reason: 'end_turn',
            response: executed.parsed.finalMessage,
            command_preview: executed.args,
          },
        };
      }
      case 'session_updates':
        requireInitialized(state, request);
        return {
          id: typeof request.id === 'string' ? request.id : null,
          command,
          ok: true,
          result: buildBridgeSessionUpdates(state, request.payload),
        };
    }
  } catch (error) {
    if (isAcpStdioResponse(error)) {
      return error;
    }
    if (error instanceof AcpBridgePayloadError) {
      return buildErrorResponse(request, 'invalid_payload', error.message);
    }
    return buildErrorResponse(
      request,
      'bridge_internal_error',
      error instanceof Error ? error.message : 'Unknown ACP stdio bridge error.',
    );
  }
}

async function handleJsonRpcRequest(
  request: JsonRpcRequest,
  state: AcpStdioBridgeState,
  writable: NodeJS.WritableStream,
) {
  const method = typeof request.method === 'string' ? request.method : null;
  if (!method) {
    return buildJsonRpcError(request.id ?? null, -32600, 'ACP JSON-RPC request requires a method.');
  }

  try {
    switch (method) {
      case 'initialize':
        state.initialized = true;
        return buildJsonRpcResult(request.id ?? null, createJsonRpcInitializeResult());
      case 'session/new': {
        requireInitializedJsonRpc(state, request);
        const params = toRecord(request.params) ?? {};
        const session = createBridgeSession(state, {
          sessionId: readOptionalString(params.resumeSessionId) ?? readMetaResumeSessionId(params) ?? undefined,
          cwd: readOptionalString(params.cwd),
        });
        return buildJsonRpcResult(request.id ?? null, {
          sessionId: session.sessionId,
          modes: {
            currentModeId: 'default',
            availableModes: [{ id: 'default', name: 'Default' }],
          },
          configOptions: [],
          models: {
            currentModelId: 'codex-default',
            availableModels: [{ id: 'codex-default', name: 'Codex Default' }],
          },
        });
      }
      case 'session/load': {
        requireInitializedJsonRpc(state, request);
        const params = toRecord(request.params) ?? {};
        const sessionId = readOptionalString(params.sessionId);
        if (!sessionId) {
          return buildJsonRpcError(request.id ?? null, -32602, 'session/load requires sessionId.');
        }
        const session = requireBridgeSession(state, sessionId);
        if (readOptionalString(params.cwd)) {
          session.cwd = readOptionalString(params.cwd) ?? session.cwd;
        }
        return buildJsonRpcResult(request.id ?? null, {
          sessionId: session.sessionId,
          modes: {
            currentModeId: 'default',
            availableModes: [{ id: 'default', name: 'Default' }],
          },
          configOptions: [],
          models: {
            currentModelId: 'codex-default',
            availableModels: [{ id: 'codex-default', name: 'Codex Default' }],
          },
        });
      }
      case 'session/prompt': {
        requireInitializedJsonRpc(state, request);
        const params = toRecord(request.params) ?? {};
        const sessionId = readOptionalString(params.sessionId);
        if (!sessionId) {
          return buildJsonRpcError(request.id ?? null, -32602, 'session/prompt requires sessionId.');
        }
        const session = requireBridgeSession(state, sessionId);
        const promptText = buildPromptText(params);

        emitStatusChunk(writable, session, 'OPL ACP 正在通过 Codex 默认运行时处理当前会话请求。');
        const executed = executeBridgePrompt(session, promptText);
        for (const chunk of splitResponseText(executed.parsed.finalMessage)) {
          emitAssistantChunk(writable, session, chunk);
        }

        return buildJsonRpcResult(request.id ?? null, {
          stopReason: 'end_turn',
          sessionId: session.sessionId,
          runtimeSessionId: session.runtimeSessionId,
        });
      }
      case 'session/list': {
        requireInitializedJsonRpc(state, request);
        const params = toRecord(request.params) ?? {};
        const limit = readPositiveInteger(params.limit);
        return buildJsonRpcResult(request.id ?? null, {
          sessions: buildBridgeSessionList(state, { limit }).items,
        });
      }
      case 'session/cancel':
        return request.id === undefined ? null : buildJsonRpcResult(request.id ?? null, {});
      default:
        return buildJsonRpcError(request.id ?? null, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    if (error instanceof AcpBridgePayloadError) {
      return buildJsonRpcError(request.id ?? null, -32602, error.message);
    }
    return buildJsonRpcError(
      request.id ?? null,
      -32000,
      error instanceof Error ? error.message : 'Unknown ACP JSON-RPC bridge error.',
    );
  }
}

export async function runAcpStdioBridge(
  readable: NodeJS.ReadableStream = input,
  writable: NodeJS.WritableStream = output,
) {
  const state = createAcpStdioBridgeState();
  const lines = createInterface({
    input: readable,
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let request: AcpStdioRequest | JsonRpcRequest;
    try {
      request = JSON.parse(trimmed) as AcpStdioRequest | JsonRpcRequest;
    } catch (error) {
      writable.write(
        `${JSON.stringify(
          buildErrorResponse({}, 'invalid_json', error instanceof Error ? error.message : 'Invalid JSON line.'),
        )}\n`,
      );
      continue;
    }

    if (isJsonRpcRequest(request)) {
      const response = await handleJsonRpcRequest(request, state, writable);
      if (response) {
        writable.write(`${JSON.stringify(response)}\n`);
      }
      continue;
    }

    const response = handleAcpStdioRequest(request as AcpStdioRequest, state);
    writable.write(`${JSON.stringify(response)}\n`);
  }
}
