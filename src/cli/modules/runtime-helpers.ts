import { GatewayContractError } from '../../contracts.ts';
import { runCodexPassthrough } from '../../codex.ts';
import type { CommandSpec, ProductEntryExecutor } from './types.ts';

function printJson(payload: unknown, stream: NodeJS.WriteStream = process.stdout) {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function buildUsageError(
  message: string,
  spec?: Pick<CommandSpec, 'usage' | 'examples'>,
  details: Record<string, unknown> = {},
): GatewayContractError {
  return new GatewayContractError('cli_usage_error', message, {
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
  if (value !== 'codex' && value !== 'hermes') {
    throw buildUsageError('Option --executor requires codex or hermes.', spec, {
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

function hasExplicitHermesExecutor(args: string[]) {
  const executorIndex = args.indexOf('--executor');
  return executorIndex >= 0 && args[executorIndex + 1] === 'hermes';
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
  hasExplicitHermesExecutor,
  parseExecutorValue,
  printJson,
  runCodexPassthroughHandled,
  stripExplicitCodexExecutor,
};
