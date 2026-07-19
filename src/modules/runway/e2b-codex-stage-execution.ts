import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  createCodexExecEventParserState,
  parseCodexExecEventFromLine,
} from './codex-exec-events.ts';
import type { CodexCommandResult } from './codex.ts';
import { stringValue as optionalString } from '../../kernel/json-record.ts';
import { isRecord, normalizeTimeoutMs, type JsonRecord } from './family-runtime-codex-stage-runner-parts/shared.ts';
import { inspectExternalSandboxProviderAdapterEnv } from './external-sandbox-provider-adapter.ts';
import type { RunnerEventSummary } from './family-runtime-codex-stage-runner-parts/input-prompt.ts';
import { projectionFiles } from '../connect/index.ts';
import { sandboxAttemptSkillRuntime } from './family-runtime-attempt-skill-projection.ts';

type E2bCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
};

type E2bSandbox = {
  sandboxId: string;
  sandboxDomain?: string;
  commands: {
    run: (cmd: string, opts?: {
      cwd?: string;
      envs?: Record<string, string>;
      timeoutMs?: number;
      signal?: AbortSignal;
      onStdout?: (data: string) => void | Promise<void>;
      onStderr?: (data: string) => void | Promise<void>;
    }) => Promise<E2bCommandResult>;
  };
  files: {
    write: (filePath: string, data: string | ArrayBuffer) => Promise<unknown>;
  };
};

type E2bSandboxFactory = {
  create: (template?: string | null) => Promise<E2bSandbox>;
  connect: (sandboxId: string) => Promise<E2bSandbox>;
};

export type E2bCodexStageExecutionSummary = {
  execution_substrate: 'external_sandbox';
  provider_kind: 'e2b';
  sandbox_id: string;
  sandbox_domain: string | null;
  sandbox_reuse: 'created' | 'connected';
  template: string | null;
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
  external_api_called: true;
  credential_material_logged: false;
  forwarded_env_keys: string[];
};

export type E2bCodexStageExecutionResult = {
  result: CodexCommandResult;
  summary: E2bCodexStageExecutionSummary;
};

let sandboxFactoryForTest: E2bSandboxFactory | null = null;

export function setE2bSandboxFactoryForTest(factory: E2bSandboxFactory | null) {
  sandboxFactoryForTest = factory;
}

function envWithOverlay(overlay?: Record<string, string | undefined>) {
  const keys = [
    'OPL_CODEX_STAGE_SANDBOX_PROVIDER',
    'OPL_E2B_TEMPLATE',
    'OPL_E2B_WORKSPACE_ROOT',
    'OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF',
    'OPL_EXTERNAL_SANDBOX_ENDPOINT',
    'OPL_EXTERNAL_SANDBOX_ID',
    'OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF',
    'OPL_EXTERNAL_SANDBOX_SUBSTRATE',
    'OPL_EXTERNAL_SANDBOX_TEMPLATE',
    'OPL_EXTERNAL_SANDBOX_WORKSPACE_ROOT',
    'OPL_FAMILY_RUNTIME_PROVIDER',
  ];
  const env: Record<string, string | undefined> = {};
  for (const key of keys) {
    env[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(overlay ?? {})) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return env;
}

export function shouldRunCodexStageInE2bSandbox(env: Record<string, string | undefined> = process.env) {
  const explicit = env.OPL_CODEX_STAGE_SANDBOX_PROVIDER?.trim().toLowerCase();
  if (explicit) {
    return explicit === 'e2b';
  }
  return env.OPL_FAMILY_RUNTIME_PROVIDER?.trim().toLowerCase() === 'external_sandbox'
    && env.OPL_EXTERNAL_SANDBOX_SUBSTRATE?.trim().toLowerCase() === 'e2b';
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

function sandboxWorkspaceRoot(env: Record<string, string | undefined>) {
  return env.OPL_E2B_WORKSPACE_ROOT?.trim() || env.OPL_EXTERNAL_SANDBOX_WORKSPACE_ROOT?.trim() || '/home/user/opl-stage-workspace';
}

function forwardedEnv(env: Record<string, string | undefined>, base: Record<string, string | undefined>) {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (typeof value === 'string' && key.startsWith('OPL_')) {
      result[key] = value;
    }
  }
  return result;
}

async function defaultSandboxFactory(): Promise<E2bSandboxFactory> {
  const mod = await import('e2b');
  const Sandbox = mod.Sandbox ?? mod.default;
  return {
    async create(template?: string | null) {
      return template ? await Sandbox.create(template) : await Sandbox.create();
    },
    async connect(sandboxId: string) {
      return await Sandbox.connect(sandboxId);
    },
  };
}

async function sandboxFactory() {
  return sandboxFactoryForTest ?? await defaultSandboxFactory();
}

function ensureConfiguredForLive(env: Record<string, string | undefined>) {
  const adapterConfig = inspectExternalSandboxProviderAdapterEnv(env as NodeJS.ProcessEnv);
  const missing = [
    ...adapterConfig.missingRequiredEnv,
    ...(process.env.E2B_API_KEY || sandboxFactoryForTest ? [] : ['E2B_API_KEY']),
  ];
  if (missing.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'E2B Codex stage execution requires configured external sandbox refs and an E2B API key.',
      {
        blocked_reason: 'external_sandbox_e2b_configuration_missing',
        missing_required_env: missing,
        credential_material_read: false,
        external_api_called: false,
      },
    );
  }
}

function timeoutReasonFromExit(result: E2bCommandResult): CodexCommandResult['timeoutReason'] | undefined {
  return result.error ? 'provider_unavailable' : undefined;
}

function safeProviderErrorKind(error?: string) {
  if (!error) return null;
  if (error === 'activity_cancelled' || error === 'total_timeout') return error;
  return 'provider_error';
}

function failE2bPreparation(input: {
  phase: string;
  failureCode: string;
  result?: E2bCommandResult | null;
  providerThrew?: boolean;
  generationId?: string;
}): never {
  throw new FrameworkContractError(
    'launcher_failed',
    `E2B Codex sandbox preparation failed during ${input.phase}; Codex was not executed.`,
    {
      failure_code: input.failureCode,
      sandbox_phase: input.phase,
      provider_kind: 'e2b',
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

async function runRequiredE2bPreparation(input: {
  sandbox: E2bSandbox;
  command: string;
  opts: {
    cwd?: string;
    envs?: Record<string, string>;
    timeoutMs?: number;
    signal?: AbortSignal;
  };
  phase: string;
  failureCode: string;
  generationId?: string;
}) {
  let result: E2bCommandResult;
  try {
    result = await input.sandbox.commands.run(input.command, input.opts);
  } catch {
    failE2bPreparation({
      ...input,
      result: null,
      providerThrew: true,
    });
  }
  if (result.exitCode !== 0 || result.error) {
    failE2bPreparation({ ...input, result });
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

export function sandboxAttemptForCodex(input: {
  attempt: JsonRecord;
  sandboxWorkspaceRoot: string;
  workspaceTransport?: string;
}) {
  const locator = workspaceLocator(input.attempt);
  return {
    ...input.attempt,
    workspace_locator: {
      ...locator,
      workspace_root: input.sandboxWorkspaceRoot,
      repo_root: input.sandboxWorkspaceRoot,
      host_workspace_root: optionalString(locator.workspace_root) ?? optionalString(locator.repo_root) ?? null,
      workspace_transport: input.workspaceTransport ?? 'external_sandbox_git_clone',
    },
  };
}

export async function runCodexInE2bSandbox(input: {
  attempt: JsonRecord;
  args: string[];
  env?: Record<string, string | undefined>;
  timeoutMs: number;
  signal?: AbortSignal;
  onRunnerProgress?: (event: RunnerEventSummary) => void;
}): Promise<E2bCodexStageExecutionResult> {
  const env = envWithOverlay(input.env);
  ensureConfiguredForLive(env);
  const { repoUrl, checkoutRef } = workspaceTransportFromAttempt(input.attempt);
  if (!repoUrl) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'E2B Codex stage execution requires a git remote workspace transport.',
      {
        blocked_reason: 'external_sandbox_workspace_transport_missing',
        required: ['workspace_locator.git_remote_url or workspace_locator.repo_url'],
        external_api_called: false,
      },
    );
  }

  const factory = await sandboxFactory();
  const template = env.OPL_E2B_TEMPLATE?.trim() || env.OPL_EXTERNAL_SANDBOX_TEMPLATE?.trim() || null;
  const sandboxId = env.OPL_EXTERNAL_SANDBOX_ID?.trim() || null;
  const sandbox = sandboxId ? await factory.connect(sandboxId) : await factory.create(template);
  const reuse = sandboxId ? 'connected' : 'created';
  const workspaceRoot = sandboxWorkspaceRoot(env);
  const parentDir = path.posix.dirname(workspaceRoot);
  const commandTimeoutMs = normalizeTimeoutMs(input.timeoutMs, 120_000);

  await runRequiredE2bPreparation({
    sandbox,
    command: `mkdir -p ${shellQuote(parentDir)} && rm -rf ${shellQuote(workspaceRoot)}`,
    opts: { timeoutMs: 30_000, signal: input.signal },
    phase: 'workspace_reset',
    failureCode: 'codex_sandbox_workspace_reset_failed',
  });
  const clone = await runRequiredE2bPreparation({
    sandbox,
    command: `git clone ${shellQuote(repoUrl)} ${shellQuote(workspaceRoot)}`,
    opts: { timeoutMs: commandTimeoutMs, signal: input.signal },
    phase: 'workspace_clone',
    failureCode: 'codex_sandbox_workspace_clone_failed',
  });
  let checkout: E2bCommandResult | null = null;
  if (checkoutRef) {
    checkout = await runRequiredE2bPreparation({
      sandbox,
      command: `git -C ${shellQuote(workspaceRoot)} checkout ${shellQuote(checkoutRef)}`,
      opts: { timeoutMs: 30_000, signal: input.signal },
      phase: 'workspace_checkout',
      failureCode: 'codex_sandbox_workspace_checkout_failed',
    });
  }
  const skillRuntime = sandboxAttemptSkillRuntime(input.attempt, workspaceRoot);
  if (skillRuntime) {
    await runRequiredE2bPreparation({
      sandbox,
      command: `mkdir -p ${shellQuote(skillRuntime.skillsRoot)}`,
      opts: { timeoutMs: 30_000, signal: input.signal },
      phase: 'skill_root_create',
      failureCode: 'agent_package_skill_projection_sandbox_mkdir_failed',
      generationId: skillRuntime.projection.generation_id,
    });
    for (const file of projectionFiles(skillRuntime.projection)) {
      const relativePath = file.relative_path.split(path.sep).join(path.posix.sep);
      const targetPath = path.posix.join(skillRuntime.skillsRoot, relativePath);
      await runRequiredE2bPreparation({
        sandbox,
        command: `mkdir -p ${shellQuote(path.posix.dirname(targetPath))}`,
        opts: { timeoutMs: 30_000, signal: input.signal },
        phase: 'skill_file_parent_create',
        failureCode: 'agent_package_skill_projection_sandbox_mkdir_failed',
        generationId: skillRuntime.projection.generation_id,
      });
      try {
        await sandbox.files.write(targetPath, Uint8Array.from(file.bytes).buffer);
      } catch {
        failE2bPreparation({
          phase: 'skill_file_write',
          failureCode: 'agent_package_skill_projection_sandbox_write_failed',
          providerThrew: true,
          generationId: skillRuntime.projection.generation_id,
        });
      }
      if (file.executable) {
        await runRequiredE2bPreparation({
          sandbox,
          command: `chmod 0555 ${shellQuote(targetPath)}`,
          opts: { timeoutMs: 30_000, signal: input.signal },
          phase: 'skill_file_chmod',
          failureCode: 'agent_package_skill_projection_sandbox_chmod_failed',
          generationId: skillRuntime.projection.generation_id,
        });
      }
    }
    const excludeLines = skillRuntime.projection.skill_ids
      .map((skillId) => `.agents/skills/${skillId}/`)
      .join('\n');
    await runRequiredE2bPreparation({
      sandbox,
      command: `printf '%s\\n' ${shellQuote(excludeLines)} >> ${shellQuote(path.posix.join(workspaceRoot, '.git', 'info', 'exclude'))}`,
      opts: { timeoutMs: 30_000, signal: input.signal },
      phase: 'skill_projection_exclude',
      failureCode: 'agent_package_skill_projection_sandbox_exclude_failed',
      generationId: skillRuntime.projection.generation_id,
    });
  }
  const commandEnv = forwardedEnv(env, input.env ?? {});
  const codexResult = await sandbox.commands.run(commandFromArgs(input.args), {
    cwd: workspaceRoot,
    envs: commandEnv,
    timeoutMs: commandTimeoutMs,
    signal: input.signal,
  });
  parseStdoutEvents(codexResult.stdout, input.onRunnerProgress);
  const changedFiles = await sandbox.commands.run(`git -C ${shellQuote(workspaceRoot)} diff --name-only`, {
    timeoutMs: 30_000,
    signal: input.signal,
  });
  const diffStat = await sandbox.commands.run(`git -C ${shellQuote(workspaceRoot)} diff --stat`, {
    timeoutMs: 30_000,
    signal: input.signal,
  });
  return {
    result: {
      exitCode: codexResult.exitCode,
      stdout: codexResult.stdout,
      stderr: codexResult.stderr,
      timeoutReason: timeoutReasonFromExit(codexResult),
      providerErrors: codexResult.error
        ? [{ message: codexResult.error, statusCode: null }]
        : undefined,
    },
    summary: {
      execution_substrate: 'external_sandbox',
      provider_kind: 'e2b',
      sandbox_id: sandbox.sandboxId,
      sandbox_domain: sandbox.sandboxDomain ?? null,
      sandbox_reuse: reuse,
      template,
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
        changed_file_refs: changedFiles.stdout.split(/\r?\n/).filter(Boolean),
        diff_stat: diffStat.stdout.split(/\r?\n/).filter(Boolean),
      },
      external_api_called: true,
      credential_material_logged: false,
      forwarded_env_keys: Object.keys(commandEnv).sort(),
    },
  };
}
