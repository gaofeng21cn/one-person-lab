export type FrontDeskEndpoints = {
  health: string;
  manifest: string;
  frontdesk_entry_guide: string;
  frontdesk_readiness: string;
  frontdesk_settings: string;
  frontdesk_librechat_status: string;
  frontdesk_librechat_title_sync: string;
  project_progress: string;
  domain_manifests: string;
  hosted_bundle: string;
  hosted_package: string;
  librechat_package: string;
  projects: string;
  workspace_status: string;
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

  return {
    health: `${apiBase}/health`,
    manifest: `${apiBase}/frontdesk-manifest`,
    frontdesk_entry_guide: `${apiBase}/frontdesk-entry-guide`,
    frontdesk_readiness: `${apiBase}/frontdesk-readiness`,
    frontdesk_settings: `${apiBase}/frontdesk-settings`,
    frontdesk_librechat_status: `${apiBase}/frontdesk-librechat-status`,
    frontdesk_librechat_title_sync: `${apiBase}/frontdesk-librechat-title-sync`,
    project_progress: `${apiBase}/project-progress`,
    domain_manifests: `${apiBase}/domain-manifests`,
    hosted_bundle: `${apiBase}/hosted-bundle`,
    hosted_package: `${apiBase}/hosted-package`,
    librechat_package: `${apiBase}/librechat-package`,
    projects: `${apiBase}/projects`,
    workspace_status: `${apiBase}/workspace-status`,
    workspace_catalog: `${apiBase}/workspace-catalog`,
    workspace_bind: `${apiBase}/workspace-bind`,
    workspace_activate: `${apiBase}/workspace-activate`,
    workspace_archive: `${apiBase}/workspace-archive`,
    runtime_status: `${apiBase}/runtime-status`,
    session_ledger: `${apiBase}/session-ledger`,
    dashboard: `${apiBase}/dashboard`,
    ask: `${apiBase}/ask`,
    task_status: `${apiBase}/task-status`,
    start: `${apiBase}/start`,
    frontdesk_domain_wiring: `${apiBase}/frontdesk-domain-wiring`,
    launch_domain: `${apiBase}/launch-domain`,
    handoff_envelope: `${apiBase}/handoff-envelope`,
    sessions: `${apiBase}/sessions`,
    resume: `${apiBase}/resume`,
    logs: `${apiBase}/logs`,
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
