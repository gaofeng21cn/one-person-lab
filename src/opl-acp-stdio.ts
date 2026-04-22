import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline';

import {
  AcpBridgePayloadError,
  translateArtifactsPayload,
  translateProgressPayload,
  translateSessionLedgerPayload,
  translateSessionListPayload,
  translateSessionCreatePayload,
  translateSessionLogsPayload,
  translateSessionResumePayload,
  translateWorkspaceListPayload,
} from './opl-acp-bridge.ts';
import { loadGatewayContracts } from './contracts.ts';
import { runProductEntrySessions } from './product-entry.ts';
import { buildSessionLedger } from './session-ledger.ts';
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
  | 'workspace_list';

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

type AcpStdioBridgeState = {
  initialized: boolean;
  supportedCommands: AcpStdioCommand[];
  commandResolvers: {
    session_list: (payload: unknown) => unknown;
    session_ledger: (payload: unknown) => unknown;
    workspace_list: (payload: unknown) => unknown;
  };
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

export function createAcpStdioBridgeState(): AcpStdioBridgeState {
  const contracts = loadGatewayContracts();
  return {
    initialized: false,
    supportedCommands: [...SUPPORTED_COMMANDS],
    commandResolvers: {
      session_list: (payload) => {
        const options =
          typeof payload === 'object' && payload !== null && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : {};
        return runProductEntrySessions({
          limit: readPositiveInteger(options.limit),
          source: readOptionalString(options.source),
        });
      },
      session_ledger: (payload) => {
        const options =
          typeof payload === 'object' && payload !== null && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : {};
        return buildSessionLedger(readPositiveInteger(options.limit) ?? 20);
      },
      workspace_list: () => buildWorkspaceCatalog(contracts),
    },
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
            version: 'opl_acp_stdio_bridge.v1',
            commands: state.supportedCommands,
          },
        };
      case 'session_list':
        requireInitialized(state, request);
        return {
          id: typeof request.id === 'string' ? request.id : null,
          command,
          ok: true,
          result: toRecord(translateSessionListPayload(state.commandResolvers.session_list(request.payload))) ?? {},
        };
      case 'session_ledger':
        requireInitialized(state, request);
        return {
          id: typeof request.id === 'string' ? request.id : null,
          command,
          ok: true,
          result: toRecord(translateSessionLedgerPayload(state.commandResolvers.session_ledger(request.payload))) ?? {},
        };
      case 'session_create':
        requireInitialized(state, request);
        return {
          id: typeof request.id === 'string' ? request.id : null,
          command,
          ok: true,
          result: toRecord(translateSessionCreatePayload(request.payload ?? {})) ?? {},
        };
      case 'session_resume':
        requireInitialized(state, request);
        return {
          id: typeof request.id === 'string' ? request.id : null,
          command,
          ok: true,
          result: toRecord(translateSessionResumePayload(request.payload ?? {})) ?? {},
        };
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
          result: toRecord(translateWorkspaceListPayload(state.commandResolvers.workspace_list(request.payload))) ?? {},
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

function isAcpStdioResponse(value: unknown): value is AcpStdioResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return 'ok' in value && 'command' in value;
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

    let request: AcpStdioRequest;
    try {
      request = JSON.parse(trimmed) as AcpStdioRequest;
    } catch (error) {
      writable.write(
        `${JSON.stringify(buildErrorResponse({}, 'invalid_json', error instanceof Error ? error.message : 'Invalid JSON line.'))}\n`,
      );
      continue;
    }

    const response = handleAcpStdioRequest(request, state);
    writable.write(`${JSON.stringify(response)}\n`);
  }
}
