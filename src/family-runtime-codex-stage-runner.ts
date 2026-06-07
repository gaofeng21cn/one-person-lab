import { FrameworkContractError } from './contracts.ts';
import {
  buildCodexExecArgs,
  parseCodexExecOutput,
  recoverCodexExecOutputFromSession,
  runCodexCommandStreaming,
} from './codex.ts';
import {
  AGENT_EXECUTOR_KINDS,
  runAgentExecutor,
  type AgentExecutorKind,
  type StageAttemptExecutorPolicy,
} from './agent-executor.ts';
import {
  DEFAULT_CODEX_STAGE_RUNNER_COMMAND_NO_PROGRESS_TIMEOUT_MS,
  DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
  DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
} from './family-runtime-temporal-constants.ts';
import {
  codexStageRunnerCostSummaryFrom,
  extractCodexSessionUsageRef,
  type CodexSessionUsageRef,
} from './family-runtime-codex-session-usage.ts';
import { codexStageAttemptEnv } from './family-runtime-codex-stage-runner-parts/provider-env.ts';
import {
  runMasOwnerDispatchBridge,
  type MasOwnerDispatchBridgeResult,
} from './family-runtime-codex-stage-runner-parts/mas-owner-dispatch-bridge.ts';
import {
  normalizeTypedStageCloseoutPacket,
  validateCloseoutPacketForAttempt,
  type TypedStageCloseoutPacket,
} from './family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
import { recoverDefaultExecutorDomainReceiptCloseout } from './family-runtime-codex-stage-runner-parts/default-executor-recovery.ts';
import {
  buildAgentStageRunnerReceipt,
  buildCodexStageRunnerReceipt,
  type CodexStageRunnerReceipt,
} from './family-runtime-codex-stage-runner-parts/receipt-builders.ts';
import {
  eventSummary,
  normalizeCodexStageRunnerMode,
  resolvedStagePacketRef,
  runnerPromptFor,
  workspaceRootFromAttempt,
  checkpointRefsFromAttempt,
  type CodexStageRunnerInput,
  type RunnerEventSummary,
} from './family-runtime-codex-stage-runner-parts/input-prompt.ts';
import {
  parseCloseoutFromCodexMessages,
  recoverCloseoutFromCodexSessionWithRetry,
} from './family-runtime-codex-stage-runner-parts/session-closeout-recovery.ts';
import {
  isRecord,
  normalizeTimeoutMs,
  optionalString,
  type JsonRecord,
} from './family-runtime-codex-stage-runner-parts/shared.ts';

export {
  normalizeTypedStageCloseoutPacket,
  type TypedStageCloseoutPacket,
} from './family-runtime-codex-stage-runner-parts/closeout-normalization.ts';

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
  const commandNoProgressTimeoutMs = normalizeTimeoutMs(
    process.env.OPL_CODEX_STAGE_RUNNER_COMMAND_NO_PROGRESS_TIMEOUT_MS,
    DEFAULT_CODEX_STAGE_RUNNER_COMMAND_NO_PROGRESS_TIMEOUT_MS,
  );
  const providerEnv = codexStageAttemptEnv({
    attempt: input.attempt,
    stagePacketRef,
    workspaceRoot,
  });
  const result = await runCodexCommandStreaming(args, {
    env: {
      ...input.env,
      ...providerEnv,
    },
    timeoutMs,
    noOutputTimeoutMs,
    commandNoProgressTimeoutMs,
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
  let masOwnerDispatchBridge: MasOwnerDispatchBridgeResult | null = null;
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
    const domainReceiptRecovery = recoverDefaultExecutorDomainReceiptCloseout({
      workspaceRoot,
      stagePacketRef,
      attempt: input.attempt,
    });
    domainReceiptRecoveryStatus = domainReceiptRecovery.status;
    domainReceiptRecoveryRef = domainReceiptRecovery.receiptRef;
    closeoutPacket = domainReceiptRecovery.closeoutPacket;
    if (!closeoutPacket) {
      masOwnerDispatchBridge = runMasOwnerDispatchBridge({
        workspaceRoot,
        stagePacketRef,
        attempt: input.attempt,
        env: {
          ...input.env,
          ...providerEnv,
        },
      });
      if (masOwnerDispatchBridge.status === 'command_completed') {
        const retriedDomainReceiptRecovery = recoverDefaultExecutorDomainReceiptCloseout({
          workspaceRoot,
          stagePacketRef,
          attempt: input.attempt,
        });
        domainReceiptRecoveryStatus = `after_mas_owner_dispatch:${retriedDomainReceiptRecovery.status}`;
        domainReceiptRecoveryRef = retriedDomainReceiptRecovery.receiptRef;
        closeoutPacket = retriedDomainReceiptRecovery.closeoutPacket;
      }
    }
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
      command_no_progress_timeout_ms: result.commandNoProgressTimeoutMs ?? commandNoProgressTimeoutMs,
      ...(result.activeCommand
        ? {
            active_command: {
              tool_call_id: result.activeCommand.toolCallId,
              title: result.activeCommand.title,
              status: result.activeCommand.status,
              started_at: result.activeCommand.startedAt,
              last_output_at: result.activeCommand.lastOutputAt,
              output_chars: result.activeCommand.outputChars,
            },
          }
        : {}),
      ...(result.timeoutReason === 'command_no_progress_timeout'
        ? { blocked_reason: 'codex_cli_command_execution_no_progress' }
        : {}),
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
      ...(masOwnerDispatchBridge ? { mas_owner_dispatch_bridge: masOwnerDispatchBridge } : {}),
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
