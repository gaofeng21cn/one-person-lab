import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { GatewayContractError } from './contracts.ts';
import { ensureFrontDeskStateDir, resolveFrontDeskStatePaths } from './frontdesk-state.ts';
import { buildFrontDeskEndpoints } from './frontdesk-paths.ts';
import { buildProductEntryHandoffEnvelope, type ProductEntryCliInput } from './product-entry.ts';
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
  connection: PaperclipConnectionSummary;
  summary: {
    available_projects: string[];
    project_bindings_count: number;
    bound_projects: string[];
  };
  project_bindings: PaperclipProjectBinding[];
  notes: string[];
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
  const paths = resolveFrontDeskStatePaths();
  const connection = buildConnectionSummary(file);

  return {
    surface_id: 'opl_paperclip_control_plane_bridge',
    readiness: computeReadiness(connection),
    state_dir: paths.state_dir,
    config_file: paths.paperclip_control_plane_file,
    connection,
    summary: {
      available_projects: allowedProjects(contracts).map((project) => project.project_id),
      project_bindings_count: file.project_bindings.length,
      bound_projects: file.project_bindings.map((binding) => binding.project_id),
    },
    project_bindings: file.project_bindings,
    notes: [
      'Paperclip remains a downstream external control plane; OPL keeps routing truth, handoff truth, and top-level gateway ownership.',
      'Project bindings map admitted OPL project surfaces onto existing Paperclip companies/projects/workspaces so OPL can open tasks without inventing another control plane.',
      'Human gates are projected through the family-human-gate contract and request_board_approval approvals instead of bypassing domain runtime truth.',
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
  );

  return {
    controlPlane: summary,
    projectBinding: binding,
    handoffBundle,
    issue,
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
  );

  return {
    controlPlane: summary,
    handoffBundle,
    familyHumanGate,
    issue,
    approval,
  };
}
