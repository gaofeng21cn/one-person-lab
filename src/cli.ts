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
} from './frontdesk-installation.ts';
import {
  getFrontDeskServiceStatus,
  installFrontDeskService,
  openFrontDeskService,
  startFrontDeskService,
  stopFrontDeskService,
  uninstallFrontDeskService,
} from './frontdesk-service.ts';
import { startFrontDeskMcpBridge } from './frontdesk-mcp-stdio.ts';
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
} from './product-entry.ts';
import { launchDomainEntry, type DomainLaunchStrategy } from './domain-launch.ts';
import {
  buildDomainManifestCatalog,
} from './domain-manifest.ts';
import {
  buildFrontDeskDashboard,
  buildHostedPilotBundle,
  buildProjectsOverview,
  buildRuntimeStatus,
  buildFrontDeskStart,
  buildWorkspaceStatus,
} from './management.ts';
import { buildHostedPilotPackage } from './hosted-pilot-package.ts';
import { runAcpStdioBridge } from './opl-acp-stdio.ts';
import { buildOplApiCatalog } from './opl-api-paths.ts';
import { runCodexPassthrough } from './codex.ts';
import { buildSessionLedger } from './session-ledger.ts';
import { explainDomainBoundary, resolveRequestSurface } from './resolver.ts';
import {
  activateWorkspaceBinding,
  archiveWorkspaceBinding,
  bindWorkspace,
  buildWorkspaceCatalog,
} from './workspace-registry.ts';
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

const OPL_PRODUCT_ENTRY_OPTIONS = new Set([
  '--dry-run',
  '--goal',
  '--intent',
  '--target',
  '--preferred-family',
  '--request-kind',
  '--workspace-path',
  '--skills',
  '--executor',
  '--provider',
]);

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

type ExecCliInput = {
  prompt: string;
  dryRun: boolean;
  model?: string;
  provider?: string;
  workspacePath?: string;
  json: boolean;
};

type ResumeCliInput = {
  sessionId: string;
  executor: ProductEntryExecutor;
};

type ShellCliInput =
  | {
      mode: 'frontdesk';
    }
  | {
      mode: 'resume';
      sessionId: string;
      executor: ProductEntryExecutor;
    }
  | {
      mode: 'chat';
      input: ProductEntryCliInput;
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

function firstPositionalArg(args: string[]) {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) {
      return token;
    }

    if (OPL_PRODUCT_ENTRY_OPTIONS.has(token)) {
      index += 1;
    }
  }

  return null;
}

function hasOplProductEntryOption(args: string[]) {
  return args.some((token) => OPL_PRODUCT_ENTRY_OPTIONS.has(token));
}

function startsWithExplicitAgentHandle(args: string[]) {
  return firstPositionalArg(args)?.startsWith('@') ?? false;
}

function shouldUseOplProductEntry(args: string[]) {
  return hasOplProductEntryOption(args) || startsWithExplicitAgentHandle(args);
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
      'ask and chat require a plain-language request, either as positional text or via --goal.',
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

function parseExecArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): ExecCliInput {
  let dryRun = false;
  let explicitGoal: string | undefined;
  const positionalGoalParts: string[] = [];
  const parsed: Omit<ExecCliInput, 'prompt' | 'dryRun'> = {
    json: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (token === '--json') {
      parsed.json = true;
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
      case '--model':
        parsed.model = value;
        break;
      case '--provider':
        parsed.provider = value;
        break;
      case '--workspace-path':
        parsed.workspacePath = value;
        break;
      default:
        throw buildUsageError(`Unknown option for exec: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  if (explicitGoal && positionalGoalParts.length > 0) {
    throw buildUsageError(
      'Use either a positional request or --goal for exec, not both.',
      spec,
      {
        positional_request: positionalGoalParts.join(' '),
      },
    );
  }

  const prompt = (explicitGoal ?? positionalGoalParts.join(' ')).trim();
  if (!prompt) {
    throw buildUsageError(
      'exec requires a plain-language request, either as positional text or via --goal.',
      spec,
      {
        required: ['<request...> or --goal <text>'],
      },
    );
  }

  return {
    ...parsed,
    prompt,
    dryRun,
  };
}

function parseShellArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): ShellCliInput {
  if (args.length === 0) {
    return {
      mode: 'frontdesk',
    };
  }

  if (args[0] === '--resume') {
    const sessionId = args[1];
    if (!sessionId || sessionId.startsWith('--')) {
      throw buildUsageError('shell --resume requires a session id.', spec, {
        required: ['--resume <session_id>'],
      });
    }

    let executor: ProductEntryExecutor = 'codex';
    for (let index = 2; index < args.length; index += 1) {
      const token = args[index];
      if (token !== '--executor') {
        throw buildUsageError('shell --resume accepts only --executor after the session id.', spec, {
          token,
        });
      }

      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw buildUsageError('shell --resume requires a value for --executor.', spec, {
          option: '--executor',
        });
      }

      executor = parseExecutorValue(token, value, spec);
      index += 1;
    }

    return {
      mode: 'resume',
      sessionId,
      executor,
    };
  }

  return {
    mode: 'chat',
    input: parseProductEntryArgs(args, spec),
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
]);

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
        'opl ask "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck --workspace-path /Users/gaofeng/workspace/redcube-ai',
        'opl exec "Plan a medical grant proposal revision loop."',
        'opl resume --last',
        'opl chat "Plan a medical grant proposal revision loop." --workspace-path /Users/gaofeng/workspace/med-autogrant',
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
      examples: ['opl get-surface opl_gateway_contract_hub'],
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
    'status workspace': {
      usage: 'opl status workspace [--path <workspace_path>]',
      summary: 'Inspect one workspace path for git/worktree state and file-surface visibility.',
      examples: [
        'opl status workspace',
        'opl status workspace --path /Users/gaofeng/workspace/redcube-ai',
      ],
      handler: (args) => buildWorkspaceStatus(parseWorkspaceStatusArgs(args, commandSpecs['status workspace'])),
    },
    'status runtime': {
      usage: 'opl status runtime [--limit <n>]',
      summary: 'Show Hermes runtime health, recent sessions, and runtime-level process resource usage.',
      examples: ['opl status runtime', 'opl status runtime --limit 10'],
      handler: (args) => {
        const parsed = parseRuntimeStatusArgs(args, commandSpecs['status runtime']);
        return buildRuntimeStatus({ sessionsLimit: parsed.limit });
      },
    },
    dashboard: {
      usage: 'opl status dashboard [--path <workspace_path>] [--sessions-limit <n>]',
      summary: 'Aggregate the current OPL front-desk management view across projects, workspace, and runtime.',
      examples: [
        'opl status dashboard',
        'opl status dashboard --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 5',
      ],
      handler: (args) => buildFrontDeskDashboard(getContracts(), parseDashboardArgs(args, commandSpecs.dashboard)),
    },
    start: {
      usage: 'opl start --project <project_id> [--mode <mode_id>]',
      summary: 'Select one resolved domain start surface and emit the exact next entry mode OPL recommends.',
      examples: [
        'opl start --project redcube',
        'opl start --project med-autogrant --mode build_direct_entry',
      ],
      handler: (args) => {
        const parsed = parseStartArgs(args, commandSpecs.start);
        if (!parsed.projectId) {
          throw buildUsageError(
            'start requires --project.',
            commandSpecs.start,
            { required: ['--project'] },
          );
        }

        return buildFrontDeskStart(getContracts(), {
          projectId: parsed.projectId,
          modeId: parsed.modeId,
        });
      },
    },
    'domain launch': {
      usage:
        'opl domain launch --project <project_id> [--path <workspace_path>] [--strategy <auto|open_url|spawn_command>] [--dry-run]',
      summary:
        'Invoke one already-bound domain direct-entry locator without upgrading OPL into runtime ownership.',
      examples: [
        'opl domain launch --project redcube --dry-run',
        'opl domain launch --project redcube --strategy open_url',
        'opl domain launch --project med-autogrant --path /Users/gaofeng/workspace/med-autogrant --strategy spawn_command',
      ],
      handler: (args) => {
        const parsed = parseLaunchDomainArgs(args, commandSpecs['domain launch']);
        if (!parsed.projectId) {
          throw buildUsageError(
            'domain launch requires --project.',
            commandSpecs['domain launch'],
            { required: ['--project'] },
          );
        }

        return launchDomainEntry(getContracts(), {
          projectId: parsed.projectId,
          workspacePath: parsed.workspacePath,
          strategy: parsed.strategy,
          dryRun: parsed.dryRun,
        });
      },
    },
    'domain manifests': {
      usage: 'opl domain manifests',
      summary:
        'Resolve the active admitted-domain manifest_command bindings into machine-readable product-entry discovery surfaces.',
      examples: ['opl domain manifests'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['domain manifests']);
        return buildDomainManifestCatalog(getContracts());
      },
    },
    'frontdesk environment': {
      usage: 'opl frontdesk environment',
      summary:
        'Show the user-facing OPL environment surface: core engines, frontdesk status, and managed install paths.',
      examples: ['opl frontdesk environment'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk environment']);
        return buildFrontDeskEnvironment(getContracts());
      },
    },
    'frontdesk initialize': {
      usage: 'opl frontdesk initialize',
      summary:
        'Aggregate the Initialize OPL surface across engines, modules, workspace root, and local system support.',
      examples: ['opl frontdesk initialize'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk initialize']);
        return buildFrontDeskInitialize(getContracts());
      },
    },
    'frontdesk modules': {
      usage: 'opl frontdesk modules',
      summary:
        'List OPL-managed domain modules together with install state, checkout path, and upgrade actions.',
      examples: ['opl frontdesk modules'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk modules']);
        return buildFrontDeskModules();
      },
    },
    'frontdesk-module-install': {
      usage: 'opl frontdesk module install --module <module_id>',
      summary: 'Install an OPL-managed domain module into the managed modules root.',
      examples: ['opl frontdesk module install --module medautoscience'],
      handler: (args) => runFrontDeskModuleActionCommand('install', args, commandSpecs['frontdesk-module-install']),
    },
    'frontdesk-module-update': {
      usage: 'opl frontdesk module update --module <module_id>',
      summary: 'Update an installed OPL domain module with a fast-forward git pull.',
      examples: ['opl frontdesk module update --module medautoscience'],
      handler: (args) => runFrontDeskModuleActionCommand('update', args, commandSpecs['frontdesk-module-update']),
    },
    'frontdesk-module-reinstall': {
      usage: 'opl frontdesk module reinstall --module <module_id>',
      summary: 'Reinstall an OPL-managed domain module from its configured git source.',
      examples: ['opl frontdesk module reinstall --module medautoscience'],
      handler: (args) => runFrontDeskModuleActionCommand('reinstall', args, commandSpecs['frontdesk-module-reinstall']),
    },
    'frontdesk-module-remove': {
      usage: 'opl frontdesk module remove --module <module_id>',
      summary: 'Remove an OPL-managed domain module checkout from the managed modules root.',
      examples: ['opl frontdesk module remove --module medautoscience'],
      handler: (args) => runFrontDeskModuleActionCommand('remove', args, commandSpecs['frontdesk-module-remove']),
    },
    'frontdesk engine install': {
      usage: 'opl frontdesk engine install --engine <codex|hermes>',
      summary: 'Run the configured install action for one OPL-managed core engine.',
      examples: ['opl frontdesk engine install --engine codex'],
      handler: (args) =>
        runFrontDeskEngineActionCommand(getContracts, 'install', args, commandSpecs['frontdesk engine install']),
    },
    'frontdesk engine update': {
      usage: 'opl frontdesk engine update --engine <codex|hermes>',
      summary: 'Run the configured update action for one OPL-managed core engine.',
      examples: ['opl frontdesk engine update --engine codex'],
      handler: (args) =>
        runFrontDeskEngineActionCommand(getContracts, 'update', args, commandSpecs['frontdesk engine update']),
    },
    'frontdesk engine reinstall': {
      usage: 'opl frontdesk engine reinstall --engine <codex|hermes>',
      summary: 'Run the configured reinstall action for one OPL-managed core engine.',
      examples: ['opl frontdesk engine reinstall --engine codex'],
      handler: (args) =>
        runFrontDeskEngineActionCommand(getContracts, 'reinstall', args, commandSpecs['frontdesk engine reinstall']),
    },
    'frontdesk engine remove': {
      usage: 'opl frontdesk engine remove --engine <codex|hermes>',
      summary: 'Run the configured remove action for one OPL-managed core engine.',
      examples: ['opl frontdesk engine remove --engine hermes'],
      handler: (args) =>
        runFrontDeskEngineActionCommand(getContracts, 'remove', args, commandSpecs['frontdesk engine remove']),
    },
    'frontdesk repair': {
      usage: 'opl frontdesk repair',
      summary: 'Repair OPL runtime support surfaces and return the refreshed system action payload.',
      examples: ['opl frontdesk repair'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk repair']);
        return runFrontDeskSystemAction(getContracts(), 'repair');
      },
    },
    'frontdesk reinstall-support': {
      usage:
        'opl frontdesk reinstall-support [--host <host>] [--port <port>] [--path <workspace_path>] [--sessions-limit <n>] [--base-path <base_path>]',
      summary:
        'Reinstall local OPL support surfaces that package the adapter service for desktop or overlay shells.',
      examples: [
        'opl frontdesk reinstall-support',
        'opl frontdesk reinstall-support --port 8787 --base-path /pilot/opl',
      ],
      handler: (args) =>
        runFrontDeskSystemAction(
          getContracts(),
          'reinstall_support',
          parseWebArgs(args, commandSpecs['frontdesk reinstall-support']),
        ),
    },
    'frontdesk update-channel': {
      usage: 'opl frontdesk update-channel [--channel <stable|preview>]',
      summary: 'Read or change the OPL update channel used by Initialize and Environment settings.',
      examples: ['opl frontdesk update-channel', 'opl frontdesk update-channel --channel preview'],
      handler: (args) => {
        const parsed = parseUpdateChannelArgs(args, commandSpecs['frontdesk update-channel']);
        return runFrontDeskSystemAction(getContracts(), 'update_channel', {
          channel: parsed.channel,
        });
      },
    },
    'frontdesk hosted-bundle': {
      usage:
        'opl frontdesk hosted-bundle [--host <host>] [--port <port>] [--path <workspace_path>] [--sessions-limit <n>] [--base-path <base_path>]',
      summary:
        'Emit the hosted-pilot-ready front-desk bundle with base-path-aware entry and API endpoints.',
      examples: [
        'opl frontdesk hosted-bundle',
        'opl frontdesk hosted-bundle --host 0.0.0.0 --port 8787 --base-path /pilot/opl',
        'opl frontdesk hosted-bundle --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 9',
      ],
      handler: (args) =>
        buildHostedPilotBundle(getContracts(), parseWebArgs(args, commandSpecs['frontdesk hosted-bundle'])),
    },
    'frontdesk hosted-package': {
      usage:
        'opl frontdesk hosted-package --output <dir> [--public-origin <origin>] [--host <host>] [--port <port>] [--sessions-limit <n>] [--base-path <base_path>]',
      summary:
        'Export a self-hostable hosted pilot package with app snapshot, run script, service unit, and reverse-proxy assets.',
      examples: [
        'opl frontdesk hosted-package --output /tmp/opl-frontdesk-package',
        'opl frontdesk hosted-package --output /tmp/opl-frontdesk-package --public-origin https://opl.example.com --base-path /pilot/opl',
        'opl frontdesk hosted-package --output /tmp/opl-frontdesk-package --host 0.0.0.0 --port 8787 --sessions-limit 9',
      ],
      handler: (args) =>
        buildHostedPilotPackage(
          getContracts(),
          parseHostedPilotPackageArgs(args, commandSpecs['frontdesk hosted-package']),
        ),
    },
    'frontdesk-service-install': {
      usage:
        'opl frontdesk service install [--host <host>] [--port <port>] [--path <workspace_path>] [--sessions-limit <n>] [--base-path <base_path>]',
      summary:
        'Install and bootstrap a local launchd-managed OPL web front-desk service for long-running direct entry.',
      examples: [
        'opl frontdesk service install',
        'opl frontdesk service install --port 8787',
        'opl frontdesk service install --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 10 --base-path /pilot/opl',
      ],
      handler: (args) => installFrontDeskService(getContracts(), parseWebArgs(args, commandSpecs['frontdesk-service-install'])),
    },
    'frontdesk-service-status': {
      usage: 'opl frontdesk service status',
      summary:
        'Inspect whether the local launchd-managed OPL web front desk is installed, loaded, and reachable.',
      examples: ['opl frontdesk service status'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-status']);
        return getFrontDeskServiceStatus(getContracts());
      },
    },
    'frontdesk-service-start': {
      usage: 'opl frontdesk service start',
      summary: 'Bootstrap and kickstart the installed local OPL web front-desk service.',
      examples: ['opl frontdesk service start'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-start']);
        return startFrontDeskService(getContracts());
      },
    },
    'frontdesk-service-stop': {
      usage: 'opl frontdesk service stop',
      summary: 'Stop the installed local OPL web front-desk service without removing its packaging files.',
      examples: ['opl frontdesk service stop'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-stop']);
        return stopFrontDeskService(getContracts());
      },
    },
    'frontdesk-service-open': {
      usage: 'opl frontdesk service open',
      summary: 'Open the configured local OPL web front-desk URL in the default browser.',
      examples: ['opl frontdesk service open'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-open']);
        return openFrontDeskService(getContracts());
      },
    },
    'frontdesk-service-uninstall': {
      usage: 'opl frontdesk service uninstall',
      summary: 'Remove the local launchd-managed OPL web front-desk service packaging.',
      examples: ['opl frontdesk service uninstall'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-uninstall']);
        return uninstallFrontDeskService(getContracts());
      },
    },
    'mcp-stdio': {
      usage:
        'opl mcp-stdio --api-base-url <url> [--workspace-path <workspace_path>] [--sessions-limit <n>]',
      summary: 'Internal command: run the OPL front-desk MCP stdio bridge for desktop or web shells.',
      examples: [
        'opl mcp-stdio --api-base-url http://host.docker.internal:8787/pilot/opl/api',
      ],
      handler: async (args) => {
        const parsed = parseFrontDeskMcpArgs(args, commandSpecs['mcp-stdio']);
        if (!parsed.apiBaseUrl) {
          throw buildUsageError(
            'mcp-stdio requires --api-base-url.',
            commandSpecs['mcp-stdio'],
            { required: ['--api-base-url'] },
          );
        }

        await startFrontDeskMcpBridge({
          apiBaseUrl: parsed.apiBaseUrl,
          workspacePath: parsed.workspacePath,
          sessionsLimit: parsed.sessionsLimit,
        });
        return {
          __handled: true as const,
        };
      },
    },
    'session runtime': {
      usage: 'opl session runtime --acp',
      summary: 'Run the minimal OPL ACP stdio bridge entry for external shells.',
      examples: [
        'opl session runtime --acp',
      ],
      handler: async (args) => {
        const parsed = parseSessionRuntimeArgs(args, commandSpecs['session runtime']);
        if (!parsed.acp) {
          throw buildUsageError(
            'session runtime currently requires --acp.',
            commandSpecs['session runtime'],
            { required: ['--acp'] },
          );
        }

        await runAcpStdioBridge();
        return {
          __handled: true as const,
        };
      },
    },
    web: {
      usage:
        'opl web [--host <host>] [--port <port>] [--path <workspace_path>] [--sessions-limit <n>] [--base-path <base_path>]',
      summary: 'Start the local OPL front-desk adapter service for external GUI shells and API consumers.',
      examples: [
        'opl web',
        'opl web --host 127.0.0.1 --port 8787',
        'opl web --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 10',
        'opl web --host 127.0.0.1 --port 8787 --base-path /pilot/opl',
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
	      usage:
	        'opl ask <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--executor <codex|hermes>] [--workspace-path <path>] [--dry-run]',
	      summary:
	        'Compatibility one-shot entry. Plain requests pass through to codex exec; explicit OPL routing options use the product-entry layer.',
	      examples: [
	        'opl ask "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck',
	        'opl ask "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck --executor hermes',
	        'opl ask --goal "Create a xiaohongshu campaign pack for a lab update." --preferred-family xiaohongshu --dry-run',
	        'opl ask "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck --workspace-path /Users/gaofeng/workspace/redcube-ai',
	      ],
	      handler: (args) => {
	        if (!shouldUseOplProductEntry(args)) {
	          return runCodexPassthroughHandled(['exec', ...args]);
	        }

	        return runProductEntryAsk(parseProductEntryArgs(args, commandSpecs.ask), getContracts());
	      },
	    },
	    exec: {
	      usage:
	        'opl exec [codex exec args...]',
	      summary:
	        'Run codex exec as a raw passthrough.',
	      examples: [
	        'opl exec "Plan a medical grant proposal revision loop."',
	        'opl exec --cd /Users/gaofeng/workspace/redcube-ai "Prepare a defense-ready slide deck for a thesis committee."',
	        'opl exec --model gpt-5.4 "Summarize current workspace status."',
	      ],
	      handler: (args) => runCodexPassthroughHandled(['exec', ...args]),
	    },
	    chat: {
	      usage:
	        'opl chat <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--executor <codex|hermes>] [--workspace-path <path>] [--dry-run]',
	      summary:
	        'Compatibility interactive alias. Plain requests pass through to codex; explicit OPL routing options use the product-entry layer.',
	      examples: [
	        'opl chat "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck',
	        'opl chat "Plan a medical grant proposal revision loop." --executor hermes',
	        'opl chat "Plan a medical grant proposal revision loop." --workspace-path /Users/gaofeng/workspace/med-autogrant --dry-run',
	      ],
	      handler: (args) => {
	        if (!shouldUseOplProductEntry(args)) {
	          return runCodexPassthroughHandled(args);
	        }

	        return runProductEntryChat(parseProductEntryArgs(args, commandSpecs.chat), getContracts());
	      },
	    },
	    shell: {
	      usage:
	        'opl shell [<request...> | --resume <session_id>] [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--executor <codex|hermes>] [--workspace-path <path>] [--dry-run]',
	      summary:
	        'Compatibility alias for local interactive entry. Plain requests pass through to codex; Hermes and domain routing are explicit.',
	      examples: [
	        'opl shell',
	        'opl shell --resume run_7e2a41a19175465f809c0a7f151278ee',
	        'opl shell "@mas tighten the manuscript argument around invasive phenotype findings"',
	        'opl shell "@mas tighten the manuscript argument around invasive phenotype findings" --executor hermes',
	        'opl shell "@rca build a defense-ready deck for next week" --workspace-path /Users/gaofeng/workspace/redcube-ai',
	      ],
	      handler: (args) => {
	        if (args.length === 0) {
	          return runCodexPassthroughHandled([]);
	        }

	        if (args[0] === '--resume' && !hasExplicitHermesExecutor(args)) {
	          return runCodexPassthroughHandled(['resume', ...stripExplicitCodexExecutor(args.slice(1))]);
	        }

	        if (args[0] !== '--resume' && !shouldUseOplProductEntry(args)) {
	          return runCodexPassthroughHandled(args);
	        }

	        const parsed = parseShellArgs(args, commandSpecs.shell);
	        switch (parsed.mode) {
	          case 'frontdesk':
	            return runCodexPassthroughHandled([]);
	          case 'resume':
	            return runProductEntryResume(parsed.sessionId, parsed.executor);
	          case 'chat':
	            return runProductEntryChat(parsed.input, getContracts());
	        }
      },
    },
	    resume: {
	      usage: 'opl resume [codex resume args...] [--executor hermes]',
	      summary: 'Resume a Codex session as a raw passthrough; use --executor hermes for explicit Hermes sessions.',
	      examples: [
	        'opl resume run_7e2a41a19175465f809c0a7f151278ee',
	        'opl resume --last',
	        'opl resume run_7e2a41a19175465f809c0a7f151278ee --executor hermes',
	      ],
	      handler: (args) => {
	        if (!hasExplicitHermesExecutor(args)) {
	          return runCodexPassthroughHandled(['resume', ...stripExplicitCodexExecutor(args)]);
	        }

	        const parsed = parseResumeArgs(args, commandSpecs.resume);
	        return runProductEntryResume(parsed.sessionId, parsed.executor);
	      },
	    },
    sessions: {
      usage: 'opl session list [--limit <n>] [--source <source>]',
      summary: 'List recent Hermes sessions through a machine-readable OPL product-entry surface.',
      examples: ['opl session list', 'opl session list --limit 10', 'opl session list --limit 10 --source api_server'],
      handler: (args) => runProductEntrySessions(parseSessionsArgs(args, commandSpecs.sessions)),
    },
    logs: {
      usage: 'opl session logs [log_name] [--lines <n>] [--since <cursor>] [--level <level>] [--component <name>] [--session <id>]',
      summary: 'Wrap Hermes log access in an OPL product-entry envelope for debugging and operations.',
      examples: ['opl session logs gateway', 'opl session logs gateway --lines 50', 'opl session logs worker --level info --component runtime'],
      handler: (args) => runProductEntryLogs(parseLogsArgs(args, commandSpecs.logs)),
    },
    'workspace list': {
      usage: 'opl workspace list',
      summary: 'Show the file-backed workspace registry for OPL and admitted domain project surfaces.',
      examples: ['opl workspace list'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['workspace list']);
        return buildWorkspaceCatalog(getContracts());
      },
    },
    'workspace root': {
      usage: 'opl workspace root',
      summary: 'Show the current OPL workspace root preference and its readiness state.',
      examples: ['opl workspace root'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['workspace root']);
        return buildFrontDeskWorkspaceRootSurface();
      },
    },
    'workspace root set': {
      usage: 'opl workspace root set --path <workspace_root>',
      summary: 'Persist the selected OPL workspace root for Initialize and GUI settings surfaces.',
      examples: ['opl workspace root set --path /Users/gaofeng/workspace'],
      handler: (args) => {
        const parsed = parseWorkspaceRootArgs(args, commandSpecs['workspace root set']);
        if (!parsed.path) {
          throw buildUsageError(
            'workspace root set requires --path.',
            commandSpecs['workspace root set'],
            { required: ['--path'] },
          );
        }

        return writeFrontDeskWorkspaceRootSurface(parsed.path);
      },
    },
    'workspace root doctor': {
      usage: 'opl workspace root doctor',
      summary: 'Re-read the current workspace root selection and report its health surface.',
      examples: ['opl workspace root doctor'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['workspace root doctor']);
        return buildFrontDeskWorkspaceRootSurface();
      },
    },
    'workspace-bind': {
      usage:
        'opl workspace bind --project <project_id> --path <workspace_path> [--label <label>] [--entry-command <command>] [--manifest-command <command>] [--entry-url <url>] [--workspace-root <dir>] [--profile <file>] [--input <file>]',
      summary:
        'Bind and activate one workspace for an admitted project, optionally freezing or deriving its direct-entry locator.',
      examples: [
        'opl workspace bind --project redcube --path /Users/gaofeng/workspace/redcube-ai',
        'opl workspace bind --project redcube --path /Users/gaofeng/workspace/redcube-ai --entry-command "redcube-ai frontdesk" --manifest-command "redcube product manifest --workspace-root /Users/gaofeng/workspace/redcube-ai" --entry-url http://127.0.0.1:3310/redcube',
        'opl workspace bind --project medautoscience --path /Users/gaofeng/workspace/med-autoscience --profile /Users/gaofeng/workspace/med-autoscience/profiles/local.toml',
        'opl workspace bind --project medautogrant --path /Users/gaofeng/workspace/med-autogrant --input /Users/gaofeng/workspace/med-autogrant/examples/nsfc_workspace_p2c_critique.json',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceRegistryArgs(args, commandSpecs['workspace-bind']);
        if (!parsed.projectId || !parsed.workspacePath) {
          throw buildUsageError(
            'workspace bind requires both --project and --path.',
            commandSpecs['workspace-bind'],
            { required: ['--project', '--path'] },
          );
        }

        return bindWorkspace(getContracts(), {
          projectId: parsed.projectId,
          workspacePath: parsed.workspacePath,
          label: parsed.label,
          entryCommand: parsed.entryCommand,
          manifestCommand: parsed.manifestCommand,
          entryUrl: parsed.entryUrl,
          workspaceRoot: parsed.workspaceRoot,
          profileRef: parsed.profileRef,
          inputPath: parsed.inputPath,
        });
      },
    },
    'workspace-activate': {
      usage: 'opl workspace activate --project <project_id> --path <workspace_path>',
      summary: 'Switch the active workspace binding for an admitted project.',
      examples: ['opl workspace activate --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      handler: (args) => {
        const parsed = parseWorkspaceRegistryArgs(args, commandSpecs['workspace-activate']);
        if (!parsed.projectId || !parsed.workspacePath) {
          throw buildUsageError(
            'workspace activate requires both --project and --path.',
            commandSpecs['workspace-activate'],
            { required: ['--project', '--path'] },
          );
        }

        return activateWorkspaceBinding(getContracts(), {
          projectId: parsed.projectId,
          workspacePath: parsed.workspacePath,
        });
      },
    },
    'workspace-archive': {
      usage: 'opl workspace archive --project <project_id> --path <workspace_path>',
      summary: 'Archive one workspace binding so OPL no longer treats it as active or reusable.',
      examples: ['opl workspace archive --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      handler: (args) => {
        const parsed = parseWorkspaceRegistryArgs(args, commandSpecs['workspace-archive']);
        if (!parsed.projectId || !parsed.workspacePath) {
          throw buildUsageError(
            'workspace archive requires both --project and --path.',
            commandSpecs['workspace-archive'],
            { required: ['--project', '--path'] },
          );
        }

        return archiveWorkspaceBinding(getContracts(), {
          projectId: parsed.projectId,
          workspacePath: parsed.workspacePath,
        });
      },
    },
    'session ledger': {
      usage: 'opl session ledger [--limit <n>]',
      summary: 'Show OPL-managed session events with honest resource samples captured at event time.',
      examples: ['opl session ledger', 'opl session ledger --limit 5'],
      handler: (args) => {
        const parsed = parseSessionLedgerArgs(args, commandSpecs['session ledger']);
        return buildSessionLedger(parsed.limit);
      },
    },
    'runtime repair-gateway': {
      usage: 'opl runtime repair-gateway',
      summary: 'Reinstall and recheck the Hermes gateway service used by the OPL product shell.',
      examples: ['opl runtime repair-gateway'],
      handler: () => runProductEntryRepairHermesGateway(),
    },
    'domain resolve-request': {
      usage: 'opl domain resolve-request --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      summary: 'Resolve a top-level request to an admitted workstream, domain boundary, or ambiguity envelope.',
      examples: [
        'opl domain resolve-request --intent presentation_delivery --target deliverable --goal "Prepare a defense-ready slide deck."',
      ],
      handler: (args) => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          resolution: resolveRequestSurface(
            parseKeyValueArgs(args, commandSpecs['domain resolve-request']),
            contracts,
          ),
        });
      },
    },
    'domain explain-boundary': {
      usage: 'opl domain explain-boundary --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      summary: 'Explain why a request routes to a domain, stays under definition, or stops at a family boundary.',
      examples: [
        'opl domain explain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
        'opl domain explain-boundary --intent create --target deliverable --goal "Grant proposal reviewer simulation and revision planning."',
      ],
      handler: (args) => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          boundary_explanation: explainDomainBoundary(
            parseKeyValueArgs(args, commandSpecs['domain explain-boundary']),
            contracts,
          ),
        });
      },
    },
    'contract handoff-envelope': {
      usage:
        'opl contract handoff-envelope <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--workspace-path <path>]',
      summary:
        'Build a machine-readable OPL family handoff bundle for the current request and active workspace bindings.',
      examples: [
        'opl contract handoff-envelope "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck',
        'opl contract handoff-envelope "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck --workspace-path /Users/gaofeng/workspace/redcube-ai',
      ],
      handler: (args) =>
        buildProductEntryHandoffEnvelope(
          parseProductEntryArgs(args, commandSpecs['contract handoff-envelope']),
          getContracts(),
        ),
    },
  };

  const publicCommandSpecs: Record<string, CommandSpec> = {
    help: {
      usage: 'opl help [command ...]',
      summary: 'Show the top-level command groups or command-scoped runnable examples.',
      examples: ['opl help', 'opl help status workspace', 'opl help service install'],
      group: 'top_level',
      handler: (args) => {
        if (args.length === 0) {
          return buildRootHelp(publicCommandSpecs);
        }

        const helpTarget = args.join(' ');
        const helpSpec = publicCommandSpecs[helpTarget];
        if (!helpSpec) {
          throw new GatewayContractError('unknown_command', `Unknown command: ${helpTarget}.`, {
            command: helpTarget,
            commands: Object.keys(publicCommandSpecs),
            usage: 'opl help',
          });
        }

        return buildCommandHelp(helpTarget, helpSpec);
      },
    },
    doctor: cloneCommandSpec(commandSpecs.doctor, { group: 'top_level' }),
    start: cloneCommandSpec(commandSpecs.start, { group: 'top_level' }),
	    ask: cloneCommandSpec(commandSpecs.ask, { group: 'top_level' }),
	    exec: cloneCommandSpec(commandSpecs.exec, { group: 'top_level' }),
	    chat: cloneCommandSpec(commandSpecs.chat, { group: 'top_level' }),
	    resume: cloneCommandSpec(commandSpecs.resume, { group: 'top_level' }),
	    web: cloneCommandSpec(commandSpecs.web, {
      summary: 'Start the local OPL Product API service for external GUI shells and API consumers.',
      group: 'top_level',
    }),
    'web bundle': cloneCommandSpec(commandSpecs['frontdesk hosted-bundle'], {
      usage:
        'opl web bundle [--host <host>] [--port <port>] [--path <workspace_path>] [--sessions-limit <n>] [--base-path <base_path>]',
      summary: 'Emit the hosted-pilot-ready OPL web bundle with base-path-aware entry and API endpoints.',
      examples: [
        'opl web bundle',
        'opl web bundle --host 0.0.0.0 --port 8787 --base-path /pilot/opl',
      ],
      group: 'web',
    }),
    'web package': cloneCommandSpec(commandSpecs['frontdesk hosted-package'], {
      usage:
        'opl web package --output <dir> [--public-origin <origin>] [--host <host>] [--port <port>] [--sessions-limit <n>] [--base-path <base_path>]',
      summary:
        'Export a self-hostable OPL web package with app snapshot, run script, service unit, and reverse-proxy assets.',
      examples: [
        'opl web package --output /tmp/opl-web-package',
        'opl web package --output /tmp/opl-web-package --public-origin https://opl.example.com',
      ],
      group: 'web',
    }),
    'mcp-stdio': cloneCommandSpec(commandSpecs['mcp-stdio'], { group: 'top_level' }),
    'status workspace': cloneCommandSpec(commandSpecs['status workspace'], {
      usage: 'opl status workspace [--path <workspace_path>]',
      examples: ['opl status workspace', 'opl status workspace --path /Users/gaofeng/workspace/redcube-ai'],
      group: 'status',
    }),
    'status runtime': cloneCommandSpec(commandSpecs['status runtime'], {
      usage: 'opl status runtime [--limit <n>]',
      examples: ['opl status runtime', 'opl status runtime --limit 10'],
      group: 'status',
    }),
    'status dashboard': cloneCommandSpec(commandSpecs.dashboard, {
      usage: 'opl status dashboard [--path <workspace_path>] [--sessions-limit <n>]',
      examples: [
        'opl status dashboard',
        'opl status dashboard --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 5',
      ],
      group: 'status',
    }),
    'workspace projects': cloneCommandSpec(commandSpecs.projects, {
      usage: 'opl workspace projects',
      examples: ['opl workspace projects'],
      group: 'workspace',
    }),
    'workspace list': cloneCommandSpec(commandSpecs['workspace list'], {
      usage: 'opl workspace list',
      examples: ['opl workspace list'],
      group: 'workspace',
    }),
    'workspace root': cloneCommandSpec(commandSpecs['workspace root'], {
      usage: 'opl workspace root',
      examples: ['opl workspace root'],
      group: 'workspace',
    }),
    'workspace root set': cloneCommandSpec(commandSpecs['workspace root set'], {
      usage: 'opl workspace root set --path <workspace_root>',
      examples: ['opl workspace root set --path /Users/gaofeng/workspace'],
      group: 'workspace',
    }),
    'workspace root doctor': cloneCommandSpec(commandSpecs['workspace root doctor'], {
      usage: 'opl workspace root doctor',
      examples: ['opl workspace root doctor'],
      group: 'workspace',
    }),
    'workspace bind': cloneCommandSpec(commandSpecs['workspace-bind'], {
      usage:
        'opl workspace bind --project <project_id> --path <workspace_path> [--label <label>] [--entry-command <command>] [--manifest-command <command>] [--entry-url <url>] [--workspace-root <dir>] [--profile <file>] [--input <file>]',
      examples: [
        'opl workspace bind --project redcube --path /Users/gaofeng/workspace/redcube-ai',
        'opl workspace bind --project medautoscience --path /Users/gaofeng/workspace/med-autoscience --profile /Users/gaofeng/workspace/med-autoscience/profiles/local.toml',
      ],
      group: 'workspace',
    }),
    'workspace activate': cloneCommandSpec(commandSpecs['workspace-activate'], {
      usage: 'opl workspace activate --project <project_id> --path <workspace_path>',
      examples: ['opl workspace activate --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      group: 'workspace',
    }),
    'workspace archive': cloneCommandSpec(commandSpecs['workspace-archive'], {
      usage: 'opl workspace archive --project <project_id> --path <workspace_path>',
      examples: ['opl workspace archive --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      group: 'workspace',
    }),
    'domain manifests': cloneCommandSpec(commandSpecs['domain manifests'], {
      usage: 'opl domain manifests',
      examples: ['opl domain manifests'],
      group: 'domain',
    }),
    'domain launch': cloneCommandSpec(commandSpecs['domain launch'], {
      usage:
        'opl domain launch --project <project_id> [--path <workspace_path>] [--strategy <auto|open_url|spawn_command>] [--dry-run]',
      examples: ['opl domain launch --project redcube --dry-run'],
      group: 'domain',
    }),
    'domain resolve-request': cloneCommandSpec(commandSpecs['domain resolve-request'], {
      usage:
        'opl domain resolve-request --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      examples: [
        'opl domain resolve-request --intent presentation_delivery --target deliverable --goal "Prepare a defense-ready slide deck."',
      ],
      group: 'domain',
    }),
    'domain explain-boundary': cloneCommandSpec(commandSpecs['domain explain-boundary'], {
      usage:
        'opl domain explain-boundary --intent <intent> --target <target> --goal <goal> [--preferred-family <family>] [--request-kind <kind>]',
      examples: [
        'opl domain explain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
      ],
      group: 'domain',
    }),
    'contract validate': cloneCommandSpec(commandSpecs['validate-contracts'], {
      usage: 'opl contract validate',
      examples: ['opl contract validate'],
      group: 'contract',
    }),
    'contract workstreams': cloneCommandSpec(commandSpecs['list-workstreams'], {
      usage: 'opl contract workstreams',
      examples: ['opl contract workstreams'],
      group: 'contract',
    }),
    'contract workstream': cloneCommandSpec(commandSpecs['get-workstream'], {
      usage: 'opl contract workstream <workstream_id>',
      examples: ['opl contract workstream research_ops', 'opl contract workstream presentation_ops'],
      group: 'contract',
      handler: (args) => {
        const [workstreamId] = args;
        if (!workstreamId) {
          throw buildUsageError('contract workstream requires a workstream id.', publicCommandSpecs['contract workstream'], {
            required: ['workstream_id'],
          });
        }

        const contracts = getContracts();
        return withContractsContext(contracts, {
          workstream: findWorkstreamOrThrow(contracts, workstreamId),
        });
      },
    }),
    'contract domains': cloneCommandSpec(commandSpecs['list-domains'], {
      usage: 'opl contract domains',
      examples: ['opl contract domains'],
      group: 'contract',
    }),
    'contract domain': cloneCommandSpec(commandSpecs['get-domain'], {
      usage: 'opl contract domain <domain_id>',
      examples: ['opl contract domain medautoscience', 'opl contract domain redcube'],
      group: 'contract',
      handler: (args) => {
        const [domainId] = args;
        if (!domainId) {
          throw buildUsageError('contract domain requires a domain id.', publicCommandSpecs['contract domain'], {
            required: ['domain_id'],
          });
        }

        const contracts = getContracts();
        return withContractsContext(contracts, {
          domain: findDomainOrThrow(contracts, domainId),
        });
      },
    }),
    'contract surfaces': cloneCommandSpec(commandSpecs['list-surfaces'], {
      usage: 'opl contract surfaces',
      examples: ['opl contract surfaces'],
      group: 'contract',
    }),
    'contract surface': cloneCommandSpec(commandSpecs['get-surface'], {
      usage: 'opl contract surface <surface_id>',
      examples: ['opl contract surface opl_gateway_contract_hub'],
      group: 'contract',
      handler: (args) => {
        const [surfaceId] = args;
        if (!surfaceId) {
          throw buildUsageError('contract surface requires a surface id.', publicCommandSpecs['contract surface'], {
            required: ['surface_id'],
          });
        }

        const contracts = getContracts();
        return withContractsContext(contracts, {
          surface: findSurfaceOrThrow(contracts, surfaceId),
        });
      },
    }),
    'contract handoff-envelope': cloneCommandSpec(commandSpecs['contract handoff-envelope'], {
      usage:
        'opl contract handoff-envelope <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--workspace-path <path>]',
      examples: [
        'opl contract handoff-envelope "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck',
      ],
      group: 'contract',
    }),
    system: cloneCommandSpec(commandSpecs['frontdesk environment'], {
      usage: 'opl system',
      summary: 'Show the user-facing OPL system surface: core engines, local service, and managed install paths.',
      examples: ['opl system'],
      group: 'system',
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['frontdesk environment']);
        return buildPublicSystemPayload(await buildFrontDeskEnvironment(getContracts()));
      },
    }),
    'system initialize': cloneCommandSpec(commandSpecs['frontdesk initialize'], {
      usage: 'opl system initialize',
      examples: ['opl system initialize'],
      group: 'system',
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['frontdesk initialize']);
        return buildPublicSystemInitializePayload(await buildFrontDeskInitialize(getContracts()));
      },
    }),
    'system repair': cloneCommandSpec(commandSpecs['frontdesk repair'], {
      usage: 'opl system repair',
      examples: ['opl system repair'],
      group: 'system',
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['frontdesk repair']);
        return buildPublicSystemActionPayload(await runFrontDeskSystemAction(getContracts(), 'repair'));
      },
    }),
    'system reinstall-support': cloneCommandSpec(commandSpecs['frontdesk reinstall-support'], {
      usage:
        'opl system reinstall-support [--host <host>] [--port <port>] [--path <workspace_path>] [--sessions-limit <n>] [--base-path <base_path>]',
      examples: ['opl system reinstall-support', 'opl system reinstall-support --port 8787'],
      group: 'system',
      handler: async (args) =>
        buildPublicSystemActionPayload(
          await runFrontDeskSystemAction(
            getContracts(),
            'reinstall_support',
            parseWebArgs(args, commandSpecs['frontdesk reinstall-support']),
          ),
        ),
    }),
    'system update-channel': cloneCommandSpec(commandSpecs['frontdesk update-channel'], {
      usage: 'opl system update-channel [--channel <stable|preview>]',
      examples: ['opl system update-channel', 'opl system update-channel --channel preview'],
      group: 'system',
      handler: async (args) => {
        const parsed = parseUpdateChannelArgs(args, commandSpecs['frontdesk update-channel']);
        return buildPublicSystemActionPayload(
          await runFrontDeskSystemAction(getContracts(), 'update_channel', parsed),
        );
      },
    }),
    modules: cloneCommandSpec(commandSpecs['frontdesk modules'], {
      usage: 'opl modules',
      examples: ['opl modules'],
      group: 'module',
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk modules']);
        return buildPublicModulesPayload(buildFrontDeskModules());
      },
    }),
    'module install': cloneCommandSpec(commandSpecs['frontdesk-module-install'], {
      usage: 'opl module install --module <module_id>',
      examples: ['opl module install --module medautoscience'],
      group: 'module',
      handler: (args) =>
        buildPublicModuleActionPayload(
          runFrontDeskModuleAction('install', parseFrontDeskModuleArgs(args, commandSpecs['frontdesk-module-install']).moduleId!),
        ),
    }),
    'module update': cloneCommandSpec(commandSpecs['frontdesk-module-update'], {
      usage: 'opl module update --module <module_id>',
      examples: ['opl module update --module medautoscience'],
      group: 'module',
      handler: (args) =>
        buildPublicModuleActionPayload(
          runFrontDeskModuleAction('update', parseFrontDeskModuleArgs(args, commandSpecs['frontdesk-module-update']).moduleId!),
        ),
    }),
    'module reinstall': cloneCommandSpec(commandSpecs['frontdesk-module-reinstall'], {
      usage: 'opl module reinstall --module <module_id>',
      examples: ['opl module reinstall --module medautoscience'],
      group: 'module',
      handler: (args) =>
        buildPublicModuleActionPayload(
          runFrontDeskModuleAction('reinstall', parseFrontDeskModuleArgs(args, commandSpecs['frontdesk-module-reinstall']).moduleId!),
        ),
    }),
    'module remove': cloneCommandSpec(commandSpecs['frontdesk-module-remove'], {
      usage: 'opl module remove --module <module_id>',
      examples: ['opl module remove --module medautoscience'],
      group: 'module',
      handler: (args) =>
        buildPublicModuleActionPayload(
          runFrontDeskModuleAction('remove', parseFrontDeskModuleArgs(args, commandSpecs['frontdesk-module-remove']).moduleId!),
        ),
    }),
    'engine install': cloneCommandSpec(commandSpecs['frontdesk engine install'], {
      usage: 'opl engine install --engine <codex|hermes>',
      examples: ['opl engine install --engine codex'],
      group: 'engine',
      handler: async (args) =>
        buildPublicEngineActionPayload(
          await runFrontDeskEngineAction(
            getContracts(),
            'install',
            parseFrontDeskEngineArgs(args, commandSpecs['frontdesk engine install']).engineId!,
          ),
        ),
    }),
    'engine update': cloneCommandSpec(commandSpecs['frontdesk engine update'], {
      usage: 'opl engine update --engine <codex|hermes>',
      examples: ['opl engine update --engine codex'],
      group: 'engine',
      handler: async (args) =>
        buildPublicEngineActionPayload(
          await runFrontDeskEngineAction(
            getContracts(),
            'update',
            parseFrontDeskEngineArgs(args, commandSpecs['frontdesk engine update']).engineId!,
          ),
        ),
    }),
    'engine reinstall': cloneCommandSpec(commandSpecs['frontdesk engine reinstall'], {
      usage: 'opl engine reinstall --engine <codex|hermes>',
      examples: ['opl engine reinstall --engine codex'],
      group: 'engine',
      handler: async (args) =>
        buildPublicEngineActionPayload(
          await runFrontDeskEngineAction(
            getContracts(),
            'reinstall',
            parseFrontDeskEngineArgs(args, commandSpecs['frontdesk engine reinstall']).engineId!,
          ),
        ),
    }),
    'engine remove': cloneCommandSpec(commandSpecs['frontdesk engine remove'], {
      usage: 'opl engine remove --engine <codex|hermes>',
      examples: ['opl engine remove --engine hermes'],
      group: 'engine',
      handler: async (args) =>
        buildPublicEngineActionPayload(
          await runFrontDeskEngineAction(
            getContracts(),
            'remove',
            parseFrontDeskEngineArgs(args, commandSpecs['frontdesk engine remove']).engineId!,
          ),
        ),
    }),
    'service install': cloneCommandSpec(commandSpecs['frontdesk-service-install'], {
      usage:
        'opl service install [--host <host>] [--port <port>] [--path <workspace_path>] [--sessions-limit <n>] [--base-path <base_path>]',
      summary: 'Install and bootstrap a local launchd-managed OPL API service for long-running desktop entry.',
      examples: ['opl service install', 'opl service install --port 8787'],
      group: 'service',
      handler: async (args) =>
        buildPublicServicePayload(
          await installFrontDeskService(getContracts(), parseWebArgs(args, commandSpecs['frontdesk-service-install'])),
        ),
    }),
    'service status': cloneCommandSpec(commandSpecs['frontdesk-service-status'], {
      usage: 'opl service status',
      summary: 'Inspect whether the local OPL API service is installed, loaded, and reachable.',
      examples: ['opl service status'],
      group: 'service',
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-status']);
        return buildPublicServicePayload(await getFrontDeskServiceStatus(getContracts()));
      },
    }),
    'service start': cloneCommandSpec(commandSpecs['frontdesk-service-start'], {
      usage: 'opl service start',
      summary: 'Start the installed local OPL API service.',
      examples: ['opl service start'],
      group: 'service',
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-start']);
        return buildPublicServicePayload(await startFrontDeskService(getContracts()));
      },
    }),
    'service stop': cloneCommandSpec(commandSpecs['frontdesk-service-stop'], {
      usage: 'opl service stop',
      summary: 'Stop the installed local OPL API service without removing its packaging files.',
      examples: ['opl service stop'],
      group: 'service',
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-stop']);
        return buildPublicServicePayload(await stopFrontDeskService(getContracts()));
      },
    }),
    'service open': cloneCommandSpec(commandSpecs['frontdesk-service-open'], {
      usage: 'opl service open',
      summary: 'Open the configured local OPL API URL in the default browser.',
      examples: ['opl service open'],
      group: 'service',
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-open']);
        return buildPublicServicePayload(await openFrontDeskService(getContracts()));
      },
    }),
    'service uninstall': cloneCommandSpec(commandSpecs['frontdesk-service-uninstall'], {
      usage: 'opl service uninstall',
      summary: 'Remove the local launchd-managed OPL API service packaging.',
      examples: ['opl service uninstall'],
      group: 'service',
      handler: async (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-service-uninstall']);
        return buildPublicServicePayload(await uninstallFrontDeskService(getContracts()));
      },
    }),
    'session list': cloneCommandSpec(commandSpecs.sessions, {
      usage: 'opl session list [--limit <n>] [--source <source>]',
      examples: ['opl session list', 'opl session list --limit 10'],
      group: 'session',
    }),
	    'session resume': cloneCommandSpec(commandSpecs.resume, {
	      usage: 'opl session resume <session_id> [--executor <codex|hermes>]',
	      examples: [
	        'opl session resume run_7e2a41a19175465f809c0a7f151278ee',
	        'opl session resume run_7e2a41a19175465f809c0a7f151278ee --executor hermes',
	      ],
	      summary: 'Compatibility alias for opl resume; default route is raw codex resume.',
	      group: 'session',
	    }),
    'session logs': cloneCommandSpec(commandSpecs.logs, {
      usage: 'opl session logs [log_name] [--lines <n>] [--since <cursor>] [--level <level>] [--component <name>] [--session <id>]',
      examples: ['opl session logs gateway', 'opl session logs worker --level info --component runtime'],
      group: 'session',
    }),
    'session runtime': cloneCommandSpec(commandSpecs['session runtime'], {
      usage: 'opl session runtime --acp',
      examples: ['opl session runtime --acp'],
      group: 'session',
    }),
    shell: cloneCommandSpec(commandSpecs.shell, {
      usage:
        'opl shell <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--executor <codex|hermes>] [--workspace-path <path>] [--dry-run]',
      examples: [
        'opl shell "@mas tighten the manuscript argument around invasive phenotype findings"',
        'opl shell "@mas tighten the manuscript argument around invasive phenotype findings" --executor hermes',
        'opl shell "@rca build a defense-ready deck for next week" --workspace-path /Users/gaofeng/workspace/redcube-ai',
      ],
    }),
    'session ledger': cloneCommandSpec(commandSpecs['session ledger'], {
      usage: 'opl session ledger [--limit <n>]',
      examples: ['opl session ledger', 'opl session ledger --limit 5'],
      group: 'session',
    }),
    'runtime repair-gateway': cloneCommandSpec(commandSpecs['runtime repair-gateway'], {
      usage: 'opl runtime repair-gateway',
      examples: ['opl runtime repair-gateway'],
      group: 'runtime',
    }),
  };

  const dispatchCommandSpecs: Record<string, CommandSpec> = {
    ...publicCommandSpecs,
  };

  const inputTokens = parsedInput.command ? [parsedInput.command, ...parsedInput.args] : [];

	  if (inputTokens.length === 0) {
	    if (parsedInput.helpRequested) {
	      printJson(buildRootHelp(publicCommandSpecs));
	      return;
	    }

	    runCodexPassthroughHandled([]);
	    return;
	  }

  const resolved = resolveCommandSpec(inputTokens, dispatchCommandSpecs);
	  if (!resolved) {
	    const [command, ...args] = inputTokens;
	    if (!parsedInput.helpRequested && command && !RETIRED_COMMAND_PREFIXES.has(command) && command.startsWith('@')) {
	      const result = await runProductEntryAsk(
	        parseProductEntryArgs([command, ...args], commandSpecs.ask),
	        getContracts(),
	      );
	      printJson(result);
	      return;
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
