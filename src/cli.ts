#!/usr/bin/env node

import {
  GatewayContractError,
  findDomainOrThrow,
  findSurfaceOrThrow,
  findWorkstreamOrThrow,
  loadGatewayContracts,
  validateGatewayContracts,
} from './contracts.ts';
import { explainDomainBoundary, resolveRequestSurface } from './resolver.ts';
import type {
  GatewayContracts,
  GatewayContractsLoadOptions,
  ResolveRequestInput,
} from './types.ts';

type CommandHandler = (args: string[]) => unknown;

type CommandSpec = {
  usage: string;
  summary: string;
  examples: string[];
  handler: CommandHandler;
};

type ParsedCliInput = {
  helpRequested: boolean;
  command: string | null;
  args: string[];
  loadOptions?: GatewayContractsLoadOptions;
};

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

function parseKeyValueArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): ResolveRequestInput {
  const parsed: Partial<Record<'intent' | 'target' | 'goal' | 'preferred-family' | 'request-kind', string>> =
    {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (!token.startsWith('--')) {
      throw buildUsageError(`Unexpected positional argument: ${token}.`, spec, {
        token,
      });
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw buildUsageError(`Missing value for option: ${token}.`, spec, {
        option: token,
      });
    }

    parsed[token.slice(2) as keyof typeof parsed] = value;
    index += 1;
  }

  if (!parsed.intent || !parsed.target || !parsed.goal) {
    throw buildUsageError(
      'resolve-request-surface and explain-domain-boundary require --intent, --target, and --goal.',
      spec,
      { required: ['--intent', '--target', '--goal'] },
    );
  }

  return {
    intent: parsed.intent,
    target: parsed.target,
    goal: parsed.goal,
    preferredFamily: parsed['preferred-family'],
    requestKind: parsed['request-kind'],
  };
}

function buildRootHelp(commands: Record<string, CommandSpec>) {
  return {
    version: 'g2',
    help: {
      command: null,
      usage: 'opl <command> [args]',
      global_options: [
        {
          option: '--contracts-dir <path>',
          summary:
            'Use an explicit OPL contract root. When omitted, the CLI resolves from cwd or cwd/contracts/opl-gateway.',
        },
      ],
      commands: Object.entries(commands).map(([command, spec]) => ({
        command,
        usage: spec.usage,
        summary: spec.summary,
        examples: spec.examples,
      })),
      examples: [
        'opl help',
        'opl validate-contracts',
        'opl list-workstreams',
        'opl get-domain redcube',
        'opl resolve-request-surface --intent presentation_delivery --target deliverable --goal "Prepare a defense-ready slide deck."',
      ],
    },
  };
}

function buildCommandHelp(command: string, spec: CommandSpec) {
  return {
    version: 'g2',
    help: {
      command,
      usage: spec.usage,
      summary: spec.summary,
      examples: spec.examples,
    },
  };
}

function parseCliInput(argv: string[]): ParsedCliInput {
  const args = [...argv];
  const loadOptions: GatewayContractsLoadOptions = {};
  let helpRequested = false;

  while (args[0]?.startsWith('--')) {
    const token = args[0];

    if (token === '--help') {
      helpRequested = true;
      args.shift();
      continue;
    }

    if (token === '--contracts-dir') {
      args.shift();
      const contractsDir = args.shift();

      if (!contractsDir || contractsDir.startsWith('--')) {
        throw buildUsageError(
          'Global option --contracts-dir requires an explicit contract root path.',
          {
            usage: 'opl [--contracts-dir <path>] <command> [args]',
            examples: [
              'opl --contracts-dir /path/to/contracts/opl-gateway validate-contracts',
              'opl --contracts-dir /path/to/contracts/opl-gateway get-domain redcube',
            ],
          },
          { option: '--contracts-dir' },
        );
      }

      loadOptions.contractsDir = contractsDir;
      loadOptions.source = 'cli_flag';
      continue;
    }

    throw buildUsageError(
      `Unknown global option: ${token}.`,
      {
        usage: 'opl [--contracts-dir <path>] <command> [args]',
        examples: ['opl help', 'opl --contracts-dir /path/to/contracts/opl-gateway validate-contracts'],
      },
      { option: token },
    );
  }

  return {
    helpRequested,
    command: args.shift() ?? null,
    args,
    loadOptions: loadOptions.contractsDir ? loadOptions : undefined,
  };
}

function main() {
  const parsedInput = parseCliInput(process.argv.slice(2));
  let cachedContracts: GatewayContracts | null = null;
  const getContracts = () => {
    cachedContracts ??= loadGatewayContracts(parsedInput.loadOptions);
    return cachedContracts;
  };

  const commandSpecs: Record<string, CommandSpec> = {
    help: {
      usage: 'opl help [command]',
      summary: 'Show the top-level command surface or command-scoped runnable examples.',
      examples: ['opl help', 'opl help get-domain'],
      handler: (args) => {
        const [helpTarget, ...extraArgs] = args;
        if (extraArgs.length > 0) {
          throw buildUsageError(
            'help accepts at most one optional command name.',
            commandSpecs.help,
            { command: helpTarget },
          );
        }

        if (!helpTarget) {
          return buildRootHelp(commandSpecs);
        }

        const helpSpec = commandSpecs[helpTarget];
        if (!helpSpec) {
          throw new GatewayContractError('unknown_command', `Unknown command: ${helpTarget}.`, {
            command: helpTarget,
            commands: Object.keys(commandSpecs),
            usage: 'opl help',
          });
        }

        return buildCommandHelp(helpTarget, helpSpec);
      },
    },
    'list-workstreams': {
      usage: 'opl list-workstreams',
      summary: 'List admitted OPL workstream summaries.',
      examples: ['opl list-workstreams'],
      handler: () => {
        const contracts = getContracts();
        return {
          version: 'g2',
          workstreams: contracts.workstreams.workstreams.map((workstream) => ({
            workstream_id: workstream.workstream_id,
            label: workstream.label,
            status: workstream.status,
            domain_id: workstream.domain_id,
          })),
        };
      },
    },
    'get-workstream': {
      usage: 'opl get-workstream <workstream_id>',
      summary: 'Show the full registered meaning for one workstream.',
      examples: ['opl get-workstream research_ops', 'opl get-workstream presentation_ops'],
      handler: (args) => {
        const [workstreamId] = args;
        if (!workstreamId) {
          throw buildUsageError('get-workstream requires a workstream id.', commandSpecs['get-workstream'], {
            required: ['workstream_id'],
          });
        }

        return {
          version: 'g2',
          workstream: findWorkstreamOrThrow(getContracts(), workstreamId),
        };
      },
    },
    'list-domains': {
      usage: 'opl list-domains',
      summary: 'List admitted domain gateway summaries.',
      examples: ['opl list-domains'],
      handler: () => {
        const contracts = getContracts();
        return {
          version: 'g2',
          domains: contracts.domains.domains.map((domain) => ({
            domain_id: domain.domain_id,
            gateway_surface: domain.gateway_surface,
            owned_workstreams: domain.owned_workstreams,
          })),
        };
      },
    },
    'get-domain': {
      usage: 'opl get-domain <domain_id>',
      summary: 'Show the full registered meaning for one domain gateway.',
      examples: ['opl get-domain medautoscience', 'opl get-domain redcube'],
      handler: (args) => {
        const [domainId] = args;
        if (!domainId) {
          throw buildUsageError('get-domain requires a domain id.', commandSpecs['get-domain'], {
            required: ['domain_id'],
          });
        }

        return {
          version: 'g2',
          domain: findDomainOrThrow(getContracts(), domainId),
        };
      },
    },
    'list-surfaces': {
      usage: 'opl list-surfaces',
      summary: 'List public gateway surface summaries.',
      examples: ['opl list-surfaces'],
      handler: () => {
        const contracts = getContracts();
        return {
          version: 'g2',
          surfaces: contracts.publicSurfaceIndex.surfaces.map((surface) => ({
            surface_id: surface.surface_id,
            category_id: surface.category_id,
            surface_kind: surface.surface_kind,
            owner_scope: surface.owner_scope,
          })),
        };
      },
    },
    'get-surface': {
      usage: 'opl get-surface <surface_id>',
      summary: 'Show the full registered meaning for one public surface.',
      examples: ['opl get-surface opl_read_only_discovery_gateway'],
      handler: (args) => {
        const [surfaceId] = args;
        if (!surfaceId) {
          throw buildUsageError('get-surface requires a surface id.', commandSpecs['get-surface'], {
            required: ['surface_id'],
          });
        }

        return {
          version: 'g2',
          surface: findSurfaceOrThrow(getContracts(), surfaceId),
        };
      },
    },
    'validate-contracts': {
      usage: 'opl validate-contracts',
      summary: 'Validate the required OPL gateway contract set and emit a machine-readable summary.',
      examples: ['opl validate-contracts'],
      handler: () => ({
        version: 'g2',
        validation: validateGatewayContracts(parsedInput.loadOptions),
      }),
    },
    'resolve-request-surface': {
      usage: 'opl resolve-request-surface --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      summary: 'Resolve a top-level request to an admitted workstream, domain boundary, or ambiguity envelope.',
      examples: [
        'opl resolve-request-surface --intent presentation_delivery --target deliverable --goal "Prepare a defense-ready slide deck."',
      ],
      handler: (args) => ({
        version: 'g2',
        resolution: resolveRequestSurface(
          parseKeyValueArgs(args, commandSpecs['resolve-request-surface']),
          getContracts(),
        ),
      }),
    },
    'explain-domain-boundary': {
      usage: 'opl explain-domain-boundary --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      summary: 'Explain why a request routes to a domain, stays under definition, or stops at a family boundary.',
      examples: [
        'opl explain-domain-boundary --intent create --target deliverable --goal "Grant proposal reviewer simulation and revision planning."',
      ],
      handler: (args) => ({
        version: 'g2',
        boundary_explanation: explainDomainBoundary(
          parseKeyValueArgs(args, commandSpecs['explain-domain-boundary']),
          getContracts(),
        ),
      }),
    },
  };

  const { command, args, helpRequested } = parsedInput;

  if (!command) {
    if (helpRequested) {
      printJson(buildRootHelp(commandSpecs));
      return;
    }

    throw buildUsageError('A command is required.', {
      usage: 'opl [--contracts-dir <path>] <command> [args]',
      examples: [
        'opl help',
        'opl validate-contracts',
        'opl --contracts-dir /path/to/contracts/opl-gateway validate-contracts',
      ],
    }, {
      commands: Object.keys(commandSpecs),
    });
  }

  const spec = commandSpecs[command];
  if (!spec) {
    throw new GatewayContractError('unknown_command', `Unknown command: ${command}.`, {
      command,
      commands: Object.keys(commandSpecs),
      usage: 'opl help',
    });
  }

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

  if (helpRequested || (args.length === 1 && args[0] === '--help')) {
    if (command === 'help') {
      printJson(spec.handler(args));
      return;
    }

    printJson(buildCommandHelp(command, spec));
    return;
  }

  printJson(spec.handler(args));
}

try {
  main();
} catch (error) {
  if (error instanceof GatewayContractError) {
    printJson(error.toJSON(), process.stderr);
    process.exitCode = error.exitCode;
  } else {
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
}
