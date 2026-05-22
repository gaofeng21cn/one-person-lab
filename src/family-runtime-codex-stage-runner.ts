import { FrameworkContractError } from './contracts.ts';
import {
  buildCodexCliPreview,
  buildCodexExecArgs,
  parseCodexExecOutput,
  runCodexCommandStreaming,
  type CodexExecEvent,
} from './codex.ts';
import {
  AGENT_EXECUTOR_KINDS,
  runAgentExecutor,
  type AgentExecutionReceipt,
  type AgentExecutorKind,
  type StageAttemptExecutorPolicy,
} from './agent-executor.ts';

type JsonRecord = Record<string, unknown>;

export type TypedStageCloseoutPacket = {
  surface_kind: 'stage_attempt_closeout_packet' | 'stage_memory_closeout_packet' | 'domain_stage_closeout_packet';
  closeout_id?: string;
  closeout_refs: string[];
  consumed_refs: string[];
  consumed_memory_refs: string[];
  writeback_receipt_refs: string[];
  rejected_writes: JsonRecord[];
  next_owner: string | null;
  domain_ready_verdict: string | null;
  route_impact?: JsonRecord;
  authority_boundary: JsonRecord;
};

export type CodexStageRunnerMode = 'dry_run' | 'live_dry_run' | 'codex_cli';

type RunnerEventSummary = {
  event_kind: string;
  value: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function readRecordList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function stageIdFromAttempt(attempt: JsonRecord) {
  return optionalString(attempt.stage_id) ?? 'stage';
}

function checkpointRefsFromAttempt(attempt: JsonRecord) {
  return readStringList(attempt.checkpoint_refs);
}

function stagePacketRefFromAttempt(attempt: JsonRecord) {
  return checkpointRefsFromAttempt(attempt)[0] ?? null;
}

function resolvedStagePacketRef(input: { attempt: JsonRecord; stagePacketRef?: string | null }) {
  return optionalString(input.stagePacketRef) ?? stagePacketRefFromAttempt(input.attempt);
}

export function normalizeCodexStageRunnerMode(value?: string | null): CodexStageRunnerMode {
  const normalized = value?.trim().replace(/-/g, '_');
  if (normalized === 'codex_cli') {
    return 'codex_cli';
  }
  return normalized === 'live_dry_run' ? 'live_dry_run' : 'dry_run';
}

function workspaceRootFromAttempt(attempt: JsonRecord) {
  const workspaceLocator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  return optionalString(workspaceLocator.workspace_root) ?? optionalString(workspaceLocator.repo_root);
}

function runnerPromptFor(input: { attempt: JsonRecord; stagePacketRef?: string | null }) {
  const stageId = stageIdFromAttempt(input.attempt);
  const attemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const stagePacketRef = resolvedStagePacketRef(input);
  return [
    'You are running an OPL provider-backed stage attempt.',
    `Stage attempt id: ${attemptId}`,
    `Stage id: ${stageId}`,
    stagePacketRef ? `Stage packet ref: ${stagePacketRef}` : 'Stage packet ref: unavailable',
    'Execute only within the domain-owned stage packet and skill boundary.',
    'Return progress through structured events when available.',
    'Do not claim provider completion without a typed closeout packet from the domain sidecar.',
  ].join('\n');
}

function eventSummary(event: CodexExecEvent): RunnerEventSummary {
  if (event.type === 'thread.started') {
    return { event_kind: event.type, value: event.threadId };
  }
  if (event.type === 'agent_message') {
    return { event_kind: event.type, value: event.text.slice(0, 240) };
  }
  if (event.type === 'command_execution') {
    return {
      event_kind: event.type,
      value: [event.status, event.title, event.output].filter(Boolean).join(' | ').slice(0, 240),
    };
  }
  return { event_kind: event.type, value: null };
}

function costSummaryFrom(output: string, runnerMode: CodexStageRunnerMode) {
  const usageLines = output
    .split(/\r?\n/)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const tokenUsage = usageLines
    .map((entry) => (isRecord(entry.token_usage) ? entry.token_usage : null))
    .find((entry): entry is JsonRecord => Boolean(entry));
  return {
    cost_status: runnerMode === 'codex_cli' ? 'observed_or_unreported' : 'not_measured_dry_run',
    estimated_cost_usd: typeof tokenUsage?.estimated_cost_usd === 'number' ? tokenUsage.estimated_cost_usd : 0,
    token_usage: {
      input_tokens: typeof tokenUsage?.input_tokens === 'number' ? tokenUsage.input_tokens : 0,
      output_tokens: typeof tokenUsage?.output_tokens === 'number' ? tokenUsage.output_tokens : 0,
      total_tokens: typeof tokenUsage?.total_tokens === 'number' ? tokenUsage.total_tokens : 0,
    },
    billing_boundary: 'codex_cli_activity_runner_reports_only_observed_or_declared_usage',
  };
}

function normalizeTimeoutMs(value: unknown, fallback: number) {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : Number.NaN;
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function normalizeAgentExecutorStageMode(value?: string | null): AgentExecutorKind | null {
  const normalized = value?.trim().replace(/-/g, '_');
  if (AGENT_EXECUTOR_KINDS.includes(normalized as AgentExecutorKind)) {
    return normalized as AgentExecutorKind;
  }
  return null;
}

function executorPolicyFromAttempt(attempt: JsonRecord): StageAttemptExecutorPolicy | null {
  const direct = isRecord(attempt.stage_attempt_executor_policy)
    ? attempt.stage_attempt_executor_policy
    : isRecord(attempt.executor_policy)
      ? attempt.executor_policy
      : null;
  return direct;
}

function executorKindFromAttemptPolicy(attempt: JsonRecord) {
  return normalizeAgentExecutorStageMode(optionalString(executorPolicyFromAttempt(attempt)?.executor_kind));
}

function buildAgentStageRunnerReceipt(input: {
  attempt: JsonRecord;
  stagePacketRef?: string | null;
  runnerMode: AgentExecutorKind;
  observedAt?: string | null;
  agentExecutionReceipt: AgentExecutionReceipt;
}) {
  const checkpointRefs = checkpointRefsFromAttempt(input.attempt);
  return {
    runner_status: {
      runner_kind: 'agent_executor_stage_runner',
      runner_mode: input.runnerMode,
      executor_kind: input.agentExecutionReceipt.executor_kind,
      live_process_started: true,
      dry_run_transport: false,
      process_id: null,
      exit_code: input.agentExecutionReceipt.exit_code,
      stdout_bytes: Buffer.byteLength(input.agentExecutionReceipt.stdout_preview, 'utf8'),
      stderr_bytes: Buffer.byteLength(input.agentExecutionReceipt.stderr_preview, 'utf8'),
      timeout_ms: null,
      typed_closeout_required_for_completion: true,
      free_text_closeout_accepted: false,
    },
    heartbeat_summary: {
      heartbeat_status: 'recorded',
      last_heartbeat_at: input.observedAt ?? null,
      checkpoint_count: checkpointRefs.length,
      checkpoint_refs: checkpointRefs,
    },
    progress_summary: {
      progress_status: input.agentExecutionReceipt.closeout_packet ? 'checkpointed' : 'running',
      stage_id: stageIdFromAttempt(input.attempt),
      stage_packet_ref: input.stagePacketRef ?? null,
      completed_requires_typed_closeout: true,
      thread_id: input.agentExecutionReceipt.session_id,
      runner_events: input.agentExecutionReceipt.event_summary,
    },
    cost_summary: {
      cost_status: 'not_measured_agent_executor_receipt',
      estimated_cost_usd: 0,
      token_usage: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
      billing_boundary: 'agent_executor_adapter_reports_only_declared_or_observed_usage',
    },
    agent_execution_receipt: input.agentExecutionReceipt,
  };
}

export function buildCodexStageRunnerReceipt(input: {
  attempt: JsonRecord;
  stagePacketRef?: string | null;
  runnerMode?: string | null;
  observedAt?: string | null;
  liveProcessStarted?: boolean;
  processId?: number | null;
  exitCode?: number | null;
  stdoutBytes?: number;
  stderrBytes?: number;
  runnerEvents?: RunnerEventSummary[];
  threadId?: string | null;
  timeoutMs?: number | null;
}) {
  const runnerMode = normalizeCodexStageRunnerMode(input.runnerMode);
  const checkpointRefs = checkpointRefsFromAttempt(input.attempt);
  const stagePacketRef = resolvedStagePacketRef(input);
  const observedAt = input.observedAt ?? null;
  const args = buildCodexExecArgs(runnerPromptFor({ attempt: input.attempt, stagePacketRef }), {
    cwd: workspaceRootFromAttempt(input.attempt) ?? undefined,
    json: true,
  });
  return {
    runner_status: {
      runner_kind: 'codex_cli_stage_runner',
      runner_mode: runnerMode,
      live_process_started: Boolean(input.liveProcessStarted),
      dry_run_transport: runnerMode !== 'codex_cli',
      process_id: input.processId ?? null,
      exit_code: input.exitCode ?? null,
      stdout_bytes: input.stdoutBytes ?? 0,
      stderr_bytes: input.stderrBytes ?? 0,
      timeout_ms: input.timeoutMs ?? null,
      command_preview: buildCodexCliPreview(args),
      typed_closeout_required_for_completion: true,
      free_text_closeout_accepted: false,
    },
    heartbeat_summary: {
      heartbeat_status: 'recorded',
      last_heartbeat_at: observedAt,
      checkpoint_count: checkpointRefs.length,
      checkpoint_refs: checkpointRefs,
    },
    progress_summary: {
      progress_status: checkpointRefs.length > 0 ? 'checkpointed' : 'running',
      stage_id: stageIdFromAttempt(input.attempt),
      stage_packet_ref: stagePacketRef,
      completed_requires_typed_closeout: true,
      thread_id: input.threadId ?? null,
      runner_events: input.runnerEvents ?? [],
    },
    cost_summary: costSummaryFrom('', runnerMode),
  };
}

export async function runCodexStageRunner(input: {
  attempt: JsonRecord;
  stagePacketRef?: string | null;
  runnerMode?: string | null;
  observedAt?: string | null;
  timeoutMs?: number | null;
}) {
  const runnerMode = normalizeCodexStageRunnerMode(input.runnerMode);
  const stagePacketRef = resolvedStagePacketRef(input);
  const workspaceRoot = workspaceRootFromAttempt(input.attempt);
  if (runnerMode !== 'codex_cli') {
    return buildCodexStageRunnerReceipt({ ...input, stagePacketRef });
  }
  if (!stagePacketRef || stagePacketRef === 'unavailable') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Live codex_cli stage runner requires a real stage packet ref.',
      {
        stage_attempt_id: optionalString(input.attempt.stage_attempt_id),
        executor_kind: optionalString(input.attempt.executor_kind) ?? 'codex_cli',
        blocked_reason: 'codex_cli_stage_packet_ref_missing',
        required: ['stage_packet_ref via checkpoint_refs[0] or explicit stagePacketRef'],
      },
    );
  }
  if (!workspaceRoot) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Live codex_cli stage runner requires a domain workspace root.',
      {
        stage_attempt_id: optionalString(input.attempt.stage_attempt_id),
        executor_kind: optionalString(input.attempt.executor_kind) ?? 'codex_cli',
        blocked_reason: 'codex_cli_workspace_root_missing',
        required: ['workspace_locator.workspace_root or workspace_locator.repo_root'],
      },
    );
  }

  const args = buildCodexExecArgs(runnerPromptFor(input), {
    cwd: workspaceRoot,
    json: true,
  });
  const runnerEvents: RunnerEventSummary[] = [];
  let processId: number | null = null;
  const timeoutMs = input.timeoutMs != null
    ? normalizeTimeoutMs(input.timeoutMs, 600_000)
    : normalizeTimeoutMs(process.env.OPL_CODEX_STAGE_RUNNER_TIMEOUT_MS, 600_000);
  const result = await runCodexCommandStreaming(args, {
    timeoutMs,
    onProcessStarted(pid) {
      processId = pid;
    },
    onStdoutEvent(event) {
      runnerEvents.push(eventSummary(event));
    },
  });
  const parsed = parseCodexExecOutput(result.stdout);
  return {
    ...buildCodexStageRunnerReceipt({
      ...input,
      stagePacketRef,
      runnerMode,
      liveProcessStarted: true,
      processId,
      exitCode: result.exitCode,
      stdoutBytes: Buffer.byteLength(result.stdout, 'utf8'),
      stderrBytes: Buffer.byteLength(result.stderr, 'utf8'),
      runnerEvents,
      threadId: parsed.threadId,
      timeoutMs,
    }),
    cost_summary: costSummaryFrom(result.stdout, runnerMode),
    process_output_summary: {
      exit_code: result.exitCode,
      final_message_chars: parsed.finalMessage.length,
      stderr_tail: result.stderr.split(/\r?\n/).filter(Boolean).slice(-5),
    },
  };
}

export async function runAgentStageRunner(input: {
  attempt: JsonRecord;
  stagePacketRef?: string | null;
  runnerMode?: string | null;
  observedAt?: string | null;
  timeoutMs?: number | null;
  env?: Record<string, string | undefined>;
}) {
  const executorKind = normalizeAgentExecutorStageMode(input.runnerMode)
    ?? normalizeAgentExecutorStageMode(optionalString(input.attempt.executor_kind))
    ?? executorKindFromAttemptPolicy(input.attempt);
  if (!executorKind || executorKind === 'codex_cli') {
    return await runCodexStageRunner({
      ...input,
      runnerMode: input.runnerMode ?? (executorKind === 'codex_cli' ? 'codex_cli' : undefined),
    });
  }
  const stageAttemptExecutorPolicy = executorPolicyFromAttempt(input.attempt);
  const receipt = runAgentExecutor({
    executor_kind: executorKind,
    stage_attempt_executor_policy: stageAttemptExecutorPolicy,
    mode: 'stage_activity',
    prompt: runnerPromptFor(input),
    cwd: workspaceRootFromAttempt(input.attempt),
    timeout_ms: input.timeoutMs,
    context_refs: [
      ...(input.stagePacketRef ? [input.stagePacketRef] : []),
      ...checkpointRefsFromAttempt(input.attempt),
    ],
    env: input.env,
  });
  return buildAgentStageRunnerReceipt({
    attempt: input.attempt,
    stagePacketRef: input.stagePacketRef,
    runnerMode: executorKind,
    observedAt: input.observedAt,
    agentExecutionReceipt: receipt,
  });
}

export function parseJsonObject(value: string, field: string): JsonRecord {
  const parsed = JSON.parse(value);
  if (!isRecord(parsed)) {
    throw new FrameworkContractError('cli_usage_error', `${field} must be a JSON object.`, {
      field,
    });
  }
  return parsed;
}

export function normalizeTypedStageCloseoutPacket(value: unknown): TypedStageCloseoutPacket {
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage closeout packet must be a JSON object.', {
      surface_kind: null,
    });
  }
  const surfaceKind = optionalString(value.surface_kind);
  if (
    surfaceKind !== 'stage_attempt_closeout_packet'
    && surfaceKind !== 'stage_memory_closeout_packet'
    && surfaceKind !== 'domain_stage_closeout_packet'
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage closeout packet must declare a supported typed surface_kind.',
      {
        surface_kind: surfaceKind,
        allowed_surface_kinds: [
          'stage_attempt_closeout_packet',
          'stage_memory_closeout_packet',
          'domain_stage_closeout_packet',
        ],
      },
    );
  }

  const closeoutRefs = [
    ...readStringList(value.closeout_refs),
    optionalString(value.closeout_ref),
    optionalString(value.receipt_ref),
    optionalString(value.packet_ref),
  ].filter((entry): entry is string => Boolean(entry));
  if (closeoutRefs.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Typed stage closeout must include at least one closeout ref.', {
      required: ['closeout_refs|closeout_ref|receipt_ref|packet_ref'],
    });
  }

  return {
    surface_kind: surfaceKind,
    ...(optionalString(value.closeout_id) ? { closeout_id: optionalString(value.closeout_id)! } : {}),
    closeout_refs: [...new Set(closeoutRefs)],
    consumed_refs: readStringList(value.consumed_refs),
    consumed_memory_refs: readStringList(value.consumed_memory_refs),
    writeback_receipt_refs: readStringList(value.writeback_receipt_refs),
    rejected_writes: readRecordList(value.rejected_writes),
    next_owner: optionalString(value.next_owner),
    domain_ready_verdict: optionalString(value.domain_ready_verdict),
    ...(isRecord(value.route_impact) ? { route_impact: value.route_impact } : {}),
    authority_boundary: isRecord(value.authority_boundary)
      ? value.authority_boundary
      : {
          opl: 'closeout_transport_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
  };
}

export function buildCodexStageActivityInput(input: {
  attempt: JsonRecord;
  stagePacketRef?: string | null;
}) {
  const stagePacketRef = resolvedStagePacketRef(input);
  const workspaceRoot = workspaceRootFromAttempt(input.attempt) ?? null;
  const runnerReceipt = buildCodexStageRunnerReceipt({
    attempt: input.attempt,
    stagePacketRef,
    runnerMode: process.env.OPL_CODEX_STAGE_RUNNER_MODE,
  });
  return {
    activity_kind: 'codex_stage_activity',
    executor: 'codex_cli',
    attempt: input.attempt,
    stage_packet_ref: stagePacketRef,
    stage_packet_binding: {
      binding_status: stagePacketRef && stagePacketRef !== 'unavailable' && workspaceRoot
        ? 'bound'
        : 'missing_required_ref',
      stage_packet_ref: stagePacketRef,
      workspace_root: workspaceRoot,
      binding_source: stagePacketRef ? 'stage_attempt_checkpoint_refs' : null,
      can_claim_stage_complete: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
    ...runnerReceipt,
    expected_closeout: {
      typed_packet_required_for_completion: true,
      free_text_closeout_accepted: false,
    },
    authority_boundary: {
      opl: 'activity_packet_and_receipt_transport_only',
      codex_cli: 'stage_execution_under_domain_prompt_and_skill',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

export function buildDomainSidecarDispatchActivityInput(input: {
  domainId: string;
  dispatchRef: string;
}) {
  return {
    activity_kind: 'domain_sidecar_dispatch_activity',
    domain_id: input.domainId,
    dispatch_ref: input.dispatchRef,
    authority_boundary: {
      opl: 'sidecar_transport_only',
      domain: 'sidecar_dispatch_and_receipt_owner',
    },
  };
}
