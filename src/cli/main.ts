import { GatewayContractError, loadGatewayContracts } from '../contracts.ts';
import { buildCommandHelp, buildRetiredCommandError, buildRootHelp, buildUsageError, looksLikeNaturalLanguage, parseCliInput, printJson, resolveCommandSpec, runCodexPassthroughHandled, CODEX_COMMAND_HELP_PASSTHROUGH, RETIRED_COMMAND_PREFIXES } from './modules/support.ts';
import { buildInternalCommandSpecs } from './cases/private-command-specs.ts';
import { buildPublicCommandSpecs } from './cases/public-command-specs.ts';

export async function main() {
  const parsedInput = parseCliInput(process.argv.slice(2));
  let cachedContracts = null;
  const getContracts = () => {
    cachedContracts ??= loadGatewayContracts(parsedInput.loadOptions);
    return cachedContracts;
  };

  const commandSpecs = buildInternalCommandSpecs(parsedInput, getContracts);
  const publicCommandSpecs = buildPublicCommandSpecs(commandSpecs, getContracts);
  const inputTokens = parsedInput.command ? [parsedInput.command, ...parsedInput.args] : [];

  if (inputTokens.length === 0) {
    if (parsedInput.helpRequested) {
      printJson(buildRootHelp(publicCommandSpecs));
      return;
    }

    runCodexPassthroughHandled([]);
    return;
  }

  const resolved = resolveCommandSpec(inputTokens, publicCommandSpecs);
  if (!resolved) {
    const [command, ...args] = inputTokens;
    if (!parsedInput.helpRequested && command && command.startsWith('@')) {
      throw buildRetiredCommandError(
        `opl ${command}`,
        'Use `opl skill sync` to register the family domain skill packs, then continue through `opl`, `opl exec`, or `opl resume`.',
      );
    }

    if (
      !parsedInput.helpRequested
      && command
      && !RETIRED_COMMAND_PREFIXES.has(command)
      && looksLikeNaturalLanguage(command, args)
    ) {
      runCodexPassthroughHandled(inputTokens);
      return;
    }

    throw new GatewayContractError('unknown_command', `Unknown command: ${command}.`, {
      command,
      commands: Object.keys(publicCommandSpecs),
      usage: 'opl help',
    });
  }

  const { command, spec, args } = resolved;
  if (command !== 'help' && args.length === 1 && args[0] === 'help') {
    throw buildUsageError(
      `Use "opl ${command} --help" for command-scoped help.`,
      spec,
      {
        token: 'help',
        help_usage: `opl ${command} --help`,
      },
    );
  }

  if (
    parsedInput.helpRequested
    || (
      args.length === 1
      && args[0] === '--help'
      && !CODEX_COMMAND_HELP_PASSTHROUGH.has(command)
    )
  ) {
    if (command === 'help') {
      printJson(await spec.handler(args.filter((arg) => arg !== '--help')));
      return;
    }

    printJson(buildCommandHelp(command, spec));
    return;
  }

  const result = await spec.handler(args);
  if (typeof result === 'object' && result !== null && '__handled' in result) {
    return;
  }

  printJson(result);
}

export function handleCliMainError(error: unknown) {
  if (error instanceof GatewayContractError) {
    printJson(error.toJSON(), process.stderr);
    process.exitCode = error.exitCode;
    return;
  }

  const unexpected =
    error instanceof Error
      ? error.message
      : 'Unexpected non-error failure while running the OPL gateway CLI.';
  printJson(
    {
      version: 'g2',
      error: {
        code: 'unexpected_error',
        message: unexpected,
        exit_code: 1,
      },
    },
    process.stderr,
  );
  process.exitCode = 1;
}
