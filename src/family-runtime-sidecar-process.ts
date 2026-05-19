import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

import { FrameworkContractError } from './contracts.ts';

const DEFAULT_SIDECAR_TIMEOUT_MS = 30_000;
const DEFAULT_SIDECAR_MAX_BUFFER = 10 * 1024 * 1024;

type SidecarProcessResult = SpawnSyncReturns<string> & {
  exit_code: number;
  timed_out: boolean;
  sidecar_timeout_ms: number;
};

function configuredTimeoutMs() {
  const raw = process.env.OPL_FAMILY_RUNTIME_SIDECAR_TIMEOUT_MS?.trim();
  if (!raw) {
    return DEFAULT_SIDECAR_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'OPL_FAMILY_RUNTIME_SIDECAR_TIMEOUT_MS must be a positive integer.',
      { env: 'OPL_FAMILY_RUNTIME_SIDECAR_TIMEOUT_MS', value: raw },
    );
  }
  return parsed;
}

function errorCode(error: Error | undefined) {
  return error && 'code' in error ? String((error as NodeJS.ErrnoException).code) : null;
}

export function runFamilyRuntimeSidecarCommand(
  command: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; maxBuffer?: number },
): SidecarProcessResult {
  if (!command[0]) {
    throw new FrameworkContractError('contract_shape_invalid', 'Family runtime sidecar command is empty.', {
      command,
    });
  }
  const timeoutMs = configuredTimeoutMs();
  const result = spawnSync(command[0], command.slice(1), {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env ?? process.env,
    maxBuffer: options.maxBuffer ?? DEFAULT_SIDECAR_MAX_BUFFER,
    timeout: timeoutMs,
    killSignal: 'SIGTERM',
  });
  const timedOut = errorCode(result.error) === 'ETIMEDOUT';
  return {
    ...result,
    exit_code: timedOut ? 124 : result.status ?? (result.error ? 127 : 1),
    timed_out: timedOut,
    sidecar_timeout_ms: timeoutMs,
  };
}

export function sidecarResultErrorMessage(result: SidecarProcessResult, label: string) {
  if (result.timed_out) {
    return `${label} timed out after ${result.sidecar_timeout_ms}ms.`;
  }
  return result.error?.message
    || result.stderr
    || result.stdout
    || `${label} exited ${result.exit_code}.`;
}
