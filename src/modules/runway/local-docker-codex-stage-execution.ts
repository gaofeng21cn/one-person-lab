import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

import {
  createCodexExecEventParserState,
  parseCodexExecEventFromLine,
} from './codex-exec-events.ts';
import type { CodexCommandResult } from './codex.ts';
import { normalizeTimeoutMs, optionalString, type JsonRecord } from './family-runtime-codex-stage-runner-parts/shared.ts';
import type { RunnerEventSummary } from './family-runtime-codex-stage-runner-parts/input-prompt.ts';

type DockerCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
};

type DockerCommandRunner = {
  run: (args: string[], opts?: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
    signal?: AbortSignal;
  }) => Promise<DockerCommandResult>;
};

export type LocalDockerCodexStageExecutionSummary = {
  execution_substrate: 'external_sandbox';
  provider_kind: 'local_docker';
  sandbox_id: string;
  sandbox_domain: null;
  sandbox_reuse: 'created';
  template: string | null;
  sandbox_workspace_root: string;
  workspace_transport: {
    transport_kind: 'bind_mount';
    repo_url: null;
    checkout_ref: null;
    clone_exit_code: null;
    checkout_exit_code: null;
    host_workspace_root: string;
  };
  command_exit_code: number;
  jsonl_stdout_bytes: number;
  stderr_tail: string[];
  diff_refs: {
    changed_file_refs: string[];
    diff_stat: string[];
  };
  external_api_called: false;
  credential_material_logged: false;
  forwarded_env_keys: string[];
  preflight: {
    docker_cli: 'present' | 'missing';
    docker_daemon: 'reachable' | 'unreachable' | 'not_checked';
    image: 'configured' | 'missing' | 'unavailable';
    workspace: 'configured' | 'missing' | 'unavailable';
  };
};

export type LocalDockerCodexStageExecutionResult = {
  result: CodexCommandResult;
  summary: LocalDockerCodexStageExecutionSummary;
};

let dockerCommandRunnerForTest: DockerCommandRunner | null = null;

export function setLocalDockerCommandRunnerForTest(runner: DockerCommandRunner | null) {
  dockerCommandRunnerForTest = runner;
}

function dockerBinary(env: Record<string, string | undefined>) {
  return env.OPL_DOCKER_BIN?.trim() || 'docker';
}

function defaultDockerCommandRunner(env: Record<string, string | undefined>): DockerCommandRunner {
  return {
    async run(args, opts) {
      return await new Promise<DockerCommandResult>((resolve) => {
        const child = spawn(dockerBinary(env), args, {
          cwd: opts?.cwd,
          env: { ...process.env, ...(opts?.env ?? {}) },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let completed = false;
        let timer: NodeJS.Timeout | null = null;
        const finish = (result: DockerCommandResult) => {
          if (completed) {
            return;
          }
          completed = true;
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          resolve(result);
        };
        if (opts?.timeoutMs && opts.timeoutMs > 0) {
          timer = setTimeout(() => {
            child.kill('SIGTERM');
            finish({
              exitCode: 124,
              stdout,
              stderr: `${stderr}${stderr.endsWith('\n') || stderr.length === 0 ? '' : '\n'}Docker command timed out.\n`,
              error: 'docker_command_timeout',
            });
          }, opts.timeoutMs);
        }
        opts?.signal?.addEventListener('abort', () => {
          child.kill('SIGTERM');
          finish({
            exitCode: 130,
            stdout,
            stderr: `${stderr}${stderr.endsWith('\n') || stderr.length === 0 ? '' : '\n'}Docker command cancelled.\n`,
            error: 'docker_command_cancelled',
          });
        }, { once: true });
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
          stdout += chunk;
        });
        child.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        child.on('error', (error) => {
          finish({
            exitCode: 127,
            stdout,
            stderr: error.message,
            error: error.message,
          });
        });
        child.on('close', (code) => {
          finish({
            exitCode: code ?? 1,
            stdout,
            stderr,
          });
        });
      });
    },
  };
}

function dockerCommandRunner(env: Record<string, string | undefined>) {
  return dockerCommandRunnerForTest ?? defaultDockerCommandRunner(env);
}

function sandboxImage(env: Record<string, string | undefined>) {
  return env.OPL_CODEX_STAGE_SANDBOX_IMAGE?.trim()
    || env.OPL_DEVCONTAINER_IMAGE?.trim()
    || env.OPL_LOCAL_SANDBOX_IMAGE?.trim()
    || null;
}

function containerWorkspaceRoot(env: Record<string, string | undefined>) {
  return env.OPL_CODEX_STAGE_SANDBOX_WORKSPACE_ROOT?.trim()
    || env.OPL_DEVCONTAINER_WORKSPACE_ROOT?.trim()
    || '/workspace';
}

function secretLikeEnvKey(key: string) {
  return /(?:SECRET|TOKEN|PASSWORD|API_KEY|CREDENTIAL)/i.test(key);
}

function forwardedEnv(env: Record<string, string | undefined>) {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (
      key.startsWith('OPL_')
      && !secretLikeEnvKey(key)
      && typeof value === 'string'
    ) {
      result[key] = value;
    }
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

function gitLines(workspaceRoot: string, args: string[]) {
  const result = spawnSync('git', ['-C', workspaceRoot, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return (result.stdout ?? '').split(/\r?\n/).filter(Boolean);
}

function createSummary(input: {
  image: string | null;
  containerName: string;
  containerWorkspaceRoot: string;
  hostWorkspaceRoot: string;
  commandExitCode: number;
  stdout: string;
  stderr: string;
  forwardedEnvKeys: string[];
  preflight: LocalDockerCodexStageExecutionSummary['preflight'];
}): LocalDockerCodexStageExecutionSummary {
  return {
    execution_substrate: 'external_sandbox',
    provider_kind: 'local_docker',
    sandbox_id: input.containerName,
    sandbox_domain: null,
    sandbox_reuse: 'created',
    template: input.image,
    sandbox_workspace_root: input.containerWorkspaceRoot,
    workspace_transport: {
      transport_kind: 'bind_mount',
      repo_url: null,
      checkout_ref: null,
      clone_exit_code: null,
      checkout_exit_code: null,
      host_workspace_root: input.hostWorkspaceRoot,
    },
    command_exit_code: input.commandExitCode,
    jsonl_stdout_bytes: Buffer.byteLength(input.stdout, 'utf8'),
    stderr_tail: input.stderr.split(/\r?\n/).filter(Boolean).slice(-5),
    diff_refs: {
      changed_file_refs: gitLines(input.hostWorkspaceRoot, ['diff', '--name-only']),
      diff_stat: gitLines(input.hostWorkspaceRoot, ['diff', '--stat']),
    },
    external_api_called: false,
    credential_material_logged: false,
    forwarded_env_keys: input.forwardedEnvKeys,
    preflight: input.preflight,
  };
}

function unavailableResult(reason: string, message: string): CodexCommandResult {
  return {
    exitCode: 78,
    stdout: '',
    stderr: `${message}\n`,
    timeoutReason: 'provider_unavailable',
    providerErrors: [{ message: reason, statusCode: null }],
  };
}

export function sandboxAttemptForLocalDockerCodex(input: {
  attempt: JsonRecord;
  sandboxWorkspaceRoot: string;
}) {
  const locator = typeof input.attempt.workspace_locator === 'object' && input.attempt.workspace_locator !== null
    ? input.attempt.workspace_locator as JsonRecord
    : {};
  return {
    ...input.attempt,
    workspace_locator: {
      ...locator,
      workspace_root: input.sandboxWorkspaceRoot,
      repo_root: input.sandboxWorkspaceRoot,
      host_workspace_root: optionalString(locator.workspace_root) ?? optionalString(locator.repo_root) ?? null,
      workspace_transport: 'local_docker_bind_mount',
    },
  };
}

export async function runCodexInLocalDockerSandbox(input: {
  attempt: JsonRecord;
  args: string[];
  hostWorkspaceRoot: string;
  env?: Record<string, string | undefined>;
  timeoutMs: number;
  signal?: AbortSignal;
  onRunnerProgress?: (event: RunnerEventSummary) => void;
}): Promise<LocalDockerCodexStageExecutionResult> {
  const env = { ...process.env, ...(input.env ?? {}) };
  const image = sandboxImage(env);
  const workspaceRoot = input.hostWorkspaceRoot;
  const sandboxWorkspaceRoot = containerWorkspaceRoot(env);
  const containerName = `opl-codex-stage-${process.pid}-${Date.now()}`;
  const commandEnv = forwardedEnv(input.env ?? {});
  const basePreflight: LocalDockerCodexStageExecutionSummary['preflight'] = {
    docker_cli: 'present',
    docker_daemon: 'not_checked',
    image: image ? 'configured' : 'missing',
    workspace: 'configured',
  };
  const summaryFor = (
    result: CodexCommandResult,
    preflight: LocalDockerCodexStageExecutionSummary['preflight'],
  ) => ({
    result,
    summary: createSummary({
      image,
      containerName,
      containerWorkspaceRoot: sandboxWorkspaceRoot,
      hostWorkspaceRoot: workspaceRoot,
      commandExitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      forwardedEnvKeys: Object.keys(commandEnv).sort(),
      preflight,
    }),
  });
  if (!image) {
    return summaryFor(
      unavailableResult(
        'local_docker_sandbox_image_missing',
        'Local Docker Codex stage execution requires OPL_CODEX_STAGE_SANDBOX_IMAGE.',
      ),
      basePreflight,
    );
  }
  if (!workspaceRoot || !fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
    return summaryFor(
      unavailableResult(
        'local_docker_workspace_unavailable',
        'Local Docker Codex stage execution requires an existing workspace directory.',
      ),
      { ...basePreflight, workspace: workspaceRoot ? 'unavailable' : 'missing' },
    );
  }
  const runner = dockerCommandRunner(env);
  const dockerVersion = await runner.run(['version', '--format', '{{.Server.Version}}'], {
    timeoutMs: 10_000,
    signal: input.signal,
  });
  if (dockerVersion.exitCode !== 0) {
    const cliMissing = dockerVersion.exitCode === 127;
    return summaryFor(
      unavailableResult(
        cliMissing ? 'local_docker_cli_missing' : 'local_docker_daemon_unavailable',
        cliMissing
          ? 'Local Docker Codex stage execution requires Docker CLI.'
          : 'Local Docker Codex stage execution requires a reachable Docker daemon.',
      ),
      {
        ...basePreflight,
        docker_cli: cliMissing ? 'missing' : 'present',
        docker_daemon: cliMissing ? 'not_checked' : 'unreachable',
      },
    );
  }
  const imageInspect = await runner.run(['image', 'inspect', image], {
    timeoutMs: 10_000,
    signal: input.signal,
  });
  if (imageInspect.exitCode !== 0) {
    return summaryFor(
      unavailableResult(
        'local_docker_sandbox_image_unavailable',
        'Local Docker Codex stage execution requires the configured sandbox image to exist locally.',
      ),
      { ...basePreflight, docker_daemon: 'reachable', image: 'unavailable' },
    );
  }
  const dockerArgs = [
    'run',
    '--rm',
    '--name',
    containerName,
    '--mount',
    `type=bind,src=${workspaceRoot},dst=${sandboxWorkspaceRoot}`,
    '--workdir',
    sandboxWorkspaceRoot,
    ...Object.keys(commandEnv).sort().flatMap((key) => ['--env', key]),
    image,
    'codex',
    ...input.args,
  ];
  const codexResult = await runner.run(dockerArgs, {
    cwd: workspaceRoot,
    env: commandEnv,
    timeoutMs: normalizeTimeoutMs(input.timeoutMs, 120_000),
    signal: input.signal,
  });
  parseStdoutEvents(codexResult.stdout, input.onRunnerProgress);
  return summaryFor(
    {
      exitCode: codexResult.exitCode,
      stdout: codexResult.stdout,
      stderr: codexResult.stderr,
      timeoutReason: codexResult.error ? 'provider_unavailable' : undefined,
      providerErrors: codexResult.error
        ? [{ message: codexResult.error, statusCode: null }]
        : undefined,
    },
    { ...basePreflight, docker_daemon: 'reachable' },
  );
}
