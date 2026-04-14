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
  buildProductEntryHandoffEnvelope,
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
import { launchDomainEntry, type DomainLaunchStrategy } from './domain-launch.ts';
import {
  buildDomainManifestCatalog,
} from './domain-manifest.ts';
import {
  buildFrontDeskDashboard,
  buildFrontDeskDomainWiring,
  buildHostedPilotBundle,
  buildFrontDeskManifest,
  buildPaperclipControlPlaneStatus,
  buildProjectsOverview,
  buildRuntimeStatus,
  buildFrontDeskStart,
  buildWorkspaceStatus,
} from './management.ts';
import { buildHostedPilotPackage } from './hosted-pilot-package.ts';
import { buildLibreChatPilotPackage } from './librechat-pilot-package.ts';
import { buildSessionLedger } from './session-ledger.ts';
import { explainDomainBoundary, resolveRequestSurface } from './resolver.ts';
import {
  activateWorkspaceBinding,
  archiveWorkspaceBinding,
  bindWorkspace,
  buildWorkspaceCatalog,
} from './workspace-registry.ts';
import {
  buildPaperclipBootstrap,
  bindPaperclipProject,
  configurePaperclipControlPlane,
  openPaperclipGate,
  openPaperclipTask,
  runPaperclipOperatorLoop,
  syncPaperclipProjections,
} from './paperclip-control-plane.ts';
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
};

type WebCliInput = {
  host?: string;
  port?: number;
  workspacePath?: string;
  sessionsLimit?: number;
  basePath?: string;
};

type HostedPilotPackageCliInput = {
  outputDir: string;
  publicOrigin?: string;
  host?: string;
  port?: number;
  basePath?: string;
  sessionsLimit?: number;
};

type PaperclipConfigCliInput = {
  baseUrl?: string;
  authHeaderEnv?: string;
  cookieEnv?: string;
  controlCompanyId?: string;
};

type PaperclipBindCliInput = {
  projectId?: string;
  companyId?: string;
  paperclipProjectId?: string;
  projectWorkspaceId?: string;
  executionWorkspacePreference?: string;
};

type PaperclipTaskCliInput = ProductEntryCliInput & {
  title?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
};

type PaperclipGateCliInput = ProductEntryCliInput & {
  title?: string;
  gateKind?: string;
  decisionOptions?: string[];
};

type PaperclipSyncCliInput = {
  issueId?: string;
  projectId?: string;
  workspacePath?: string;
  sessionsLimit?: number;
  all: boolean;
  force: boolean;
};

type PaperclipOperatorLoopCliInput = PaperclipSyncCliInput & {
  intervalMs?: number;
  cycles?: number;
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
        throw buildUsageError(`Unknown option for session-ledger: ${token}.`, spec, {
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
        throw buildUsageError(`Unknown option for launch-domain: ${token}.`, spec, {
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

function parsePaperclipConfigArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): PaperclipConfigCliInput {
  const parsed: PaperclipConfigCliInput = {};

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
      case '--base-url':
        parsed.baseUrl = value;
        break;
      case '--auth-header-env':
        parsed.authHeaderEnv = value;
        break;
      case '--cookie-env':
        parsed.cookieEnv = value;
        break;
      case '--control-company-id':
        parsed.controlCompanyId = value;
        break;
      default:
        throw buildUsageError(`Unknown option for Paperclip config: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function parsePaperclipBindArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): PaperclipBindCliInput {
  const parsed: PaperclipBindCliInput = {};

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
      case '--company-id':
        parsed.companyId = value;
        break;
      case '--paperclip-project-id':
        parsed.paperclipProjectId = value;
        break;
      case '--project-workspace-id':
        parsed.projectWorkspaceId = value;
        break;
      case '--execution-workspace':
        parsed.executionWorkspacePreference = value;
        break;
      default:
        throw buildUsageError(`Unknown option for Paperclip bind: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function parsePaperclipTaskArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): PaperclipTaskCliInput {
  let dryRun = false;
  let explicitGoal: string | undefined;
  const positionalGoalParts: string[] = [];
  const parsed: Omit<PaperclipTaskCliInput, 'goal' | 'dryRun'> = {
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
      case '--title':
        parsed.title = value;
        break;
      case '--priority':
        if (!['critical', 'high', 'medium', 'low'].includes(value)) {
          throw buildUsageError('Unsupported Paperclip task priority.', spec, {
            option: token,
            priority: value,
            allowed_values: ['critical', 'high', 'medium', 'low'],
          });
        }
        parsed.priority = value as PaperclipTaskCliInput['priority'];
        break;
      default:
        throw buildUsageError(`Unknown option for Paperclip task: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  if (explicitGoal && positionalGoalParts.length > 0) {
    throw buildUsageError(
      'Use either a positional request or --goal for the Paperclip task, not both.',
      spec,
      {
        positional_request: positionalGoalParts.join(' '),
      },
    );
  }

  const goal = (explicitGoal ?? positionalGoalParts.join(' ')).trim();
  if (!goal) {
    throw buildUsageError(
      'paperclip-open-task requires a plain-language request, either as positional text or via --goal.',
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

function parsePaperclipGateArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): PaperclipGateCliInput {
  let dryRun = false;
  let explicitGoal: string | undefined;
  const positionalGoalParts: string[] = [];
  const parsed: Omit<PaperclipGateCliInput, 'goal' | 'dryRun'> = {
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
      case '--title':
        parsed.title = value;
        break;
      case '--gate-kind':
        parsed.gateKind = value;
        break;
      case '--decision-options':
        parsed.decisionOptions = value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
        break;
      default:
        throw buildUsageError(`Unknown option for Paperclip gate: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  if (explicitGoal && positionalGoalParts.length > 0) {
    throw buildUsageError(
      'Use either a positional request or --goal for the Paperclip gate, not both.',
      spec,
      {
        positional_request: positionalGoalParts.join(' '),
      },
    );
  }

  const goal = (explicitGoal ?? positionalGoalParts.join(' ')).trim();
  if (!goal) {
    throw buildUsageError(
      'paperclip-open-gate requires a plain-language request, either as positional text or via --goal.',
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

function parsePaperclipSyncArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): PaperclipSyncCliInput {
  const parsed: PaperclipSyncCliInput = {
    all: false,
    force: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--force') {
      parsed.force = true;
      continue;
    }

    if (token === '--all') {
      parsed.all = true;
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
      case '--issue-id':
        parsed.issueId = value;
        break;
      case '--project':
        parsed.projectId = value;
        break;
      case '--path':
        parsed.workspacePath = value;
        break;
      case '--sessions-limit': {
        const parsedLimit = Number.parseInt(value, 10);
        if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
          throw buildUsageError('Paperclip sync expects a positive integer --sessions-limit.', spec, {
            option: token,
            value,
          });
        }
        parsed.sessionsLimit = parsedLimit;
        break;
      }
      default:
        throw buildUsageError(`Unknown option for Paperclip sync: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function parsePaperclipOperatorLoopArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): PaperclipOperatorLoopCliInput {
  const parsed: PaperclipOperatorLoopCliInput = {
    all: false,
    force: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--force') {
      parsed.force = true;
      continue;
    }

    if (token === '--all') {
      parsed.all = true;
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
      case '--issue-id':
        parsed.issueId = value;
        break;
      case '--project':
        parsed.projectId = value;
        break;
      case '--path':
        parsed.workspacePath = value;
        break;
      case '--sessions-limit': {
        const parsedLimit = Number.parseInt(value, 10);
        if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
          throw buildUsageError('Paperclip operator loop expects a positive integer --sessions-limit.', spec, {
            option: token,
            value,
          });
        }
        parsed.sessionsLimit = parsedLimit;
        break;
      }
      case '--interval-ms': {
        const parsedInterval = Number.parseInt(value, 10);
        if (!Number.isInteger(parsedInterval) || parsedInterval <= 0) {
          throw buildUsageError('Paperclip operator loop expects a positive integer --interval-ms.', spec, {
            option: token,
            value,
          });
        }
        parsed.intervalMs = parsedInterval;
        break;
      }
      case '--cycles': {
        const parsedCycles = Number.parseInt(value, 10);
        if (!Number.isInteger(parsedCycles) || parsedCycles < 0) {
          throw buildUsageError('Paperclip operator loop expects a non-negative integer --cycles.', spec, {
            option: token,
            value,
          });
        }
        parsed.cycles = parsedCycles;
        break;
      }
      default:
        throw buildUsageError(`Unknown option for Paperclip operator loop: ${token}.`, spec, {
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
        'opl frontdesk-domain-wiring',
        'opl frontdesk-hosted-bundle --base-path /pilot/opl',
        'opl frontdesk-hosted-package --output /tmp/opl-hosted-package --public-origin https://opl.example.com --base-path /pilot/opl',
        'opl frontdesk-librechat-package --output /tmp/opl-librechat-pilot --public-origin https://opl.example.com --base-path /pilot/opl',
        'opl frontdesk-service-install --port 8787',
        'opl workspace-bind --project redcube --path /Users/gaofeng/workspace/redcube-ai --entry-command "redcube-ai frontdesk" --manifest-command "redcube product manifest --workspace-root /Users/gaofeng/workspace/redcube-ai"',
        'opl launch-domain --project redcube --dry-run',
        'opl paperclip-config --base-url https://paperclip.example.com --auth-header-env OPL_PAPERCLIP_AUTH_HEADER --control-company-id company-opl-control',
        'opl paperclip-bind --project redcube --company-id company-redcube --paperclip-project-id project-redcube --project-workspace-id workspace-redcube --execution-workspace shared_workspace',
        'opl paperclip-open-task "Prepare a defense-ready slide deck." --preferred-family ppt_deck --workspace-path /Users/gaofeng/workspace/redcube-ai --priority high',
        'opl handoff-envelope "Prepare a defense-ready slide deck." --preferred-family ppt_deck',
        'opl workspace-status --path /Users/gaofeng/workspace/redcube-ai',
        'opl runtime-status --limit 10',
        'opl dashboard --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 5',
        'opl web --host 127.0.0.1 --port 8787 --base-path /pilot/opl --path /Users/gaofeng/workspace/one-person-lab',
        'opl "Plan a medical grant proposal revision loop."',
        'opl ask "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck --workspace-path /Users/gaofeng/workspace/redcube-ai',
        'opl chat "Plan a medical grant proposal revision loop." --workspace-path /Users/gaofeng/workspace/med-autogrant',
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
    'launch-domain': {
      usage:
        'opl launch-domain --project <project_id> [--path <workspace_path>] [--strategy <auto|open_url|spawn_command>] [--dry-run]',
      summary:
        'Invoke one already-bound domain direct-entry locator without upgrading OPL into runtime ownership.',
      examples: [
        'opl launch-domain --project redcube --dry-run',
        'opl launch-domain --project redcube --strategy open_url',
        'opl launch-domain --project med-autogrant --path /Users/gaofeng/workspace/med-autogrant --strategy spawn_command',
      ],
      handler: (args) => {
        const parsed = parseLaunchDomainArgs(args, commandSpecs['launch-domain']);
        if (!parsed.projectId) {
          throw buildUsageError(
            'launch-domain requires --project.',
            commandSpecs['launch-domain'],
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
    'paperclip-config': {
      usage:
        'opl paperclip-config [--base-url <url>] [--auth-header-env <env>] [--cookie-env <env>] [--control-company-id <company_id>]',
      summary: 'Configure the downstream Paperclip control-plane connection OPL will use for tasks and gates.',
      examples: [
        'opl paperclip-config --base-url https://paperclip.example.com --auth-header-env OPL_PAPERCLIP_AUTH_HEADER --control-company-id company-opl-control',
      ],
      handler: (args) => {
        const contracts = getContracts();
        return withContractsContext(contracts, {
          paperclip_control_plane: {
            action: 'config',
            ...configurePaperclipControlPlane(contracts, parsePaperclipConfigArgs(args, commandSpecs['paperclip-config'])),
          },
        });
      },
    },
    'paperclip-bind': {
      usage:
        'opl paperclip-bind --project <project_id> --company-id <company_id> [--paperclip-project-id <project_id>] [--project-workspace-id <workspace_id>] [--execution-workspace <mode>]',
      summary: 'Bind one admitted OPL project surface to its downstream Paperclip company/project/workspace mapping.',
      examples: [
        'opl paperclip-bind --project redcube --company-id company-redcube --paperclip-project-id project-redcube --project-workspace-id workspace-redcube --execution-workspace shared_workspace',
      ],
      handler: (args) => {
        const parsed = parsePaperclipBindArgs(args, commandSpecs['paperclip-bind']);
        if (!parsed.projectId || !parsed.companyId) {
          throw buildUsageError(
            'paperclip-bind requires both --project and --company-id.',
            commandSpecs['paperclip-bind'],
            { required: ['--project', '--company-id'] },
          );
        }

        const contracts = getContracts();
        return withContractsContext(contracts, {
          paperclip_control_plane: {
            action: 'bind',
            ...bindPaperclipProject(contracts, {
              projectId: parsed.projectId,
              companyId: parsed.companyId,
              paperclipProjectId: parsed.paperclipProjectId,
              projectWorkspaceId: parsed.projectWorkspaceId,
              executionWorkspacePreference: parsed.executionWorkspacePreference,
            }),
          },
        });
      },
    },
    'paperclip-status': {
      usage: 'opl paperclip-status [--path <workspace_path>] [--sessions-limit <n>]',
      summary: 'Aggregate the current OPL -> Paperclip bridge status together with the family dashboard it exposes.',
      examples: [
        'opl paperclip-status',
        'opl paperclip-status --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 5',
      ],
      handler: (args) => buildPaperclipControlPlaneStatus(getContracts(), parseDashboardArgs(args, commandSpecs['paperclip-status'])),
    },
    'paperclip-bootstrap': {
      usage: 'opl paperclip-bootstrap',
      summary: 'Show the operator bootstrap surface for Paperclip preflight, SOP loops, and sync endpoints.',
      examples: ['opl paperclip-bootstrap'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['paperclip-bootstrap']);
        const contracts = getContracts();
        const result = buildPaperclipBootstrap(contracts);
        return withContractsContext(contracts, {
          paperclip_control_plane: {
            action: 'bootstrap',
            ...result.controlPlane,
          },
          paperclip_bootstrap: result.bootstrap,
        });
      },
    },
    'paperclip-open-task': {
      usage:
        'opl paperclip-open-task <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--workspace-path <path>] [--title <title>] [--priority <priority>]',
      summary: 'Route an OPL request, freeze its handoff bundle, and create the corresponding Paperclip issue in the mapped project company.',
      examples: [
        'opl paperclip-open-task "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck --workspace-path /Users/gaofeng/workspace/redcube-ai --priority high',
      ],
      handler: async (args) => {
        const contracts = getContracts();
        const parsed = parsePaperclipTaskArgs(args, commandSpecs['paperclip-open-task']);
        const result = await openPaperclipTask(parsed, contracts, {
          title: parsed.title,
          priority: parsed.priority,
        });

        return withContractsContext(contracts, {
          paperclip_control_plane: {
            action: 'open_task',
            ...result.controlPlane,
          },
          paperclip_task: {
            project_binding: result.projectBinding,
            handoff_bundle: result.handoffBundle,
            issue: result.issue,
            tracked_projection: result.trackedProjection,
          },
        });
      },
    },
    'paperclip-open-gate': {
      usage:
        'opl paperclip-open-gate <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--workspace-path <path>] [--title <title>] [--gate-kind <kind>] [--decision-options <csv>]',
      summary: 'Route an OPL request and open a downstream Paperclip board-approval gate using the family-human-gate contract.',
      examples: [
        'opl paperclip-open-gate "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck --gate-kind publish_readiness',
      ],
      handler: async (args) => {
        const contracts = getContracts();
        const parsed = parsePaperclipGateArgs(args, commandSpecs['paperclip-open-gate']);
        const result = await openPaperclipGate(parsed, contracts, {
          title: parsed.title,
          gateKind: parsed.gateKind,
          decisionOptions: parsed.decisionOptions,
        });

        return withContractsContext(contracts, {
          paperclip_control_plane: {
            action: 'open_gate',
            ...result.controlPlane,
          },
          paperclip_gate: {
            handoff_bundle: result.handoffBundle,
            family_human_gate: result.familyHumanGate,
            issue: result.issue,
            approval: result.approval,
            tracked_projection: result.trackedProjection,
          },
        });
      },
    },
    'paperclip-sync': {
      usage:
        'opl paperclip-sync [--issue-id <issue_id>] [--project <project_id>] [--path <workspace_path>] [--sessions-limit <n>] [--force]',
      summary: 'Pull remote Paperclip issue / approval state back into OPL tracked projections, then write the latest OPL audit snapshot into downstream issue comments.',
      examples: [
        'opl paperclip-sync --all',
        'opl paperclip-sync --issue-id issue-1 --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 5',
      ],
      handler: async (args) => {
        const contracts = getContracts();
        const parsed = parsePaperclipSyncArgs(args, commandSpecs['paperclip-sync']);
        const result = await syncPaperclipProjections(contracts, {
          issueId: parsed.issueId,
          projectId: parsed.projectId,
          workspacePath: parsed.workspacePath,
          sessionsLimit: parsed.sessionsLimit,
          force: parsed.force,
        });

        return withContractsContext(contracts, {
          paperclip_control_plane: {
            action: 'sync',
            ...result.controlPlane,
          },
          paperclip_sync: result.sync,
        });
      },
    },
    'paperclip-operator-loop': {
      usage:
        'opl paperclip-operator-loop [--issue-id <issue_id>] [--project <project_id>] [--path <workspace_path>] [--sessions-limit <n>] [--interval-ms <n>] [--cycles <n>] [--force]',
      summary: 'Run the local file-backed Paperclip operator loop that repeatedly reconciles remote approval state and audit syncs.',
      examples: [
        'opl paperclip-operator-loop --project redcube --path /Users/gaofeng/workspace/redcube-ai --interval-ms 30000',
        'opl paperclip-operator-loop --issue-id issue-1 --path /Users/gaofeng/workspace/one-person-lab --interval-ms 1000 --cycles 2',
      ],
      handler: async (args) => {
        const contracts = getContracts();
        const parsed = parsePaperclipOperatorLoopArgs(args, commandSpecs['paperclip-operator-loop']);
        const result = await runPaperclipOperatorLoop(contracts, {
          issueId: parsed.issueId,
          projectId: parsed.projectId,
          workspacePath: parsed.workspacePath,
          sessionsLimit: parsed.sessionsLimit,
          intervalMs: parsed.intervalMs,
          cycles: parsed.cycles,
          force: parsed.force,
        });

        return withContractsContext(contracts, {
          paperclip_control_plane: {
            action: 'operator_loop',
            ...result.controlPlane,
          },
          paperclip_operator_loop: result.operatorLoop,
        });
      },
    },
    'domain-manifests': {
      usage: 'opl domain-manifests',
      summary:
        'Resolve the active admitted-domain manifest_command bindings into machine-readable product-entry discovery surfaces.',
      examples: ['opl domain-manifests'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['domain-manifests']);
        return buildDomainManifestCatalog(getContracts());
      },
    },
    'frontdesk-manifest': {
      usage: 'opl frontdesk-manifest',
      summary:
        'Expose the hosted-friendly OPL front-desk shell contract without claiming hosted packaging is already landed.',
      examples: ['opl frontdesk-manifest'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-manifest']);
        return buildFrontDeskManifest(getContracts());
      },
    },
    'frontdesk-domain-wiring': {
      usage: 'opl frontdesk-domain-wiring',
      summary:
        'Expose the hosted-friendly family wiring surface that freezes runtime readiness, domain entry parity, and recommended entry surfaces.',
      examples: ['opl frontdesk-domain-wiring'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['frontdesk-domain-wiring']);
        return buildFrontDeskDomainWiring(getContracts());
      },
    },
    'frontdesk-hosted-bundle': {
      usage:
        'opl frontdesk-hosted-bundle [--host <host>] [--port <port>] [--path <workspace_path>] [--sessions-limit <n>] [--base-path <base_path>]',
      summary:
        'Emit the hosted-pilot-ready front-desk bundle with base-path-aware entry and API endpoints.',
      examples: [
        'opl frontdesk-hosted-bundle',
        'opl frontdesk-hosted-bundle --host 0.0.0.0 --port 8787 --base-path /pilot/opl',
        'opl frontdesk-hosted-bundle --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 9',
      ],
      handler: (args) =>
        buildHostedPilotBundle(getContracts(), parseWebArgs(args, commandSpecs['frontdesk-hosted-bundle'])),
    },
    'frontdesk-hosted-package': {
      usage:
        'opl frontdesk-hosted-package --output <dir> [--public-origin <origin>] [--host <host>] [--port <port>] [--sessions-limit <n>] [--base-path <base_path>]',
      summary:
        'Export a self-hostable hosted pilot package with app snapshot, run script, service unit, and reverse-proxy assets.',
      examples: [
        'opl frontdesk-hosted-package --output /tmp/opl-frontdesk-package',
        'opl frontdesk-hosted-package --output /tmp/opl-frontdesk-package --public-origin https://opl.example.com --base-path /pilot/opl',
        'opl frontdesk-hosted-package --output /tmp/opl-frontdesk-package --host 0.0.0.0 --port 8787 --sessions-limit 9',
      ],
      handler: (args) =>
        buildHostedPilotPackage(
          getContracts(),
          parseHostedPilotPackageArgs(args, commandSpecs['frontdesk-hosted-package']),
        ),
    },
    'frontdesk-librechat-package': {
      usage:
        'opl frontdesk-librechat-package --output <dir> [--public-origin <origin>] [--host <host>] [--port <port>] [--sessions-limit <n>] [--base-path <base_path>]',
      summary:
        'Export a real LibreChat-first hosted shell pilot that combines the OPL front-desk package with same-origin LibreChat deployment assets.',
      examples: [
        'opl frontdesk-librechat-package --output /tmp/opl-librechat-pilot --public-origin https://opl.example.com',
        'opl frontdesk-librechat-package --output /tmp/opl-librechat-pilot --public-origin http://127.0.0.1:8080 --base-path /pilot/opl',
        'opl frontdesk-librechat-package --output /tmp/opl-librechat-pilot --host 0.0.0.0 --port 8787 --sessions-limit 9',
      ],
      handler: (args) =>
        buildLibreChatPilotPackage(
          getContracts(),
          parseHostedPilotPackageArgs(args, commandSpecs['frontdesk-librechat-package']),
        ),
    },
    'frontdesk-service-install': {
      usage:
        'opl frontdesk-service-install [--host <host>] [--port <port>] [--path <workspace_path>] [--sessions-limit <n>] [--base-path <base_path>]',
      summary:
        'Install and bootstrap a local launchd-managed OPL web front-desk service for long-running direct entry.',
      examples: [
        'opl frontdesk-service-install',
        'opl frontdesk-service-install --port 8787',
        'opl frontdesk-service-install --path /Users/gaofeng/workspace/one-person-lab --sessions-limit 10 --base-path /pilot/opl',
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
      usage:
        'opl web [--host <host>] [--port <port>] [--path <workspace_path>] [--sessions-limit <n>] [--base-path <base_path>]',
      summary: 'Start the local OPL web front-desk pilot for direct browser-based entry and management.',
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
        'opl ask <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--model <model>] [--provider <provider>] [--workspace-path <path>] [--skills <skills>] [--dry-run]',
      summary:
        'Run a one-shot OPL product-entry request by routing through OPL and then querying Hermes.',
      examples: [
        'opl ask "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck',
        'opl ask --goal "Create a xiaohongshu campaign pack for a lab update." --preferred-family xiaohongshu --dry-run',
        'opl ask "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck --workspace-path /Users/gaofeng/workspace/redcube-ai',
      ],
      handler: (args) => runProductEntryAsk(parseProductEntryArgs(args, commandSpecs.ask), getContracts()),
    },
    chat: {
      usage:
        'opl chat <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--model <model>] [--provider <provider>] [--workspace-path <path>] [--skills <skills>] [--dry-run]',
      summary:
        'Seed a Hermes session from the OPL product entry and continue interactively inside the routed boundary.',
      examples: [
        'opl chat "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck',
        'opl chat "Plan a medical grant proposal revision loop." --workspace-path /Users/gaofeng/workspace/med-autogrant --dry-run',
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
    'workspace-catalog': {
      usage: 'opl workspace-catalog',
      summary: 'Show the file-backed workspace registry for OPL and admitted domain project surfaces.',
      examples: ['opl workspace-catalog'],
      handler: (args) => {
        assertNoArgs(args, commandSpecs['workspace-catalog']);
        return buildWorkspaceCatalog(getContracts());
      },
    },
    'workspace-bind': {
      usage:
        'opl workspace-bind --project <project_id> --path <workspace_path> [--label <label>] [--entry-command <command>] [--manifest-command <command>] [--entry-url <url>]',
      summary:
        'Bind and activate one workspace for an admitted project, optionally freezing its direct-entry locator.',
      examples: [
        'opl workspace-bind --project redcube --path /Users/gaofeng/workspace/redcube-ai',
        'opl workspace-bind --project redcube --path /Users/gaofeng/workspace/redcube-ai --entry-command "redcube-ai frontdesk" --manifest-command "redcube product manifest --workspace-root /Users/gaofeng/workspace/redcube-ai" --entry-url http://127.0.0.1:3310/redcube',
      ],
      handler: (args) => {
        const parsed = parseWorkspaceRegistryArgs(args, commandSpecs['workspace-bind']);
        if (!parsed.projectId || !parsed.workspacePath) {
          throw buildUsageError(
            'workspace-bind requires both --project and --path.',
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
        });
      },
    },
    'workspace-activate': {
      usage: 'opl workspace-activate --project <project_id> --path <workspace_path>',
      summary: 'Switch the active workspace binding for an admitted project.',
      examples: ['opl workspace-activate --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      handler: (args) => {
        const parsed = parseWorkspaceRegistryArgs(args, commandSpecs['workspace-activate']);
        if (!parsed.projectId || !parsed.workspacePath) {
          throw buildUsageError(
            'workspace-activate requires both --project and --path.',
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
      usage: 'opl workspace-archive --project <project_id> --path <workspace_path>',
      summary: 'Archive one workspace binding so OPL no longer treats it as active or reusable.',
      examples: ['opl workspace-archive --project redcube --path /Users/gaofeng/workspace/redcube-ai'],
      handler: (args) => {
        const parsed = parseWorkspaceRegistryArgs(args, commandSpecs['workspace-archive']);
        if (!parsed.projectId || !parsed.workspacePath) {
          throw buildUsageError(
            'workspace-archive requires both --project and --path.',
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
    'session-ledger': {
      usage: 'opl session-ledger [--limit <n>]',
      summary: 'Show OPL-managed session events with honest resource samples captured at event time.',
      examples: ['opl session-ledger', 'opl session-ledger --limit 5'],
      handler: (args) => {
        const parsed = parseSessionLedgerArgs(args, commandSpecs['session-ledger']);
        return buildSessionLedger(parsed.limit);
      },
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
    'handoff-envelope': {
      usage:
        'opl handoff-envelope <request...> [--intent <intent>] [--target <target>] [--preferred-family <family>] [--request-kind <kind>] [--workspace-path <path>]',
      summary:
        'Build a machine-readable OPL family handoff bundle for the current request and active workspace bindings.',
      examples: [
        'opl handoff-envelope "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck',
        'opl handoff-envelope "Prepare a defense-ready slide deck for a thesis committee." --preferred-family ppt_deck --workspace-path /Users/gaofeng/workspace/redcube-ai',
      ],
      handler: (args) =>
        buildProductEntryHandoffEnvelope(
          parseProductEntryArgs(args, commandSpecs['handoff-envelope']),
          getContracts(),
        ),
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
