import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  CLI_COMMAND_SURFACE,
  CLI_COMMAND_SURFACE_COMMAND_COUNT,
  CLI_COMMAND_SURFACE_VERSION,
  type CliCommandSurfaceMetadata,
} from '../command-surface-manifest.ts';
import {
  buildCommandHelp,
  buildRootHelp,
} from './help-output.ts';
import type { CommandSpec, ParsedCliInput } from './types.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';

type CommandSpecs = Record<string, CommandSpec>;

type ExecutableCommandLoader = () => Promise<CommandSpecs>;

function materializeMetadata(entry: CliCommandSurfaceMetadata): Omit<CommandSpec, 'handler'> {
  return {
    usage: entry.usage,
    summary: entry.summary,
    examples: [...entry.examples],
    ...(entry.group ? { group: entry.group } : {}),
    ...(entry.help_surface ? { help_surface: entry.help_surface } : {}),
    ...(entry.subcommands
      ? { subcommands: entry.subcommands.map((subcommand) => ({ ...subcommand })) }
      : {}),
    ...(entry.registry
      ? { registry: entry.registry as CommandSpec['registry'] }
      : {}),
  };
}

function buildMetadataHelp(commandSpecs: CommandSpecs, args: string[]) {
  if (args.length === 0) {
    return buildRootHelp(commandSpecs);
  }

  const helpTarget = args.join(' ');
  const helpSpec = commandSpecs[helpTarget];
  if (helpSpec) {
    return buildCommandHelp(helpTarget, helpSpec);
  }

  const prefixMatches = Object.entries(commandSpecs)
    .filter(([command]) => command.startsWith(`${helpTarget} `));
  if (prefixMatches.length > 0) {
    return buildCommandHelp(helpTarget, {
      usage: `opl ${helpTarget} <command>`,
      summary: `Show commands under the ${helpTarget} namespace.`,
      examples: prefixMatches.slice(0, 5).map(([command]) => `opl ${command} --json`),
      group: helpTarget,
      handler: () => null,
      subcommands: prefixMatches.map(([command, spec]) => ({
        command,
        usage: spec.usage,
        summary: spec.summary,
      })),
    });
  }

  throw new FrameworkContractError('unknown_command', `Unknown command: ${helpTarget}.`, {
    command: helpTarget,
    commands: Object.keys(commandSpecs),
    usage: 'opl help',
  });
}

function buildExecutableCommandLoader(
  parsedInput: ParsedCliInput,
  loadContracts: () => Promise<FrameworkContracts>,
): ExecutableCommandLoader {
  let loaded: Promise<CommandSpecs> | undefined;
  return () => {
    loaded ??= (async () => {
      // The executable builders remain the compatibility implementation. Importing
      // them here keeps all domain/runtime modules out of help and unknown-command paths.
      const contracts = await loadContracts();
      const getContracts = () => contracts;
      const privateModule = await import('../cases/private-command-specs.ts');
      const internalSpecs = privateModule.buildInternalCommandSpecs(parsedInput, getContracts);
      const publicModule = await import('../cases/public-command-specs.ts');
      return publicModule.buildPublicCommandSpecs(internalSpecs, getContracts);
    })();
    return loaded;
  };
}

function buildAppCommandLoader(
  loadContracts: () => Promise<FrameworkContracts>,
): ExecutableCommandLoader {
  let loaded: Promise<CommandSpecs> | undefined;
  return () => {
    loaded ??= (async () => {
      const contracts = await loadContracts();
      const appModule = await import('../cases/app-public-command-specs.ts');
      return appModule.buildPublicAppCommandSpecs(() => contracts);
    })();
    return loaded;
  };
}

export function buildLazyCommandSpecs(
  parsedInput: ParsedCliInput,
  loadContracts: () => Promise<FrameworkContracts>,
): CommandSpecs {
  let contracts: Promise<FrameworkContracts> | undefined;
  const loadContractsOnce = () => {
    contracts ??= loadContracts();
    return contracts;
  };
  const loadExecutableSpecs = buildExecutableCommandLoader(parsedInput, loadContractsOnce);
  const loadAppSpecs = buildAppCommandLoader(loadContractsOnce);
  const commandSpecs: CommandSpecs = {};

  for (const [command, entry] of Object.entries(CLI_COMMAND_SURFACE)) {
    const metadata = materializeMetadata(entry);
    commandSpecs[command] = {
      ...metadata,
      handler: async (args) => {
        if (command === 'help') {
          return buildMetadataHelp(commandSpecs, args);
        }

        const executableSpecs = command === 'app state'
          || command === 'app action execute'
          || command === 'app view read'
          ? await loadAppSpecs()
          : await loadExecutableSpecs();
        const executableSpec = executableSpecs[command];
        if (!executableSpec) {
          throw new FrameworkContractError(
            'unknown_command',
            `Command metadata is not backed by an executable handler: ${command}.`,
            {
              command,
              command_count: CLI_COMMAND_SURFACE_COMMAND_COUNT,
              registry_version: CLI_COMMAND_SURFACE_VERSION,
            },
          );
        }
        return executableSpec.handler(args);
      },
    };
  }

  return commandSpecs;
}

export { CLI_COMMAND_SURFACE_COMMAND_COUNT, CLI_COMMAND_SURFACE_VERSION };
