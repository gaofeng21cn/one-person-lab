import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import {
  buildCommandHelp,
  buildRootHelp,
  formatHumanCommandHelp,
  formatHumanRootHelp,
  looksLikeNaturalLanguage,
  parseCliInput,
  resolveCommandSpec,
  CODEX_COMMAND_HELP_PASSTHROUGH,
  NON_PASSTHROUGH_COMMAND_PREFIXES,
} from './modules/help-output.ts';
import { buildUsageError } from './modules/cli-errors.ts';
import { printJson } from './modules/cli-output.ts';
import { buildLazyCommandSpecs } from './modules/lazy-command-registry.ts';

async function runCodexPassthroughHandled(args: string[]) {
  const runtimeHelpers = await import('./modules/runtime-helpers.ts');
  return runtimeHelpers.runCodexPassthroughHandled(args);
}

function unknownCommandDetails(command: string | undefined, commandSpecs: Record<string, unknown>) {
  return {
    command,
    command_count: Object.keys(commandSpecs).length,
    usage: 'opl help',
    help_command: 'opl help',
  };
}

const RETIRED_COMMAND_REPLACEMENTS = [
  {
    tokens: ['modules'],
    command: 'opl modules',
    replacement: 'opl connect modules',
    usage: 'opl connect modules',
    examples: ['opl connect modules --json'],
  },
  {
    tokens: ['packages', 'manifest'],
    command: 'opl packages manifest',
    replacement: 'opl connect packages manifest',
    usage: 'opl connect packages manifest',
    examples: ['opl connect packages manifest --json'],
  },
  {
    tokens: ['skill', 'list'],
    command: 'opl skill list',
    replacement: 'opl connect skills',
    usage: 'opl connect skills [--domain <domain_id>]',
    examples: ['opl connect skills --json', 'opl connect skills --domain medautoscience --json'],
  },
  {
    tokens: ['skill', 'sync'],
    command: 'opl skill sync',
    replacement: 'opl connect sync-skills',
    usage: 'opl connect sync-skills [--domain <domain_id>] [--scope <codex|workspace|quest>] [--target-workspace <path>] [--target-quest <path>] [--target-root <path>] [--home <home_path>] [--quiet]',
    examples: ['opl connect sync-skills --json', 'opl connect sync-skills --domain medautoscience --json'],
  },
  {
    tokens: ['module', 'install'],
    command: 'opl module install',
    replacement: 'opl connect install',
    usage: 'opl connect install --module <module_id>',
    examples: ['opl connect install --module medautoscience'],
  },
  {
    tokens: ['module', 'update'],
    command: 'opl module update',
    replacement: 'opl connect update',
    usage: 'opl connect update --module <module_id>',
    examples: ['opl connect update --module medautoscience'],
  },
  {
    tokens: ['module', 'reinstall'],
    command: 'opl module reinstall',
    replacement: 'opl connect reinstall',
    usage: 'opl connect reinstall --module <module_id>',
    examples: ['opl connect reinstall --module medautoscience'],
  },
  {
    tokens: ['module', 'remove'],
    command: 'opl module remove',
    replacement: 'opl connect remove',
    usage: 'opl connect remove --module <module_id>',
    examples: ['opl connect remove --module medautoscience'],
  },
  {
    tokens: ['module', 'exec'],
    command: 'opl module exec',
    replacement: 'opl connect exec',
    usage: 'opl connect exec --module <module_id> -- <domain_cli_args...>',
    examples: ['opl connect exec --module medautoscience -- doctor entry-modes'],
  },
  {
    tokens: ['module', 'sync'],
    command: 'opl module sync',
    replacement: 'opl connect reconcile-modules',
    usage: 'opl connect reconcile-modules',
    examples: ['opl connect reconcile-modules --json'],
  },
  {
    tokens: ['module', 'reconcile'],
    command: 'opl module reconcile',
    replacement: 'opl connect reconcile-modules',
    usage: 'opl connect reconcile-modules',
    examples: ['opl connect reconcile-modules --json'],
  },
  {
    tokens: ['framework', 'production-closeout'],
    command: 'opl framework production-closeout',
    replacement: 'opl framework operating-maturity --family-defaults --json',
    usage: 'opl framework operating-maturity --family-defaults',
    examples: [
      'opl framework operating-maturity --family-defaults --json',
      'opl framework readiness --family-defaults --json',
    ],
  },
] as const;

function resolveRetiredCommand(tokens: string[]) {
  return RETIRED_COMMAND_REPLACEMENTS.find((entry) =>
    entry.tokens.every((token, index) => tokens[index] === token),
  );
}

export async function main() {
  const parsedInput = parseCliInput(process.argv.slice(2));
  const shouldPrintHumanHelp = parsedInput.textOutput || (process.stdout.isTTY && !parsedInput.jsonOutput);
  let contractsPromise: Promise<FrameworkContracts> | undefined;
  const loadContracts = async () => {
    contractsPromise ??= import('../../modules/charter/contracts.ts')
      .then(({ loadFrameworkContracts }) => loadFrameworkContracts(parsedInput.loadOptions));
    return contractsPromise;
  };

  const publicCommandSpecs = buildLazyCommandSpecs(parsedInput, loadContracts);
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

    await runCodexPassthroughHandled([]);
    return;
  }

  const resolved = resolveCommandSpec(inputTokens, publicCommandSpecs);
  if (!resolved) {
    const [command, ...args] = inputTokens;
    const retired = resolveRetiredCommand(inputTokens);
    if (retired) {
      throw buildUsageError(
        `Command "${retired.command}" has been retired. Use "${retired.replacement}" instead.`,
        {
          usage: retired.usage,
          examples: [...retired.examples],
        },
        {
          command: retired.command,
          replacement: retired.replacement,
          retired: true,
        },
      );
    }

    if (command?.startsWith('@')) {
      throw new FrameworkContractError('unknown_command', `Unknown command: ${command}.`, {
        ...unknownCommandDetails(command, publicCommandSpecs),
      });
    }

    if (
      !parsedInput.helpRequested
      && command
      && !NON_PASSTHROUGH_COMMAND_PREFIXES.has(command)
      && looksLikeNaturalLanguage(command, args)
    ) {
      await runCodexPassthroughHandled(inputTokens);
      return;
    }

    throw new FrameworkContractError('unknown_command', `Unknown command: ${command}.`, {
      ...unknownCommandDetails(command, publicCommandSpecs),
    });
  }

  const { command, spec, args } = resolved;
  const passthroughIndex = args.indexOf('--');
  const scopedHelpRequested = args.some((arg, index) =>
    arg === '--help'
    && (passthroughIndex < 0 || index < passthroughIndex)
  );
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
      scopedHelpRequested
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
  if (error instanceof FrameworkContractError) {
    printJson(error.toJSON(), process.stderr);
    process.exitCode = error.exitCode;
    return;
  }

  const unexpected =
    error instanceof Error
      ? error.message
      : 'Unexpected non-error failure while running the OPL framework CLI.';
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
