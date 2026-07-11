import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  FrameworkContractError,
  isRecord,
} from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { stringValue } from '../../kernel/json-record.ts';
import {
  buildCodexCliPreview,
  buildCodexExecArgs,
  parseCodexExecOutput,
  resolveCodexBinary,
  runCodexCommand,
} from './codex.ts';

export const AGENT_EXECUTOR_KINDS = ['codex_cli', 'hermes_agent', 'claude_code', 'antigravity_cli'] as const;

export type AgentExecutorKind = typeof AGENT_EXECUTOR_KINDS[number];

type JsonRecord = Record<string, unknown>;

export type StageAttemptExecutorPolicy = {
  executor_kind?: AgentExecutorKind | string | null;
  model?: string | null;
  provider?: string | null;
  reasoning_effort?: string | null;
  executor_binding_ref?: string | null;
};

export type AgentExecutionRequest = {
  executor_kind?: AgentExecutorKind | string | null;
  stage_attempt_executor_kind?: AgentExecutorKind | string | null;
  request_executor_policy?: StageAttemptExecutorPolicy | null;
  stage_attempt_executor_policy?: StageAttemptExecutorPolicy | null;
  mode?: string | null;
  prompt: string;
  cwd?: string | null;
  timeout_ms?: number | null;
  context_refs?: string[];
  required_capabilities?: string[];
  model?: string | null;
  provider?: string | null;
  reasoning_effort?: string | null;
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
  executor_envelope: JsonRecord;
  capabilities: string[];
  requested_capabilities: string[];
  activated_capabilities: string[];
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
  executor_envelope: JsonRecord;
  issues: string[];
  non_equivalence_notice: AgentExecutionReceipt['non_equivalence_notice'];
  fallback_allowed: false;
};

type ResolveInput = {
  explicitExecutor?: string | null;
  stageAttemptExecutor?: string | null;
  requestExecutorPolicy?: StageAttemptExecutorPolicy | null;
  stageAttemptExecutorPolicy?: StageAttemptExecutorPolicy | null;
  env?: Record<string, string | undefined>;
};

function envOf(env?: Record<string, string | undefined>) {
  return env ?? process.env;
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

function resolveAgentExecutorKind(input: ResolveInput): AgentExecutorKind {
  const env = envOf(input.env);
  return normalizeExecutorKind(stringValue(input.explicitExecutor))
    ?? normalizeExecutorKind(stringValue(input.stageAttemptExecutor))
    ?? normalizeExecutorKind(stringValue(input.requestExecutorPolicy?.executor_kind))
    ?? normalizeExecutorKind(stringValue(input.stageAttemptExecutorPolicy?.executor_kind))
    ?? normalizeExecutorKind(stringValue(env.OPL_EXECUTOR_KIND))
    ?? 'codex_cli';
}

function resolvePolicyValue(
  explicitValue: string | null | undefined,
  requestPolicyValue: string | null | undefined,
  stagePolicyValue: string | null | undefined,
) {
  return stringValue(explicitValue) ?? stringValue(requestPolicyValue) ?? stringValue(stagePolicyValue);
}

function selectedPolicyFor(request: AgentExecutionRequest, executorKind: AgentExecutorKind) {
  const requestPolicyKind = normalizeExecutorKind(stringValue(request.request_executor_policy?.executor_kind));
  if (requestPolicyKind === executorKind) {
    return { policy: request.request_executor_policy, policy_kind: 'request_executor_policy' };
  }
  const stagePolicyKind = normalizeExecutorKind(stringValue(request.stage_attempt_executor_policy?.executor_kind));
  if (stagePolicyKind === executorKind) {
    return { policy: request.stage_attempt_executor_policy, policy_kind: 'stage_attempt_executor_policy' };
  }
  return { policy: null, policy_kind: null };
}

function assertNonDefaultPolicyBinding(request: AgentExecutionRequest, executorKind: AgentExecutorKind) {
  if (executorKind === 'codex_cli') {
    return;
  }
  const selectedPolicy = selectedPolicyFor(request, executorKind);
  if (!selectedPolicy.policy) {
    return;
  }
  const executorBindingRef = stringValue(selectedPolicy.policy.executor_binding_ref);
  if (executorBindingRef) {
    return;
  }
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Non-default executor policy requires executor_binding_ref before launch.',
    {
      executor_kind: executorKind,
      policy_kind: selectedPolicy.policy_kind,
      required: ['executor_binding_ref'],
      fallback_allowed: false,
      authority_boundary: {
        non_default_executor_can_be_default_path: false,
        can_claim_quality_equivalence: false,
        can_claim_tool_semantics_equivalence: false,
        can_claim_resume_equivalence: false,
      },
    },
  );
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
    const envPath = stringValue(input.env.OPL_CODEX_BIN);
    if (executableCandidate(envPath)) {
      return { path: envPath, source: 'OPL_CODEX_BIN' };
    }
    const pathCandidate = findExecutableInPath('codex', input.env);
    return pathCandidate ? { path: pathCandidate, source: 'PATH' } : null;
  }
  if (input.kind === 'hermes_agent') {
    const envPath = stringValue(input.env.OPL_HERMES_AGENT_EXECUTOR_BIN);
    return executableCandidate(envPath) ? { path: envPath, source: 'OPL_HERMES_AGENT_EXECUTOR_BIN' } : null;
  }
  const envPath = stringValue(input.env.OPL_CLAUDE_CODE_BIN);
  if (input.kind === 'claude_code') {
    if (executableCandidate(envPath)) {
      return { path: envPath, source: 'OPL_CLAUDE_CODE_BIN' };
    }
    const pathCandidate = findExecutableInPath('claude', input.env);
    return pathCandidate ? { path: pathCandidate, source: 'PATH' } : null;
  }
  const antigravityEnvPath = stringValue(input.env.OPL_ANTIGRAVITY_CLI_BIN);
  if (executableCandidate(antigravityEnvPath)) {
    return { path: antigravityEnvPath, source: 'OPL_ANTIGRAVITY_CLI_BIN' };
  }
  const pathCandidate = findExecutableInPath('antigravity', input.env);
  return pathCandidate ? { path: pathCandidate, source: 'PATH' } : null;
}

function capabilitiesFor(executorKind: AgentExecutorKind) {
  if (executorKind === 'codex_cli') {
    return ['codex_exec', 'json_output', 'session_id', 'image_generation'];
  }
  if (executorKind === 'hermes_agent') {
    return ['full_agent_loop_receipt', 'tool_event_proof', 'session_id'];
  }
  if (executorKind === 'antigravity_cli') {
    return ['cli_process_receipt', 'html_route_candidate', 'json_or_text_output'];
  }
  return ['cli_process_receipt', 'json_or_text_output'];
}

function requiredCapabilitiesFor(request: AgentExecutionRequest, executorKind: AgentExecutorKind) {
  const requested = [...new Set((request.required_capabilities ?? [])
    .map((entry) => entry.trim())
    .filter(Boolean))];
  const unsupported = requested.filter((entry) => entry !== 'image_generation');
  if (unsupported.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent executor request contains unsupported required capabilities.', {
      executor_kind: executorKind,
      required_capabilities: requested,
      unsupported_capabilities: unsupported,
      supported_required_capabilities: ['image_generation'],
      fallback_allowed: false,
    });
  }
  if (requested.length > 0 && executorKind !== 'codex_cli') {
    throw new FrameworkContractError('contract_shape_invalid', 'Requested capabilities are not supported by the selected executor.', {
      executor_kind: executorKind,
      required_capabilities: requested,
      supported_executor_kind: 'codex_cli',
      fallback_allowed: false,
    });
  }
  return requested;
}

function executorEnvelopeFor(executorKind: AgentExecutorKind) {
  const isDefault = executorKind === 'codex_cli';
  return {
    surface_kind: 'opl_agent_executor_envelope',
    default_executor_kind: 'codex_cli',
    selected_executor_kind: executorKind,
    default_quality_path: 'codex_cli',
    selected_executor_is_default_quality_path: isDefault,
    adapter_receipt_only: !isDefault,
    non_default_receipt_policy: isDefault
      ? null
      : 'adapter_receipt_only_no_reasoning_tool_resume_or_quality_equivalence',
    reasoning_equivalence_claim: false,
    tool_semantics_equivalence_claim: false,
    resume_equivalence_claim: false,
    quality_equivalence_claim: false,
    fallback_allowed: false,
    authority_boundary: {
      codex_cli: 'default_quality_path',
      non_default_executor: 'connectivity_lifecycle_receipt_audit_only',
      can_claim_reasoning_equivalence: false,
      can_claim_tool_semantics_equivalence: false,
      can_claim_resume_equivalence: false,
      can_claim_quality_equivalence: false,
    },
  };
}

function inspectAgentExecutor(
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
    executor_envelope: executorEnvelopeFor(executorKind),
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
      const parsed = parseJsonText(line);
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
  let parseError: string | null = null;
  for (const line of stdout.split(/\r?\n/).filter(Boolean).reverse()) {
    try {
      const parsed = parseJsonText(line);
      if (isRecord(parsed) && parsed.surface_kind === 'opl_agent_execution_receipt') {
        return parsed;
      }
    } catch (error) {
      parseError ??= error instanceof Error ? error.message : String(error);
    }
  }
  throw new FrameworkContractError('contract_shape_invalid', `${executorKind} executor did not return a JSON receipt.`, {
    executor_kind: executorKind,
    stdout_preview: preview(stdout),
    stderr_preview: parseError,
    fallback_allowed: false,
  });
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

function assertExternalExitSucceeded(input: {
  executorKind: AgentExecutorKind;
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}) {
  if (input.status === 0) {
    return;
  }
  throw new FrameworkContractError(
    'launcher_failed',
    `${input.executorKind} executor exited without a valid receipt.`,
    {
      executor_kind: input.executorKind,
      exit_code: input.status,
      signal: input.signal,
      stdout_preview: preview(input.stdout),
      stderr_preview: preview(input.stderr),
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
    mode: stringValue(payload.mode) ?? fallback.mode,
    cwd: stringValue(payload.cwd) ?? fallback.cwd,
    prompt_preview: stringValue(payload.prompt_preview) ?? preview(fallback.prompt, 240),
    session_id: stringValue(payload.session_id),
    event_summary: eventSummary,
    stdout_preview: stringValue(payload.stdout_preview) ?? '',
    stderr_preview: stringValue(payload.stderr_preview) ?? '',
    exit_code: typeof payload.exit_code === 'number' ? payload.exit_code : 0,
    closeout_packet: isRecord(payload.closeout_packet) ? payload.closeout_packet : null,
    executor_contract: isRecord(payload.executor_contract) ? payload.executor_contract : null,
    executor_envelope: executorEnvelopeFor(fallback.kind),
    capabilities: Array.isArray(payload.capabilities)
      ? payload.capabilities.filter((entry): entry is string => typeof entry === 'string')
      : capabilitiesFor(fallback.kind),
    requested_capabilities: [],
    activated_capabilities: [],
    non_equivalence_notice: fallback.kind === 'codex_cli'
      ? 'codex_cli_first_class_default'
      : 'connectivity_lifecycle_receipt_audit_only',
    proof,
  };
}

function runCodexExecutor(request: AgentExecutionRequest, executorKind: AgentExecutorKind): AgentExecutionReceipt {
  const json = request.json ?? true;
  const codexBinary = resolveCodexBinary();
  const codexHome = stringValue(process.env.CODEX_HOME);
  const model = resolvePolicyValue(
    request.model,
    request.request_executor_policy?.model,
    request.stage_attempt_executor_policy?.model,
  );
  const provider = resolvePolicyValue(
    request.provider,
    request.request_executor_policy?.provider,
    request.stage_attempt_executor_policy?.provider,
  );
  const reasoningEffort = resolvePolicyValue(
    request.reasoning_effort,
    request.request_executor_policy?.reasoning_effort,
    request.stage_attempt_executor_policy?.reasoning_effort,
  );
  const requestedCapabilities = requiredCapabilitiesFor(request, executorKind);
  const args = buildCodexExecArgs(request.prompt, {
    cwd: request.cwd ?? undefined,
    json,
    model: model ?? undefined,
    provider: provider ?? undefined,
    reasoningEffort: reasoningEffort ?? undefined,
    enableImageGeneration: requestedCapabilities.includes('image_generation'),
  });
  const result = runCodexCommand(args, {
    timeoutMs: normalizeTimeoutMs(request.timeout_ms),
  });
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
    executor_envelope: executorEnvelopeFor(executorKind),
    capabilities: capabilitiesFor(executorKind),
    requested_capabilities: requestedCapabilities,
    activated_capabilities: requestedCapabilities,
    non_equivalence_notice: 'codex_cli_first_class_default',
    proof: {
      command_preview: buildCodexCliPreview(args),
      default_executor: true,
      codex_binary_path: codexBinary?.path ?? null,
      codex_binary_source: codexBinary?.source ?? null,
      codex_home: codexHome,
      codex_config_path: codexHome ? path.join(codexHome, 'config.toml') : null,
      model: model ?? null,
      provider: provider ?? null,
      reasoning_effort: reasoningEffort ?? null,
    },
  };
}

function runExternalExecutor(request: AgentExecutionRequest, executorKind: AgentExecutorKind): AgentExecutionReceipt {
  const env = envOf(request.env);
  const doctor = assertAgentExecutorReady(executorKind, { env });
  const cwd = request.cwd ? path.resolve(request.cwd) : process.cwd();
  const childEnv = { ...process.env, ...env };
  const timeout = normalizeTimeoutMs(request.timeout_ms);
  const model = resolvePolicyValue(
    request.model,
    request.request_executor_policy?.model,
    request.stage_attempt_executor_policy?.model,
  );
  const provider = resolvePolicyValue(
    request.provider,
    request.request_executor_policy?.provider,
    request.stage_attempt_executor_policy?.provider,
  );
  const reasoningEffort = resolvePolicyValue(
    request.reasoning_effort,
    request.request_executor_policy?.reasoning_effort,
    request.stage_attempt_executor_policy?.reasoning_effort,
  );

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
    assertExternalExitSucceeded({
      executorKind,
      status: result.status,
      signal: result.signal,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
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

  const externalArgs = executorKind === 'antigravity_cli'
    ? [
        request.prompt,
        ...(model ? [model] : []),
        ...(reasoningEffort ? [reasoningEffort] : []),
        ...(provider ? [provider] : []),
      ]
    : [request.prompt];
  const result = spawnSync(doctor.binary_path!, externalArgs, {
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
    executor_envelope: executorEnvelopeFor(executorKind),
    capabilities: capabilitiesFor(executorKind),
    requested_capabilities: [],
    activated_capabilities: [],
    non_equivalence_notice: 'connectivity_lifecycle_receipt_audit_only',
    proof: {
      binary_path: doctor.binary_path,
      resolution_source: doctor.resolution_source,
      fallback_allowed: false,
      model: model ?? null,
      provider: provider ?? null,
      reasoning_effort: reasoningEffort ?? null,
    },
  };
}

export function runAgentExecutor(request: AgentExecutionRequest): AgentExecutionReceipt {
  const executorKind = resolveAgentExecutorKind({
    explicitExecutor: request.executor_kind ?? null,
    stageAttemptExecutor: request.stage_attempt_executor_kind ?? null,
    requestExecutorPolicy: request.request_executor_policy,
    stageAttemptExecutorPolicy: request.stage_attempt_executor_policy,
    env: request.env,
  });
  if (!request.prompt.trim()) {
    throw new FrameworkContractError('cli_usage_error', 'Agent executor request requires a non-empty prompt.', {
      required: ['prompt'],
    });
  }
  assertNonDefaultPolicyBinding(request, executorKind);
  requiredCapabilitiesFor(request, executorKind);
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
  const payload = parseJsonText(fs.readFileSync(requestPath, 'utf8'));
  if (!isRecord(payload)) {
    throw new FrameworkContractError('cli_usage_error', 'Agent executor request file must contain a JSON object.', {
      request: requestPath,
    });
  }
  const receipt = runAgentExecutor({
    executor_kind: stringValue(payload.executor_kind) as AgentExecutorKind | null,
    stage_attempt_executor_kind: stringValue(payload.stage_attempt_executor_kind) as AgentExecutorKind | null,
    request_executor_policy: isRecord(payload.request_executor_policy) ? payload.request_executor_policy : null,
    stage_attempt_executor_policy: isRecord(payload.stage_attempt_executor_policy) ? payload.stage_attempt_executor_policy : null,
    mode: stringValue(payload.mode),
    prompt: stringValue(payload.prompt) ?? '',
    cwd: stringValue(payload.cwd),
    timeout_ms: typeof payload.timeout_ms === 'number' ? payload.timeout_ms : null,
    context_refs: Array.isArray(payload.context_refs)
      ? payload.context_refs.filter((entry): entry is string => typeof entry === 'string')
      : [],
    required_capabilities: Array.isArray(payload.required_capabilities)
      ? payload.required_capabilities.filter((entry): entry is string => typeof entry === 'string')
      : [],
    model: stringValue(payload.model),
    provider: stringValue(payload.provider),
    reasoning_effort: stringValue(payload.reasoning_effort),
    json: payload.json !== false,
    domain_payload: isRecord(payload.domain_payload) ? payload.domain_payload : null,
  });
  return {
    version: 'g2',
    agent_execution_receipt: receipt,
  };
}
