import { spawn } from 'node:child_process';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  createCodexExecEventParserState,
  parseCodexExecEventFromLine,
} from './codex-exec-events.ts';
import type { CodexCommandResult } from './codex.ts';
import { stringValue as optionalString } from '../../kernel/json-record.ts';
import { isRecord, normalizeTimeoutMs, type JsonRecord } from './family-runtime-codex-stage-runner-parts/shared.ts';
import type { RunnerEventSummary } from './family-runtime-codex-stage-runner-parts/input-prompt.ts';
import { sandboxAttemptSkillRuntime } from './family-runtime-attempt-skill-projection.ts';

type LocalSandboxProviderKind = 'local_devcontainer' | 'local_docker';

type LocalSandboxCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
};

type LocalSandboxCommandRunner = (args: string[], opts?: {
  timeoutMs?: number;
  signal?: AbortSignal;
}) => Promise<LocalSandboxCommandResult>;

export type CodexStageSandboxProviderKind = LocalSandboxProviderKind | 'e2b' | 'host';

export type LocalCodexStageSandboxExecutionSummary = {
  execution_substrate: 'local_sandbox';
  provider_kind: LocalSandboxProviderKind;
  image: string;
  template: string | null;
  container_name: string;
  sandbox_workspace_root: string;
  workspace_transport: {
    transport_kind: 'git_clone';
    repo_url: string;
    checkout_ref: string | null;
    clone_exit_code: number;
    checkout_exit_code: number | null;
  };
  command_exit_code: number;
  jsonl_stdout_bytes: number;
  stderr_tail: string[];
  diff_refs: {
    changed_file_refs: string[];
    diff_stat: string[];
  };
  docker_cli_called: true;
  external_api_called: false;
  credential_material_logged: false;
  host_workspace_mutated: false;
  forwarded_env_keys: string[];
};

export type LocalCodexStageSandboxExecutionResult = {
  result: CodexCommandResult;
  summary: LocalCodexStageSandboxExecutionSummary;
};

let commandRunnerForTest: LocalSandboxCommandRunner | null = null;

export function setLocalSandboxCommandRunnerForTest(runner: LocalSandboxCommandRunner | null) {
  commandRunnerForTest = runner;
}

function normalizeProvider(value?: string | null): CodexStageSandboxProviderKind | null {
  const normalized = value?.trim().toLowerCase().replace(/-/g, '_');
  if (!normalized) {
    return null;
  }
  if (normalized === 'e2b') {
    return 'e2b';
  }
  if (normalized === 'host' || normalized === 'local_host' || normalized === 'none') {
    return 'host';
  }
  if (normalized === 'docker' || normalized === 'local_docker') {
    return 'local_docker';
  }
  if (normalized === 'devcontainer' || normalized === 'dev_container' || normalized === 'local_devcontainer') {
    return 'local_devcontainer';
  }
  return null;
}

export function selectCodexStageSandboxProvider(
  env: Record<string, string | undefined> = process.env,
): CodexStageSandboxProviderKind {
  const explicit = normalizeProvider(env.OPL_CODEX_STAGE_SANDBOX_PROVIDER);
  if (explicit) {
    return explicit;
  }
  if (
    env.OPL_FAMILY_RUNTIME_PROVIDER?.trim().toLowerCase() === 'external_sandbox'
    && env.OPL_EXTERNAL_SANDBOX_SUBSTRATE?.trim().toLowerCase() === 'e2b'
  ) {
    return 'e2b';
  }
  return 'host';
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function commandFromArgs(args: string[]) {
  return ['codex', ...args].map(shellQuote).join(' ');
}

function workspaceLocator(attempt: JsonRecord) {
  return isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
}

function firstString(locator: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = optionalString(locator[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function workspaceTransportFromAttempt(attempt: JsonRecord) {
  const locator = workspaceLocator(attempt);
  const repoUrl = firstString(locator, [
    'git_remote_url',
    'repo_url',
    'repository_url',
    'remote_url',
    'source_repo_url',
    'target_repo_url',
  ]);
  const checkoutRef = firstString(locator, [
    'git_ref',
    'repo_ref',
    'checkout_ref',
    'target_ref',
    'remote_ref',
    'commit_sha',
    'source_sha',
    'revision',
  ]);
  return { repoUrl, checkoutRef };
}

export function localSandboxWorkspaceRoot(env: Record<string, string | undefined>) {
  return env.OPL_LOCAL_SANDBOX_WORKSPACE_ROOT?.trim()
    || env.OPL_DEVCONTAINER_WORKSPACE_ROOT?.trim()
    || '/workspace/opl-stage-workspace';
}

function localSandboxImage(env: Record<string, string | undefined>) {
  return env.OPL_LOCAL_SANDBOX_IMAGE?.trim()
    || env.OPL_DEVCONTAINER_IMAGE?.trim()
    || env.OPL_DOCKER_SANDBOX_IMAGE?.trim()
    || null;
}

function localSandboxTemplate(env: Record<string, string | undefined>) {
  return env.OPL_DEVCONTAINER_TEMPLATE?.trim()
    || env.OPL_LOCAL_SANDBOX_TEMPLATE?.trim()
    || null;
}

function forwardedEnv(env: Record<string, string | undefined>, base: Record<string, string | undefined>) {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (typeof value === 'string' && key.startsWith('OPL_')) {
      result[key] = value;
    }
  }
  if (env.OPL_CODEX_BIN?.trim()) {
    result.OPL_CODEX_BIN = env.OPL_CODEX_BIN;
  }
  return result;
}

function forwardedEnvArgs(env: Record<string, string>) {
  return Object.entries(env)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => ['--env', `${key}=${value}`]);
}

function defaultCommandRunner(args: string[], opts: {
  timeoutMs?: number;
  signal?: AbortSignal;
} = {}) {
  return new Promise<LocalSandboxCommandResult>((resolve) => {
    const child = spawn('docker', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let completed = false;
    let timeout: NodeJS.Timeout | null = null;
    const finish = (result: LocalSandboxCommandResult) => {
      if (completed) {
        return;
      }
      completed = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      opts.signal?.removeEventListener('abort', abort);
      resolve(result);
    };
    const abort = () => {
      child.kill('SIGTERM');
      finish({ exitCode: 130, stdout, stderr: `${stderr}Docker command cancelled.\n`, error: 'activity_cancelled' });
    };
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      finish({ exitCode: 127, stdout, stderr, error: error.message });
    });
    child.on('close', (code) => {
      finish({ exitCode: code ?? 1, stdout, stderr });
    });
    if (opts.signal?.aborted) {
      abort();
    } else {
      opts.signal?.addEventListener('abort', abort, { once: true });
    }
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timeout = setTimeout(() => {
        child.kill('SIGTERM');
        finish({ exitCode: 124, stdout, stderr: `${stderr}Docker command timed out.\n`, error: 'total_timeout' });
      }, opts.timeoutMs);
    }
  });
}

async function runDocker(args: string[], opts?: {
  timeoutMs?: number;
  signal?: AbortSignal;
}) {
  return await (commandRunnerForTest ?? defaultCommandRunner)(args, opts);
}

function safeProviderErrorKind(error?: string) {
  if (!error) return null;
  if (error === 'activity_cancelled' || error === 'total_timeout') return error;
  return 'provider_error';
}

function failLocalSandboxPreparation(input: {
  providerKind: LocalSandboxProviderKind;
  phase: string;
  failureCode: string;
  result?: LocalSandboxCommandResult | null;
  providerThrew?: boolean;
  generationId?: string;
}): never {
  throw new FrameworkContractError(
    'launcher_failed',
    `Local Codex sandbox preparation failed during ${input.phase}; Codex was not executed.`,
    {
      failure_code: input.failureCode,
      sandbox_phase: input.phase,
      provider_kind: input.providerKind,
      exit_code: input.result?.exitCode ?? null,
      provider_error_kind: input.providerThrew
        ? 'provider_error'
        : safeProviderErrorKind(input.result?.error),
      codex_executed: false,
      credential_material_logged: false,
      stderr_logged: false,
      ...(input.generationId ? { generation_id: input.generationId } : {}),
    },
  );
}

async function runRequiredDockerPreparation(input: {
  args: string[];
  opts: {
    timeoutMs?: number;
    signal?: AbortSignal;
  };
  providerKind: LocalSandboxProviderKind;
  phase: string;
  failureCode: string;
  generationId?: string;
}) {
  let result: LocalSandboxCommandResult;
  try {
    result = await runDocker(input.args, input.opts);
  } catch {
    failLocalSandboxPreparation({
      ...input,
      result: null,
      providerThrew: true,
    });
  }
  if (result.exitCode !== 0 || result.error) {
    failLocalSandboxPreparation({ ...input, result });
  }
  return result;
}

function parseStdoutEvents(stdout: string, onRunnerProgress?: (event: RunnerEventSummary) => void) {
  if (!onRunnerProgress) {
    return;
  }
  const state = createCodexExecEventParserState();
  for (const line of stdout.split(/\r?\n/)) {
    const event = parseCodexExecEventFromLine(line, state);
    if (!event) {
      continue;
    }
    onRunnerProgress({
      event_kind: event.type,
      value: 'messageId' in event
        ? event.messageId
        : 'threadId' in event
          ? event.threadId
          : 'toolCallId' in event
            ? event.toolCallId
            : null,
    });
  }
}

function timeoutReasonFromResult(result: LocalSandboxCommandResult): CodexCommandResult['timeoutReason'] | undefined {
  if (!result.error) {
    return undefined;
  }
  return result.error === 'activity_cancelled' ? 'activity_cancelled' : 'provider_unavailable';
}

function changedRefsFromGitStatus(stdout: string) {
  return stdout.split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const ref = line.slice(3).trim();
      const renameSeparator = ' -> ';
      return ref.includes(renameSeparator) ? ref.slice(ref.indexOf(renameSeparator) + renameSeparator.length) : ref;
    })
    .filter(Boolean);
}

function uniqueRefs(refs: string[]) {
  return [...new Set(refs)];
}

function providerUnavailableResult(
  providerKind: LocalSandboxProviderKind,
  reason: string,
  message: string,
  env: Record<string, string | undefined> = {},
): LocalCodexStageSandboxExecutionResult {
  return {
    result: {
      exitCode: 1,
      stdout: '',
      stderr: `${message}\n`,
      timeoutReason: 'provider_unavailable',
      providerErrors: [{ message: reason, statusCode: null }],
    },
    summary: {
      execution_substrate: 'local_sandbox',
      provider_kind: providerKind,
      image: localSandboxImage(env) ?? 'unconfigured',
      template: localSandboxTemplate(env),
      container_name: 'not-created',
      sandbox_workspace_root: localSandboxWorkspaceRoot(env),
      workspace_transport: {
        transport_kind: 'git_clone',
        repo_url: 'unavailable',
        checkout_ref: null,
        clone_exit_code: 1,
        checkout_exit_code: null,
      },
      command_exit_code: 1,
      jsonl_stdout_bytes: 0,
      stderr_tail: [message],
      diff_refs: {
        changed_file_refs: [],
        diff_stat: [],
      },
      docker_cli_called: true,
      external_api_called: false,
      credential_material_logged: false,
      host_workspace_mutated: false,
      forwarded_env_keys: [],
    },
  };
}

export async function runCodexInLocalSandbox(input: {
  attempt: JsonRecord;
  args: string[];
  env?: Record<string, string | undefined>;
  providerKind: LocalSandboxProviderKind;
  timeoutMs: number;
  signal?: AbortSignal;
  onRunnerProgress?: (event: RunnerEventSummary) => void;
}): Promise<LocalCodexStageSandboxExecutionResult> {
  const env = { ...process.env, ...(input.env ?? {}) };
  const image = localSandboxImage(env);
  if (!image) {
    return providerUnavailableResult(
      input.providerKind,
      'local_sandbox_image_missing',
      'Local Codex stage sandbox requires OPL_LOCAL_SANDBOX_IMAGE or OPL_DEVCONTAINER_IMAGE.',
      env,
    );
  }
  const { repoUrl, checkoutRef } = workspaceTransportFromAttempt(input.attempt);
  if (!repoUrl) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Local Codex stage sandbox requires a git remote workspace transport.',
      {
        blocked_reason: 'local_sandbox_workspace_transport_missing',
        required: ['workspace_locator.git_remote_url or workspace_locator.repo_url'],
        docker_cli_called: false,
        external_api_called: false,
      },
    );
  }

  const commandTimeoutMs = normalizeTimeoutMs(input.timeoutMs, 120_000);
  const workspaceRoot = localSandboxWorkspaceRoot(env);
  const parentDir = path.posix.dirname(workspaceRoot);
  const containerName = `opl-stage-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const commandEnv = forwardedEnv(env, input.env ?? {});
  const template = localSandboxTemplate(env);

  const create = await runDocker(['create', '--name', containerName, '--entrypoint', 'sh', image, '-lc', 'sleep infinity'], {
    timeoutMs: 30_000,
    signal: input.signal,
  });
  if (create.exitCode !== 0 || create.error) {
    return providerUnavailableResult(
      input.providerKind,
      'local_sandbox_create_failed',
      create.error || create.stderr.trim() || 'Docker create failed for local Codex stage sandbox.',
      env,
    );
  }

  try {
    const start = await runDocker(['start', containerName], { timeoutMs: 30_000, signal: input.signal });
    if (start.exitCode !== 0 || start.error) {
      return providerUnavailableResult(
        input.providerKind,
        'local_sandbox_start_failed',
        start.error || start.stderr.trim() || 'Docker start failed for local Codex stage sandbox.',
        env,
      );
    }
    await runRequiredDockerPreparation({
      args: ['exec', containerName, 'sh', '-lc', `mkdir -p ${shellQuote(parentDir)} && rm -rf ${shellQuote(workspaceRoot)}`],
      opts: { timeoutMs: 30_000, signal: input.signal },
      providerKind: input.providerKind,
      phase: 'workspace_reset',
      failureCode: 'codex_sandbox_workspace_reset_failed',
    });
    const clone = await runRequiredDockerPreparation({
      args: ['exec', containerName, 'git', 'clone', repoUrl, workspaceRoot],
      opts: { timeoutMs: commandTimeoutMs, signal: input.signal },
      providerKind: input.providerKind,
      phase: 'workspace_clone',
      failureCode: 'codex_sandbox_workspace_clone_failed',
    });
    let checkout: LocalSandboxCommandResult | null = null;
    if (checkoutRef) {
      checkout = await runRequiredDockerPreparation({
        args: ['exec', containerName, 'git', '-C', workspaceRoot, 'checkout', checkoutRef],
        opts: { timeoutMs: 30_000, signal: input.signal },
        providerKind: input.providerKind,
        phase: 'workspace_checkout',
        failureCode: 'codex_sandbox_workspace_checkout_failed',
      });
    }
    const skillRuntime = sandboxAttemptSkillRuntime(input.attempt, workspaceRoot);
    if (skillRuntime) {
      await runRequiredDockerPreparation({
        args: [
          'exec',
          containerName,
          'mkdir',
          '-p',
          skillRuntime.skillsRoot,
        ],
        opts: { timeoutMs: 30_000, signal: input.signal },
        providerKind: input.providerKind,
        phase: 'skill_root_create',
        failureCode: 'agent_package_skill_projection_sandbox_mkdir_failed',
        generationId: skillRuntime.projection.generation_id,
      });
      await runRequiredDockerPreparation({
        args: [
          'cp',
          `${skillRuntime.projection.skills_root}${path.sep}.`,
          `${containerName}:${skillRuntime.skillsRoot}`,
        ],
        opts: { timeoutMs: 30_000, signal: input.signal },
        providerKind: input.providerKind,
        phase: 'skill_projection_copy',
        failureCode: 'agent_package_skill_projection_sandbox_copy_failed',
        generationId: skillRuntime.projection.generation_id,
      });
      const excludeLines = skillRuntime.projection.skill_ids
        .map((skillId) => `.agents/skills/${skillId}/`)
        .join('\n');
      await runRequiredDockerPreparation({
        args: [
          'exec',
          containerName,
          'sh',
          '-lc',
          `printf '%s\\n' ${shellQuote(excludeLines)} >> ${shellQuote(path.posix.join(workspaceRoot, '.git', 'info', 'exclude'))}`,
        ],
        opts: { timeoutMs: 30_000, signal: input.signal },
        providerKind: input.providerKind,
        phase: 'skill_projection_exclude',
        failureCode: 'agent_package_skill_projection_sandbox_exclude_failed',
        generationId: skillRuntime.projection.generation_id,
      });
    }
    const codexResult = await runDocker([
      'exec',
      '--workdir',
      workspaceRoot,
      ...forwardedEnvArgs(commandEnv),
      containerName,
      'sh',
      '-lc',
      commandFromArgs(input.args),
    ], {
      timeoutMs: commandTimeoutMs,
      signal: input.signal,
    });
    parseStdoutEvents(codexResult.stdout, input.onRunnerProgress);
    const changedFiles = await runDocker(['exec', containerName, 'git', '-C', workspaceRoot, 'diff', '--name-only'], {
      timeoutMs: 30_000,
      signal: input.signal,
    });
    const changedStatus = await runDocker(['exec', containerName, 'git', '-C', workspaceRoot, 'status', '--short', '--untracked-files=all'], {
      timeoutMs: 30_000,
      signal: input.signal,
    });
    const diffStat = await runDocker(['exec', containerName, 'git', '-C', workspaceRoot, 'diff', '--stat'], {
      timeoutMs: 30_000,
      signal: input.signal,
    });
    return {
      result: {
        exitCode: codexResult.exitCode,
        stdout: codexResult.stdout,
        stderr: codexResult.stderr,
        timeoutReason: timeoutReasonFromResult(codexResult),
        providerErrors: codexResult.error
          ? [{ message: codexResult.error, statusCode: null }]
          : undefined,
      },
      summary: {
        execution_substrate: 'local_sandbox',
        provider_kind: input.providerKind,
        image,
        template,
        container_name: containerName,
        sandbox_workspace_root: workspaceRoot,
        workspace_transport: {
          transport_kind: 'git_clone',
          repo_url: repoUrl,
          checkout_ref: checkoutRef,
          clone_exit_code: clone.exitCode,
          checkout_exit_code: checkout?.exitCode ?? null,
        },
        command_exit_code: codexResult.exitCode,
        jsonl_stdout_bytes: Buffer.byteLength(codexResult.stdout, 'utf8'),
        stderr_tail: codexResult.stderr.split(/\r?\n/).filter(Boolean).slice(-5),
        diff_refs: {
          changed_file_refs: uniqueRefs([
            ...changedFiles.stdout.split(/\r?\n/).filter(Boolean),
            ...changedRefsFromGitStatus(changedStatus.stdout),
          ]),
          diff_stat: diffStat.stdout.split(/\r?\n/).filter(Boolean),
        },
        docker_cli_called: true,
        external_api_called: false,
        credential_material_logged: false,
        host_workspace_mutated: false,
        forwarded_env_keys: Object.keys(commandEnv).sort(),
      },
    };
  } finally {
    await runDocker(['rm', '-f', containerName], { timeoutMs: 30_000, signal: input.signal });
  }
}
