import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import { GatewayContractError } from './contracts.ts';
import { buildDomainManifestCatalog } from './domain-manifest.ts';
import { ensureFrontDeskStateDir, resolveFrontDeskStatePaths } from './frontdesk-state.ts';
import { buildFrontDeskEndpoints } from './frontdesk-paths.ts';
import { buildProductEntryHandoffEnvelope, type ProductEntryCliInput } from './product-entry.ts';
import { buildSessionLedger } from './session-ledger.ts';
import type { GatewayContracts } from './types.ts';

const PAPERCLIP_EXECUTION_WORKSPACE_PREFERENCES = [
  'inherit',
  'shared_workspace',
  'isolated_workspace',
  'operator_branch',
  'reuse_existing',
  'agent_default',
] as const;

export type PaperclipExecutionWorkspacePreference =
  typeof PAPERCLIP_EXECUTION_WORKSPACE_PREFERENCES[number];

export type PaperclipProjectBinding = {
  project_id: string;
  project: string;
  company_id: string;
  paperclip_project_id: string | null;
  project_workspace_id: string | null;
  execution_workspace_preference: PaperclipExecutionWorkspacePreference | null;
  created_at: string;
  updated_at: string;
};

type PaperclipControlPlaneFile = {
  version: 'g2';
  config: {
    base_url: string | null;
    auth_header_env: string | null;
    cookie_env: string | null;
    control_company_id: string | null;
  };
  project_bindings: PaperclipProjectBinding[];
};

type PaperclipConnectionSummary = {
  base_url: string | null;
  auth: {
    header_env: string | null;
    cookie_env: string | null;
    header_present: boolean;
    cookie_present: boolean;
  };
  control_company_id: string | null;
};

export type PaperclipControlPlaneSummary = {
  surface_id: 'opl_paperclip_control_plane_bridge';
  readiness: 'not_configured' | 'partial' | 'configured';
  state_dir: string;
  config_file: string;
  projection_registry_file: string;
  connection: PaperclipConnectionSummary;
  summary: {
    available_projects: string[];
    project_bindings_count: number;
    bound_projects: string[];
    tracked_projections_count: number;
    tracked_task_projections_count: number;
    tracked_gate_projections_count: number;
    last_projection_at: string | null;
    last_sync_at: string | null;
  };
  project_bindings: PaperclipProjectBinding[];
  tracked_projections: Array<{
    projection_id: string;
    projection_kind: 'task' | 'gate';
    target_project_id: string;
    company_id: string;
    issue_id: string;
    approval_id: string | null;
    workspace_path: string | null;
    created_at: string;
    last_sync_at: string | null;
    sync_count: number;
  }>;
  notes: string[];
};

export type PaperclipTrackedProjection = {
  projection_id: string;
  projection_kind: 'task' | 'gate';
  target_project_id: string;
  company_id: string;
  issue_id: string;
  approval_id: string | null;
  goal: string;
  preferred_family: string | null;
  workspace_path: string | null;
  handoff_bundle: Record<string, unknown>;
  family_human_gate: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  last_sync_at: string | null;
  last_sync_fingerprint: string | null;
  sync_count: number;
};

type PaperclipProjectionRegistryFile = {
  version: 'g2';
  projections: PaperclipTrackedProjection[];
};

export type PaperclipConfigOptions = {
  baseUrl?: string;
  authHeaderEnv?: string;
  cookieEnv?: string;
  controlCompanyId?: string;
};

export type PaperclipBindOptions = {
  projectId: string;
  companyId: string;
  paperclipProjectId?: string;
  projectWorkspaceId?: string;
  executionWorkspacePreference?: string;
};

export type PaperclipTaskOptions = {
  title?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
};

export type PaperclipGateOptions = {
  title?: string;
  gateKind?: string;
  decisionOptions?: string[];
};

export type PaperclipBootstrapOptions = {
  basePath?: string;
};

export type PaperclipSyncOptions = {
  issueId?: string;
  projectId?: string;
  workspacePath?: string;
  sessionsLimit?: number;
  force?: boolean;
};

type PaperclipRequestConfig = {
  baseUrl: string;
  headers: Record<string, string>;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value.trim());
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = pathname || '/';
  return url.toString().replace(/\/$/, '');
}

function normalizeExecutionWorkspacePreference(value?: string | null) {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return null;
  }

  if (
    PAPERCLIP_EXECUTION_WORKSPACE_PREFERENCES.includes(
      trimmed as PaperclipExecutionWorkspacePreference,
    )
  ) {
    return trimmed as PaperclipExecutionWorkspacePreference;
  }

  throw new GatewayContractError(
    'cli_usage_error',
    'Unsupported Paperclip execution workspace preference.',
    {
      execution_workspace_preference: trimmed,
      allowed_values: PAPERCLIP_EXECUTION_WORKSPACE_PREFERENCES,
    },
  );
}

function allowedProjects(contracts: GatewayContracts) {
  return [
    {
      project_id: 'opl',
      project: 'one-person-lab',
    },
    ...contracts.domains.domains.map((domain) => ({
      project_id: domain.domain_id,
      project: domain.project,
    })),
  ];
}

function findAllowedProject(contracts: GatewayContracts, projectId: string) {
  const project = allowedProjects(contracts).find((entry) => entry.project_id === projectId);
  if (!project) {
    throw new GatewayContractError(
      'domain_not_found',
      'Paperclip bindings only allow OPL and admitted domain project surfaces.',
      {
        project_id: projectId,
        allowed_project_ids: allowedProjects(contracts).map((entry) => entry.project_id),
      },
    );
  }

  return project;
}

function readPaperclipControlPlaneFile(): PaperclipControlPlaneFile {
  const paths = resolveFrontDeskStatePaths();
  if (!fs.existsSync(paths.paperclip_control_plane_file)) {
    return {
      version: 'g2',
      config: {
        base_url: null,
        auth_header_env: null,
        cookie_env: null,
        control_company_id: null,
      },
      project_bindings: [],
    };
  }

  try {
    const parsed = JSON.parse(
      fs.readFileSync(paths.paperclip_control_plane_file, 'utf8'),
    ) as Partial<PaperclipControlPlaneFile>;

    if (parsed.version !== 'g2' || !parsed.config || !Array.isArray(parsed.project_bindings)) {
      throw new Error('Invalid Paperclip control-plane registry shape.');
    }

    return {
      version: 'g2',
      config: {
        base_url: normalizeOptionalString(parsed.config.base_url),
        auth_header_env: normalizeOptionalString(parsed.config.auth_header_env),
        cookie_env: normalizeOptionalString(parsed.config.cookie_env),
        control_company_id: normalizeOptionalString(parsed.config.control_company_id),
      },
      project_bindings: parsed.project_bindings.map((binding) => ({
        project_id: String(binding.project_id),
        project: String(binding.project),
        company_id: String(binding.company_id),
        paperclip_project_id: normalizeOptionalString(binding.paperclip_project_id),
        project_workspace_id: normalizeOptionalString(binding.project_workspace_id),
        execution_workspace_preference: normalizeExecutionWorkspacePreference(
          binding.execution_workspace_preference,
        ),
        created_at: String(binding.created_at),
        updated_at: String(binding.updated_at),
      })),
    };
  } catch (error) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'Existing Paperclip control-plane registry is invalid JSON or has an invalid shape.',
      {
        file: paths.paperclip_control_plane_file,
        cause:
          error instanceof Error ? error.message : 'Unknown Paperclip control-plane parse failure.',
      },
    );
  }
}

function writePaperclipControlPlaneFile(payload: PaperclipControlPlaneFile) {
  const paths = ensureFrontDeskStateDir();
  fs.writeFileSync(paths.paperclip_control_plane_file, `${JSON.stringify(payload, null, 2)}\n`);
}

function requireProjectionString(value: unknown, field: string) {
  const text = typeof value === 'string' ? normalizeOptionalString(value) : null;
  if (!text) {
    throw new Error(`Invalid Paperclip projection registry entry: missing ${field}.`);
  }
  return text;
}

function requireProjectionRecord(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid Paperclip projection registry entry: ${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function readPaperclipProjectionRegistryFile(): PaperclipProjectionRegistryFile {
  const paths = resolveFrontDeskStatePaths();
  if (!fs.existsSync(paths.paperclip_projection_registry_file)) {
    return {
      version: 'g2',
      projections: [],
    };
  }

  try {
    const parsed = JSON.parse(
      fs.readFileSync(paths.paperclip_projection_registry_file, 'utf8'),
    ) as Partial<PaperclipProjectionRegistryFile>;

    if (parsed.version !== 'g2' || !Array.isArray(parsed.projections)) {
      throw new Error('Invalid Paperclip projection registry shape.');
    }

    return {
      version: 'g2',
      projections: parsed.projections.map((projection) => {
        if (projection.projection_kind !== 'task' && projection.projection_kind !== 'gate') {
          throw new Error('Invalid Paperclip projection registry entry: unsupported projection_kind.');
        }
        if (
          typeof projection.sync_count !== 'number'
          || !Number.isInteger(projection.sync_count)
          || projection.sync_count < 0
        ) {
          throw new Error('Invalid Paperclip projection registry entry: sync_count must be a non-negative integer.');
        }

        return {
          projection_id: requireProjectionString(projection.projection_id, 'projection_id'),
          projection_kind: projection.projection_kind,
          target_project_id: requireProjectionString(projection.target_project_id, 'target_project_id'),
          company_id: requireProjectionString(projection.company_id, 'company_id'),
          issue_id: requireProjectionString(projection.issue_id, 'issue_id'),
          approval_id: normalizeOptionalString(projection.approval_id),
          goal: requireProjectionString(projection.goal, 'goal'),
          preferred_family: normalizeOptionalString(projection.preferred_family),
          workspace_path: normalizeOptionalString(projection.workspace_path),
          handoff_bundle: requireProjectionRecord(projection.handoff_bundle, 'handoff_bundle'),
          family_human_gate:
            projection.family_human_gate === null || projection.family_human_gate === undefined
              ? null
              : requireProjectionRecord(projection.family_human_gate, 'family_human_gate'),
          created_at: requireProjectionString(projection.created_at, 'created_at'),
          updated_at: requireProjectionString(projection.updated_at, 'updated_at'),
          last_sync_at: normalizeOptionalString(projection.last_sync_at),
          last_sync_fingerprint: normalizeOptionalString(projection.last_sync_fingerprint),
          sync_count: projection.sync_count,
        };
      }),
    };
  } catch (error) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'Existing Paperclip projection registry is invalid JSON or has an invalid shape.',
      {
        file: paths.paperclip_projection_registry_file,
        cause:
          error instanceof Error ? error.message : 'Unknown Paperclip projection registry parse failure.',
      },
    );
  }
}

function writePaperclipProjectionRegistryFile(payload: PaperclipProjectionRegistryFile) {
  const paths = ensureFrontDeskStateDir();
  fs.writeFileSync(paths.paperclip_projection_registry_file, `${JSON.stringify(payload, null, 2)}\n`);
}

function recordTrackedProjection(
  input: Omit<
    PaperclipTrackedProjection,
    'projection_id' | 'created_at' | 'updated_at' | 'last_sync_at' | 'last_sync_fingerprint' | 'sync_count'
  >,
) {
  const registry = readPaperclipProjectionRegistryFile();
  const timestamp = nowIso();
  const projection: PaperclipTrackedProjection = {
    projection_id: `paperclip_projection_${randomUUID()}`,
    projection_kind: input.projection_kind,
    target_project_id: input.target_project_id,
    company_id: input.company_id,
    issue_id: input.issue_id,
    approval_id: input.approval_id,
    goal: input.goal,
    preferred_family: input.preferred_family,
    workspace_path: input.workspace_path,
    handoff_bundle: input.handoff_bundle,
    family_human_gate: input.family_human_gate,
    created_at: timestamp,
    updated_at: timestamp,
    last_sync_at: null,
    last_sync_fingerprint: null,
    sync_count: 0,
  };

  registry.projections.unshift(projection);
  writePaperclipProjectionRegistryFile(registry);
  return projection;
}

function buildTrackedProjectionSurface(projection: PaperclipTrackedProjection) {
  return {
    projection_id: projection.projection_id,
    projection_kind: projection.projection_kind,
    target_project_id: projection.target_project_id,
    company_id: projection.company_id,
    issue_id: projection.issue_id,
    approval_id: projection.approval_id,
    workspace_path: projection.workspace_path,
    created_at: projection.created_at,
    last_sync_at: projection.last_sync_at,
    sync_count: projection.sync_count,
  };
}

function buildConnectionSummary(file: PaperclipControlPlaneFile): PaperclipConnectionSummary {
  const headerEnv = file.config.auth_header_env;
  const cookieEnv = file.config.cookie_env;

  return {
    base_url: file.config.base_url,
    auth: {
      header_env: headerEnv,
      cookie_env: cookieEnv,
      header_present: Boolean(headerEnv && normalizeOptionalString(process.env[headerEnv])),
      cookie_present: Boolean(cookieEnv && normalizeOptionalString(process.env[cookieEnv])),
    },
    control_company_id: file.config.control_company_id,
  };
}

function computeReadiness(summary: PaperclipControlPlaneSummary['connection']) {
  const hasBaseUrl = Boolean(summary.base_url);
  const hasControlCompany = Boolean(summary.control_company_id);
  const hasAuth = summary.auth.header_present || summary.auth.cookie_present;
  const declaredAuth = Boolean(summary.auth.header_env || summary.auth.cookie_env);

  if (hasBaseUrl && hasControlCompany && declaredAuth && hasAuth) {
    return 'configured' as const;
  }
  if (hasBaseUrl || hasControlCompany || declaredAuth) {
    return 'partial' as const;
  }
  return 'not_configured' as const;
}

export function buildPaperclipControlPlaneSummary(
  contracts: GatewayContracts,
): PaperclipControlPlaneSummary {
  const file = readPaperclipControlPlaneFile();
  const projectionRegistry = readPaperclipProjectionRegistryFile();
  const paths = resolveFrontDeskStatePaths();
  const connection = buildConnectionSummary(file);

  return {
    surface_id: 'opl_paperclip_control_plane_bridge',
    readiness: computeReadiness(connection),
    state_dir: paths.state_dir,
    config_file: paths.paperclip_control_plane_file,
    projection_registry_file: paths.paperclip_projection_registry_file,
    connection,
    summary: {
      available_projects: allowedProjects(contracts).map((project) => project.project_id),
      project_bindings_count: file.project_bindings.length,
      bound_projects: file.project_bindings.map((binding) => binding.project_id),
      tracked_projections_count: projectionRegistry.projections.length,
      tracked_task_projections_count: projectionRegistry.projections.filter((entry) => entry.projection_kind === 'task').length,
      tracked_gate_projections_count: projectionRegistry.projections.filter((entry) => entry.projection_kind === 'gate').length,
      last_projection_at: projectionRegistry.projections[0]?.created_at ?? null,
      last_sync_at:
        projectionRegistry.projections
          .map((entry) => entry.last_sync_at)
          .find((entry): entry is string => Boolean(entry)) ?? null,
    },
    project_bindings: file.project_bindings,
    tracked_projections: projectionRegistry.projections.map(buildTrackedProjectionSurface),
    notes: [
      'Paperclip remains a downstream external control plane; OPL keeps routing truth, handoff truth, and top-level gateway ownership.',
      'Project bindings map admitted OPL project surfaces onto existing Paperclip companies/projects/workspaces so OPL can open tasks without inventing another control plane.',
      'Human gates are projected through the family-human-gate contract and request_board_approval approvals instead of bypassing domain runtime truth.',
      'Tracked Paperclip projections stay in a repo-local OPL registry so sync automation can update audit comments without moving runtime ownership out of OPL and the domains.',
    ],
  };
}

export function configurePaperclipControlPlane(
  contracts: GatewayContracts,
  options: PaperclipConfigOptions,
) {
  const file = readPaperclipControlPlaneFile();
  file.config = {
    base_url: options.baseUrl ? normalizeBaseUrl(options.baseUrl) : file.config.base_url,
    auth_header_env:
      options.authHeaderEnv !== undefined
        ? normalizeOptionalString(options.authHeaderEnv)
        : file.config.auth_header_env,
    cookie_env:
      options.cookieEnv !== undefined
        ? normalizeOptionalString(options.cookieEnv)
        : file.config.cookie_env,
    control_company_id:
      options.controlCompanyId !== undefined
        ? normalizeOptionalString(options.controlCompanyId)
        : file.config.control_company_id,
  };

  writePaperclipControlPlaneFile(file);
  return buildPaperclipControlPlaneSummary(contracts);
}

export function bindPaperclipProject(contracts: GatewayContracts, options: PaperclipBindOptions) {
  const project = findAllowedProject(contracts, options.projectId);
  const file = readPaperclipControlPlaneFile();
  const existing = file.project_bindings.find((binding) => binding.project_id === project.project_id);
  const timestamp = nowIso();

  if (existing) {
    existing.company_id = options.companyId.trim();
    existing.paperclip_project_id = normalizeOptionalString(options.paperclipProjectId);
    existing.project_workspace_id = normalizeOptionalString(options.projectWorkspaceId);
    existing.execution_workspace_preference = normalizeExecutionWorkspacePreference(
      options.executionWorkspacePreference,
    );
    existing.updated_at = timestamp;
  } else {
    file.project_bindings.push({
      project_id: project.project_id,
      project: project.project,
      company_id: options.companyId.trim(),
      paperclip_project_id: normalizeOptionalString(options.paperclipProjectId),
      project_workspace_id: normalizeOptionalString(options.projectWorkspaceId),
      execution_workspace_preference: normalizeExecutionWorkspacePreference(
        options.executionWorkspacePreference,
      ),
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  writePaperclipControlPlaneFile(file);
  return buildPaperclipControlPlaneSummary(contracts);
}

function requirePaperclipRequestConfig(summary: PaperclipControlPlaneSummary): PaperclipRequestConfig {
  if (!summary.connection.base_url) {
    throw new GatewayContractError(
      'paperclip_not_configured',
      'Paperclip base URL is not configured.',
      {
        config_file: summary.config_file,
      },
    );
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
  };
  const headerEnv = summary.connection.auth.header_env;
  const cookieEnv = summary.connection.auth.cookie_env;
  const authHeaderValue = headerEnv ? normalizeOptionalString(process.env[headerEnv]) : null;
  const cookieValue = cookieEnv ? normalizeOptionalString(process.env[cookieEnv]) : null;

  if (authHeaderValue) {
    headers.authorization = authHeaderValue;
  }
  if (cookieValue) {
    headers.cookie = cookieValue;
  }

  if (!headers.authorization && !headers.cookie) {
    throw new GatewayContractError(
      'paperclip_not_configured',
      'Paperclip auth env is declared but no auth value is currently available in the environment.',
      {
        auth_header_env: headerEnv,
        cookie_env: cookieEnv,
      },
    );
  }

  return {
    baseUrl: summary.connection.base_url,
    headers,
  };
}

async function paperclipRequest(
  config: PaperclipRequestConfig,
  pathName: string,
  body: Record<string, unknown>,
) {
  const url = `${config.baseUrl}${pathName}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: config.headers,
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  let payload: unknown = null;
  if (rawText.trim()) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = rawText;
    }
  }

  if (!response.ok) {
    throw new GatewayContractError(
      'paperclip_request_failed',
      'Paperclip request failed.',
      {
        url,
        status: response.status,
        response: payload,
      },
    );
  }

  return payload;
}

function extractHandoffBundle(payload: Record<string, unknown>) {
  const handoffBundle = payload.handoff_bundle;
  if (!handoffBundle || typeof handoffBundle !== 'object' || Array.isArray(handoffBundle)) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      'OPL handoff bundle did not contain a machine-readable handoff_bundle payload.',
    );
  }

  return handoffBundle as Record<string, unknown>;
}

function resolveTargetProjectId(
  handoffBundle: Record<string, unknown>,
) {
  const targetDomainId = handoffBundle.target_domain_id;
  return typeof targetDomainId === 'string' && targetDomainId.trim() ? targetDomainId.trim() : null;
}

function findProjectBindingOrThrow(
  summary: PaperclipControlPlaneSummary,
  projectId: string,
) {
  const binding = summary.project_bindings.find((entry) => entry.project_id === projectId);
  if (!binding) {
    throw new GatewayContractError(
      'paperclip_not_configured',
      'No Paperclip binding exists for the routed project.',
      {
        project_id: projectId,
        bound_projects: summary.summary.bound_projects,
      },
    );
  }

  return binding;
}

function buildIssueDescription(input: {
  goal: string;
  handoffBundle: Record<string, unknown>;
  mode: 'task' | 'gate';
  extra?: Record<string, unknown>;
}) {
  const sections = [
    `# OPL ${input.mode === 'task' ? 'Task' : 'Gate'} Request`,
    '',
    input.goal,
    '',
    '## Handoff Bundle',
    '```json',
    JSON.stringify(input.handoffBundle, null, 2),
    '```',
  ];

  if (input.extra && Object.keys(input.extra).length > 0) {
    sections.push('', '## Extra Context', '```json', JSON.stringify(input.extra, null, 2), '```');
  }

  return sections.join('\n');
}

function truncateTitle(value: string, prefix = '') {
  const normalized = `${prefix}${value}`.trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function buildWorkspaceSnapshot(workspacePath?: string | null) {
  const normalizedPath = normalizeOptionalString(workspacePath);
  if (!normalizedPath) {
    return {
      status: 'not_provided' as const,
      workspace_path: null,
      git: null,
    };
  }

  const absolutePath = path.resolve(normalizedPath);
  if (!fs.existsSync(absolutePath)) {
    return {
      status: 'missing' as const,
      workspace_path: absolutePath,
      git: null,
    };
  }

  const statusResult = spawnSync('git', ['-C', absolutePath, 'status', '--short', '--branch'], {
    encoding: 'utf8',
    env: process.env,
  });
  const lines = statusResult.status === 0
    ? (statusResult.stdout ?? '').split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean)
    : [];
  const statusLine = lines[0] ?? null;
  const changedLines = statusLine ? lines.slice(1) : lines;
  const branchMatch = statusLine?.match(/^##\s+([^\s.]+)(?:\.\.\.([^\s]+))?(?:\s+\[(.+)\])?$/);

  return {
    status: 'ready' as const,
    workspace_path: absolutePath,
    git: {
      inside_work_tree: statusResult.status === 0,
      branch: branchMatch?.[1] ?? null,
      upstream: branchMatch?.[2] ?? null,
      upstream_state: branchMatch?.[3] ?? null,
      is_clean: changedLines.length === 0,
      changed_count: changedLines.length,
    },
  };
}

function buildDomainManifestSnapshot(contracts: GatewayContracts, targetProjectId: string) {
  const manifestCatalog = buildDomainManifestCatalog(contracts);
  const project = manifestCatalog.domain_manifests.projects.find((entry) => entry.project_id === targetProjectId);
  if (!project) {
    return {
      domain_manifest_status: 'not_bound',
      domain_manifest: null,
    };
  }

  return {
    domain_manifest_status: project.status,
    domain_manifest: {
      project_id: project.project_id,
      status: project.status,
      workspace_path: project.workspace_path,
      recommended_command: project.manifest?.recommended_command ?? null,
      frontdesk_surface: project.manifest?.frontdesk_surface ?? null,
      operator_loop_surface: project.manifest?.operator_loop_surface ?? null,
      product_entry_quickstart: project.manifest?.product_entry_quickstart ?? null,
    },
  };
}

function buildRelatedSessionSnapshot(
  targetProjectId: string,
  workspacePath: string | null,
  limit = 5,
) {
  const sessionLedger = buildSessionLedger(limit);
  const normalizedWorkspacePath = workspacePath ? path.resolve(workspacePath) : null;
  const relatedSessions = sessionLedger.session_ledger.sessions.filter((session) => {
    const domainMatches = session.domain_id === targetProjectId;
    if (!domainMatches) {
      return false;
    }

    if (!normalizedWorkspacePath) {
      return true;
    }

    return session.workspace_locator?.absolute_path === normalizedWorkspacePath;
  });

  return {
    related_session_aggregate_count: relatedSessions.length,
    related_sessions: relatedSessions,
  };
}

function buildProjectionSyncSnapshot(
  contracts: GatewayContracts,
  projection: PaperclipTrackedProjection,
  options: PaperclipSyncOptions = {},
) {
  const workspaceStatus = buildWorkspaceSnapshot(projection.workspace_path ?? options.workspacePath ?? null);
  const manifestSnapshot = buildDomainManifestSnapshot(contracts, projection.target_project_id);
  const relatedSessionSnapshot = buildRelatedSessionSnapshot(
    projection.target_project_id,
    workspaceStatus.workspace_path,
    options.sessionsLimit ?? 5,
  );

  return {
    synced_at: nowIso(),
    projection: {
      projection_id: projection.projection_id,
      projection_kind: projection.projection_kind,
      target_project_id: projection.target_project_id,
      company_id: projection.company_id,
      issue_id: projection.issue_id,
      approval_id: projection.approval_id,
      goal: projection.goal,
      preferred_family: projection.preferred_family,
    },
    workspace_path: workspaceStatus.workspace_path,
    workspace_status: workspaceStatus,
    ...manifestSnapshot,
    ...relatedSessionSnapshot,
    handoff_bundle: projection.handoff_bundle,
    family_human_gate: projection.family_human_gate,
  };
}

function buildSyncFingerprint(snapshot: Record<string, unknown>) {
  const { synced_at: _syncedAt, ...stableSnapshot } = snapshot;
  return createHash('sha256').update(JSON.stringify(stableSnapshot)).digest('hex');
}

function buildSyncCommentBody(snapshot: ReturnType<typeof buildProjectionSyncSnapshot>) {
  return [
    '# OPL Sync Update',
    '',
    `- projection_kind: ${snapshot.projection.projection_kind}`,
    `- target_project_id: ${snapshot.projection.target_project_id}`,
    `- issue_id: ${snapshot.projection.issue_id}`,
    `- synced_at: ${snapshot.synced_at}`,
    '',
    snapshot.projection.goal,
    '',
    '## Snapshot',
    '```json',
    JSON.stringify(snapshot, null, 2),
    '```',
  ].join('\n');
}

function buildBootstrapPlaybooks() {
  return [
    {
      playbook_id: 'task_execution_loop',
      title: 'Open task, execute in the routed domain, then sync audit state back into Paperclip.',
      steps: [
        {
          step_id: 'open_task',
          command: 'opl paperclip-open-task "<request...>" --workspace-path <path>',
          summary: 'Freeze the OPL handoff bundle and open the routed Paperclip task in the mapped project company.',
        },
        {
          step_id: 'execute_domain_work',
          command: null,
          summary: 'Continue the work inside the routed domain surface while OPL keeps the handoff and session ledger truth.',
        },
        {
          step_id: 'sync_state',
          command: 'opl paperclip-sync --all',
          summary: 'Write the latest OPL workspace, manifest, and session state back into Paperclip comments.',
        },
      ],
    },
    {
      playbook_id: 'human_gate_loop',
      title: 'Open a Paperclip approval gate and keep the downstream audit thread current.',
      steps: [
        {
          step_id: 'open_gate',
          command: 'opl paperclip-open-gate "<request...>" --workspace-path <path>',
          summary: 'Project the family-human-gate contract into the Paperclip control company.',
        },
        {
          step_id: 'sync_state',
          command: 'opl paperclip-sync --all',
          summary: 'Refresh the downstream issue thread with current OPL handoff, manifest, and related session state.',
        },
        {
          step_id: 'approve_or_request_changes',
          command: null,
          summary: 'Let humans decide in Paperclip while OPL and the domains keep runtime and object truth ownership.',
        },
      ],
    },
  ];
}

export function buildPaperclipBootstrap(
  contracts: GatewayContracts,
  options: PaperclipBootstrapOptions = {},
) {
  const summary = buildPaperclipControlPlaneSummary(contracts);
  const endpoints = buildFrontDeskEndpoints(options.basePath);

  return {
    controlPlane: summary,
    bootstrap: {
      surface_id: 'opl_paperclip_operator_bootstrap',
      readiness: summary.readiness,
      preflight: {
        base_url_configured: Boolean(summary.connection.base_url),
        control_company_configured: Boolean(summary.connection.control_company_id),
        auth_declared: Boolean(summary.connection.auth.header_env || summary.connection.auth.cookie_env),
        auth_available: summary.connection.auth.header_present || summary.connection.auth.cookie_present,
        bound_projects_count: summary.summary.project_bindings_count,
        ready_for_task_projection:
          summary.readiness === 'configured' && summary.summary.project_bindings_count > 0,
        ready_for_gate_projection:
          summary.readiness === 'configured' && Boolean(summary.connection.control_company_id),
      },
      bound_projects: summary.project_bindings,
      operator_playbooks: buildBootstrapPlaybooks(),
      automation_surfaces: {
        status_command: 'opl paperclip-status',
        sync_command: 'opl paperclip-sync --all',
        web: {
          status: endpoints.paperclip_control_plane,
          bootstrap: endpoints.paperclip_bootstrap,
          sync: endpoints.paperclip_sync,
        },
      },
      docs_ref: 'docs/references/paperclip-control-plane-operator-guide.md',
      notes: [
        'Use this bootstrap surface to set up the existing downstream Paperclip workspace instead of building another control plane.',
        'The operating loops keep OPL as the gateway and audit truth while Paperclip remains the downstream issue / approval UI.',
      ],
    },
  };
}

export async function openPaperclipTask(
  input: ProductEntryCliInput,
  contracts: GatewayContracts,
  options: PaperclipTaskOptions = {},
) {
  const handoffPayload = buildProductEntryHandoffEnvelope(input, contracts) as Record<string, unknown>;
  const handoffBundle = extractHandoffBundle(handoffPayload);
  const targetProjectId = resolveTargetProjectId(handoffBundle);
  if (!targetProjectId) {
    throw new GatewayContractError(
      'paperclip_not_configured',
      'Paperclip task creation requires a routed admitted target domain.',
      {
        routing_status: handoffBundle.routing_status ?? null,
      },
    );
  }

  const summary = buildPaperclipControlPlaneSummary(contracts);
  const binding = findProjectBindingOrThrow(summary, targetProjectId);
  const requestConfig = requirePaperclipRequestConfig(summary);
  const issue = await paperclipRequest(
    requestConfig,
    `/api/companies/${binding.company_id}/issues`,
    {
      title: truncateTitle(options.title ?? input.goal),
      description: buildIssueDescription({
        goal: input.goal,
        handoffBundle,
        mode: 'task',
        extra: {
          routed_project_id: targetProjectId,
          preferred_family: input.preferredFamily ?? null,
        },
      }),
      priority: options.priority ?? 'medium',
      projectId: binding.paperclip_project_id,
      projectWorkspaceId: binding.project_workspace_id,
      executionWorkspacePreference: binding.execution_workspace_preference,
    },
  ) as Record<string, unknown>;

  const issueId = typeof issue.id === 'string' ? issue.id : null;
  if (!issueId) {
    throw new GatewayContractError(
      'paperclip_request_failed',
      'Paperclip issue creation did not return a stable issue id.',
      {
        response: issue,
      },
    );
  }

  const trackedProjection = recordTrackedProjection({
    projection_kind: 'task',
    target_project_id: targetProjectId,
    company_id: binding.company_id,
    issue_id: issueId,
    approval_id: null,
    goal: input.goal,
    preferred_family: input.preferredFamily ?? null,
    workspace_path: normalizeOptionalString(input.workspacePath),
    handoff_bundle: handoffBundle,
    family_human_gate: null,
  });

  return {
    controlPlane: buildPaperclipControlPlaneSummary(contracts),
    projectBinding: binding,
    handoffBundle,
    issue,
    trackedProjection,
  };
}

export async function openPaperclipGate(
  input: ProductEntryCliInput,
  contracts: GatewayContracts,
  options: PaperclipGateOptions = {},
) {
  const handoffPayload = buildProductEntryHandoffEnvelope(input, contracts) as Record<string, unknown>;
  const handoffBundle = extractHandoffBundle(handoffPayload);
  const targetProjectId = resolveTargetProjectId(handoffBundle);
  if (!targetProjectId) {
    throw new GatewayContractError(
      'paperclip_not_configured',
      'Paperclip gate creation requires a routed admitted target domain.',
      {
        routing_status: handoffBundle.routing_status ?? null,
      },
    );
  }

  const summary = buildPaperclipControlPlaneSummary(contracts);
  if (!summary.connection.control_company_id) {
    throw new GatewayContractError(
      'paperclip_not_configured',
      'Paperclip control company is not configured.',
      {
        config_file: summary.config_file,
      },
    );
  }

  const requestConfig = requirePaperclipRequestConfig(summary);
  const decisionOptions = options.decisionOptions?.length
    ? options.decisionOptions
    : ['approve', 'request_changes', 'reject'];
  const familyHumanGate = {
    version: 'family-human-gate.v1',
    gate_id: `paperclip_gate_${randomUUID()}`,
    target_domain_id: targetProjectId,
    gate_kind: normalizeOptionalString(options.gateKind) ?? 'human_review',
    requested_at: nowIso(),
    status: 'requested',
    request_surface: {
      surface_kind: 'opl_handoff_bundle',
      surface_id: 'opl_family_handoff_bundle',
      command: 'opl handoff-envelope',
    },
    evidence_refs: [
      {
        ref_kind: 'json_pointer',
        ref: '/handoff_bundle',
        label: 'opl family handoff bundle',
      },
    ],
    decision_options: decisionOptions,
  };

  const issue = await paperclipRequest(
    requestConfig,
    `/api/companies/${summary.connection.control_company_id}/issues`,
    {
      title: truncateTitle(options.title ?? input.goal, '[Gate] '),
      description: buildIssueDescription({
        goal: input.goal,
        handoffBundle,
        mode: 'gate',
        extra: {
          family_human_gate: familyHumanGate,
          preferred_family: input.preferredFamily ?? null,
        },
      }),
      priority: 'high',
    },
  ) as Record<string, unknown>;

  const issueId = typeof issue.id === 'string' ? issue.id : null;
  if (!issueId) {
    throw new GatewayContractError(
      'paperclip_request_failed',
      'Paperclip issue creation did not return a stable issue id.',
      {
        response: issue,
      },
    );
  }

  const approval = await paperclipRequest(
    requestConfig,
    `/api/companies/${summary.connection.control_company_id}/approvals`,
    {
      type: 'request_board_approval',
      payload: {
        family_human_gate: familyHumanGate,
        handoff_bundle: handoffBundle,
        gateway_surface: {
          surface_id: summary.surface_id,
          endpoints: buildFrontDeskEndpoints(),
        },
      },
      issueIds: [issueId],
    },
  ) as Record<string, unknown>;

  const trackedProjection = recordTrackedProjection({
    projection_kind: 'gate',
    target_project_id: targetProjectId,
    company_id: summary.connection.control_company_id,
    issue_id: issueId,
    approval_id: typeof approval.id === 'string' ? approval.id : null,
    goal: input.goal,
    preferred_family: input.preferredFamily ?? null,
    workspace_path: normalizeOptionalString(input.workspacePath),
    handoff_bundle: handoffBundle,
    family_human_gate: familyHumanGate,
  });

  return {
    controlPlane: buildPaperclipControlPlaneSummary(contracts),
    handoffBundle,
    familyHumanGate,
    issue,
    approval,
    trackedProjection,
  };
}

export async function syncPaperclipProjections(
  contracts: GatewayContracts,
  options: PaperclipSyncOptions = {},
) {
  const initialSummary = buildPaperclipControlPlaneSummary(contracts);
  const requestConfig = requirePaperclipRequestConfig(initialSummary);
  const registry = readPaperclipProjectionRegistryFile();
  const matchedProjections = registry.projections.filter((projection) => {
    if (options.issueId && projection.issue_id !== options.issueId) {
      return false;
    }
    if (options.projectId && projection.target_project_id !== options.projectId) {
      return false;
    }
    return true;
  });

  const projectionResults: Array<{
    projection_id: string;
    issue_id: string;
    projection_kind: 'task' | 'gate';
    sync_status: 'synced' | 'skipped_no_change';
    snapshot: ReturnType<typeof buildProjectionSyncSnapshot>;
    comment: Record<string, unknown> | null;
  }> = [];

  for (const projection of matchedProjections) {
    const snapshot = buildProjectionSyncSnapshot(contracts, projection, options);
    const fingerprint = buildSyncFingerprint(snapshot);

    if (!options.force && projection.last_sync_fingerprint === fingerprint) {
      projectionResults.push({
        projection_id: projection.projection_id,
        issue_id: projection.issue_id,
        projection_kind: projection.projection_kind,
        sync_status: 'skipped_no_change',
        snapshot,
        comment: null,
      });
      continue;
    }

    const comment = await paperclipRequest(
      requestConfig,
      `/api/companies/${projection.company_id}/issues/${projection.issue_id}/comments`,
      {
        body: buildSyncCommentBody(snapshot),
      },
    ) as Record<string, unknown>;

    projection.last_sync_at = snapshot.synced_at;
    projection.last_sync_fingerprint = fingerprint;
    projection.sync_count += 1;
    projection.updated_at = snapshot.synced_at;

    projectionResults.push({
      projection_id: projection.projection_id,
      issue_id: projection.issue_id,
      projection_kind: projection.projection_kind,
      sync_status: 'synced',
      snapshot,
      comment,
    });
  }

  writePaperclipProjectionRegistryFile(registry);
  const finalSummary = buildPaperclipControlPlaneSummary(contracts);

  return {
    controlPlane: finalSummary,
    sync: {
      surface_id: 'opl_paperclip_projection_sync',
      selector: {
        issue_id: normalizeOptionalString(options.issueId),
        project_id: normalizeOptionalString(options.projectId),
        workspace_path: normalizeOptionalString(options.workspacePath),
        force: Boolean(options.force),
      },
      summary: {
        matched_projection_count: matchedProjections.length,
        synced_count: projectionResults.filter((entry) => entry.sync_status === 'synced').length,
        skipped_count: projectionResults.filter((entry) => entry.sync_status === 'skipped_no_change').length,
      },
      projections: projectionResults,
      notes: [
        'Sync writes OPL-managed audit snapshots back into downstream Paperclip issue comments.',
        'Skipped projections mean the derived OPL snapshot fingerprint did not change since the last sync.',
      ],
    },
  };
}
