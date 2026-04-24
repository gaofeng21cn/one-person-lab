import type { DomainLaunchStrategy } from '../../domain-launch.ts';
import type { ProductEntryCliInput, ProductEntryExecutor } from '../../product-entry.ts';
import type { ResolveRequestInput } from '../../types.ts';
import type {
  CommandSpec,
  DashboardCliInput,
  LaunchDomainCliInput,
  LogsCliInput,
  ResumeCliInput,
  RuntimeStatusCliInput,
  SessionLedgerCliInput,
  SessionsCliInput,
  StartCliInput,
  WorkspaceStatusCliInput,
} from './types.ts';
import { buildUsageError, parseExecutorValue } from './runtime-helpers.ts';

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

export {
  parseDashboardArgs,
  parseKeyValueArgs,
  parseLaunchDomainArgs,
  parseLogsArgs,
  parsePort,
  parsePositiveInteger,
  parseProductEntryArgs,
  parseResumeArgs,
  parseRuntimeStatusArgs,
  parseSessionLedgerArgs,
  parseSessionsArgs,
  parseStartArgs,
  parseWorkspaceStatusArgs,
};
