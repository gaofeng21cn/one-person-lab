export type FrontDeskEndpoints = {
  health: string;
  manifest: string;
  hosted_bundle: string;
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
    hosted_bundle: `${apiBase}/hosted-bundle`,
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
