import type { GatewayContractsLoadOptions } from '../../types.ts';

type CommandHandler = (args: string[]) => unknown | Promise<unknown>;

type CommandSpec = {
  usage: string;
  summary: string;
  examples: string[];
  handler: CommandHandler;
  group?: string;
};

type DomainLaunchStrategy = 'auto' | 'open_url' | 'spawn_command';

type ProductEntryExecutor = 'codex' | 'hermes';

type ProductEntryCliInput = {
  dryRun: boolean;
  goal: string;
  intent: string;
  target: string;
  preferredFamily?: string;
  requestKind?: string;
  model?: string;
  provider?: string;
  workspacePath?: string;
  skills: string[];
  executor?: ProductEntryExecutor;
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

type RuntimeManagerActionCliInput = {
  mode: 'dry_run' | 'apply';
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
  skipNativeHelperRepair?: boolean;
  skipWebOpen?: boolean;
  skipGuiOpen?: boolean;
  serveWeb?: boolean;
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

type OplModuleCliInput = {
  moduleId?: string;
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

export type {
  CommandHandler,
  CommandSpec,
  DashboardCliInput,
  DomainLaunchStrategy,
  OplEngineCliInput,
  OplModuleCliInput,
  HostedPilotPackageCliInput,
  LaunchDomainCliInput,
  LogsCliInput,
  ParsedCliInput,
  ProductEntryCliInput,
  ProductEntryExecutor,
  ResumeCliInput,
  RuntimeManagerActionCliInput,
  RuntimeStatusCliInput,
  SessionLedgerCliInput,
  SessionRuntimeCliInput,
  SessionsCliInput,
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
