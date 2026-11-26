import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isRecord } from '@opl/core';
import {
  createCodexExecEventParserState,
  findPendingUnsupportedFunctionCalls,
  parseCodexExecEventFromLine,
  parseCodexJsonLine,
  parseCodexTokenUsage,
  type CodexTokenUsage,
} from './events.ts';

export interface CodexSessionRecoveryResult {
  readonly threadId: string;
  readonly sessionPath: string;
  readonly output: string;
}

export interface AnalyzedCodexSession {
  readonly completed: boolean;
  readonly failed: boolean;
  readonly failureMessage?: string;
  readonly finalMessage: string;
  readonly messages: string[];
  readonly usage: CodexTokenUsage | null;
  readonly unsupportedCalls: ReadonlyArray<{ readonly name: string; readonly callId: string | null }>;
}

function normalizeInlineText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function findCodexSessionJsonl(sessionsRoot: string, threadId: string): string | null {
  if (!fs.existsSync(sessionsRoot)) return null;

  const maxDepth = 6;
  const maxFiles = 10_000;
  const stack: Array<{ dir: string; depth: number }> = [{ dir: sessionsRoot, depth: 0 }];
  let scannedFiles = 0;

  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (current.depth < maxDepth) {
          stack.push({ dir: entryPath, depth: current.depth + 1 });
        }
        continue;
      }
      if (!entry.isFile()) continue;

      scannedFiles += 1;
      if (scannedFiles > maxFiles) return null;
      if (entry.name.endsWith('.jsonl') && entry.name.includes(threadId)) {
        return entryPath;
      }
    }
  }
  return null;
}

export function recoverCodexExecOutputFromSession(
  threadId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): CodexSessionRecoveryResult | null {
  const normalizedThreadId = normalizeInlineText(threadId);
  if (!normalizedThreadId) return null;

  const codexHome =
    normalizeInlineText(env.CODEX_HOME)
    ?? path.join(env.HOME?.trim() || env.USERPROFILE?.trim() || os.homedir(), '.codex');
  const sessionsRoot = path.join(codexHome, 'sessions');
  const sessionPath = findCodexSessionJsonl(sessionsRoot, normalizedThreadId);
  if (!sessionPath) return null;

  const stat = fs.statSync(sessionPath);
  const maxSessionBytes = 25 * 1024 * 1024;
  if (!stat.isFile() || stat.size > maxSessionBytes) return null;

  return {
    threadId: normalizedThreadId,
    sessionPath,
    output: fs.readFileSync(sessionPath, 'utf8'),
  };
}

function addUsageTotals(left: CodexTokenUsage, right: CodexTokenUsage): CodexTokenUsage {
  return {
    input_tokens: left.input_tokens + right.input_tokens,
    cached_input_tokens:
      left.cached_input_tokens === null || right.cached_input_tokens === null
        ? null
        : left.cached_input_tokens + right.cached_input_tokens,
    output_tokens: left.output_tokens + right.output_tokens,
    reasoning_output_tokens:
      left.reasoning_output_tokens === null || right.reasoning_output_tokens === null
        ? null
        : left.reasoning_output_tokens + right.reasoning_output_tokens,
    total_tokens: left.total_tokens + right.total_tokens,
  };
}

export function analyzeCodexSessionJsonl(output: string): AnalyzedCodexSession {
  const state = createCodexExecEventParserState();
  const messages: string[] = [];
  let completed = false;
  let failed = false;
  let failureMessage: string | undefined;
  let latestCumulativeUsage: CodexTokenUsage | null = null;
  const turnUsages: CodexTokenUsage[] = [];

  for (const line of output.split(/\r?\n/)) {
    const raw = parseCodexJsonLine(line);
    if (!raw) continue;

    if (raw.type === 'event_msg' && isRecord(raw.payload)) {
      const pType = normalizeInlineText(raw.payload.type);
      if (pType === 'task_complete' || pType === 'turn_completed') {
        completed = true;
      }
      if (pType === 'token_count' && isRecord(raw.payload.info)) {
        const total = parseCodexTokenUsage(raw.payload.info.total_token_usage);
        if (total) latestCumulativeUsage = total;
        const last = parseCodexTokenUsage(raw.payload.info.last_token_usage);
        if (last) turnUsages.push(last);
      }
    }

    const ev = parseCodexExecEventFromLine(line, state);
    if (!ev) continue;
    if (ev.type === 'turn.completed') {
      completed = true;
      if (ev.usage) turnUsages.push(ev.usage);
    } else if (ev.type === 'agent_message') {
      messages.push(ev.text);
    } else if (ev.type === 'provider_error') {
      failed = true;
      failureMessage = ev.message;
    } else if (ev.type === 'token_count' && ev.usage) {
      if (ev.isCumulative) latestCumulativeUsage = ev.usage;
      else turnUsages.push(ev.usage);
    }
  }

  const unsupportedCalls = findPendingUnsupportedFunctionCalls(output);
  if (unsupportedCalls.length > 0 && !completed) {
    failed = true;
    failureMessage = `Pending unsupported function call: ${unsupportedCalls[0]!.name}`;
  }

  const usage =
    latestCumulativeUsage
    ?? (turnUsages.length > 0 ? turnUsages.slice(1).reduce(addUsageTotals, turnUsages[0]!) : null);

  return {
    completed,
    failed,
    ...(failureMessage ? { failureMessage } : {}),
    finalMessage: messages.join('\n'),
    messages,
    usage,
    unsupportedCalls,
  };
}
