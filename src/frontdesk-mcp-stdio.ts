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
  requestInit: {
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
  } = {},
) {
  const response = await fetch(buildUrl(options.apiBaseUrl, endpoint, query), {
    method: requestInit.method ?? 'GET',
    headers: requestInit.body ? {
      'content-type': 'application/json',
    } : undefined,
    body: requestInit.body ? JSON.stringify(requestInit.body) : undefined,
  });
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
        text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

function renderProjectProgressBrief(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.project_progress)) {
    return '当前没有读到可用的项目进度摘要。';
  }

  const brief = payload.project_progress;
  const currentProject = isRecord(brief.current_project) ? brief.current_project : {};
  const currentStudy = isRecord(brief.current_study) ? brief.current_study : null;
  const recentActivity = isRecord(brief.recent_activity) ? brief.recent_activity : null;
  const recommendedCommands = isRecord(brief.recommended_commands) ? brief.recommended_commands : {};
  const inspectPaths = Array.isArray(brief.inspect_paths)
    ? brief.inspect_paths.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const attentionItems = Array.isArray(brief.attention_items)
    ? brief.attention_items.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const userOptions = Array.isArray(brief.user_options)
    ? brief.user_options.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];

  const lines = [
    `当前项目：${normalizeOptionalString(currentProject.label) ?? '未绑定项目'}`,
  ];

  const workspacePath = normalizeOptionalString(currentProject.workspace_path);
  if (workspacePath) {
    lines.push(`默认 workspace：${workspacePath}`);
  }

  if (currentStudy) {
    const studyId = normalizeOptionalString(currentStudy.study_id);
    const title = normalizeOptionalString(currentStudy.title);
    const storySummary = normalizeOptionalString(currentStudy.story_summary);
    const currentStageSummary = normalizeOptionalString(currentStudy.current_stage_summary);
    const nextSystemAction = normalizeOptionalString(currentStudy.next_system_action);

    if (studyId) {
      lines.push(`当前论文：${studyId}`);
    }
    if (title) {
      lines.push(`论文题目：${title}`);
    }
    if (storySummary) {
      lines.push(`论文主线：${storySummary}`);
    }
    if (currentStageSummary) {
      lines.push(`当前阶段：${currentStageSummary}`);
    }
    if (nextSystemAction) {
      lines.push(`系统下一步：${nextSystemAction}`);
    }
  } else {
    lines.push('当前只能确认到项目级，暂时还不能锁定具体论文。');
  }

  lines.push(`当前进度：${normalizeOptionalString(brief.progress_summary) ?? '暂未读到结构化进度摘要。'}`);

  const nextFocus = normalizeOptionalString(brief.next_focus);
  if (nextFocus) {
    lines.push(`下一步：${nextFocus}`);
  }

  if (recentActivity) {
    const lastActive = normalizeOptionalString(recentActivity.last_active) ?? '未知时间';
    const source = normalizeOptionalString(recentActivity.source) ?? '未知来源';
    const preview = normalizeOptionalString(recentActivity.preview);
    lines.push(
      `最近活动：${lastActive}，来源 ${source}${preview ? `，摘要 ${preview}` : ''}。`,
    );
  } else {
    lines.push('最近活动：当前没有读到新的 runtime 会话活动。');
  }

  if (inspectPaths.length > 0) {
    lines.push(`查看位置：${inspectPaths.join('；')}`);
  }

  const progressCommand = normalizeOptionalString(recommendedCommands.progress);
  const resumeCommand = normalizeOptionalString(recommendedCommands.resume);
  const startCommand = normalizeOptionalString(recommendedCommands.start);
  const commandHints = [progressCommand, resumeCommand, startCommand].filter(Boolean) as string[];
  if (commandHints.length > 0) {
    lines.push(`可继续使用：${commandHints.join('；')}`);
  }

  if (attentionItems.length > 0) {
    lines.push(`当前需关注：${attentionItems.join('；')}`);
  }

  if (userOptions.length > 0) {
    lines.push(`你可以直接说：${userOptions.join('；')}`);
  }

  return lines.join('\n');
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'opl_project_progress',
    description:
      '当用户直接问“当前是哪篇论文、讲什么故事、进度如何、卡在哪里、下一步做什么”时优先使用。返回人类可读摘要，不返回控制面原始字段。',
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
          description: '可选。合并最近多少条 runtime session 来做摘要。',
        },
      },
      additionalProperties: false,
    },
    call: async (args, options) => {
      const payload = await fetchJson(options, '/project-progress', {
        path: normalizeOptionalString(args.workspace_path) ?? options.workspacePath,
        sessions_limit: parsePositiveInteger(args.sessions_limit, 'sessions_limit') ?? options.sessionsLimit,
      });
      return renderProjectProgressBrief(payload);
    },
  },
  {
    name: 'opl_frontdesk_entry_guide',
    description:
      '当 shell / agent 不确定该从哪个项目、哪个 start mode 或哪类 workspace 进入时优先使用。返回 OPL 当前 family-level entry guide 原始面。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    call: async (_args, options) => {
      return await fetchJson(options, '/frontdesk-entry-guide');
    },
  },
  {
    name: 'opl_dashboard',
    description:
      '读取 OPL 顶层 dashboard 原始控制面，适合调试 family wiring、readiness 和 runtime 细节；普通用户进度问答优先用 opl_project_progress。',
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
    name: 'opl_workspace_catalog',
    description: '读取 OPL 已绑定的 workspace 目录，适合查看当前有哪些项目/workspace 已接入前台。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    call: async (_args, options) => {
      return await fetchJson(options, '/workspace-catalog');
    },
  },
  {
    name: 'opl_activate_workspace',
    description: '激活一个已绑定的 workspace，并把当前聊天默认上下文切换到该 workspace。',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: '必填。要切换的项目 ID，例如 medautoscience 或 redcube。',
        },
        workspace_path: {
          type: 'string',
          description: '必填。要激活的 workspace 绝对路径。',
        },
      },
      required: ['project_id', 'workspace_path'],
      additionalProperties: false,
    },
    call: async (args, options) => {
      const projectId = normalizeOptionalString(args.project_id);
      const workspacePath = normalizeOptionalString(args.workspace_path);
      if (!projectId || !workspacePath) {
        throw new Error('opl_activate_workspace requires both project_id and workspace_path.');
      }

      const payload = await fetchJson(options, '/workspace-activate', {}, {
        method: 'POST',
        body: {
          project_id: projectId,
          workspace_path: workspacePath,
        },
      });
      options.workspacePath = workspacePath;
      return payload;
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
    description: '读取 OPL frontdesk readiness 原始面，适合调试入口 readiness、域绑定和下一步建议；普通进度问答优先用 opl_project_progress。',
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
    name: 'opl_frontdesk_librechat_status',
    description:
      '读取 OPL 当前 hosted shell / LibreChat pilot 的安装、运行与 drift 状态，适合 agent 判断本地托管壳是否可直接使用。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    call: async (_args, options) => {
      return await fetchJson(options, '/frontdesk-librechat-status');
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
    description: '读取当前域产品入口 manifest 汇总原始面，适合调试 family wiring 和 routed domain 的 product entry surface。',
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
