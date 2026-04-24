
import {
  GatewayContractError,
  findDomainOrThrow,
  findSurfaceOrThrow,
  findWorkstreamOrThrow,
  loadGatewayContracts,
  validateGatewayContracts,
} from '../../contracts.ts';
import {
  buildFrontDeskInitialize,
  buildFrontDeskEnvironment,
  buildFrontDeskModules,
  buildFrontDeskWorkspaceRootSurface,
  runFrontDeskModuleAction,
  runFrontDeskEngineAction,
  runFrontDeskSystemAction,
  writeFrontDeskWorkspaceRootSurface,
  type FrontDeskEngineAction,
  type FrontDeskSystemAction,
  type FrontDeskModuleAction,
} from '../../frontdesk-installation.ts';
import {
  getFrontDeskServiceStatus,
  installFrontDeskService,
  openFrontDeskService,
  startFrontDeskService,
  stopFrontDeskService,
  uninstallFrontDeskService,
} from '../../frontdesk-service.ts';
import { startFrontDeskMcpBridge } from '../../frontdesk-mcp-stdio.ts';
import {
  buildProductEntryHandoffEnvelope,
  buildProductEntryDoctor,
  type ProductEntryCliInput,
  type ProductEntryExecutor,
  runProductEntryAsk,
  runProductEntryChat,
  runProductEntryLogs,
  runProductEntryRepairHermesGateway,
  runProductEntryResume,
  runProductEntrySessions,
} from '../../product-entry.ts';
import { launchDomainEntry, type DomainLaunchStrategy } from '../../domain-launch.ts';
import {
  buildDomainManifestCatalog,
} from '../../domain-manifest.ts';
import {
  buildFrontDeskDashboard,
  buildHostedPilotBundle,
  buildProjectsOverview,
  buildRuntimeStatus,
  buildFrontDeskStart,
  buildWorkspaceStatus,
} from '../../management.ts';
import { buildHostedPilotPackage } from '../../hosted-pilot-package.ts';
import { runAcpStdioBridge } from '../../opl-acp-stdio.ts';
import { buildOplApiCatalog } from '../../opl-api-paths.ts';
import { runCodexPassthrough } from '../../codex.ts';
import { buildSessionLedger } from '../../session-ledger.ts';
import { explainDomainBoundary, resolveRequestSurface } from '../../resolver.ts';
import {
  activateWorkspaceBinding,
  archiveWorkspaceBinding,
  bindWorkspace,
  buildWorkspaceCatalog,
} from '../../workspace-registry.ts';
import { attachWebFrontDeskShutdown, startWebFrontDeskServer } from '../../web-frontdesk.ts';
import type {
  GatewayContracts,
  GatewayContractsLoadOptions,
  ResolveRequestInput,
} from '../../types.ts';

type CommandHandler = (args: string[]) => unknown | Promise<unknown>;

type CommandSpec = {
  usage: string;
  summary: string;
  examples: string[];
  handler: CommandHandler;
  group?: string;
};

const PRODUCT_ENTRY_AGENT_HANDLE_MAP = {
  mas: {
    preferredFamily: 'mas',
  },
  mag: {
    preferredFamily: 'mag',
  },
  rca: {
    preferredFamily: 'rca',
  },
  'general-task': {
    preferredFamily: undefined,
  },
} as const;

const CODEX_COMMAND_HELP_PASSTHROUGH = new Set([
  'exec',
  'resume',
]);

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

type LaunchDomainCliInput = {
  projectId?: string;
  workspacePath?: string;
  strategy?: DomainLaunchStrategy;
  dryRun?: boolean;
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

type SessionLedgerCliInput = {
  limit?: number;
};

type DashboardCliInput = {
  workspacePath?: string;
  sessionsLimit?: number;
};

type StartCliInput = {
  projectId?: string;
  modeId?: string;
};

type WorkspaceRegistryCliInput = {
  projectId?: string;
  workspacePath?: string;
  label?: string;
  entryCommand?: string;
  manifestCommand?: string;
  entryUrl?: string;
  workspaceRoot?: string;
  profileRef?: string;
  inputPath?: string;
};

type WebCliInput = {
  host?: string;
  port?: number;
  workspacePath?: string;
  sessionsLimit?: number;
  basePath?: string;
};

type FrontDeskMcpCliInput = {
  apiBaseUrl?: string;
  workspacePath?: string;
  sessionsLimit?: number;
};

type ResumeCliInput = {
  sessionId: string;
  executor: ProductEntryExecutor;
};

type SessionRuntimeCliInput = {
  acp: boolean;
};

type HostedPilotPackageCliInput = {
  outputDir: string;
  publicOrigin?: string;
  host?: string;
  port?: number;
  basePath?: string;
  sessionsLimit?: number;
};

type FrontDeskModuleCliInput = {
  moduleId?: string;
};

type FrontDeskEngineCliInput = {
  engineId?: string;
};

type WorkspaceRootCliInput = {
  path?: string;
};

type UpdateChannelCliInput = {
  channel?: 'stable' | 'preview';
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
      'domain resolve-request and domain explain-boundary require --intent, --target, and --goal.',
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
      case '--workspace-path':
        parsed.workspacePath = value;
        break;
      case '--skills':
        parsed.skills.push(
          ...value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
        );
        break;
      case '--executor':
        parsed.executor = parseExecutorValue(token, value, spec);
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
      'Product-entry requests require a plain-language request, either as positional text or via --goal.',
      spec,
      {
        required: ['<request...> or --goal <text>'],
      },
    );
  }

  const normalizedGoal = normalizeProductEntryGoalWithAgentHandle(goal, parsed.preferredFamily, spec);

  return {
    ...parsed,
    goal: normalizedGoal.goal,
    preferredFamily: normalizedGoal.preferredFamily,
    dryRun,
  };
}

function normalizeProductEntryGoalWithAgentHandle(
  goal: string,
  preferredFamily: string | undefined,
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const trimmedGoal = goal.trim();
  const match = trimmedGoal.match(/^@([a-z0-9-]+)(?:\s+(.+))?$/i);
  if (!match) {
    return {
      goal: trimmedGoal,
      preferredFamily,
    };
  }

  const handle = match[1]?.toLowerCase() ?? '';
  const mapped = PRODUCT_ENTRY_AGENT_HANDLE_MAP[handle as keyof typeof PRODUCT_ENTRY_AGENT_HANDLE_MAP];
  if (!mapped) {
    throw buildUsageError(`Unknown product-entry agent handle: @${handle}.`, spec, {
      agent_handle: `@${handle}`,
      allowed_handles: Object.keys(PRODUCT_ENTRY_AGENT_HANDLE_MAP).map((entry) => `@${entry}`),
    });
  }

  if (preferredFamily) {
    throw buildUsageError(
      'Use either an @agent handle or --preferred-family for product-entry routing, not both.',
      spec,
      {
        preferred_family: preferredFamily,
        agent_handle: `@${handle}`,
      },
    );
  }

  const strippedGoal = (match[2] ?? '').trim();
  if (!strippedGoal) {
    throw buildUsageError(`Agent handle @${handle} requires a goal after the handle.`, spec, {
      agent_handle: `@${handle}`,
    });
  }

  return {
    goal: strippedGoal,
    preferredFamily: mapped.preferredFamily,
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
): ResumeCliInput {
  const [sessionId, ...rest] = args;

  if (!sessionId) {
    throw buildUsageError('resume requires a session id.', spec, {
      required: ['session_id'],
    });
  }

  let executor: ProductEntryExecutor = 'codex';
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token !== '--executor') {
      throw buildUsageError(`Unexpected positional argument: ${token}.`, spec, {
        token,
      });
    }

    const value = rest[index + 1];
    if (!value || value.startsWith('--')) {
      throw buildUsageError('resume requires a value for --executor.', spec, {
        option: '--executor',
      });
    }

    executor = parseExecutorValue(token, value, spec);
    index += 1;
  }

  return {
    sessionId,
    executor,
  };
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
        throw buildUsageError(`Unknown option for session list: ${token}.`, spec, {
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
        throw buildUsageError(`Unknown option for session logs: ${token}.`, spec, {
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
        throw buildUsageError(`Unknown option for status workspace: ${token}.`, spec, {
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
        throw buildUsageError(`Unknown option for status runtime: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function parseSessionLedgerArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): SessionLedgerCliInput {
  const parsed: SessionLedgerCliInput = {};

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
        throw buildUsageError(`Unknown option for session ledger: ${token}.`, spec, {
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

function parseStartArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): StartCliInput {
  const parsed: StartCliInput = {};

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
      case '--project':
        parsed.projectId = value;
        break;
      case '--mode':
        parsed.modeId = value;
        break;
      default:
        throw buildUsageError(`Unknown option for start: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function parseLaunchDomainArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): LaunchDomainCliInput {
  const parsed: LaunchDomainCliInput = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }

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
      case '--project':
        parsed.projectId = value;
        break;
      case '--path':
        parsed.workspacePath = value;
        break;
      case '--strategy':
        if (!['auto', 'open_url', 'spawn_command'].includes(value)) {
          throw buildUsageError(`Option ${token} must be one of auto, open_url, or spawn_command.`, spec, {
            option: token,
            value,
          });
        }
        parsed.strategy = value as DomainLaunchStrategy;
        break;
      default:
        throw buildUsageError(`Unknown option for domain launch: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function parseWorkspaceRegistryArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WorkspaceRegistryCliInput {
  const parsed: WorkspaceRegistryCliInput = {};

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
      case '--project':
        parsed.projectId = value;
        break;
      case '--path':
        parsed.workspacePath = value;
        break;
      case '--label':
        parsed.label = value;
        break;
      case '--entry-command':
        parsed.entryCommand = value;
        break;
      case '--manifest-command':
        parsed.manifestCommand = value;
        break;
      case '--entry-url':
        parsed.entryUrl = value;
        break;
      case '--workspace-root':
        parsed.workspaceRoot = value;
        break;
      case '--profile':
        parsed.profileRef = value;
        break;
      case '--input':
        parsed.inputPath = value;
        break;
      default:
        throw buildUsageError(`Unknown option for workspace registry command: ${token}.`, spec, {
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
      case '--base-path':
        parsed.basePath = value;
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

function parseHostedPilotPackageArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): HostedPilotPackageCliInput {
  let outputDir: string | undefined;
  const parsed: Omit<HostedPilotPackageCliInput, 'outputDir'> = {};

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
      case '--output':
        outputDir = value;
        break;
      case '--public-origin':
        parsed.publicOrigin = value;
        break;
      case '--host':
        parsed.host = value;
        break;
      case '--port':
        parsed.port = parsePort(token, value, spec);
        break;
      case '--base-path':
        parsed.basePath = value;
        break;
      case '--sessions-limit':
        parsed.sessionsLimit = parsePositiveInteger(token, value, spec);
        break;
      default:
        throw buildUsageError(`Unknown option for hosted package export: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  if (!outputDir) {
    throw buildUsageError(
      'This hosted package export requires --output.',
      spec,
      { required: ['--output'] },
    );
  }

  return {
    outputDir,
    ...parsed,
  };
}

function parseFrontDeskMcpArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): FrontDeskMcpCliInput {
  const parsed: FrontDeskMcpCliInput = {};

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
      case '--api-base-url':
        parsed.apiBaseUrl = value;
        break;
      case '--workspace-path':
        parsed.workspacePath = value;
        break;
      case '--sessions-limit':
        parsed.sessionsLimit = parsePositiveInteger(token, value, spec);
        break;
      default:
        throw buildUsageError(`Unknown option for MCP bridge command: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function parseSessionRuntimeArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): SessionRuntimeCliInput {
  let acp = false;

  for (const token of args) {
    if (token === '--acp') {
      acp = true;
      continue;
    }

        throw buildUsageError(`Unknown option for session runtime: ${token}.`, spec, {
          option: token,
        });
  }

  return {
    acp,
  };
}

function parseFrontDeskModuleArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): FrontDeskModuleCliInput {
  const parsed: FrontDeskModuleCliInput = {};

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
      case '--module':
        parsed.moduleId = value;
        break;
      default:
        throw buildUsageError(`Unknown option for module command: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  if (!parsed.moduleId) {
    throw buildUsageError(
      'module commands require --module.',
      spec,
      { required: ['--module'] },
    );
  }

  return parsed;
}

function runFrontDeskModuleActionCommand(
  action: FrontDeskModuleAction,
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const parsed = parseFrontDeskModuleArgs(args, spec);
  return runFrontDeskModuleAction(action, parsed.moduleId ?? '');
}

function parseFrontDeskEngineArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): FrontDeskEngineCliInput {
  const parsed: FrontDeskEngineCliInput = {};

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
      case '--engine':
      case '--engine-id':
        parsed.engineId = value;
        break;
      default:
        throw buildUsageError(`Unknown option for engine command: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

async function runFrontDeskEngineActionCommand(
  getContracts: () => GatewayContracts,
  action: FrontDeskEngineAction,
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  const parsed = parseFrontDeskEngineArgs(args, spec);
  if (!parsed.engineId) {
    throw buildUsageError(
      `engine ${action} requires --engine.`,
      spec,
      { required: ['--engine'] },
    );
  }

  return runFrontDeskEngineAction(getContracts(), action, parsed.engineId);
}

function parseWorkspaceRootArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WorkspaceRootCliInput {
  const parsed: WorkspaceRootCliInput = {};

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
        parsed.path = value;
        break;
      default:
        throw buildUsageError(`Unknown option for workspace root command: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function parseUpdateChannelArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): UpdateChannelCliInput {
  const parsed: UpdateChannelCliInput = {};

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
      case '--channel':
        if (value !== 'stable' && value !== 'preview') {
          throw buildUsageError('system update-channel requires stable or preview.', spec, {
            option: token,
            value,
          });
        }
        parsed.channel = value;
        break;
      default:
        throw buildUsageError(`Unknown option for system update-channel command: ${token}.`, spec, {
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

const COMMAND_GROUP_SUMMARIES: Record<string, string> = {
  top_level: '直接产品入口与前台运行入口。',
  web: '导出或查看 GUI/overlay 需要的 Web bundle 与打包资源。',
  status: '读取 family、workspace、runtime 和 dashboard 状态。',
  system: '查看与维护 OPL 的系统状态、初始化和更新通道。',
  engine: '安装、更新与维护执行引擎。',
  module: '安装、更新与维护领域模块。',
  service: '管理本地 OPL API 服务与桌面入口。',
  workspace: '管理项目与 workspace 绑定。',
  domain: '解析域边界、域入口和域 manifest。',
  contract: '读取或验证 machine-readable contract / handoff surface。',
  session: '查看、恢复和审计会话。',
  runtime: '修复或检查底层 runtime 相关入口。',
  legacy: '历史兼容命令。',
};

const RETIRED_COMMAND_PREFIXES = new Set([
  'frontdesk',
  'ask',
  'chat',
  'shell',
]);

const EXPLICIT_AGENT_HANDLE_SPEC = {
  usage:
    'opl @mas|@mag|@rca <request...> [--executor <codex|hermes>] [--workspace-path <path>] [--dry-run]',
  examples: [
    'opl @mas tighten the manuscript argument around invasive phenotype findings --dry-run',
    'opl @rca build a defense-ready deck for next week',
    'opl @mag draft a grant revision response pack --executor hermes',
  ],
} satisfies Pick<CommandSpec, 'usage' | 'examples'>;

function cloneCommandSpec(
  base: CommandSpec,
  overrides: Partial<Omit<CommandSpec, 'handler'>> & { handler?: CommandHandler } = {},
): CommandSpec {
  return {
    ...base,
    ...overrides,
    examples: overrides.examples ?? base.examples,
  };
}

function resolveCommandSpec(
  tokens: string[],
  commands: Record<string, CommandSpec>,
) {
  const prefixLimit = Math.max(
    1,
    tokens.findIndex((token) => token.startsWith('--')) === -1
      ? tokens.length
      : tokens.findIndex((token) => token.startsWith('--')),
  );

  for (let length = prefixLimit; length >= 1; length -= 1) {
    const candidate = tokens.slice(0, length).join(' ');
    const spec = commands[candidate];
    if (spec) {
      return {
        command: candidate,
        spec,
        args: tokens.slice(length),
      };
    }
  }

  return null;
}

function buildRootHelp(commands: Record<string, CommandSpec>) {
  const visibleEntries = Object.entries(commands).filter(([, spec]) => spec.group !== 'legacy');
  const grouped = Object.entries(commands).reduce<Record<string, Array<{
    command: string;
    usage: string;
    summary: string;
    examples: string[];
  }>>>((acc, [command, spec]) => {
    if (spec.group === 'legacy') {
      return acc;
    }
    const groupId = spec.group ?? 'top_level';
    acc[groupId] ??= [];
    acc[groupId].push({
      command,
      usage: spec.usage,
      summary: spec.summary,
      examples: spec.examples,
    });
    return acc;
  }, {});

  return {
    version: 'g2',
    help: {
      command: null,
      usage: 'opl [command ...|request...] [args]',
      global_options: [
        {
          option: '--contracts-dir <path>',
          summary:
            'Use an explicit OPL contract root. When omitted, the CLI resolves from cwd, cwd/contracts/opl-gateway, or the active OPL CLI repo contracts root.',
        },
      ],
      command_groups: Object.entries(grouped).map(([group_id, entries]) => ({
        group_id,
        summary: COMMAND_GROUP_SUMMARIES[group_id] ?? '',
        commands: entries,
      })),
      commands: visibleEntries.map(([command, spec]) => ({
        command,
        usage: spec.usage,
        summary: spec.summary,
        examples: spec.examples,
      })),
      examples: [
        'opl help',
        'opl',
        'opl doctor',
        'opl system',
        'opl system initialize',
        'opl modules',
        'opl module install --module medautoscience',
        'opl engine install --engine codex',
        'opl service install --port 8787',
        'opl web bundle --port 8787 --base-path /pilot/opl',
        'opl web package --output /tmp/opl-web-package --public-origin https://opl.example.com',
        'opl workspace projects',
        'opl workspace bind --project redcube --path /Users/gaofeng/workspace/redcube-ai --entry-command "redcube-ai frontdesk" --manifest-command "redcube product manifest --workspace-root /Users/gaofeng/workspace/redcube-ai"',
        'opl domain launch --project redcube --dry-run',
        'opl contract handoff-envelope "Prepare a defense-ready slide deck." --preferred-family ppt_deck',
        'opl status workspace --path /Users/gaofeng/workspace/redcube-ai',
        'opl status runtime --limit 10',
        'opl status dashboard --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 5',
        'opl web --host 127.0.0.1 --port 8787 --base-path /pilot/opl --path /Users/gaofeng/workspace/one-person-lab',
        'opl "Plan a medical grant proposal revision loop."',
        'opl exec "Plan a medical grant proposal revision loop."',
        'opl resume --last',
        'opl @rca build a defense-ready slide deck for a thesis committee.',
        'opl @mag draft a grant revision response pack --dry-run',
        'opl contract validate',
        'opl domain resolve-request --intent presentation_delivery --target deliverable --goal "Prepare a defense-ready slide deck."',
        'opl domain explain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
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

function buildPublicSystemPayload(
  payload: Awaited<ReturnType<typeof buildFrontDeskEnvironment>>,
) {
  return {
    version: payload.version,
    system: buildPublicSystemFromFrontDeskEnvironment(payload.frontdesk_environment),
  };
}

function buildPublicSystemFromFrontDeskEnvironment(
  environment: Awaited<ReturnType<typeof buildFrontDeskEnvironment>>['frontdesk_environment'],
) {
  return {
    surface_id: 'opl_system',
    overall_status: environment.overall_status,
    core_engines: environment.core_engines,
    local_service: environment.local_frontdesk,
    module_summary: environment.module_summary,
    managed_paths: environment.managed_paths,
    notes: environment.notes,
  };
}

function buildPublicSystemInitializePayload(
  payload: Awaited<ReturnType<typeof buildFrontDeskInitialize>>,
) {
  const api = buildOplApiCatalog();
  const domainModules = payload.frontdesk_initialize.domain_modules;
  const recommendedNextActionEndpoint =
    payload.frontdesk_initialize.recommended_next_action.action_id === 'set_workspace_root'
      ? api.actions.workspace_root
      : api.actions.system_initialize;
  return {
    version: payload.version,
    system_initialize: {
      surface_id: 'opl_system_initialize',
      overall_state: payload.frontdesk_initialize.overall_state,
      checklist: payload.frontdesk_initialize.checklist,
      core_engines: payload.frontdesk_initialize.core_engines,
      domain_modules: {
        surface_id: 'opl_modules',
        modules_root: domainModules.modules_root,
        summary: domainModules.summary,
        modules: domainModules.modules,
        notes: domainModules.notes,
      },
      settings: {
        ...payload.frontdesk_initialize.settings,
        endpoint: api.actions.system_settings,
        action_endpoint: api.actions.system_settings,
      },
      workspace_root: {
        ...payload.frontdesk_initialize.workspace_root,
        endpoint: api.actions.workspace_root,
        action_endpoint: api.actions.workspace_root,
      },
      system: {
        update_channel: payload.frontdesk_initialize.system.update_channel,
        local_service: payload.frontdesk_initialize.system.local_frontdesk,
        actions: payload.frontdesk_initialize.system.actions.map((entry) => ({
          ...entry,
          endpoint: api.actions.system,
        })),
      },
      endpoints: {
        system_initialize: api.actions.system_initialize,
        system: api.resources.system,
        modules: api.resources.modules,
        settings: api.actions.system_settings,
        engine_action: api.actions.engines,
        workspace_root: api.actions.workspace_root,
        system_action: api.actions.system,
      },
      recommended_next_action: {
        ...payload.frontdesk_initialize.recommended_next_action,
        endpoint: recommendedNextActionEndpoint,
      },
      notes: payload.frontdesk_initialize.notes,
    },
  };
}

function buildPublicModulesPayload(
  payload: ReturnType<typeof buildFrontDeskModules>,
) {
  return {
    version: payload.version,
    modules: {
      surface_id: 'opl_modules',
      modules_root: payload.frontdesk_modules.modules_root,
      summary: payload.frontdesk_modules.summary,
      items: payload.frontdesk_modules.modules,
      notes: payload.frontdesk_modules.notes,
    },
  };
}

function buildPublicModuleActionPayload(
  payload: ReturnType<typeof runFrontDeskModuleAction>,
) {
  return {
    version: payload.version,
    module_action: {
      surface_id: 'opl_module_action',
      ...payload.frontdesk_module_action,
    },
  };
}

function buildPublicEngineActionPayload(
  payload: Awaited<ReturnType<typeof runFrontDeskEngineAction>>,
) {
  const { frontdesk_environment: environment, ...action } = payload.frontdesk_engine_action;

  return {
    version: payload.version,
    engine_action: {
      surface_id: 'opl_engine_action',
      ...action,
      system: buildPublicSystemFromFrontDeskEnvironment(environment),
    },
  };
}

function buildPublicSystemActionPayload(
  payload: Awaited<ReturnType<typeof runFrontDeskSystemAction>>,
) {
  return {
    version: payload.version,
    system_action: {
      surface_id: 'opl_system_action',
      ...payload.frontdesk_system_action,
    },
  };
}

function buildPublicServicePayload(
  payload: Awaited<ReturnType<typeof getFrontDeskServiceStatus>>,
) {
  return {
    version: payload.version,
    service: {
      surface_id: 'opl_service',
      ...payload.frontdesk_service,
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

    break;
  }

  return {
    helpRequested,
    command: args.shift() ?? null,
    args,
    loadOptions: loadOptions.contractsDir ? loadOptions : undefined,
  };
}

export {
  CODEX_COMMAND_HELP_PASSTHROUGH,
  COMMAND_GROUP_SUMMARIES,
  EXPLICIT_AGENT_HANDLE_SPEC,
  RETIRED_COMMAND_PREFIXES,
  assertNoArgs,
  buildCommandHelp,
  buildContractsContext,
  buildPublicEngineActionPayload,
  buildPublicModuleActionPayload,
  buildPublicModulesPayload,
  buildPublicServicePayload,
  buildPublicSystemActionPayload,
  buildPublicSystemInitializePayload,
  buildPublicSystemPayload,
  buildRetiredCommandError,
  buildRootHelp,
  buildUsageError,
  cloneCommandSpec,
  hasExplicitHermesExecutor,
  looksLikeNaturalLanguage,
  parseCliInput,
  parseDashboardArgs,
  parseFrontDeskEngineArgs,
  parseFrontDeskMcpArgs,
  parseFrontDeskModuleArgs,
  parseHostedPilotPackageArgs,
  parseKeyValueArgs,
  parseLaunchDomainArgs,
  parseLogsArgs,
  parseProductEntryArgs,
  parseResumeArgs,
  parseRuntimeStatusArgs,
  parseSessionLedgerArgs,
  parseSessionRuntimeArgs,
  parseSessionsArgs,
  parseStartArgs,
  parseUpdateChannelArgs,
  parseWebArgs,
  parseWorkspaceRegistryArgs,
  parseWorkspaceRootArgs,
  parseWorkspaceStatusArgs,
  printJson,
  resolveCommandSpec,
  runCodexPassthroughHandled,
  runFrontDeskEngineActionCommand,
  runFrontDeskModuleActionCommand,
  stripExplicitCodexExecutor,
  withContractsContext,
};

export type {
  CommandHandler,
  CommandSpec,
  DashboardCliInput,
  FrontDeskEngineCliInput,
  FrontDeskMcpCliInput,
  FrontDeskModuleCliInput,
  HostedPilotPackageCliInput,
  LaunchDomainCliInput,
  LogsCliInput,
  ParsedCliInput,
  ResumeCliInput,
  RuntimeStatusCliInput,
  SessionLedgerCliInput,
  SessionRuntimeCliInput,
  SessionsCliInput,
  StartCliInput,
  UpdateChannelCliInput,
  WebCliInput,
  WorkspaceRegistryCliInput,
  WorkspaceRootCliInput,
  WorkspaceStatusCliInput,
};
