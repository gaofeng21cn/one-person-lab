#!/usr/bin/env node

import {
  GatewayContractError,
  findDomainOrThrow,
  findSurfaceOrThrow,
  findWorkstreamOrThrow,
  loadGatewayContracts,
  validateGatewayContracts,
} from './contracts.ts';
import {
  getFrontDeskServiceStatus,
  installFrontDeskService,
  openFrontDeskService,
  startFrontDeskService,
  stopFrontDeskService,
  uninstallFrontDeskService,
} from './frontdesk-service.ts';
import {
  buildProductEntryDoctor,
  type ProductEntryCliInput,
  runProductEntryAsk,
  runProductEntryChat,
  runProductEntryFrontDesk,
  runProductEntryLogs,
  runProductEntryRepairHermesGateway,
  runProductEntryResume,
  runProductEntrySessions,
} from './product-entry.ts';
import {
  buildFrontDeskDashboard,
  buildFrontDeskManifest,
  buildProjectsOverview,
  buildRuntimeStatus,
  buildWorkspaceStatus,
} from './management.ts';
import { explainDomainBoundary, resolveRequestSurface } from './resolver.ts';
import { attachWebFrontDeskShutdown, startWebFrontDeskServer } from './web-frontdesk.ts';
import type {
  GatewayContracts,
  GatewayContractsLoadOptions,
  ResolveRequestInput,
} from './types.ts';

type CommandHandler = (args: string[]) => unknown | Promise<unknown>;

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

type SessionsCliInput = {
  limit?: number;
  source?: string;
};

type LogsCliInput = {
  logName?: string;
  lines?: number;
  since?: string;
  level?: string;
  component?: string;
  sessionId?: string;
};

type WorkspaceStatusCliInput = {
  workspacePath?: string;
};

type RuntimeStatusCliInput = {
  limit?: number;
};

type DashboardCliInput = {
  workspacePath?: string;
  sessionsLimit?: number;
};

type WebCliInput = {
  host?: string;
  port?: number;
  workspacePath?: string;
  sessionsLimit?: number;
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

function parseProductEntryArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): ProductEntryCliInput {
  let dryRun = false;
  let explicitGoal: string | undefined;
  const positionalGoalParts: string[] = [];
  const parsed: Omit<ProductEntryCliInput, 'goal' | 'dryRun'> = {
    intent: 'create',
    target: 'deliverable',
    skills: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (!token.startsWith('--')) {
      positionalGoalParts.push(token);
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw buildUsageError(`Missing value for option: ${token}.`, spec, {
        option: token,
      });
    }

    switch (token) {
      case '--goal':
        explicitGoal = value;
        break;
      case '--intent':
        parsed.intent = value;
        break;
      case '--target':
        parsed.target = value;
        break;
      case '--preferred-family':
        parsed.preferredFamily = value;
        break;
      case '--request-kind':
        parsed.requestKind = value;
        break;
      case '--model':
        parsed.model = value;
        break;
      case '--provider':
        parsed.provider = value;
        break;
      case '--skills':
        parsed.skills.push(
          ...value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
        );
        break;
      default:
        throw buildUsageError(`Unknown option for product entry: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  if (explicitGoal && positionalGoalParts.length > 0) {
    throw buildUsageError(
      'Use either a positional request or --goal for the product-entry request, not both.',
      spec,
      {
        positional_request: positionalGoalParts.join(' '),
      },
    );
  }

  const goal = (explicitGoal ?? positionalGoalParts.join(' ')).trim();

  if (!goal) {
    throw buildUsageError(
      'ask and chat require a plain-language request, either as positional text or via --goal.',
      spec,
      {
        required: ['<request...> or --goal <text>'],
      },
    );
  }

  return {
    ...parsed,
    goal,
    dryRun,
  };
}

function parsePositiveInteger(
  token: string,
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw buildUsageError(`Option ${token} requires a positive integer.`, spec, {
      option: token,
      value,
    });
  }

  return parsed;
}

function parsePort(
  token: string,
  value: string,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw buildUsageError(`Option ${token} requires an integer port between 0 and 65535.`, spec, {
      option: token,
      value,
    });
  }

  return parsed;
}

function parseResumeArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const [sessionId, ...extraArgs] = args;

  if (!sessionId) {
    throw buildUsageError('resume requires a session id.', spec, {
      required: ['session_id'],
    });
  }

  if (extraArgs.length > 0) {
    throw buildUsageError(`Unexpected positional argument: ${extraArgs[0]}.`, spec, {
      token: extraArgs[0],
    });
  }

  return sessionId;
}

function parseSessionsArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): SessionsCliInput {
  const parsed: SessionsCliInput = {};

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

    switch (token) {
      case '--limit':
        parsed.limit = parsePositiveInteger(token, value, spec);
        break;
      case '--source':
        parsed.source = value;
        break;
      default:
        throw buildUsageError(`Unknown option for sessions: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function parseLogsArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): LogsCliInput {
  const parsed: LogsCliInput = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (!token.startsWith('--')) {
      if (parsed.logName) {
        throw buildUsageError(`Unexpected positional argument: ${token}.`, spec, {
          token,
        });
      }

      parsed.logName = token;
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw buildUsageError(`Missing value for option: ${token}.`, spec, {
        option: token,
      });
    }

    switch (token) {
      case '--lines':
        parsed.lines = parsePositiveInteger(token, value, spec);
        break;
      case '--since':
        parsed.since = value;
        break;
      case '--level':
        parsed.level = value;
        break;
      case '--component':
        parsed.component = value;
        break;
      case '--session':
        parsed.sessionId = value;
        break;
      default:
        throw buildUsageError(`Unknown option for logs: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function parseWorkspaceStatusArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WorkspaceStatusCliInput {
  const parsed: WorkspaceStatusCliInput = {};

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

    switch (token) {
      case '--path':
        parsed.workspacePath = value;
        break;
      default:
        throw buildUsageError(`Unknown option for workspace-status: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function parseRuntimeStatusArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): RuntimeStatusCliInput {
  const parsed: RuntimeStatusCliInput = {};

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

    switch (token) {
      case '--limit':
        parsed.limit = parsePositiveInteger(token, value, spec);
        break;
      default:
        throw buildUsageError(`Unknown option for runtime-status: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function parseDashboardArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): DashboardCliInput {
  const parsed: DashboardCliInput = {};

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

    switch (token) {
      case '--path':
        parsed.workspacePath = value;
        break;
      case '--sessions-limit':
        parsed.sessionsLimit = parsePositiveInteger(token, value, spec);
        break;
      default:
        throw buildUsageError(`Unknown option for dashboard: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function parseWebArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WebCliInput {
  const parsed: WebCliInput = {};

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

    switch (token) {
      case '--host':
        parsed.host = value;
        break;
      case '--port':
        parsed.port = parsePort(token, value, spec);
        break;
      case '--path':
        parsed.workspacePath = value;
        break;
      case '--sessions-limit':
        parsed.sessionsLimit = parsePositiveInteger(token, value, spec);
        break;
      default:
        throw buildUsageError(`Unknown option for web: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function assertNoArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  if (args.length === 0) {
    return;
  }

  throw buildUsageError(`Unexpected positional argument: ${args[0]}.`, spec, {
    token: args[0],
  });
}

function looksLikeNaturalLanguage(command: string, args: string[]) {
  if (args.length > 0) {
    return true;
  }

  if (/\s/.test(command)) {
    return true;
  }

  if (/[\u3400-\u9fff]/u.test(command)) {
    return true;
  }

  return /[.,!?;:()[\]{}'"“”‘’]/.test(command);
}

function buildRootHelp(commands: Record<string, CommandSpec>) {
  return {
    version: 'g2',
    help: {
      command: null,
      usage: 'opl [command|request...] [args]',
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
        'opl',
        'opl doctor',
        'opl projects',
        'opl frontdesk-manifest',
        'opl frontdesk-service-install --port 8787',
        'opl workspace-status --path /Users/gaofeng/workspace/redcube-ai',
        'opl runtime-status --limit 10',
        'opl dashboard --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 5',
        'opl web --host 127.0.0.1 --port 8787 --path /Users/gaofeng/workspace/one-person-lab',
        'opl "Plan a medical grant proposal revision loop."',
        'opl ask "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck',
        'opl chat "Plan a medical grant proposal revision loop."',
        'opl validate-contracts',
        'opl list-workstreams',
        'opl get-workstream presentation_ops',
        'opl get-domain redcube',
        'opl resolve-request-surface --intent presentation_delivery --target deliverable --goal "Prepare a defense-ready slide deck."',
        'opl explain-domain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
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

function buildContractsContext(contracts: GatewayContracts) {
  return {
    contracts_dir: contracts.contractsDir,
    contracts_root_source: contracts.contractsRootSource,
  };
}

function withContractsContext<T extends Record<string, unknown>>(
  contracts: GatewayContracts,
  payload: T,
) {
  return {
    version: 'g2',
    contracts_context: buildContractsContext(contracts),
    ...payload,
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

async function main() {
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
        return withContractsContext(contracts, {
          workstreams: contracts.workstreams.workstreams.map((workstream) => ({
            workstream_id: workstream.workstream_id,
            label: workstream.label,
            status: workstream.status,
            domain_id: workstream.domain_id,
          })),
        });
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

        const contracts = getContracts();
        return withContractsContext(contracts, {
          workstream: findWorkstreamOrThrow(contracts, workstreamId),
        });
      },
    },
    'list-domains': {
      usage: 'opl list-domains',
      summary: 'List admitted domain gateway summaries.',
      examples: ['opl list-domains'],
      handler: () => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          domains: contracts.domains.domains.map((domain) => ({
            domain_id: domain.domain_id,
            gateway_surface: domain.gateway_surface,
            owned_workstreams: domain.owned_workstreams,
          })),
        });
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

        const contracts = getContracts();
        return withContractsContext(contracts, {
          domain: findDomainOrThrow(contracts, domainId),
        });
      },
    },
    'list-surfaces': {
      usage: 'opl list-surfaces',
      summary: 'List public gateway surface summaries.',
      examples: ['opl list-surfaces'],
      handler: () => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          surfaces: contracts.publicSurfaceIndex.surfaces.map((surface) => ({
            surface_id: surface.surface_id,
            category_id: surface.category_id,
            surface_kind: surface.surface_kind,
            owner_scope: surface.owner_scope,
          })),
        });
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

        const contracts = getContracts();
        return withContractsContext(contracts, {
          surface: findSurfaceOrThrow(contracts, surfaceId),
        });
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
    doctor: {
      usage: 'opl doctor',
      summary:
        'Check whether the local OPL product-entry shell and Hermes kernel are ready for direct use.',
      examples: ['opl doctor', 'OPL_HERMES_BIN=/path/to/hermes opl doctor'],
      handler: () => {
        const validation = validateGatewayContracts(parsedInput.loadOptions);
        return buildProductEntryDoctor(validation);
      },
    },
    projects: {
      usage: 'opl projects',
      summary: 'List the current OPL family project surfaces and their admitted workstreams.',
      examples: ['opl projects'],
      handler: () => buildProjectsOverview(getContracts()),
    },
    'workspace-status': {
      usage: 'opl workspace-status [--path <workspace_path>]',
      summary: 'Inspect one workspace path for git/worktree state and file-surface visibility.',
      examples: [
        'opl workspace-status',
        'opl workspace-status --path /Users/gaofeng/workspace/redcube-ai',
      ],
      handler: (args) => buildWorkspaceStatus(parseWorkspaceStatusArgs(args, commandSpecs['workspace-status'])),
    },
    'runtime-status': {
      usage: 'opl runtime-status [--limit <n>]',
      summary: 'Show Hermes runtime health, recent sessions, and runtime-level process resource usage.',
      examples: ['opl runtime-status', 'opl runtime-status --limit 10'],
      handler: (args) => {
        const parsed = parseRuntimeStatusArgs(args, commandSpecs['runtime-status']);
        return buildRuntimeStatus({ sessionsLimit: parsed.limit });
      },
    },
    dashboard: {
      usage: 'opl dashboard [--path <workspace_path>] [--sessions-limit <n>]',
      summary: 'Aggregate the current OPL front-desk management view across projects, workspace, and runtime.',
      examples: [
        'opl dashboard',
        'opl dashboard --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 5',
      ],
      handler: (args) => buildFrontDeskDashboard(getContracts(), parseDashboardArgs(args, commandSpecs.dashboard)),
    },
    'frontdesk-manifest': {
      usage: 'opl frontdesk-manifest',
      summary:
        'Expose the hosted-friendly OPL front-desk shell contract without claiming hosted packaging is already landed.',
      examples: ['opl frontdesk-manifest'],
      handler: () => buildFrontDeskManifest(getContracts()),
    },
    'frontdesk-service-install': {
      usage: 'opl frontdesk-service-install [--host <host>] [--port <port>] [--path <workspace_path>] [--sessions-limit <n>]',
      summary:
        'Install and bootstrap a local launchd-managed OPL web front-desk service for long-running direct entry.',
      examples: [
        'opl frontdesk-service-install',
        'opl frontdesk-service-install --port 8787',
        'opl frontdesk-service-install --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 10',
      ],
      handler: (args) => installFrontDeskService(getContracts(), parseWebArgs(args, commandSpecs['frontdesk-service-install'])),
    },
    'frontdesk-service-status': {
      usage: 'opl frontdesk-service-status',
      summary:
        'Inspect whether the local launchd-managed OPL web front desk is installed, loaded, and reachable.',
      examples: ['opl frontdesk-service-status'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-status']);
        return getFrontDeskServiceStatus(getContracts());
      },
    },
    'frontdesk-service-start': {
      usage: 'opl frontdesk-service-start',
      summary: 'Bootstrap and kickstart the installed local OPL web front-desk service.',
      examples: ['opl frontdesk-service-start'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-start']);
        return startFrontDeskService(getContracts());
      },
    },
    'frontdesk-service-stop': {
      usage: 'opl frontdesk-service-stop',
      summary: 'Stop the installed local OPL web front-desk service without removing its packaging files.',
      examples: ['opl frontdesk-service-stop'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-stop']);
        return stopFrontDeskService(getContracts());
      },
    },
    'frontdesk-service-open': {
      usage: 'opl frontdesk-service-open',
      summary: 'Open the configured local OPL web front-desk URL in the default browser.',
      examples: ['opl frontdesk-service-open'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-open']);
        return openFrontDeskService(getContracts());
      },
    },
    'frontdesk-service-uninstall': {
      usage: 'opl frontdesk-service-uninstall',
      summary: 'Remove the local launchd-managed OPL web front-desk service packaging.',
      examples: ['opl frontdesk-service-uninstall'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-uninstall']);
        return uninstallFrontDeskService(getContracts());
      },
    },
    web: {
      usage: 'opl web [--host <host>] [--port <port>] [--path <workspace_path>] [--sessions-limit <n>]',
      summary: 'Start the local OPL web front-desk pilot for direct browser-based entry and management.',
      examples: [
        'opl web',
        'opl web --host 127.0.0.1 --port 8787',
        'opl web --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 10',
      ],
      handler: async (args) => {
        const { server, startupPayload } = await startWebFrontDeskServer(
          getContracts(),
          parseWebArgs(args, commandSpecs.web),
        );

        attachWebFrontDeskShutdown(server);
        printJson(startupPayload);

        return {
          __handled: true as const,
        };
      },
    },
    ask: {
      usage: 'opl ask <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--model <model>] [--provider <provider>] [--skills <skills>] [--dry-run]',
      summary:
        'Run a one-shot OPL product-entry request by routing through OPL and then querying Hermes.',
      examples: [
        'opl ask "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck',
        'opl ask --goal "Create a xiaohongshu campaign pack for a lab update." --preferred-family xiaohongshu --dry-run',
      ],
      handler: (args) => runProductEntryAsk(parseProductEntryArgs(args, commandSpecs.ask), getContracts()),
    },
    chat: {
      usage: 'opl chat <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--model <model>] [--provider <provider>] [--skills <skills>] [--dry-run]',
      summary:
        'Seed a Hermes session from the OPL product entry and continue interactively inside the routed boundary.',
      examples: [
        'opl chat "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck',
        'opl chat "Plan a medical grant proposal revision loop." --dry-run',
      ],
      handler: (args) => runProductEntryChat(parseProductEntryArgs(args, commandSpecs.chat), getContracts()),
    },
    resume: {
      usage: 'opl resume <session_id>',
      summary: 'Resume a Hermes-backed OPL session directly from the local product-entry shell.',
      examples: ['opl resume run_7e2a41a19175465f809c0a7f151278ee'],
      handler: (args) => runProductEntryResume(parseResumeArgs(args, commandSpecs.resume)),
    },
    sessions: {
      usage: 'opl sessions [--limit <n>] [--source <source>]',
      summary: 'List recent Hermes sessions through a machine-readable OPL product-entry surface.',
      examples: ['opl sessions', 'opl sessions --limit 10', 'opl sessions --limit 10 --source api_server'],
      handler: (args) => runProductEntrySessions(parseSessionsArgs(args, commandSpecs.sessions)),
    },
    logs: {
      usage: 'opl logs [log_name] [--lines <n>] [--since <cursor>] [--level <level>] [--component <name>] [--session <id>]',
      summary: 'Wrap Hermes log access in an OPL product-entry envelope for debugging and operations.',
      examples: ['opl logs gateway', 'opl logs gateway --lines 50', 'opl logs worker --level info --component runtime'],
      handler: (args) => runProductEntryLogs(parseLogsArgs(args, commandSpecs.logs)),
    },
    'repair-hermes-gateway': {
      usage: 'opl repair-hermes-gateway',
      summary: 'Reinstall and recheck the Hermes gateway service used by the OPL product shell.',
      examples: ['opl repair-hermes-gateway'],
      handler: () => runProductEntryRepairHermesGateway(),
    },
    'resolve-request-surface': {
      usage: 'opl resolve-request-surface --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      summary: 'Resolve a top-level request to an admitted workstream, domain boundary, or ambiguity envelope.',
      examples: [
        'opl resolve-request-surface --intent presentation_delivery --target deliverable --goal "Prepare a defense-ready slide deck."',
      ],
      handler: (args) => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          resolution: resolveRequestSurface(
            parseKeyValueArgs(args, commandSpecs['resolve-request-surface']),
            contracts,
          ),
        });
      },
    },
    'explain-domain-boundary': {
      usage: 'opl explain-domain-boundary --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      summary: 'Explain why a request routes to a domain, stays under definition, or stops at a family boundary.',
      examples: [
        'opl explain-domain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
        'opl explain-domain-boundary --intent create --target deliverable --goal "Grant proposal reviewer simulation and revision planning."',
      ],
      handler: (args) => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          boundary_explanation: explainDomainBoundary(
            parseKeyValueArgs(args, commandSpecs['explain-domain-boundary']),
            contracts,
          ),
        });
      },
    },
  };

  const { command, args, helpRequested } = parsedInput;

  if (!command) {
    if (helpRequested) {
      printJson(buildRootHelp(commandSpecs));
      return;
    }

    const result = await runProductEntryFrontDesk(getContracts());
    if (typeof result === 'object' && result !== null && '__handled' in result) {
      return;
    }

    printJson(result);
    return;
  }

  const spec = commandSpecs[command];
  if (!spec) {
    if (!helpRequested && looksLikeNaturalLanguage(command, args)) {
      const result = await runProductEntryAsk(
        parseProductEntryArgs([command, ...args], commandSpecs.ask),
        getContracts(),
      );
      printJson(result);
      return;
    }

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
      printJson(await spec.handler(args));
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

void main().catch((error) => {
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
});
