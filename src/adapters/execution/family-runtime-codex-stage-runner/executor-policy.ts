import type { CodexExecOptions } from '../codex.ts';
import {
  AGENT_EXECUTOR_KINDS,
  type AgentExecutorKind,
  type StageAttemptExecutorPolicy,
} from '../agent-executor.ts';
import {
  localSandboxWorkspaceRoot,
  selectCodexStageSandboxProvider,
  type CodexStageSandboxProviderKind,
} from '../local-codex-stage-sandbox.ts';
import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import {
  normalizeCodexStageRunnerMode,
  type CodexStageRunnerMode,
} from './input-prompt.ts';
import { isRecord, type JsonRecord } from './shared.ts';

export type CodexStageSandboxPolicy = {
  provider: CodexStageSandboxProviderKind;
  runInE2bSandbox: boolean;
  runInLocalSandbox: boolean;
  runInSandbox: boolean;
};

export function normalizeAgentExecutorStageMode(value?: string | null): AgentExecutorKind | null {
  const normalized = value?.trim().replace(/-/g, '_');
  if (AGENT_EXECUTOR_KINDS.includes(normalized as AgentExecutorKind)) {
    return normalized as AgentExecutorKind;
  }
  return null;
}

export function executorPolicyFromAttempt(attempt: JsonRecord): StageAttemptExecutorPolicy | null {
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

export function codexExecOptionsFromPolicy(
  policy: StageAttemptExecutorPolicy | null,
): Pick<CodexExecOptions, 'model' | 'provider' | 'reasoningEffort'> {
  return {
    model: optionalString(policy?.model) ?? undefined,
    provider: optionalString(policy?.provider) ?? undefined,
    reasoningEffort: optionalString(policy?.reasoning_effort) ?? undefined,
  };
}

export function codexCloseoutCaptureExecOptions(input: {
  codexExecOptions: Pick<CodexExecOptions, 'model' | 'provider' | 'reasoningEffort'>;
  outputLastMessagePath: string;
}): Pick<CodexExecOptions, 'model' | 'provider' | 'reasoningEffort' | 'outputLastMessagePath'> {
  return {
    ...input.codexExecOptions,
    outputLastMessagePath: input.outputLastMessagePath,
  };
}

export function executorKindFromAttemptPolicy(attempt: JsonRecord) {
  return normalizeAgentExecutorStageMode(optionalString(executorPolicyFromAttempt(attempt)?.executor_kind));
}

export function codexProjectionRunnerModeFromAttempt(attempt: JsonRecord): CodexStageRunnerMode {
  const explicitMode = normalizeCodexStageRunnerMode(process.env.OPL_CODEX_STAGE_RUNNER_MODE);
  if (process.env.OPL_CODEX_STAGE_RUNNER_MODE?.trim()) {
    return explicitMode;
  }
  const executorKind = normalizeAgentExecutorStageMode(optionalString(attempt.executor_kind))
    ?? executorKindFromAttemptPolicy(attempt);
  return executorKind === 'codex_cli' ? 'codex_cli' : explicitMode;
}

export function codexSandboxPolicyFromEnvironment(
  env: Record<string, string | undefined>,
): CodexStageSandboxPolicy {
  const provider = selectCodexStageSandboxProvider(env);
  const runInE2bSandbox = provider === 'e2b';
  const runInLocalSandbox = provider === 'local_devcontainer' || provider === 'local_docker';
  return {
    provider,
    runInE2bSandbox,
    runInLocalSandbox,
    runInSandbox: runInE2bSandbox || runInLocalSandbox,
  };
}

export function codexSandboxWorkspaceRoot(
  env: Record<string, string | undefined>,
  workspaceRoot: string,
  policy: CodexStageSandboxPolicy,
): string {
  return policy.runInE2bSandbox
    ? env.OPL_E2B_WORKSPACE_ROOT?.trim()
      || env.OPL_EXTERNAL_SANDBOX_WORKSPACE_ROOT?.trim()
      || '/home/user/opl-stage-workspace'
    : policy.runInLocalSandbox
      ? localSandboxWorkspaceRoot(env)
      : workspaceRoot;
}
