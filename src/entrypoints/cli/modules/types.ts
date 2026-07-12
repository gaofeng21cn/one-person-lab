import type { FrameworkContractsLoadOptions } from '../../../kernel/types.ts';

type CommandHandler = (args: string[]) => unknown | Promise<unknown>;

type CommandOptionValueKind = 'string' | 'integer' | 'boolean';

type CommandOptionMetadata = {
  name: string;
  flag: string;
  value_kind: CommandOptionValueKind;
  summary?: string;
  required?: boolean;
  multiple?: boolean;
  default?: string | number | boolean;
  allowed_values?: string[];
  allowed_range?: {
    min: number;
    max: number;
  };
};

type CommandAuthorityBoundary = {
  owner: string;
  surface: string;
  can_write_domain_truth: false;
  can_create_owner_receipt: false;
  can_create_typed_blocker?: false;
  can_claim_domain_ready: false;
  can_claim_production_ready: false;
};

type CommandRegistryMetadata = {
  command_id: string;
  parser_adapter: 'node_util_parse_args';
  options: CommandOptionMetadata[];
  json_output_schema_ref: string;
  authority_boundary: CommandAuthorityBoundary;
};

type CommandSpec = {
  usage: string;
  summary: string;
  examples: string[];
  handler: CommandHandler;
  group?: string;
  help_surface?: 'default' | 'diagnostic_drilldown' | 'migration_compatibility';
  subcommands?: Array<{
    command: string;
    usage: string;
    summary: string;
  }>;
  registry?: CommandRegistryMetadata;
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

type SystemDependencyCliInput = {
  profile: string;
  apply?: boolean;
};

type SystemSeedApplyCliInput = {
  seedDir?: string;
  dataDir?: string;
  projectsDir?: string;
};

type SystemStartupMaintenanceCliInput = {
  scope?: 'all' | 'runtime_substrate';
};

type SessionLedgerCliInput = {
  limit?: number;
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

type WorkspaceInitializeCliInput = {
  agentId?: string;
  workspacePath?: string;
  workspaceRoot?: string;
  workspaceId?: string;
  projectId?: string;
  title?: string;
  mode?: 'auto' | 'one_off' | 'series' | 'portfolio';
  bind?: boolean;
  dryRun?: boolean;
  force?: boolean;
};

type WorkspaceValidationCliInput = {
  workspacePath?: string;
};

type WorkspaceLifecycleCliInput = WorkspaceValidationCliInput & {
  projectId?: string;
  status?: 'active' | 'paused' | 'archived' | 'superseded' | 'locked';
  reason?: string;
  supersededByProjectId?: string;
  ownerReceiptRef?: string;
  dryRun?: boolean;
  apply?: boolean;
};

type WorkspaceArtifactLifecycleCliInput = WorkspaceValidationCliInput & {
  projectId?: string;
  dryRun?: boolean;
  apply?: boolean;
};

type WorkspaceSourceIngestCliInput = WorkspaceValidationCliInput & {
  filePath?: string;
  projectId?: string;
  role?: string;
  title?: string;
  note?: string;
  dryRun?: boolean;
  apply?: boolean;
};

type WorkspaceAdoptCliInput = {
  agentId?: string;
  workspacePath?: string;
  workspaceRoot?: string;
  workspaceId?: string;
  projectId?: string;
  title?: string;
  mode?: 'auto' | 'one_off' | 'series' | 'portfolio';
  dryRun?: boolean;
  apply?: boolean;
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
  headless?: boolean;
  withApp?: boolean;
  skipModules?: boolean;
  skipEngines?: boolean;
  noOnlineRuntime?: boolean;
  skipNativeHelperRepair?: boolean;
  skipWebOpen?: boolean;
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
  developerSupervisorModuleId?: string;
  developerSupervisorModuleSource?: 'auto' | 'managed' | 'developer';
};

type SystemConfigureCodexCliInput = {
  apiKeyStdin?: boolean;
};

type SkillPacksCliInput = {
  domains: string[];
  home?: string;
  scope?: 'codex' | 'workspace' | 'quest';
  targetWorkspace?: string;
  targetQuest?: string;
  targetRoot?: string;
  quiet?: boolean;
  companionMode?: 'observe' | 'ask_to_apply' | 'managed';
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
  CommandAuthorityBoundary,
  CommandHandler,
  CommandOptionMetadata,
  CommandOptionValueKind,
  CommandRegistryMetadata,
  CommandSpec,
  DeveloperSupervisorCliInput,
  DomainLaunchStrategy,
  OplEngineCliInput,
  OplModuleExecCliInput,
  OplModuleCliInput,
  HostedPilotPackageCliInput,
  LaunchDomainCliInput,
  ParsedCliInput,
  ProductEntryCliInput,
  ResumeCliInput,
  SessionLedgerCliInput,
  SessionRuntimeCliInput,
  StartCliInput,
  SkillPacksCliInput,
  SystemConfigureCodexCliInput,
  SystemDependencyCliInput,
  SystemSeedApplyCliInput,
  SystemStartupMaintenanceCliInput,
  TurnkeyInstallCliInput,
  UpdateChannelCliInput,
  WebCliInput,
  WorkspaceInitializeCliInput,
  WorkspaceAdoptCliInput,
  WorkspaceArtifactLifecycleCliInput,
  WorkspaceSourceIngestCliInput,
  WorkspaceLifecycleCliInput,
  WorkspaceValidationCliInput,
  WorkspaceRegistryCliInput,
  WorkspaceRootCliInput,
};
