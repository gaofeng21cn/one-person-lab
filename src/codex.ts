import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { GatewayContractError } from './contracts.ts';

export type CodexBinarySource = 'env' | 'path';

export interface CodexBinaryInfo {
  path: string;
  source: CodexBinarySource;
}

export interface CodexCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CodexPassthroughResult {
  exitCode: number;
}

export interface CodexCommandOptions {
  inheritStdio?: boolean;
}

export interface CodexExecOptions {
  cwd?: string;
  json?: boolean;
  model?: string;
  provider?: string;
}

export interface ParsedCodexExecOutput {
  threadId: string | null;
  finalMessage: string;
  messages: string[];
}

function isExecutableCandidate(filePath: string) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function resolveCodexFromPath(): CodexBinaryInfo | null {
  const pathEntries = (process.env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of pathEntries) {
    const candidate = path.join(entry, 'codex');
    if (isExecutableCandidate(candidate)) {
      return {
        path: candidate,
        source: 'path',
      };
    }
  }

  return null;
}

export function resolveCodexBinary(): CodexBinaryInfo | null {
  const envCandidate = process.env.OPL_CODEX_BIN?.trim();

  if (envCandidate) {
    if (!isExecutableCandidate(envCandidate)) {
      throw new GatewayContractError(
        'surface_not_found',
        'OPL_CODEX_BIN is set but does not point to a runnable Codex binary.',
        {
          codex_binary: envCandidate,
          env_var: 'OPL_CODEX_BIN',
        },
      );
    }

    return {
      path: envCandidate,
      source: 'env',
    };
  }

  return resolveCodexFromPath();
}

function quoteTomlString(value: string) {
  return JSON.stringify(value);
}

export function buildCodexExecArgs(
  prompt: string,
  options: CodexExecOptions = {},
) {
  const args = ['exec', '--skip-git-repo-check', '--full-auto'];

  if (options.json) {
    args.push('--json');
  }

  if (options.cwd) {
    args.push('--cd', options.cwd);
  }

  if (options.model) {
    args.push('--model', options.model);
  }

  if (options.provider) {
    args.push('--config', `model_provider=${quoteTomlString(options.provider)}`);
  }

  args.push(prompt);
  return args;
}

export function buildCodexCliPreview(args: string[]) {
  return ['codex', ...args];
}

export function runCodexCommand(
  args: string[],
  options: CodexCommandOptions = {},
): CodexCommandResult {
  const codexBinary = resolveCodexBinary();

  if (!codexBinary) {
    throw new GatewayContractError(
      'surface_not_found',
      'Codex binary is required for Codex-backed OPL ask execution.',
      {
        env_var: 'OPL_CODEX_BIN',
      },
    );
  }

  const result = spawnSync(codexBinary.path, args, {
    encoding: 'utf8',
    stdio: options.inheritStdio ? 'inherit' : 'pipe',
    env: process.env,
  });

  if (result.error) {
    throw new GatewayContractError(
      'codex_command_failed',
      `Failed to launch Codex for: codex ${args.join(' ')}`,
      {
        codex_binary: codexBinary.path,
        args,
        cause: result.error.message,
      },
    );
  }

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function runCodexPassthrough(args: string[]): CodexPassthroughResult {
  const codexBinary = resolveCodexBinary();

  if (!codexBinary) {
    throw new GatewayContractError(
      'surface_not_found',
      'Codex binary is required for OPL Codex passthrough execution.',
      {
        env_var: 'OPL_CODEX_BIN',
      },
    );
  }

  const result = spawnSync(codexBinary.path, args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw new GatewayContractError(
      'codex_command_failed',
      `Failed to launch Codex for: codex ${args.join(' ')}`,
      {
        codex_binary: codexBinary.path,
        args,
        cause: result.error.message,
      },
    );
  }

  return {
    exitCode: result.status ?? 1,
  };
}

function parseCodexJsonLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeInlineText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function trimCommand(command: string) {
  return command.length > 96 ? `${command.slice(0, 93)}...` : command;
}

function summarizeCodexEvent(event: Record<string, unknown>) {
  const eventType = normalizeInlineText(event.type);
  if (!eventType) {
    return null;
  }

  if (eventType === 'thread.started') {
    const threadId = normalizeInlineText(event.thread_id);
    return threadId ? `Codex 已接管任务，会话 ${threadId} 已创建。` : 'Codex 已接管任务。';
  }

  if (eventType === 'turn.started') {
    return 'Codex 正在读取上下文并规划下一步。';
  }

  const item = event.item;
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    if (eventType === 'turn.completed') {
      return 'Codex 已完成这一轮执行。';
    }
    return null;
  }

  const itemType = normalizeInlineText((item as Record<string, unknown>).type);
  if (!itemType) {
    return null;
  }

  if (itemType === 'agent_message') {
    return normalizeInlineText((item as Record<string, unknown>).text);
  }

  if (itemType === 'command_execution') {
    const command = normalizeInlineText((item as Record<string, unknown>).command);
    const status = normalizeInlineText((item as Record<string, unknown>).status);
    const aggregatedOutput = normalizeInlineText((item as Record<string, unknown>).aggregated_output);
    const outputPreview = aggregatedOutput
      ? aggregatedOutput
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)[0] ?? null
      : null;

    if (status === 'in_progress' && command) {
      return `Codex 正在执行：${trimCommand(command)}`;
    }

    if (status === 'completed' && command) {
      return outputPreview
        ? `已完成：${trimCommand(command)} -> ${outputPreview}`
        : `已完成：${trimCommand(command)}`;
    }
  }

  return null;
}

export function extractCodexRecentOutput(output: string, lines = 6) {
  const humanLines = output
    .split(/\r?\n/)
    .map((line) => summarizeCodexEvent(parseCodexJsonLine(line) ?? {}))
    .filter((line): line is string => Boolean(line))
    .slice(-lines);

  return humanLines.join('\n');
}

export function parseCodexExecOutput(output: string): ParsedCodexExecOutput {
  let threadId: string | null = null;
  const messages: string[] = [];

  for (const rawLine of output.split(/\r?\n/)) {
    const event = parseCodexJsonLine(rawLine);
    if (!event) {
      continue;
    }

    if (normalizeInlineText(event.type) === 'thread.started') {
      threadId = normalizeInlineText(event.thread_id);
      continue;
    }

    const item = event.item;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const itemRecord = item as Record<string, unknown>;
    if (normalizeInlineText(itemRecord.type) !== 'agent_message') {
      continue;
    }

    const message = normalizeInlineText(itemRecord.text);
    if (message) {
      messages.push(message);
    }
  }

  return {
    threadId,
    finalMessage: messages.at(-1) ?? '',
    messages,
  };
}
