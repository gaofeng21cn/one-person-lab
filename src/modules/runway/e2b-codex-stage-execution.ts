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

  await sandbox.commands.run(`mkdir -p ${shellQuote(parentDir)} && rm -rf ${shellQuote(workspaceRoot)}`, {
    timeoutMs: 30_000,
    signal: input.signal,
  });
  const clone = await sandbox.commands.run(
    `git clone ${shellQuote(repoUrl)} ${shellQuote(workspaceRoot)}`,
    { timeoutMs: commandTimeoutMs, signal: input.signal },
  );
  let checkout: E2bCommandResult | null = null;
  if (checkoutRef) {
    checkout = await sandbox.commands.run(`git -C ${shellQuote(workspaceRoot)} checkout ${shellQuote(checkoutRef)}`, {
      timeoutMs: 30_000,
      signal: input.signal,
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
