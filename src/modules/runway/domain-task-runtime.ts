import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { runAgentExecutor } from './agent-executor.ts';
import type { AgentExecutionRequest, AgentExecutionReceipt } from './agent-executor.ts';
import {
  buildCodexExecArgs,
  parseCodexExecOutput,
  resolveCodexBinary,
  runCodexCommand,
  runCodexCommandStreaming,
} from './codex.ts';
import type {
  CodexCommandResult,
  CodexExecEvent,
  CodexExecOptions,
  CodexStreamingCommandOptions,
} from './codex.ts';

export {
  buildCodexExecArgs,
  parseCodexExecOutput,
  resolveCodexBinary,
  runCodexCommand,
  runCodexCommandStreaming,
};
export type { CodexCommandResult, CodexExecEvent, CodexExecOptions, CodexStreamingCommandOptions };

type JsonRecord = Record<string, unknown>;

export type DomainRunIdentity = {
  domain_id: string;
  program_id: string;
  topic_id: string;
  deliverable_id: string;
  run_id: string;
};

export type DomainActionHandler<TOptions extends JsonRecord = JsonRecord> = (
  options: TOptions,
) => unknown | Promise<unknown>;

export type DomainCodexPromptRunner = (
  binary: string,
  args: string[],
  options: {
    cwd: string;
    encoding: 'utf8';
    maxBuffer: number;
    timeout: number;
    input: string;
    env: NodeJS.ProcessEnv;
  },
) => CodexCommandResult | {
  status?: number | null;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: Error;
} | Promise<CodexCommandResult | {
  status?: number | null;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: Error;
}>;

function commandParts(value: readonly string[] | undefined) {
  if (value === undefined) return null;
  if (value.length === 0 || value.some((entry) => !entry.trim())) {
    throw new FrameworkContractError('cli_usage_error', 'Codex command must be a non-empty string array.');
  }
  return [...value];
}

function codexEvents(stdout: string) {
  return stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      const parsed = JSON.parse(line);
      return isRecord(parsed) ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

export async function runDomainCodexPrompt(input: {
  prompt: string;
  cwd?: string;
  timeout_ms?: number;
  command?: readonly string[];
  model?: string | null;
  provider?: string | null;
  reasoning_effort?: string | null;
  enable_image_generation?: boolean;
  env?: NodeJS.ProcessEnv;
  runner?: DomainCodexPromptRunner;
  run_id?: string;
}) {
  const prompt = input.prompt;
  if (!prompt.trim()) {
    throw new FrameworkContractError('cli_usage_error', 'Domain Codex prompt must be non-empty.');
  }
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const timeoutMs = Math.trunc(input.timeout_ms ?? 120_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new FrameworkContractError('cli_usage_error', 'Domain Codex timeout must be greater than zero.');
  }
  const command = commandParts(input.command);
  const runId = input.run_id?.trim() || `run_codex_${randomUUID()}`;
  if (!/^[A-Za-z0-9._-]+$/.test(runId) || runId.length > 120) {
    throw new FrameworkContractError('cli_usage_error', 'Domain Codex run_id is not path-safe.');
  }
  const tempRoot = process.env.OPL_REPO_TEMP_ROOT?.trim() || os.tmpdir();
  const outputDir = path.join(tempRoot, 'opl-domain-task-runtime');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputLastMessagePath = path.join(outputDir, `${runId}-${randomUUID()}.last-message.txt`);
  const args = [
    ...(command?.slice(1) ?? []),
    ...buildCodexExecArgs(prompt, {
      cwd,
      json: true,
      ephemeral: true,
      enableImageGeneration: input.enable_image_generation === true,
      model: input.model?.trim() || undefined,
      provider: input.provider?.trim() || undefined,
      reasoningEffort: input.reasoning_effort?.trim() || undefined,
      outputLastMessagePath,
      promptViaStdin: true,
    }),
  ];
  try {
    const raw = input.runner
      ? await input.runner(command?.[0] ?? 'codex', args, {
          cwd,
          encoding: 'utf8',
          maxBuffer: 20 * 1024 * 1024,
          timeout: timeoutMs,
          input: prompt,
          env: input.env ?? process.env,
        })
      : await runCodexCommandStreaming(args, {
          binaryPath: command?.[0],
          cwd,
          env: input.env,
          timeoutMs,
          stdin: prompt,
        });
    if ('error' in raw && raw.error) throw raw.error;
    const stdout = String(raw.stdout ?? '');
    const stderr = String(raw.stderr ?? '');
    const exitCode = 'exitCode' in raw && typeof raw.exitCode === 'number'
      ? raw.exitCode
      : ('status' in raw && typeof raw.status === 'number' ? raw.status : 1);
    const parsed = parseCodexExecOutput(stdout);
    const output = fs.existsSync(outputLastMessagePath)
      ? fs.readFileSync(outputLastMessagePath, 'utf8')
      : parsed.finalMessage;
    return {
      surface_kind: 'opl_domain_codex_prompt_execution',
      version: 'domain-codex-prompt-execution.v1',
      run_id: runId,
      session_id: parsed.threadId ?? runId,
      terminal_event: exitCode === 0 ? 'run.completed' : 'run.failed',
      events: codexEvents(stdout),
      output,
      stdout,
      stderr,
      error: exitCode === 0 ? null : (stderr.trim() || stdout.trim() || 'Codex CLI execution failed'),
      exit_code: exitCode,
      authority_boundary: {
        framework_owns_executor_transport: true,
        framework_owns_domain_prompt_semantics: false,
        framework_owns_domain_output_semantics: false,
        framework_can_claim_domain_completion: false,
      },
    };
  } finally {
    fs.rmSync(outputLastMessagePath, { force: true });
  }
}

function requiredIdentity(field: keyof DomainRunIdentity, value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new FrameworkContractError('contract_shape_invalid', `Domain run requires ${field}.`, {
      required: [field],
    });
  }
  return normalized;
}

export function createDomainRunRecord(
  identity: DomainRunIdentity,
  input: {
    status?: string;
    attempt?: number;
    parent_run_id?: string | null;
    refs?: string[];
    metadata?: JsonRecord;
    now?: () => Date;
  } = {},
) {
  const now = (input.now ?? (() => new Date()))().toISOString();
  return {
    surface_kind: 'opl_domain_run_record',
    version: 'domain-run.v1',
    domain_id: requiredIdentity('domain_id', identity.domain_id),
    program_id: requiredIdentity('program_id', identity.program_id),
    topic_id: requiredIdentity('topic_id', identity.topic_id),
    deliverable_id: requiredIdentity('deliverable_id', identity.deliverable_id),
    run_id: requiredIdentity('run_id', identity.run_id),
    status: input.status?.trim() || 'created',
    attempt: Math.max(0, Math.trunc(input.attempt ?? 0)),
    parent_run_id: input.parent_run_id?.trim() || null,
    refs: [...new Set((input.refs ?? []).map((entry) => entry.trim()).filter(Boolean))],
    metadata: input.metadata ?? {},
    created_at: now,
    updated_at: now,
    authority_boundary: {
      framework_owns_run_lifecycle: true,
      framework_owns_domain_verdict: false,
      framework_can_sign_owner_receipt: false,
      framework_can_create_typed_blocker: false,
    },
  };
}

export function appendDomainRunEvent(input: {
  events_file: string;
  identity: DomainRunIdentity;
  event_kind: string;
  payload?: JsonRecord;
  refs?: string[];
  now?: () => Date;
}) {
  const eventKind = input.event_kind.trim();
  if (!eventKind) {
    throw new FrameworkContractError('contract_shape_invalid', 'Domain run event requires event_kind.', {
      required: ['event_kind'],
    });
  }
  const run = createDomainRunRecord(input.identity, { now: input.now });
  const event = {
    ...run,
    surface_kind: 'opl_domain_run_event',
    version: 'domain-run-event.v1',
    event_kind: eventKind,
    payload: input.payload ?? {},
    refs: [...new Set((input.refs ?? []).map((entry) => entry.trim()).filter(Boolean))],
    occurred_at: (input.now ?? (() => new Date()))().toISOString(),
  };
  delete (event as JsonRecord).status;
  delete (event as JsonRecord).attempt;
  delete (event as JsonRecord).parent_run_id;
  delete (event as JsonRecord).metadata;
  delete (event as JsonRecord).created_at;
  delete (event as JsonRecord).updated_at;
  fs.mkdirSync(path.dirname(path.resolve(input.events_file)), { recursive: true });
  fs.appendFileSync(path.resolve(input.events_file), `${JSON.stringify(event)}\n`, 'utf8');
  return event;
}

export function readDomainRunEvents(eventsFile: string) {
  const absolute = path.resolve(eventsFile);
  if (!fs.existsSync(absolute)) return [];
  return fs.readFileSync(absolute, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonRecord);
}

export async function dispatchDomainAction(
  actionId: string,
  options: JsonRecord,
  handlers: Record<string, DomainActionHandler>,
) {
  const action = actionId.trim();
  const handler = handlers[action];
  if (!action || !handler) {
    throw new FrameworkContractError('cli_usage_error', `Unsupported domain action: ${actionId}.`, {
      action_id: actionId,
      supported_action_ids: Object.keys(handlers).sort(),
    });
  }
  return handler(options);
}

export function executeDomainTask(input: {
  identity: DomainRunIdentity;
  execution: AgentExecutionRequest;
  events_file?: string;
  now?: () => Date;
}): { run: ReturnType<typeof createDomainRunRecord>; execution: AgentExecutionReceipt } {
  const run = createDomainRunRecord(input.identity, { status: 'running', now: input.now });
  if (input.events_file) {
    appendDomainRunEvent({
      events_file: input.events_file,
      identity: input.identity,
      event_kind: 'executor_started',
      now: input.now,
    });
  }
  const execution = runAgentExecutor(input.execution);
  if (input.events_file) {
    appendDomainRunEvent({
      events_file: input.events_file,
      identity: input.identity,
      event_kind: execution.exit_code === 0 ? 'executor_completed' : 'executor_failed',
      payload: { executor_kind: execution.executor_kind, exit_code: execution.exit_code },
      refs: execution.session_id ? [`executor-session:${execution.session_id}`] : [],
      now: input.now,
    });
  }
  return { run: { ...run, status: execution.exit_code === 0 ? 'completed' : 'failed' }, execution };
}
