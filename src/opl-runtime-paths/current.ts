import { normalizeBasePath } from './shared.ts';

export type OplRuntimeEndpoints = {
  health: string;
  project_progress: string;
  domain_manifests: string;
  projects: string;
  workspace_status: string;
  workspace_root: string;
  workspace_catalog: string;
  workspace_bind: string;
  workspace_activate: string;
  workspace_archive: string;
  system_environment: string;
  system_settings: string;
  system_initialize: string;
  modules: string;
  engine_action: string;
  module_action: string;
  system_action: string;
  runtime_status: string;
  session_ledger: string;
  dashboard: string;
  ask: string;
  task_status: string;
  start: string;
  launch_domain: string;
  handoff_envelope: string;
  sessions: string;
  resume: string;
  logs: string;
};

export function buildOplRuntimeEndpoints(basePath = ''): OplRuntimeEndpoints {
  const prefix = normalizeBasePath(basePath);
  const apiBase = `${prefix}/api`;
  const oplBase = `${apiBase}/opl`;

  return {
    health: `${apiBase}/health`,
    project_progress: `${apiBase}/project-progress`,
    domain_manifests: `${apiBase}/domain/manifests`,
    projects: `${apiBase}/projects`,
    workspace_status: `${apiBase}/status/workspace`,
    workspace_root: `${oplBase}/workspaces/root`,
    workspace_catalog: `${oplBase}/workspaces`,
    workspace_bind: `${oplBase}/workspaces/bind`,
    workspace_activate: `${oplBase}/workspaces/activate`,
    workspace_archive: `${oplBase}/workspaces/archive`,
    system_environment: `${oplBase}/system`,
    system_settings: `${oplBase}/system/settings`,
    system_initialize: `${oplBase}/system/initialize`,
    modules: `${oplBase}/modules`,
    engine_action: `${oplBase}/engines/actions`,
    module_action: `${oplBase}/modules/actions`,
    system_action: `${oplBase}/system/actions`,
    runtime_status: `${apiBase}/status/runtime`,
    session_ledger: `${apiBase}/session/ledger`,
    dashboard: `${apiBase}/status/dashboard`,
    ask: `${apiBase}/ask`,
    task_status: `${apiBase}/task-status`,
    start: `${oplBase}/start`,
    launch_domain: `${oplBase}/domain-launch`,
    handoff_envelope: `${oplBase}/handoff-envelope`,
    sessions: `${oplBase}/sessions`,
    resume: `${oplBase}/sessions/resume`,
    logs: `${oplBase}/sessions/logs`,
  };
}
