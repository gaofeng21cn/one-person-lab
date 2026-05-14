import { FrameworkContractError } from '../contracts.ts';

export function normalizeCodexOutput(stdout: string, stderr = '') {
  return [stdout, stderr]
    .filter((chunk) => chunk.trim().length > 0)
    .join('\n')
    .trim();
}

export function assertCodexSuccess(
  exitCode: number,
  message: string,
  details: Record<string, unknown>,
) {
  if (exitCode === 0) {
    return;
  }

  throw new FrameworkContractError(
    'codex_command_failed',
    message,
    details,
    exitCode,
  );
}
