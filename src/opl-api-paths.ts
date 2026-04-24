import { normalizeOplWebBasePath } from './opl-web-paths.ts';

export type OplApiCatalog = {
  resources: {
    system: string;
    engines: string;
    modules: string;
    agents: string;
    workspaces: string;
    sessions: string;
    progress: string;
    artifacts: string;
  };
  actions: {
    system_initialize: string;
    system: string;
    system_settings: string;
    engines: string;
    modules: string;
    workspace_root: string;
    workspace_bind: string;
    workspace_activate: string;
    workspace_archive: string;
    session_create: string;
    session_resume: string;
    session_logs: string;
    start: string;
    launch_domain: string;
    handoff_envelope: string;
    web_bundle: string;
    web_package: string;
  };
  debug: {
    health: string;
    dashboard: string;
    domain_manifests: string;
    runtime_status: string;
    session_ledger: string;
    workspace_status: string;
  };
};

export function buildOplApiCatalog(basePath = ''): OplApiCatalog {
  const prefix = normalizeOplWebBasePath(basePath);
  const apiBase = `${prefix}/api`;
  const oplBase = `${apiBase}/opl`;

  return {
    resources: {
      system: `${oplBase}/system`,
      engines: `${oplBase}/engines`,
      modules: `${oplBase}/modules`,
      agents: `${oplBase}/agents`,
      workspaces: `${oplBase}/workspaces`,
      sessions: `${oplBase}/sessions`,
      progress: `${oplBase}/progress`,
      artifacts: `${oplBase}/artifacts`,
    },
    actions: {
      system_initialize: `${oplBase}/system/initialize`,
      system: `${oplBase}/system/actions`,
      system_settings: `${oplBase}/system/settings`,
      engines: `${oplBase}/engines/actions`,
      modules: `${oplBase}/modules/actions`,
      workspace_root: `${oplBase}/workspaces/root`,
      workspace_bind: `${oplBase}/workspaces/bind`,
      workspace_activate: `${oplBase}/workspaces/activate`,
      workspace_archive: `${oplBase}/workspaces/archive`,
      session_create: `${oplBase}/sessions`,
      session_resume: `${oplBase}/sessions/resume`,
      session_logs: `${oplBase}/sessions/logs`,
      start: `${oplBase}/start`,
      launch_domain: `${oplBase}/domain-launch`,
      handoff_envelope: `${oplBase}/handoff-envelope`,
      web_bundle: `${oplBase}/web/bundle`,
      web_package: `${oplBase}/web/package`,
    },
    debug: {
      health: `${apiBase}/health`,
      dashboard: `${apiBase}/status/dashboard`,
      domain_manifests: `${apiBase}/domain/manifests`,
      runtime_status: `${apiBase}/status/runtime`,
      session_ledger: `${apiBase}/session/ledger`,
      workspace_status: `${apiBase}/status/workspace`,
    },
  };
}
