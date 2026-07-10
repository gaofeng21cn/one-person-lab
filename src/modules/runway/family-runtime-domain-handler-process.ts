import { spawnSync, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import {
  buildManagedShellCommandEnv,
  buildManagedShellEnvWithUvCacheRecovery,
  buildManagedShellRecoveryTmpRoot,
  recordManagedShellUvCacheRecovery,
} from '../../kernel/managed-shell-command-env.ts';

const DEFAULT_DOMAIN_HANDLER_DISPATCH_TIMEOUT_MS = 120_000;
const DEFAULT_DOMAIN_HANDLER_EXPORT_TIMEOUT_MS = 600_000;
const READ_ONLY_DOMAIN_HANDLER_TIMEOUT_MS = 2_000;
const DEFAULT_DOMAIN_HANDLER_MAX_BUFFER = 10 * 1024 * 1024;

type DomainHandlerTimeoutKind = 'dispatch' | 'export';

type DomainHandlerProcessResult = SpawnSyncReturns<string> & {
  exit_code: number;
  timed_out: boolean;
  domain_handler_timeout_ms: number;
  checkout_currentness_preflight?: DomainHandlerCheckoutCurrentnessPreflight;
  recovery?: {
    trigger_kind: 'uv_cache_archive_missing' | 'managed_python_env_missing_dependency';
    first_exit_code: number;
    retry_exit_code: number;
    retry_tmp_root: string;
    first_error_excerpt: string;
  };
};

export type DomainHandlerCheckoutCurrentnessPreflight = {
  status: 'not_git_checkout' | 'current' | 'fast_forwarded' | 'blocked';
  currentness_status:
    | 'not_git_checkout'
    | 'current'
    | 'fast_forwarded'
    | 'dirty_fail_closed'
    | 'diverged_fail_closed'
    | 'target_unresolved_fail_closed'
    | 'git_unreadable_fail_closed'
    | 'fetch_failed_fail_closed'
    | 'fast_forward_failed_fail_closed'
    | 'ahead_fail_closed';
  workspace_path: string;
  target_ref?: string;
  head_sha?: string;
  target_sha?: string;
  reason?: string;
  detail?: string;
};

function domainHandlerTimeoutEnvName(timeoutKind: DomainHandlerTimeoutKind) {
  return timeoutKind === 'export'
    ? 'OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_EXPORT_TIMEOUT_MS'
    : 'OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_TIMEOUT_MS';
}

function defaultDomainHandlerTimeoutMs(timeoutKind: DomainHandlerTimeoutKind) {
  return timeoutKind === 'export'
    ? DEFAULT_DOMAIN_HANDLER_EXPORT_TIMEOUT_MS
    : DEFAULT_DOMAIN_HANDLER_DISPATCH_TIMEOUT_MS;
}

function resolveFamilyRuntimeDomainHandlerTimeoutMs(timeoutKind: DomainHandlerTimeoutKind = 'dispatch') {
  const raw = process.env[domainHandlerTimeoutEnvName(timeoutKind)]?.trim();
  if (!raw) {
    return defaultDomainHandlerTimeoutMs(timeoutKind);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `${domainHandlerTimeoutEnvName(timeoutKind)} must be a positive integer.`,
      { env: domainHandlerTimeoutEnvName(timeoutKind), value: raw },
    );
  }
  return parsed;
}

function errorCode(error: Error | undefined) {
  return error && 'code' in error ? String((error as NodeJS.ErrnoException).code) : null;
}

function parseStructuredDomainHandlerError(stdout: string | undefined, label: string) {
  const trimmed = stdout?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = parseJsonText(trimmed);
    if (!isRecord(parsed)) {
      return null;
    }
    const parts = [
      parsed.reason,
      parsed.detail,
      parsed.message,
      parsed.blocked_reason,
    ].filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
    if (parts.length === 0) {
      return null;
    }
    return `${label} failed: ${parts.join(': ')}`;
  } catch {
    return null;
  }
}

function resultExitCode(result: SpawnSyncReturns<string>, timedOut: boolean) {
  return timedOut ? 124 : result.status ?? (result.error ? 127 : 1);
}

function runGit(cwd: string, args: string[]) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  });
}

function gitOutput(result: SpawnSyncReturns<string>) {
  return (result.stdout ?? '').trim();
}

function gitErrorDetail(result: SpawnSyncReturns<string>) {
  return shortExcerpt([
    result.error?.message,
    result.stderr,
    result.stdout,
  ].filter(Boolean).join('\n'));
}

function checkoutCurrentnessTargetRef(env: NodeJS.ProcessEnv) {
  return env.OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_CURRENTNESS_TARGET_REF?.trim() || 'origin/main';
}

function commandRunsFromCheckout(command: string[], cwd: string) {
  const executable = command[0];
  if (!executable || (!path.isAbsolute(executable) && !executable.includes('/'))) {
    return false;
  }
  const resolvedExecutable = path.resolve(cwd, executable);
  const resolvedCwd = path.resolve(cwd);
  const relative = path.relative(resolvedCwd, resolvedExecutable);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function failClosedDomainHandlerResult(
  timeoutMs: number,
  preflight: DomainHandlerCheckoutCurrentnessPreflight,
): DomainHandlerProcessResult {
  return {
    pid: 0,
    output: [null, null, JSON.stringify({
      surface_kind: 'opl_domain_handler_checkout_currentness_preflight',
      accepted: false,
      reason: preflight.reason,
      blocked_reason: preflight.reason,
      detail: preflight.detail,
      checkout_currentness_preflight: preflight,
    })],
    stdout: `${JSON.stringify({
      surface_kind: 'opl_domain_handler_checkout_currentness_preflight',
      accepted: false,
      reason: preflight.reason,
      blocked_reason: preflight.reason,
      detail: preflight.detail,
      checkout_currentness_preflight: preflight,
    })}\n`,
    stderr: '',
    status: 1,
    signal: null,
    error: undefined,
    exit_code: 1,
    timed_out: false,
    domain_handler_timeout_ms: timeoutMs,
    checkout_currentness_preflight: preflight,
  };
}

function resultText(result: SpawnSyncReturns<string>) {
  return [
    result.error?.message,
    result.stderr,
    result.stdout,
  ].filter(Boolean).join('\n');
}

function shortExcerpt(value: string, maxLength = 500) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`;
}

function freshManagedRootRetryTrigger(result: SpawnSyncReturns<string>, exitCode: number) {
  if (exitCode === 0 || errorCode(result.error) === 'ETIMEDOUT') {
    return null;
  }
  const text = resultText(result);
  if (/Failed to install:/i.test(text)
    && /archive-v0/i.test(text)
    && /METADATA/i.test(text)
    && /No such file or directory/i.test(text)) {
    return 'uv_cache_archive_missing' as const;
  }
  if (/ModuleNotFoundError:\s+No module named ['"][^'"]+['"]/i.test(text)) {
    return 'managed_python_env_missing_dependency' as const;
  }
  return null;
}

export function preflightGitCheckoutCurrentness(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): DomainHandlerCheckoutCurrentnessPreflight {
  const workspacePath = path.resolve(cwd);
  const inside = runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (inside.status !== 0 || gitOutput(inside) !== 'true') {
    return { status: 'not_git_checkout', currentness_status: 'not_git_checkout', workspace_path: workspacePath };
  }

  const head = runGit(cwd, ['rev-parse', 'HEAD']);
  const headSha = head.status === 0 ? gitOutput(head) : undefined;
  if (head.status !== 0) {
    return {
      status: 'blocked',
      currentness_status: 'git_unreadable_fail_closed',
      workspace_path: workspacePath,
      reason: 'git_head_unreadable',
      detail: gitErrorDetail(head),
    };
  }

  const status = runGit(cwd, ['status', '--porcelain']);
  if (status.status !== 0) {
    return {
      status: 'blocked',
      currentness_status: 'git_unreadable_fail_closed',
      workspace_path: workspacePath,
      reason: 'git_status_unreadable',
      head_sha: headSha,
      detail: gitErrorDetail(status),
    };
  }
  if (gitOutput(status)) {
    return {
      status: 'blocked',
      currentness_status: 'dirty_fail_closed',
      workspace_path: workspacePath,
      reason: 'dirty_checkout',
      head_sha: headSha,
      detail: 'Domain-handler checkout has uncommitted changes; refusing to run against a mutable source tree.',
    };
  }

  const targetRef = checkoutCurrentnessTargetRef(env);
  const fetch = runGit(cwd, ['fetch', '--quiet', 'origin']);
  if (fetch.status !== 0) {
    return {
      status: 'blocked',
      currentness_status: 'fetch_failed_fail_closed',
      workspace_path: workspacePath,
      reason: 'git_fetch_failed',
      target_ref: targetRef,
      head_sha: headSha,
      detail: gitErrorDetail(fetch),
    };
  }

  const target = runGit(cwd, ['rev-parse', '--verify', targetRef]);
  if (target.status !== 0) {
    return {
      status: 'blocked',
      currentness_status: 'target_unresolved_fail_closed',
      workspace_path: workspacePath,
      reason: 'target_ref_unreadable',
      target_ref: targetRef,
      head_sha: headSha,
      detail: gitErrorDetail(target),
    };
  }
  const targetSha = gitOutput(target);
  if (headSha === targetSha) {
    return {
      status: 'current',
      currentness_status: 'current',
      workspace_path: workspacePath,
      target_ref: targetRef,
      head_sha: headSha,
      target_sha: targetSha,
    };
  }

  const headAncestor = runGit(cwd, ['merge-base', '--is-ancestor', 'HEAD', targetRef]);
  if (headAncestor.status === 0) {
    const merge = runGit(cwd, ['merge', '--ff-only', targetRef]);
    if (merge.status !== 0) {
      return {
        status: 'blocked',
        currentness_status: 'fast_forward_failed_fail_closed',
        workspace_path: workspacePath,
        reason: 'fast_forward_failed',
        target_ref: targetRef,
        head_sha: headSha,
        target_sha: targetSha,
        detail: gitErrorDetail(merge),
      };
    }
    const newHead = runGit(cwd, ['rev-parse', 'HEAD']);
    return {
      status: 'fast_forwarded',
      currentness_status: 'fast_forwarded',
      workspace_path: workspacePath,
      target_ref: targetRef,
      head_sha: newHead.status === 0 ? gitOutput(newHead) : targetSha,
      target_sha: targetSha,
    };
  }

  const targetAncestor = runGit(cwd, ['merge-base', '--is-ancestor', targetRef, 'HEAD']);
  return {
    status: 'blocked',
    currentness_status: targetAncestor.status === 0 ? 'ahead_fail_closed' : 'diverged_fail_closed',
    workspace_path: workspacePath,
    reason: targetAncestor.status === 0 ? 'checkout_ahead_of_target' : 'diverged_checkout',
    target_ref: targetRef,
    head_sha: headSha,
    target_sha: targetSha,
    detail: 'Domain-handler checkout is not a clean fast-forward from the target ref; refusing to run against a non-current source tree.',
  };
}

function preflightDomainHandlerCheckoutCurrentness(
  command: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): DomainHandlerCheckoutCurrentnessPreflight {
  const workspacePath = path.resolve(cwd);
  if (!commandRunsFromCheckout(command, cwd)) {
    return { status: 'not_git_checkout', currentness_status: 'not_git_checkout', workspace_path: workspacePath };
  }
  return preflightGitCheckoutCurrentness(workspacePath, env);
}

function normalizeDomainHandlerResult(
  result: SpawnSyncReturns<string>,
  timeoutMs: number,
  checkoutCurrentnessPreflight?: DomainHandlerCheckoutCurrentnessPreflight,
  recovery?: DomainHandlerProcessResult['recovery'],
): DomainHandlerProcessResult {
  const timedOut = errorCode(result.error) === 'ETIMEDOUT';
  cleanupTimedOutProcessGroup(result, timedOut);
  return {
    ...result,
    exit_code: resultExitCode(result, timedOut),
    timed_out: timedOut,
    domain_handler_timeout_ms: timeoutMs,
    ...(checkoutCurrentnessPreflight ? { checkout_currentness_preflight: checkoutCurrentnessPreflight } : {}),
    ...(recovery ? { recovery } : {}),
  };
}

function cleanupTimedOutProcessGroup(result: SpawnSyncReturns<string>, timedOut: boolean) {
  if (!timedOut || !result.pid) {
    return;
  }
  try {
    process.kill(-result.pid, 'SIGKILL');
  } catch {
    try {
      process.kill(result.pid, 'SIGKILL');
    } catch {
      // The timeout path is already fail-closed; cleanup is best-effort for child process groups.
    }
  }
}

function spawnDomainHandlerCommand(
  command: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; maxBuffer?: number },
  timeoutMs: number,
) {
  const spawnOptions: SpawnSyncOptionsWithStringEncoding & { detached: boolean } = {
    cwd: options.cwd,
    encoding: 'utf8',
    env: buildManagedShellCommandEnv(options.cwd, options.env ?? process.env),
    maxBuffer: options.maxBuffer ?? DEFAULT_DOMAIN_HANDLER_MAX_BUFFER,
    timeout: timeoutMs,
    detached: true,
    killSignal: 'SIGTERM',
  };
  return spawnSync(command[0], command.slice(1), spawnOptions);
}

export function runFamilyRuntimeDomainHandlerCommand(
  command: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; maxBuffer?: number },
  timeoutKind: DomainHandlerTimeoutKind = 'dispatch',
): DomainHandlerProcessResult {
  if (!command[0]) {
    throw new FrameworkContractError('contract_shape_invalid', 'Family runtime domain-handler command is empty.', {
      command,
    });
  }
  const timeoutMs = resolveFamilyRuntimeDomainHandlerTimeoutMs(timeoutKind);
  const baseEnv = options.env ?? process.env;
  const checkoutCurrentnessPreflight = preflightDomainHandlerCheckoutCurrentness(command, options.cwd, baseEnv);
  if (checkoutCurrentnessPreflight.status === 'blocked') {
    return failClosedDomainHandlerResult(timeoutMs, checkoutCurrentnessPreflight);
  }
  const result = spawnDomainHandlerCommand(command, {
    ...options,
    env: buildManagedShellEnvWithUvCacheRecovery(options.cwd, baseEnv),
  }, timeoutMs);
  const timedOut = errorCode(result.error) === 'ETIMEDOUT';
  const exitCode = resultExitCode(result, timedOut);
  const retryTrigger = freshManagedRootRetryTrigger(result, exitCode);
  if (!retryTrigger) {
    return normalizeDomainHandlerResult(result, timeoutMs, checkoutCurrentnessPreflight);
  }

  const retryTmpRoot = buildManagedShellRecoveryTmpRoot(options.cwd, baseEnv);
  fs.mkdirSync(retryTmpRoot, { recursive: true });
  const retry = spawnDomainHandlerCommand(command, {
    ...options,
    env: {
      ...baseEnv,
      OPL_DOMAIN_COMMAND_TMP_ROOT: retryTmpRoot,
    },
  }, timeoutMs);
  const retryExitCode = resultExitCode(retry, errorCode(retry.error) === 'ETIMEDOUT');
  const firstErrorExcerpt = shortExcerpt(resultText(result));
  if (retryExitCode === 0) {
    recordManagedShellUvCacheRecovery(options.cwd, baseEnv, {
      triggerKind: retryTrigger,
      recoveryTmpRoot: retryTmpRoot,
      firstExitCode: exitCode,
      retryExitCode,
      firstErrorExcerpt,
    });
  }
  return normalizeDomainHandlerResult(retry, timeoutMs, checkoutCurrentnessPreflight, {
    trigger_kind: retryTrigger,
    first_exit_code: exitCode,
    retry_exit_code: retryExitCode,
    retry_tmp_root: retryTmpRoot,
    first_error_excerpt: firstErrorExcerpt,
  });
}

export function runReadOnlyFamilyRuntimeDomainHandlerCommand(
  command: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; maxBuffer?: number },
): DomainHandlerProcessResult {
  if (!command[0]) {
    throw new FrameworkContractError('contract_shape_invalid', 'Family runtime domain-handler command is empty.', {
      command,
    });
  }
  return normalizeDomainHandlerResult(
    spawnDomainHandlerCommand(command, options, READ_ONLY_DOMAIN_HANDLER_TIMEOUT_MS),
    READ_ONLY_DOMAIN_HANDLER_TIMEOUT_MS,
  );
}

export function domainHandlerResultErrorMessage(result: DomainHandlerProcessResult, label: string) {
  if (result.timed_out) {
    return `${label} timed out after ${result.domain_handler_timeout_ms}ms.`;
  }
  const structuredError = parseStructuredDomainHandlerError(result.stdout, label);
  return result.error?.message
    || structuredError
    || result.stderr
    || result.stdout
    || `${label} exited ${result.exit_code}.`;
}
