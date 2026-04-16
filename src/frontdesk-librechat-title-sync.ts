import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

import { GatewayContractError } from './contracts.ts';
import {
  buildFrontDeskTitlePrompt,
  inferFrontDeskWorkspaceLabel,
} from './frontdesk-librechat-identity.ts';
import { resolveFrontDeskStatePaths } from './frontdesk-state.ts';

export type FrontDeskLibreChatTitleSyncConfig = {
  composeFile: string;
  envFile: string;
  workspacePath?: string | null;
  model: string;
  reasoningEffort?: string | null;
  apiBaseUrl: string;
  apiKey: string;
};

type DockerCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type TitleSyncCandidate = {
  conversation_id: string;
  current_title: string;
  first_user_text?: string | null;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type TitleSyncDeps = {
  runCommand?: (command: string, args: string[]) => DockerCommandResult;
  fetchImpl?: FetchLike;
};

type TitleSyncOptions = TitleSyncDeps & {
  limit?: number;
  dockerBinary?: string;
  projectName?: string;
};

type LibreChatServiceFile = Partial<{
  env_file: string;
  compose_file: string;
  workspace_path: string;
  codex_model: string;
  codex_reasoning_effort: string;
}>;

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return {} as Record<string, string>;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const parsed: Record<string, string> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    parsed[key] = value;
  }

  return parsed;
}

function ensureNonEmptyString(value: string | null, field: string) {
  if (value) {
    return value;
  }

  throw new GatewayContractError(
    'contract_shape_invalid',
    `Missing required LibreChat title sync field: ${field}.`,
    {
      field,
    },
  );
}

function defaultRunCommand(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
  });

  if (result.error) {
    throw new GatewayContractError(
      'hermes_command_failed',
      `Failed to launch title sync command: ${command} ${args.join(' ')}`,
      {
        command,
        args,
        cause: result.error.message,
      },
    );
  }

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  } satisfies DockerCommandResult;
}

function getFetchImplementation(fetchImpl?: FetchLike) {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (typeof fetch !== 'function') {
    throw new GatewayContractError(
      'surface_not_found',
      'Global fetch is unavailable for LibreChat title sync.',
    );
  }

  return fetch as FetchLike;
}

function buildComposeArgs(
  config: FrontDeskLibreChatTitleSyncConfig,
  options: {
    projectName: string;
    mongoEval: string;
  },
) {
  return [
    'compose',
    '--project-name',
    options.projectName,
    '--env-file',
    config.envFile,
    '-f',
    config.composeFile,
    'exec',
    '-T',
    'mongodb',
    'mongosh',
    '--quiet',
    'LibreChat',
    '--eval',
    options.mongoEval,
  ];
}

function buildListUntitledConversationEval(limit: number) {
  return `
const conversations = db.conversations.find({ title: "New Chat" }).sort({ updatedAt: -1 }).limit(${limit}).toArray();
const payload = conversations.map((conversation) => {
  const firstMessageId = Array.isArray(conversation.messages) && conversation.messages.length > 0
    ? conversation.messages[0]
    : null;
  const firstMessage = firstMessageId
    ? db.messages.findOne({ _id: firstMessageId })
    : db.messages.findOne({ conversationId: conversation.conversationId, sender: "User" }, { sort: { createdAt: 1 } });
  return {
    conversation_id: conversation.conversationId,
    current_title: conversation.title,
    first_user_text: firstMessage && typeof firstMessage.text === "string" ? firstMessage.text : null,
  };
});
print(JSON.stringify(payload));
`.trim();
}

function buildUpdateConversationTitleEval(conversationId: string, title: string) {
  return `
const result = db.conversations.updateOne(
  { conversationId: ${JSON.stringify(conversationId)}, title: "New Chat" },
  { $set: { title: ${JSON.stringify(title)}, updatedAt: new Date() } }
);
print(JSON.stringify({ matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }));
`.trim();
}

function parseJsonPayload<T>(raw: string, field: string) {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      `Failed to parse JSON while handling LibreChat title sync ${field}.`,
      {
        field,
        raw,
        cause: error instanceof Error ? error.message : 'Unknown JSON parse failure.',
      },
    );
  }
}

function buildTitlePromptContext(options: {
  workspaceLabel: string;
  firstUserText: string | null;
}) {
  return [
    `Workspace: ${options.workspaceLabel}`,
    `First user message: ${options.firstUserText ?? 'Unavailable'}`,
  ].join('\n');
}

function buildFallbackConversationTitle(options: {
  workspaceLabel: string;
  firstUserText: string | null;
}) {
  const workspaceLabel = options.workspaceLabel.trim();
  const firstUserText = options.firstUserText?.trim() ?? '';

  if (/论文进度/.test(firstUserText)) {
    return `${workspaceLabel} 现在论文进度`;
  }

  if (/进度/.test(firstUserText)) {
    return `${workspaceLabel} 当前进度`;
  }

  const cleaned = firstUserText
    .replace(/[。！？?!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned) {
    const preview = cleaned.length > 12 ? cleaned.slice(0, 12).trim() : cleaned;
    return `${workspaceLabel} ${preview}`.trim();
  }

  return `${workspaceLabel} 会话`;
}

export function normalizeFrontDeskConversationTitleCandidate(
  rawTitle: string | null | undefined,
  options: {
    workspaceLabel: string;
    firstUserText: string | null;
  },
) {
  const stripped = (rawTitle ?? '')
    .replace(/[*_`#]+/g, ' ')
    .replace(/["'“”‘’]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normalized = stripped
    .replace(/[。！？?!]+$/g, '')
    .trim();

  if (!normalized || /^new chat$/i.test(normalized)) {
    return buildFallbackConversationTitle(options);
  }

  return normalized;
}

async function generateConversationTitle(
  config: FrontDeskLibreChatTitleSyncConfig,
  options: {
    workspaceLabel: string;
    firstUserText: string | null;
    fetchImpl: FetchLike;
  },
) {
  const prompt = buildFrontDeskTitlePrompt().replace(
    '{convo}',
    buildTitlePromptContext({
      workspaceLabel: options.workspaceLabel,
      firstUserText: options.firstUserText,
    }),
  );

  const requestBody: Record<string, unknown> = {
    model: config.model,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  };

  if (config.reasoningEffort) {
    requestBody.reasoning_effort = config.reasoningEffort;
  }

  const response = await options.fetchImpl(
    `${config.apiBaseUrl.replace(/\/+$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    },
  );

  const raw = await response.text();
  if (!response.ok) {
    throw new GatewayContractError(
      'hermes_command_failed',
      'LibreChat title sync provider request failed.',
      {
        status: response.status,
        body: raw,
      },
      response.status,
    );
  }

  const payload = parseJsonPayload<{
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  }>(raw, 'provider_response');

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) => normalizeOptionalString(entry?.text) ?? '')
      .join(' ')
      .trim();
  }

  return null;
}

function listUntitledConversationCandidates(
  config: FrontDeskLibreChatTitleSyncConfig,
  options: {
    limit: number;
    dockerBinary: string;
    projectName: string;
    runCommand: (command: string, args: string[]) => DockerCommandResult;
  },
) {
  const result = options.runCommand(
    options.dockerBinary,
    buildComposeArgs(config, {
      projectName: options.projectName,
      mongoEval: buildListUntitledConversationEval(options.limit),
    }),
  );

  if (result.exitCode !== 0) {
    throw new GatewayContractError(
      'hermes_command_failed',
      'LibreChat title sync failed to list untitled conversations.',
      {
        stdout: result.stdout,
        stderr: result.stderr,
      },
      result.exitCode,
    );
  }

  const parsed = parseJsonPayload<unknown>(result.stdout.trim() || '[]', 'mongo_candidate_list');
  if (!Array.isArray(parsed)) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'Mongo candidate list for LibreChat title sync is not an array.',
      {
        payload: parsed,
      },
    );
  }

  return parsed.filter((entry): entry is TitleSyncCandidate => {
    return typeof entry === 'object' && entry !== null && typeof (entry as TitleSyncCandidate).conversation_id === 'string';
  });
}

function updateConversationTitle(
  config: FrontDeskLibreChatTitleSyncConfig,
  options: {
    conversationId: string;
    title: string;
    dockerBinary: string;
    projectName: string;
    runCommand: (command: string, args: string[]) => DockerCommandResult;
  },
) {
  const result = options.runCommand(
    options.dockerBinary,
    buildComposeArgs(config, {
      projectName: options.projectName,
      mongoEval: buildUpdateConversationTitleEval(options.conversationId, options.title),
    }),
  );

  if (result.exitCode !== 0) {
    throw new GatewayContractError(
      'hermes_command_failed',
      'LibreChat title sync failed to update the conversation title.',
      {
        conversation_id: options.conversationId,
        title: options.title,
        stdout: result.stdout,
        stderr: result.stderr,
      },
      result.exitCode,
    );
  }

  return parseJsonPayload<{ matchedCount?: number; modifiedCount?: number }>(
    result.stdout.trim() || '{}',
    'mongo_update_result',
  );
}

export async function syncFrontDeskLibreChatConversationTitles(
  config: FrontDeskLibreChatTitleSyncConfig,
  options: TitleSyncOptions = {},
) {
  const limit = options.limit ?? 3;
  const dockerBinary = options.dockerBinary ?? process.env.OPL_DOCKER_BIN?.trim() ?? 'docker';
  const projectName = options.projectName ?? 'opl-librechat-pilot';
  const runCommand = options.runCommand ?? defaultRunCommand;
  const fetchImpl = getFetchImplementation(options.fetchImpl);
  const workspaceLabel = inferFrontDeskWorkspaceLabel({
    workspacePath: config.workspacePath,
    fallbackLabel: 'OPL',
  });

  const candidates = listUntitledConversationCandidates(config, {
    limit,
    dockerBinary,
    projectName,
    runCommand,
  });

  let updatedCount = 0;
  let failedCount = 0;
  const updates: Array<{ conversation_id: string; title: string }> = [];

  for (const candidate of candidates) {
    try {
      const rawTitle = await generateConversationTitle(config, {
        workspaceLabel,
        firstUserText: normalizeOptionalString(candidate.first_user_text),
        fetchImpl,
      });
      const title = normalizeFrontDeskConversationTitleCandidate(rawTitle, {
        workspaceLabel,
        firstUserText: normalizeOptionalString(candidate.first_user_text),
      });
      const update = updateConversationTitle(config, {
        conversationId: candidate.conversation_id,
        title,
        dockerBinary,
        projectName,
        runCommand,
      });

      if ((update.modifiedCount ?? 0) > 0 || (update.matchedCount ?? 0) > 0) {
        updatedCount += 1;
        updates.push({
          conversation_id: candidate.conversation_id,
          title,
        });
        continue;
      }

      failedCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  return {
    scanned_count: candidates.length,
    updated_count: updatedCount,
    failed_count: failedCount,
    updates,
  };
}

export function readFrontDeskLibreChatTitleSyncConfig() {
  const paths = resolveFrontDeskStatePaths();
  if (!fs.existsSync(paths.librechat_service_file)) {
    throw new GatewayContractError(
      'surface_not_found',
      'LibreChat frontdesk service is not installed, so title sync has no recorded stack config.',
      {
        file: paths.librechat_service_file,
      },
    );
  }

  const parsed = JSON.parse(fs.readFileSync(paths.librechat_service_file, 'utf8')) as LibreChatServiceFile;
  const envFile = ensureNonEmptyString(normalizeOptionalString(parsed.env_file), 'env_file');
  const composeFile = ensureNonEmptyString(normalizeOptionalString(parsed.compose_file), 'compose_file');
  const model = ensureNonEmptyString(normalizeOptionalString(parsed.codex_model), 'codex_model');
  const env = parseEnvFile(envFile);
  const apiBaseUrl = ensureNonEmptyString(
    normalizeOptionalString(env.OPENAI_REVERSE_PROXY) ?? normalizeOptionalString(env.OPENAI_BASE_URL),
    'OPENAI_REVERSE_PROXY',
  );
  const apiKey = ensureNonEmptyString(normalizeOptionalString(env.OPENAI_API_KEY), 'OPENAI_API_KEY');

  return {
    composeFile,
    envFile,
    workspacePath: normalizeOptionalString(parsed.workspace_path),
    model,
    reasoningEffort: normalizeOptionalString(parsed.codex_reasoning_effort),
    apiBaseUrl,
    apiKey,
  } satisfies FrontDeskLibreChatTitleSyncConfig;
}
