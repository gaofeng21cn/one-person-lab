import type { ResolveRequestInput } from '../../../kernel/types.ts';
import type {
  AgentExecutorCliInput,
  CommandSpec,
  DomainLaunchStrategy,
  LaunchDomainCliInput,
  ProductEntryCliInput,
  ResumeCliInput,
  SessionLedgerCliInput,
  SkillPacksCliInput,
  StartCliInput,
} from './types.ts';
import { buildUsageError } from './runtime-helpers.ts';

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
      'domain select-entry and domain explain-boundary require --intent, --target, and --goal.',
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
      case '--reasoning-effort':
        parsed.reasoningEffort = value;
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
      'Use either an @agent handle or --preferred-family for product-entry stage selection, not both.',
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

  if (rest.length > 0) {
    throw buildUsageError(`Unexpected positional argument: ${rest[0]}.`, spec, {
      token: rest[0],
    });
  }

  return {
    sessionId,
  };
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

function parseSkillPackArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): SkillPacksCliInput {
  const parsed: SkillPacksCliInput = {
    domains: [],
    quiet: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--quiet') {
      parsed.quiet = true;
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
      case '--domain':
        parsed.domains.push(value);
        break;
      case '--home':
        parsed.home = value;
        break;
      case '--scope':
        if (value !== 'codex' && value !== 'workspace' && value !== 'quest') {
          throw buildUsageError('Option --scope requires codex, workspace, or quest.', spec, { option: token, value });
        }
        parsed.scope = value;
        break;
      case '--target-workspace':
        parsed.targetWorkspace = value;
        break;
      case '--target-quest':
        parsed.targetQuest = value;
        break;
      case '--target-root':
        parsed.targetRoot = value;
        break;
      case '--mode':
        if (value !== 'observe' && value !== 'ask_to_apply' && value !== 'managed') {
          throw buildUsageError('Option --mode requires observe, ask_to_apply, or managed.', spec, { option: token, value });
        }
        parsed.companionMode = value;
        break;
      case '--superpowers':
        if (value !== 'keep' && value !== 'lite' && value !== 'full') {
          throw buildUsageError('Option --superpowers requires keep, lite, or full.', spec, { option: token, value });
        }
        parsed.superpowersProfile = value;
        break;
      default:
        throw buildUsageError(`Unknown option for skill pack command: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function parseExecutorOption(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  if (args.length === 0) {
    return undefined;
  }
  if (args.length !== 2 || args[0] !== '--executor') {
    throw buildUsageError('executor doctor accepts only --executor <kind>.', spec, {
      received: args,
    });
  }
  return args[1];
}

function parseExecutorRequestPath(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
) {
  if (args.length !== 2 || args[0] !== '--request') {
    throw buildUsageError('executor run requires --request <request.json>.', spec, {
      required: ['--request'],
    });
  }
  return args[1];
}

function parseExecutorExecArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): AgentExecutorCliInput {
  const promptParts: string[] = [];
  const parsed: Omit<AgentExecutorCliInput, 'prompt'> = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (!token.startsWith('--')) {
      promptParts.push(token);
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw buildUsageError(`Missing value for option: ${token}.`, spec, {
        option: token,
      });
    }

    switch (token) {
      case '--executor':
        parsed.executorKind = value;
        break;
      case '--cd':
        parsed.cwd = value;
        break;
      case '--model':
        parsed.model = value;
        break;
      case '--provider':
        parsed.provider = value;
        break;
      case '--reasoning-effort':
        parsed.reasoningEffort = value;
        break;
      default:
        throw buildUsageError(`Unknown option for executor command: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  const prompt = promptParts.join(' ').trim();
  if (!prompt) {
    throw buildUsageError('opl exec requires a prompt.', spec, {
      required: ['<prompt...>'],
    });
  }

  return {
    ...parsed,
    prompt,
  };
}

export {
  parseExecutorExecArgs,
  parseExecutorOption,
  parseExecutorRequestPath,
  parseKeyValueArgs,
  parseLaunchDomainArgs,
  parseProductEntryArgs,
  parseResumeArgs,
  parseSkillPackArgs,
  parseSessionLedgerArgs,
  parseStartArgs,
};
