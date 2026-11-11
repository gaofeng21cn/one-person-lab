import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  buildCodexExecArgs,
  buildCodexExecResumeArgs,
  parseCodexExecOutput,
  recoverCodexExecOutputFromSession,
  runCodexCommandStreaming,
  type CodexCommandResult,
} from './codex.ts';
import {
  type AgentExecutionReceipt,
} from './agent-executor.ts';
import type {
  AgentExecutorRequestCompositionFactory,
  AgentExecutorService,
} from './composition-factory-ports.ts';
import {
  DEFAULT_CODEX_PROTOCOL_CLOSEOUT_RESUME_TIMEOUT_MS,
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
  type TypedStageCloseoutPacket,
  validateCloseoutPacketForAttempt,
} from './family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
import { recoverDefaultExecutorDomainReceiptCloseout } from './family-runtime-codex-stage-runner-parts/default-executor-recovery.ts';
import { hydrateContentRefTransport } from './family-runtime-codex-stage-runner-parts/content-ref-transport-hydration.ts';
import {
  attemptProducedWorkspaceArtifact,
  buildWorkspaceArtifactCloseoutPacket,
} from './family-runtime-codex-stage-runner-parts/workspace-artifact-closeout.ts';
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
import {
  codexCloseoutCaptureExecOptions,
  codexExecOptionsFromPolicy,
  codexProjectionRunnerModeFromAttempt,
  codexSandboxPolicyFromEnvironment,
  codexSandboxWorkspaceRoot,
  executorKindFromAttemptPolicy,
  executorPolicyFromAttempt,
  normalizeAgentExecutorStageMode,
} from './family-runtime-codex-stage-runner-parts/executor-policy.ts';
import {
  buildProviderRuntimeCloseoutPacket,
  closeoutExecutionScopeFromAttempt,
  providerBlockedReasonFrom,
  summarizeCodexProviderErrors,
} from './family-runtime-codex-stage-runner-parts/provider-result.ts';
import { withCodexTokenAccounting } from './family-runtime-codex-stage-runner-parts/token-accounting.ts';
export type { CodexStageRunnerInput } from './family-runtime-codex-stage-runner-parts/input-prompt.ts';
import { verifyStageQualityCloseoutArtifactIdentity } from './family-runtime-codex-stage-runner-parts/artifact-identity-verification.ts';
import {
  parseCloseoutFromCodexMessages,
  parseTerminalJsonRecordFromCodexMessages,
  recoverCloseoutFromCodexSessionWithRetry,
  normalizeCloseoutErrorMessage,
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
  sandboxAttemptForCodex,
  type E2bCodexStageExecutionSummary,
} from './e2b-codex-stage-execution.ts';
import { resolveRuntimeEnvironmentProvider } from './runtime-environment-provider.ts';
import {
  runCodexInLocalSandbox,
  type LocalCodexStageSandboxExecutionSummary,
} from './local-codex-stage-sandbox.ts';
import {
  isRecord,
  normalizeTimeoutMs,
  type JsonRecord,
} from './family-runtime-codex-stage-runner-parts/shared.ts';
import {
  hydrateReferencedStageAttemptCloseout,
  resolveProtocolCloseoutResumePacket,
} from './family-runtime-codex-stage-runner-parts/referenced-closeout-hydration.ts';
import { stringValue as optionalString } from '../../kernel/json-record.ts';
import {
  hostAttemptSkillRuntime,
  packageSkillPromptPrefix,
  sandboxAttemptSkillRuntime,
} from './family-runtime-attempt-skill-projection.ts';

export {
  normalizeTypedStageCloseoutPacket,
  type TypedStageCloseoutPacket,
} from './family-runtime-codex-stage-runner-parts/closeout-normalization.ts';

export {
  createCodexCloseoutCaptureForTest,
} from './family-runtime-codex-stage-runner-parts/stage-closeout-capture.ts';

export function buildRawArtifactProgressCloseoutPacket(input: {
  attempt: JsonRecord;
  stagePacketRef: string;
  rawArtifact: {
    output_ref: string;
    metadata_ref: string;
    sha256: string;
    size_bytes: number;
  };
  normalizationFindings: string[];
}) {
  const stageAttemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const idempotencyKey = optionalString(input.attempt.idempotency_key);
  const domainId = optionalString(input.attempt.domain_id);
  return normalizeTypedStageCloseoutPacket({
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: stageAttemptId,
    ...(optionalString(input.attempt.stage_run_id)
      ? { stage_run_id: optionalString(input.attempt.stage_run_id) }
      : {}),
    ...closeoutExecutionScopeFromAttempt(input.attempt),
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

async function runCodexStageRunner(input: CodexStageRunnerInput): Promise<CodexStageRunnerReceipt> {
  const runnerMode = normalizeCodexStageRunnerMode(input.runnerMode);
  const stagePacketRef = resolvedStagePacketRef(input);
  const workspaceRoot = workspaceRootFromAttempt(input.attempt);
  const attemptStartedAtMs = Date.now();
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
  const stageSandboxEnv = { ...process.env, ...input.env };
  const sandboxPolicy = codexSandboxPolicyFromEnvironment(stageSandboxEnv);
  const sandboxProvider = sandboxPolicy.provider;
  const runInE2bSandbox = sandboxPolicy.runInE2bSandbox;
  const runInLocalSandbox = sandboxPolicy.runInLocalSandbox;
  const runInSandbox = sandboxPolicy.runInSandbox;
  const providerEnv = codexStageAttemptEnv({
    attempt: input.attempt,
    stagePacketRef: stagePacketTransportRef,
    workspaceRoot,
    env: stageSandboxEnv,
    domainPython: !runInSandbox,
  });
  const codexExecOptions = codexExecOptionsFromPolicy(executorPolicyFromAttempt(input.attempt));
  let sandboxExecution: E2bCodexStageExecutionSummary | LocalCodexStageSandboxExecutionSummary | null = null;
  let runtimeEnvironmentProvider: ReturnType<typeof resolveRuntimeEnvironmentProvider> = null;
  try {
    runtimeEnvironmentProvider = runInE2bSandbox
      ? resolveRuntimeEnvironmentProvider(stageSandboxEnv)
      : null;
    if (runInE2bSandbox && !runtimeEnvironmentProvider) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'E2B sandbox selection did not resolve an E2B runtime environment provider.',
        {
          blocked_reason: 'runtime_environment_provider_missing',
          selected_provider: sandboxProvider,
          fallback_allowed: false,
        },
      );
    }
    const sandboxWorkspaceRoot = codexSandboxWorkspaceRoot(stageSandboxEnv, workspaceRoot, sandboxPolicy);
    const executionAttempt = runInSandbox
      ? sandboxAttemptForCodex({
          attempt: input.attempt,
          sandboxWorkspaceRoot,
          workspaceTransport: runInLocalSandbox ? 'local_sandbox_git_clone' : 'external_sandbox_git_clone',
        })
      : input.attempt;
    const executionProviderEnv = codexStageAttemptEnv({
      attempt: input.attempt,
      stagePacketRef: stagePacketTransportRef,
      workspaceRoot: runInSandbox ? sandboxWorkspaceRoot : workspaceRoot,
      env: stageSandboxEnv,
      domainPython: !runInSandbox,
    });
    const hostSkillRuntime = runInSandbox ? null : hostAttemptSkillRuntime(input.attempt);
    const sandboxSkillRuntime = runInSandbox
      ? sandboxAttemptSkillRuntime(input.attempt, sandboxWorkspaceRoot)
      : null;
    const skillRuntime = hostSkillRuntime ?? sandboxSkillRuntime;
    const stagePrompt = runnerPromptForExecution({ ...input, stagePacketRef }, executionAttempt);
    const skillPromptPrefix = packageSkillPromptPrefix(skillRuntime?.projection ?? null);
    const args = buildCodexExecArgs(
      skillPromptPrefix ? `${skillPromptPrefix}\n\n${stagePrompt}` : stagePrompt,
      {
      cwd: runInSandbox ? sandboxWorkspaceRoot : workspaceRoot,
      json: true,
      packageSkillBindings: skillRuntime?.packageSkillBindings,
      shellHome: hostSkillRuntime?.shellHome,
      ...(runInSandbox
        ? codexExecOptions
        : codexCloseoutCaptureExecOptions({
            codexExecOptions,
            outputLastMessagePath: stageCloseoutCapture.outputLastMessagePath,
          })),
      },
    );
    let result: CodexCommandResult;
    if (runInE2bSandbox) {
      const sandboxResult = await runtimeEnvironmentProvider!.execute({
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
        providerKind: sandboxProvider as 'local_devcontainer' | 'local_docker',
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
            ...hostSkillRuntime?.env,
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
  let initialCloseoutCandidate = parseTerminalJsonRecordFromCodexMessages(parsed.messages)
    ?? (capturedLastMessage.message
      ? parseTerminalJsonRecordFromCodexMessages([capturedLastMessage.message])
      : null);
  let closeoutPacket = parseCloseoutFromCodexMessages(parsed.messages)
    ?? capturedLastMessage.closeoutPacket;
  let recoveredSessionPath: string | null = null;
  let recoveredFinalMessageChars = 0;
  let sessionRecoveryAttempts = 0;
  let sessionRecoveryStatus: string | null = null;
  let sessionRecoveryLastNormalizeError: string | null = null;
  let recoveredRawMessage: string | null = null;
  let sessionUsageRef: CodexSessionUsageRef | null = null;
  let domainReceiptRecoveryStatus: string | null = null;
  let domainReceiptRecoveryRef: string | null = null;
  let protocolCloseoutResumeStatus: 'not_applicable' | 'completed' | 'failed' = 'not_applicable';
  let protocolCloseoutResumeThreadId: string | null = null;
  let protocolCloseoutResumeTimeoutMs: number | null = null;
  let protocolCloseoutResumeResult: CodexCommandResult | null = null;
  let protocolCloseoutResumePacketObserved = false;
  let protocolCloseoutResumeLastNormalizeError: string | null = null;
  let protocolCloseoutResumeInitialRouteImpactPreserved = false;
  let protocolCloseoutReferenceHydrationStatus: 'not_applicable' | 'hydrated' = 'not_applicable';
  let protocolCloseoutReferenceObservation: {
    ref: string;
    sha256: string;
    size_bytes: number;
  } | null = null;
  const protocolCloseoutResumeViolationKinds = new Set<'command_execution' | 'unsupported_function_call'>();
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
    sessionRecoveryLastNormalizeError = recovered.lastNormalizeError ?? null;
    closeoutPacket = recovered.closeoutPacket;
    if (recovered.recovered) {
      recoveredSessionPath = recovered.recovered.sessionPath;
      recoveredFinalMessageChars = recovered.parsed?.finalMessage.length ?? 0;
      recoveredRawMessage = recovered.parsed?.finalMessage ?? null;
      initialCloseoutCandidate ??= recoveredRawMessage
        ? parseTerminalJsonRecordFromCodexMessages([recoveredRawMessage])
        : null;
      sessionUsageRef = extractCodexSessionUsageRef(recovered.recovered);
    }
  }
  if (!runInSandbox && !sessionUsageRef) {
    sessionUsageRef = extractCodexSessionUsageRef(recoverCodexExecOutputFromSession(parsed.threadId));
  }
  const rawStageArtifact = persistRawStageOutput({
    attempt: input.attempt,
    content: capturedLastMessage.message ?? parsed.finalMessage ?? recoveredRawMessage,
    observedAt: input.observedAt,
  });
  const attemptRole = optionalString(input.attempt.attempt_role);
  // A producer that wrote nothing has nothing to close out. Raising the resume anyway
  // makes the model invent a packet: the 2026-11-09 mission-intake resume named
  // artifacts that never existed, which the identity guards then killed the run over.
  const producerLike = attemptRole === 'producer' || attemptRole === 'repairer';
  const producedArtifact = attemptProducedWorkspaceArtifact({
    workspaceRoot,
    producedAfterMs: attemptStartedAtMs,
  });
  const producedAnyMessage = Boolean(parsed.finalMessage || capturedLastMessage.message);
  if (
    !runInSandbox
    && !closeoutPacket
    && parsed.threadId
    && ['producer', 'reviewer', 'repairer', 're_reviewer'].includes(attemptRole ?? '')
    && result.timeoutReason !== 'unsupported_tool_protocol'
    && result.timeoutReason !== 'activity_cancelled'
    && !(producerLike && !producedArtifact && !producedAnyMessage)
    // The provider session was killed by the budget: this Attempt's output is the
    // workspace, and resuming a killed session mostly produces invented packets.
    && !(producerLike && producedArtifact && result.timeoutReason === 'total_timeout')
  ) {
    const resumeCapture = createCodexCloseoutCapture();
    protocolCloseoutResumeStatus = 'failed';
    protocolCloseoutResumeThreadId = parsed.threadId;
    runnerEvents.push({ event_kind: 'protocol_closeout_resume.started', value: parsed.threadId });
    input.onRunnerProgress?.({ event_kind: 'protocol_closeout_resume.started', value: parsed.threadId });
    try {
      protocolCloseoutResumeTimeoutMs = normalizeTimeoutMs(
        process.env.OPL_CODEX_PROTOCOL_CLOSEOUT_RESUME_TIMEOUT_MS,
        DEFAULT_CODEX_PROTOCOL_CLOSEOUT_RESUME_TIMEOUT_MS,
      );
      const resumeArgs = buildCodexExecResumeArgs(
        parsed.threadId,
        protocolCloseoutResumePrompt(input.attempt,
          attemptRole === 'reviewer' || attemptRole === 're_reviewer' ? rawStageArtifact : null),
        {
          ...codexCloseoutCaptureExecOptions({
            codexExecOptions,
            outputLastMessagePath: resumeCapture.outputLastMessagePath,
          }),
          json: true,
          sandboxMode: 'read-only',
          reasoningEffort: 'low',
          packageSkillBindings: hostSkillRuntime?.packageSkillBindings,
          shellHome: hostSkillRuntime?.shellHome,
        },
      );
      protocolCloseoutResumeResult = await runCodexCommandStreaming(resumeArgs, {
        cwd: workspaceRoot,
        env: { ...input.env, ...providerEnv, ...hostSkillRuntime?.env },
        timeoutMs: protocolCloseoutResumeTimeoutMs,
        noOutputTimeoutMs,
        commandNoProgressTimeoutMs,
        signal: input.signal,
        onStdoutEvent(event) {
          const summary = eventSummary(event);
          runnerEvents.push(summary);
          input.onRunnerProgress?.(summary);
          if (event.type === 'command_execution' || event.type === 'unsupported_function_call') {
            protocolCloseoutResumeViolationKinds.add(event.type);
          }
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
      const resumedCandidate = parseTerminalJsonRecordFromCodexMessages(resumed.messages)
        ?? (resumedCapture.message
          ? parseTerminalJsonRecordFromCodexMessages([resumedCapture.message])
          : null);
      const resumedCloseout = parseCloseoutFromCodexMessages(resumed.messages, (error) => {
        protocolCloseoutResumeLastNormalizeError = normalizeCloseoutErrorMessage(error);
      }) ?? resumedCapture.closeoutPacket;
      const resolvedCloseout = resolveProtocolCloseoutResumePacket({
        initialCandidate: initialCloseoutCandidate,
        resumedCloseout,
        resumedCandidate,
        attempt: input.attempt,
        workspaceRoot,
        protocolViolation: protocolCloseoutResumeViolationKinds.size > 0,
      });
      protocolCloseoutReferenceHydrationStatus = resolvedCloseout.hydrationStatus;
      protocolCloseoutReferenceObservation = resolvedCloseout.observation;
      protocolCloseoutResumePacketObserved = Boolean(resumedCloseout);
      protocolCloseoutResumeInitialRouteImpactPreserved = protocolCloseoutResumeViolationKinds.size === 0
        && resolvedCloseout.initialRouteImpactPreserved;
      closeoutPacket = protocolCloseoutResumeViolationKinds.size === 0
        ? resolvedCloseout.closeoutPacket
        : null;
    } finally {
      resumeCapture.cleanup();
    }
  }
  if (
    !runInSandbox
    && !closeoutPacket
    && protocolCloseoutResumeViolationKinds.size === 0
    && result.timeoutReason !== 'unsupported_tool_protocol'
  ) {
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
  // A primary Attempt may emit its final packet as a self-referenced form: the
  // inline message omits route_impact and names the complete workspace-bound
  // closeout it already wrote. Hydration existed only on the protocol-resume
  // branch, so a directly emitted self-referenced closeout lost route_impact.
  // Hydrate it from that exact verified file so the StageRun controller can
  // schedule independent Review. Fail closed on conflict by keeping the
  // un-hydrated packet, which lets the existing review-outcome guard surface
  // the blocked reason instead of swallowing it.
  if (
    closeoutPacket
    && protocolCloseoutReferenceHydrationStatus === 'not_applicable'
    && !isRecord(closeoutPacket.route_impact ?? undefined)
  ) {
    try {
      const hydrated = hydrateReferencedStageAttemptCloseout({
        resumedCloseout: closeoutPacket,
        resumedCandidate: initialCloseoutCandidate,
        attempt: input.attempt,
        workspaceRoot,
      });
      if (hydrated.closeoutPacket) {
        closeoutPacket = hydrated.closeoutPacket;
        if (hydrated.status === 'hydrated') {
          protocolCloseoutReferenceHydrationStatus = hydrated.status;
          protocolCloseoutReferenceObservation = hydrated.observation;
          protocolCloseoutResumeInitialRouteImpactPreserved = true;
        }
      }
    } catch {
      // Keep the un-hydrated packet so the review-outcome guard surfaces the
      // transport-contract failure instead of discarding it here.
    }
  }
  if (protocolCloseoutResumeStatus !== 'not_applicable') {
    protocolCloseoutResumeStatus = protocolCloseoutResumeViolationKinds.size === 0
      && protocolCloseoutResumePacketObserved
      && closeoutPacket
      ? 'completed'
      : 'failed';
    runnerEvents.push({ event_kind: 'protocol_closeout_resume.completed', value: protocolCloseoutResumeStatus });
    input.onRunnerProgress?.({
      event_kind: 'protocol_closeout_resume.completed',
      value: protocolCloseoutResumeStatus,
    });
  }
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
        : result.exitCode !== 0
          ? 'codex_cli_executor_unavailable'
          : null;
  const reviewRole = input.attempt.attempt_role === 'reviewer' || input.attempt.attempt_role === 're_reviewer';
  const reviewEnvelope = closeoutPacket?.route_impact?.stage_quality_cycle;
  const reviewProtocolFailure = reviewRole
    && (!isRecord(reviewEnvelope) || typeof reviewEnvelope.outcome !== 'string')
    ? primaryBlockedReason ?? 'stage_quality_review_outcome_missing'
    : null;
  if (reviewProtocolFailure) {
    closeoutPacket = buildProviderRuntimeCloseoutPacket({
      attempt: input.attempt,
      stagePacketRef: stagePacketTransportRef,
      blockedReason: reviewProtocolFailure,
      routeImpact: {
        next_stage_may_start: false,
        runner_exit_code: result.exitCode,
        runner_timeout_reason: result.timeoutReason ?? null,
        ...(rawStageArtifact ? { diagnostic_artifact_ref: rawStageArtifact.output_ref } : {}),
        ...(providerErrorSummary.count > 0
          ? {
              provider_error_count: providerErrorSummary.count,
              provider_error_status_codes: providerErrorSummary.statusCodes,
              provider_error_messages: providerErrorSummary.messages,
            }
          : {}),
      },
    });
  } else if (!closeoutPacket && rawStageArtifact) {
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
  } else if (!closeoutPacket) {
    // Producers routinely finish the semantic work and still end the turn with no
    // typed packet. Their Stage artifact is on disk; derive progress from it instead
    // of failing the Attempt on a transport omission.
    closeoutPacket = buildWorkspaceArtifactCloseoutPacket({
      attempt: input.attempt,
      stagePacketRef: stagePacketTransportRef ?? '',
      workspaceRoot,
      producedAfterMs: attemptStartedAtMs,
    });
  }
  if (!closeoutPacket && primaryBlockedReason) {
    closeoutPacket = buildProviderRuntimeCloseoutPacket({
      attempt: input.attempt,
      stagePacketRef: stagePacketTransportRef,
      blockedReason: primaryBlockedReason,
      routeImpact: {
        runner_exit_code: result.exitCode,
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
  // A rejected artifact identity is a contract outcome of this Attempt, not a transport
  // failure: surface it as a blocked closeout so the StageRun controller records a hard
  // stop instead of retrying the Activity and re-running the provider session.
  let identityBlockedReason: string | null = null;
  try {
    closeoutPacket = hydrateContentRefTransport({
      closeoutPacket,
      attempt: input.attempt,
      workspaceRoot,
    }) as typeof closeoutPacket;
  } catch {
    // Hydration only appends hash-verified files, so a failure here is a framework bug.
    // Stop this Attempt cleanly rather than leave a half-written Attempt row behind.
    closeoutPacket = buildProviderRuntimeCloseoutPacket({
      attempt: input.attempt,
      stagePacketRef: stagePacketTransportRef,
      blockedReason: 'codex_cli_content_ref_transport_failed',
      routeImpact: {
        next_stage_may_start: false,
        runner_exit_code: result.exitCode,
      },
    });
  }
  const verifyPacket = (packet: TypedStageCloseoutPacket | null) => verifyStageQualityCloseoutArtifactIdentity({
    closeoutPacket: packet,
    attempt: input.attempt,
    workspaceRoot,
  });
  try {
    closeoutPacket = verifyPacket(closeoutPacket);
  } catch (error) {
    const details = isRecord(error) && isRecord((error as { details?: unknown }).details)
      ? (error as { details: JsonRecord }).details
      : {};
    const rejectionReason = optionalString(details.blocked_reason) ?? 'closeout_artifact_identity_unverified';
    // The rejected packet is usually a resume that named another Attempt's artifact.
    // This Attempt's own Stage output is on disk, so try to verify and advance on that
    // instead of stopping the run over a transport error.
    let recovered = false;
    const artifactCloseout = buildWorkspaceArtifactCloseoutPacket({
      attempt: input.attempt,
      stagePacketRef: stagePacketTransportRef ?? '',
      workspaceRoot,
      producedAfterMs: attemptStartedAtMs,
    });
    if (artifactCloseout) {
      try {
        closeoutPacket = verifyPacket(artifactCloseout);
        recovered = true;
      } catch {
        recovered = false;
      }
    }
    if (!recovered) {
      identityBlockedReason = rejectionReason;
      closeoutPacket = buildProviderRuntimeCloseoutPacket({
        attempt: input.attempt,
        stagePacketRef: stagePacketTransportRef,
        blockedReason: identityBlockedReason,
        routeImpact: {
          next_stage_may_start: false,
          runner_exit_code: result.exitCode,
          artifact_ref: optionalString(details.artifact_ref) ?? null,
          missing_path: optionalString(details.missing_path) ?? null,
        },
      });
    }
  }
  // A protocol closeout resume can recover a complete typed closeout after the primary
  // process was killed by the total budget. The recovered packet is the Attempt's real
  // result: the timeout stays visible in route_impact, but it must not fail the Attempt
  // that already did the work.
  const recoveredCloseoutAfterTimeout = protocolCloseoutResumeStatus === 'completed'
    && protocolCloseoutResumePacketObserved;
  // Any closeout that carries an advancing route is the Attempt's result, whatever
  // produced it: the provider transcript, a protocol resume, or the Stage artifacts the
  // Attempt wrote. A transport-level failure stays visible in route_impact instead of
  // overriding work that is already complete on disk.
  const closeoutAdvancesStage = Boolean(
    closeoutPacket
    && isRecord(closeoutPacket.route_impact)
    && closeoutPacket.route_impact.next_stage_may_start === true,
  );
  const effectiveBlockedReason = reviewProtocolFailure
    ?? identityBlockedReason
    ?? (rawStageArtifact || recoveredCloseoutAfterTimeout || closeoutAdvancesStage
      ? null
      : primaryBlockedReason);
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
            ...(sessionRecoveryLastNormalizeError
              ? { session_recovery_last_normalize_error: sessionRecoveryLastNormalizeError }
              : {}),
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
              exit_code: protocolCloseoutResumeResult?.exitCode ?? null,
              timeout_reason: protocolCloseoutResumeResult?.timeoutReason ?? null,
              packet_observed: protocolCloseoutResumePacketObserved,
              closeout_rejection_reason: closeoutRejection?.reason ?? null,
              ...(protocolCloseoutResumeLastNormalizeError
                ? { resume_last_closeout_normalize_error: protocolCloseoutResumeLastNormalizeError }
                : {}),
              same_thread: true,
              thread_id: protocolCloseoutResumeThreadId,
              timeout_ms: protocolCloseoutResumeTimeoutMs
                ?? DEFAULT_CODEX_PROTOCOL_CLOSEOUT_RESUME_TIMEOUT_MS,
              creates_stage_attempt: false,
              counts_as_review: false,
              consumes_quality_budget: false,
              may_change_artifact_bytes: protocolCloseoutResumeViolationKinds.size > 0,
              initial_route_impact_candidate_observed: isRecord(initialCloseoutCandidate?.route_impact),
              initial_route_impact_preserved: protocolCloseoutResumeInitialRouteImpactPreserved,
              referenced_closeout_hydration_status: protocolCloseoutReferenceHydrationStatus,
              ...(protocolCloseoutReferenceObservation
                ? { referenced_closeout_observation: protocolCloseoutReferenceObservation }
                : {}),
              ...(protocolCloseoutResumeViolationKinds.size > 0
                ? {
                    protocol_violation: 'tool_or_command_event_observed',
                    tool_event_kinds: [...protocolCloseoutResumeViolationKinds],
                  }
                : {}),
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
            ...(closeoutRejection.scope_digest
              ? { rejected_closeout_scope_digest: closeoutRejection.scope_digest }
              : {}),
          }
        : {}),
    },
  };
  } finally {
    stageCloseoutCapture.cleanup();
  }
}

export async function runAgentStageRunner(
  input: CodexStageRunnerInput,
  options: {
    agentExecutor?: AgentExecutorService;
    createAgentExecutorRequest?: AgentExecutorRequestCompositionFactory;
  } = {},
) {
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
  const ownedComposition = options.agentExecutor
    ? null
    : await options.createAgentExecutorRequest?.();
  if (!options.agentExecutor && !ownedComposition) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'A non-Codex Stage runner requires a Host-provided agent executor request composition.',
      { failure_code: 'host_agent_executor_request_factory_missing' },
    );
  }
  let receipt: AgentExecutionReceipt;
  try {
    receipt = await (options.agentExecutor ?? ownedComposition!.executor).execute({
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
  } finally {
    await ownedComposition?.dispose();
  }
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
