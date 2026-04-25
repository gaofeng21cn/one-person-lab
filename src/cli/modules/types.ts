import type { DomainLaunchStrategy } from '../../domain-launch.ts';
import type { ProductEntryCliInput, ProductEntryExecutor } from '../../product-entry.ts';
import type { GatewayContractsLoadOptions } from '../../types.ts';

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

type TurnkeyInstallCliInput = WebCliInput & {
  modules: string[];
  skipModules?: boolean;
  skipEngines?: boolean;
  skipWebOpen?: boolean;
  skipGuiOpen?: boolean;
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

type SkillPacksCliInput = {
  domains: string[];
  home?: string;
  quiet?: boolean;
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
  SkillPacksCliInput,
  TurnkeyInstallCliInput,
  UpdateChannelCliInput,
  WebCliInput,
  WorkspaceRegistryCliInput,
  WorkspaceRootCliInput,
  WorkspaceStatusCliInput,
};
