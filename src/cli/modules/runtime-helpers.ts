import { FrameworkContractError } from '../../contracts.ts';
import { runCodexPassthrough } from '../../codex.ts';
import type { CommandSpec } from './types.ts';

function printJson(payload: unknown, stream: NodeJS.WriteStream = process.stdout) {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function buildUsageError(
  message: string,
  spec?: Pick<CommandSpec, 'usage' | 'examples'>,
  details: Record<string, unknown> = {},
): FrameworkContractError {
  return new FrameworkContractError('cli_usage_error', message, {
    ...details,
    ...(spec ? { usage: spec.usage, examples: spec.examples } : {}),
  });
}

function runCodexPassthroughHandled(args: string[]) {
  const result = runCodexPassthrough(args);
  process.exitCode = result.exitCode;
  return {
    __handled: true as const,
  };
}

export {
  buildUsageError,
  printJson,
  runCodexPassthroughHandled,
};
