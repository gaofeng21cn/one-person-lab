import { GatewayContractError, loadGatewayContracts } from '../contracts.ts';
import { buildCommandHelp, buildRetiredCommandError, buildRootHelp, buildUsageError, formatHumanCommandHelp, formatHumanRootHelp, looksLikeNaturalLanguage, parseCliInput, printJson, resolveCommandSpec, runCodexPassthroughHandled, CODEX_COMMAND_HELP_PASSTHROUGH, NON_PASSTHROUGH_COMMAND_PREFIXES } from './modules/support.ts';
import { buildInternalCommandSpecs } from './cases/private-command-specs.ts';
import { buildPublicCommandSpecs } from './cases/public-command-specs.ts';

export async function main() {
  const parsedInput = parseCliInput(process.argv.slice(2));
  const shouldPrintHumanHelp = parsedInput.textOutput || (process.stdout.isTTY && !parsedInput.jsonOutput);
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
      const payload = buildRootHelp(publicCommandSpecs);
      if (shouldPrintHumanHelp) {
        process.stdout.write(formatHumanRootHelp(payload));
      } else {
        printJson(payload);
      }
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
      && !NON_PASSTHROUGH_COMMAND_PREFIXES.has(command)
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
      const payload = await spec.handler(args.filter((arg) => arg !== '--help' && arg !== '--json' && arg !== '--text'));
      if (shouldPrintHumanHelp && typeof payload === 'object' && payload !== null && 'help' in payload) {
        const helpPayload = payload as ReturnType<typeof buildRootHelp> | ReturnType<typeof buildCommandHelp>;
        if (helpPayload.help.command) {
          process.stdout.write(formatHumanCommandHelp(helpPayload as ReturnType<typeof buildCommandHelp>));
        } else {
          process.stdout.write(formatHumanRootHelp(helpPayload as ReturnType<typeof buildRootHelp>));
        }
      } else {
        printJson(payload);
      }
      return;
    }

    const payload = buildCommandHelp(command, spec);
    if (shouldPrintHumanHelp) {
      process.stdout.write(formatHumanCommandHelp(payload));
    } else {
      printJson(payload);
    }
    return;
  }

  const result = await spec.handler(args);
  if (typeof result === 'object' && result !== null && '__handled' in result) {
    return;
  }

  if (command === 'help' && shouldPrintHumanHelp && typeof result === 'object' && result !== null && 'help' in result) {
    const helpPayload = result as ReturnType<typeof buildRootHelp> | ReturnType<typeof buildCommandHelp>;
    if (helpPayload.help.command) {
      process.stdout.write(formatHumanCommandHelp(helpPayload as ReturnType<typeof buildCommandHelp>));
    } else {
      process.stdout.write(formatHumanRootHelp(helpPayload as ReturnType<typeof buildRootHelp>));
    }
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
