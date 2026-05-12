import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from './contracts.ts';
import {
  buildCodexCliPreview,
  buildCodexExecArgs,
  parseCodexExecOutput,
  runCodexCommand,
} from './codex.ts';

export const AGENT_EXECUTOR_KINDS = ['codex_cli', 'hermes_agent', 'claude_code'] as const;

export type AgentExecutorKind = typeof AGENT_EXECUTOR_KINDS[number];

type JsonRecord = Record<string, unknown>;

export type AgentExecutionRequest = {
  executor_kind?: AgentExecutorKind | string | null;
  stage_attempt_executor_kind?: AgentExecutorKind | string | null;
  mode?: string | null;
  prompt: string;
  cwd?: string | null;
  timeout_ms?: number | null;
  context_refs?: string[];
  model?: string | null;
  provider?: string | null;
  json?: boolean;
  domain_payload?: JsonRecord | null;
  env?: Record<string, string | undefined>;
};

export type AgentExecutionReceipt = {
  surface_kind: 'opl_agent_execution_receipt';
  executor_kind: AgentExecutorKind;
  mode: string;
  cwd: string | null;
  prompt_preview: string;
  session_id: string | null;
  event_summary: JsonRecord[];
  stdout_preview: string;
  stderr_preview: string;
  exit_code: number;
  closeout_packet: JsonRecord | null;
  executor_contract?: JsonRecord | null;
  capabilities: string[];
  non_equivalence_notice: 'codex_cli_first_class_default' | 'connectivity_lifecycle_receipt_audit_only';
  proof: JsonRecord | null;
};

export type AgentExecutorDoctor = {
  surface_kind: 'opl_agent_executor_doctor';
  executor_kind: AgentExecutorKind;
  ready: boolean;
  binary_path: string | null;
  resolution_source: string | null;
  capabilities: string[];
  issues: string[];
  non_equivalence_notice: AgentExecutionReceipt['non_equivalence_notice'];
  fallback_allowed: false;
};

type ResolveInput = {
  explicitExecutor?: string | null;
  stageAttemptExecutor?: string | null;
  env?: Record<string, string | undefined>;
};

function envOf(env?: Record<string, string | undefined>) {
  return env ?? process.env;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeExecutorKind(value: string | null): AgentExecutorKind | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().replace(/-/g, '_');
  if (AGENT_EXECUTOR_KINDS.includes(normalized as AgentExecutorKind)) {
    return normalized as AgentExecutorKind;
  }
  throw new FrameworkContractError('cli_usage_error', `Unsupported OPL executor kind: ${value}.`, {
    executor_kind: value,
    supported_executor_kinds: [...AGENT_EXECUTOR_KINDS],
  });
}

export function resolveAgentExecutorKind(input: ResolveInput): AgentExecutorKind {
  const env = envOf(input.env);
  return normalizeExecutorKind(text(input.explicitExecutor))
    ?? normalizeExecutorKind(text(input.stageAttemptExecutor))
    ?? normalizeExecutorKind(text(env.OPL_EXECUTOR_KIND))
    ?? 'codex_cli';
}

function executableCandidate(filePath: string | null) {
  return Boolean(filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile());
}

function findExecutableInPath(binaryName: string, env: Record<string, string | undefined>) {
  const entries = String(env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of entries) {
    const candidate = path.join(entry, binaryName);
    if (executableCandidate(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveBinary(input: {
  kind: AgentExecutorKind;
  env: Record<string, string | undefined>;
}) {
  if (input.kind === 'codex_cli') {
    const envPath = text(input.env.OPL_CODEX_BIN);
    if (executableCandidate(envPath)) {
      return { path: envPath, source: 'OPL_CODEX_BIN' };
    }
    const pathCandidate = findExecutableInPath('codex', input.env);
    return pathCandidate ? { path: pathCandidate, source: 'PATH' } : null;
  }
  if (input.kind === 'hermes_agent') {
    const envPath = text(input.env.OPL_HERMES_AGENT_EXECUTOR_BIN);
    return executableCandidate(envPath) ? { path: envPath, source: 'OPL_HERMES_AGENT_EXECUTOR_BIN' } : null;
  }
  const envPath = text(input.env.OPL_CLAUDE_CODE_BIN);
  if (executableCandidate(envPath)) {
    return { path: envPath, source: 'OPL_CLAUDE_CODE_BIN' };
  }
  const pathCandidate = findExecutableInPath('claude', input.env);
  return pathCandidate ? { path: pathCandidate, source: 'PATH' } : null;
}

function capabilitiesFor(executorKind: AgentExecutorKind) {
  if (executorKind === 'codex_cli') {
    return ['codex_exec', 'json_output', 'session_id'];
  }
  if (executorKind === 'hermes_agent') {
    return ['full_agent_loop_receipt', 'tool_event_proof', 'session_id'];
  }
  return ['cli_process_receipt', 'json_or_text_output'];
}

export function inspectAgentExecutor(
  kind: AgentExecutorKind | string,
  options: { env?: Record<string, string | undefined> } = {},
): AgentExecutorDoctor {
  const executorKind = normalizeExecutorKind(String(kind)) ?? 'codex_cli';
  const env = envOf(options.env);
  const binary = resolveBinary({ kind: executorKind, env });
  return {
    surface_kind: 'opl_agent_executor_doctor',
    executor_kind: executorKind,
    ready: Boolean(binary),
    binary_path: binary?.path ?? null,
    resolution_source: binary?.source ?? null,
    capabilities: capabilitiesFor(executorKind),
    issues: binary ? [] : [`${executorKind}_binary_missing`],
    non_equivalence_notice: executorKind === 'codex_cli'
      ? 'codex_cli_first_class_default'
      : 'connectivity_lifecycle_receipt_audit_only',
    fallback_allowed: false,
  };
}

function assertAgentExecutorReady(
  executorKind: AgentExecutorKind,
  options: { env?: Record<string, string | undefined> } = {},
) {
  const doctor = inspectAgentExecutor(executorKind, options);
  if (!doctor.ready) {
    throw new FrameworkContractError('surface_not_found', `${doctor.executor_kind} executor binary is not configured.`, {
      executor_kind: doctor.executor_kind,
      fallback_allowed: false,
      issues: doctor.issues,
    });
  }
  return doctor;
}

function preview(value: string, limit = 800) {
  return value.length <= limit ? value : `${value.slice(0, limit)}...`;
}

function normalizeTimeoutMs(value: unknown) {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : Number.NaN;
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function parseOptionalCloseout(stdout: string): JsonRecord | null {
  for (const line of stdout.split(/\r?\n/).filter(Boolean).reverse()) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isRecord(parsed) && typeof parsed.surface_kind === 'string') {
        return parsed;
      }
    } catch {
      // Executor output may include ordinary text; keep scanning.
    }
  }
  return null;
}

function parseReceiptPayload(stdout: string, executorKind: AgentExecutorKind) {
  try {
    return JSON.parse(stdout || '{}') as unknown;
  } catch (error) {
    throw new FrameworkContractError('contract_shape_invalid', `${executorKind} executor did not return a JSON receipt.`, {
      executor_kind: executorKind,
      stderr_preview: error instanceof Error ? error.message : String(error),
      fallback_allowed: false,
    });
  }
}

function assertExternalProcessCompleted(input: {
  executorKind: AgentExecutorKind;
  error?: Error;
  timedOut: boolean;
  timeoutMs?: number;
}) {
  if (!input.error) {
    return;
  }
  throw new FrameworkContractError(
    'launcher_failed',
    input.timedOut
      ? `${input.executorKind} executor exceeded the configured timeout.`
      : `Failed to launch ${input.executorKind}.`,
    {
      executor_kind: input.executorKind,
      cause: input.error.message,
      timeout_ms: input.timedOut ? input.timeoutMs ?? null : null,
      timed_out: input.timedOut,
      fallback_allowed: false,
    },
  );
}

function normalizeReceipt(value: unknown, fallback: {
  kind: AgentExecutorKind;
  mode: string;
  cwd: string | null;
  prompt: string;
}): AgentExecutionReceipt {
  const payload = isRecord(value) ? value : {};
  const proof = isRecord(payload.proof) ? payload.proof : null;
  const eventSummary = Array.isArray(payload.event_summary)
    ? payload.event_summary.filter(isRecord)
    : [];
  return {
    surface_kind: 'opl_agent_execution_receipt',
    executor_kind: fallback.kind,
    mode: text(payload.mode) ?? fallback.mode,
    cwd: text(payload.cwd) ?? fallback.cwd,
    prompt_preview: text(payload.prompt_preview) ?? preview(fallback.prompt, 240),
    session_id: text(payload.session_id),
    event_summary: eventSummary,
    stdout_preview: text(payload.stdout_preview) ?? '',
    stderr_preview: text(payload.stderr_preview) ?? '',
    exit_code: typeof payload.exit_code === 'number' ? payload.exit_code : 0,
    closeout_packet: isRecord(payload.closeout_packet) ? payload.closeout_packet : null,
    executor_contract: isRecord(payload.executor_contract) ? payload.executor_contract : null,
    capabilities: Array.isArray(payload.capabilities)
      ? payload.capabilities.filter((entry): entry is string => typeof entry === 'string')
      : capabilitiesFor(fallback.kind),
    non_equivalence_notice: fallback.kind === 'codex_cli'
      ? 'codex_cli_first_class_default'
      : 'connectivity_lifecycle_receipt_audit_only',
    proof,
  };
}

function runCodexExecutor(request: AgentExecutionRequest, executorKind: AgentExecutorKind): AgentExecutionReceipt {
  const json = request.json ?? true;
  const args = buildCodexExecArgs(request.prompt, {
    cwd: request.cwd ?? undefined,
    json,
    model: request.model ?? undefined,
    provider: request.provider ?? undefined,
  });
  const result = runCodexCommand(args);
  const parsed = json ? parseCodexExecOutput(result.stdout) : null;
  return {
    surface_kind: 'opl_agent_execution_receipt',
    executor_kind: executorKind,
    mode: request.mode ?? 'structured_call',
    cwd: request.cwd ?? null,
    prompt_preview: preview(request.prompt, 240),
    session_id: parsed?.threadId ?? null,
    event_summary: [],
    stdout_preview: preview(result.stdout),
    stderr_preview: preview(result.stderr),
    exit_code: result.exitCode,
    closeout_packet: parseOptionalCloseout(result.stdout),
    executor_contract: null,
    capabilities: capabilitiesFor(executorKind),
    non_equivalence_notice: 'codex_cli_first_class_default',
    proof: {
      command_preview: buildCodexCliPreview(args),
      default_executor: true,
    },
  };
}

function runExternalExecutor(request: AgentExecutionRequest, executorKind: AgentExecutorKind): AgentExecutionReceipt {
  const env = envOf(request.env);
  const doctor = assertAgentExecutorReady(executorKind, { env });
  const cwd = request.cwd ? path.resolve(request.cwd) : process.cwd();
  const childEnv = { ...process.env, ...env };
  const timeout = normalizeTimeoutMs(request.timeout_ms);

  if (executorKind === 'hermes_agent') {
    const result = spawnSync(doctor.binary_path!, [], {
      cwd,
      env: childEnv,
      input: JSON.stringify({
        executor_kind: executorKind,
        mode: request.mode ?? 'agent_loop',
        prompt: request.prompt,
        cwd,
        context_refs: request.context_refs ?? [],
        timeout_ms: request.timeout_ms ?? null,
        domain_payload: request.domain_payload ?? null,
      }),
      encoding: 'utf8',
      timeout,
    });
    assertExternalProcessCompleted({
      executorKind,
      error: result.error,
      timedOut: Boolean(result.error && 'code' in result.error && result.error.code === 'ETIMEDOUT'),
      timeoutMs: timeout,
    });
    const receiptPayload = parseReceiptPayload(result.stdout, executorKind);
    const receipt = normalizeReceipt(receiptPayload, {
      kind: executorKind,
      mode: request.mode ?? 'agent_loop',
      cwd,
      prompt: request.prompt,
    });
    const fullLoopProved = receipt.proof?.full_agent_loop_proved === true;
    const toolCallCount = typeof receipt.proof?.tool_call_count === 'number' ? receipt.proof.tool_call_count : 0;
    if (!fullLoopProved || toolCallCount <= 0 || receipt.event_summary.length === 0) {
      throw new FrameworkContractError('contract_shape_invalid', 'Hermes-Agent executor receipt must prove a full agent loop with tool events.', {
        executor_kind: executorKind,
      });
    }
    return {
      ...receipt,
      exit_code: result.status ?? receipt.exit_code,
      stderr_preview: receipt.stderr_preview || preview(result.stderr ?? ''),
    };
  }

  const result = spawnSync(doctor.binary_path!, [request.prompt], {
    cwd,
    env: childEnv,
    encoding: 'utf8',
    timeout,
  });
  assertExternalProcessCompleted({
    executorKind,
    error: result.error,
    timedOut: Boolean(result.error && 'code' in result.error && result.error.code === 'ETIMEDOUT'),
    timeoutMs: timeout,
  });
  return {
    surface_kind: 'opl_agent_execution_receipt',
    executor_kind: executorKind,
    mode: request.mode ?? 'structured_call',
    cwd,
    prompt_preview: preview(request.prompt, 240),
    session_id: null,
    event_summary: [],
    stdout_preview: preview(result.stdout ?? ''),
    stderr_preview: preview(result.stderr ?? ''),
    exit_code: result.status ?? 1,
    closeout_packet: parseOptionalCloseout(result.stdout ?? ''),
    executor_contract: null,
    capabilities: capabilitiesFor(executorKind),
    non_equivalence_notice: 'connectivity_lifecycle_receipt_audit_only',
    proof: {
      binary_path: doctor.binary_path,
      resolution_source: doctor.resolution_source,
      fallback_allowed: false,
    },
  };
}

export function runAgentExecutor(request: AgentExecutionRequest): AgentExecutionReceipt {
  const executorKind = resolveAgentExecutorKind({
    explicitExecutor: request.executor_kind ?? null,
    stageAttemptExecutor: request.stage_attempt_executor_kind ?? null,
    env: request.env,
  });
  if (!request.prompt.trim()) {
    throw new FrameworkContractError('cli_usage_error', 'Agent executor request requires a non-empty prompt.', {
      required: ['prompt'],
    });
  }
  if (executorKind === 'codex_cli') {
    return runCodexExecutor(request, executorKind);
  }
  return runExternalExecutor(request, executorKind);
}

export function runAgentExecutorDoctor(args: {
  executorKind?: string | null;
  env?: Record<string, string | undefined>;
}) {
  const executorKind = resolveAgentExecutorKind({
    explicitExecutor: args.executorKind ?? null,
    env: args.env,
  });
  const doctor = inspectAgentExecutor(executorKind, { env: args.env });
  if (!doctor.ready) {
    throw new FrameworkContractError('surface_not_found', `${executorKind} executor binary is not configured.`, {
      executor_kind: executorKind,
      fallback_allowed: false,
      issues: doctor.issues,
    });
  }
  return {
    version: 'g2',
    executor_doctor: doctor,
  };
}

export function runAgentExecutorRequestFile(requestPath: string) {
  const payload = JSON.parse(fs.readFileSync(requestPath, 'utf8')) as unknown;
  if (!isRecord(payload)) {
    throw new FrameworkContractError('cli_usage_error', 'Agent executor request file must contain a JSON object.', {
      request: requestPath,
    });
  }
  const receipt = runAgentExecutor({
    executor_kind: text(payload.executor_kind) as AgentExecutorKind | null,
    stage_attempt_executor_kind: text(payload.stage_attempt_executor_kind) as AgentExecutorKind | null,
    mode: text(payload.mode),
    prompt: text(payload.prompt) ?? '',
    cwd: text(payload.cwd),
    timeout_ms: typeof payload.timeout_ms === 'number' ? payload.timeout_ms : null,
    context_refs: Array.isArray(payload.context_refs)
      ? payload.context_refs.filter((entry): entry is string => typeof entry === 'string')
      : [],
    model: text(payload.model),
    provider: text(payload.provider),
    json: payload.json !== false,
    domain_payload: isRecord(payload.domain_payload) ? payload.domain_payload : null,
  });
  return {
    version: 'g2',
    agent_execution_receipt: receipt,
  };
}
