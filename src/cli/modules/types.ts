import type { FrameworkContractsLoadOptions } from '../../types.ts';

type CommandHandler = (args: string[]) => unknown | Promise<unknown>;

type CommandSpec = {
  usage: string;
  summary: string;
  examples: string[];
  handler: CommandHandler;
  group?: string;
  help_surface?: 'default' | 'diagnostic_drilldown';
  subcommands?: Array<{
    command: string;
    usage: string;
    summary: string;
  }>;
};

type DomainLaunchStrategy = 'auto' | 'open_url' | 'spawn_command';

type ProductEntryCliInput = {
  dryRun: boolean;
  goal: string;
  intent: string;
  target: string;
  preferredFamily?: string;
  requestKind?: string;
  model?: string;
  provider?: string;
  reasoningEffort?: string;
  workspacePath?: string;
  skills: string[];
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
  jsonOutput: boolean;
  textOutput: boolean;
  command: string | null;
  args: string[];
  loadOptions?: FrameworkContractsLoadOptions;
};

type LaunchDomainCliInput = {
  projectId?: string;
  workspacePath?: string;
  strategy?: DomainLaunchStrategy;
  dryRun?: boolean;
};

type WorkspaceStatusCliInput = {
  workspacePath?: string;
};

type RuntimeStatusCliInput = {
  limit?: number;
};

type RuntimeManagerActionCliInput = {
  mode: 'dry_run' | 'apply';
};

type RuntimeAppOperatorDrilldownCliInput = {
  detailLevel: 'summary' | 'full';
};

type ObservabilityExportCliInput = {
  format: 'json' | 'openmetrics';
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

type TurnkeyInstallCliInput = WebCliInput & {
  modules: string[];
  skipModules?: boolean;
  skipEngines?: boolean;
  noOnlineRuntime?: boolean;
  skipNativeHelperRepair?: boolean;
  skipWebOpen?: boolean;
  skipGuiOpen?: boolean;
  serveWeb?: boolean;
};


type ResumeCliInput = {
  sessionId: string;
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

type OplModuleCliInput = {
  moduleId?: string;
};

type OplModuleExecCliInput = {
  moduleId: string;
  args: string[];
};

type OplEngineCliInput = {
  engineId?: string;
};

type WorkspaceRootCliInput = {
  path?: string;
};

type UpdateChannelCliInput = {
  channel?: 'stable' | 'preview';
};

type DeveloperSupervisorCliInput = {
  developerSupervisorEnabled?: 'auto' | 'on' | 'off';
  developerSupervisorMode?: 'external_observe' | 'developer_apply_safe';
  developerSupervisorAutoEnableGithubLogin?: string;
};

type SystemConfigureCodexCliInput = {
  apiKeyStdin?: boolean;
};

type SkillPacksCliInput = {
  domains: string[];
  home?: string;
  quiet?: boolean;
  companionMode?: 'observe' | 'ask_to_apply' | 'managed';
  superpowersProfile?: 'keep' | 'lite' | 'full';
};

type AgentExecutorCliInput = {
  executorKind?: string;
  cwd?: string;
  model?: string;
  provider?: string;
  reasoningEffort?: string;
  prompt: string;
};

export type {
  AgentExecutorCliInput,
  CommandHandler,
  CommandSpec,
  DashboardCliInput,
  DeveloperSupervisorCliInput,
  DomainLaunchStrategy,
  OplEngineCliInput,
  OplModuleExecCliInput,
  OplModuleCliInput,
  ObservabilityExportCliInput,
  HostedPilotPackageCliInput,
  LaunchDomainCliInput,
  ParsedCliInput,
  ProductEntryCliInput,
  RuntimeAppOperatorDrilldownCliInput,
  ResumeCliInput,
  RuntimeManagerActionCliInput,
  RuntimeStatusCliInput,
  SessionLedgerCliInput,
  SessionRuntimeCliInput,
  StartCliInput,
  SkillPacksCliInput,
  SystemConfigureCodexCliInput,
  TurnkeyInstallCliInput,
  UpdateChannelCliInput,
  WebCliInput,
  WorkspaceRegistryCliInput,
  WorkspaceRootCliInput,
  WorkspaceStatusCliInput,
};
