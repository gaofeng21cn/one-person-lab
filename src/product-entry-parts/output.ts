import { GatewayContractError } from '../contracts.ts';

export function normalizeHermesOutput(stdout: string, stderr = '') {
  return [stdout, stderr]
    .filter((chunk) => chunk.trim().length > 0)
    .join('\n')
    .trim();
}

export function normalizeCodexOutput(stdout: string, stderr = '') {
  return [stdout, stderr]
    .filter((chunk) => chunk.trim().length > 0)
    .join('\n')
    .trim();
}

export function assertHermesSuccess(
  exitCode: number,
  message: string,
  details: Record<string, unknown>,
) {
  if (exitCode === 0) {
    return;
  }

  throw new GatewayContractError(
    'hermes_command_failed',
    message,
    details,
    exitCode,
  );
}

export function assertCodexSuccess(
  exitCode: number,
  message: string,
  details: Record<string, unknown>,
) {
  if (exitCode === 0) {
    return;
  }

  throw new GatewayContractError(
    'codex_command_failed',
    message,
    details,
    exitCode,
  );
}
