import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';

import { GatewayContractError } from './contracts.ts';
import { inferFrontDeskWorkspaceLabel } from './frontdesk-librechat-identity.ts';
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
  readFrontDeskLibreChatTitleSyncConfig,
} from './frontdesk-librechat-title-sync.ts';
import { getFrontDeskLibreChatServiceStatus } from './frontdesk-librechat-service.ts';
import {
  readFrontDeskRuntimeModes,
  writeFrontDeskRuntimeModes,
  type FrontDeskAgentMode,
  type FrontDeskRuntimeModes,
} from './frontdesk-runtime-modes.ts';
import { buildHostedPilotPackage } from './hosted-pilot-package.ts';
import { buildLibreChatPilotPackage } from './librechat-pilot-package.ts';
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
  humanizeProgressCode,
  readStatusNarrationContract,
  statusNarrationLatestUpdate,
  statusNarrationNextStep,
  statusNarrationStageSummary,
  statusNarrationSummary,
} from './status-narration.ts';
import {
  activateWorkspaceBinding,
  archiveWorkspaceBinding,
  bindWorkspace,
  buildWorkspaceCatalog,
} from './workspace-registry.ts';
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

type ResumeRequestBody = Partial<{
  sessionId: string;
  session_id: string;
}>;

type TitleSyncRequestBody = Partial<{
  limit: number | string;
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
    hosted_status: 'librechat_pilot_landed';
    pilot_bundle_status: 'landed';
    librechat_pilot_package_status: 'landed';
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
      frontdesk_librechat_status: string;
      frontdesk_librechat_title_sync: string;
      project_progress: string;
      frontdesk_domain_wiring: string;
      domain_manifests: string;
      hosted_bundle: string;
      hosted_package: string;
      librechat_package: string;
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

const FRONTDESK_LIBRECHAT_TITLE_SYNC_COOLDOWN_MS = 15_000;

const frontDeskLibreChatTitleSyncState: {
  inFlight: boolean;
  lastStartedAt: number;
  lastCompletedAt: number;
  lastResult: Record<string, unknown> | null;
  lastError: string | null;
} = {
  inFlight: false,
  lastStartedAt: 0,
  lastCompletedAt: 0,
  lastResult: null,
  lastError: null,
};

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
      hosted_status: 'librechat_pilot_landed',
      pilot_bundle_status: 'landed',
      librechat_pilot_package_status: 'landed',
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
        frontdesk_librechat_status: endpoints.frontdesk_librechat_status,
        frontdesk_librechat_title_sync: endpoints.frontdesk_librechat_title_sync,
        project_progress: endpoints.project_progress,
        frontdesk_domain_wiring: endpoints.frontdesk_domain_wiring,
        domain_manifests: endpoints.domain_manifests,
        hosted_bundle: endpoints.hosted_bundle,
        hosted_package: endpoints.hosted_package,
        librechat_package: endpoints.librechat_package,
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
        'This is a local web front-desk pilot layered above the existing OPL CLI-first entry shell.',
        'The real LibreChat-first hosted shell pilot export is now landed alongside the hosted bundle and hosted package.',
        'Managed hosted runtime ownership is still not landed.',
      ],
    },
  };
}

async function queueFrontDeskLibreChatTitleSync(limit = 3) {
  const now = Date.now();
  if (frontDeskLibreChatTitleSyncState.inFlight) {
    return {
      status: 'in_progress',
      limit,
      last_completed_at: frontDeskLibreChatTitleSyncState.lastCompletedAt || null,
      last_result: frontDeskLibreChatTitleSyncState.lastResult,
      last_error: frontDeskLibreChatTitleSyncState.lastError,
    };
  }

  if (
    frontDeskLibreChatTitleSyncState.lastStartedAt > 0
    && now - frontDeskLibreChatTitleSyncState.lastStartedAt < FRONTDESK_LIBRECHAT_TITLE_SYNC_COOLDOWN_MS
  ) {
    return {
      status: 'cooldown',
      limit,
      last_completed_at: frontDeskLibreChatTitleSyncState.lastCompletedAt || null,
      last_result: frontDeskLibreChatTitleSyncState.lastResult,
      last_error: frontDeskLibreChatTitleSyncState.lastError,
    };
  }

  let config;
  try {
    config = readFrontDeskLibreChatTitleSyncConfig();
  } catch (error) {
    return {
      status: 'unavailable',
      limit,
      last_completed_at: frontDeskLibreChatTitleSyncState.lastCompletedAt || null,
      last_result: frontDeskLibreChatTitleSyncState.lastResult,
      last_error: error instanceof Error ? error.message : 'Unknown title sync availability failure.',
    };
  }

  frontDeskLibreChatTitleSyncState.inFlight = true;
  frontDeskLibreChatTitleSyncState.lastStartedAt = now;
  frontDeskLibreChatTitleSyncState.lastError = null;
  const currentModulePath = fileURLToPath(import.meta.url);
  const workerSuffix = currentModulePath.endsWith('.js') ? '.js' : '.ts';
  const workerPath = fileURLToPath(new URL(`./frontdesk-librechat-title-sync-worker${workerSuffix}`, import.meta.url));
  const child = spawn(
    process.execPath,
    [
      ...process.execArgv,
      workerPath,
      '--limit',
      String(limit),
    ],
    {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let stdout = '';
  let stderr = '';

  child.stdout?.on('data', (chunk: Buffer | string) => {
    stdout += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });

  child.once('error', (error) => {
    frontDeskLibreChatTitleSyncState.lastError = error.message;
    frontDeskLibreChatTitleSyncState.inFlight = false;
    frontDeskLibreChatTitleSyncState.lastCompletedAt = Date.now();
  });

  child.once('close', (code) => {
    if (code === 0) {
      try {
        frontDeskLibreChatTitleSyncState.lastResult = JSON.parse(stdout.trim()) as Record<string, unknown>;
        frontDeskLibreChatTitleSyncState.lastError = null;
      } catch (error) {
        frontDeskLibreChatTitleSyncState.lastError =
          error instanceof Error ? error.message : 'Failed to parse title sync worker output.';
      }
    } else {
      frontDeskLibreChatTitleSyncState.lastError =
        stderr.trim() || stdout.trim() || `Title sync worker exited with code ${code ?? 1}.`;
    }

    frontDeskLibreChatTitleSyncState.inFlight = false;
    frontDeskLibreChatTitleSyncState.lastCompletedAt = Date.now();
  });

  return {
    status: 'started',
    limit,
    last_completed_at: frontDeskLibreChatTitleSyncState.lastCompletedAt || null,
    last_result: frontDeskLibreChatTitleSyncState.lastResult,
    last_error: frontDeskLibreChatTitleSyncState.lastError,
  };
}

function serializeJsonForHtml(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function buildWebFrontDeskHtml(context: WebFrontDeskContext) {
  const bootstrap = buildStartupPayload(context);
  const libreChatStatusPayload = (await getFrontDeskLibreChatServiceStatus(context.contracts)).frontdesk_librechat;
  const frontdeskDashboard = buildFrontDeskDashboard(context.contracts, {
    workspacePath: context.workspacePath,
    sessionsLimit: context.sessionsLimit,
    basePath: context.basePath,
  }).dashboard;
  const progressPayload = await buildProjectProgressBrief(context.contracts, {
    workspacePath: context.workspacePath,
    sessionsLimit: context.sessionsLimit,
    basePath: context.basePath,
  });
  const progress = progressPayload.project_progress;
  const apiLinks = [
    {
      label: 'Project progress',
      href: bootstrap.web_frontdesk.api.project_progress,
    },
    {
      label: 'Frontdesk entry guide',
      href: bootstrap.web_frontdesk.api.frontdesk_entry_guide,
    },
    {
      label: 'Frontdesk readiness',
      href: bootstrap.web_frontdesk.api.frontdesk_readiness,
    },
    {
      label: 'Hosted shell status',
      href: bootstrap.web_frontdesk.api.frontdesk_librechat_status,
    },
    {
      label: 'Frontdesk domain wiring',
      href: bootstrap.web_frontdesk.api.frontdesk_domain_wiring,
    },
    {
      label: 'Workspace catalog',
      href: bootstrap.web_frontdesk.api.workspace_catalog,
    },
    {
      label: 'Runtime status',
      href: bootstrap.web_frontdesk.api.runtime_status,
    },
    {
      label: 'Dashboard',
      href: bootstrap.web_frontdesk.api.dashboard,
    },
  ]
    .map(
      (link) => `
          <li>
            <a href="${link.href}">${link.href}</a>
            <span>${link.label}</span>
          </li>`,
    )
    .join('');
  const bootstrapJson = serializeJsonForHtml(bootstrap);
  const currentProjectWorkspacePath = normalizeOptionalString(progress.current_project?.workspace_path);
  const currentProjectLabel = escapeHtml(inferFrontDeskWorkspaceLabel({
    workspacePath: currentProjectWorkspacePath ?? context.workspacePath,
    fallbackLabel: normalizeOptionalString(progress.current_project?.label) ?? 'Unbound workspace',
  }));
  const preferredRecommendedEntry = pickPreferredRecommendedEntry(
    frontdeskDashboard.front_desk.recommended_entry_surfaces,
  );
  const preferredRecommendedLocator = preferredRecommendedEntry
    ? getRecommendedEntryLocator(preferredRecommendedEntry)
    : null;
  const preferredEntryProjectLabel = escapeHtml(
    preferredRecommendedLocator?.projectId
    ?? preferredRecommendedLocator?.project
    ?? 'current domain project',
  );
  const preferredEntryLaunchStrategy = preferredRecommendedEntry
    ? pickPreferredLaunchStrategy(preferredRecommendedEntry)
    : null;
  const preferredEntryCallout = preferredRecommendedLocator
    ? `
        <div class="detail-grid" style="margin-top: 16px;">
          <div class="meta-card">
            <span class="meta-label">Bound direct entry</span>
            <div>${preferredEntryProjectLabel}</div>
            ${preferredRecommendedLocator.url ? `<div>${escapeHtml(preferredRecommendedLocator.url)}</div>` : ''}
            ${preferredRecommendedLocator.command ? `<div><code>${escapeHtml(preferredRecommendedLocator.command)}</code></div>` : ''}
          </div>
          <div class="meta-card">
            <span class="meta-label">Preferred launch</span>
            <div>${preferredEntryLaunchStrategy ? `<code>${preferredEntryLaunchStrategy}</code>` : 'Resolve after binding a launchable locator.'}</div>
            ${preferredRecommendedLocator.recommendedModeId ? `<div>Start mode: <code>${escapeHtml(preferredRecommendedLocator.recommendedModeId)}</code></div>` : ''}
            ${preferredRecommendedLocator.summary ? `<div>${escapeHtml(preferredRecommendedLocator.summary)}</div>` : ''}
          </div>
        </div>
        ${preferredRecommendedLocator.url
          ? `<a class="entry-link secondary-entry-link" href="${escapeHtml(preferredRecommendedLocator.url)}">Open ${preferredEntryProjectLabel} direct entry</a>`
          : ''}`
    : '';
  const progressSummary = escapeHtml(
    typeof progress.progress_summary === 'string'
      ? progress.progress_summary
      : 'No structured project summary yet.',
  );
  const nextFocus = escapeHtml(
    typeof progress.next_focus === 'string'
      ? progress.next_focus
      : 'Ask OPL Agent for the next study step.',
  );
  const hostedShellSummary = escapeHtml([
    libreChatStatusPayload.installed ? 'installed' : 'not installed',
    libreChatStatusPayload.running ? 'running' : 'stopped',
    typeof libreChatStatusPayload.identity?.sync_status === 'string'
      ? `identity ${libreChatStatusPayload.identity.sync_status}`
      : null,
  ].filter(Boolean).join(' · '));
  const hostedShellOrigin = escapeHtml(
    typeof libreChatStatusPayload.public_origin === 'string'
      ? libreChatStatusPayload.public_origin
      : '当前还没有记录 hosted shell public origin。',
  );
  const recentActivity = progress.recent_activity
    && typeof progress.recent_activity === 'object'
    && !Array.isArray(progress.recent_activity)
    ? progress.recent_activity as Record<string, unknown>
    : null;
  const recentActivityText = escapeHtml(recentActivity
    ? [
        typeof recentActivity.last_active === 'string' ? recentActivity.last_active : 'unknown time',
        typeof recentActivity.source === 'string' ? `source ${recentActivity.source}` : null,
        typeof recentActivity.preview === 'string' ? recentActivity.preview : null,
      ].filter(Boolean).join(' · ')
    : 'No recent runtime session has been reported yet.');
  const attentionItems = Array.isArray(progress.attention_items)
    ? progress.attention_items
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => escapeHtml(entry))
    : [];
  const inspectPaths = Array.isArray(progress.inspect_paths)
    ? progress.inspect_paths
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => escapeHtml(entry))
    : [];
  const currentStudy = progress.current_study
    && typeof progress.current_study === 'object'
    && !Array.isArray(progress.current_study)
    ? progress.current_study as Record<string, unknown>
    : null;
  const paperSnapshot = currentStudy?.paper_snapshot
    && typeof currentStudy.paper_snapshot === 'object'
    && !Array.isArray(currentStudy.paper_snapshot)
    ? currentStudy.paper_snapshot as Record<string, unknown>
    : null;
  const studyNarrationContract = readStatusNarrationContract(currentStudy?.status_narration_contract);
  const currentStudyId = escapeHtml(
    typeof currentStudy?.study_id === 'string'
      ? currentStudy.study_id
      : '未锁定具体论文',
  );
  const currentStudyTitle = escapeHtml(
    typeof currentStudy?.title === 'string'
      ? currentStudy.title
      : '当前还没有读到论文题目。',
  );
  const currentStudyStory = escapeHtml(
    typeof currentStudy?.story_summary === 'string'
      ? currentStudy.story_summary
      : '当前还只能确认到项目级，建议让 OPL Agent 先列出全部论文或检查哪篇在 live。',
  );
  const currentStudyClinicalQuestion = escapeHtml(
    typeof currentStudy?.clinical_question === 'string'
      ? currentStudy.clinical_question
      : '当前还没有抽出临床问题摘要。',
  );
  const currentStudyInnovation = escapeHtml(
    typeof currentStudy?.innovation_summary === 'string'
      ? currentStudy.innovation_summary
      : '当前还没有抽出论文主线/创新边界摘要。',
  );
  const currentStudyEffect = escapeHtml(
    typeof currentStudy?.current_effect_summary === 'string'
      ? currentStudy.current_effect_summary
      : typeof paperSnapshot?.current_effect_summary === 'string'
        ? String(paperSnapshot.current_effect_summary)
        : '当前还没有抽出可汇报的效果摘要。',
  );
  const currentStudyStage = escapeHtml(
    statusNarrationLatestUpdate(studyNarrationContract)
      ?? (typeof currentStudy?.current_stage_summary === 'string'
        ? currentStudy.current_stage_summary
        : null)
      ?? statusNarrationStageSummary(studyNarrationContract)
      ?? '当前阶段待确认。',
  );
  const currentStudyNextAction = escapeHtml(
    statusNarrationNextStep(studyNarrationContract)
      ?? (typeof currentStudy?.next_system_action === 'string'
        ? currentStudy.next_system_action
        : null)
      ?? '继续读取当前论文的详细进度。',
  );
  const currentStudyMonitoring = currentStudy?.monitoring
    && typeof currentStudy.monitoring === 'object'
    && !Array.isArray(currentStudy.monitoring)
    ? currentStudy.monitoring as Record<string, unknown>
    : null;
  const currentStudyRuntime = escapeHtml(
    [
      typeof currentStudyMonitoring?.health_status === 'string'
        ? `runtime ${currentStudyMonitoring.health_status}`
        : null,
      typeof currentStudyMonitoring?.active_run_id === 'string'
        ? `run ${currentStudyMonitoring.active_run_id}`
        : null,
    ].filter(Boolean).join(' · ') || '当前没有读到 live runtime 会话。',
  );
  const currentStudyMaterialized = escapeHtml(
    [
      typeof paperSnapshot?.main_figure_count === 'number' ? `${paperSnapshot.main_figure_count} 张主图` : null,
      typeof paperSnapshot?.supplementary_figure_count === 'number' && paperSnapshot.supplementary_figure_count > 0
        ? `${paperSnapshot.supplementary_figure_count} 张补充图`
        : null,
      typeof paperSnapshot?.main_table_count === 'number' ? `${paperSnapshot.main_table_count} 张主表` : null,
      typeof paperSnapshot?.supplementary_table_count === 'number' && paperSnapshot.supplementary_table_count > 0
        ? `${paperSnapshot.supplementary_table_count} 张附表`
        : null,
      typeof paperSnapshot?.reference_count === 'number' ? `${paperSnapshot.reference_count} 篇参考文献` : null,
      typeof paperSnapshot?.page_count === 'number' ? `${paperSnapshot.page_count} 页 PDF` : null,
    ].filter(Boolean).join('，') || '当前还没有抽出图表与参考文献计数。',
  );
  const progressFeedback = progress.progress_feedback
    && typeof progress.progress_feedback === 'object'
    && !Array.isArray(progress.progress_feedback)
    ? progress.progress_feedback as Record<string, unknown>
    : null;
  const progressFeedbackNarrationContract =
    readStatusNarrationContract(progressFeedback?.status_narration_contract) ?? studyNarrationContract;
  const progressFeedHeadline = escapeHtml(
    typeof progressFeedback?.headline === 'string'
      ? progressFeedback.headline
      : statusNarrationLatestUpdate(progressFeedbackNarrationContract)
        ?? (typeof currentStudy?.current_stage_summary === 'string'
          ? currentStudy.current_stage_summary
          : null)
        ?? statusNarrationStageSummary(progressFeedbackNarrationContract)
        ?? '当前还没有读到自然语言进度摘要。',
  );
  const progressFeedLatestUpdate = escapeHtml(
    typeof progressFeedback?.latest_update === 'string'
      ? progressFeedback.latest_update
      : recentActivity
        ? [
            typeof recentActivity.last_active === 'string' ? recentActivity.last_active : 'unknown time',
            typeof recentActivity.preview === 'string' ? recentActivity.preview : null,
          ].filter(Boolean).join(' · ')
        : '当前还没有读到新的进度更新时间。',
  );
  const progressFeedNextStep = escapeHtml(
    typeof progressFeedback?.next_step === 'string'
      ? progressFeedback.next_step
      : statusNarrationNextStep(progressFeedbackNarrationContract)
        ?? (typeof currentStudy?.next_system_action === 'string'
          ? currentStudy.next_system_action
          : null)
        ?? '继续读取当前论文的详细进度。',
  );
  const progressFeedStatusSummary = escapeHtml(
    typeof progressFeedback?.status_summary === 'string'
      ? progressFeedback.status_summary
      : statusNarrationSummary(progressFeedbackNarrationContract)
        ?? '当前还没有读到结构化状态。',
  );
  const progressFeedChips = [
    typeof progressFeedback?.current_status === 'string'
      ? `<span class="status-chip">${escapeHtml(humanizeProgressCode(progressFeedback.current_status) ?? progressFeedback.current_status)}</span>`
      : null,
    typeof progressFeedback?.runtime_status === 'string'
      ? `<span class="status-chip">${escapeHtml(humanizeProgressCode(progressFeedback.runtime_status) ?? progressFeedback.runtime_status)}</span>`
      : null,
  ].filter(Boolean).join('');
  const workspaceInbox = progress.workspace_inbox
    && typeof progress.workspace_inbox === 'object'
    && !Array.isArray(progress.workspace_inbox)
    ? progress.workspace_inbox as Record<string, unknown>
    : null;
  const workspaceInboxSummary = workspaceInbox?.summary
    && typeof workspaceInbox.summary === 'object'
    && !Array.isArray(workspaceInbox.summary)
    ? workspaceInbox.summary as Record<string, unknown>
    : null;
  const workspaceInboxSections = workspaceInbox?.sections
    && typeof workspaceInbox.sections === 'object'
    && !Array.isArray(workspaceInbox.sections)
    ? workspaceInbox.sections as Record<string, unknown>
    : null;
  const getInboxCards = (lane: string) => Array.isArray(workspaceInboxSections?.[lane])
    ? workspaceInboxSections[lane].filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  const inboxRunningCards = getInboxCards('running');
  const inboxWaitingCards = getInboxCards('waiting');
  const inboxReadyCards = getInboxCards('ready');
  const inboxDeliveredCards = getInboxCards('delivered');
  const workspaceInboxActiveTask = escapeHtml(
    typeof workspaceInboxSummary?.active_task_id === 'string'
      ? workspaceInboxSummary.active_task_id
      : '当前还没有锁定主任务。',
  );
  const workspaceInboxSummaryChips = [
    typeof workspaceInboxSummary?.known_task_count === 'number'
      ? `<span class="summary-chip">Known ${workspaceInboxSummary.known_task_count}</span>`
      : null,
    typeof workspaceInboxSummary?.running_count === 'number'
      ? `<span class="summary-chip">Running ${workspaceInboxSummary.running_count}</span>`
      : null,
    typeof workspaceInboxSummary?.waiting_count === 'number'
      ? `<span class="summary-chip">Waiting ${workspaceInboxSummary.waiting_count}</span>`
      : null,
    typeof workspaceInboxSummary?.ready_count === 'number'
      ? `<span class="summary-chip">Ready ${workspaceInboxSummary.ready_count}</span>`
      : null,
    typeof workspaceInboxSummary?.delivered_count === 'number'
      ? `<span class="summary-chip">Delivered ${workspaceInboxSummary.delivered_count}</span>`
      : null,
  ].filter(Boolean).join('');
  const renderInboxLane = (
    title: string,
    cards: Record<string, unknown>[],
    emptyMessage: string,
  ) => `
    <div class="inbox-section">
      <div class="inbox-section-header">
        <h3>${escapeHtml(title)}</h3>
        <span class="muted">${cards.length} task${cards.length === 1 ? '' : 's'}</span>
      </div>
      ${cards.length > 0
        ? `<div class="inbox-grid">${cards.map((entry) => {
          const taskTitle = escapeHtml(typeof entry.title === 'string' ? entry.title : 'Unnamed task');
          const taskId = escapeHtml(typeof entry.task_id === 'string' ? entry.task_id : 'task');
          const statusLabel = escapeHtml(typeof entry.status_label === 'string' ? entry.status_label : '状态待确认');
          const summary = escapeHtml(typeof entry.summary === 'string' ? entry.summary : '');
          const latestUpdate = escapeHtml(typeof entry.latest_update === 'string' ? entry.latest_update : '当前还没有新的进度更新时间。');
          const nextStep = escapeHtml(typeof entry.next_step === 'string' ? entry.next_step : '继续查看这个任务的详细进度。');
          const inspectPath = escapeHtml(typeof entry.inspect_path === 'string' ? entry.inspect_path : '当前还没有 inspect path。');
          const deliverableCount = typeof entry.deliverable_count === 'number' ? entry.deliverable_count : 0;
          return `<div class="inbox-card">`
            + `<div class="inbox-card-title-row"><span class="inbox-card-title">${taskTitle}</span><code>${taskId}</code></div>`
            + `<div class="muted">${statusLabel}</div>`
            + (summary ? `<div class="inbox-copy">${summary}</div>` : '')
            + `<div class="muted"><strong>Latest update:</strong> ${latestUpdate}</div>`
            + `<div class="muted"><strong>Next step:</strong> ${nextStep}</div>`
            + (deliverableCount > 0 ? `<div class="muted"><strong>Deliverables:</strong> ${deliverableCount}</div>` : '')
            + `<div class="file-path">${inspectPath}</div>`
            + `</div>`;
        }).join('')}</div>`
        : `<p class="muted" style="margin-top: 12px;">${escapeHtml(emptyMessage)}</p>`}
    </div>`;
  const workspaceFiles = progress.workspace_files
    && typeof progress.workspace_files === 'object'
    && !Array.isArray(progress.workspace_files)
    ? progress.workspace_files as Record<string, unknown>
    : null;
  const deliverableFiles = Array.isArray(workspaceFiles?.deliverable_files)
    ? workspaceFiles.deliverable_files.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  const supportingFiles = Array.isArray(workspaceFiles?.supporting_files)
    ? workspaceFiles.supporting_files.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  const renderFileList = (
    files: Record<string, unknown>[],
    emptyMessage: string,
  ) => files.length > 0
    ? `<ul class="file-list">${files.map((entry) => {
      const label = escapeHtml(typeof entry.label === 'string' ? entry.label : 'Unnamed file');
      const summary = escapeHtml(typeof entry.summary === 'string' ? entry.summary : '');
      const fileId = escapeHtml(typeof entry.file_id === 'string' ? entry.file_id : 'file');
      const filePath = escapeHtml(typeof entry.path === 'string' ? entry.path : 'unknown');
      return `<li><div class="file-label-row"><span class="file-label">${label}</span><code>${fileId}</code></div>`
        + `<div class="file-path">${filePath}</div>`
        + (summary ? `<div class="muted">${summary}</div>` : '')
        + `</li>`;
    }).join('')}</ul>`
    : `<p class="muted" style="margin-top: 12px;">${escapeHtml(emptyMessage)}</p>`;
  const deliverableFilesHtml = renderFileList(
    deliverableFiles,
    '当前还没有抽出明确 deliverable 文件。',
  );
  const supportingFilesHtml = renderFileList(
    supportingFiles,
    '当前还没有抽出 supporting files。',
  );
  const userOptions = Array.isArray(progress.user_options)
    ? progress.user_options
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => escapeHtml(entry))
    : [];
  const bindingGuideSummary = escapeHtml(
    [
      `当前 registry 里有 ${frontdeskDashboard.workspace_catalog.summary.total_projects_count} 个 project surface`,
      `${frontdeskDashboard.workspace_catalog.summary.active_projects_count} 个已激活 workspace binding`,
      `${frontdeskDashboard.workspace_catalog.summary.direct_entry_ready_projects_count} 个已具备 direct entry`,
      `${frontdeskDashboard.workspace_catalog.summary.manifest_ready_projects_count} 个已具备 manifest command`,
    ].join('；'),
  );
  const bindingGuideCards = frontdeskDashboard.workspace_catalog.projects
    .filter((project) => project.project_id !== 'opl')
    .map((project) => {
      const contract = project.binding_contract;
      const requiredFields = contract.required_locator_fields.length > 0
        ? contract.required_locator_fields.map((field) => `<code>${escapeHtml(field)}</code>`).join(', ')
        : 'none';
      const optionalFields = contract.optional_locator_fields.length > 0
        ? contract.optional_locator_fields.map((field) => `<code>${escapeHtml(field)}</code>`).join(', ')
        : 'none';
      const activeBindingSummary = project.active_binding
        ? `<div>${escapeHtml(project.active_binding.workspace_path)}</div>`
        : '<div>当前还没有 active binding。</div>';

      return `
          <div class="meta-card">
            <span class="meta-label">${escapeHtml(project.project)}</span>
            <div><strong>Locator kind:</strong> ${escapeHtml(contract.workspace_locator_surface_kind ?? 'none')}</div>
            <div><strong>Required:</strong> ${requiredFields}</div>
            <div><strong>Optional:</strong> ${optionalFields}</div>
            ${contract.derived_frontdesk_command_template
              ? `<div><strong>Frontdesk:</strong> <code>${escapeHtml(contract.derived_frontdesk_command_template)}</code></div>`
              : ''}
            ${contract.derived_manifest_command_template
              ? `<div><strong>Manifest:</strong> <code>${escapeHtml(contract.derived_manifest_command_template)}</code></div>`
              : ''}
            <div><strong>Quick bind:</strong> ${escapeHtml(contract.quick_bind_hint)}</div>
            <div><strong>Current active binding:</strong></div>
            ${activeBindingSummary}
          </div>`;
    })
    .join('');
  const latestLedgerSession = frontdeskDashboard.runtime_status.managed_session_ledger.sessions[0] ?? null;
  const latestLedgerResourceTotals = latestLedgerSession?.resource_totals ?? null;
  const sessionResourceSummary = escapeHtml(
    [
      `${frontdeskDashboard.runtime_status.managed_session_ledger.summary.entry_count} 条 ledger event`,
      `${frontdeskDashboard.runtime_status.managed_session_ledger.summary.session_aggregate_count} 个 session aggregate`,
      latestLedgerResourceTotals
        ? `latest sample ${latestLedgerResourceTotals.latest_sample_status}`
        : '当前还没有 session resource sample',
      frontdeskDashboard.runtime_status.managed_session_ledger.summary.peak_total_rss_kb !== null
        ? `peak RSS ${frontdeskDashboard.runtime_status.managed_session_ledger.summary.peak_total_rss_kb} KB`
        : 'peak RSS n/a',
      frontdeskDashboard.runtime_status.managed_session_ledger.summary.peak_total_cpu_percent !== null
        ? `peak CPU ${frontdeskDashboard.runtime_status.managed_session_ledger.summary.peak_total_cpu_percent}%`
        : 'peak CPU n/a',
    ].join('；'),
  );
  const latestLedgerSessionId = escapeHtml(latestLedgerSession?.session_id ?? 'n/a');
  const latestLedgerDomain = escapeHtml(latestLedgerSession?.domain_id ?? 'unassigned');
  const latestLedgerWorkspace = escapeHtml(latestLedgerSession?.workspace_locator?.absolute_path ?? 'n/a');
  const latestLedgerSampleStatus = escapeHtml(latestLedgerResourceTotals?.latest_sample_status ?? 'n/a');
  const latestLedgerLatestRss = escapeHtml(
    typeof latestLedgerResourceTotals?.latest_total_rss_kb === 'number'
      ? `${latestLedgerResourceTotals.latest_total_rss_kb} KB`
      : 'n/a',
  );
  const latestLedgerLatestCpu = escapeHtml(
    typeof latestLedgerResourceTotals?.latest_total_cpu_percent === 'number'
      ? `${latestLedgerResourceTotals.latest_total_cpu_percent}%`
      : 'n/a',
  );
  const latestLedgerPeakRss = escapeHtml(
    typeof latestLedgerResourceTotals?.peak_total_rss_kb === 'number'
      ? `${latestLedgerResourceTotals.peak_total_rss_kb} KB`
      : 'n/a',
  );
  const latestLedgerPeakCpu = escapeHtml(
    typeof latestLedgerResourceTotals?.peak_total_cpu_percent === 'number'
      ? `${latestLedgerResourceTotals.peak_total_cpu_percent}%`
      : 'n/a',
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OPL Workspace Home</title>
    <style>
      :root {
        --bg: #f6f2ea;
        --panel: rgba(255, 252, 246, 0.96);
        --panel-strong: #fffdf8;
        --line: rgba(29, 52, 48, 0.12);
        --ink: #19342d;
        --ink-soft: #5e736b;
        --accent: #1f6b5a;
        --accent-strong: #0f4e41;
        --shadow: 0 24px 48px rgba(25, 52, 45, 0.1);
        --radius-xl: 24px;
        --radius-md: 14px;
        --font-ui: "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
        --font-mono: "SFMono-Regular", "Menlo", "Consolas", monospace;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: var(--font-ui);
        color: var(--ink);
        background:
          radial-gradient(circle at top right, rgba(31, 107, 90, 0.14), transparent 26%),
          linear-gradient(180deg, #faf6ee 0%, var(--bg) 100%);
      }

      main {
        width: min(1180px, calc(100vw - 32px));
        margin: 24px auto 40px;
        display: grid;
        gap: 18px;
      }

      .panel {
        border: 1px solid var(--line);
        border-radius: var(--radius-xl);
        background: var(--panel);
        box-shadow: var(--shadow);
        padding: 24px;
      }

      h1,
      h2,
      h3,
      p,
      ul {
        margin: 0;
      }

      h1 {
        font-size: clamp(2rem, 4vw, 3rem);
        line-height: 1.05;
      }

      h2 {
        font-size: 1rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ink-soft);
        margin-bottom: 12px;
      }

      h3 {
        font-size: 1rem;
      }

      .lede,
      .status-copy,
      .muted {
        color: var(--ink-soft);
        line-height: 1.7;
      }

      .entry-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        margin-top: 16px;
      }

      .entry-link {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        padding: 0 16px;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--accent), var(--accent-strong));
        color: #f5f8f7;
        text-decoration: none;
        font-weight: 600;
      }

      .secondary-entry-link {
        background: rgba(31, 107, 90, 0.08);
        color: var(--accent-strong);
        border: 1px solid rgba(31, 107, 90, 0.22);
      }

      .workspace-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.45fr) minmax(280px, 0.9fr);
        gap: 18px;
      }

      .workspace-main,
      .workspace-rail {
        display: grid;
        gap: 18px;
      }

      .snapshot-grid,
      .detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .meta-card,
      .rail-card {
        padding: 16px;
        border-radius: var(--radius-md);
        background: rgba(31, 107, 90, 0.06);
        border: 1px solid rgba(31, 107, 90, 0.08);
      }

      .rail-card {
        background: var(--panel-strong);
      }

      .meta-label {
        display: block;
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--ink-soft);
        margin-bottom: 8px;
      }

      .status-list,
      .inspect-list,
      .api-list,
      .file-list {
        margin: 14px 0 0;
        padding-left: 18px;
        display: grid;
        gap: 10px;
        color: var(--ink-soft);
      }

      .file-list {
        list-style: none;
        padding-left: 0;
      }

      .file-list li {
        padding: 12px 14px;
        border: 1px solid rgba(31, 107, 90, 0.1);
        border-radius: 12px;
        background: rgba(31, 107, 90, 0.04);
      }

      .file-section + .file-section {
        margin-top: 18px;
      }

      .file-label-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .file-label {
        color: var(--ink);
        font-weight: 600;
      }

      .file-path,
      code,
      .api-list a {
        font-family: var(--font-mono);
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .file-path {
        margin-top: 8px;
        color: var(--ink-soft);
        font-size: 0.9rem;
      }

      .feed-list {
        margin-top: 14px;
        display: grid;
        gap: 12px;
      }

      .feed-item {
        padding: 14px;
        border-radius: 12px;
        border: 1px solid rgba(31, 107, 90, 0.1);
        background: rgba(31, 107, 90, 0.04);
      }

      .feed-kicker {
        display: block;
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ink-soft);
        margin-bottom: 8px;
      }

      .feed-copy {
        color: var(--ink);
        line-height: 1.7;
      }

      .status-chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      .status-chip {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 12px;
        border-radius: 999px;
        background: rgba(31, 107, 90, 0.1);
        color: var(--accent-strong);
        font-size: 0.88rem;
        font-weight: 600;
      }

      .summary-chip {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        padding: 0 12px;
        border-radius: 999px;
        background: rgba(25, 52, 45, 0.06);
        border: 1px solid rgba(25, 52, 45, 0.08);
        color: var(--ink);
        font-size: 0.9rem;
        font-weight: 600;
      }

      .summary-chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }

      .inbox-sections {
        display: grid;
        gap: 16px;
        margin-top: 16px;
      }

      .inbox-section {
        padding: 16px;
        border-radius: var(--radius-md);
        background: rgba(31, 107, 90, 0.04);
        border: 1px solid rgba(31, 107, 90, 0.08);
      }

      .inbox-section-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .inbox-grid {
        display: grid;
        gap: 12px;
        margin-top: 14px;
      }

      .inbox-card {
        padding: 14px;
        border-radius: 12px;
        border: 1px solid rgba(31, 107, 90, 0.08);
        background: var(--panel-strong);
      }

      .inbox-card + .inbox-card {
        margin-top: 12px;
      }

      .inbox-card-title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .inbox-card-title,
      .inbox-copy {
        color: var(--ink);
      }

      .inbox-copy {
        margin-top: 10px;
        line-height: 1.7;
      }

      .machine-detail {
        border: 1px solid var(--line);
        border-radius: var(--radius-md);
        padding: 14px 16px;
        background: rgba(31, 107, 90, 0.03);
      }

      .machine-detail + .machine-detail {
        margin-top: 12px;
      }

      .machine-detail summary {
        cursor: pointer;
        font-weight: 600;
        color: var(--accent-strong);
      }

      .machine-detail[open] summary {
        margin-bottom: 12px;
      }

      .api-list a {
        color: var(--accent-strong);
        text-decoration: none;
      }

      .api-list span {
        display: block;
        margin-top: 4px;
      }

      .json-view {
        margin-top: 12px;
        padding: 16px;
        border-radius: var(--radius-md);
        background: #15261f;
        color: #eef4f1;
        overflow: auto;
        white-space: pre-wrap;
        font: 0.84rem/1.6 var(--font-mono);
      }

      @media (max-width: 1040px) {
        .workspace-layout,
        .snapshot-grid,
        .detail-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        main {
          width: min(100vw - 18px, 100%);
          margin: 12px auto 24px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h2>Workspace Home</h2>
        <h1>OPL Workspace Home</h1>
        <p class="lede">
          OPL 以 workspace 组织任务、对话和最终交付文件。当前页先回答这三个问题：现在在做什么、下一步该做什么、哪些文件已经开始形成交付。
        </p>
        <div class="entry-actions">
          <a class="entry-link" href="/login">Open OPL Agent</a>
          ${preferredEntryCallout}
        </div>
      </section>

      <section class="panel">
        <div class="workspace-layout">
          <div class="workspace-main">
            <div>
              <h2>Workspace Home</h2>
              <div class="snapshot-grid">
                <div class="meta-card">
                  <span class="meta-label">Current workspace</span>
                  <div>${currentProjectLabel}</div>
                </div>
                <div class="meta-card">
                  <span class="meta-label">Workspace path</span>
                  <div>${bootstrap.web_frontdesk.defaults.workspace_path}</div>
                </div>
                <div class="meta-card">
                  <span class="meta-label">Current bound project</span>
                  <div>${escapeHtml(normalizeOptionalString(progress.current_project?.label) ?? 'Unbound workspace')}</div>
                </div>
                <div class="meta-card">
                  <span class="meta-label">Chat entry</span>
                  <div>/login</div>
                </div>
                <div class="meta-card">
                  <span class="meta-label">Latest runtime activity</span>
                  <div>${recentActivityText}</div>
                </div>
                <div class="meta-card">
                  <span class="meta-label">Hosted shell</span>
                  <div>${hostedShellSummary}</div>
                </div>
              </div>
            </div>

            <div>
              <h2>Current Task</h2>
              <p class="status-copy">${progressSummary}</p>
              <div class="detail-grid" style="margin-top: 16px;">
                <div class="meta-card">
                  <span class="meta-label">Next focus</span>
                  <div>${nextFocus}</div>
                </div>
                <div class="meta-card">
                  <span class="meta-label">Current study</span>
                  <div>${currentStudyId}</div>
                </div>
                <div class="meta-card">
                  <span class="meta-label">Current stage</span>
                  <div>${currentStudyStage}</div>
                </div>
                <div class="meta-card">
                  <span class="meta-label">Runtime</span>
                  <div>${currentStudyRuntime}</div>
                </div>
                <div class="meta-card">
                  <span class="meta-label">Paper title</span>
                  <div>${currentStudyTitle}</div>
                </div>
                <div class="meta-card">
                  <span class="meta-label">Materialized draft</span>
                  <div>${currentStudyMaterialized}</div>
                </div>
              </div>
              <p class="status-copy" style="margin-top: 16px;"><strong>论文主线：</strong>${currentStudyStory}</p>
              <p class="status-copy" style="margin-top: 12px;"><strong>临床问题：</strong>${currentStudyClinicalQuestion}</p>
              <p class="status-copy" style="margin-top: 12px;"><strong>写作边界：</strong>${currentStudyInnovation}</p>
              <p class="status-copy" style="margin-top: 12px;"><strong>当前结果：</strong>${currentStudyEffect}</p>
              <p class="muted" style="margin-top: 12px;">下一步建议：${currentStudyNextAction}</p>
              ${attentionItems.length > 0
                ? `<ul class="status-list">${attentionItems.map((item) => `<li>${item}</li>`).join('')}</ul>`
                : '<p class="muted" style="margin-top: 14px;">当前页面没有读到需要立刻处理的 blocker。</p>'}
              ${userOptions.length > 0
                ? `<div style="margin-top: 18px;"><span class="meta-label">Ask like this</span><ul class="inspect-list">${userOptions.map((item) => `<li>${item}</li>`).join('')}</ul></div>`
                : ''}
            </div>

            <div>
              <h2>Workspace Inbox</h2>
              <p class="muted">把当前 workspace 里能确认到的任务分成运行中、等待中、可继续和已交付四类。</p>
              ${workspaceInboxSummaryChips ? `<div class="summary-chip-row">${workspaceInboxSummaryChips}</div>` : ''}
              <p class="muted" style="margin-top: 12px;">当前主任务：${workspaceInboxActiveTask}</p>
              <div class="inbox-sections">
                ${renderInboxLane('Running', inboxRunningCards, '当前没有处于运行中的任务。')}
                ${renderInboxLane('Waiting', inboxWaitingCards, '当前没有等待中的任务。')}
                ${renderInboxLane('Ready', inboxReadyCards, '当前没有可直接继续的任务。')}
                ${renderInboxLane('Delivered', inboxDeliveredCards, '当前还没有形成明确交付的任务。')}
              </div>
            </div>
          </div>

          <aside class="workspace-rail">
            <div class="rail-card">
              <span class="meta-label">Progress Feed</span>
              <p class="muted">把后台长任务压缩成一组人话更新，用户一眼就能知道现在做到哪里了。</p>
              <div class="feed-list">
                <div class="feed-item">
                  <span class="feed-kicker">Now</span>
                  <div class="feed-copy">${progressFeedHeadline}</div>
                </div>
                <div class="feed-item">
                  <span class="feed-kicker">Current state</span>
                  <div class="feed-copy">${progressFeedStatusSummary}</div>
                  ${progressFeedChips ? `<div class="status-chip-row">${progressFeedChips}</div>` : ''}
                </div>
                <div class="feed-item">
                  <span class="feed-kicker">Latest update</span>
                  <div class="feed-copy">${progressFeedLatestUpdate}</div>
                </div>
                <div class="feed-item">
                  <span class="feed-kicker">Next step</span>
                  <div class="feed-copy">${progressFeedNextStep}</div>
                </div>
              </div>
            </div>

            <div class="rail-card">
              <span class="meta-label">Files & Deliverables</span>
              <p class="muted">当前 workspace 下最值得优先查看的交付文件和 supporting files 会固定在这里。</p>
              <div class="file-section">
                <span class="meta-label">Deliverables</span>
                ${deliverableFilesHtml}
              </div>
              <div class="file-section">
                <span class="meta-label">Supporting Files</span>
                ${supportingFilesHtml}
              </div>
            </div>

            <div class="rail-card">
              <span class="meta-label">Where to inspect</span>
              ${inspectPaths.length > 0
                ? `<ul class="inspect-list">${inspectPaths.map((item) => `<li>${item}</li>`).join('')}</ul>`
                : '<p class="muted" style="margin-top: 12px;">当前还没有推荐的 inspect path。</p>'}
            </div>

            <div class="rail-card">
              <span class="meta-label">Hosted shell origin</span>
              <div>${hostedShellOrigin}</div>
            </div>
          </aside>
        </div>
      </section>

      <section class="panel">
        <h2>Operator Surfaces</h2>
        <details class="machine-detail">
          <summary>Workspace binding guide</summary>
          <p class="status-copy">${bindingGuideSummary}</p>
          <p class="muted" style="margin-top: 12px;">
            这里冻结的是 OPL 如何从 workspace registry 诚实派生各业务仓 direct entry / manifest locator；不是把 OPL 写成 domain runtime owner。
          </p>
          <div class="detail-grid" style="margin-top: 16px;">
            ${bindingGuideCards}
          </div>
        </details>
        <details class="machine-detail">
          <summary>Session resource attribution</summary>
          <p class="status-copy">${sessionResourceSummary}</p>
          <p class="muted" style="margin-top: 12px;">
            这里只显示 OPL 管理 session 的事件时采样，用来做可读归因；不声称是 Hermes kernel 的全局计费真相。
          </p>
          <div class="detail-grid" style="margin-top: 16px;">
            <div class="meta-card">
              <span class="meta-label">Latest session aggregate</span>
              <div><strong>Session ID:</strong> ${latestLedgerSessionId}</div>
              <div><strong>Domain:</strong> ${latestLedgerDomain}</div>
              <div><strong>Workspace:</strong> ${latestLedgerWorkspace}</div>
              <div><strong>Latest sample:</strong> ${latestLedgerSampleStatus}</div>
            </div>
            <div class="meta-card">
              <span class="meta-label">Latest resource sample</span>
              <div><strong>Latest RSS:</strong> ${latestLedgerLatestRss}</div>
              <div><strong>Latest CPU:</strong> ${latestLedgerLatestCpu}</div>
              <div><strong>Peak RSS:</strong> ${latestLedgerPeakRss}</div>
              <div><strong>Peak CPU:</strong> ${latestLedgerPeakCpu}</div>
            </div>
          </div>
        </details>
        <details class="machine-detail">
          <summary>API surfaces</summary>
          <p class="muted">These links stay available for operators, automation, and machine consumers.</p>
          <ul class="api-list">
${apiLinks}
          </ul>
        </details>
        <details class="machine-detail">
          <summary>Bootstrap JSON</summary>
          <p class="muted">Kept collapsed by default so the main page stays readable for humans.</p>
          <script id="opl-bootstrap" type="application/json">${bootstrapJson}</script>
          <pre class="json-view">${bootstrapJson}</pre>
        </details>
      </section>
    </main>
  </body>
</html>`;
}

function buildLegacyWebFrontDeskHtml(context: WebFrontDeskContext) {
  const bootstrap = buildStartupPayload(context);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OPL Front Desk</title>
    <style>
      :root {
        --bg: #f3ecdf;
        --bg-deep: #18352e;
        --panel: rgba(252, 248, 240, 0.92);
        --panel-strong: #fffaf0;
        --line: rgba(24, 53, 46, 0.14);
        --ink: #172922;
        --ink-soft: #486056;
        --accent: #b35d2d;
        --accent-strong: #8f4720;
        --accent-cool: #1f5a4e;
        --ok: #2e6b58;
        --warn: #91511c;
        --radius-xl: 28px;
        --radius-lg: 20px;
        --radius-md: 14px;
        --shadow: 0 22px 60px rgba(23, 41, 34, 0.14);
        --font-ui: "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
        --font-display: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: var(--font-ui);
        color: var(--ink);
        background:
          radial-gradient(circle at top right, rgba(179, 93, 45, 0.18), transparent 32%),
          radial-gradient(circle at bottom left, rgba(31, 90, 78, 0.15), transparent 28%),
          linear-gradient(180deg, #f8f3ea 0%, var(--bg) 46%, #e7dfd2 100%);
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        background-image:
          linear-gradient(rgba(24, 53, 46, 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(24, 53, 46, 0.035) 1px, transparent 1px);
        background-size: 28px 28px;
        mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0));
      }

      .shell {
        width: min(1320px, calc(100vw - 32px));
        margin: 24px auto 40px;
      }

      .hero {
        position: relative;
        overflow: hidden;
        padding: 28px 28px 30px;
        border-radius: var(--radius-xl);
        background:
          linear-gradient(135deg, rgba(24, 53, 46, 0.96), rgba(31, 90, 78, 0.88) 42%, rgba(179, 93, 45, 0.9) 100%);
        color: #f8f3ea;
        box-shadow: var(--shadow);
      }

      .hero::after {
        content: "";
        position: absolute;
        inset: auto -15% -40% auto;
        width: 320px;
        height: 320px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 245, 232, 0.28), transparent 64%);
      }

      .eyebrow {
        font-size: 0.78rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        opacity: 0.78;
      }

      .hero h1 {
        margin: 12px 0 10px;
        font-family: var(--font-display);
        font-size: clamp(2rem, 4vw, 3.4rem);
        line-height: 1.02;
      }

      .hero p {
        max-width: 760px;
        margin: 0;
        color: rgba(248, 243, 234, 0.9);
        line-height: 1.7;
      }

      .hero-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 18px;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        padding: 10px 14px;
        border: 1px solid rgba(255, 248, 239, 0.22);
        border-radius: 999px;
        background: rgba(255, 248, 239, 0.08);
        font-size: 0.92rem;
      }

      .layout {
        display: grid;
        grid-template-columns: 1.25fr 0.95fr;
        gap: 18px;
        margin-top: 18px;
      }

      .stack {
        display: grid;
        gap: 18px;
      }

      .panel {
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        background: var(--panel);
        box-shadow: var(--shadow);
        overflow: hidden;
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 20px 22px 0;
      }

      .panel-title {
        margin: 0;
        font-family: var(--font-display);
        font-size: 1.5rem;
      }

      .panel-copy {
        margin: 8px 22px 0;
        color: var(--ink-soft);
        line-height: 1.6;
      }

      .panel-body {
        padding: 20px 22px 22px;
      }

      .field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      label {
        display: grid;
        gap: 8px;
        font-size: 0.95rem;
        color: var(--ink-soft);
      }

      textarea,
      input {
        width: 100%;
        border: 1px solid rgba(24, 53, 46, 0.16);
        border-radius: 14px;
        padding: 13px 14px;
        font: inherit;
        color: var(--ink);
        background: rgba(255, 255, 255, 0.82);
      }

      textarea {
        min-height: 136px;
        resize: vertical;
        line-height: 1.6;
      }

      textarea:focus,
      input:focus,
      button:focus {
        outline: 3px solid rgba(179, 93, 45, 0.22);
        outline-offset: 2px;
      }

      .button-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 18px;
      }

      button {
        min-height: 46px;
        border: none;
        border-radius: 999px;
        padding: 0 18px;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        transition: transform 180ms ease, opacity 180ms ease, box-shadow 180ms ease;
      }

      button:hover {
        transform: translateY(-1px);
      }

      button:disabled {
        cursor: wait;
        opacity: 0.6;
        transform: none;
      }

      .primary {
        color: #fff8f0;
        background: linear-gradient(135deg, var(--accent), var(--accent-strong));
        box-shadow: 0 16px 30px rgba(179, 93, 45, 0.26);
      }

      .secondary {
        color: var(--accent-cool);
        background: rgba(31, 90, 78, 0.1);
        border: 1px solid rgba(31, 90, 78, 0.18);
      }

      .ghost {
        color: var(--ink);
        background: rgba(24, 53, 46, 0.06);
        border: 1px solid rgba(24, 53, 46, 0.1);
      }

      .status-line {
        min-height: 24px;
        margin-top: 12px;
        color: var(--ink-soft);
      }

      .status-line[data-tone="warn"] {
        color: var(--warn);
      }

      .status-line[data-tone="ok"] {
        color: var(--ok);
      }

      .metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .metric {
        padding: 16px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid rgba(24, 53, 46, 0.08);
      }

      .metric-label {
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--ink-soft);
      }

      .metric-value {
        margin-top: 8px;
        font-family: var(--font-display);
        font-size: 1.8rem;
      }

      .card-list {
        display: grid;
        gap: 12px;
      }

      .card {
        padding: 16px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.76);
        border: 1px solid rgba(24, 53, 46, 0.08);
      }

      .card h3 {
        margin: 0 0 8px;
        font-size: 1rem;
      }

      .card p,
      .card li {
        color: var(--ink-soft);
        line-height: 1.6;
      }

      .badge-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(31, 90, 78, 0.1);
        color: var(--accent-cool);
        font-size: 0.84rem;
      }

      .json-view {
        margin: 0;
        min-height: 240px;
        max-height: 480px;
        padding: 16px;
        overflow: auto;
        border-radius: 16px;
        background: #16251f;
        color: #f3ede0;
        font: 0.86rem/1.65 "SFMono-Regular", "Menlo", "Consolas", monospace;
      }

      .split-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .footer-note {
        margin-top: 14px;
        color: var(--ink-soft);
        font-size: 0.92rem;
        line-height: 1.7;
      }

      @media (max-width: 1040px) {
        .layout {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        .shell {
          width: min(100vw - 18px, 100%);
          margin: 12px auto 24px;
        }

        .hero,
        .panel-body,
        .panel-header {
          padding-left: 16px;
          padding-right: 16px;
        }

        .panel-copy {
          margin-left: 16px;
          margin-right: 16px;
        }

        .field-grid,
        .metrics,
        .split-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="hero">
        <div class="eyebrow">One Person Lab</div>
        <h1>OPL Front Desk Control Room</h1>
        <p>
          Local web pilot for family routing, workspace inspection, runtime visibility, and quick ask.
          It gives OPL a directly usable front desk without pretending that hosted packaging is already done.
        </p>
        <div class="hero-strip">
          <div class="pill">Local web pilot landed</div>
          <div class="pill">Hosted packaging not landed</div>
          <div class="pill">Hermes stays the external kernel</div>
        </div>
      </header>

      <main class="layout">
        <div class="stack">
          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Start A Domain Project</h2>
            </div>
            <p class="panel-copy">
              Resolve the exact recommended direct entry mode OPL should open for one admitted domain project, instead of making the caller inspect raw manifests by hand.
            </p>
            <div class="panel-body">
              <form id="start-form">
                <div class="field-grid">
                  <label>
                    Project ID
                    <input id="start-project" name="start-project" placeholder="redcube" />
                  </label>
                  <label>
                    Mode ID
                    <input id="start-mode" name="start-mode" placeholder="Optional: open_frontdesk" />
                  </label>
                </div>
                <div class="button-row">
                  <button class="primary" type="submit" id="start-button">Resolve Start</button>
                </div>
              </form>
              <div class="status-line" id="start-status" aria-live="polite"></div>
              <div style="height: 12px"></div>
              <div class="split-grid">
                <div class="card">
                  <h3>Start Summary</h3>
                  <div id="start-summary">No routed start surface selected yet.</div>
                </div>
                <div class="card">
                  <h3>Selected Command</h3>
                  <div id="start-command">Choose a project and resolve its current start surface.</div>
                </div>
              </div>
              <div style="height: 12px"></div>
              <pre class="json-view" id="start-json">{}</pre>
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Launch Bound Domain Entry</h2>
            </div>
            <p class="panel-copy">
              Consume one already-bound direct-entry locator and launch it honestly. This stays at locator level and does not claim OPL owns the domain runtime.
            </p>
            <div class="panel-body">
              <form id="launch-form">
                <div class="field-grid">
                  <label>
                    Project ID
                    <input id="launch-project" name="launch-project" placeholder="redcube" />
                  </label>
                  <label>
                    Strategy
                    <input id="launch-strategy" name="launch-strategy" placeholder="auto | open_url | spawn_command" value="auto" />
                  </label>
                </div>
                <div class="button-row">
                  <button class="secondary" type="button" id="launch-preview-button">Preview Launch</button>
                  <button class="primary" type="submit" id="launch-button">Launch Domain</button>
                </div>
              </form>
              <div class="status-line" id="launch-status" aria-live="polite"></div>
              <div style="height: 12px"></div>
              <div class="split-grid">
                <div class="card">
                  <h3>Launch Summary</h3>
                  <div id="launch-summary">No bound domain locator launched yet.</div>
                </div>
                <div class="card">
                  <h3>Launch Action</h3>
                  <div id="launch-action">Preview or launch a bound domain entry to inspect the selected action.</div>
                </div>
              </div>
              <div style="height: 12px"></div>
              <pre class="json-view" id="launch-json">{}</pre>
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Quick Ask</h2>
            </div>
            <p class="panel-copy">
              先看 handoff preview，再提交后台 ask。当前交互模式会决定这条前台请求交给 Codex 还是 Hermes，并且结果会持续回写人话进度。
            </p>
            <div class="panel-body">
              <form id="ask-form">
                <label>
                  Request
                  <textarea id="goal" name="goal">Prepare a defense-ready slide deck for a thesis committee.</textarea>
                </label>
                <div class="field-grid">
                  <label>
                    Intent
                    <input id="intent" name="intent" value="create" />
                  </label>
                  <label>
                    Target
                    <input id="target" name="target" value="deliverable" />
                  </label>
                  <label>
                    Preferred Family
                    <input id="preferred-family" name="preferred-family" value="ppt_deck" />
                  </label>
                  <label>
                    Request Kind
                    <input id="request-kind" name="request-kind" placeholder="Optional" />
                  </label>
                </div>
                <div class="field-grid">
                  <label>
                    Interaction Mode
                    <select id="interaction-mode" name="interaction-mode">
                      <option value="codex">Codex</option>
                      <option value="hermes">Hermes-Agent</option>
                    </select>
                  </label>
                  <label>
                    Execution Mode
                    <select id="execution-mode" name="execution-mode">
                      <option value="codex">Codex</option>
                      <option value="hermes">Hermes-Agent</option>
                    </select>
                  </label>
                </div>
                <div class="button-row">
                  <button class="ghost" type="button" id="save-settings-button">Save Modes</button>
                </div>
                <div class="status-line" id="settings-status" aria-live="polite"></div>
                <div class="button-row">
                  <button class="secondary" type="button" id="preview-button">Preview Handoff</button>
                  <button class="primary" type="button" id="ask-button">Run Ask</button>
                </div>
                <div class="status-line" id="ask-status" aria-live="polite"></div>
              </form>
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Ask Result</h2>
            </div>
            <p class="panel-copy">
              这里会显示当前 ask 的路由结果、执行后端、最新会话标识，以及后台任务的人话进度。
            </p>
            <div class="panel-body">
              <div class="split-grid">
                <div class="card">
                  <h3>Result Summary</h3>
                  <div id="ask-summary">No ask has run yet.</div>
                </div>
                <div class="card">
                  <h3>Progress Notes</h3>
                  <div id="ask-boundary">Preview or run ask to inspect the routed boundary and live task narration.</div>
                </div>
              </div>
              <div style="height: 12px"></div>
              <pre class="json-view" id="ask-json">{}</pre>
            </div>
          </section>
        </div>

        <div class="stack">
          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Control Room</h2>
              <button class="ghost" type="button" id="refresh-button">Refresh</button>
            </div>
            <p class="panel-copy">
              This view merges project routing, workspace status, and Hermes runtime visibility into one family-level management surface.
            </p>
            <div class="panel-body">
              <div class="metrics">
                <div class="metric">
                  <div class="metric-label">Projects</div>
                  <div class="metric-value" id="metric-projects">-</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Sessions</div>
                  <div class="metric-value" id="metric-sessions">-</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Processes</div>
                  <div class="metric-value" id="metric-processes">-</div>
                </div>
              </div>
              <div class="footer-note" id="runtime-note">
                Loading dashboard...
              </div>
              <div style="height: 12px"></div>
              <div class="split-grid">
                <div class="card">
                  <h3>Hosted Runtime Readiness</h3>
                  <div id="hosted-runtime-readiness-summary">Loading hosted runtime readiness...</div>
                </div>
                <div class="card">
                  <h3>Domain Entry Parity</h3>
                  <div id="domain-entry-parity-summary">Loading domain entry parity...</div>
                </div>
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Hosted-Friendly Surface</h2>
            </div>
            <p class="panel-copy">
              These surfaces freeze the local shell contract that a future hosted shell can consume. They improve product-entry interoperability without pretending hosted packaging is already done.
            </p>
            <div class="panel-body">
              <div class="split-grid">
                <div class="card">
                  <h3>Health</h3>
                  <div id="health-summary">Loading health...</div>
                </div>
                <div class="card">
                  <h3>Manifest</h3>
                  <div id="manifest-summary">Loading manifest...</div>
                </div>
              </div>
              <div style="height: 12px"></div>
              <div class="card">
                <h3>Frontdesk Readiness</h3>
                <div id="frontdesk-readiness-summary">Loading frontdesk readiness...</div>
              </div>
              <div style="height: 12px"></div>
              <div class="card">
                <h3>Domain Wiring</h3>
                <div id="domain-wiring-summary">Loading domain wiring...</div>
              </div>
              <div style="height: 12px"></div>
              <div class="card">
                <h3>Hosted Pilot Bundle</h3>
                <div id="hosted-bundle-summary">Loading hosted pilot bundle...</div>
                <div style="height: 12px"></div>
                <pre class="json-view" id="hosted-bundle-json">{}</pre>
              </div>
              <div style="height: 12px"></div>
              <div class="card">
                <h3>Hosted Pilot Package Export</h3>
                <p class="panel-copy">
                  Export a self-hostable pilot package with runnable app snapshot, env template, service unit, and reverse-proxy files. This is packaging prep, not a claim that the actual hosted runtime is already landed.
                </p>
                <form id="hosted-package-form">
                  <div class="field-grid">
                    <label>
                      Output Directory
                      <input id="hosted-package-output" name="hosted-package-output" placeholder="/tmp/opl-frontdesk-package" />
                    </label>
                    <label>
                      Public Origin
                      <input id="hosted-package-public-origin" name="hosted-package-public-origin" placeholder="https://opl.example.com" />
                    </label>
                  </div>
                  <div class="button-row">
                    <button class="secondary" type="submit">Export Package</button>
                  </div>
                </form>
                <div class="status-line" id="hosted-package-status" aria-live="polite"></div>
                <div style="height: 12px"></div>
                <pre class="json-view" id="hosted-package-json">No hosted package export yet.</pre>
              </div>
              <div style="height: 12px"></div>
              <div class="card">
                <h3>LibreChat-first Hosted Shell Export</h3>
                <p class="panel-copy">
                  Export the actual hosted shell pilot package: LibreChat at the public root, OPL Front Desk at the configured base path, and same-origin reverse-proxy assets that wire them together honestly.
                </p>
                <form id="librechat-package-form">
                  <div class="field-grid">
                    <label>
                      Output Directory
                      <input id="librechat-package-output" name="librechat-package-output" placeholder="/tmp/opl-librechat-pilot" />
                    </label>
                    <label>
                      Public Origin
                      <input id="librechat-package-public-origin" name="librechat-package-public-origin" placeholder="https://opl.example.com" />
                    </label>
                  </div>
                  <div class="button-row">
                    <button class="secondary" type="submit">Export LibreChat Pilot</button>
                  </div>
                </form>
                <div class="status-line" id="librechat-package-status" aria-live="polite"></div>
                <div style="height: 12px"></div>
                <pre class="json-view" id="librechat-package-json">No LibreChat pilot export yet.</pre>
              </div>
              <div style="height: 12px"></div>
              <div class="split-grid">
                <div class="card">
                  <h3>Resume Session</h3>
                  <form id="resume-form">
                    <label>
                      Session ID
                      <input id="resume-session-id" name="resume-session-id" placeholder="sess_..." />
                    </label>
                    <div class="button-row">
                      <button class="secondary" type="submit">Resume</button>
                    </div>
                  </form>
                  <div class="status-line" id="resume-status" aria-live="polite"></div>
                  <pre class="json-view" id="resume-output">No resumed session yet.</pre>
                </div>
                <div class="card">
                  <h3>Gateway Logs</h3>
                  <form id="logs-form">
                    <div class="field-grid">
                      <label>
                        Log Name
                        <input id="log-name" name="log-name" value="gateway" />
                      </label>
                      <label>
                        Lines
                        <input id="log-lines" name="log-lines" value="20" />
                      </label>
                    </div>
                    <div class="button-row">
                      <button class="ghost" type="submit">Load Logs</button>
                    </div>
                  </form>
                  <div class="status-line" id="logs-status" aria-live="polite"></div>
                  <pre class="json-view" id="logs-output">Loading logs...</pre>
                </div>
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Workspace</h2>
            </div>
            <p class="panel-copy">
              Bind, activate, archive, and inspect project workspaces without leaving the front desk. Optional direct-entry locators let OPL hand off into a domain front desk honestly.
            </p>
            <div class="panel-body">
              <div class="card">
                <h3>Workspace Hub</h3>
                <p class="panel-copy">
                  Switch the active workspace for this control room, sync the form below, and keep the family front door focused on one bound project/workspace at a time.
                </p>
                <div class="field-grid">
                  <label>
                    Active Binding
                    <select id="workspace-binding-select">
                      <option value="">No bound workspace yet</option>
                    </select>
                  </label>
                </div>
                <div class="button-row">
                  <button class="primary" type="button" id="workspace-switch-button">Switch Active Workspace</button>
                  <button class="ghost" type="button" id="workspace-refresh-button">Reload Workspace Hub</button>
                </div>
                <div id="workspace-active-summary">No workspace bindings loaded yet.</div>
              </div>
              <div style="height: 12px"></div>
              <form id="workspace-form">
                <div class="field-grid">
                  <label>
                    Project ID
                    <input id="workspace-project" name="workspace-project" value="redcube" />
                  </label>
                  <label>
                    Workspace Path
                    <input id="workspace-path" name="workspace-path" />
                  </label>
                  <label>
                    Label
                    <input id="workspace-label" name="workspace-label" placeholder="Optional label" />
                  </label>
                  <label>
                    Direct Entry Command
                    <input id="workspace-entry-command" name="workspace-entry-command" placeholder="Optional command" />
                  </label>
                  <label style="grid-column: 1 / -1;">
                    Manifest Command
                    <input id="workspace-manifest-command" name="workspace-manifest-command" placeholder="Optional product-entry manifest command" />
                  </label>
                  <label style="grid-column: 1 / -1;">
                    Direct Entry URL
                    <input id="workspace-entry-url" name="workspace-entry-url" placeholder="Optional URL" />
                  </label>
                  <label>
                    Workspace Root
                    <input id="workspace-workspace-root" name="workspace-workspace-root" placeholder="Optional redcube workspace root" />
                  </label>
                  <label>
                    Profile
                    <input id="workspace-profile" name="workspace-profile" placeholder="Optional medautoscience profile path" />
                  </label>
                  <label>
                    Input
                    <input id="workspace-input" name="workspace-input" placeholder="Optional medautogrant workspace input" />
                  </label>
                </div>
                <div class="button-row">
                  <button class="secondary" type="submit" id="workspace-inspect-button">Inspect Workspace</button>
                  <button class="primary" type="button" id="workspace-bind-button">Bind / Upsert</button>
                  <button class="ghost" type="button" id="workspace-activate-button">Activate</button>
                  <button class="ghost" type="button" id="workspace-archive-button">Archive</button>
                </div>
              </form>
              <div class="status-line" id="workspace-status-line" aria-live="polite"></div>
              <div style="height: 12px"></div>
              <div class="card-list" id="workspace-card-list"></div>
              <div style="height: 12px"></div>
              <div class="card">
                <h3>Workspace Catalog</h3>
                <pre class="json-view" id="workspace-list-json">{}</pre>
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Projects And Sessions</h2>
            </div>
            <div class="panel-body">
              <div class="card-list" id="projects-list"></div>
              <div style="height: 12px"></div>
              <div class="split-grid">
                <div class="card">
                  <h3>Recent Sessions</h3>
                  <div id="sessions-list">Loading recent sessions...</div>
                </div>
                <div class="card">
                  <h3>Managed Session Ledger</h3>
                  <pre class="json-view" id="session-ledger-json">{}</pre>
                </div>
                <div class="card">
                  <h3>Domain Manifests</h3>
                  <pre class="json-view" id="domain-manifest-json">{}</pre>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>

    <script type="application/json" id="opl-bootstrap">${serializeJsonForHtml(bootstrap)}</script>
    <script type="module">
      const bootstrap = JSON.parse(document.getElementById('opl-bootstrap').textContent);
      const state = {
        workspacePath: bootstrap.web_frontdesk.defaults.workspace_path,
        sessionsLimit: bootstrap.web_frontdesk.defaults.sessions_limit,
        workspaceBindings: [],
        frontdeskSettings: bootstrap.web_frontdesk.frontdesk_settings,
        activeTaskPoller: null,
      };

      const askStatus = document.getElementById('ask-status');
      const settingsStatus = document.getElementById('settings-status');
      const askSummary = document.getElementById('ask-summary');
      const askBoundary = document.getElementById('ask-boundary');
      const askJson = document.getElementById('ask-json');
      const interactionModeInput = document.getElementById('interaction-mode');
      const executionModeInput = document.getElementById('execution-mode');
      const startProjectInput = document.getElementById('start-project');
      const startModeInput = document.getElementById('start-mode');
      const startStatus = document.getElementById('start-status');
      const startSummary = document.getElementById('start-summary');
      const startCommand = document.getElementById('start-command');
      const startJson = document.getElementById('start-json');
      const launchProjectInput = document.getElementById('launch-project');
      const launchStrategyInput = document.getElementById('launch-strategy');
      const launchStatus = document.getElementById('launch-status');
      const launchSummary = document.getElementById('launch-summary');
      const launchAction = document.getElementById('launch-action');
      const launchJson = document.getElementById('launch-json');
      const projectsList = document.getElementById('projects-list');
      const workspaceCardList = document.getElementById('workspace-card-list');
      const sessionsList = document.getElementById('sessions-list');
      const metricProjects = document.getElementById('metric-projects');
      const metricSessions = document.getElementById('metric-sessions');
      const metricProcesses = document.getElementById('metric-processes');
      const runtimeNote = document.getElementById('runtime-note');
      const hostedRuntimeReadinessSummary = document.getElementById('hosted-runtime-readiness-summary');
      const domainEntryParitySummary = document.getElementById('domain-entry-parity-summary');
      const healthSummary = document.getElementById('health-summary');
      const manifestSummary = document.getElementById('manifest-summary');
      const frontdeskReadinessSummary = document.getElementById('frontdesk-readiness-summary');
      const domainWiringSummary = document.getElementById('domain-wiring-summary');
      const hostedBundleSummary = document.getElementById('hosted-bundle-summary');
      const hostedBundleJson = document.getElementById('hosted-bundle-json');
      const hostedPackageOutputInput = document.getElementById('hosted-package-output');
      const hostedPackagePublicOriginInput = document.getElementById('hosted-package-public-origin');
      const hostedPackageStatus = document.getElementById('hosted-package-status');
      const hostedPackageJson = document.getElementById('hosted-package-json');
      const librechatPackageOutputInput = document.getElementById('librechat-package-output');
      const librechatPackagePublicOriginInput = document.getElementById('librechat-package-public-origin');
      const librechatPackageStatus = document.getElementById('librechat-package-status');
      const librechatPackageJson = document.getElementById('librechat-package-json');
      const resumeSessionInput = document.getElementById('resume-session-id');
      const resumeStatus = document.getElementById('resume-status');
      const resumeOutput = document.getElementById('resume-output');
      const logsStatus = document.getElementById('logs-status');
      const logsOutput = document.getElementById('logs-output');
      const logNameInput = document.getElementById('log-name');
      const logLinesInput = document.getElementById('log-lines');
      const workspaceProjectInput = document.getElementById('workspace-project');
      const workspacePathInput = document.getElementById('workspace-path');
      const workspaceLabelInput = document.getElementById('workspace-label');
      const workspaceEntryCommandInput = document.getElementById('workspace-entry-command');
      const workspaceManifestCommandInput = document.getElementById('workspace-manifest-command');
      const workspaceEntryUrlInput = document.getElementById('workspace-entry-url');
      const workspaceRootLocatorInput = document.getElementById('workspace-workspace-root');
      const workspaceProfileInput = document.getElementById('workspace-profile');
      const workspaceInputPathInput = document.getElementById('workspace-input');
      const workspaceBindingSelect = document.getElementById('workspace-binding-select');
      const workspaceActiveSummary = document.getElementById('workspace-active-summary');
      const workspaceStatusLine = document.getElementById('workspace-status-line');
      const workspaceCatalogJson = document.getElementById('workspace-list-json');
      const sessionLedgerJson = document.getElementById('session-ledger-json');
      const domainManifestJson = document.getElementById('domain-manifest-json');
      const previewButton = document.getElementById('preview-button');
      const askButton = document.getElementById('ask-button');
      const saveSettingsButton = document.getElementById('save-settings-button');
      const startButton = document.getElementById('start-button');
      const launchPreviewButton = document.getElementById('launch-preview-button');
      const launchButton = document.getElementById('launch-button');
      const refreshButton = document.getElementById('refresh-button');
      const workspaceBindButton = document.getElementById('workspace-bind-button');
      const workspaceActivateButton = document.getElementById('workspace-activate-button');
      const workspaceArchiveButton = document.getElementById('workspace-archive-button');
      const workspaceSwitchButton = document.getElementById('workspace-switch-button');
      const workspaceRefreshButton = document.getElementById('workspace-refresh-button');

      workspacePathInput.value = state.workspacePath;

      function setSettingsStatus(message, tone = 'muted') {
        settingsStatus.textContent = message;
        settingsStatus.dataset.tone = tone;
      }

      function setAskStatus(message, tone = 'muted') {
        askStatus.textContent = message;
        askStatus.dataset.tone = tone;
      }

      function renderFrontdeskSettings(settings) {
        state.frontdeskSettings = settings;
        interactionModeInput.value = settings.interaction_mode || 'codex';
        executionModeInput.value = settings.execution_mode || 'codex';
      }

      function setStartStatus(message, tone = 'muted') {
        startStatus.textContent = message;
        startStatus.dataset.tone = tone;
      }

      function setLaunchStatus(message, tone = 'muted') {
        launchStatus.textContent = message;
        launchStatus.dataset.tone = tone;
      }

      function setButtonBusy(isBusy) {
        previewButton.disabled = isBusy;
        askButton.disabled = isBusy;
        startButton.disabled = isBusy;
        launchPreviewButton.disabled = isBusy;
        launchButton.disabled = isBusy;
        refreshButton.disabled = isBusy;
      }

      function formatList(items) {
        if (!items || items.length === 0) {
          return '<p>No entries yet.</p>';
        }

        return '<div class="card-list">' + items.join('') + '</div>';
      }

      function pickPreferredRecommendedEntry(entries) {
        if (!Array.isArray(entries) || entries.length === 0) {
          return null;
        }

        return entries.find((entry) => entry?.active_binding_locator?.url)
          || entries.find((entry) => entry?.active_binding_locator?.command)
          || entries.find((entry) => entry?.active_binding_locator_status === 'ready')
          || entries[0]
          || null;
      }

      function pickRecommendedLaunchStrategy(entry) {
        if (entry?.active_binding_locator?.url) {
          return 'open_url';
        }

        if (entry?.active_binding_locator?.command) {
          return 'spawn_command';
        }

        return '';
      }

      function getWorkspaceBindingLabel(binding) {
        const project = binding.project || binding.project_id || 'unknown-project';
        const label = binding.label ? ' · ' + binding.label : '';
        return project + label + ' · ' + binding.workspace_path;
      }

      function getSelectedWorkspaceBinding() {
        const selectedBindingId = workspaceBindingSelect.value;
        return state.workspaceBindings.find((binding) => binding.binding_id === selectedBindingId) || null;
      }

      function syncWorkspaceForm(binding) {
        if (!binding) {
          return;
        }

        workspaceProjectInput.value = binding.project_id || '';
        workspacePathInput.value = binding.workspace_path || '';
        workspaceLabelInput.value = binding.label || '';
        workspaceEntryCommandInput.value = binding.direct_entry?.command || '';
        workspaceManifestCommandInput.value = binding.direct_entry?.manifest_command || '';
        workspaceEntryUrlInput.value = binding.direct_entry?.url || '';
      }

      function renderWorkspaceHubSummary(binding, summary) {
        if (!binding) {
          workspaceActiveSummary.innerHTML = '<p>No active workspace binding yet. Bind one below to make this control room project-aware.</p>';
          return;
        }

        workspaceActiveSummary.innerHTML = [
          '<p><strong>Project:</strong> ' + String(binding.project || binding.project_id || 'unknown') + '</p>',
          '<p><strong>Workspace:</strong> ' + String(binding.workspace_path || 'unknown') + '</p>',
          binding.direct_entry?.url
            ? '<p><strong>Direct Entry URL:</strong> ' + String(binding.direct_entry.url) + '</p>'
            : '',
          binding.direct_entry?.command
            ? '<p><strong>Direct Entry Command:</strong> <code>' + String(binding.direct_entry.command) + '</code></p>'
            : '',
          '<p><strong>Active Projects:</strong> ' + String(summary?.active_projects_count ?? 0) + '</p>',
          '<p><strong>Total Bindings:</strong> ' + String(summary?.total_bindings_count ?? 0) + '</p>',
        ].filter(Boolean).join('');
      }

      function renderProjects(projects, domainManifestProjects = []) {
        const manifestLookup = new Map(domainManifestProjects.map((entry) => [entry.project_id, entry]));
        projectsList.innerHTML = formatList(projects.map((project) => {
          const badges = [
            project.scope,
            project.gateway_surface || project.direct_entry_surface,
          ].filter(Boolean).map((entry) => '<span class="badge">' + entry + '</span>').join('');
          const activeBinding = project.active_binding;
          const bindingBlock = activeBinding
            ? [
                '<p><strong>Active Workspace:</strong> ' + activeBinding.workspace_path + '</p>',
                activeBinding.label ? '<p><strong>Binding Label:</strong> ' + activeBinding.label + '</p>' : '',
                activeBinding.direct_entry?.command
                  ? '<p><strong>Direct Entry Command:</strong> ' + activeBinding.direct_entry.command + '</p>'
                  : '',
                activeBinding.direct_entry?.manifest_command
                  ? '<p><strong>Manifest Command:</strong> ' + activeBinding.direct_entry.manifest_command + '</p>'
                  : '',
                activeBinding.direct_entry?.url
                  ? '<p><strong>Direct Entry URL:</strong> ' + activeBinding.direct_entry.url + '</p>'
                  : '',
              ].filter(Boolean).join('')
            : '<p><strong>Active Workspace:</strong> none</p>';
          const locatorBlock = activeBinding?.direct_entry?.workspace_locator
            ? [
                activeBinding.direct_entry.workspace_locator.surface_kind
                  ? '<p><strong>Workspace Locator:</strong> ' + activeBinding.direct_entry.workspace_locator.surface_kind + '</p>'
                  : '',
                activeBinding.direct_entry.workspace_locator.workspace_root
                  ? '<p><strong>Locator Workspace Root:</strong> ' + activeBinding.direct_entry.workspace_locator.workspace_root + '</p>'
                  : '',
                activeBinding.direct_entry.workspace_locator.profile_ref
                  ? '<p><strong>Locator Profile:</strong> ' + activeBinding.direct_entry.workspace_locator.profile_ref + '</p>'
                  : '',
                activeBinding.direct_entry.workspace_locator.input_path
                  ? '<p><strong>Locator Input:</strong> ' + activeBinding.direct_entry.workspace_locator.input_path + '</p>'
                  : '',
              ].filter(Boolean).join('')
            : '';
          const manifestEntry = manifestLookup.get(project.project_id);
          const manifestBlock = !manifestEntry
            ? ''
            : manifestEntry.status === 'resolved'
              ? [
                  '<p><strong>Manifest Status:</strong> resolved</p>',
                  manifestEntry.manifest?.repo_mainline
                    ? '<p><strong>Mainline Phase:</strong> '
                      + (
                        manifestEntry.manifest.repo_mainline.phase_id
                        || manifestEntry.manifest.repo_mainline.current_program_phase_id
                        || manifestEntry.manifest.repo_mainline.active_phase
                        || 'unknown'
                      )
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.repo_mainline
                    ? '<p><strong>Mainline Tranche:</strong> '
                      + (
                        manifestEntry.manifest.repo_mainline.tranche_id
                        || manifestEntry.manifest.repo_mainline.current_stage_id
                        || manifestEntry.manifest.repo_mainline.active_tranche
                        || 'unknown'
                      )
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.recommended_shell
                    ? '<p><strong>Recommended Shell:</strong> ' + manifestEntry.manifest.recommended_shell + '</p>'
                    : '',
                  manifestEntry.manifest?.manifest_version
                    ? '<p><strong>Manifest Version:</strong> '
                      + String(manifestEntry.manifest.manifest_version)
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.recommended_command
                    ? '<p><strong>Recommended Command:</strong> ' + manifestEntry.manifest.recommended_command + '</p>'
                    : '',
                  manifestEntry.manifest?.frontdesk_surface?.shell_key
                    ? '<p><strong>Frontdesk Shell:</strong> '
                      + manifestEntry.manifest.frontdesk_surface.shell_key
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.frontdesk_surface?.command
                    ? '<p><strong>Frontdesk Command:</strong> '
                      + manifestEntry.manifest.frontdesk_surface.command
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.frontdesk_surface?.summary
                    ? '<p><strong>Frontdesk Summary:</strong> '
                      + manifestEntry.manifest.frontdesk_surface.summary
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.operator_loop_surface?.shell_key
                    ? '<p><strong>Current Operator Loop:</strong> '
                      + manifestEntry.manifest.operator_loop_surface.shell_key
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.operator_loop_surface?.command
                    ? '<p><strong>Operator Loop Command:</strong> '
                      + manifestEntry.manifest.operator_loop_surface.command
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.operator_loop_surface?.summary
                    ? '<p><strong>Operator Loop Summary:</strong> '
                      + manifestEntry.manifest.operator_loop_surface.summary
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.operator_loop_surface?.continuation_command
                    ? '<p><strong>Operator Loop Continue:</strong> '
                      + manifestEntry.manifest.operator_loop_surface.continuation_command
                      + '</p>'
                    : '',
                  Object.entries(manifestEntry.manifest?.operator_loop_actions || {}).length > 0
                    ? '<div><strong>Operator Loop Actions:</strong><ul>'
                      + Object.entries(manifestEntry.manifest?.operator_loop_actions || {})
                        .map(([actionKey, actionValue]) => {
                          if (!actionValue || typeof actionValue !== 'object') {
                            return '';
                          }
                          const action = actionValue as {
                            command?: string;
                            summary?: string;
                          };
                          return '<li><code>' + actionKey + '</code>: '
                            + String(action.command || '')
                            + (action.summary ? ' - ' + action.summary : '')
                            + '</li>';
                        })
                        .filter(Boolean)
                        .join('')
                      + '</ul></div>'
                    : '',
                  manifestEntry.manifest?.product_entry_overview?.summary
                    ? '<p><strong>Overview Summary:</strong> '
                      + manifestEntry.manifest.product_entry_overview.summary
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.product_entry_overview?.progress_surface?.command
                    ? '<p><strong>Overview Progress Command:</strong> <code>'
                      + manifestEntry.manifest.product_entry_overview.progress_surface.command
                      + '</code></p>'
                    : '',
                  manifestEntry.manifest?.product_entry_overview?.resume_surface?.command
                    ? '<p><strong>Overview Resume Command:</strong> <code>'
                      + manifestEntry.manifest.product_entry_overview.resume_surface.command
                      + '</code></p>'
                    : '',
                  manifestEntry.manifest?.product_entry_preflight?.summary
                    ? '<p><strong>Preflight Summary:</strong> '
                      + manifestEntry.manifest.product_entry_preflight.summary
                      + '</p>'
                    : '',
                  typeof manifestEntry.manifest?.product_entry_preflight?.ready_to_try_now === 'boolean'
                    ? '<p><strong>Ready To Try Now:</strong> '
                      + String(manifestEntry.manifest.product_entry_preflight.ready_to_try_now)
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.product_entry_preflight?.recommended_check_command
                    ? '<p><strong>Preflight Check Command:</strong> <code>'
                      + manifestEntry.manifest.product_entry_preflight.recommended_check_command
                      + '</code></p>'
                    : '',
                  manifestEntry.manifest?.product_entry_preflight?.recommended_start_command
                    ? '<p><strong>Preflight Start Command:</strong> <code>'
                      + manifestEntry.manifest.product_entry_preflight.recommended_start_command
                      + '</code></p>'
                    : '',
                  manifestEntry.manifest?.product_entry_start?.summary
                    ? '<p><strong>Start Summary:</strong> '
                      + manifestEntry.manifest.product_entry_start.summary
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.product_entry_start?.recommended_mode_id
                    ? '<p><strong>Start Recommended Mode:</strong> <code>'
                      + manifestEntry.manifest.product_entry_start.recommended_mode_id
                      + '</code></p>'
                    : '',
                  manifestEntry.manifest?.product_entry_start?.resume_surface?.command
                    ? '<p><strong>Start Resume Command:</strong> <code>'
                      + manifestEntry.manifest.product_entry_start.resume_surface.command
                      + '</code></p>'
                    : '',
                  Array.isArray(manifestEntry.manifest?.product_entry_start?.human_gate_ids)
                    && manifestEntry.manifest.product_entry_start.human_gate_ids.length > 0
                    ? '<p><strong>Start Human Gates:</strong> '
                      + manifestEntry.manifest.product_entry_start.human_gate_ids
                        .map((gateId) => '<code>' + String(gateId) + '</code>')
                        .join(', ')
                      + '</p>'
                    : '',
                  Array.isArray(manifestEntry.manifest?.product_entry_start?.modes)
                    && manifestEntry.manifest.product_entry_start.modes.length > 0
                    ? '<div><strong>Start Modes:</strong><ul>'
                      + manifestEntry.manifest.product_entry_start.modes
                        .map((mode) => '<li><code>'
                          + String(mode.mode_id)
                          + '</code>: '
                          + String(mode.command || mode.surface_kind || '')
                          + (mode.summary ? ' - ' + String(mode.summary) : '')
                          + '</li>')
                        .join('')
                      + '</ul></div>'
                    : '',
                  Array.isArray(manifestEntry.manifest?.product_entry_preflight?.blocking_check_ids)
                    && manifestEntry.manifest.product_entry_preflight.blocking_check_ids.length > 0
                    ? '<p><strong>Blocking Preflight Checks:</strong> '
                      + manifestEntry.manifest.product_entry_preflight.blocking_check_ids
                        .map((checkId) => '<code>' + String(checkId) + '</code>')
                        .join(', ')
                      + '</p>'
                    : '',
                  Array.isArray(manifestEntry.manifest?.product_entry_overview?.human_gate_ids)
                    && manifestEntry.manifest.product_entry_overview.human_gate_ids.length > 0
                    ? '<p><strong>Overview Human Gates:</strong> '
                      + manifestEntry.manifest.product_entry_overview.human_gate_ids
                        .map((gateId) => '<code>' + String(gateId) + '</code>')
                        .join(', ')
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.product_entry_quickstart?.summary
                    ? '<p><strong>Quickstart Summary:</strong> '
                      + manifestEntry.manifest.product_entry_quickstart.summary
                      + '</p>'
                    : '',
                  Array.isArray(manifestEntry.manifest?.product_entry_quickstart?.steps)
                    && manifestEntry.manifest.product_entry_quickstart.steps.length > 0
                    ? '<div><strong>Quickstart Steps:</strong><ol>'
                      + manifestEntry.manifest.product_entry_quickstart.steps
                        .map((step) => {
                          if (!step || typeof step !== 'object') {
                            return '';
                          }
                          const stepId = step.step_id ? String(step.step_id) : 'unknown_step';
                          const title = step.title ? ' - ' + String(step.title) : '';
                          const command = step.command ? '<br /><code>' + String(step.command) + '</code>' : '';
                          const summary = step.summary ? '<br />' + String(step.summary) : '';
                          return '<li><code>' + stepId + '</code>' + title + command + summary + '</li>';
                        })
                        .filter(Boolean)
                        .join('')
                      + '</ol></div>'
                    : '',
                  manifestEntry.manifest?.product_entry_quickstart?.resume_contract?.surface_kind
                    ? '<p><strong>Quickstart Resume Surface:</strong> '
                      + manifestEntry.manifest.product_entry_quickstart.resume_contract.surface_kind
                      + '</p>'
                    : '',
                  Object.entries(manifestEntry.manifest?.product_entry_shell || {}).length > 0
                    ? '<div><strong>Product Entry Shells:</strong><ul>'
                      + Object.entries(manifestEntry.manifest?.product_entry_shell || {})
                        .map(([shellKey, shellValue]) => {
                          if (!shellValue || typeof shellValue !== 'object') {
                            return '';
                          }
                          const shell = shellValue as {
                            command?: string;
                            surface_kind?: string;
                            purpose?: string;
                          };
                          return '<li><code>' + shellKey + '</code>: '
                            + String(shell.command || '')
                            + (shell.surface_kind ? ' [' + shell.surface_kind + ']' : '')
                            + (shell.purpose ? ' - ' + shell.purpose : '')
                            + '</li>';
                        })
                        .filter(Boolean)
                        .join('')
                      + '</ul></div>'
                    : '',
                  Object.entries(manifestEntry.manifest?.shared_handoff || {}).length > 0
                    ? '<div><strong>Shared Handoff:</strong><ul>'
                      + Object.entries(manifestEntry.manifest?.shared_handoff || {})
                        .map(([handoffKey, handoffValue]) => {
                          if (!handoffValue || typeof handoffValue !== 'object') {
                            return '';
                          }
                          const handoff = handoffValue as {
                            command?: string;
                            entry_mode?: string;
                            surface_kind?: string;
                            target_domain_id?: string;
                          };
                          return '<li><code>' + handoffKey + '</code>: '
                            + String(handoff.command || handoff.surface_kind || '')
                            + (handoff.entry_mode ? ' (' + handoff.entry_mode + ')' : '')
                            + (handoff.target_domain_id ? ' -> ' + handoff.target_domain_id : '')
                            + '</li>';
                        })
                        .filter(Boolean)
                        .join('')
                      + '</ul></div>'
                    : '',
                  manifestEntry.manifest?.runtime_inventory?.summary
                    ? '<p><strong>Runtime Inventory:</strong> '
                      + manifestEntry.manifest.runtime_inventory.summary
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.runtime_inventory?.runtime_owner
                    ? '<p><strong>Runtime Owner:</strong> '
                      + manifestEntry.manifest.runtime_inventory.runtime_owner
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.runtime_inventory?.availability
                    ? '<p><strong>Runtime Availability:</strong> '
                      + manifestEntry.manifest.runtime_inventory.availability
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.runtime_inventory?.health_status
                    ? '<p><strong>Runtime Health:</strong> '
                      + manifestEntry.manifest.runtime_inventory.health_status
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.task_lifecycle?.summary
                    ? '<p><strong>Task Lifecycle:</strong> '
                      + manifestEntry.manifest.task_lifecycle.summary
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.task_lifecycle?.status
                    ? '<p><strong>Task Lifecycle Status:</strong> '
                      + manifestEntry.manifest.task_lifecycle.status
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.task_lifecycle?.progress_surface?.command
                    ? '<p><strong>Task Progress Command:</strong> <code>'
                      + manifestEntry.manifest.task_lifecycle.progress_surface.command
                      + '</code></p>'
                    : '',
                  manifestEntry.manifest?.task_lifecycle?.resume_surface?.surface_kind
                    ? '<p><strong>Task Resume Surface:</strong> '
                      + manifestEntry.manifest.task_lifecycle.resume_surface.surface_kind
                      + '</p>'
                    : '',
                  Array.isArray(manifestEntry.manifest?.task_lifecycle?.human_gate_ids)
                    && manifestEntry.manifest.task_lifecycle.human_gate_ids.length > 0
                    ? '<p><strong>Task Human Gates:</strong> '
                      + manifestEntry.manifest.task_lifecycle.human_gate_ids
                        .map((gateId) => '<code>' + String(gateId) + '</code>')
                        .join(', ')
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.skill_catalog?.summary
                    ? '<p><strong>Skill Catalog:</strong> '
                      + manifestEntry.manifest.skill_catalog.summary
                      + '</p>'
                    : '',
                  Array.isArray(manifestEntry.manifest?.skill_catalog?.skills)
                    ? '<p><strong>Skill Count:</strong> '
                      + String(manifestEntry.manifest.skill_catalog.skills.length)
                      + '</p>'
                    : '',
                  Array.isArray(manifestEntry.manifest?.skill_catalog?.supported_commands)
                    && manifestEntry.manifest.skill_catalog.supported_commands.length > 0
                    ? '<p><strong>Skill Commands:</strong> '
                      + manifestEntry.manifest.skill_catalog.supported_commands
                        .map((command) => '<code>' + String(command) + '</code>')
                        .join(', ')
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.automation?.summary
                    ? '<p><strong>Automation Catalog:</strong> '
                      + manifestEntry.manifest.automation.summary
                      + '</p>'
                    : '',
                  Array.isArray(manifestEntry.manifest?.automation?.automations)
                    ? '<p><strong>Automation Count:</strong> '
                      + String(manifestEntry.manifest.automation.automations.length)
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.automation?.readiness_summary
                    ? '<p><strong>Automation Readiness:</strong> '
                      + manifestEntry.manifest.automation.readiness_summary
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.family_orchestration?.action_graph_ref?.ref
                    ? '<p><strong>Action Graph:</strong> '
                      + manifestEntry.manifest.family_orchestration.action_graph_ref.ref
                      + '</p>'
                    : '',
                  Array.isArray(manifestEntry.manifest?.family_orchestration?.action_graph?.nodes)
                    ? '<p><strong>Action Graph Nodes:</strong> '
                      + String(manifestEntry.manifest.family_orchestration.action_graph.nodes.length)
                      + '</p>'
                    : '',
                  Array.isArray(manifestEntry.manifest?.family_orchestration?.action_graph?.edges)
                    ? '<p><strong>Action Graph Edges:</strong> '
                      + String(manifestEntry.manifest.family_orchestration.action_graph.edges.length)
                      + '</p>'
                    : '',
                  Array.isArray(manifestEntry.manifest?.family_orchestration?.human_gates)
                    && manifestEntry.manifest.family_orchestration.human_gates.length > 0
                    ? '<div><strong>Human Gates:</strong><ul>'
                      + manifestEntry.manifest.family_orchestration.human_gates
                        .map((gate) => {
                          if (!gate || typeof gate !== 'object') {
                            return '';
                          }
                          const gateId = gate.gate_id ? String(gate.gate_id) : 'unknown_gate';
                          const title = gate.title ? ' - ' + String(gate.title) : '';
                          const status = gate.status ? ' (' + String(gate.status) + ')' : '';
                          return '<li><code>' + gateId + '</code>' + title + status + '</li>';
                        })
                        .filter(Boolean)
                        .join('')
                      + '</ul></div>'
                    : '',
                  manifestEntry.manifest?.family_orchestration?.resume_contract?.surface_kind
                    ? '<p><strong>Resume Contract:</strong> '
                      + manifestEntry.manifest.family_orchestration.resume_contract.surface_kind
                      + ' via '
                      + String(
                        manifestEntry.manifest.family_orchestration.resume_contract.session_locator_field || 'unknown',
                      )
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.product_entry_status?.summary
                    ? '<p><strong>Entry Status:</strong> ' + manifestEntry.manifest.product_entry_status.summary + '</p>'
                    : '',
                  manifestEntry.manifest?.product_entry_readiness?.summary
                    ? '<p><strong>Entry Readiness:</strong> '
                      + manifestEntry.manifest.product_entry_readiness.summary
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.product_entry_readiness?.verdict
                    ? '<p><strong>Readiness Verdict:</strong> '
                      + manifestEntry.manifest.product_entry_readiness.verdict
                      + '</p>'
                    : '',
                  typeof manifestEntry.manifest?.product_entry_readiness?.usable_now === 'boolean'
                    ? '<p><strong>Usable Now:</strong> '
                      + String(manifestEntry.manifest.product_entry_readiness.usable_now)
                      + '</p>'
                    : '',
                  typeof manifestEntry.manifest?.product_entry_readiness?.good_to_use_now === 'boolean'
                    ? '<p><strong>Good To Use Now:</strong> '
                      + String(manifestEntry.manifest.product_entry_readiness.good_to_use_now)
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.product_entry_readiness?.recommended_start_command
                    ? '<p><strong>Readiness Start Command:</strong> <code>'
                      + manifestEntry.manifest.product_entry_readiness.recommended_start_command
                      + '</code></p>'
                    : '',
                  manifestEntry.manifest?.product_entry_readiness?.recommended_loop_command
                    ? '<p><strong>Readiness Loop Command:</strong> <code>'
                      + manifestEntry.manifest.product_entry_readiness.recommended_loop_command
                      + '</code></p>'
                    : '',
                  Array.isArray(manifestEntry.manifest?.product_entry_readiness?.blocking_gaps)
                    && manifestEntry.manifest.product_entry_readiness.blocking_gaps.length > 0
                    ? '<div><strong>Readiness Blocking Gaps:</strong><ul>'
                      + manifestEntry.manifest.product_entry_readiness.blocking_gaps
                        .map((gap) => '<li>' + String(gap) + '</li>')
                        .join('')
                      + '</ul></div>'
                    : '',
                  typeof manifestEntry.manifest?.product_entry_status?.remaining_gaps_count === 'number'
                    ? '<p><strong>Remaining Gaps:</strong> '
                      + String(manifestEntry.manifest.product_entry_status.remaining_gaps_count)
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.family_orchestration?.resume_contract?.surface_kind
                    ? '<p><strong>Family Resume Surface:</strong> '
                      + manifestEntry.manifest.family_orchestration.resume_contract.surface_kind
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.family_orchestration?.checkpoint_lineage_surface?.ref
                    ? '<p><strong>Family Checkpoint Lineage:</strong> '
                      + manifestEntry.manifest.family_orchestration.checkpoint_lineage_surface.ref
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.family_orchestration?.event_envelope_surface?.ref
                    ? '<p><strong>Family Event Envelope:</strong> '
                      + manifestEntry.manifest.family_orchestration.event_envelope_surface.ref
                      + '</p>'
                    : '',
                  Object.entries(manifestEntry.manifest?.family_orchestration?.human_gates || {}).length > 0
                    ? '<div><strong>Family Human Gates:</strong><ul>'
                      + Object.values(manifestEntry.manifest?.family_orchestration?.human_gates || {})
                        .map((gateValue) => {
                          if (!gateValue || typeof gateValue !== 'object') {
                            return '';
                          }
                          const gate = gateValue as {
                            gate_id?: string;
                            title?: string;
                            status?: string;
                          };
                          return '<li><code>' + String(gate.gate_id || 'unknown_gate') + '</code>'
                            + (gate.title ? ': ' + gate.title : '')
                            + (gate.status ? ' - ' + gate.status : '')
                            + '</li>';
                        })
                        .filter(Boolean)
                        .join('')
                      + '</ul></div>'
                    : '',
                ].filter(Boolean).join('')
              : '<p><strong>Manifest Status:</strong> ' + manifestEntry.status + '</p>';

          return '<div class="card">'
            + '<h3>' + project.project + '</h3>'
            + '<p><strong>Project ID:</strong> ' + project.project_id + '</p>'
            + '<p><strong>Owned Workstreams:</strong> ' + (project.owned_workstreams || []).join(', ') + '</p>'
            + bindingBlock
            + locatorBlock
            + manifestBlock
            + '<div class="badge-row">' + badges + '</div>'
            + '</div>';
        }));
      }

      function renderWorkspace(workspace) {
        const git = workspace.git || {};
        workspaceCardList.innerHTML = formatList([
          '<div class="card">'
            + '<h3>' + workspace.absolute_path + '</h3>'
            + '<p><strong>Git Branch:</strong> ' + (git.branch || 'not a git worktree') + '</p>'
            + '<p><strong>Upstream:</strong> ' + (git.upstream || 'n/a') + '</p>'
            + '<p><strong>Dirty Summary:</strong> modified ' + (git.modified_count ?? 0)
            + ', staged ' + (git.staged_count ?? 0)
            + ', untracked ' + (git.untracked_count ?? 0) + '</p>'
            + '<div class="badge-row">'
            + '<span class="badge">' + (git.is_clean ? 'clean' : 'dirty') + '</span>'
            + '<span class="badge">' + (git.linked_worktree ? 'linked worktree' : 'root checkout') + '</span>'
            + '</div>'
            + '</div>',
        ]);
      }

      function renderSessions(sessions) {
        if (!sessions || sessions.length === 0) {
          sessionsList.innerHTML = '<p>No recent sessions reported by Hermes.</p>';
          return;
        }

        sessionsList.innerHTML = formatList(sessions.map((session) => (
          '<div class="card">'
          + '<h3>' + session.preview + '</h3>'
          + '<p><strong>Last Active:</strong> ' + session.last_active + '</p>'
          + '<p><strong>Source:</strong> ' + session.source + '</p>'
          + '<p><strong>Session ID:</strong> ' + session.session_id + '</p>'
          + '<div class="button-row"><button class="ghost" type="button" data-session-id="' + session.session_id + '">Load Into Resume</button></div>'
          + '</div>'
        )));
      }

      function renderHealth(payload) {
        const health = payload.health;
        const issues = (health.checks.issues || []).map((issue) => '<li>' + issue + '</li>').join('');
        healthSummary.innerHTML = [
          '<p><strong>Status:</strong> ' + health.status + '</p>',
          '<p><strong>Entry Surface:</strong> ' + health.entry_surface + '</p>',
          '<p><strong>Gateway Service Loaded:</strong> ' + String(health.checks.gateway_service.loaded) + '</p>',
          issues ? '<ul>' + issues + '</ul>' : '<p>No runtime issues reported.</p>',
        ].join('');
      }

      function renderHostedBundle(payload) {
        const bundle = payload.hosted_pilot_bundle;
        hostedBundleSummary.innerHTML = [
          '<p><strong>Pilot Bundle:</strong> ' + bundle.pilot_bundle_status + '</p>',
          '<p><strong>Actual Hosted Runtime:</strong> ' + bundle.actual_hosted_runtime_status + '</p>',
          '<p><strong>Entry URL:</strong> ' + bundle.entry_url + '</p>',
          '<p><strong>API Base:</strong> ' + bundle.api_base_url + '</p>',
        ].join('');
        hostedBundleJson.textContent = JSON.stringify(payload, null, 2);
      }

      function renderHostedRuntimeReadiness(readiness) {
        if (!readiness) {
          hostedRuntimeReadinessSummary.innerHTML = '<p>No hosted runtime readiness surface yet.</p>';
          return;
        }

        const gaps = Array.isArray(readiness.blocking_gaps)
          ? readiness.blocking_gaps.map((gap) => '<li>' + String(gap) + '</li>').join('')
          : '';
        hostedRuntimeReadinessSummary.innerHTML = [
          '<p><strong>Status:</strong> ' + String(readiness.status || 'unknown') + '</p>',
          '<p><strong>Shell Target:</strong> ' + String(readiness.shell_integration_target || 'unknown') + '</p>',
          '<p><strong>Managed Hosted Runtime Landed:</strong> '
            + String(readiness.managed_hosted_runtime_landed)
            + '</p>',
          '<p><strong>LibreChat Pilot Package Landed:</strong> '
            + String(readiness.librechat_pilot_package_landed)
            + '</p>',
          gaps ? '<ul>' + gaps + '</ul>' : '<p>No blocking gaps reported.</p>',
        ].join('');
      }

      function renderDomainEntryParity(parity) {
        if (!parity) {
          domainEntryParitySummary.innerHTML = '<p>No domain entry parity surface yet.</p>';
          return;
        }

        const projects = Array.isArray(parity.projects)
          ? parity.projects.map((project) => (
            '<li><strong>' + String(project.project || project.project_id) + ':</strong> '
            + String(project.entry_parity_status || 'unknown')
            + ' / locator '
            + String(project.direct_entry_locator_status || 'unknown')
            + '</li>'
          )).join('')
          : '';

        domainEntryParitySummary.innerHTML = [
          '<p><strong>Total Projects:</strong> ' + String(parity.summary?.total_projects_count ?? 0) + '</p>',
          '<p><strong>Aligned:</strong> ' + String(parity.summary?.aligned_projects_count ?? 0) + '</p>',
          '<p><strong>Partial:</strong> ' + String(parity.summary?.partial_projects_count ?? 0) + '</p>',
          '<p><strong>Ready For OPL Start:</strong> ' + String(parity.summary?.ready_for_opl_start_count ?? 0) + '</p>',
          projects ? '<ul>' + projects + '</ul>' : '<p>No domain parity entries reported.</p>',
        ].join('');
      }

      function setHostedPackageStatus(message, tone = 'muted') {
        hostedPackageStatus.textContent = message;
        hostedPackageStatus.dataset.tone = tone;
      }

      function renderManifest(payload) {
        const manifest = payload.frontdesk_manifest;
        const endpointList = Object.entries(manifest.endpoints)
          .map(([key, value]) => '<li><strong>' + key + ':</strong> ' + value + '</li>')
          .join('');
        manifestSummary.innerHTML = [
          '<p><strong>Readiness:</strong> ' + manifest.readiness + '</p>',
          '<p><strong>Shell Target:</strong> ' + manifest.shell_integration_target + '</p>',
          '<p><strong>Hosted Packaging:</strong> ' + manifest.hosted_packaging_status + '</p>',
          '<ul>' + endpointList + '</ul>',
        ].join('');
      }

      function renderFrontdeskReadiness(payload) {
        const readiness = payload.frontdesk_readiness;
        const projects = Array.isArray(readiness?.projects)
          ? readiness.projects.map((project) => (
            '<li><strong>' + String(project.project || project.project_id) + ':</strong> '
            + String(project.verdict || project.entry_parity_status || 'unknown')
            + ' / usable=' + String(project.usable_now)
            + ' / start=' + String(project.ready_for_opl_start)
            + ' / handoff=' + String(project.ready_for_domain_handoff)
            + (project.recommended_start_command
              ? ' / <code>' + String(project.recommended_start_command) + '</code>'
              : '')
            + '</li>'
          )).join('')
          : '';

        frontdeskReadinessSummary.innerHTML = [
          '<p><strong>Overall:</strong> ' + String(readiness.overall_status || 'unknown') + '</p>',
          '<p><strong>Service Health:</strong> ' + String(readiness.local_service?.health?.status || 'unknown') + '</p>',
          '<p><strong>Usable Now:</strong> ' + String(readiness.summary?.usable_now_projects_count ?? 0) + '</p>',
          '<p><strong>Ready To Try Now:</strong> ' + String(readiness.summary?.ready_to_try_now_projects_count ?? 0) + '</p>',
          projects ? '<ul>' + projects + '</ul>' : '<p>No readiness entries reported.</p>',
        ].join('');
      }

      function renderDomainWiring(payload) {
        const wiring = payload.frontdesk_domain_wiring;
        const bindingParity = wiring.domain_binding_parity;
        const projects = Array.isArray(bindingParity?.projects)
          ? bindingParity.projects.map((project) => (
            '<li><strong>' + String(project.project || project.project_id) + ':</strong> '
            + 'active=' + String(project.active_binding ? 'yes' : 'no')
            + ' / manifest=' + String(project.manifest_ready)
            + ' / launch=' + String(project.launch_ready)
            + (Array.isArray(project.available_actions) && project.available_actions.length > 0
              ? ' / actions ' + project.available_actions.map((action) => '<code>' + String(action) + '</code>').join(', ')
              : '')
            + '</li>'
          )).join('')
          : '';

        domainWiringSummary.innerHTML = [
          '<p><strong>Total Projects:</strong> ' + String(wiring.summary?.total_projects_count ?? 0) + '</p>',
          '<p><strong>Active Bindings:</strong> ' + String(bindingParity?.summary?.active_projects_count ?? 0) + '</p>',
          '<p><strong>Manifest Ready:</strong> ' + String(bindingParity?.summary?.manifest_ready_projects_count ?? 0) + '</p>',
          '<p><strong>Launch Ready:</strong> ' + String(bindingParity?.summary?.launch_ready_projects_count ?? 0) + '</p>',
          projects ? '<ul>' + projects + '</ul>' : '<p>No domain wiring entries reported.</p>',
        ].join('');
      }

      function renderDashboard(payload) {
        const dashboard = payload.dashboard;
        renderFrontdeskSettings({
          interaction_mode: dashboard.front_desk.interaction_mode,
          execution_mode: dashboard.front_desk.execution_mode,
        });
        metricProjects.textContent = String(dashboard.projects.length);
        metricSessions.textContent = String(dashboard.runtime_status.recent_sessions.sessions.length);
        metricProcesses.textContent = String(dashboard.runtime_status.process_usage.summary.process_count);
        runtimeNote.textContent = dashboard.runtime_status.notes.join(' ');
        const recommendedStart = pickPreferredRecommendedEntry(dashboard.front_desk.recommended_entry_surfaces);
        if (recommendedStart) {
          const preferredLaunchStrategy = pickRecommendedLaunchStrategy(recommendedStart);
          if (!startProjectInput.value.trim()) {
            startProjectInput.value = String(recommendedStart.project_id || '');
          }
          if (!launchProjectInput.value.trim()) {
            launchProjectInput.value = String(recommendedStart.project_id || '');
          }
          if (!launchStrategyInput.value.trim() || launchStrategyInput.value.trim() === 'auto') {
            launchStrategyInput.value = preferredLaunchStrategy || 'auto';
          }
          if (!startModeInput.value.trim() && recommendedStart.product_entry_start?.recommended_mode_id) {
            startModeInput.value = String(recommendedStart.product_entry_start.recommended_mode_id);
          }
          if (startJson.textContent === '{}' || startJson.textContent === '') {
            startSummary.innerHTML = [
              '<p><strong>Recommended Project:</strong> ' + String(recommendedStart.project || recommendedStart.project_id) + '</p>',
              recommendedStart.product_entry_start?.summary
                ? '<p><strong>Summary:</strong> ' + String(recommendedStart.product_entry_start.summary) + '</p>'
                : '',
              recommendedStart.product_entry_start?.recommended_mode_id
                ? '<p><strong>Recommended Mode:</strong> <code>'
                  + String(recommendedStart.product_entry_start.recommended_mode_id)
                  + '</code></p>'
                : '',
              recommendedStart.active_binding_locator?.url
                ? '<p><strong>Bound direct entry:</strong> ' + String(recommendedStart.active_binding_locator.url) + '</p>'
                : '',
              recommendedStart.active_binding_locator?.command
                ? '<p><strong>Bound direct command:</strong> <code>'
                  + String(recommendedStart.active_binding_locator.command)
                  + '</code></p>'
                : '',
            ].filter(Boolean).join('');
            startCommand.innerHTML = recommendedStart.product_entry_start?.modes?.length
              ? '<p><strong>Available Modes:</strong> '
                + recommendedStart.product_entry_start.modes.map((mode) => '<code>' + String(mode.mode_id) + '</code>').join(', ')
                + '</p>'
              : 'Choose a project and resolve its current start surface.';
          }
          if (launchJson.textContent === '{}' || launchJson.textContent === '') {
            launchSummary.innerHTML = [
              '<p><strong>Bound direct entry:</strong> ' + String(recommendedStart.project || recommendedStart.project_id) + '</p>',
              preferredLaunchStrategy
                ? '<p><strong>Preferred Strategy:</strong> <code>' + preferredLaunchStrategy + '</code></p>'
                : '',
              recommendedStart.active_binding_locator?.url
                ? '<p><strong>Direct Entry URL:</strong> ' + String(recommendedStart.active_binding_locator.url) + '</p>'
                : '',
              recommendedStart.active_binding_locator?.command
                ? '<p><strong>Direct Entry Command:</strong> <code>'
                  + String(recommendedStart.active_binding_locator.command)
                  + '</code></p>'
                : '',
            ].filter(Boolean).join('');
            launchAction.innerHTML = recommendedStart.active_binding_locator?.manifest_command
              ? '<p><strong>Manifest Command:</strong> <code>'
                + String(recommendedStart.active_binding_locator.manifest_command)
                + '</code></p>'
              : 'Preview or launch a bound domain entry to inspect the selected action.';
          }
        }
        renderHostedRuntimeReadiness(dashboard.front_desk.hosted_runtime_readiness);
        renderDomainEntryParity(dashboard.front_desk.domain_entry_parity);
        renderProjects(dashboard.projects, dashboard.domain_manifests.projects);
        renderWorkspace(dashboard.workspace);
        renderWorkspaceCatalog({ workspace_catalog: dashboard.workspace_catalog });
        renderSessionLedger({ session_ledger: dashboard.runtime_status.managed_session_ledger });
        renderDomainManifests({ domain_manifests: dashboard.domain_manifests });
      }

      function renderAskPayload(payload) {
        const entry = payload.product_entry;
        if (entry.mode === 'task_status') {
          const task = entry.task;
          askSummary.innerHTML = [
            '<p><strong>Mode:</strong> task_status</p>',
            '<p><strong>Backend:</strong> ' + String(task.executor_backend || state.frontdeskSettings.interaction_mode) + '</p>',
            '<p><strong>Task:</strong> ' + String(task.task_id) + '</p>',
            '<p><strong>Status:</strong> ' + String(task.status) + '</p>',
            '<p><strong>Stage:</strong> ' + String(task.stage) + '</p>',
            task.session_id ? '<p><strong>Session:</strong> ' + String(task.session_id) + '</p>' : '',
            task.exit_code !== null && task.exit_code !== undefined
              ? '<p><strong>Exit Code:</strong> ' + String(task.exit_code) + '</p>'
              : '',
          ].filter(Boolean).join('');
          askBoundary.innerHTML = [
            '<p><strong>Summary:</strong> ' + String(task.summary || '') + '</p>',
            task.recent_output
              ? '<pre class="json-view">' + String(task.recent_output) + '</pre>'
              : '<p>No recent output yet.</p>',
          ].join('');
          askJson.textContent = JSON.stringify(payload, null, 2);
          return;
        }

        const summaryLines = [
          '<p><strong>Mode:</strong> ' + entry.mode + '</p>',
          '<p><strong>Dry Run:</strong> ' + String(entry.dry_run) + '</p>',
          '<p><strong>Routing:</strong> ' + entry.routing.status + '</p>',
        ];

        if (entry.executor_backend) {
          summaryLines.push('<p><strong>Backend:</strong> ' + entry.executor_backend + '</p>');
        }

        if (entry.execution_mode) {
          summaryLines.push('<p><strong>Execution:</strong> ' + entry.execution_mode + '</p>');
        }

        if (entry.task && entry.task.task_id) {
          summaryLines.push('<p><strong>Task:</strong> ' + entry.task.task_id + '</p>');
        }

        if (entry.task && entry.task.status) {
          summaryLines.push('<p><strong>Task Status:</strong> ' + entry.task.status + '</p>');
        }

        if (entry.task && entry.task.executor_backend) {
          summaryLines.push('<p><strong>Task Backend:</strong> ' + entry.task.executor_backend + '</p>');
        }

        if (entry.task && entry.task.summary) {
          summaryLines.push('<p><strong>Task Summary:</strong> ' + entry.task.summary + '</p>');
        }

        if (entry.codex && entry.codex.session_id) {
          summaryLines.push('<p><strong>Session:</strong> ' + entry.codex.session_id + '</p>');
        }

        if (entry.codex && entry.codex.response) {
          summaryLines.push('<p><strong>Response:</strong> ' + entry.codex.response + '</p>');
        }

        if (entry.hermes && entry.hermes.session_id) {
          summaryLines.push('<p><strong>Session:</strong> ' + entry.hermes.session_id + '</p>');
        }

        if (entry.hermes && entry.hermes.response) {
          summaryLines.push('<p><strong>Response:</strong> ' + entry.hermes.response + '</p>');
        }

        askSummary.innerHTML = summaryLines.join('');
        askBoundary.innerHTML = [
          '<p><strong>Boundary Status:</strong> ' + entry.boundary.boundary_status + '</p>',
          '<p><strong>Boundary Reason:</strong> ' + entry.boundary.reason + '</p>',
          entry.task?.recent_output
            ? '<pre class="json-view">' + entry.task.recent_output + '</pre>'
            : '',
        ].join('');
        askJson.textContent = JSON.stringify(payload, null, 2);
      }

      async function loadFrontdeskSettings() {
        const response = await fetch(bootstrap.web_frontdesk.api.frontdesk_settings);
        if (!response.ok) {
          throw new Error('Frontdesk settings request failed with status ' + response.status);
        }

        const payload = await response.json();
        renderFrontdeskSettings(payload.frontdesk_settings);
      }

      async function saveFrontdeskSettings() {
        setSettingsStatus('Saving frontdesk modes...', 'muted');

        try {
          const response = await fetch(bootstrap.web_frontdesk.api.frontdesk_settings, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              interaction_mode: interactionModeInput.value,
              execution_mode: executionModeInput.value,
            }),
          });
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error?.message || 'Frontdesk settings update failed.');
          }

          renderFrontdeskSettings(payload.frontdesk_settings);
          setSettingsStatus('Frontdesk modes saved.', 'ok');
        } catch (error) {
          setSettingsStatus(error instanceof Error ? error.message : 'Frontdesk settings update failed.', 'warn');
        }
      }

      async function fetchTaskStatus(taskId) {
        const response = await fetch(
          bootstrap.web_frontdesk.api.task_status
            + '?task_id=' + encodeURIComponent(taskId)
            + '&lines=20',
        );
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error?.message || 'Task status request failed.');
        }

        renderAskPayload(payload);
        const task = payload.product_entry.task;
        const done = task.status === 'succeeded' || task.status === 'failed';
        setAskStatus(task.summary || 'Task status updated.', done ? (task.status === 'succeeded' ? 'ok' : 'warn') : 'muted');
        if (done && state.activeTaskPoller) {
          window.clearInterval(state.activeTaskPoller);
          state.activeTaskPoller = null;
        }
      }

      function startTaskPolling(taskId) {
        if (state.activeTaskPoller) {
          window.clearInterval(state.activeTaskPoller);
          state.activeTaskPoller = null;
        }

        void fetchTaskStatus(taskId).catch((error) => {
          setAskStatus(error instanceof Error ? error.message : 'Task status request failed.', 'warn');
        });

        state.activeTaskPoller = window.setInterval(() => {
          void fetchTaskStatus(taskId).catch((error) => {
            setAskStatus(error instanceof Error ? error.message : 'Task status request failed.', 'warn');
          });
        }, 2000);
      }

      function renderStartPayload(payload) {
        const start = payload.product_entry_start;
        startSummary.innerHTML = [
          '<p><strong>Project:</strong> ' + start.project + '</p>',
          '<p><strong>Target Domain:</strong> ' + start.target_domain_id + '</p>',
          start.summary ? '<p><strong>Summary:</strong> ' + start.summary + '</p>' : '',
          start.recommended_mode_id ? '<p><strong>Recommended Mode:</strong> <code>' + start.recommended_mode_id + '</code></p>' : '',
          Array.isArray(start.human_gate_ids) && start.human_gate_ids.length > 0
            ? '<p><strong>Human Gates:</strong> ' + start.human_gate_ids.map((gateId) => '<code>' + gateId + '</code>').join(', ') + '</p>'
            : '',
        ].filter(Boolean).join('');
        startCommand.innerHTML = [
          '<p><strong>Selected Mode:</strong> <code>' + start.selected_mode_id + '</code></p>',
          start.selected_mode?.command
            ? '<p><strong>Command:</strong> <code>' + start.selected_mode.command + '</code></p>'
            : '',
          start.resume_surface?.command
            ? '<p><strong>Resume Command:</strong> <code>' + start.resume_surface.command + '</code></p>'
            : '',
          Array.isArray(start.available_modes) && start.available_modes.length > 0
            ? '<div><strong>Available Modes:</strong><ul>'
              + start.available_modes
                .map((mode) => '<li><code>'
                  + String(mode.mode_id)
                  + '</code>: '
                  + String(mode.command || mode.surface_kind || '')
                  + (mode.summary ? ' - ' + String(mode.summary) : '')
                  + '</li>')
                .join('')
              + '</ul></div>'
            : '',
        ].filter(Boolean).join('');
        startJson.textContent = JSON.stringify(payload, null, 2);
      }

      function renderLaunchPayload(payload) {
        const launch = payload.domain_entry_launch;
        launchSummary.innerHTML = [
          '<p><strong>Project:</strong> ' + launch.project + '</p>',
          '<p><strong>Target Domain:</strong> ' + launch.target_domain_id + '</p>',
          '<p><strong>Launch Status:</strong> ' + launch.launch_status + '</p>',
          '<p><strong>Selected Strategy:</strong> <code>' + launch.selected_strategy + '</code></p>',
          launch.workspace_locator?.absolute_path
            ? '<p><strong>Workspace:</strong> ' + launch.workspace_locator.absolute_path + '</p>'
            : '',
        ].filter(Boolean).join('');
        launchAction.innerHTML = [
          launch.action?.kind ? '<p><strong>Action Kind:</strong> <code>' + launch.action.kind + '</code></p>' : '',
          Array.isArray(launch.action?.command_preview)
            ? '<p><strong>Command Preview:</strong> <code>' + launch.action.command_preview.join(' ') + '</code></p>'
            : '',
          launch.direct_entry_locator?.url
            ? '<p><strong>Direct Entry URL:</strong> ' + launch.direct_entry_locator.url + '</p>'
            : '',
          launch.direct_entry_locator?.command
            ? '<p><strong>Direct Entry Command:</strong> <code>' + launch.direct_entry_locator.command + '</code></p>'
            : '',
          launch.direct_entry_locator?.workspace_locator?.surface_kind
            ? '<p><strong>Workspace Locator:</strong> ' + launch.direct_entry_locator.workspace_locator.surface_kind + '</p>'
            : '',
        ].filter(Boolean).join('');
        launchJson.textContent = JSON.stringify(payload, null, 2);
      }

      function renderWorkspaceCatalog(payload) {
        const catalog = payload.workspace_catalog || {};
        const bindings = Array.isArray(catalog.bindings)
          ? catalog.bindings.filter((binding) => binding.status !== 'archived')
          : [];
        const activeBinding = bindings.find((binding) => binding.status === 'active') || bindings[0] || null;

        state.workspaceBindings = bindings;
        workspaceCatalogJson.textContent = JSON.stringify(payload, null, 2);
        workspaceBindingSelect.innerHTML = bindings.length > 0
          ? bindings.map((binding) => (
            '<option value="' + binding.binding_id + '">' + getWorkspaceBindingLabel(binding) + '</option>'
          )).join('')
          : '<option value="">No bound workspace yet</option>';

        if (activeBinding) {
          workspaceBindingSelect.value = activeBinding.binding_id;
          state.workspacePath = activeBinding.workspace_path;
          syncWorkspaceForm(activeBinding);
        }

        renderWorkspaceHubSummary(activeBinding, catalog.summary);
      }

      function renderSessionLedger(payload) {
        sessionLedgerJson.textContent = JSON.stringify(payload, null, 2);
      }

      function renderDomainManifests(payload) {
        domainManifestJson.textContent = JSON.stringify(payload, null, 2);
      }

      function setWorkspaceStatus(message, tone = 'muted') {
        workspaceStatusLine.textContent = message;
        workspaceStatusLine.dataset.tone = tone;
      }

      async function fetchDashboard() {
        const params = new URLSearchParams({
          path: state.workspacePath,
          'sessions-limit': String(state.sessionsLimit),
        });
        const response = await fetch(bootstrap.web_frontdesk.api.dashboard + '?' + params.toString());
        if (!response.ok) {
          throw new Error('Dashboard request failed with status ' + response.status);
        }

        const payload = await response.json();
        renderDashboard(payload);
      }

      async function fetchSessions() {
        const params = new URLSearchParams({
          limit: String(state.sessionsLimit),
        });
        const response = await fetch(bootstrap.web_frontdesk.api.sessions + '?' + params.toString());
        if (!response.ok) {
          throw new Error('Sessions request failed with status ' + response.status);
        }

        const payload = await response.json();
        renderSessions(payload.product_entry.sessions || []);
      }

      async function fetchHostedFriendlySurface() {
        const [healthResponse, manifestResponse, readinessResponse, wiringResponse, hostedBundleResponse] = await Promise.all([
          fetch(bootstrap.web_frontdesk.api.health),
          fetch(bootstrap.web_frontdesk.api.frontdesk_manifest),
          fetch(bootstrap.web_frontdesk.api.frontdesk_readiness),
          fetch(bootstrap.web_frontdesk.api.frontdesk_domain_wiring),
          fetch(bootstrap.web_frontdesk.api.hosted_bundle),
        ]);

        if (!healthResponse.ok) {
          throw new Error('Health request failed with status ' + healthResponse.status);
        }
        if (!manifestResponse.ok) {
          throw new Error('Manifest request failed with status ' + manifestResponse.status);
        }
        if (!readinessResponse.ok) {
          throw new Error('Frontdesk readiness request failed with status ' + readinessResponse.status);
        }
        if (!wiringResponse.ok) {
          throw new Error('Domain wiring request failed with status ' + wiringResponse.status);
        }
        if (!hostedBundleResponse.ok) {
          throw new Error('Hosted bundle request failed with status ' + hostedBundleResponse.status);
        }

        renderHealth(await healthResponse.json());
        renderManifest(await manifestResponse.json());
        renderFrontdeskReadiness(await readinessResponse.json());
        renderDomainWiring(await wiringResponse.json());
        renderHostedBundle(await hostedBundleResponse.json());
      }

      async function resolveStartSurface() {
        const projectId = startProjectInput.value.trim();
        const modeId = startModeInput.value.trim();

        if (!projectId) {
          setStartStatus('Start surface requires a project id.', 'warn');
          return;
        }

        const params = new URLSearchParams({
          project: projectId,
        });
        if (modeId) {
          params.set('mode', modeId);
        }

        setStartStatus('Resolving routed start surface...', 'muted');

        try {
          const response = await fetch(bootstrap.web_frontdesk.api.start + '?' + params.toString());
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error?.message || 'Start surface request failed.');
          }

          renderStartPayload(payload);
          setStartStatus('Start surface resolved.', 'ok');
        } catch (error) {
          setStartStatus(error instanceof Error ? error.message : 'Start surface request failed.', 'warn');
        }
      }

      async function submitDomainLaunch(dryRun) {
        const projectId = launchProjectInput.value.trim() || startProjectInput.value.trim();
        const strategy = launchStrategyInput.value.trim();

        if (!projectId) {
          setLaunchStatus('Launch requires a project id.', 'warn');
          return;
        }

        setLaunchStatus(dryRun ? 'Previewing domain launch...' : 'Launching bound domain entry...', 'muted');

        try {
          const response = await fetch(bootstrap.web_frontdesk.api.launch_domain, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              project_id: projectId,
              workspace_path: workspacePathInput.value.trim() || state.workspacePath,
              strategy,
              dry_run: dryRun,
            }),
          });
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error?.message || 'Launch request failed.');
          }

          renderLaunchPayload(payload);
          setLaunchStatus(dryRun ? 'Launch preview updated.' : 'Bound domain entry launched.', 'ok');
        } catch (error) {
          setLaunchStatus(error instanceof Error ? error.message : 'Launch request failed.', 'warn');
        }
      }

      async function exportHostedPackage() {
        const outputDir = hostedPackageOutputInput.value.trim();
        if (!outputDir) {
          setHostedPackageStatus('Hosted package export requires an output directory.', 'warn');
          return;
        }

        setHostedPackageStatus('Exporting hosted pilot package...', 'muted');

        try {
          const response = await fetch(bootstrap.web_frontdesk.api.hosted_package, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              output_dir: outputDir,
              public_origin: hostedPackagePublicOriginInput.value.trim(),
            }),
          });
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error?.message || 'Hosted package export failed.');
          }

          hostedPackageJson.textContent = JSON.stringify(payload, null, 2);
          setHostedPackageStatus('Hosted pilot package exported.', 'ok');
        } catch (error) {
          setHostedPackageStatus(
            error instanceof Error ? error.message : 'Hosted package export failed.',
            'warn',
          );
        }
      }

      function setLibreChatPackageStatus(message, tone = 'muted') {
        librechatPackageStatus.textContent = message;
        librechatPackageStatus.dataset.tone = tone;
      }

      async function exportLibreChatPackage() {
        const outputDir = librechatPackageOutputInput.value.trim();
        if (!outputDir) {
          setLibreChatPackageStatus('LibreChat pilot export requires an output directory.', 'warn');
          return;
        }

        setLibreChatPackageStatus('Exporting LibreChat-first hosted pilot...', 'muted');

        try {
          const response = await fetch(bootstrap.web_frontdesk.api.librechat_package, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              output_dir: outputDir,
              public_origin: librechatPackagePublicOriginInput.value.trim(),
            }),
          });
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error?.message || 'LibreChat pilot export failed.');
          }

          librechatPackageJson.textContent = JSON.stringify(payload, null, 2);
          setLibreChatPackageStatus('LibreChat-first hosted pilot exported.', 'ok');
        } catch (error) {
          setLibreChatPackageStatus(
            error instanceof Error ? error.message : 'LibreChat pilot export failed.',
            'warn',
          );
        }
      }

      async function fetchWorkspaceCatalog() {
        const response = await fetch(bootstrap.web_frontdesk.api.workspace_catalog);
        if (!response.ok) {
          throw new Error('Workspace catalog request failed with status ' + response.status);
        }

        renderWorkspaceCatalog(await response.json());
      }

      async function fetchSessionLedger() {
        const response = await fetch(
          bootstrap.web_frontdesk.api.session_ledger + '?limit=' + encodeURIComponent(String(state.sessionsLimit)),
        );
        if (!response.ok) {
          throw new Error('Session ledger request failed with status ' + response.status);
        }

        renderSessionLedger(await response.json());
      }

      function setResumeStatus(message, tone = 'muted') {
        resumeStatus.textContent = message;
        resumeStatus.dataset.tone = tone;
      }

      function setLogsStatus(message, tone = 'muted') {
        logsStatus.textContent = message;
        logsStatus.dataset.tone = tone;
      }

      async function submitResume() {
        const sessionId = resumeSessionInput.value.trim();
        if (!sessionId) {
          setResumeStatus('Resume requires a session id.', 'warn');
          return;
        }

        setResumeStatus('Resuming Hermes session...', 'muted');
        try {
          const response = await fetch(bootstrap.web_frontdesk.api.resume, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              session_id: sessionId,
            }),
          });
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error?.message || 'Resume request failed.');
          }

          resumeOutput.textContent = JSON.stringify(payload, null, 2);
          setResumeStatus('Session resumed.', 'ok');
        } catch (error) {
          setResumeStatus(error instanceof Error ? error.message : 'Resume failed.', 'warn');
        }
      }

      async function loadLogs() {
        const params = new URLSearchParams();
        const logName = logNameInput.value.trim();
        const lines = logLinesInput.value.trim();

        if (logName) {
          params.set('log_name', logName);
        }
        if (lines) {
          params.set('lines', lines);
        }

        setLogsStatus('Loading logs...', 'muted');
        try {
          const response = await fetch(bootstrap.web_frontdesk.api.logs + '?' + params.toString());
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error?.message || 'Logs request failed.');
          }

          logsOutput.textContent = JSON.stringify(payload, null, 2);
          setLogsStatus('Logs updated.', 'ok');
        } catch (error) {
          setLogsStatus(error instanceof Error ? error.message : 'Logs failed.', 'warn');
        }
      }

      async function refreshAll() {
        await Promise.all([fetchWorkspaceCatalog(), loadFrontdeskSettings()]);
        await Promise.all([
          fetchDashboard(),
          fetchSessions(),
          fetchHostedFriendlySurface(),
          fetchSessionLedger(),
        ]);
      }

      async function activateSelectedWorkspace() {
        const binding = getSelectedWorkspaceBinding();
        if (!binding) {
          setWorkspaceStatus('Choose a bound workspace first.', 'warn');
          return;
        }

        setWorkspaceStatus('Switching active workspace...', 'muted');

        try {
          const response = await fetch(bootstrap.web_frontdesk.api.workspace_activate, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              project_id: binding.project_id,
              workspace_path: binding.workspace_path,
            }),
          });
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error?.message || 'Workspace switch failed.');
          }

          state.workspacePath = binding.workspace_path;
          syncWorkspaceForm(binding);
          renderWorkspaceCatalog(payload);
          await refreshAll();
          setWorkspaceStatus('Active workspace switched.', 'ok');
        } catch (error) {
          setWorkspaceStatus(error instanceof Error ? error.message : 'Workspace switch failed.', 'warn');
        }
      }

      async function submitWorkspaceAction(action) {
        const projectId = workspaceProjectInput.value.trim();
        const workspacePath = workspacePathInput.value.trim() || bootstrap.web_frontdesk.defaults.workspace_path;

        state.workspacePath = workspacePath;

        if (action === 'inspect') {
          setWorkspaceStatus('Inspecting workspace...', 'muted');
          try {
            await refreshAll();
            setWorkspaceStatus('Workspace inspection updated.', 'ok');
          } catch (error) {
            setWorkspaceStatus(error instanceof Error ? error.message : 'Workspace inspection failed.', 'warn');
          }
          return;
        }

        const endpoint = action === 'bind'
          ? bootstrap.web_frontdesk.api.workspace_bind
          : action === 'activate'
            ? bootstrap.web_frontdesk.api.workspace_activate
            : bootstrap.web_frontdesk.api.workspace_archive;

        setWorkspaceStatus(
          action === 'bind'
            ? 'Writing workspace binding...'
            : action === 'activate'
              ? 'Activating workspace binding...'
              : 'Archiving workspace binding...',
          'muted',
        );

        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              project_id: projectId,
              workspace_path: workspacePath,
              label: workspaceLabelInput.value,
              entry_command: workspaceEntryCommandInput.value,
              manifest_command: workspaceManifestCommandInput.value,
              entry_url: workspaceEntryUrlInput.value,
              workspace_root: workspaceRootLocatorInput.value,
              profile_ref: workspaceProfileInput.value,
              input_path: workspaceInputPathInput.value,
            }),
          });
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error?.message || 'Workspace registry request failed.');
          }

          renderWorkspaceCatalog(payload);
          await refreshAll();
          setWorkspaceStatus(
            action === 'bind'
              ? 'Workspace binding saved.'
              : action === 'activate'
                ? 'Workspace binding activated.'
                : 'Workspace binding archived.',
            'ok',
          );
        } catch (error) {
          setWorkspaceStatus(
            error instanceof Error ? error.message : 'Workspace registry request failed.',
            'warn',
          );
        }
      }

      async function submitAsk(dryRun) {
        setButtonBusy(true);
        setAskStatus(dryRun ? 'Previewing handoff...' : 'Submitting background task through OPL...', 'muted');

        try {
          const response = await fetch(bootstrap.web_frontdesk.api.ask, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              dry_run: dryRun,
              goal: document.getElementById('goal').value,
              intent: document.getElementById('intent').value,
              target: document.getElementById('target').value,
              preferred_family: document.getElementById('preferred-family').value,
              request_kind: document.getElementById('request-kind').value,
              workspace_path: workspacePathInput.value.trim() || state.workspacePath,
            }),
          });
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error?.message || 'Ask request failed.');
          }

          renderAskPayload(payload);
          if (!dryRun && payload.product_entry?.task?.task_id) {
            startTaskPolling(String(payload.product_entry.task.task_id));
          }
          setAskStatus(
            dryRun ? 'Preview updated.' : 'Task accepted. Live progress polling has started.',
            'ok',
          );
        } catch (error) {
          setAskStatus(error instanceof Error ? error.message : 'Unknown ask failure.', 'warn');
        } finally {
          setButtonBusy(false);
        }
      }

      document.getElementById('workspace-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        await submitWorkspaceAction('inspect');
      });

      document.getElementById('start-form').addEventListener('submit', (event) => {
        event.preventDefault();
        void resolveStartSurface();
      });

      document.getElementById('launch-form').addEventListener('submit', (event) => {
        event.preventDefault();
        void submitDomainLaunch(false);
      });

      document.getElementById('resume-form').addEventListener('submit', (event) => {
        event.preventDefault();
        void submitResume();
      });

      document.getElementById('logs-form').addEventListener('submit', (event) => {
        event.preventDefault();
        void loadLogs();
      });

      document.getElementById('hosted-package-form').addEventListener('submit', (event) => {
        event.preventDefault();
        void exportHostedPackage();
      });

      document.getElementById('librechat-package-form').addEventListener('submit', (event) => {
        event.preventDefault();
        void exportLibreChatPackage();
      });

      sessionsList.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }

        const button = target.closest('button[data-session-id]');
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }

        resumeSessionInput.value = button.dataset.sessionId || '';
        setResumeStatus('Session id loaded from recent sessions.', 'ok');
      });

      previewButton.addEventListener('click', () => {
        void submitAsk(true);
      });
      askButton.addEventListener('click', () => {
        void submitAsk(false);
      });
      saveSettingsButton.addEventListener('click', () => {
        void saveFrontdeskSettings();
      });
      launchPreviewButton.addEventListener('click', () => {
        void submitDomainLaunch(true);
      });
      refreshButton.addEventListener('click', () => {
        void refreshAll().catch((error) => {
          runtimeNote.textContent = error instanceof Error ? error.message : 'Refresh failed.';
        });
      });
      workspaceBindButton.addEventListener('click', () => {
        void submitWorkspaceAction('bind');
      });
      workspaceActivateButton.addEventListener('click', () => {
        void submitWorkspaceAction('activate');
      });
      workspaceArchiveButton.addEventListener('click', () => {
        void submitWorkspaceAction('archive');
      });
      workspaceBindingSelect.addEventListener('change', () => {
        const binding = getSelectedWorkspaceBinding();
        syncWorkspaceForm(binding);
        renderWorkspaceHubSummary(binding, {
          active_projects_count: state.workspaceBindings.filter((entry) => entry.status === 'active').length,
          total_bindings_count: state.workspaceBindings.length,
        });
      });
      workspaceSwitchButton.addEventListener('click', () => {
        void activateSelectedWorkspace();
      });
      workspaceRefreshButton.addEventListener('click', () => {
        void refreshAll().catch((error) => {
          setWorkspaceStatus(error instanceof Error ? error.message : 'Workspace refresh failed.', 'warn');
        });
      });

      void Promise.all([refreshAll(), loadLogs()]).catch((error) => {
        runtimeNote.textContent = error instanceof Error ? error.message : 'Dashboard load failed.';
      });
      window.setInterval(() => {
        void refreshAll().catch(() => {
          // Keep the current UI state if background refresh fails.
        });
      }, 30000);
    </script>
  </body>
</html>`;
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

    if (method === 'GET' && routedPath === '/api/frontdesk/librechat/status') {
      writeJson(response, 200, await getFrontDeskLibreChatServiceStatus(context.contracts));
      return;
    }

    if (method === 'POST' && routedPath === '/api/frontdesk/librechat/title-sync') {
      const body = (await readJsonBody(request)) as TitleSyncRequestBody;
      writeJson(response, 200, {
        frontdesk_librechat_title_sync: await queueFrontDeskLibreChatTitleSync(
          parsePositiveIntegerFromBody(body.limit, 'limit') ?? 3,
        ),
      });
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

    if (method === 'POST' && routedPath === '/api/frontdesk/librechat/package') {
      writeJson(
        response,
        200,
        buildLibreChatPilotPackage(context.contracts, {
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
