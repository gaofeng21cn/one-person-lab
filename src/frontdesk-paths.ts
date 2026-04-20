export type FrontDeskEndpoints = {
  health: string;
  manifest: string;
  frontdesk_entry_guide: string;
  frontdesk_readiness: string;
  frontdesk_settings: string;
  frontdesk_environment: string;
  frontdesk_initialize: string;
  frontdesk_modules: string;
  frontdesk_engine_action: string;
  frontdesk_module_action: string;
  frontdesk_system_action: string;
  project_progress: string;
  domain_manifests: string;
  hosted_bundle: string;
  hosted_package: string;
  projects: string;
  workspace_status: string;
  workspace_root: string;
  workspace_catalog: string;
  workspace_bind: string;
  workspace_activate: string;
  workspace_archive: string;
  runtime_status: string;
  session_ledger: string;
  dashboard: string;
  ask: string;
  task_status: string;
  start: string;
  frontdesk_domain_wiring: string;
  launch_domain: string;
  handoff_envelope: string;
  sessions: string;
  resume: string;
  logs: string;
};

export function normalizeBasePath(basePath?: string) {
  const trimmed = (basePath ?? '').trim();

  if (!trimmed || trimmed === '/') {
    return '';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

export function buildFrontDeskEndpoints(basePath = ''): FrontDeskEndpoints {
  const prefix = normalizeBasePath(basePath);
  const apiBase = `${prefix}/api`;
  const oplBase = `${apiBase}/opl`;

  return {
    health: `${apiBase}/health`,
    manifest: `${apiBase}/frontdesk/manifest`,
    frontdesk_entry_guide: `${apiBase}/frontdesk/entry-guide`,
    frontdesk_readiness: `${apiBase}/frontdesk/readiness`,
    frontdesk_settings: `${oplBase}/system/settings`,
    frontdesk_environment: `${oplBase}/system`,
    frontdesk_initialize: `${oplBase}/system/initialize`,
    frontdesk_modules: `${oplBase}/modules`,
    frontdesk_engine_action: `${oplBase}/engines/actions`,
    frontdesk_module_action: `${oplBase}/modules/actions`,
    frontdesk_system_action: `${oplBase}/system/actions`,
    project_progress: `${apiBase}/project-progress`,
    domain_manifests: `${apiBase}/domain/manifests`,
    hosted_bundle: `${oplBase}/web/bundle`,
    hosted_package: `${oplBase}/web/package`,
    projects: `${apiBase}/projects`,
    workspace_status: `${apiBase}/status/workspace`,
    workspace_root: `${oplBase}/workspaces/root`,
    workspace_catalog: `${oplBase}/workspaces`,
    workspace_bind: `${oplBase}/workspaces/bind`,
    workspace_activate: `${oplBase}/workspaces/activate`,
    workspace_archive: `${oplBase}/workspaces/archive`,
    runtime_status: `${apiBase}/status/runtime`,
    session_ledger: `${apiBase}/session/ledger`,
    dashboard: `${apiBase}/status/dashboard`,
    ask: `${apiBase}/ask`,
    task_status: `${apiBase}/task-status`,
    start: `${oplBase}/start`,
    frontdesk_domain_wiring: `${apiBase}/frontdesk/domain-wiring`,
    launch_domain: `${oplBase}/domain-launch`,
    handoff_envelope: `${oplBase}/handoff-envelope`,
    sessions: `${oplBase}/sessions`,
    resume: `${oplBase}/sessions/resume`,
    logs: `${oplBase}/sessions/logs`,
  };
}

export function buildFrontDeskEntryUrl(baseUrl: string, basePath = '') {
  const prefix = normalizeBasePath(basePath);
  return prefix ? `${baseUrl}${prefix}/` : `${baseUrl}/`;
}

export function buildFrontDeskApiBaseUrl(baseUrl: string, basePath = '') {
  const prefix = normalizeBasePath(basePath);
  return prefix ? `${baseUrl}${prefix}/api` : `${baseUrl}/api`;
}

export function stripFrontDeskBasePath(pathname: string, basePath = '') {
  const prefix = normalizeBasePath(basePath);

  if (!prefix) {
    return pathname;
  }

  if (pathname === prefix) {
    return '/';
  }

  if (pathname.startsWith(`${prefix}/`)) {
    return pathname.slice(prefix.length);
  }

  return null;
}
