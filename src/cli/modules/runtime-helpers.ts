import { FrameworkContractError } from '../../contracts.ts';
import { runCodexPassthrough } from '../../codex.ts';
import type { CommandSpec, ProductEntryExecutor } from './types.ts';

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

function buildRetiredCommandError(
  command: string,
  replacement: string,
  spec?: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  return buildUsageError(
    `Command "${command}" has been retired. ${replacement}`,
    spec,
    {
      command,
      retired: true,
      replacement,
    },
  );
}

function parseExecutorValue(
  option: string,
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): ProductEntryExecutor {
  if (value !== 'codex') {
    throw buildUsageError('Option --executor only accepts codex.', spec, {
      option,
      value,
    });
  }

  return value;
}

function runCodexPassthroughHandled(args: string[]) {
  const result = runCodexPassthrough(args);
  process.exitCode = result.exitCode;
  return {
    __handled: true as const,
  };
}

function stripExplicitCodexExecutor(args: string[]) {
  const passthroughArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--executor' && args[index + 1] === 'codex') {
      index += 1;
      continue;
    }

    passthroughArgs.push(args[index]);
  }

  return passthroughArgs;
}

export {
  buildRetiredCommandError,
  buildUsageError,
  parseExecutorValue,
  printJson,
  runCodexPassthroughHandled,
  stripExplicitCodexExecutor,
};
