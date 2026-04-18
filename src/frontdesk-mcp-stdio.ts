import readline from 'node:readline';

import { inferFrontDeskWorkspaceLabel } from './frontdesk-librechat-identity.ts';
import {
  readStatusNarrationContract,
  statusNarrationLatestUpdate,
  statusNarrationNextStep,
  statusNarrationStageSummary,
} from './status-narration.ts';

type JsonRpcId = string | number | null;

export type FrontDeskMcpBridgeOptions = {
  apiBaseUrl: string;
  workspacePath?: string;
  sessionsLimit?: number;
};

type FrontDeskMcpBridgeState = {
  titleSyncInFlight: boolean;
  lastTitleSyncAt: number;
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
const TITLE_SYNC_COOLDOWN_MS = 15_000;

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

function normalizeStringArray(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') {
    return [] as string[];
  }

  const items = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : null;

  if (!items) {
    throw new Error(`${field} must be an array of strings or a comma-separated string.`);
  }

  return items
    .map((entry) => normalizeOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function parseOptionalBoolean(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  throw new Error(`${field} must be a boolean.`);
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

function buildJsonAppendix(payload: unknown) {
  return `\n\n原始返回：\n${JSON.stringify(payload, null, 2)}`;
}

function containsInternalPhrase(value: string) {
  return /(entry_parity_status|continue bundle stage|contract|surface_id|routing_status|boundary_status|current_stage_summary|next_system_action)/i.test(value);
}

function toHumanLine(label: string, value: string | null | undefined, lines: string[]) {
  if (!value) {
    return;
  }
  if (containsInternalPhrase(value)) {
    return;
  }
  lines.push(`${label}：${value}`);
}

function renderProjectProgressBrief(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.project_progress)) {
    return '当前没有读到可用的项目进度摘要。';
  }

  const brief = payload.project_progress;
  const currentProject = isRecord(brief.current_project) ? brief.current_project : {};
  const currentStudy = isRecord(brief.current_study) ? brief.current_study : null;
  const paperSnapshot = currentStudy && isRecord(currentStudy.paper_snapshot) ? currentStudy.paper_snapshot : null;
  const recentActivity = isRecord(brief.recent_activity) ? brief.recent_activity : null;
  const inspectPaths = Array.isArray(brief.inspect_paths)
    ? brief.inspect_paths.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const attentionItems = Array.isArray(brief.attention_items)
    ? brief.attention_items.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const userOptions = Array.isArray(brief.user_options)
    ? brief.user_options.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];

  const workspacePath = normalizeOptionalString(currentProject.workspace_path);
  const workspaceLabel = inferFrontDeskWorkspaceLabel({
    workspacePath,
    fallbackLabel: normalizeOptionalString(currentProject.label) ?? null,
  });
  const lines = [`当前工作区：${workspaceLabel}`];

  if (workspacePath) {
    lines.push(`工作区路径：${workspacePath}`);
  }

  if (currentStudy) {
    const narrationContract = readStatusNarrationContract(currentStudy.status_narration_contract);
    const studyId = normalizeOptionalString(currentStudy.study_id);
    const title = normalizeOptionalString(currentStudy.title);
    const storySummary = normalizeOptionalString(currentStudy.story_summary);
    const clinicalQuestion = normalizeOptionalString(currentStudy.clinical_question);
    const innovationSummary = normalizeOptionalString(currentStudy.innovation_summary);
    const effectSummary =
      normalizeOptionalString(currentStudy.current_effect_summary)
      ?? normalizeOptionalString(paperSnapshot?.current_effect_summary);
    const currentStageSummary =
      statusNarrationLatestUpdate(narrationContract)
      ?? normalizeOptionalString(currentStudy.current_stage_summary)
      ?? statusNarrationStageSummary(narrationContract);
    const nextSystemAction =
      statusNarrationNextStep(narrationContract)
      ?? normalizeOptionalString(currentStudy.next_system_action);
    const mainFigureCount = typeof paperSnapshot?.main_figure_count === 'number' ? paperSnapshot.main_figure_count : null;
    const supplementaryFigureCount =
      typeof paperSnapshot?.supplementary_figure_count === 'number' ? paperSnapshot.supplementary_figure_count : null;
    const mainTableCount = typeof paperSnapshot?.main_table_count === 'number' ? paperSnapshot.main_table_count : null;
    const supplementaryTableCount =
      typeof paperSnapshot?.supplementary_table_count === 'number' ? paperSnapshot.supplementary_table_count : null;
    const referenceCount = typeof paperSnapshot?.reference_count === 'number' ? paperSnapshot.reference_count : null;
    const pageCount = typeof paperSnapshot?.page_count === 'number' ? paperSnapshot.page_count : null;
    const materializedSummary = [
      mainFigureCount !== null ? `${mainFigureCount} 张主图` : null,
      supplementaryFigureCount ? `${supplementaryFigureCount} 张补充图` : null,
      mainTableCount !== null ? `${mainTableCount} 张主表` : null,
      supplementaryTableCount ? `${supplementaryTableCount} 张附表` : null,
      referenceCount !== null ? `${referenceCount} 篇参考文献` : null,
      pageCount !== null ? `${pageCount} 页 PDF` : null,
    ].filter(Boolean).join('，');

    toHumanLine('当前论文', studyId, lines);
    toHumanLine('论文题目', title, lines);
    toHumanLine('临床问题', clinicalQuestion, lines);
    toHumanLine('论文主线', storySummary, lines);
    if (innovationSummary && innovationSummary !== storySummary) {
      toHumanLine('创新点', innovationSummary, lines);
    }
    toHumanLine('当前结果', effectSummary, lines);
    toHumanLine('稿件物化', materializedSummary || undefined, lines);
    toHumanLine('当前阶段', currentStageSummary, lines);
    toHumanLine('系统下一步', nextSystemAction, lines);
  } else {
    lines.push('当前只能确认到项目级，暂时还不能锁定具体论文。');
  }

  toHumanLine('当前进度', normalizeOptionalString(brief.progress_summary), lines);
  toHumanLine('下一步', normalizeOptionalString(brief.next_focus), lines);

  if (recentActivity) {
    const lastActive = normalizeOptionalString(recentActivity.last_active) ?? '未知时间';
    const preview = normalizeOptionalString(recentActivity.preview);
    lines.push(`最近活动：${lastActive}${preview ? `，${preview}` : ''}`);
  } else {
    lines.push('最近活动：当前没有读到新的 runtime 会话活动。');
  }

  const humanAttentionItems = attentionItems.filter((entry) => !containsInternalPhrase(entry));
  if (humanAttentionItems.length > 0) {
    lines.push(`当前卡点：${humanAttentionItems.join('；')}`);
  }

  if (inspectPaths.length > 0) {
    lines.push(`查看位置：${inspectPaths.join('；')}`);
  }

  if (userOptions.length > 0) {
    lines.push(`你可以直接说：${userOptions.join('；')}`);
  }

  return lines.join('\n');
}

function renderExecuteRequestBrief(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.product_entry)) {
    return `当前没有拿到可用的执行结果。${buildJsonAppendix(payload)}`;
  }

  const productEntry = payload.product_entry;
  const input = isRecord(productEntry.input) ? productEntry.input : null;
  const task = isRecord(productEntry.task) ? productEntry.task : null;
  const goal = normalizeOptionalString(input?.goal);
  const taskId = normalizeOptionalString(task?.task_id);
  const status = normalizeOptionalString(task?.status);
  const sessionId = normalizeOptionalString(task?.session_id);
  const summary = normalizeOptionalString(task?.summary);

  const lines = ['任务已受理。'];
  if (goal) {
    lines.push(`目标：${goal}`);
  }
  if (taskId) {
    lines.push(`任务编号：${taskId}`);
  }
  if (status) {
    lines.push(`当前状态：${status}`);
  }
  if (summary) {
    lines.push(`当前说明：${summary}`);
  }
  if (sessionId) {
    lines.push(`Hermes 会话：${sessionId}`);
  }
  lines.push('如需继续追踪，直接问“这个任务现在进展如何”，或调用任务状态工具。');
  return lines.join('\n');
}

function renderRecentSessionsBrief(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.product_entry)) {
    return `当前没有拿到最近会话列表。${buildJsonAppendix(payload)}`;
  }

  const productEntry = payload.product_entry;
  const sessions = Array.isArray(productEntry.sessions)
    ? productEntry.sessions.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  const lines = [`最近会话：${sessions.length} 条。`];

  for (const session of sessions.slice(0, 5)) {
    const sessionId = normalizeOptionalString(session.session_id) ?? 'unknown-session';
    const lastActive = normalizeOptionalString(session.last_active) ?? '未知时间';
    const preview = normalizeOptionalString(session.preview);
    lines.push(`${sessionId} | ${lastActive}${preview ? ` | ${preview}` : ''}`);
  }

  return lines.join('\n');
}

function renderResumeSessionBrief(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.product_entry) || !isRecord(payload.product_entry.resume)) {
    return `当前没有拿到可用的恢复结果。${buildJsonAppendix(payload)}`;
  }

  const resume = payload.product_entry.resume;
  const sessionId = normalizeOptionalString(resume.session_id);
  const output = normalizeOptionalString(resume.output);
  const lines = ['已恢复先前会话。'];
  if (sessionId) {
    lines.push(`会话：${sessionId}`);
  }
  if (output) {
    lines.push(`最近输出：${output}`);
  }
  return lines.join('\n');
}

function renderRuntimeLogsBrief(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.product_entry)) {
    return `当前没有拿到日志。${buildJsonAppendix(payload)}`;
  }

  const productEntry = payload.product_entry;
  const rawOutput = normalizeOptionalString(productEntry.raw_output);
  const logName = normalizeOptionalString(productEntry.log_name);
  const sessionId = normalizeOptionalString(productEntry.session_id);
  const lines = ['最近日志：'];
  if (logName) {
    lines.push(`日志名：${logName}`);
  }
  if (sessionId) {
    lines.push(`会话：${sessionId}`);
  }
  if (rawOutput) {
    lines.push(rawOutput);
  } else {
    lines.push('当前没有读到新的日志内容。');
  }
  return lines.join('\n');
}

function renderTaskStatusBrief(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.product_entry) || !isRecord(payload.product_entry.task)) {
    return `当前没有拿到任务状态。${buildJsonAppendix(payload)}`;
  }

  const task = payload.product_entry.task;
  const taskId = normalizeOptionalString(task.task_id) ?? 'unknown-task';
  const status = normalizeOptionalString(task.status) ?? '未知';
  const summary = normalizeOptionalString(task.summary);
  const stage = normalizeOptionalString(task.stage);
  const sessionId = normalizeOptionalString(task.session_id);
  const recentOutput = normalizeOptionalString(task.recent_output);
  const lines = [
    `任务编号：${taskId}`,
    `任务状态：${status}`,
  ];

  if (stage) {
    lines.push(`当前阶段：${stage}`);
  }
  if (summary) {
    lines.push(`当前说明：${summary}`);
  }
  if (sessionId) {
    lines.push(`Hermes 会话：${sessionId}`);
  }
  if (recentOutput) {
    lines.push(`最近输出：${recentOutput}`);
  }

  return lines.join('\n');
}

function renderWorkspaceBrief(payload: unknown, action: 'list' | 'activate') {
  if (action === 'activate') {
    const binding = isRecord(payload) && isRecord(payload.workspace_binding)
      ? payload.workspace_binding
      : isRecord(payload) && isRecord(payload.workspace_catalog) && isRecord(payload.workspace_catalog.binding)
        ? payload.workspace_catalog.binding
        : null;
    if (!binding) {
      return `当前没有拿到可用的 workspace 切换结果。${buildJsonAppendix(payload)}`;
    }
    const projectId = normalizeOptionalString(binding.project_id);
    const workspacePath = normalizeOptionalString(binding.workspace_path);
    const lines = ['已切换工作区。'];
    if (projectId) {
      lines.push(`项目：${projectId}`);
    }
    if (workspacePath) {
      lines.push(`路径：${workspacePath}`);
    }
    return lines.join('\n');
  }

  if (!isRecord(payload) || !Array.isArray(payload.projects)) {
    return `当前没有拿到项目与 workspace 列表。${buildJsonAppendix(payload)}`;
  }

  const lines = [`当前项目：${payload.projects.length} 个。`];
  for (const item of payload.projects.slice(0, 8)) {
    if (!isRecord(item)) {
      continue;
    }
    const projectId = normalizeOptionalString(item.project_id) ?? 'unknown-project';
    const label = normalizeOptionalString(item.label);
    const workspacePath = normalizeOptionalString(item.active_workspace_path);
    lines.push([projectId, label, workspacePath].filter(Boolean).join(' | '));
  }
  return lines.join('\n');
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'opl_project_progress',
    description:
      '当用户直接问当前是哪篇论文、讲什么故事、进度如何时优先使用。返回论文题目、临床问题、当前结果、图表与参考文献计数、卡点和下一步；不要回传控制面原始字段。',
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
    name: 'opl_execute_request',
    description:
      '当用户要求你继续推进、恢复、重启、整理、打包、检查并处理某件事时优先使用。它会真正提交执行请求，而不是只解释状态。',
    inputSchema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: '必填。要执行的自然语言目标。',
        },
        intent: {
          type: 'string',
          description: '可选。执行意图，默认 create。',
        },
        target: {
          type: 'string',
          description: '可选。执行目标类型，默认 deliverable。',
        },
        preferred_family: {
          type: 'string',
          description: '可选。希望优先落到的 family，例如 paper。',
        },
        request_kind: {
          type: 'string',
          description: '可选。更细的请求分类。',
        },
        workspace_path: {
          type: 'string',
          description: '可选。显式指定要执行的 workspace 绝对路径。',
        },
        skills: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: '可选。希望随 handoff 一起传递的技能名列表。',
        },
        dry_run: {
          type: 'boolean',
          description: '可选。若为 true，只预演 handoff，不真正执行。',
        },
      },
      required: ['goal'],
      additionalProperties: false,
    },
    call: async (args, options) => {
      const goal = normalizeOptionalString(args.goal);
      if (!goal) {
        throw new Error('opl_execute_request requires a non-empty goal.');
      }

      const payload = await fetchJson(options, '/ask', {}, {
        method: 'POST',
        body: {
          goal,
          intent: normalizeOptionalString(args.intent),
          target: normalizeOptionalString(args.target),
          preferred_family: normalizeOptionalString(args.preferred_family),
          request_kind: normalizeOptionalString(args.request_kind),
          workspace_path: normalizeOptionalString(args.workspace_path) ?? options.workspacePath,
          skills: normalizeStringArray(args.skills, 'skills'),
          dry_run: parseOptionalBoolean(args.dry_run, 'dry_run') ?? false,
        },
      });
      return renderExecuteRequestBrief(payload);
    },
  },
  {
    name: 'opl_workspace',
    description:
      '列出当前可见的项目/workspace，或激活一个新的 workspace。用户说“切到某个项目”“看看我现在有哪些项目”时优先使用。',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '可选。`list` 或 `activate`；默认 `list`。',
        },
        project_id: {
          type: 'string',
          description: '当 action=activate 时必填。要切换的项目 ID。',
        },
        workspace_path: {
          type: 'string',
          description: '当 action=activate 时必填。要切换的 workspace 绝对路径；list 时可省略。',
        },
      },
      additionalProperties: false,
    },
    call: async (args, options) => {
      const action = normalizeOptionalString(args.action) ?? 'list';
      if (action !== 'list' && action !== 'activate') {
        throw new Error('opl_workspace action must be list or activate.');
      }

      if (action === 'activate') {
        const projectId = normalizeOptionalString(args.project_id);
        const workspacePath = normalizeOptionalString(args.workspace_path);
        if (!projectId || !workspacePath) {
          throw new Error('opl_workspace with action=activate requires project_id and workspace_path.');
        }

        const payload = await fetchJson(options, '/workspace-activate', {}, {
          method: 'POST',
          body: {
            project_id: projectId,
            workspace_path: workspacePath,
          },
        });
        options.workspacePath = workspacePath;
        return renderWorkspaceBrief(payload, 'activate');
      }

      const payload = await fetchJson(options, '/projects');
      return renderWorkspaceBrief(payload, 'list');
    },
  },
  {
    name: 'opl_session',
    description:
      '列出最近会话、恢复会话，或读取运行日志。用户说“刚才跑到哪了”“继续刚才那个”“看看最后一次报了什么”时优先使用。',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '可选。`list`、`resume` 或 `logs`；默认 `list`。',
        },
        session_id: {
          type: 'string',
          description: '当 action=resume 或 action=logs 且要过滤会话时使用。',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          description: 'action=list 时可选。返回最近多少条会话。',
        },
        source: {
          type: 'string',
          description: 'action=list 时可选。按 source 过滤。',
        },
        log_name: {
          type: 'string',
          description: 'action=logs 时可选。日志名。',
        },
        lines: {
          type: 'integer',
          minimum: 1,
          description: 'action=logs 时可选。读取多少行。',
        },
        since: {
          type: 'string',
          description: 'action=logs 时可选。只读某个时间点之后的日志。',
        },
        level: {
          type: 'string',
          description: 'action=logs 时可选。日志级别过滤。',
        },
        component: {
          type: 'string',
          description: 'action=logs 时可选。组件过滤。',
        },
      },
      additionalProperties: false,
    },
    call: async (args, options) => {
      const action = normalizeOptionalString(args.action) ?? 'list';
      if (action !== 'list' && action !== 'resume' && action !== 'logs') {
        throw new Error('opl_session action must be list, resume, or logs.');
      }

      if (action === 'resume') {
        const sessionId = normalizeOptionalString(args.session_id);
        if (!sessionId) {
          throw new Error('opl_session with action=resume requires a non-empty session_id.');
        }

        const payload = await fetchJson(options, '/resume', {}, {
          method: 'POST',
          body: {
            session_id: sessionId,
          },
        });
        return renderResumeSessionBrief(payload);
      }

      if (action === 'logs') {
        const payload = await fetchJson(options, '/logs', {
          log_name: normalizeOptionalString(args.log_name),
          lines: parsePositiveInteger(args.lines, 'lines'),
          since: normalizeOptionalString(args.since),
          level: normalizeOptionalString(args.level),
          component: normalizeOptionalString(args.component),
          session_id: normalizeOptionalString(args.session_id),
        });
        return renderRuntimeLogsBrief(payload);
      }

      const payload = await fetchJson(options, '/sessions', {
        limit: parsePositiveInteger(args.limit, 'limit'),
        source: normalizeOptionalString(args.source),
      });
      return renderRecentSessionsBrief(payload);
    },
  },
  {
    name: 'opl_task_status',
    description: '读取某个前台执行任务的状态、阶段与最近输出，适合追踪刚提交的长任务进度。',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: '必填。任务 id。',
        },
        lines: {
          type: 'integer',
          minimum: 1,
          description: '可选。附带多少行最近输出。',
        },
      },
      required: ['task_id'],
      additionalProperties: false,
    },
    call: async (args, options) => {
      const taskId = normalizeOptionalString(args.task_id);
      if (!taskId) {
        throw new Error('opl_task_status requires a non-empty task_id.');
      }
      const payload = await fetchJson(options, '/task-status', {
        task_id: taskId,
        lines: parsePositiveInteger(args.lines, 'lines'),
      });
      return renderTaskStatusBrief(payload);
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
  state: FrontDeskMcpBridgeState,
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
    if (!state.titleSyncInFlight && Date.now() - state.lastTitleSyncAt >= TITLE_SYNC_COOLDOWN_MS) {
      state.titleSyncInFlight = true;
      state.lastTitleSyncAt = Date.now();
      try {
        await fetchJson(options, '/frontdesk-librechat-title-sync', {}, {
          method: 'POST',
          body: {
            limit: 3,
          },
        });
      } catch {
        // Title sync is opportunistic; it should never block user-facing tool calls.
      } finally {
        state.titleSyncInFlight = false;
      }
    }

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
  const state: FrontDeskMcpBridgeState = {
    titleSyncInFlight: false,
    lastTitleSyncAt: 0,
  };

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

    const response = await handleRequest(request, normalizedOptions, state);
    if (response) {
      writeJsonLine(response);
    }
  }
}
