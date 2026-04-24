import type { OplApiCatalog } from '../opl-api-paths.ts';
import type { DomainLaunchStrategy } from '../domain-launch.ts';
import type { FrontDeskAgentMode, FrontDeskRuntimeModes } from '../frontdesk-runtime-modes.ts';
import type { FrontDeskEngineAction, FrontDeskSystemAction, FrontDeskModuleAction } from '../frontdesk-installation.ts';
import type { GatewayContracts } from '../types.ts';

export interface WebFrontDeskOptions {
  host?: string;
  port?: number;
  workspacePath?: string;
  sessionsLimit?: number;
  basePath?: string;
}

export type AskRequestBody = Partial<{
  dryRun: boolean;
  dry_run: boolean;
  goal: string;
  intent: string;
  target: string;
  preferredFamily: string;
  preferred_family: string;
  requestKind: string;
  request_kind: string;
  model: string;
  provider: string;
  workspacePath: string;
  workspace_path: string;
  skills: string[] | string;
}>;

export type FrontDeskSettingsRequestBody = Partial<{
  interactionMode: FrontDeskAgentMode;
  interaction_mode: FrontDeskAgentMode;
  executionMode: FrontDeskAgentMode;
  execution_mode: FrontDeskAgentMode;
}>;

export type FrontDeskModuleActionRequestBody = Partial<{
  action: FrontDeskModuleAction | string;
  moduleId: string;
  module_id: string;
}>;

export type FrontDeskEngineActionRequestBody = Partial<{
  action: FrontDeskEngineAction | string;
  engineId: string;
  engine_id: string;
}>;

export type FrontDeskSystemActionRequestBody = Partial<{
  action: FrontDeskSystemAction | string;
  channel: string;
  host: string;
  port: number | string;
  workspacePath: string;
  workspace_path: string;
  sessionsLimit: number | string;
  sessions_limit: number | string;
  basePath: string;
  base_path: string;
}>;

export type WorkspaceRootRequestBody = Partial<{
  path: string;
  workspaceRoot: string;
  workspace_root: string;
}>;

export type ResumeRequestBody = Partial<{
  sessionId: string;
  session_id: string;
}>;

export type LaunchDomainRequestBody = Partial<{
  projectId: string;
  project_id: string;
  workspacePath: string;
  workspace_path: string;
  strategy: DomainLaunchStrategy;
  dryRun: boolean;
  dry_run: boolean;
}>;

export type WorkspaceRegistryBody = Partial<{
  projectId: string;
  project_id: string;
  workspacePath: string;
  workspace_path: string;
  label: string;
  entryCommand: string;
  entry_command: string;
  manifestCommand: string;
  manifest_command: string;
  entryUrl: string;
  entry_url: string;
  workspaceRoot: string;
  workspace_root: string;
  profileRef: string;
  profile_ref: string;
  inputPath: string;
  input_path: string;
}>;

export type HostedPackageRequestBody = Partial<{
  outputDir: string;
  output_dir: string;
  publicOrigin: string;
  public_origin: string;
  host: string;
  port: number | string;
  basePath: string;
  base_path: string;
  sessionsLimit: number | string;
  sessions_limit: number | string;
}>;

export type WebFrontDeskStartupPayload = {
  version: 'g2';
  contracts_context: {
    contracts_dir: string;
    contracts_root_source: string;
  };
  opl_api: {
    surface_id: 'opl_product_api_bootstrap';
    entry_surface: 'opl_product_api';
    runtime_substrate: 'external_hermes_kernel';
    mode: 'local_product_api_adapter';
    local_shell_command: 'opl web';
    local_only: true;
    listening: {
      host: string;
      port: number;
      base_url: string;
      entry_url: string;
      base_path: string;
    };
    resources: OplApiCatalog['resources'];
    actions: OplApiCatalog['actions'];
    debug: OplApiCatalog['debug'];
    runtime_modes: FrontDeskRuntimeModes;
    defaults: {
      workspace_path: string;
      sessions_limit: number;
    };
    recommended_gui_overlay: 'aionui_shell';
    notes: string[];
  };
};

export type WebFrontDeskContext = {
  contracts: GatewayContracts;
  host: string;
  port: number;
  baseUrl: string;
  entryUrl: string;
  basePath: string;
  workspacePath: string;
  sessionsLimit: number;
};
