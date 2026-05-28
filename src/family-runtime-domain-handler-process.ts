import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

import { FrameworkContractError } from './contracts.ts';
import { buildManagedShellCommandEnv } from './managed-shell-command-env.ts';

const DEFAULT_DOMAIN_HANDLER_TIMEOUT_MS = 30_000;
const DEFAULT_DOMAIN_HANDLER_MAX_BUFFER = 10 * 1024 * 1024;

type DomainHandlerProcessResult = SpawnSyncReturns<string> & {
  exit_code: number;
  timed_out: boolean;
  domain_handler_timeout_ms: number;
};

function configuredTimeoutMs() {
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

export function runFamilyRuntimeDomainHandlerCommand(
  command: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; maxBuffer?: number },
): DomainHandlerProcessResult {
  if (!command[0]) {
    throw new FrameworkContractError('contract_shape_invalid', 'Family runtime domain-handler command is empty.', {
      command,
    });
  }
  const timeoutMs = configuredTimeoutMs();
  const result = spawnSync(command[0], command.slice(1), {
    cwd: options.cwd,
    encoding: 'utf8',
    env: buildManagedShellCommandEnv(options.cwd, options.env ?? process.env),
    maxBuffer: options.maxBuffer ?? DEFAULT_DOMAIN_HANDLER_MAX_BUFFER,
    timeout: timeoutMs,
    killSignal: 'SIGTERM',
  });
  const timedOut = errorCode(result.error) === 'ETIMEDOUT';
  return {
    ...result,
    exit_code: timedOut ? 124 : result.status ?? (result.error ? 127 : 1),
    timed_out: timedOut,
    domain_handler_timeout_ms: timeoutMs,
  };
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
