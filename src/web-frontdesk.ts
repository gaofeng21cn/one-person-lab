import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { GatewayContractError } from './contracts.ts';
import {
  buildFrontDeskEnvironment,
  buildFrontDeskModules,
  runFrontDeskModuleAction,
  type FrontDeskModuleAction,
} from './frontdesk-installation.ts';
import {
  buildFrontDeskEndpoints,
  buildFrontDeskEntryUrl,
  stripFrontDeskBasePath,
} from './frontdesk-paths.ts';
import {
  buildFrontDeskDashboard,
  buildFrontDeskEntryGuide,
  buildFrontDeskReadiness,
  buildFrontDeskHealth,
  buildFrontDeskDomainWiring,
  buildFrontDeskManifest,
  buildProjectProgressBrief,
  buildFrontDeskStart,
  buildHostedPilotBundle,
  buildProjectsOverview,
  buildRuntimeStatus,
  buildWorkspaceStatus,
} from './management.ts';
import { buildDomainManifestCatalog } from './domain-manifest.ts';
import { launchDomainEntry, type DomainLaunchStrategy } from './domain-launch.ts';
import {
  readFrontDeskRuntimeModes,
  writeFrontDeskRuntimeModes,
  type FrontDeskAgentMode,
  type FrontDeskRuntimeModes,
} from './frontdesk-runtime-modes.ts';
import { buildHostedPilotPackage } from './hosted-pilot-package.ts';
import { readFrontDeskTaskStatus, submitFrontDeskAskTask } from './frontdesk-task-store.ts';
import {
  buildProductEntryHandoffEnvelope,
  runProductEntryAsk,
  runProductEntryLogs,
  runProductEntryResume,
  runProductEntrySessions,
  type ProductEntryCliInput,
} from './product-entry.ts';
import { buildSessionLedger } from './session-ledger.ts';
import {
  activateWorkspaceBinding,
  archiveWorkspaceBinding,
  bindWorkspace,
  buildWorkspaceCatalog,
} from './workspace-registry.ts';
import { buildFrontDeskWorkbenchHtml } from './frontdesk-workbench.ts';
import type { GatewayContracts } from './types.ts';

export interface WebFrontDeskOptions {
  host?: string;
  port?: number;
  workspacePath?: string;
  sessionsLimit?: number;
  basePath?: string;
}

type AskRequestBody = Partial<{
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

type FrontDeskSettingsRequestBody = Partial<{
  interactionMode: FrontDeskAgentMode;
  interaction_mode: FrontDeskAgentMode;
  executionMode: FrontDeskAgentMode;
  execution_mode: FrontDeskAgentMode;
}>;

type FrontDeskModuleActionRequestBody = Partial<{
  action: FrontDeskModuleAction | string;
  moduleId: string;
  module_id: string;
}>;

type ResumeRequestBody = Partial<{
  sessionId: string;
  session_id: string;
}>;

type LaunchDomainRequestBody = Partial<{
  projectId: string;
  project_id: string;
  workspacePath: string;
  workspace_path: string;
  strategy: DomainLaunchStrategy;
  dryRun: boolean;
  dry_run: boolean;
}>;

type WorkspaceRegistryBody = Partial<{
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

type HostedPackageRequestBody = Partial<{
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

type WebFrontDeskStartupPayload = {
  version: 'g2';
  contracts_context: {
    contracts_dir: string;
    contracts_root_source: string;
  };
  web_frontdesk: {
    entry_surface: 'opl_local_web_frontdesk_pilot';
    runtime_substrate: 'external_hermes_kernel';
    mode: 'local_web_frontdesk';
    local_shell_command: 'opl web';
    local_only: true;
    pilot_bundle_status: 'landed';
    listening: {
      host: string;
      port: number;
      base_url: string;
      entry_url: string;
      base_path: string;
    };
    api: {
      health: string;
      frontdesk_manifest: string;
      frontdesk_entry_guide: string;
      frontdesk_readiness: string;
      frontdesk_settings: string;
      frontdesk_environment: string;
      frontdesk_modules: string;
      frontdesk_module_action: string;
      project_progress: string;
      frontdesk_domain_wiring: string;
      domain_manifests: string;
      hosted_bundle: string;
      hosted_package: string;
      dashboard: string;
      projects: string;
      workspace_status: string;
      workspace_catalog: string;
      workspace_bind: string;
      workspace_activate: string;
      workspace_archive: string;
      runtime_status: string;
      session_ledger: string;
      ask: string;
      task_status: string;
      start: string;
      launch_domain: string;
      handoff_envelope: string;
      sessions: string;
      resume: string;
      logs: string;
    };
    frontdesk_settings: FrontDeskRuntimeModes;
    shell_bootstrap: {
      primary_surface: {
        surface_id: string;
        endpoint: string;
        summary?: unknown;
      };
      follow_on_surfaces: Array<{
        surface_id: string;
        endpoint: string;
        summary?: unknown;
      }>;
      operator_debug_surface: {
        surface_id: string;
        endpoint: string;
      };
    };
    defaults: {
      workspace_path: string;
      sessions_limit: number;
    };
    notes: string[];
  };
};

type WebFrontDeskContext = {
  contracts: GatewayContracts;
  host: string;
  port: number;
  baseUrl: string;
  entryUrl: string;
  basePath: string;
  workspacePath: string;
  sessionsLimit: number;
};

type RecommendedEntrySurface = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parsePositiveIntegerFromBody(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new GatewayContractError(
      'cli_usage_error',
      `${field} must be a positive integer.`,
      {
        field,
        value,
      },
    );
  }

  return parsed;
}

function getRecommendedEntryLocator(entry: RecommendedEntrySurface) {
  const locator = isRecord(entry.active_binding_locator) ? entry.active_binding_locator : {};

  return {
    status: normalizeOptionalString(entry.active_binding_locator_status),
    projectId: normalizeOptionalString(entry.project_id),
    project: normalizeOptionalString(entry.project),
    summary: normalizeOptionalString(entry.product_entry_status_summary),
    recommendedModeId: isRecord(entry.product_entry_start)
      ? normalizeOptionalString(entry.product_entry_start.recommended_mode_id)
      : undefined,
    url: normalizeOptionalString(locator.url),
    command: normalizeOptionalString(locator.command),
    manifestCommand: normalizeOptionalString(locator.manifest_command),
  };
}

function pickPreferredRecommendedEntry(recommendedEntrySurfaces: unknown) {
  if (!Array.isArray(recommendedEntrySurfaces)) {
    return null;
  }

  const entries = recommendedEntrySurfaces.filter((entry): entry is RecommendedEntrySurface => isRecord(entry));

  return (
    entries.find((entry) => Boolean(getRecommendedEntryLocator(entry).url))
    ?? entries.find((entry) => Boolean(getRecommendedEntryLocator(entry).command))
    ?? entries.find((entry) => getRecommendedEntryLocator(entry).status === 'ready')
    ?? entries[0]
    ?? null
  );
}

function pickPreferredLaunchStrategy(entry: RecommendedEntrySurface | null): DomainLaunchStrategy | null {
  if (!entry) {
    return null;
  }

  const locator = getRecommendedEntryLocator(entry);
  if (locator.url) {
    return 'open_url';
  }

  if (locator.command) {
    return 'spawn_command';
  }

  return null;
}

function normalizeSkills(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function parsePositiveIntegerOrDefault(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Expected a positive integer query parameter for the requested web front-desk surface.',
      {
        value,
      },
    );
  }

  return parsed;
}

function readRequestBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      resolve(body);
    });
    request.on('error', reject);
  });
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const rawBody = await readRequestBody(request);
  if (!rawBody.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!isRecord(parsed)) {
      throw new GatewayContractError(
        'cli_usage_error',
        'Web front-desk JSON requests must use an object body.',
      );
    }

    return parsed;
  } catch (error) {
    if (error instanceof GatewayContractError) {
      throw error;
    }

    throw new GatewayContractError(
      'cli_usage_error',
      'Web front-desk request body must be valid JSON.',
      {
        cause: error instanceof Error ? error.message : 'Unknown JSON parse failure.',
      },
    );
  }
}

function writeJson(response: ServerResponse<IncomingMessage>, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function writeHtml(response: ServerResponse<IncomingMessage>, html: string) {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(html);
}

function normalizeAskInput(body: AskRequestBody): ProductEntryCliInput {
  const goal = normalizeOptionalString(body.goal);
  if (!goal) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Web front-desk ask requests require a non-empty goal.',
      {
        required: ['goal'],
      },
    );
  }

  return {
    dryRun: Boolean(body.dryRun ?? body.dry_run),
    goal,
    intent: normalizeOptionalString(body.intent) ?? 'create',
    target: normalizeOptionalString(body.target) ?? 'deliverable',
    preferredFamily:
      normalizeOptionalString(body.preferredFamily) ?? normalizeOptionalString(body.preferred_family),
    requestKind:
      normalizeOptionalString(body.requestKind) ?? normalizeOptionalString(body.request_kind),
    model: normalizeOptionalString(body.model),
    provider: normalizeOptionalString(body.provider),
    workspacePath:
      normalizeOptionalString(body.workspacePath) ?? normalizeOptionalString(body.workspace_path),
    skills: normalizeSkills(body.skills),
  };
}

function normalizeFrontDeskSettingsInput(body: FrontDeskSettingsRequestBody) {
  const interactionMode =
    normalizeOptionalString(body.interactionMode) ?? normalizeOptionalString(body.interaction_mode);
  const executionMode =
    normalizeOptionalString(body.executionMode) ?? normalizeOptionalString(body.execution_mode);

  return {
    interaction_mode: interactionMode as FrontDeskAgentMode | undefined,
    execution_mode: executionMode as FrontDeskAgentMode | undefined,
  };
}

function normalizeResumeSessionId(body: ResumeRequestBody) {
  const sessionId = normalizeOptionalString(body.sessionId) ?? normalizeOptionalString(body.session_id);
  if (!sessionId) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Web front-desk resume requests require a non-empty session_id.',
      {
        required: ['session_id'],
      },
    );
  }

  return sessionId;
}

function normalizeLaunchDomainInput(body: LaunchDomainRequestBody) {
  const projectId = normalizeOptionalString(body.projectId) ?? normalizeOptionalString(body.project_id);
  if (!projectId) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Web front-desk domain launch requests require a non-empty project_id.',
      {
        required: ['project_id'],
      },
    );
  }

  const strategy = normalizeOptionalString(body.strategy);
  if (strategy && !['auto', 'open_url', 'spawn_command'].includes(strategy)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Web front-desk domain launch requests require strategy to be auto, open_url, or spawn_command.',
      {
        strategy,
      },
    );
  }

  return {
    projectId,
    workspacePath:
      normalizeOptionalString(body.workspacePath) ?? normalizeOptionalString(body.workspace_path),
    strategy: strategy as DomainLaunchStrategy | undefined,
    dryRun: Boolean(body.dryRun ?? body.dry_run),
  };
}

function normalizeWorkspaceRegistryInput(body: WorkspaceRegistryBody) {
  const projectId = normalizeOptionalString(body.projectId) ?? normalizeOptionalString(body.project_id);
  const workspacePath =
    normalizeOptionalString(body.workspacePath) ?? normalizeOptionalString(body.workspace_path);

  if (!projectId || !workspacePath) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Workspace registry requests require non-empty project_id and workspace_path.',
      {
        required: ['project_id', 'workspace_path'],
      },
    );
  }

  return {
    projectId,
    workspacePath,
    label: normalizeOptionalString(body.label),
    entryCommand:
      normalizeOptionalString(body.entryCommand) ?? normalizeOptionalString(body.entry_command),
    manifestCommand:
      normalizeOptionalString(body.manifestCommand) ?? normalizeOptionalString(body.manifest_command),
    entryUrl: normalizeOptionalString(body.entryUrl) ?? normalizeOptionalString(body.entry_url),
    workspaceRoot:
      normalizeOptionalString(body.workspaceRoot) ?? normalizeOptionalString(body.workspace_root),
    profileRef:
      normalizeOptionalString(body.profileRef) ?? normalizeOptionalString(body.profile_ref),
    inputPath:
      normalizeOptionalString(body.inputPath) ?? normalizeOptionalString(body.input_path),
  };
}

function normalizeHostedPackageInput(body: HostedPackageRequestBody) {
  const outputDir = normalizeOptionalString(body.outputDir) ?? normalizeOptionalString(body.output_dir);

  if (!outputDir) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Hosted package export requires a non-empty output_dir.',
      {
        required: ['output_dir'],
      },
    );
  }

  const portValue = body.port;
  let port: number | undefined;
  if (typeof portValue === 'number' && Number.isInteger(portValue) && portValue >= 0 && portValue <= 65535) {
    port = portValue;
  } else if (typeof portValue === 'string' && portValue.trim().length > 0) {
    const parsed = Number.parseInt(portValue, 10);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
      throw new GatewayContractError(
        'cli_usage_error',
        'Hosted package export requires port to be an integer between 0 and 65535.',
        {
          port: portValue,
        },
      );
    }
    port = parsed;
  }

  const sessionsLimitValue = body.sessionsLimit ?? body.sessions_limit;
  let sessionsLimit: number | undefined;
  if (
    typeof sessionsLimitValue === 'number'
    && Number.isInteger(sessionsLimitValue)
    && sessionsLimitValue > 0
  ) {
    sessionsLimit = sessionsLimitValue;
  } else if (typeof sessionsLimitValue === 'string' && sessionsLimitValue.trim().length > 0) {
    const parsed = Number.parseInt(sessionsLimitValue, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new GatewayContractError(
        'cli_usage_error',
        'Hosted package export requires sessions_limit to be a positive integer.',
        {
          sessions_limit: sessionsLimitValue,
        },
      );
    }
    sessionsLimit = parsed;
  }

  return {
    outputDir,
    publicOrigin: normalizeOptionalString(body.publicOrigin) ?? normalizeOptionalString(body.public_origin),
    host: normalizeOptionalString(body.host),
    port,
    basePath: normalizeOptionalString(body.basePath) ?? normalizeOptionalString(body.base_path),
    sessionsLimit,
  };
}

function parsePositiveIntegerOptional(value: string | null) {
  if (!value) {
    return undefined;
  }

  return parsePositiveIntegerOrDefault(value, 1);
}

function normalizeBaseUrlHost(host: string) {
  if (host === '0.0.0.0') {
    return '127.0.0.1';
  }

  if (host === '::') {
    return '[::1]';
  }

  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function buildStartupPayload(context: WebFrontDeskContext): WebFrontDeskStartupPayload {
  const manifest = buildFrontDeskManifest(context.contracts, { basePath: context.basePath });
  const endpoints = buildFrontDeskEndpoints(context.basePath);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: context.contracts.contractsDir,
      contracts_root_source: context.contracts.contractsRootSource,
    },
    web_frontdesk: {
      entry_surface: 'opl_local_web_frontdesk_pilot',
      runtime_substrate: 'external_hermes_kernel',
      mode: 'local_web_frontdesk',
      local_shell_command: 'opl web',
      local_only: true,
      pilot_bundle_status: 'landed',
      listening: {
        host: context.host,
        port: context.port,
        base_url: context.baseUrl,
        entry_url: context.entryUrl,
        base_path: context.basePath,
      },
      api: {
        health: endpoints.health,
        frontdesk_manifest: manifest.frontdesk_manifest.endpoints.manifest,
        frontdesk_entry_guide: endpoints.frontdesk_entry_guide,
        frontdesk_readiness: endpoints.frontdesk_readiness,
        frontdesk_settings: endpoints.frontdesk_settings,
        frontdesk_environment: endpoints.frontdesk_environment,
        frontdesk_modules: endpoints.frontdesk_modules,
        frontdesk_module_action: endpoints.frontdesk_module_action,
        project_progress: endpoints.project_progress,
        frontdesk_domain_wiring: endpoints.frontdesk_domain_wiring,
        domain_manifests: endpoints.domain_manifests,
        hosted_bundle: endpoints.hosted_bundle,
        hosted_package: endpoints.hosted_package,
        dashboard: endpoints.dashboard,
        projects: endpoints.projects,
        workspace_status: endpoints.workspace_status,
        workspace_catalog: endpoints.workspace_catalog,
        workspace_bind: endpoints.workspace_bind,
        workspace_activate: endpoints.workspace_activate,
        workspace_archive: endpoints.workspace_archive,
        runtime_status: endpoints.runtime_status,
        session_ledger: endpoints.session_ledger,
        ask: endpoints.ask,
        task_status: endpoints.task_status,
        start: endpoints.start,
        launch_domain: endpoints.launch_domain,
        handoff_envelope: endpoints.handoff_envelope,
        sessions: endpoints.sessions,
        resume: endpoints.resume,
        logs: endpoints.logs,
      },
      frontdesk_settings: readFrontDeskRuntimeModes(),
      shell_bootstrap: manifest.frontdesk_manifest.shell_bootstrap,
      defaults: {
        workspace_path: context.workspacePath,
        sessions_limit: context.sessionsLimit,
      },
      notes: [
        'This is a local web companion layered above the existing OPL CLI and desktop entry surfaces.',
        'Environment status and domain module management are exposed as API surfaces for the desktop shell settings experience.',
        'Managed hosted runtime ownership is still not landed.',
      ],
    },
  };
}

function normalizeFrontDeskModuleActionInput(body: FrontDeskModuleActionRequestBody) {
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  const moduleId =
    typeof body.module_id === 'string' && body.module_id.trim().length > 0
      ? body.module_id.trim()
      : typeof body.moduleId === 'string' && body.moduleId.trim().length > 0
        ? body.moduleId.trim()
        : '';

  if (!action || !['install', 'update', 'reinstall', 'remove'].includes(action)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk module action requires action=install|update|reinstall|remove.',
      {
        action: body.action ?? null,
      },
      2,
    );
  }

  if (!moduleId) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk module action requires module_id.',
      {
        module_id: body.module_id ?? body.moduleId ?? null,
      },
      2,
    );
  }

  return {
    action: action as FrontDeskModuleAction,
    moduleId,
  };
}

async function buildWebFrontDeskHtml(context: WebFrontDeskContext) {
  const bootstrap = buildStartupPayload(context);
  const dashboardPayload = buildFrontDeskDashboard(context.contracts, {
    workspacePath: context.workspacePath,
    sessionsLimit: context.sessionsLimit,
    basePath: context.basePath,
  });
  const progressPayload = await buildProjectProgressBrief(context.contracts, {
    workspacePath: context.workspacePath,
    sessionsLimit: context.sessionsLimit,
    basePath: context.basePath,
  });
  const environmentPayload = await buildFrontDeskEnvironment(context.contracts);
  const modulesPayload = buildFrontDeskModules();
  const settingsPayload = readFrontDeskRuntimeModes();
  const sessionsPayload = runProductEntrySessions({
    limit: context.sessionsLimit,
  });

  return buildFrontDeskWorkbenchHtml({
    bootstrap: bootstrap as unknown as Record<string, unknown>,
    state: {
      dashboard: dashboardPayload.dashboard,
      progress: progressPayload.project_progress,
      environment: environmentPayload.frontdesk_environment,
      modules: modulesPayload.frontdesk_modules,
      settings: settingsPayload,
      sessions: sessionsPayload.product_entry.sessions,
    },
  });
}

function writeApiError(response: ServerResponse<IncomingMessage>, error: unknown) {
  if (error instanceof GatewayContractError) {
    writeJson(response, error.exitCode === 2 ? 400 : 500, error.toJSON());
    return;
  }

  const unexpected = new GatewayContractError(
    'hermes_command_failed',
    error instanceof Error ? error.message : 'Unexpected web front-desk failure.',
  );
  writeJson(response, 500, unexpected.toJSON());
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  context: WebFrontDeskContext,
) {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', context.baseUrl);
  const routedPath = stripFrontDeskBasePath(url.pathname, context.basePath);

  try {
    if (routedPath === null) {
      writeJson(response, 404, {
        version: 'g2',
        error: {
          code: 'unknown_command',
          message: `Unknown web front-desk route: ${method} ${url.pathname}`,
          exit_code: 2,
        },
      });
      return;
    }

    if (method === 'GET' && routedPath === '/') {
      writeHtml(response, await buildWebFrontDeskHtml(context));
      return;
    }

    if (method === 'GET' && routedPath === '/api/health') {
      writeJson(response, 200, buildFrontDeskHealth(context.contracts, { basePath: context.basePath }));
      return;
    }

    if (method === 'GET' && routedPath === '/api/frontdesk/manifest') {
      writeJson(response, 200, buildFrontDeskManifest(context.contracts, { basePath: context.basePath }));
      return;
    }

    if (method === 'GET' && routedPath === '/api/frontdesk/entry-guide') {
      writeJson(response, 200, buildFrontDeskEntryGuide(context.contracts, { basePath: context.basePath }));
      return;
    }

    if (method === 'GET' && routedPath === '/api/frontdesk/readiness') {
      writeJson(
        response,
        200,
        await buildFrontDeskReadiness(context.contracts, {
          workspacePath: url.searchParams.get('path') ?? context.workspacePath,
          sessionsLimit: parsePositiveIntegerOrDefault(
            url.searchParams.get('sessions-limit') ?? url.searchParams.get('sessions_limit'),
            context.sessionsLimit,
          ),
          basePath: context.basePath,
        }),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/frontdesk/settings') {
      writeJson(response, 200, {
        version: 'g2',
        frontdesk_settings: readFrontDeskRuntimeModes(),
      });
      return;
    }

    if (method === 'POST' && routedPath === '/api/frontdesk/settings') {
      const body = (await readJsonBody(request)) as FrontDeskSettingsRequestBody;
      writeJson(response, 200, {
        version: 'g2',
        frontdesk_settings: writeFrontDeskRuntimeModes(normalizeFrontDeskSettingsInput(body)),
      });
      return;
    }

    if (method === 'GET' && routedPath === '/api/frontdesk/environment') {
      writeJson(response, 200, await buildFrontDeskEnvironment(context.contracts));
      return;
    }

    if (method === 'GET' && routedPath === '/api/frontdesk/modules') {
      writeJson(response, 200, buildFrontDeskModules());
      return;
    }

    if (method === 'POST' && routedPath === '/api/frontdesk/module/action') {
      const body = (await readJsonBody(request)) as FrontDeskModuleActionRequestBody;
      const normalized = normalizeFrontDeskModuleActionInput(body);
      writeJson(response, 200, runFrontDeskModuleAction(normalized.action, normalized.moduleId));
      return;
    }

    if (method === 'GET' && routedPath === '/api/project-progress') {
      writeJson(
        response,
        200,
        await buildProjectProgressBrief(context.contracts, {
          workspacePath: url.searchParams.get('path') ?? context.workspacePath,
          sessionsLimit: parsePositiveIntegerOrDefault(
            url.searchParams.get('sessions-limit') ?? url.searchParams.get('sessions_limit'),
            context.sessionsLimit,
          ),
          basePath: context.basePath,
        }),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/frontdesk/domain-wiring') {
      writeJson(response, 200, buildFrontDeskDomainWiring(context.contracts, { basePath: context.basePath }));
      return;
    }
    if (method === 'GET' && routedPath === '/api/frontdesk/hosted-bundle') {
      writeJson(
        response,
        200,
        buildHostedPilotBundle(context.contracts, {
          host: context.host,
          port: context.port,
          workspacePath: context.workspacePath,
          sessionsLimit: context.sessionsLimit,
          basePath: context.basePath,
        }),
      );
      return;
    }

    if (method === 'POST' && routedPath === '/api/frontdesk/hosted-package') {
      writeJson(
        response,
        200,
        buildHostedPilotPackage(context.contracts, {
          ...normalizeHostedPackageInput((await readJsonBody(request)) as HostedPackageRequestBody),
          host: context.host,
          port: context.port,
          basePath: context.basePath,
          sessionsLimit: context.sessionsLimit,
        }),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/projects') {
      writeJson(response, 200, buildProjectsOverview(context.contracts));
      return;
    }

    if (method === 'GET' && routedPath === '/api/status/workspace') {
      writeJson(
        response,
        200,
        buildWorkspaceStatus({
          workspacePath: url.searchParams.get('path') ?? context.workspacePath,
        }),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/workspace/list') {
      writeJson(response, 200, buildWorkspaceCatalog(context.contracts));
      return;
    }

    if (method === 'GET' && routedPath === '/api/domain/manifests') {
      writeJson(response, 200, buildDomainManifestCatalog(context.contracts));
      return;
    }

    if (method === 'POST' && routedPath === '/api/workspace/bind') {
      writeJson(response, 200, bindWorkspace(context.contracts, normalizeWorkspaceRegistryInput(await readJsonBody(request))));
      return;
    }

    if (method === 'POST' && routedPath === '/api/workspace/activate') {
      writeJson(
        response,
        200,
        activateWorkspaceBinding(context.contracts, normalizeWorkspaceRegistryInput(await readJsonBody(request))),
      );
      return;
    }

    if (method === 'POST' && routedPath === '/api/workspace/archive') {
      writeJson(
        response,
        200,
        archiveWorkspaceBinding(context.contracts, normalizeWorkspaceRegistryInput(await readJsonBody(request))),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/status/runtime') {
      writeJson(
        response,
        200,
        buildRuntimeStatus({
          sessionsLimit: parsePositiveIntegerOrDefault(url.searchParams.get('limit'), context.sessionsLimit),
        }),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/session/ledger') {
      writeJson(
        response,
        200,
        buildSessionLedger(parsePositiveIntegerOptional(url.searchParams.get('limit')) ?? context.sessionsLimit),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/status/dashboard') {
      writeJson(
        response,
        200,
        buildFrontDeskDashboard(context.contracts, {
          workspacePath: url.searchParams.get('path') ?? context.workspacePath,
          sessionsLimit: parsePositiveIntegerOrDefault(
            url.searchParams.get('sessions-limit') ?? url.searchParams.get('sessions_limit'),
            context.sessionsLimit,
          ),
          basePath: context.basePath,
        }),
      );
      return;
    }

    if (method === 'POST' && routedPath === '/api/ask') {
      const body = (await readJsonBody(request)) as AskRequestBody;
      const normalizedInput = {
        ...normalizeAskInput(body),
        executor: readFrontDeskRuntimeModes().interaction_mode,
      };
      writeJson(
        response,
        200,
        normalizedInput.dryRun
          ? runProductEntryAsk(normalizedInput, context.contracts)
          : submitFrontDeskAskTask(normalizedInput, context.contracts),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/task-status') {
      const taskId = normalizeOptionalString(url.searchParams.get('task_id'));
      if (!taskId) {
        throw new GatewayContractError(
          'cli_usage_error',
          'task-status requires a non-empty task_id query parameter.',
          {
            required: ['task_id'],
          },
          2,
        );
      }
      writeJson(
        response,
        200,
        readFrontDeskTaskStatus(taskId, parsePositiveIntegerOrDefault(url.searchParams.get('lines'), 20)),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/start') {
      writeJson(
        response,
        200,
        buildFrontDeskStart(context.contracts, {
          projectId: normalizeOptionalString(url.searchParams.get('project')) ?? '',
          modeId: normalizeOptionalString(url.searchParams.get('mode')),
        }),
      );
      return;
    }

    if (method === 'POST' && routedPath === '/api/domain/launch') {
      writeJson(
        response,
        200,
        await launchDomainEntry(
          context.contracts,
          normalizeLaunchDomainInput((await readJsonBody(request)) as LaunchDomainRequestBody),
        ),
      );
      return;
    }

    if (method === 'POST' && routedPath === '/api/contract/handoff-envelope') {
      const body = (await readJsonBody(request)) as AskRequestBody;
      writeJson(response, 200, buildProductEntryHandoffEnvelope(normalizeAskInput(body), context.contracts));
      return;
    }

    if (method === 'GET' && routedPath === '/api/session/list') {
      writeJson(
        response,
        200,
        runProductEntrySessions({
          limit: parsePositiveIntegerOptional(url.searchParams.get('limit')) ?? context.sessionsLimit,
          source: normalizeOptionalString(url.searchParams.get('source')),
        }),
      );
      return;
    }

    if (method === 'POST' && routedPath === '/api/session/resume') {
      const body = (await readJsonBody(request)) as ResumeRequestBody;
      writeJson(response, 200, runProductEntryResume(normalizeResumeSessionId(body)));
      return;
    }

    if (method === 'GET' && routedPath === '/api/session/logs') {
      writeJson(
        response,
        200,
        runProductEntryLogs({
          logName: normalizeOptionalString(url.searchParams.get('log_name')),
          lines: parsePositiveIntegerOptional(url.searchParams.get('lines')),
          since: normalizeOptionalString(url.searchParams.get('since')),
          level: normalizeOptionalString(url.searchParams.get('level')),
          component: normalizeOptionalString(url.searchParams.get('component')),
          sessionId:
            normalizeOptionalString(url.searchParams.get('session_id'))
            ?? normalizeOptionalString(url.searchParams.get('session')),
        }),
      );
      return;
    }

    writeJson(response, 404, {
      version: 'g2',
      error: {
        code: 'unknown_command',
        message: `Unknown web front-desk route: ${method} ${url.pathname}`,
        exit_code: 2,
      },
    });
  } catch (error) {
    writeApiError(response, error);
  }
}

export async function startWebFrontDeskServer(
  contracts: GatewayContracts,
  options: WebFrontDeskOptions = {},
) {
  const requestedHost = options.host ?? '127.0.0.1';
  const requestedPort = options.port ?? 8787;
  const workspacePath = options.workspacePath ?? process.cwd();
  const sessionsLimit = options.sessionsLimit ?? 5;
  const basePath = options.basePath ?? '';
  let actualPort = requestedPort;

  const listening = await new Promise<{ server: Server; port: number }>((resolve, reject) => {
    const server = createServer((request, response) => {
      const baseUrl = `http://${normalizeBaseUrlHost(requestedHost)}:${actualPort}`;
      const context: WebFrontDeskContext = {
        contracts,
        host: requestedHost,
        port: actualPort,
        baseUrl,
        entryUrl: buildFrontDeskEntryUrl(baseUrl, basePath),
        basePath,
        workspacePath,
        sessionsLimit,
      };

      void handleRequest(request, response, context);
    });

    server.once('error', reject);

    server.listen(requestedPort, requestedHost, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(
          new GatewayContractError(
            'hermes_command_failed',
            'Web front-desk server did not expose a usable TCP address.',
          ),
        );
        return;
      }

      actualPort = address.port;
      resolve({
        server,
        port: address.port,
      });
    });
  });

  const resolvedPort = listening.port;
  const baseUrl = `http://${normalizeBaseUrlHost(requestedHost)}:${resolvedPort}`;
  const context: WebFrontDeskContext = {
    contracts,
    host: requestedHost,
    port: resolvedPort,
    baseUrl,
    entryUrl: buildFrontDeskEntryUrl(baseUrl, basePath),
    basePath,
    workspacePath,
    sessionsLimit,
  };

  return {
    server: listening.server,
    startupPayload: buildStartupPayload(context),
  };
}

export function attachWebFrontDeskShutdown(server: Server) {
  let closing = false;

  const shutdown = () => {
    if (closing) {
      return;
    }
    closing = true;

    server.close(() => {
      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  return shutdown;
}
