import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from './contracts.ts';
import {
  buildCodexCliPreview,
  buildCodexExecArgs,
  parseCodexExecOutput,
  recoverCodexExecOutputFromSession,
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
import {
  DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
  DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
} from './family-runtime-temporal-constants.ts';
import {
  codexStageRunnerCostSummaryFrom,
  extractCodexSessionUsageRef,
  type CodexSessionUsageRef,
} from './family-runtime-codex-session-usage.ts';

type JsonRecord = Record<string, unknown>;

export type TypedStageCloseoutPacket = {
  surface_kind: 'stage_attempt_closeout_packet' | 'stage_memory_closeout_packet' | 'domain_stage_closeout_packet';
  stage_attempt_id?: string;
  idempotency_key?: string;
  closeout_id?: string;
  closeout_refs: string[];
  consumed_refs: string[];
  consumed_memory_refs: string[];
  writeback_receipt_refs: string[];
  rejected_writes: JsonRecord[];
  next_owner: string | null;
  domain_ready_verdict: string | null;
  user_stage_log?: JsonRecord;
  paper_stage_log?: JsonRecord;
  stage_log_summary?: JsonRecord;
  human_stage_log?: JsonRecord;
  human_summary?: JsonRecord;
  route_impact?: JsonRecord;
  authority_boundary: JsonRecord;
};

type CodexStageRunnerMode = 'dry_run' | 'live_dry_run' | 'codex_cli';

type RunnerEventSummary = {
  event_kind: string;
  value: string | null;
};

type CodexStageRunnerStatus = {
  runner_kind: 'codex_cli_stage_runner';
  runner_mode: CodexStageRunnerMode;
  live_process_started: boolean;
  dry_run_transport: boolean;
  process_id: number | null;
  exit_code: number | null;
  stdout_bytes: number;
  stderr_bytes: number;
  timeout_ms: number | null;
  no_output_timeout_ms: number | null;
  command_preview: string[];
  typed_closeout_required_for_completion: true;
  free_text_closeout_accepted: false;
};

type CodexStageRunnerBaseReceipt = {
  runner_status: CodexStageRunnerStatus;
  heartbeat_summary: {
    heartbeat_status: 'recorded';
    last_heartbeat_at: string | null;
    checkpoint_count: number;
    checkpoint_refs: string[];
  };
  progress_summary: {
    progress_status: 'checkpointed' | 'running';
    stage_id: string;
    stage_packet_ref: string | null;
    completed_requires_typed_closeout: true;
    thread_id: string | null;
    runner_events: RunnerEventSummary[];
  };
  cost_summary: ReturnType<typeof codexStageRunnerCostSummaryFrom>;
};

type CodexStageRunnerProcessOutputSummary = {
  exit_code: number;
  final_message_chars: number;
  stderr_tail: string[];
  timeout_reason?: 'total_timeout' | 'no_output_timeout' | 'unsupported_tool_protocol' | 'activity_cancelled';
  no_output_timeout_ms?: number | null;
  blocked_reason?: string;
  pending_function_call_count?: number;
  function_call_names?: string[];
  unsupported_function_call_session_path?: string;
  recovered_session_path?: string;
  recovered_final_message_chars?: number;
  session_recovery_status?: string;
  session_recovery_attempts?: number;
  domain_receipt_recovery_status?: string;
  domain_receipt_recovery_ref?: string;
  closeout_rejection_reason?: 'stage_attempt_id_mismatch' | 'idempotency_key_mismatch';
  rejected_closeout_stage_attempt_id?: string;
  rejected_closeout_idempotency_key?: string;
};

type CodexStageRunnerInput = {
  attempt: JsonRecord;
  stagePacketRef?: string | null;
  runnerMode?: string | null;
  observedAt?: string | null;
  timeoutMs?: number | null;
  noOutputTimeoutMs?: number | null;
  onRunnerProgress?: (event: RunnerEventSummary) => void;
  signal?: AbortSignal;
};

type CodexStageRunnerReceipt = CodexStageRunnerBaseReceipt & {
  closeout_packet: TypedStageCloseoutPacket | null;
  process_output_summary?: CodexStageRunnerProcessOutputSummary;
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

function readJsonRecordFile(filePath: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
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

function normalizeCodexStageRunnerMode(value?: string | null): CodexStageRunnerMode {
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
    'Do not claim provider completion without a typed closeout packet from the domain handler.',
    'Final output contract: the last non-empty assistant message MUST be exactly one JSON object and nothing else.',
    'That JSON object MUST have surface_kind stage_attempt_closeout_packet, stage_memory_closeout_packet, or domain_stage_closeout_packet, and at least one closeout ref.',
    'Do not wrap the JSON in Markdown. Do not add prose, code fences, prefixes, suffixes, explanations, or status text before or after the JSON.',
    'If the stage is blocked and no typed closeout packet exists, make the final assistant message a pure JSON typed blocker/closeout packet emitted by the domain-owned path, not free text.',
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
  if (event.type === 'unsupported_function_call') {
    return { event_kind: event.type, value: event.name.slice(0, 240) };
  }
  return { event_kind: event.type, value: null };
}

function parseCloseoutFromCodexMessages(messages: string[]) {
  const terminalMessages = messages.filter((entry) => entry.trim().length > 0);
  if (terminalMessages.length === 0) {
    return null;
  }
  const maxSuffixMessages = 64;
  const maxSuffixChars = 128 * 1024;
  let suffix = '';
  for (let index = terminalMessages.length - 1; index >= 0 && terminalMessages.length - index <= maxSuffixMessages; index -= 1) {
    suffix = `${terminalMessages[index]}${suffix}`;
    if (suffix.length > maxSuffixChars) {
      break;
    }
    try {
      const parsed = JSON.parse(suffix.trim()) as unknown;
      return normalizeTypedStageCloseoutPacket(parsed);
    } catch {
      // Keep fail-closed: only an exact terminal JSON object is accepted.
    }
  }
  return null;
}

function normalizeTimeoutMs(value: unknown, fallback: number) {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : Number.NaN;
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recoverCloseoutFromCodexSessionWithRetry(input: {
  threadId: string | null;
  timeoutMs: number;
  intervalMs: number;
}) {
  const timeoutMs = normalizeTimeoutMs(input.timeoutMs, 0);
  const intervalMs = normalizeTimeoutMs(input.intervalMs, 100);
  const startedAt = Date.now();
  let attempts = 0;
  let latestRecovered: ReturnType<typeof recoverCodexExecOutputFromSession> = null;
  let latestParsed: ReturnType<typeof parseCodexExecOutput> | null = null;

  while (true) {
    attempts += 1;
    latestRecovered = recoverCodexExecOutputFromSession(input.threadId);
    if (latestRecovered) {
      latestParsed = parseCodexExecOutput(latestRecovered.output);
      const closeoutPacket = parseCloseoutFromCodexMessages(latestParsed.messages);
      if (closeoutPacket) {
        return {
          closeoutPacket,
          recovered: latestRecovered,
          parsed: latestParsed,
          attempts,
          status: 'closeout_found',
        };
      }
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= timeoutMs) {
      return {
        closeoutPacket: null,
        recovered: latestRecovered,
        parsed: latestParsed,
        attempts,
        status: latestRecovered ? 'session_found_without_closeout' : 'session_not_found',
      };
    }

    await sleep(Math.min(intervalMs, Math.max(0, timeoutMs - elapsedMs)));
  }
}

function defaultExecutorExecutionRefFromStagePacketRef(stagePacketRef: string) {
  const marker = '/artifacts/supervision/consumer/default_executor_dispatches/';
  const markerIndex = stagePacketRef.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }
  return `${stagePacketRef.slice(0, markerIndex)}`
    + '/artifacts/supervision/consumer/default_executor_execution/latest.json';
}

function findMatchingDefaultExecutorExecution(input: {
  executionIndex: JsonRecord;
  stagePacket: JsonRecord | null;
}) {
  const executions = [
    ...readRecordList(input.executionIndex.executions).map((execution) => ({
      execution,
      receiptRefSuffix: '',
    })),
    ...readRecordList(input.executionIndex.execution_ledger).map((execution) => ({
      execution,
      receiptRefSuffix: '#execution_ledger',
    })),
  ];
  if (executions.length === 0) {
    return null;
  }
  const studyId = optionalString(input.stagePacket?.study_id);
  const actionType = optionalString(input.stagePacket?.action_type);
  const actionFingerprint = optionalString(input.stagePacket?.action_fingerprint);
  const idempotencyKey = optionalString(input.stagePacket?.idempotency_key);
  if (!studyId || !actionType || (!actionFingerprint && !idempotencyKey)) {
    return null;
  }
  return executions.find(({ execution }) => {
    const matchesStudy = optionalString(execution.study_id) === studyId;
    const matchesAction = optionalString(execution.action_type) === actionType;
    const executionFingerprint = optionalString(execution.action_fingerprint);
    const matchesFingerprint = actionFingerprint && executionFingerprint
      ? executionFingerprint === actionFingerprint
      : false;
    const matchesIdempotency = idempotencyKey
      ? optionalString(execution.idempotency_key) === idempotencyKey
      : false;
    return matchesStudy && matchesAction && (matchesIdempotency || matchesFingerprint);
  }) ?? null;
}

function closeoutPacketFromDefaultExecutorExecution(input: {
  execution: JsonRecord;
  receiptRef: string;
}): TypedStageCloseoutPacket | null {
  const executionStatus = optionalString(input.execution.execution_status);
  if (!executionStatus || !['blocked', 'completed', 'succeeded', 'executed'].includes(executionStatus)) {
    return null;
  }
  const ownerResult = isRecord(input.execution.owner_result) ? input.execution.owner_result : {};
  const blockedReason = optionalString(ownerResult.blocked_reason)
    ?? optionalString(input.execution.blocked_reason)
    ?? optionalString(input.execution.error);
  return normalizeTypedStageCloseoutPacket({
    surface_kind: 'domain_stage_closeout_packet',
    closeout_refs: [input.receiptRef],
    consumed_refs: readStringList(input.execution.source_refs),
    consumed_memory_refs: readStringList(input.execution.consumed_memory_refs),
    writeback_receipt_refs: readStringList(input.execution.writeback_receipt_refs),
    rejected_writes: [
      ...readRecordList(input.execution.typed_blockers),
      ...(blockedReason
        ? [{
            blocker_id: blockedReason,
            reason: blockedReason,
            execution_status: executionStatus,
          }]
        : []),
    ],
    next_owner: optionalString(input.execution.next_owner)
      ?? optionalString((isRecord(input.execution.current_owner_route) ? input.execution.current_owner_route : {}).next_owner)
      ?? 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      decision: executionStatus,
      execution_id: optionalString(input.execution.execution_id),
      action_type: optionalString(input.execution.action_type),
      owner_callable_surface: optionalString(input.execution.owner_callable_surface),
      required_output_surface: optionalString(input.execution.required_output_surface),
      blocked_reason: blockedReason,
      owner_result_status: optionalString(ownerResult.status),
      quality_authorized: ownerResult.quality_authorized === true,
      submission_authorized: ownerResult.submission_authorized === true,
      current_package_write_authorized: ownerResult.current_package_write_authorized === true,
      writes_performed: false,
    },
    authority_boundary: {
      opl: 'default_executor_execution_receipt_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
      can_authorize_submission: false,
    },
  });
}

function recoverMasDefaultExecutorReceiptCloseout(input: {
  workspaceRoot: string;
  stagePacketRef: string;
}) {
  const receiptRef = defaultExecutorExecutionRefFromStagePacketRef(input.stagePacketRef);
  if (!receiptRef) {
    return { status: 'not_default_executor_dispatch' as const, closeoutPacket: null, receiptRef: null };
  }
  const receiptPath = path.join(input.workspaceRoot, receiptRef);
  const executionIndex = readJsonRecordFile(receiptPath);
  if (!executionIndex) {
    return { status: 'receipt_not_found' as const, closeoutPacket: null, receiptRef };
  }
  const stagePacket = readJsonRecordFile(path.join(input.workspaceRoot, input.stagePacketRef));
  const match = findMatchingDefaultExecutorExecution({ executionIndex, stagePacket });
  if (!match) {
    return { status: 'matching_execution_not_found' as const, closeoutPacket: null, receiptRef };
  }
  const closeoutPacket = closeoutPacketFromDefaultExecutorExecution({
    execution: match.execution,
    receiptRef: `${receiptRef}${match.receiptRefSuffix}`,
  });
  return {
    status: closeoutPacket ? 'closeout_found' as const : 'execution_not_terminal' as const,
    closeoutPacket,
    receiptRef,
  };
}

function validateCloseoutPacketForAttempt(input: {
  closeoutPacket: TypedStageCloseoutPacket | null;
  attempt: JsonRecord;
}) {
  const closeoutPacket = input.closeoutPacket;
  if (!closeoutPacket) {
    return { closeoutPacket: null, rejection: null };
  }
  const attemptId = optionalString(input.attempt.stage_attempt_id);
  if (attemptId && closeoutPacket.stage_attempt_id && closeoutPacket.stage_attempt_id !== attemptId) {
    return {
      closeoutPacket: null,
      rejection: {
        reason: 'stage_attempt_id_mismatch' as const,
        stage_attempt_id: closeoutPacket.stage_attempt_id,
        idempotency_key: closeoutPacket.idempotency_key ?? null,
      },
    };
  }
  const idempotencyKey = optionalString(input.attempt.idempotency_key);
  if (idempotencyKey && closeoutPacket.idempotency_key && closeoutPacket.idempotency_key !== idempotencyKey) {
    return {
      closeoutPacket: null,
      rejection: {
        reason: 'idempotency_key_mismatch' as const,
        stage_attempt_id: closeoutPacket.stage_attempt_id ?? null,
        idempotency_key: closeoutPacket.idempotency_key,
      },
    };
  }
  return { closeoutPacket, rejection: null };
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

function codexProjectionRunnerModeFromAttempt(attempt: JsonRecord) {
  const explicitMode = normalizeCodexStageRunnerMode(process.env.OPL_CODEX_STAGE_RUNNER_MODE);
  if (process.env.OPL_CODEX_STAGE_RUNNER_MODE?.trim()) {
    return explicitMode;
  }
  const executorKind = normalizeAgentExecutorStageMode(optionalString(attempt.executor_kind))
    ?? executorKindFromAttemptPolicy(attempt);
  return executorKind === 'codex_cli' ? 'codex_cli' : explicitMode;
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

function buildCodexStageRunnerReceipt(input: {
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
  noOutputTimeoutMs?: number | null;
}): CodexStageRunnerBaseReceipt {
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
      no_output_timeout_ms: input.noOutputTimeoutMs ?? null,
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
    cost_summary: codexStageRunnerCostSummaryFrom('', runnerMode),
  };
}

async function runCodexStageRunner(input: CodexStageRunnerInput): Promise<CodexStageRunnerReceipt> {
  const runnerMode = normalizeCodexStageRunnerMode(input.runnerMode);
  const stagePacketRef = resolvedStagePacketRef(input);
  const workspaceRoot = workspaceRootFromAttempt(input.attempt);
  if (runnerMode !== 'codex_cli') {
    return {
      ...buildCodexStageRunnerReceipt({ ...input, stagePacketRef }),
      closeout_packet: null,
    };
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
    ? normalizeTimeoutMs(input.timeoutMs, DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS)
    : normalizeTimeoutMs(process.env.OPL_CODEX_STAGE_RUNNER_TIMEOUT_MS, DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS);
  const noOutputTimeoutMs = normalizeTimeoutMs(
    input.noOutputTimeoutMs ?? process.env.OPL_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
    DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
  );
  const result = await runCodexCommandStreaming(args, {
    timeoutMs,
    noOutputTimeoutMs,
    signal: input.signal,
    onProcessStarted(pid) {
      processId = pid;
    },
    onStdoutEvent(event) {
      const summary = eventSummary(event);
      runnerEvents.push(summary);
      input.onRunnerProgress?.(summary);
    },
  });
  const parsed = parseCodexExecOutput(result.stdout);
  let closeoutPacket = parseCloseoutFromCodexMessages(parsed.messages);
  let recoveredSessionPath: string | null = null;
  let recoveredFinalMessageChars = 0;
  let sessionRecoveryAttempts = 0;
  let sessionRecoveryStatus: string | null = null;
  let sessionUsageRef: CodexSessionUsageRef | null = null;
  let domainReceiptRecoveryStatus: string | null = null;
  let domainReceiptRecoveryRef: string | null = null;
  let closeoutRejection: ReturnType<typeof validateCloseoutPacketForAttempt>['rejection'] = null;
  if (
    !closeoutPacket
    && result.timeoutReason !== 'unsupported_tool_protocol'
    && result.timeoutReason !== 'activity_cancelled'
  ) {
    const recovered = await recoverCloseoutFromCodexSessionWithRetry({
      threadId: parsed.threadId,
      timeoutMs: normalizeTimeoutMs(process.env.OPL_CODEX_SESSION_RECOVERY_TIMEOUT_MS, 5_000),
      intervalMs: normalizeTimeoutMs(process.env.OPL_CODEX_SESSION_RECOVERY_INTERVAL_MS, 100),
    });
    sessionRecoveryAttempts = recovered.attempts;
    sessionRecoveryStatus = recovered.status;
    closeoutPacket = recovered.closeoutPacket;
    if (recovered.recovered) {
      recoveredSessionPath = recovered.recovered.sessionPath;
      recoveredFinalMessageChars = recovered.parsed?.finalMessage.length ?? 0;
      sessionUsageRef = extractCodexSessionUsageRef(recovered.recovered);
    }
  }
  if (!sessionUsageRef) {
    sessionUsageRef = extractCodexSessionUsageRef(recoverCodexExecOutputFromSession(parsed.threadId));
  }
  if (!closeoutPacket && result.timeoutReason !== 'unsupported_tool_protocol') {
    const domainReceiptRecovery = recoverMasDefaultExecutorReceiptCloseout({
      workspaceRoot,
      stagePacketRef,
    });
    domainReceiptRecoveryStatus = domainReceiptRecovery.status;
    domainReceiptRecoveryRef = domainReceiptRecovery.receiptRef;
    closeoutPacket = domainReceiptRecovery.closeoutPacket;
  }
  const validatedCloseout = validateCloseoutPacketForAttempt({
    closeoutPacket,
    attempt: input.attempt,
  });
  closeoutPacket = validatedCloseout.closeoutPacket;
  closeoutRejection = validatedCloseout.rejection;
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
      noOutputTimeoutMs,
    }),
    cost_summary: codexStageRunnerCostSummaryFrom(result.stdout, runnerMode, sessionUsageRef),
    closeout_packet: closeoutPacket,
    process_output_summary: {
      exit_code: result.exitCode,
      final_message_chars: parsed.finalMessage.length,
      stderr_tail: result.stderr.split(/\r?\n/).filter(Boolean).slice(-5),
      ...(result.timeoutReason ? { timeout_reason: result.timeoutReason } : {}),
      no_output_timeout_ms: result.noOutputTimeoutMs ?? noOutputTimeoutMs,
      ...(result.timeoutReason === 'unsupported_tool_protocol'
        ? {
            blocked_reason: 'codex_cli_unsupported_function_call',
            pending_function_call_count: result.unsupportedFunctionCalls?.length ?? 0,
            function_call_names: [...new Set((result.unsupportedFunctionCalls ?? []).map((call) => call.name))],
            ...(result.unsupportedFunctionCallSessionPath
              ? { unsupported_function_call_session_path: result.unsupportedFunctionCallSessionPath }
              : {}),
          }
        : {}),
      ...(result.timeoutReason === 'activity_cancelled'
        ? { blocked_reason: 'codex_cli_activity_cancelled' }
        : {}),
      ...(recoveredSessionPath
        ? {
            recovered_session_path: recoveredSessionPath,
            recovered_final_message_chars: recoveredFinalMessageChars,
          }
        : {}),
      ...(sessionRecoveryStatus
        ? {
            session_recovery_status: sessionRecoveryStatus,
            session_recovery_attempts: sessionRecoveryAttempts,
          }
        : {}),
      ...(domainReceiptRecoveryStatus
        ? {
            domain_receipt_recovery_status: domainReceiptRecoveryStatus,
            ...(domainReceiptRecoveryRef ? { domain_receipt_recovery_ref: domainReceiptRecoveryRef } : {}),
          }
        : {}),
      ...(closeoutRejection
        ? {
            closeout_rejection_reason: closeoutRejection.reason,
            ...(closeoutRejection.stage_attempt_id
              ? { rejected_closeout_stage_attempt_id: closeoutRejection.stage_attempt_id }
              : {}),
            ...(closeoutRejection.idempotency_key
              ? { rejected_closeout_idempotency_key: closeoutRejection.idempotency_key }
              : {}),
          }
        : {}),
    },
  };
}

export async function runAgentStageRunner(input: {
  attempt: JsonRecord;
  stagePacketRef?: string | null;
  runnerMode?: string | null;
  observedAt?: string | null;
  timeoutMs?: number | null;
  noOutputTimeoutMs?: number | null;
  onRunnerProgress?: (event: RunnerEventSummary) => void;
  signal?: AbortSignal;
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
    ...(optionalString(value.stage_attempt_id) ? { stage_attempt_id: optionalString(value.stage_attempt_id)! } : {}),
    ...(optionalString(value.idempotency_key) ? { idempotency_key: optionalString(value.idempotency_key)! } : {}),
    ...(optionalString(value.closeout_id) ? { closeout_id: optionalString(value.closeout_id)! } : {}),
    closeout_refs: [...new Set(closeoutRefs)],
    consumed_refs: readStringList(value.consumed_refs),
    consumed_memory_refs: readStringList(value.consumed_memory_refs),
    writeback_receipt_refs: readStringList(value.writeback_receipt_refs),
    rejected_writes: readRecordList(value.rejected_writes),
    next_owner: optionalString(value.next_owner),
    domain_ready_verdict: optionalString(value.domain_ready_verdict),
    ...(isRecord(value.user_stage_log) ? { user_stage_log: value.user_stage_log } : {}),
    ...(isRecord(value.paper_stage_log) ? { paper_stage_log: value.paper_stage_log } : {}),
    ...(isRecord(value.stage_log_summary) ? { stage_log_summary: value.stage_log_summary } : {}),
    ...(isRecord(value.human_stage_log) ? { human_stage_log: value.human_stage_log } : {}),
    ...(isRecord(value.human_summary) ? { human_summary: value.human_summary } : {}),
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
    runnerMode: codexProjectionRunnerModeFromAttempt(input.attempt),
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
