import type {
  CommandSpec,
  DeveloperSupervisorCliInput,
  OplEngineCliInput,
  OplModuleExecCliInput,
  OplModuleCliInput,
  SystemDependencyCliInput,
  SystemConfigureCodexCliInput,
  SystemSeedApplyCliInput,
  SystemStartupMaintenanceCliInput,
  SessionRuntimeCliInput,
  TurnkeyInstallCliInput,
  UpdateChannelCliInput,
  WorkspaceAdoptCliInput,
  WorkspaceInitializeCliInput,
  WorkspaceLifecycleCliInput,
  WorkspaceSourceIngestCliInput,
  WorkspaceArtifactLifecycleCliInput,
  WorkspaceValidationCliInput,
  WorkspaceRegistryCliInput,
  WorkspaceRootCliInput,
} from './types.ts';
import { parseCommandOptions } from './command-registry.ts';
import { buildUsageError } from './runtime-helpers.ts';

function parseWorkspaceInitializeArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WorkspaceInitializeCliInput {
  const parsed: WorkspaceInitializeCliInput = { mode: 'auto', bind: true };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (token === '--no-bind') {
      parsed.bind = false;
      continue;
    }
    if (token === '--force') {
      parsed.force = true;
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
      case '--agent':
        parsed.agentId = value;
        break;
      case '--workspace':
      case '--workspace-path':
        parsed.workspacePath = value;
        break;
      case '--workspace-root':
        parsed.workspaceRoot = value;
        break;
      case '--workspace-id':
        parsed.workspaceId = value;
        break;
      case '--project-id':
      case '--deliverable-id':
      case '--study-id':
        parsed.projectId = value;
        break;
      case '--title':
        parsed.title = value;
        break;
      case '--mode':
        if (value !== 'auto' && value !== 'one_off' && value !== 'series' && value !== 'portfolio') {
          throw buildUsageError(
            'workspace init --mode requires auto, one_off, series, or portfolio.',
            spec,
            { option: token, value },
          );
        }
        parsed.mode = value;
        break;
      default:
        throw buildUsageError(`Unknown option for workspace init command: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function parseWorkspaceValidationArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WorkspaceValidationCliInput {
  const parsed: WorkspaceValidationCliInput = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (!token.startsWith('--')) {
      throw buildUsageError(`Unexpected positional argument: ${token}.`, spec, { token });
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw buildUsageError(`Missing value for option: ${token}.`, spec, { option: token });
    }

    switch (token) {
      case '--workspace':
      case '--workspace-path':
        parsed.workspacePath = value;
        break;
      default:
        throw buildUsageError(`Unknown option for workspace inspection command: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  return parsed;
}

function parseWorkspaceAdoptArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WorkspaceAdoptCliInput {
  const parsed: WorkspaceAdoptCliInput = { mode: 'auto' };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (token === '--apply') {
      parsed.apply = true;
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
      case '--agent':
        parsed.agentId = value;
        break;
      case '--workspace':
      case '--workspace-path':
        parsed.workspacePath = value;
        break;
      case '--workspace-root':
        parsed.workspaceRoot = value;
        break;
      case '--workspace-id':
        parsed.workspaceId = value;
        break;
      case '--project-id':
      case '--deliverable-id':
      case '--study-id':
        parsed.projectId = value;
        break;
      case '--title':
        parsed.title = value;
        break;
      case '--mode':
        if (value !== 'auto' && value !== 'one_off' && value !== 'series' && value !== 'portfolio') {
          throw buildUsageError(
            'workspace adopt --mode requires auto, one_off, series, or portfolio.',
            spec,
            { option: token, value },
          );
        }
        parsed.mode = value;
        break;
      default:
        throw buildUsageError(`Unknown option for workspace adopt command: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  if (parsed.dryRun === true && parsed.apply === true) {
    throw buildUsageError('workspace adopt accepts either --dry-run or --apply, not both.', spec, {
      mutually_exclusive: ['--dry-run', '--apply'],
    });
  }

  return parsed;
}

function parseWorkspaceLifecycleArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WorkspaceLifecycleCliInput {
  const parsed: WorkspaceLifecycleCliInput = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (token === '--apply') {
      parsed.apply = true;
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
      case '--workspace':
      case '--workspace-path':
        parsed.workspacePath = value;
        break;
      case '--project-id':
      case '--deliverable-id':
      case '--study-id':
        parsed.projectId = value;
        break;
      case '--status':
        if (
          value !== 'active'
          && value !== 'paused'
          && value !== 'archived'
          && value !== 'superseded'
          && value !== 'locked'
        ) {
          throw buildUsageError(
            'Workspace lifecycle --status requires active, paused, archived, superseded, or locked.',
            spec,
            { option: token, value },
          );
        }
        parsed.status = value;
        break;
      case '--reason':
        parsed.reason = value;
        break;
      case '--superseded-by':
      case '--superseded-by-project-id':
        parsed.supersededByProjectId = value;
        break;
      case '--owner-receipt-ref':
        parsed.ownerReceiptRef = value;
        break;
      default:
        throw buildUsageError(`Unknown option for workspace lifecycle command: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  if (parsed.dryRun === true && parsed.apply === true) {
    throw buildUsageError('Workspace lifecycle commands accept either --dry-run or --apply, not both.', spec, {
      mutually_exclusive: ['--dry-run', '--apply'],
    });
  }

  return parsed;
}

function parseWorkspaceArtifactLifecycleArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WorkspaceArtifactLifecycleCliInput {
  const parsed: WorkspaceArtifactLifecycleCliInput = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (token === '--apply') {
      parsed.apply = true;
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
      case '--workspace':
      case '--workspace-path':
        parsed.workspacePath = value;
        break;
      case '--project-id':
      case '--deliverable-id':
      case '--study-id':
        parsed.projectId = value;
        break;
      default:
        throw buildUsageError(`Unknown option for workspace artifact lifecycle command: ${token}.`, spec, {
          option: token,
        });
    }

    index += 1;
  }

  if (parsed.dryRun === true && parsed.apply === true) {
    throw buildUsageError('workspace artifact-lifecycle accepts either --dry-run or --apply, not both.', spec, {
      mutually_exclusive: ['--dry-run', '--apply'],
    });
  }

  return parsed;
}

function parseWorkspaceSourceIngestArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WorkspaceSourceIngestCliInput {
  const parsed: WorkspaceSourceIngestCliInput = { apply: true };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--dry-run') {
      parsed.dryRun = true;
      parsed.apply = false;
      continue;
    }
    if (token === '--apply') {
      parsed.apply = true;
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
      case '--workspace':
      case '--workspace-path':
        parsed.workspacePath = value;
        break;
      case '--file':
      case '--source-file':
        parsed.filePath = value;
        break;
      case '--project-id':
      case '--deliverable-id':
      case '--study-id':
        parsed.projectId = value;
        break;
      case '--role':
        parsed.role = value;
        break;
      case '--title':
        parsed.title = value;
        break;
      case '--note':
        parsed.note = value;
        break;
      default:
        throw buildUsageError(`Unknown option for workspace source ingest command: ${token}.`, spec, {
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
  const values = parseCommandOptions(args, spec, {
    project: { type: 'string' },
    path: { type: 'string' },
    label: { type: 'string' },
    'entry-command': { type: 'string' },
    'manifest-command': { type: 'string' },
    'entry-url': { type: 'string' },
    'workspace-root': { type: 'string' },
    profile: { type: 'string' },
    input: { type: 'string' },
  });
  if (values.project !== undefined) parsed.projectId = values.project as string;
  if (values.path !== undefined) parsed.workspacePath = values.path as string;
  if (values.label !== undefined) parsed.label = values.label as string;
  if (values['entry-command'] !== undefined) parsed.entryCommand = values['entry-command'] as string;
  if (values['manifest-command'] !== undefined) parsed.manifestCommand = values['manifest-command'] as string;
  if (values['entry-url'] !== undefined) parsed.entryUrl = values['entry-url'] as string;
  if (values['workspace-root'] !== undefined) parsed.workspaceRoot = values['workspace-root'] as string;
  if (values.profile !== undefined) parsed.profileRef = values.profile as string;
  if (values.input !== undefined) parsed.inputPath = values.input as string;
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
    if (token === '--headless') {
      parsed.headless = true;
      continue;
    }
    if (token === '--skip-engines') {
      parsed.skipEngines = true;
      continue;
    }
    if (token === '--no-online-runtime') {
      parsed.noOnlineRuntime = true;
      continue;
    }
    if (token === '--skip-gui-open') {
      parsed.skipGuiOpen = true;
      continue;
    }
    if (token === '--skip-native-helper-repair') {
      parsed.skipNativeHelperRepair = true;
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
      default:
        throw buildUsageError(`Unknown option for install command: ${token}.`, spec, { option: token });
    }

    index += 1;
  }

  return parsed;
}

function parseOplModuleArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): OplModuleCliInput {
  const moduleId = parseCommandOptions(args, spec, {
    module: { type: 'string' },
  }).module as string | undefined;
  if (!moduleId) {
    throw buildUsageError(
      'module commands require --module.',
      spec,
      { required: ['--module'] },
    );
  }
  return { moduleId };
}

function parseOplModuleExecArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): OplModuleExecCliInput {
  const separatorIndex = args.indexOf('--');
  if (separatorIndex < 0) {
    throw buildUsageError(
      'module exec requires `--` before the domain CLI arguments.',
      spec,
      { required: ['--module', '--'] },
    );
  }

  const moduleInput = parseOplModuleArgs(args.slice(0, separatorIndex), spec);
  const domainArgs = args.slice(separatorIndex + 1);
  if (domainArgs.length === 0) {
    throw buildUsageError(
      'module exec requires at least one domain CLI argument after `--`.',
      spec,
      { required: ['domain_cli_args'] },
    );
  }

  return {
    moduleId: moduleInput.moduleId!,
    args: domainArgs,
  };
}

function parseOplEngineArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): OplEngineCliInput {
  const parsed: OplEngineCliInput = {};

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

function parseSessionRuntimeArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): SessionRuntimeCliInput {
  return {
    acp: parseCommandOptions(args, spec, {
      acp: { type: 'boolean' },
    }).acp === true,
  };
}

function parseWorkspaceRootArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WorkspaceRootCliInput {
  const parsed: WorkspaceRootCliInput = {};
  const path = parseCommandOptions(args, spec, {
    path: { type: 'string' },
  }).path as string | undefined;
  if (path !== undefined) {
    parsed.path = path;
  }
  return parsed;
}

function parseUpdateChannelArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): UpdateChannelCliInput {
  const parsed = parseCommandOptions(args, spec, { channel: { type: 'string' } });
  const channel = parsed.channel as string | undefined;
  if (channel && channel !== 'stable' && channel !== 'preview') {
    throw buildUsageError('system update-channel requires stable or preview.', spec, {
      option: '--channel',
      value: channel,
    });
  }
  return { channel: channel as UpdateChannelCliInput['channel'] };
}

function parseSystemDependencyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): SystemDependencyCliInput {
  const parsed = parseCommandOptions(args, spec, {
    apply: { type: 'boolean' },
    profile: { type: 'string' },
  });
  const profile = parsed.profile as string | undefined;
  if (!profile) {
    throw buildUsageError('system dependency command requires an explicit --profile selected by the active agent or package.', spec, {
      required: ['--profile'],
    });
  }
  return { profile, apply: parsed.apply === true };
}

function parseSystemSeedApplyArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): SystemSeedApplyCliInput {
  const parsed = parseCommandOptions(args, spec, {
    'data-dir': { type: 'string' },
    from: { type: 'string' },
    'projects-dir': { type: 'string' },
  });
  return {
    seedDir: parsed.from as string | undefined,
    dataDir: parsed['data-dir'] as string | undefined,
    projectsDir: parsed['projects-dir'] as string | undefined,
  };
}

function parseSystemStartupMaintenanceArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): SystemStartupMaintenanceCliInput {
  const parsed = parseCommandOptions(args, spec, { scope: { type: 'string' } });
  const scope = parsed.scope as string | undefined;
  if (scope && scope !== 'all' && scope !== 'runtime_substrate') {
    throw buildUsageError('system startup-maintenance --scope requires all or runtime_substrate.', spec, {
      option: '--scope',
      value: scope,
    });
  }
  return { scope: scope as SystemStartupMaintenanceCliInput['scope'] };
}

function parseDeveloperSupervisorArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): DeveloperSupervisorCliInput {
  const normalizedArgs = args.map((arg) => arg === '--github-login' ? '--auto-enable-github-login' : arg);
  const parsed = parseCommandOptions(normalizedArgs, spec, {
    'auto-enable-github-login': { type: 'string', multiple: true },
    enabled: { type: 'string' },
    mode: { type: 'string' },
  });
  const enabled = parsed.enabled as string | undefined;
  const mode = parsed.mode as string | undefined;
  if (enabled && enabled !== 'auto' && enabled !== 'on' && enabled !== 'off') {
    throw buildUsageError('system developer-supervisor requires auto, on, or off for --enabled.', spec, {
      option: '--enabled',
      value: enabled,
    });
  }
  if (mode && mode !== 'external_observe' && mode !== 'developer_apply_safe') {
    throw buildUsageError(
      'system developer-supervisor requires external_observe or developer_apply_safe for --mode.',
      spec,
      { option: '--mode', value: mode },
    );
  }
  return {
    developerSupervisorEnabled: enabled as DeveloperSupervisorCliInput['developerSupervisorEnabled'],
    developerSupervisorMode: mode as DeveloperSupervisorCliInput['developerSupervisorMode'],
    developerSupervisorAutoEnableGithubLogin:
      (parsed['auto-enable-github-login'] as string[] | undefined)?.at(-1),
  };
}

function parseSystemConfigureCodexArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): SystemConfigureCodexCliInput {
  const parsed = parseCommandOptions(args, spec, { 'api-key-stdin': { type: 'boolean' } });
  if (parsed['api-key-stdin'] !== true) {
    throw buildUsageError('system configure-codex requires --api-key-stdin.', spec, {
      required: ['--api-key-stdin'],
    });
  }
  return { apiKeyStdin: true };
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
  parseDeveloperSupervisorArgs,
  parseOplEngineArgs,
  parseOplModuleExecArgs,
  parseSessionRuntimeArgs,
  parseSystemConfigureCodexArgs,
  parseSystemDependencyArgs,
  parseSystemSeedApplyArgs,
  parseSystemStartupMaintenanceArgs,
  parseTurnkeyInstallArgs,
  parseUpdateChannelArgs,
  parseWorkspaceAdoptArgs,
  parseWorkspaceInitializeArgs,
  parseWorkspaceArtifactLifecycleArgs,
  parseWorkspaceLifecycleArgs,
  parseWorkspaceSourceIngestArgs,
  parseWorkspaceValidationArgs,
  parseWorkspaceRegistryArgs,
  parseWorkspaceRootArgs,
};
