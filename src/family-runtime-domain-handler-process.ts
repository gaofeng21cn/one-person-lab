import { spawnSync, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';

import { FrameworkContractError } from './contracts.ts';
import {
  buildManagedShellCommandEnv,
  buildManagedShellRecoveryTmpRoot,
} from './managed-shell-command-env.ts';

const DEFAULT_DOMAIN_HANDLER_TIMEOUT_MS = 30_000;
const DEFAULT_DOMAIN_HANDLER_MAX_BUFFER = 10 * 1024 * 1024;

type DomainHandlerProcessResult = SpawnSyncReturns<string> & {
  exit_code: number;
  timed_out: boolean;
  domain_handler_timeout_ms: number;
  recovery?: {
    trigger_kind: 'uv_cache_archive_missing';
    first_exit_code: number;
    retry_exit_code: number;
    retry_tmp_root: string;
    first_error_excerpt: string;
  };
};

export function resolveFamilyRuntimeDomainHandlerTimeoutMs() {
  const raw = process.env.OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_TIMEOUT_MS?.trim();
  if (!raw) {
    return DEFAULT_DOMAIN_HANDLER_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_TIMEOUT_MS must be a positive integer.',
      { env: 'OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_TIMEOUT_MS', value: raw },
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
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const parts = [
      record.reason,
      record.detail,
      record.message,
      record.blocked_reason,
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

function shouldRetryWithFreshUvCache(result: SpawnSyncReturns<string>, exitCode: number) {
  if (exitCode === 0 || errorCode(result.error) === 'ETIMEDOUT') {
    return false;
  }
  const text = resultText(result);
  return /Failed to install:/i.test(text)
    && /archive-v0/i.test(text)
    && /METADATA/i.test(text)
    && /No such file or directory/i.test(text);
}

function normalizeDomainHandlerResult(
  result: SpawnSyncReturns<string>,
  timeoutMs: number,
  recovery?: DomainHandlerProcessResult['recovery'],
): DomainHandlerProcessResult {
  const timedOut = errorCode(result.error) === 'ETIMEDOUT';
  cleanupTimedOutProcessGroup(result, timedOut);
  return {
    ...result,
    exit_code: resultExitCode(result, timedOut),
    timed_out: timedOut,
    domain_handler_timeout_ms: timeoutMs,
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
): DomainHandlerProcessResult {
  if (!command[0]) {
    throw new FrameworkContractError('contract_shape_invalid', 'Family runtime domain-handler command is empty.', {
      command,
    });
  }
  const timeoutMs = resolveFamilyRuntimeDomainHandlerTimeoutMs();
  const result = spawnDomainHandlerCommand(command, options, timeoutMs);
  const timedOut = errorCode(result.error) === 'ETIMEDOUT';
  const exitCode = resultExitCode(result, timedOut);
  if (!shouldRetryWithFreshUvCache(result, exitCode)) {
    return normalizeDomainHandlerResult(result, timeoutMs);
  }

  const retryTmpRoot = buildManagedShellRecoveryTmpRoot(options.cwd, options.env ?? process.env);
  fs.mkdirSync(retryTmpRoot, { recursive: true });
  const retry = spawnDomainHandlerCommand(command, {
    ...options,
    env: {
      ...(options.env ?? process.env),
      OPL_DOMAIN_COMMAND_TMP_ROOT: retryTmpRoot,
    },
  }, timeoutMs);
  return normalizeDomainHandlerResult(retry, timeoutMs, {
    trigger_kind: 'uv_cache_archive_missing',
    first_exit_code: exitCode,
    retry_exit_code: resultExitCode(retry, errorCode(retry.error) === 'ETIMEDOUT'),
    retry_tmp_root: retryTmpRoot,
    first_error_excerpt: shortExcerpt(resultText(result)),
  });
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
