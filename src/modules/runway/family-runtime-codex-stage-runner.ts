import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { preflightDomainWorkspaceCheckoutCurrentness } from './family-runtime-checkout-currentness.ts';
import {
  buildCodexExecArgs,
  buildCodexExecResumeArgs,
  parseCodexExecOutput,
  recoverCodexExecOutputFromSession,
  runCodexCommandStreaming,
  type CodexCommandResult,
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
  runnerPromptForExecution,
  protocolCloseoutResumePrompt,
  stageIdFromAttempt,
  workspaceRootFromAttempt,
  checkpointRefsFromAttempt,
  type CodexStageRunnerInput,
  type RunnerEventSummary,
} from './family-runtime-codex-stage-runner-parts/input-prompt.ts';
import { verifyStageQualityCloseoutArtifactIdentity } from './family-runtime-codex-stage-runner-parts/artifact-identity-verification.ts';
import {
  parseCloseoutFromCodexMessages,
  recoverCloseoutFromCodexSessionWithRetry,
} from './family-runtime-codex-stage-runner-parts/session-closeout-recovery.ts';
import {
  createCodexCloseoutCapture,
  parseCapturedCloseoutMessage,
  persistRawStageOutput,
} from './family-runtime-codex-stage-runner-parts/stage-closeout-capture.ts';
import {
  buildProgressCloseoutProjection,
} from './progress-closeout-projection.ts';
import {
  runCodexInE2bSandbox,
  sandboxAttemptForCodex,
  type E2bCodexStageExecutionSummary,
} from './e2b-codex-stage-execution.ts';
import {
  localSandboxWorkspaceRoot,
  runCodexInLocalSandbox,
  selectCodexStageSandboxProvider,
  type LocalCodexStageSandboxExecutionSummary,
} from './local-codex-stage-sandbox.ts';
import {
  isRecord,
  normalizeTimeoutMs,
  type JsonRecord,
} from './family-runtime-codex-stage-runner-parts/shared.ts';
import { stringValue as optionalString } from '../../kernel/json-record.ts';

export {
  normalizeTypedStageCloseoutPacket,
  type TypedStageCloseoutPacket,
} from './family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
export {
  createCodexCloseoutCaptureForTest,
} from './family-runtime-codex-stage-runner-parts/stage-closeout-capture.ts';

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
      : isRecord(attempt.workspace_locator)
        && isRecord(attempt.workspace_locator.stage_attempt_executor_policy)
        ? attempt.workspace_locator.stage_attempt_executor_policy
      : null;
  return direct;
}

function codexExecOptionsFromPolicy(policy: StageAttemptExecutorPolicy | null) {
  return {
    model: optionalString(policy?.model) ?? undefined,
    provider: optionalString(policy?.provider) ?? undefined,
    reasoningEffort: optionalString(policy?.reasoning_effort) ?? undefined,
  };
}

function codexCloseoutCaptureExecOptions(input: {
  codexExecOptions: ReturnType<typeof codexExecOptionsFromPolicy>;
  outputLastMessagePath: string;
}) {
  return {
    ...input.codexExecOptions,
    outputLastMessagePath: input.outputLastMessagePath,
  };
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

function buildProviderRuntimeCloseoutPacket(input: {
  attempt: JsonRecord;
  stagePacketRef: string;
  blockedReason: string;
  routeImpact?: JsonRecord | null;
}) {
  const stageAttemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const idempotencyKey = optionalString(input.attempt.idempotency_key);
  const stageId = stageIdFromAttempt(input.attempt);
  const domainId = optionalString(input.attempt.domain_id);
  return normalizeTypedStageCloseoutPacket({
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: stageAttemptId,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    closeout_refs: [
      `opl://stage-attempts/${encodeURIComponent(stageAttemptId)}/runtime-blockers/${encodeURIComponent(input.blockedReason)}`,
    ],
    consumed_refs: [input.stagePacketRef],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [{
      surface_kind: 'opl_provider_runtime_typed_blocker_ref',
      blocker_id: input.blockedReason,
      stage_attempt_id: stageAttemptId,
      stage_id: stageId,
      ...(domainId ? { domain_id: domainId } : {}),
      owner: 'one-person-lab',
      reason: input.blockedReason,
      provider_completion_is_domain_ready: false,
      authority_boundary: {
        opl: 'provider_runtime_blocker_ref_only',
        domain: 'truth_quality_artifact_gate_owner',
        can_write_domain_truth: false,
        can_create_domain_owner_receipt: false,
        can_create_domain_typed_blocker: false,
        can_authorize_quality_verdict: false,
        can_claim_domain_ready: false,
      },
    }],
    next_owner: domainId ?? null,
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      provider_blocker_reason: input.blockedReason,
      provider_blocker_surface: 'codex_stage_activity.process_output_summary',
      runtime_blocker_owner: 'one-person-lab',
      runtime_blocker_is_domain_owner_answer: false,
      provider_completion_is_domain_ready: false,
      ...(input.routeImpact ?? {}),
    },
    authority_boundary: {
      opl: 'provider_runtime_closeout_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      provider_completion_is_domain_ready: false,
    },
  });
}

function buildRawArtifactProgressCloseoutPacket(input: {
  attempt: JsonRecord;
  stagePacketRef: string;
  rawArtifact: NonNullable<ReturnType<typeof persistRawStageOutput>>;
  normalizationFindings: string[];
}) {
  const stageAttemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const idempotencyKey = optionalString(input.attempt.idempotency_key);
  const domainId = optionalString(input.attempt.domain_id);
  return normalizeTypedStageCloseoutPacket({
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: stageAttemptId,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    closeout_refs: [{
      ref: input.rawArtifact.output_ref,
      ref_kind: 'raw_executor_output',
      sha256: input.rawArtifact.sha256,
      size_bytes: input.rawArtifact.size_bytes,
    }],
    consumed_refs: [input.stagePacketRef],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: domainId ?? null,
    domain_ready_verdict: 'completed_with_quality_debt',
    route_impact: {
      transition_outcome: 'completed_with_quality_debt',
      consumable_artifact_refs: [input.rawArtifact.output_ref],
      artifact_metadata_refs: [input.rawArtifact.metadata_ref],
      quality_debt_refs: input.normalizationFindings.map(
        (finding) => `opl://stage-attempts/${encodeURIComponent(stageAttemptId)}/quality-debt/${encodeURIComponent(finding)}`,
      ),
      normalization_findings: input.normalizationFindings,
      next_stage_may_start: true,
      route_back_selection_owner: 'codex_cli',
      route_back_may_target_any_declared_stage: true,
      negative_or_partial_output_counts_as_progress: true,
      framework_generated_envelope: true,
    },
    authority_boundary: {
      opl: 'raw_executor_output_progress_envelope_only',
      domain: 'truth_quality_route_back_and_artifact_authority_owner',
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      provider_completion_is_domain_ready: false,
    },
  });
}

function summarizeCodexProviderErrors(errors?: CodexCommandResult['providerErrors'] | null) {
  const normalized = (errors ?? [])
    .filter((error) => error.message.trim().length > 0)
    .map((error) => ({
      message: error.message.trim(),
      statusCode: error.statusCode,
    }));
  return {
    count: normalized.length,
    statusCodes: [
      ...new Set(normalized
        .map((error) => error.statusCode)
        .filter((statusCode): statusCode is number => typeof statusCode === 'number')),
    ],
    messages: [
      ...new Set(normalized.map((error) => error.message)),
    ].slice(-3),
  };
}

function providerBlockedReasonFrom(errors?: CodexCommandResult['providerErrors'] | null) {
  const messages = (errors ?? []).map((error) => error.message.trim());
  return messages.find((message) => message.startsWith('local_sandbox_')) ?? null;
}

function withCodexTokenAccounting(
  closeoutPacket: TypedStageCloseoutPacket | null,
  costSummary: ReturnType<typeof codexStageRunnerCostSummaryFrom>,
) {
  if (!closeoutPacket) {
    return closeoutPacket;
  }
  const tokenUsage = costSummary.token_usage;
  const observedTokenUsage = tokenUsage
    ? {
        status: 'observed',
        input_tokens: tokenUsage.input_tokens,
        cached_input_tokens: tokenUsage.cached_input_tokens,
        output_tokens: tokenUsage.output_tokens,
        reasoning_output_tokens: tokenUsage.reasoning_output_tokens,
        total_tokens: tokenUsage.total_tokens,
        source: costSummary.telemetry_source,
        source_ref: costSummary.source_ref,
        observed_at: costSummary.observed_at,
        billing_boundary: costSummary.billing_boundary,
      }
    : null;
  const usageRefs = [
    optionalString(costSummary.source_ref),
    optionalString(costSummary.session_usage_refs?.session_ref),
  ].filter((ref): ref is string => Boolean(ref));
  const mergedUsageRefs = [
    ...new Set([
      ...(closeoutPacket.usage_refs ?? []),
      ...usageRefs,
    ]),
  ];
  const withStageLogAccounting = (stageLog: JsonRecord | undefined) => {
    if (!stageLog) {
      return undefined;
    }
    const stageLogUsageRefs = [
      ...new Set([
        ...(
          Array.isArray(stageLog.token_usage_refs)
            ? stageLog.token_usage_refs.filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0)
            : []
        ),
        ...mergedUsageRefs,
      ]),
    ];
    return {
      ...stageLog,
      ...(observedTokenUsage ? { token_usage: observedTokenUsage } : {}),
      ...(stageLogUsageRefs.length > 0 ? { token_usage_refs: stageLogUsageRefs } : {}),
    };
  };
  return {
    ...closeoutPacket,
    ...(observedTokenUsage ? { token_usage: observedTokenUsage } : {}),
    ...(mergedUsageRefs.length > 0 ? { usage_refs: mergedUsageRefs } : {}),
    ...(costSummary.session_usage_refs ? { session_usage_refs: costSummary.session_usage_refs } : {}),
    cost_summary: costSummary,
    ...(closeoutPacket.user_stage_log
      ? { user_stage_log: withStageLogAccounting(closeoutPacket.user_stage_log) }
      : {}),
    ...(closeoutPacket.stage_log_summary
      ? { stage_log_summary: withStageLogAccounting(closeoutPacket.stage_log_summary) }
      : {}),
    ...(closeoutPacket.human_stage_log
      ? { human_stage_log: withStageLogAccounting(closeoutPacket.human_stage_log) }
      : {}),
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
  const stagePacketTransportRef = stagePacketRef ?? 'unavailable';
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
  const workspaceLocator = isRecord(input.attempt.workspace_locator) ? input.attempt.workspace_locator : {};
  const stageRunCurrentnessAdmission = isRecord(workspaceLocator.stage_run_currentness_admission)
    ? workspaceLocator.stage_run_currentness_admission
    : null;
  const inheritedCurrentnessAdmissionAccepted = Boolean(
    optionalString(input.attempt.stage_run_id)
    && stageRunCurrentnessAdmission?.stage_run_id === optionalString(input.attempt.stage_run_id)
    && stageRunCurrentnessAdmission?.child_attempts_inherit_admission === true
    && ['current', 'fast_forwarded', 'not_git_checkout'].includes(
      optionalString(stageRunCurrentnessAdmission.status) ?? '',
    ),
  );
  const checkoutCurrentnessPreflight = inheritedCurrentnessAdmissionAccepted
    ? null
    : preflightDomainWorkspaceCheckoutCurrentness({
        domainId: input.attempt.domain_id,
        workspaceLocator,
      });
  if (checkoutCurrentnessPreflight?.status === 'blocked') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Live codex_cli stage runner requires a current clean MAS workspace checkout.',
      {
        stage_attempt_id: optionalString(input.attempt.stage_attempt_id),
        executor_kind: optionalString(input.attempt.executor_kind) ?? 'codex_cli',
        blocked_reason: checkoutCurrentnessPreflight.reason ?? 'checkout_currentness_blocked',
        checkout_currentness_preflight: checkoutCurrentnessPreflight,
      },
    );
  }

  const stageCloseoutCapture = createCodexCloseoutCapture();
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
    stagePacketRef: stagePacketTransportRef,
    workspaceRoot,
  });
  const codexExecOptions = codexExecOptionsFromPolicy(executorPolicyFromAttempt(input.attempt));
  let sandboxExecution: E2bCodexStageExecutionSummary | LocalCodexStageSandboxExecutionSummary | null = null;
  const stageSandboxEnv = { ...process.env, ...input.env };
  const sandboxProvider = selectCodexStageSandboxProvider(stageSandboxEnv);
  const runInE2bSandbox = sandboxProvider === 'e2b';
  const runInLocalSandbox = sandboxProvider === 'local_devcontainer' || sandboxProvider === 'local_docker';
  const runInSandbox = runInE2bSandbox || runInLocalSandbox;
  try {
    const sandboxWorkspaceRoot = runInE2bSandbox
      ? stageSandboxEnv.OPL_E2B_WORKSPACE_ROOT?.trim()
        || stageSandboxEnv.OPL_EXTERNAL_SANDBOX_WORKSPACE_ROOT?.trim()
        || '/home/user/opl-stage-workspace'
      : runInLocalSandbox
        ? localSandboxWorkspaceRoot(stageSandboxEnv)
        : workspaceRoot;
    const executionAttempt = runInSandbox
      ? sandboxAttemptForCodex({
          attempt: input.attempt,
          sandboxWorkspaceRoot,
          workspaceTransport: runInLocalSandbox ? 'local_sandbox_git_clone' : 'external_sandbox_git_clone',
        })
      : input.attempt;
    const executionProviderEnv = codexStageAttemptEnv({
      attempt: executionAttempt,
      stagePacketRef: stagePacketTransportRef,
      workspaceRoot: runInSandbox ? sandboxWorkspaceRoot : workspaceRoot,
    });
    const args = buildCodexExecArgs(runnerPromptForExecution({ ...input, stagePacketRef }, executionAttempt), {
      cwd: runInSandbox ? sandboxWorkspaceRoot : workspaceRoot,
      json: true,
      ...(runInSandbox
        ? codexExecOptions
        : codexCloseoutCaptureExecOptions({
            codexExecOptions,
            outputLastMessagePath: stageCloseoutCapture.outputLastMessagePath,
          })),
    });
    let result: CodexCommandResult;
    if (runInE2bSandbox) {
      const sandboxResult = await runCodexInE2bSandbox({
          attempt: input.attempt,
          args,
          env: {
            ...input.env,
            ...executionProviderEnv,
          },
          timeoutMs,
          signal: input.signal,
          onRunnerProgress(summary) {
            runnerEvents.push(summary);
            input.onRunnerProgress?.(summary);
          },
        });
      sandboxExecution = sandboxResult.summary;
      result = sandboxResult.result;
    } else if (runInLocalSandbox) {
      const sandboxResult = await runCodexInLocalSandbox({
        attempt: input.attempt,
        args,
        env: {
          ...input.env,
          ...executionProviderEnv,
        },
        providerKind: sandboxProvider,
        timeoutMs,
        signal: input.signal,
        onRunnerProgress(summary) {
          runnerEvents.push(summary);
          input.onRunnerProgress?.(summary);
        },
      });
      sandboxExecution = sandboxResult.summary;
      result = sandboxResult.result;
    } else {
      result = await runCodexCommandStreaming(args, {
          cwd: workspaceRoot,
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
    }
  const parsed = parseCodexExecOutput(result.stdout);
  const capturedLastMessage = runInSandbox
    ? { message: null, closeoutPacket: null }
    : parseCapturedCloseoutMessage(stageCloseoutCapture.outputLastMessagePath);
  let closeoutPacket = parseCloseoutFromCodexMessages(parsed.messages)
    ?? capturedLastMessage.closeoutPacket;
  let recoveredSessionPath: string | null = null;
  let recoveredFinalMessageChars = 0;
  let sessionRecoveryAttempts = 0;
  let sessionRecoveryStatus: string | null = null;
  let recoveredRawMessage: string | null = null;
  let sessionUsageRef: CodexSessionUsageRef | null = null;
  let domainReceiptRecoveryStatus: string | null = null;
  let domainReceiptRecoveryRef: string | null = null;
  let protocolCloseoutResumeStatus: 'not_applicable' | 'completed' | 'failed' = 'not_applicable';
  let protocolCloseoutResumeThreadId: string | null = null;
  let protocolCloseoutResumeResult: CodexCommandResult | null = null;
  let protocolCloseoutResumePacketObserved = false;
  let closeoutRejection: ReturnType<typeof validateCloseoutPacketForAttempt>['rejection'] = null;
  if (
    !runInSandbox
    && !closeoutPacket
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
      recoveredRawMessage = recovered.parsed?.finalMessage ?? null;
      sessionUsageRef = extractCodexSessionUsageRef(recovered.recovered);
    }
  }
  if (!runInSandbox && !sessionUsageRef) {
    sessionUsageRef = extractCodexSessionUsageRef(recoverCodexExecOutputFromSession(parsed.threadId));
  }
  const attemptRole = optionalString(input.attempt.attempt_role);
  if (
    !runInSandbox
    && !closeoutPacket
    && parsed.threadId
    && ['producer', 'reviewer', 'repairer', 're_reviewer'].includes(attemptRole ?? '')
    && result.timeoutReason !== 'unsupported_tool_protocol'
    && result.timeoutReason !== 'activity_cancelled'
  ) {
    const resumeCapture = createCodexCloseoutCapture();
    protocolCloseoutResumeStatus = 'failed';
    protocolCloseoutResumeThreadId = parsed.threadId;
    runnerEvents.push({ event_kind: 'protocol_closeout_resume.started', value: parsed.threadId });
    input.onRunnerProgress?.({ event_kind: 'protocol_closeout_resume.started', value: parsed.threadId });
    try {
      const resumeArgs = buildCodexExecResumeArgs(
        parsed.threadId,
        protocolCloseoutResumePrompt(input.attempt),
        {
          ...codexCloseoutCaptureExecOptions({
            codexExecOptions,
            outputLastMessagePath: resumeCapture.outputLastMessagePath,
          }),
          json: true,
          sandboxMode: 'read-only',
        },
      );
      protocolCloseoutResumeResult = await runCodexCommandStreaming(resumeArgs, {
        cwd: workspaceRoot,
        env: { ...input.env, ...providerEnv },
        timeoutMs: normalizeTimeoutMs(process.env.OPL_CODEX_PROTOCOL_CLOSEOUT_RESUME_TIMEOUT_MS, 30_000),
        noOutputTimeoutMs,
        commandNoProgressTimeoutMs,
        signal: input.signal,
        onStdoutEvent(event) {
          const summary = eventSummary(event);
          runnerEvents.push(summary);
          input.onRunnerProgress?.(summary);
        },
      });
      const resumed = parseCodexExecOutput(protocolCloseoutResumeResult.stdout);
      if (resumed.threadId && resumed.threadId !== parsed.threadId) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Protocol closeout resume must remain in the original Attempt thread.',
          {
            hard_stop_class: 'stale_or_mismatched_stage_identity',
            blocked_reason: 'protocol_closeout_resume_session_identity_mismatch',
            expected_thread_id: parsed.threadId,
            actual_thread_id: resumed.threadId,
          },
        );
      }
      const resumedCapture = parseCapturedCloseoutMessage(resumeCapture.outputLastMessagePath);
      closeoutPacket = parseCloseoutFromCodexMessages(resumed.messages) ?? resumedCapture.closeoutPacket;
      protocolCloseoutResumePacketObserved = Boolean(closeoutPacket);
    } finally {
      resumeCapture.cleanup();
    }
  }
  if (!runInSandbox && !closeoutPacket && result.timeoutReason !== 'unsupported_tool_protocol') {
    const domainReceiptRecovery = recoverDefaultExecutorDomainReceiptCloseout({
      workspaceRoot,
      stagePacketRef: stagePacketTransportRef,
      attempt: input.attempt,
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
  if (protocolCloseoutResumeStatus !== 'not_applicable') {
    protocolCloseoutResumeStatus = protocolCloseoutResumePacketObserved && closeoutPacket
      ? 'completed'
      : 'failed';
    runnerEvents.push({ event_kind: 'protocol_closeout_resume.completed', value: protocolCloseoutResumeStatus });
    input.onRunnerProgress?.({
      event_kind: 'protocol_closeout_resume.completed',
      value: protocolCloseoutResumeStatus,
    });
  }
  closeoutPacket = verifyStageQualityCloseoutArtifactIdentity({
    closeoutPacket,
    attempt: input.attempt,
    workspaceRoot,
  });
  const rawStageArtifact = persistRawStageOutput({
    attempt: input.attempt,
    content: capturedLastMessage.message ?? parsed.finalMessage ?? recoveredRawMessage,
    observedAt: input.observedAt,
  });
  const providerErrorSummary = summarizeCodexProviderErrors(result.providerErrors);
  const providerUnavailable =
    result.timeoutReason === 'provider_unavailable'
    || providerErrorSummary.count > 0;
  const providerBlockedReason = providerBlockedReasonFrom(result.providerErrors);
  const primaryBlockedReason = providerUnavailable
    ? providerBlockedReason ?? 'codex_cli_provider_unavailable'
    : result.timeoutReason === 'command_no_progress_timeout'
    ? 'codex_cli_command_execution_no_progress'
    : result.timeoutReason === 'unsupported_tool_protocol'
      ? 'codex_cli_unsupported_function_call'
      : result.timeoutReason === 'activity_cancelled'
        ? 'codex_cli_activity_cancelled'
          : null;
  if (!closeoutPacket && rawStageArtifact) {
    closeoutPacket = buildRawArtifactProgressCloseoutPacket({
      attempt: input.attempt,
      stagePacketRef: stagePacketTransportRef,
      rawArtifact: rawStageArtifact,
      normalizationFindings: [
        ...(!stagePacketRef ? ['stage_packet_ref_missing_nonblocking_declared_stage_context_used'] : []),
        ...(closeoutRejection ? [`typed_closeout_${closeoutRejection.reason}`] : []),
        'typed_closeout_not_required_raw_artifact_advanced',
      ],
    });
  } else if (!closeoutPacket && primaryBlockedReason) {
    closeoutPacket = buildProviderRuntimeCloseoutPacket({
      attempt: input.attempt,
      stagePacketRef: stagePacketTransportRef,
      blockedReason: primaryBlockedReason,
      routeImpact: {
        runner_timeout_reason: result.timeoutReason ?? null,
        pending_function_call_count: result.unsupportedFunctionCalls?.length ?? null,
        function_call_names: [...new Set((result.unsupportedFunctionCalls ?? []).map((call) => call.name))],
        ...(providerErrorSummary.count > 0
          ? {
              provider_error_count: providerErrorSummary.count,
              provider_error_status_codes: providerErrorSummary.statusCodes,
              provider_error_messages: providerErrorSummary.messages,
            }
          : {}),
      },
    });
  }
  const effectiveBlockedReason = rawStageArtifact ? null : primaryBlockedReason;
  const combinedStdout = [result.stdout, protocolCloseoutResumeResult?.stdout]
    .filter((entry): entry is string => Boolean(entry))
    .join('\n');
  const combinedStderr = [result.stderr, protocolCloseoutResumeResult?.stderr]
    .filter((entry): entry is string => Boolean(entry))
    .join('\n');
  const costSummary = codexStageRunnerCostSummaryFrom(combinedStdout, runnerMode, sessionUsageRef);
  closeoutPacket = withCodexTokenAccounting(closeoutPacket, costSummary);
  const progressCloseoutProjection = buildProgressCloseoutProjection({
    attempt: input.attempt,
    closeoutPacket,
    blockedReason: effectiveBlockedReason,
    closeoutRejection,
    rawArtifactRef: rawStageArtifact?.output_ref ?? null,
    outputLastMessageCaptureEnabled: !runInSandbox,
    sessionRecoveryStatus,
    sessionRecoveryAttempts,
    domainReceiptRecoveryStatus,
  });
  const sandboxOutputSummary = sandboxExecution
    ? {
        sandbox_execution: sandboxExecution,
        ...(sandboxExecution.execution_substrate === 'external_sandbox'
          ? { external_sandbox_execution: sandboxExecution }
          : {}),
      }
    : {};
  return {
    ...buildCodexStageRunnerReceipt({
      ...input,
      stagePacketRef,
      codexExecOptions,
      runnerMode,
      liveProcessStarted: true,
      processId,
      exitCode: result.exitCode,
      stdoutBytes: Buffer.byteLength(combinedStdout, 'utf8'),
      stderrBytes: Buffer.byteLength(combinedStderr, 'utf8'),
      runnerEvents,
      threadId: parsed.threadId,
      timeoutMs,
      noOutputTimeoutMs,
    }),
    cost_summary: costSummary,
    closeout_packet: closeoutPacket,
    process_output_summary: {
      exit_code: result.exitCode,
      final_message_chars: parsed.finalMessage.length,
      stderr_tail: result.stderr.split(/\r?\n/).filter(Boolean).slice(-5),
      ...(result.timeoutReason ? { timeout_reason: result.timeoutReason } : {}),
      no_output_timeout_ms: result.noOutputTimeoutMs ?? noOutputTimeoutMs,
      command_no_progress_timeout_ms: result.commandNoProgressTimeoutMs ?? commandNoProgressTimeoutMs,
      ...(providerErrorSummary.count > 0
        ? {
            provider_error_count: providerErrorSummary.count,
            provider_error_status_codes: providerErrorSummary.statusCodes,
            provider_error_messages: providerErrorSummary.messages,
          }
        : {}),
      ...sandboxOutputSummary,
      ...(capturedLastMessage.message
        ? { captured_last_message_chars: capturedLastMessage.message.length }
        : {}),
      ...(rawStageArtifact
        ? {
            raw_stage_artifact: {
              output_ref: rawStageArtifact.output_ref,
              metadata_ref: rawStageArtifact.metadata_ref,
              sha256: rawStageArtifact.sha256,
              size_bytes: rawStageArtifact.size_bytes,
            },
          }
        : {}),
      progress_closeout_projection: progressCloseoutProjection,
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
      ...(effectiveBlockedReason ? { blocked_reason: effectiveBlockedReason } : {}),
      ...(result.timeoutReason === 'unsupported_tool_protocol'
        ? {
            pending_function_call_count: result.unsupportedFunctionCalls?.length ?? 0,
            function_call_names: [...new Set((result.unsupportedFunctionCalls ?? []).map((call) => call.name))],
            ...(result.unsupportedFunctionCallSessionPath
              ? { unsupported_function_call_session_path: result.unsupportedFunctionCallSessionPath }
              : {}),
          }
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
      ...(protocolCloseoutResumeStatus !== 'not_applicable' && protocolCloseoutResumeThreadId
        ? {
            protocol_closeout_resume: {
              status: protocolCloseoutResumeStatus,
              same_thread: true,
              thread_id: protocolCloseoutResumeThreadId,
              creates_stage_attempt: false,
              counts_as_review: false,
              consumes_quality_budget: false,
              may_change_artifact_bytes: false,
            },
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
  } finally {
    stageCloseoutCapture.cleanup();
  }
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
    prompt: runnerPromptForExecution(input, input.attempt),
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
    codexExecOptions: codexExecOptionsFromPolicy(executorPolicyFromAttempt(input.attempt)),
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
        : workspaceRoot
          ? 'advisory_missing_stage_packet_ref'
          : 'missing_workspace_root',
      stage_packet_ref: stagePacketRef,
      workspace_root: workspaceRoot,
      binding_source: stagePacketRef ? 'stage_attempt_checkpoint_refs' : null,
      stage_may_start_from_declared_context: Boolean(workspaceRoot),
      can_claim_stage_complete: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
    ...runnerReceipt,
    expected_closeout: {
      typed_packet_required_for_progress: false,
      raw_or_free_text_artifact_accepted_for_progress: true,
      framework_derives_progress_envelope: true,
    },
    authority_boundary: {
      opl: 'activity_packet_and_receipt_transport_only',
      codex_cli: 'stage_execution_under_domain_prompt_and_skill',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}
