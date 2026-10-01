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
import { parseCommandOptions, parseRegisteredCommandOptions } from './command-registry.ts';
import { buildUsageError } from './runtime-helpers.ts';

function readLastStringOption(
  args: string[],
  values: Record<string, unknown>,
  names: readonly string[],
): string | undefined {
  let token: string | undefined;
  for (let index = args.length - 1; index >= 0; index -= 1) {
    const candidate = args[index]!;
    if (!candidate.startsWith('--')) continue;
    if (names.includes(candidate.slice(2).split('=', 1)[0]!)) {
      token = candidate;
      break;
    }
  }
  if (!token) return undefined;
  return values[token.slice(2).split('=', 1)[0]!] as string | undefined;
}

function parseWorkspaceInitializeArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WorkspaceInitializeCliInput {
  const values = parseCommandOptions(args, spec, {
    agent: { type: 'string' },
    workspace: { type: 'string' },
    'workspace-path': { type: 'string' },
    'workspace-root': { type: 'string' },
    'workspace-id': { type: 'string' },
    'project-id': { type: 'string' },
    'deliverable-id': { type: 'string' },
    'study-id': { type: 'string' },
    title: { type: 'string' },
    mode: { type: 'string' },
    'dry-run': { type: 'boolean' },
    'no-bind': { type: 'boolean' },
    force: { type: 'boolean' },
  });
  const mode = values.mode as string | undefined;
  if (mode !== undefined && mode !== 'auto' && mode !== 'one_off' && mode !== 'series' && mode !== 'portfolio') {
    throw buildUsageError(
      'workspace init --mode requires auto, one_off, series, or portfolio.',
      spec,
      { option: '--mode', value: mode },
    );
  }
  const workspacePath = readLastStringOption(args, values, ['workspace', 'workspace-path']);
  const projectId = readLastStringOption(args, values, ['project-id', 'deliverable-id', 'study-id']);
  return {
    ...(values.agent !== undefined ? { agentId: values.agent as string } : {}),
    ...(workspacePath !== undefined ? { workspacePath } : {}),
    ...(values['workspace-root'] !== undefined ? { workspaceRoot: values['workspace-root'] as string } : {}),
    ...(values['workspace-id'] !== undefined ? { workspaceId: values['workspace-id'] as string } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    ...(values.title !== undefined ? { title: values.title as string } : {}),
    mode: (mode ?? 'auto') as WorkspaceInitializeCliInput['mode'],
    bind: values['no-bind'] !== true,
    ...(values['dry-run'] === true ? { dryRun: true } : {}),
    ...(values.force === true ? { force: true } : {}),
  };
}

function parseWorkspaceValidationArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WorkspaceValidationCliInput {
  const values = parseCommandOptions(args, spec, {
    workspace: { type: 'string' },
    'workspace-path': { type: 'string' },
  });
  const workspacePath = readLastStringOption(args, values, ['workspace', 'workspace-path']);
  return workspacePath === undefined ? {} : { workspacePath };
}

function parseWorkspaceAdoptArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WorkspaceAdoptCliInput {
  const values = parseCommandOptions(args, spec, {
    agent: { type: 'string' },
    workspace: { type: 'string' },
    'workspace-path': { type: 'string' },
    'workspace-root': { type: 'string' },
    'workspace-id': { type: 'string' },
    'project-id': { type: 'string' },
    'deliverable-id': { type: 'string' },
    'study-id': { type: 'string' },
    title: { type: 'string' },
    mode: { type: 'string' },
    'dry-run': { type: 'boolean' },
    apply: { type: 'boolean' },
  });
  const mode = values.mode as string | undefined;
  if (mode !== undefined && mode !== 'auto' && mode !== 'one_off' && mode !== 'series' && mode !== 'portfolio') {
    throw buildUsageError(
      'workspace adopt --mode requires auto, one_off, series, or portfolio.',
      spec,
      { option: '--mode', value: mode },
    );
  }
  const dryRun = values['dry-run'] === true;
  const apply = values.apply === true;
  if (dryRun && apply) {
    throw buildUsageError('workspace adopt accepts either --dry-run or --apply, not both.', spec, {
      mutually_exclusive: ['--dry-run', '--apply'],
    });
  }
  const workspacePath = readLastStringOption(args, values, ['workspace', 'workspace-path']);
  const projectId = readLastStringOption(args, values, ['project-id', 'deliverable-id', 'study-id']);
  return {
    ...(values.agent !== undefined ? { agentId: values.agent as string } : {}),
    ...(workspacePath !== undefined ? { workspacePath } : {}),
    ...(values['workspace-root'] !== undefined ? { workspaceRoot: values['workspace-root'] as string } : {}),
    ...(values['workspace-id'] !== undefined ? { workspaceId: values['workspace-id'] as string } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    ...(values.title !== undefined ? { title: values.title as string } : {}),
    mode: (mode ?? 'auto') as WorkspaceAdoptCliInput['mode'],
    ...(dryRun ? { dryRun: true } : {}),
    ...(apply ? { apply: true } : {}),
  };
}

function parseWorkspaceLifecycleArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WorkspaceLifecycleCliInput {
  const values = parseCommandOptions(args, spec, {
    workspace: { type: 'string' },
    'workspace-path': { type: 'string' },
    'project-id': { type: 'string' },
    'deliverable-id': { type: 'string' },
    'study-id': { type: 'string' },
    status: { type: 'string' },
    reason: { type: 'string' },
    'superseded-by': { type: 'string' },
    'superseded-by-project-id': { type: 'string' },
    'owner-receipt-ref': { type: 'string' },
    'dry-run': { type: 'boolean' },
    apply: { type: 'boolean' },
  });
  const status = values.status as string | undefined;
  if (
    status !== undefined
    && status !== 'active'
    && status !== 'paused'
    && status !== 'archived'
    && status !== 'superseded'
    && status !== 'locked'
  ) {
    throw buildUsageError(
      'Workspace lifecycle --status requires active, paused, archived, superseded, or locked.',
      spec,
      { option: '--status', value: status },
    );
  }
  const dryRun = values['dry-run'] === true;
  const apply = values.apply === true;
  if (dryRun && apply) {
    throw buildUsageError('Workspace lifecycle commands accept either --dry-run or --apply, not both.', spec, {
      mutually_exclusive: ['--dry-run', '--apply'],
    });
  }
  const workspacePath = readLastStringOption(args, values, ['workspace', 'workspace-path']);
  const projectId = readLastStringOption(args, values, ['project-id', 'deliverable-id', 'study-id']);
  const supersededByProjectId = readLastStringOption(
    args,
    values,
    ['superseded-by', 'superseded-by-project-id'],
  );
  return {
    ...(workspacePath !== undefined ? { workspacePath } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    ...(status !== undefined ? { status: status as WorkspaceLifecycleCliInput['status'] } : {}),
    ...(values.reason !== undefined ? { reason: values.reason as string } : {}),
    ...(supersededByProjectId !== undefined ? { supersededByProjectId } : {}),
    ...(values['owner-receipt-ref'] !== undefined
      ? { ownerReceiptRef: values['owner-receipt-ref'] as string }
      : {}),
    ...(dryRun ? { dryRun: true } : {}),
    ...(apply ? { apply: true } : {}),
  };
}

function parseWorkspaceArtifactLifecycleArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WorkspaceArtifactLifecycleCliInput {
  const values = parseCommandOptions(args, spec, {
    workspace: { type: 'string' },
    'workspace-path': { type: 'string' },
    'project-id': { type: 'string' },
    'deliverable-id': { type: 'string' },
    'study-id': { type: 'string' },
    'dry-run': { type: 'boolean' },
    apply: { type: 'boolean' },
  });
  const dryRun = values['dry-run'] === true;
  const apply = values.apply === true;
  if (dryRun && apply) {
    throw buildUsageError('workspace artifact-lifecycle accepts either --dry-run or --apply, not both.', spec, {
      mutually_exclusive: ['--dry-run', '--apply'],
    });
  }
  const workspacePath = readLastStringOption(args, values, ['workspace', 'workspace-path']);
  const projectId = readLastStringOption(args, values, ['project-id', 'deliverable-id', 'study-id']);
  return {
    ...(workspacePath !== undefined ? { workspacePath } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    ...(dryRun ? { dryRun: true } : {}),
    ...(apply ? { apply: true } : {}),
  };
}

function parseWorkspaceSourceIngestArgs(
  args: string[],
  spec: Pick<CommandSpec, 'usage' | 'examples'>,
): WorkspaceSourceIngestCliInput {
  const values = parseCommandOptions(args, spec, {
    workspace: { type: 'string' },
    'workspace-path': { type: 'string' },
    file: { type: 'string' },
    'source-file': { type: 'string' },
    'project-id': { type: 'string' },
    'deliverable-id': { type: 'string' },
    'study-id': { type: 'string' },
    role: { type: 'string' },
    title: { type: 'string' },
    note: { type: 'string' },
    'dry-run': { type: 'boolean' },
    apply: { type: 'boolean' },
  });
  const dryRun = values['dry-run'] === true;
  const dryRunIndex = args.lastIndexOf('--dry-run');
  const applyIndex = args.lastIndexOf('--apply');
  const apply = dryRunIndex < 0 || applyIndex > dryRunIndex;
  const workspacePath = readLastStringOption(args, values, ['workspace', 'workspace-path']);
  const filePath = readLastStringOption(args, values, ['file', 'source-file']);
  const projectId = readLastStringOption(args, values, ['project-id', 'deliverable-id', 'study-id']);
  return {
    apply,
    ...(workspacePath !== undefined ? { workspacePath } : {}),
    ...(filePath !== undefined ? { filePath } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    ...(values.role !== undefined ? { role: values.role as string } : {}),
    ...(values.title !== undefined ? { title: values.title as string } : {}),
    ...(values.note !== undefined ? { note: values.note as string } : {}),
    ...(dryRun ? { dryRun: true } : {}),
  };
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
  spec: CommandSpec,
): TurnkeyInstallCliInput {
  const values = parseRegisteredCommandOptions('install', args, spec);
  const withApp = values['with-app'] === true;
  if (values.headless === true && withApp) {
    throw buildUsageError('--headless and --with-app are mutually exclusive.', spec);
  }
  const parsed: TurnkeyInstallCliInput = { headless: !withApp };
  if (withApp) {
    parsed.withApp = true;
  }
  if (values['skip-packages'] === true) parsed.skipPackages = true;
  if (values['skip-engines'] === true) parsed.skipEngines = true;
  if (values['no-online-runtime'] === true) parsed.noOnlineRuntime = true;
  if (values['skip-native-helper-repair'] === true) parsed.skipNativeHelperRepair = true;
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
  const engineId = parseCommandOptions(args, spec, {
    engine: { type: 'string' },
  }).engine as string | undefined;
  if (!engineId) {
    throw buildUsageError('engine commands require --engine.', spec, {
      required: ['--engine'],
    });
  }
  return { engineId };
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
  if (scope && scope !== 'all' && scope !== 'runtime_substrate' && scope !== 'runtime_recovery') {
    throw buildUsageError('system startup-maintenance --scope requires all, runtime_substrate, or runtime_recovery.', spec, {
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
    module: { type: 'string' },
    'module-source': { type: 'string' },
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
  const moduleId = parsed.module as string | undefined;
  const moduleSource = parsed['module-source'] as string | undefined;
  if (Boolean(moduleId) !== Boolean(moduleSource)) {
    throw buildUsageError('system developer-supervisor requires --module and --module-source together.', spec, {
      required_together: ['--module', '--module-source'],
    });
  }
  if (moduleSource && !['auto', 'managed', 'developer'].includes(moduleSource)) {
    throw buildUsageError('system developer-supervisor --module-source requires auto, managed, or developer.', spec, {
      option: '--module-source',
      value: moduleSource,
    });
  }
  const githubLoginValues = parsed['auto-enable-github-login'] as string[] | undefined;
  return {
    developerSupervisorEnabled: enabled as DeveloperSupervisorCliInput['developerSupervisorEnabled'],
    developerSupervisorMode: mode as DeveloperSupervisorCliInput['developerSupervisorMode'],
    developerSupervisorAutoEnableGithubLogin: githubLoginValues?.[githubLoginValues.length - 1],
    developerSupervisorModuleId: moduleId,
    developerSupervisorModuleSource:
      moduleSource as DeveloperSupervisorCliInput['developerSupervisorModuleSource'],
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
