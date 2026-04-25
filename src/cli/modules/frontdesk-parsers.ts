import { runFrontDeskEngineAction, runFrontDeskModuleAction, type FrontDeskEngineAction, type FrontDeskModuleAction } from '../../frontdesk-installation.ts';
import type { GatewayContracts } from '../../types.ts';
import type {
  CommandSpec,
  FrontDeskEngineCliInput,
  FrontDeskMcpCliInput,
  FrontDeskModuleCliInput,
  HostedPilotPackageCliInput,
  SessionRuntimeCliInput,
  TurnkeyInstallCliInput,
  UpdateChannelCliInput,
  WebCliInput,
  WorkspaceRegistryCliInput,
  WorkspaceRootCliInput,
} from './types.ts';
import { buildUsageError } from './runtime-helpers.ts';
import { parsePort, parsePositiveInteger } from './request-parsers.ts';

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

function parseTurnkeyInstallArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): TurnkeyInstallCliInput {
  const parsed: TurnkeyInstallCliInput = { modules: [] };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--skip-modules') {
      parsed.skipModules = true;
      continue;
    }
    if (token === '--skip-engines') {
      parsed.skipEngines = true;
      continue;
    }
    if (token === '--skip-web-open') {
      parsed.skipWebOpen = true;
      continue;
    }
    if (token === '--skip-gui-open') {
      parsed.skipGuiOpen = true;
      continue;
    }
    if (token === '--serve-web') {
      parsed.serveWeb = true;
      parsed.skipGuiOpen = true;
      parsed.basePath ??= '/opl';
      continue;
    }

    if (!token.startsWith('--')) {
      throw buildUsageError(`Unexpected positional argument: ${token}.`, spec, { token });
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw buildUsageError(`Missing value for option: ${token}.`, spec, { option: token });
    }

    switch (token) {
      case '--module':
        parsed.modules.push(value);
        break;
      case '--modules':
        parsed.modules.push(...value.split(',').map((entry) => entry.trim()).filter(Boolean));
        break;
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
        throw buildUsageError(`Unknown option for install command: ${token}.`, spec, { option: token });
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

export {
  assertNoArgs,
  parseFrontDeskEngineArgs,
  parseFrontDeskMcpArgs,
  parseFrontDeskModuleArgs,
  parseHostedPilotPackageArgs,
  parseSessionRuntimeArgs,
  parseTurnkeyInstallArgs,
  parseUpdateChannelArgs,
  parseWebArgs,
  parseWorkspaceRegistryArgs,
  parseWorkspaceRootArgs,
  runFrontDeskEngineActionCommand,
  runFrontDeskModuleActionCommand,
};
