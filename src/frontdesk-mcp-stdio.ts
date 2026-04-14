import readline from 'node:readline';

type JsonRpcId = string | number | null;

export type FrontDeskMcpBridgeOptions = {
  apiBaseUrl: string;
  workspacePath?: string;
  sessionsLimit?: number;
};

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (args: Record<string, unknown>, options: FrontDeskMcpBridgeOptions) => Promise<unknown>;
};

const SUPPORTED_PROTOCOL_VERSIONS = [
  '2025-11-05',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
] as const;
const DEFAULT_PROTOCOL_VERSION = '2025-03-26';

function writeJsonLine(payload: JsonRpcResponse) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeApiBaseUrl(apiBaseUrl: string) {
  const parsed = new URL(apiBaseUrl.trim());
  const pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.pathname = pathname || '/';
  return parsed.toString().replace(/\/$/, '');
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parsePositiveInteger(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }

  return parsed;
}

function buildUrl(
  apiBaseUrl: string,
  endpoint: string,
  query: Record<string, string | number | undefined>,
) {
  const url = new URL(`${normalizeApiBaseUrl(apiBaseUrl)}${endpoint}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url;
}

async function fetchJson(
  options: FrontDeskMcpBridgeOptions,
  endpoint: string,
  query: Record<string, string | number | undefined> = {},
) {
  const response = await fetch(buildUrl(options.apiBaseUrl, endpoint, query));
  const raw = await response.text();
  const payload = raw.trim().length > 0 ? JSON.parse(raw) as unknown : null;

  if (!response.ok) {
    throw new Error(
      `Frontdesk API request failed (${response.status}) at ${endpoint}: ${raw.trim() || 'empty response'}`,
    );
  }

  return payload;
}

function buildTextToolResult(payload: unknown, isError = false) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'opl_dashboard',
    description:
      '读取 OPL 顶层 dashboard，适合问当前 workspace 的总体进度、会话概览、frontdesk readiness 和运行状态。',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_path: {
          type: 'string',
          description: '可选。要查看的 workspace 绝对路径；默认使用桥接启动时传入的路径。',
        },
        sessions_limit: {
          type: 'integer',
          minimum: 1,
          description: '可选。返回最近多少条相关 session。',
        },
      },
      additionalProperties: false,
    },
    call: async (args, options) => {
      return await fetchJson(options, '/dashboard', {
        path: normalizeOptionalString(args.workspace_path) ?? options.workspacePath,
        sessions_limit: parsePositiveInteger(args.sessions_limit, 'sessions_limit') ?? options.sessionsLimit,
      });
    },
  },
  {
    name: 'opl_projects',
    description: '列出 OPL 当前可见的 family/domain 项目面。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    call: async (_args, options) => {
      return await fetchJson(options, '/projects');
    },
  },
  {
    name: 'opl_runtime_status',
    description: '读取 OPL runtime status，适合看当前 live session、近期 runs 和运行健康度。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          description: '可选。返回最近多少条 runtime 记录。',
        },
      },
      additionalProperties: false,
    },
    call: async (args, options) => {
      return await fetchJson(options, '/runtime-status', {
        limit: parsePositiveInteger(args.limit, 'limit'),
      });
    },
  },
  {
    name: 'opl_frontdesk_readiness',
    description: '读取 OPL frontdesk readiness，适合看当前入口 readiness、域绑定和下一步建议。',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_path: {
          type: 'string',
          description: '可选。要查看的 workspace 绝对路径；默认使用桥接启动时传入的路径。',
        },
        sessions_limit: {
          type: 'integer',
          minimum: 1,
          description: '可选。返回最近多少条相关 session。',
        },
      },
      additionalProperties: false,
    },
    call: async (args, options) => {
      return await fetchJson(options, '/frontdesk-readiness', {
        path: normalizeOptionalString(args.workspace_path) ?? options.workspacePath,
        sessions_limit: parsePositiveInteger(args.sessions_limit, 'sessions_limit') ?? options.sessionsLimit,
      });
    },
  },
  {
    name: 'opl_workspace_status',
    description: '读取某个 workspace 的 git/worktree 状态。',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_path: {
          type: 'string',
          description: '可选。要查看的 workspace 绝对路径；默认使用桥接启动时传入的路径。',
        },
      },
      additionalProperties: false,
    },
    call: async (args, options) => {
      return await fetchJson(options, '/workspace-status', {
        path: normalizeOptionalString(args.workspace_path) ?? options.workspacePath,
      });
    },
  },
  {
    name: 'opl_paperclip_status',
    description: '读取 OPL 到 Paperclip 的控制面桥接状态，包括映射、投影与 operator loop 状态。',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_path: {
          type: 'string',
          description: '可选。要查看的 workspace 绝对路径；默认使用桥接启动时传入的路径。',
        },
        sessions_limit: {
          type: 'integer',
          minimum: 1,
          description: '可选。返回最近多少条相关 session。',
        },
      },
      additionalProperties: false,
    },
    call: async (args, options) => {
      return await fetchJson(options, '/paperclip/control-plane', {
        path: normalizeOptionalString(args.workspace_path) ?? options.workspacePath,
        sessions_limit: parsePositiveInteger(args.sessions_limit, 'sessions_limit') ?? options.sessionsLimit,
      });
    },
  },
  {
    name: 'opl_domain_manifests',
    description: '读取当前域产品入口 manifest 汇总，适合看 family wiring 和 routed domain 的 product entry surface。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    call: async (_args, options) => {
      return await fetchJson(options, '/domain-manifests');
    },
  },
];

function buildToolList() {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

function findTool(name: string) {
  return TOOLS.find((tool) => tool.name === name) ?? null;
}

function buildErrorResponse(id: JsonRpcId, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data !== undefined ? { data } : {}),
    },
  } satisfies JsonRpcResponse;
}

async function handleRequest(
  request: JsonRpcRequest,
  options: FrontDeskMcpBridgeOptions,
): Promise<JsonRpcResponse | null> {
  if (request.jsonrpc !== '2.0') {
    return buildErrorResponse(request.id ?? null, -32600, 'Invalid JSON-RPC envelope.');
  }

  if (!request.method) {
    return buildErrorResponse(request.id ?? null, -32600, 'Missing JSON-RPC method.');
  }

  if (request.method === 'notifications/initialized') {
    return null;
  }

  if (request.method === 'initialize') {
    const params = isRecord(request.params) ? request.params : {};
    const requestedVersion = normalizeOptionalString(params.protocolVersion);
    const protocolVersion =
      requestedVersion && SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion as (typeof SUPPORTED_PROTOCOL_VERSIONS)[number])
        ? requestedVersion
        : DEFAULT_PROTOCOL_VERSION;

    return {
      jsonrpc: '2.0',
      id: request.id ?? null,
      result: {
        protocolVersion,
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: 'opl-frontdesk-mcp-bridge',
          version: '0.1.0',
        },
      },
    };
  }

  if (request.method === 'ping') {
    return {
      jsonrpc: '2.0',
      id: request.id ?? null,
      result: {},
    };
  }

  if (request.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: request.id ?? null,
      result: {
        tools: buildToolList(),
      },
    };
  }

  if (request.method === 'tools/call') {
    const params = isRecord(request.params) ? request.params : {};
    const name = normalizeOptionalString(params.name);
    if (!name) {
      return buildErrorResponse(request.id ?? null, -32602, 'tools/call requires a tool name.');
    }

    const tool = findTool(name);
    if (!tool) {
      return buildErrorResponse(request.id ?? null, -32601, `Unknown tool: ${name}.`);
    }

    const args = isRecord(params.arguments) ? params.arguments : {};
    try {
      const payload = await tool.call(args, options);
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: buildTextToolResult(payload),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown tool execution failure.';
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: buildTextToolResult(
          {
            error: message,
            tool: name,
          },
          true,
        ),
      };
    }
  }

  return buildErrorResponse(request.id ?? null, -32601, `Unsupported MCP method: ${request.method}.`);
}

export async function startFrontDeskMcpBridge(options: FrontDeskMcpBridgeOptions) {
  const normalizedOptions = {
    ...options,
    apiBaseUrl: normalizeApiBaseUrl(options.apiBaseUrl),
  } satisfies FrontDeskMcpBridgeOptions;

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed) as JsonRpcRequest;
    } catch (error) {
      writeJsonLine(
        buildErrorResponse(
          null,
          -32700,
          'Invalid JSON payload.',
          error instanceof Error ? error.message : 'Unknown parse failure.',
        ),
      );
      continue;
    }

    const response = await handleRequest(request, normalizedOptions);
    if (response) {
      writeJsonLine(response);
    }
  }
}
