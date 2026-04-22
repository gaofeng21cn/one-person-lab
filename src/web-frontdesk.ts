import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { GatewayContractError } from './contracts.ts';
import {
  buildFrontDeskInitialize,
  buildFrontDeskEnvironment,
  buildFrontDeskModules,
  buildFrontDeskWorkspaceRootSurface,
  runFrontDeskEngineAction,
  runFrontDeskModuleAction,
  runFrontDeskSystemAction,
  writeFrontDeskWorkspaceRootSurface,
  type FrontDeskEngineAction,
  type FrontDeskSystemAction,
  type FrontDeskModuleAction,
} from './frontdesk-installation.ts';
import {
  buildFrontDeskEntryUrl,
  stripFrontDeskBasePath,
} from './frontdesk-paths.ts';
import { buildOplApiCatalog, type OplApiCatalog } from './opl-api-paths.ts';
import {
  buildFrontDeskDashboard,
  buildFrontDeskHealth,
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
import { readFrontDeskUpdateChannel } from './frontdesk-preferences.ts';
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

type FrontDeskModuleActionRequestBody = Partial<{
  action: FrontDeskModuleAction | string;
  moduleId: string;
  module_id: string;
}>;

type FrontDeskEngineActionRequestBody = Partial<{
  action: FrontDeskEngineAction | string;
  engineId: string;
  engine_id: string;
}>;

type FrontDeskSystemActionRequestBody = Partial<{
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

type WorkspaceRootRequestBody = Partial<{
  path: string;
  workspaceRoot: string;
  workspace_root: string;
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

type DomainAgentBlueprint = {
  agent_id: 'mas' | 'mag' | 'rca';
  module_id: 'medautoscience' | 'medautogrant' | 'redcube';
  title: string;
  description: string;
  artifact_conventions: string;
  progress_conventions: string;
};

type DomainAgentEntrySpec = {
  agent_id: string;
  title: string;
  description: string;
  default_engine: string;
  workspace_requirement: string;
  locator_schema: {
    required_fields: string[];
    optional_fields: string[];
  };
  codex_entry_strategy: string;
  artifact_conventions: string;
  progress_conventions: string;
  entry_command: string;
  manifest_command: string;
};

const DOMAIN_AGENT_BLUEPRINTS: Record<string, DomainAgentBlueprint> = {
  medautoscience: {
    agent_id: 'mas',
    module_id: 'medautoscience',
    title: 'Med Auto Science',
    description: 'Medical research and paper production inside a MAS workspace.',
    artifact_conventions: 'paper_and_submission_package',
    progress_conventions: 'study_runtime_narration',
  },
  medautogrant: {
    agent_id: 'mag',
    module_id: 'medautogrant',
    title: 'Med Auto Grant',
    description: 'Grant-writing and revision workflows inside a MAG workspace.',
    artifact_conventions: 'grant_proposal_package',
    progress_conventions: 'grant_workloop_narration',
  },
  redcube: {
    agent_id: 'rca',
    module_id: 'redcube',
    title: 'RedCube AI',
    description: 'Presentation and visual-deliverable workflows inside a RedCube workspace.',
    artifact_conventions: 'deck_and_visual_delivery',
    progress_conventions: 'deliverable_build_narration',
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
}

function readStringListFromRecord(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }
  const items = value
    .map((entry) => normalizeOptionalString(entry))
    .filter((entry): entry is string => typeof entry === 'string');
  return items.length === value.length ? items : null;
}

function readDomainAgentEntrySpec(value: unknown): DomainAgentEntrySpec | null {
  if (!isRecord(value)) {
    return null;
  }
  const locatorSchema = isRecord(value.locator_schema) ? value.locator_schema : null;
  const requiredFields = readStringListFromRecord(locatorSchema?.required_fields);
  const optionalFields = readStringListFromRecord(locatorSchema?.optional_fields);
  const agentId = normalizeOptionalString(value.agent_id);
  const title = normalizeOptionalString(value.title);
  const description = normalizeOptionalString(value.description);
  const defaultEngine = normalizeOptionalString(value.default_engine);
  const workspaceRequirement = normalizeOptionalString(value.workspace_requirement);
  const codexEntryStrategy = normalizeOptionalString(value.codex_entry_strategy);
  const artifactConventions = normalizeOptionalString(value.artifact_conventions);
  const progressConventions = normalizeOptionalString(value.progress_conventions);
  const entryCommand = normalizeOptionalString(value.entry_command);
  const manifestCommand = normalizeOptionalString(value.manifest_command);

  if (
    !agentId
    || !title
    || !description
    || !defaultEngine
    || !workspaceRequirement
    || !codexEntryStrategy
    || !artifactConventions
    || !progressConventions
    || !entryCommand
    || !manifestCommand
    || !requiredFields
    || !optionalFields
  ) {
    return null;
  }

  return {
    agent_id: agentId,
    title,
    description,
    default_engine: defaultEngine,
    workspace_requirement: workspaceRequirement,
    locator_schema: {
      required_fields: requiredFields,
      optional_fields: optionalFields,
    },
    codex_entry_strategy: codexEntryStrategy,
    artifact_conventions: artifactConventions,
    progress_conventions: progressConventions,
    entry_command: entryCommand,
    manifest_command: manifestCommand,
  };
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

function buildOplWorkspaceRootPayload(payload = buildFrontDeskWorkspaceRootSurface()) {
  return {
    version: 'g2' as const,
    workspace_root: {
      surface_id: 'opl_workspace_root',
      ...payload.workspace_root,
    },
  };
}

function buildOplSystemActionPayload(payload: Awaited<ReturnType<typeof runFrontDeskSystemAction>>) {
  return {
    version: 'g2' as const,
    system_action: {
      surface_id: 'opl_system_action',
      ...payload.frontdesk_system_action,
    },
  };
}

function buildOplSystemSnapshotFromFrontDeskEnvironment(
  environment: Awaited<ReturnType<typeof buildFrontDeskEnvironment>>['frontdesk_environment'],
) {
  return {
    surface_id: 'opl_system',
    overall_status: environment.overall_status,
    managed_paths: environment.managed_paths,
    local_service: {
      installed: environment.local_frontdesk.service_installed,
      loaded: environment.local_frontdesk.service_loaded,
      health_status: environment.local_frontdesk.service_health,
      gui_shell_strategy: environment.local_frontdesk.gui_shell_strategy,
    },
    core_engines: environment.core_engines,
    module_summary: environment.module_summary,
    notes: environment.notes,
  };
}

function buildOplSystemSettingsPayload(payload = readFrontDeskRuntimeModes()) {
  return {
    version: 'g2' as const,
    system_settings: {
      surface_id: 'opl_system_settings',
      ...payload,
    },
  };
}

function buildOplEngineActionPayload(payload: Awaited<ReturnType<typeof runFrontDeskEngineAction>>) {
  const { frontdesk_environment: environment, ...action } = payload.frontdesk_engine_action;

  return {
    version: 'g2' as const,
    engine_action: {
      surface_id: 'opl_engine_action',
      ...action,
      system: buildOplSystemSnapshotFromFrontDeskEnvironment(environment),
    },
  };
}

function buildOplModuleActionPayload(payload: ReturnType<typeof runFrontDeskModuleAction>) {
  return {
    version: 'g2' as const,
    module_action: {
      surface_id: 'opl_module_action',
      ...payload.frontdesk_module_action,
    },
  };
}

function buildOplModulesPayload(payload: ReturnType<typeof buildFrontDeskModules>, api: OplApiCatalog) {
  return {
    version: 'g2' as const,
    modules: {
      surface_id: 'opl_modules',
      modules_root: payload.frontdesk_modules.modules_root,
      summary: payload.frontdesk_modules.summary,
      items: payload.frontdesk_modules.modules,
      actions_endpoint: api.actions.modules,
      notes: payload.frontdesk_modules.notes,
    },
  };
}

function buildOplAgentsPayload(context: WebFrontDeskContext, api: OplApiCatalog) {
  const workspaceCatalog = buildWorkspaceCatalog(context.contracts).workspace_catalog;
  const resolvedManifestIndex = new Map(
    buildDomainManifestCatalog(context.contracts).domain_manifests.projects
      .filter((entry) => entry.status === 'resolved' && entry.manifest)
      .map((entry) => [entry.project_id, entry.manifest] as const),
  );
  const installedModules = buildFrontDeskModules().frontdesk_modules.modules;
  const moduleIndex = new Map(installedModules.map((entry) => [entry.module_id, entry]));
  const generalAgents = [
    {
      agent_id: 'general-chat',
      title: 'General Chat',
      description: 'Open a plain-language Codex conversation with optional temporary workspace context.',
      class: 'general',
      module_id: null,
      project_id: null,
      default_engine: 'codex',
      requires_workspace: false,
      availability: 'ready',
      health_status: 'ready',
      locator_fields: {
        required: [],
        optional: ['cwd'],
      },
      active_workspace_path: null,
      entry_spec: {
        entry_kind: 'codex_chat_session',
        workspace_requirement: 'ephemeral_allowed',
        locator_schema: {
          required_fields: [],
          optional_fields: ['cwd'],
        },
        codex_entry_strategy: 'direct_chat',
        artifact_conventions: 'optional_workspace_outputs',
        progress_conventions: 'session_activity_feed',
        command_template: 'codex',
        manifest_command_template: null,
      },
    },
    {
      agent_id: 'general-task',
      title: 'General Task',
      description: 'Run a general-purpose Codex task in a chosen working directory.',
      class: 'general',
      module_id: null,
      project_id: null,
      default_engine: 'codex',
      requires_workspace: true,
      availability: 'ready',
      health_status: 'ready',
      locator_fields: {
        required: ['cwd'],
        optional: [],
      },
      active_workspace_path: null,
      entry_spec: {
        entry_kind: 'codex_task_session',
        workspace_requirement: 'required',
        locator_schema: {
          required_fields: ['cwd'],
          optional_fields: [],
        },
        codex_entry_strategy: 'workspace_task',
        artifact_conventions: 'workspace_outputs',
        progress_conventions: 'session_task_cards',
        command_template: 'codex --cwd <cwd>',
        manifest_command_template: null,
      },
    },
  ];
  const domainAgents = workspaceCatalog.projects
    .filter((entry) => entry.project_id !== 'opl')
    .flatMap((entry) => {
      const blueprint = DOMAIN_AGENT_BLUEPRINTS[entry.project_id];
      const manifest = resolvedManifestIndex.get(entry.project_id);
      const exportedSpec = readDomainAgentEntrySpec(
        manifest?.domain_entry_contract?.domain_agent_entry_spec,
      );
      if (!blueprint && !exportedSpec) {
        return [];
      }

      const moduleId = blueprint?.module_id ?? entry.project_id;
      const moduleStatus = moduleIndex.get(moduleId);
      const requiresWorkspace =
        (exportedSpec?.workspace_requirement ?? 'required') !== 'none';
      const requiredFields = uniqueStrings([
        requiresWorkspace ? 'cwd' : null,
        ...entry.binding_contract.required_locator_fields,
        ...(exportedSpec?.locator_schema.required_fields ?? []),
      ]);
      const optionalFields = uniqueStrings([
        ...entry.binding_contract.optional_locator_fields,
        ...(exportedSpec?.locator_schema.optional_fields ?? []),
      ]);
      return [{
        agent_id: exportedSpec?.agent_id ?? blueprint?.agent_id,
        title: exportedSpec?.title ?? blueprint?.title,
        description: exportedSpec?.description ?? blueprint?.description,
        class: 'domain',
        module_id: moduleId,
        project_id: entry.project_id,
        default_engine: exportedSpec?.default_engine ?? 'codex',
        requires_workspace: requiresWorkspace,
        availability:
          moduleStatus?.health_status === 'ready'
            ? 'ready'
            : moduleStatus?.installed
              ? 'attention_needed'
              : 'install_available',
        health_status: moduleStatus?.health_status ?? 'missing',
        locator_fields: {
          required: requiredFields,
          optional: optionalFields,
        },
        active_workspace_path: entry.active_binding?.workspace_path ?? null,
        entry_spec: {
          entry_kind: 'domain_workspace_session',
          workspace_requirement: exportedSpec?.workspace_requirement ?? 'required',
          locator_schema: {
            required_fields: requiredFields,
            optional_fields: optionalFields,
          },
          codex_entry_strategy: exportedSpec?.codex_entry_strategy ?? 'domain_agent_entry',
          artifact_conventions: exportedSpec?.artifact_conventions ?? blueprint?.artifact_conventions,
          progress_conventions: exportedSpec?.progress_conventions ?? blueprint?.progress_conventions,
          entry_command: exportedSpec?.entry_command ?? null,
          manifest_command: exportedSpec?.manifest_command ?? null,
          command_template:
            entry.binding_contract.derived_entry_command_template ?? exportedSpec?.entry_command ?? null,
          manifest_command_template:
            entry.binding_contract.derived_manifest_command_template ?? exportedSpec?.manifest_command ?? null,
        },
      }];
    });
  const items = [...generalAgents, ...domainAgents];

  return {
    version: 'g2' as const,
    agents: {
      surface_id: 'opl_agents',
      summary: {
        total_agents_count: items.length,
        general_agents_count: generalAgents.length,
        domain_agents_count: domainAgents.length,
        workspace_required_agents_count: items.filter((entry) => entry.requires_workspace).length,
      },
      items,
      endpoints: {
        sessions: api.resources.sessions,
        workspaces: api.resources.workspaces,
        modules: api.resources.modules,
      },
      notes: [
        'Agents are the user-facing registry of reusable work modes exposed through OPL.',
        'General Chat and General Task map to Codex-native interaction patterns.',
        'Domain agents keep domain runtime ownership in their own repositories while OPL exposes one launcher registry.',
      ],
    },
  };
}

function buildOplWorkspacesPayload(payload: ReturnType<typeof buildWorkspaceCatalog>, api: OplApiCatalog) {
  return {
    version: 'g2' as const,
    workspaces: {
      surface_id: 'opl_workspaces',
      action: payload.workspace_catalog.action,
      state_dir: payload.workspace_catalog.state_dir,
      binding: payload.workspace_catalog.binding,
      summary: payload.workspace_catalog.summary,
      projects: payload.workspace_catalog.projects,
      bindings: payload.workspace_catalog.bindings,
      endpoints: {
        workspace_root: api.actions.workspace_root,
        bind: api.actions.workspace_bind,
        activate: api.actions.workspace_activate,
        archive: api.actions.workspace_archive,
      },
      notes: payload.workspace_catalog.notes,
    },
  };
}

async function buildOplSystemPayload(context: WebFrontDeskContext, api: OplApiCatalog) {
  const environment = await buildFrontDeskEnvironment(context.contracts);
  const workspaceRoot = buildOplWorkspaceRootPayload();
  const updateChannel = readFrontDeskUpdateChannel();
  const runtimeModes = readFrontDeskRuntimeModes();
  const systemSnapshot = buildOplSystemSnapshotFromFrontDeskEnvironment(environment.frontdesk_environment);

  return {
    version: 'g2' as const,
    system: {
      ...systemSnapshot,
      product_name: 'OPL',
      runtime_substrate: 'external_hermes_kernel',
      runtime_modes: runtimeModes,
      workspace_root: workspaceRoot.workspace_root,
      update_channel: {
        channel: updateChannel.channel,
        updated_at: updateChannel.updated_at,
      },
      endpoints: {
        system_initialize: api.actions.system_initialize,
        settings: api.actions.system_settings,
        engines: api.resources.engines,
        modules: api.resources.modules,
        agents: api.resources.agents,
        workspaces: api.resources.workspaces,
        sessions: api.resources.sessions,
        progress: api.resources.progress,
        artifacts: api.resources.artifacts,
        system_actions: api.actions.system,
        workspace_root: api.actions.workspace_root,
      },
      notes: [
        'System keeps the product-level runtime truth for OPL Desktop and GUI overlays.',
        'Workspace root, update channel, and runtime modes remain OPL-managed shared state.',
      ],
    },
  };
}

async function buildOplSystemInitializePayload(context: WebFrontDeskContext, api: OplApiCatalog) {
  const payload = await buildFrontDeskInitialize(context.contracts);
  const domainModules = payload.frontdesk_initialize.domain_modules;
  const recommendedNextActionEndpoint =
    payload.frontdesk_initialize.recommended_next_action.action_id === 'set_workspace_root'
      ? api.actions.workspace_root
      : api.actions.system_initialize;

  return {
    version: 'g2' as const,
    system_initialize: {
      surface_id: 'opl_system_initialize',
      overall_state: payload.frontdesk_initialize.overall_state,
      checklist: payload.frontdesk_initialize.checklist,
      core_engines: payload.frontdesk_initialize.core_engines,
      domain_modules: {
        surface_id: 'opl_modules',
        modules_root: domainModules.modules_root,
        summary: domainModules.summary,
        modules: domainModules.modules,
        notes: domainModules.notes,
      },
      settings: {
        ...payload.frontdesk_initialize.settings,
        endpoint: api.actions.system_settings,
        action_endpoint: api.actions.system_settings,
      },
      workspace_root: {
        ...payload.frontdesk_initialize.workspace_root,
        endpoint: api.actions.workspace_root,
        action_endpoint: api.actions.workspace_root,
      },
      system: {
        update_channel: payload.frontdesk_initialize.system.update_channel,
        local_service: payload.frontdesk_initialize.system.local_frontdesk,
        actions: payload.frontdesk_initialize.system.actions.map((entry) => ({
          ...entry,
          endpoint: api.actions.system,
        })),
      },
      endpoints: {
        system_initialize: api.actions.system_initialize,
        system: api.resources.system,
        modules: api.resources.modules,
        settings: api.actions.system_settings,
        engine_action: api.actions.engines,
        workspace_root: api.actions.workspace_root,
        system_action: api.actions.system,
      },
      recommended_next_action: {
        ...payload.frontdesk_initialize.recommended_next_action,
        endpoint: recommendedNextActionEndpoint,
      },
      notes: payload.frontdesk_initialize.notes,
    },
  };
}

async function buildOplEnginesPayload(context: WebFrontDeskContext, api: OplApiCatalog) {
  const environment = await buildFrontDeskEnvironment(context.contracts);
  const runtimeModes = readFrontDeskRuntimeModes();
  const items = [
    {
      engine_id: 'codex' as const,
      ...environment.frontdesk_environment.core_engines.codex,
    },
    {
      engine_id: 'hermes' as const,
      ...environment.frontdesk_environment.core_engines.hermes,
    },
  ];

  return {
    version: 'g2' as const,
    engines: {
      surface_id: 'opl_engines',
      default_modes: runtimeModes,
      summary: {
        total_engines_count: items.length,
        installed_engines_count: items.filter((entry) => entry.installed).length,
        healthy_engines_count: items.filter((entry) => entry.health_status === 'ready').length,
      },
      items,
      actions_endpoint: api.actions.engines,
      notes: [
        'Codex is the default interaction and execution engine.',
        'Hermes stays available as a backup engine and long-running gateway surface.',
      ],
    },
  };
}

function buildOplSessionsPayload(
  productEntrySessions: ReturnType<typeof runProductEntrySessions>,
  sessionLedger: ReturnType<typeof buildSessionLedger>,
  api: OplApiCatalog,
  currentProgress: Awaited<ReturnType<typeof readOplProgressBrief>> | null,
) {
  const continuitySession = isRecord(currentProgress?.runtime_continuity?.session)
    ? currentProgress.runtime_continuity.session
    : null;
  const continuityControl = isRecord(currentProgress?.runtime_continuity?.control)
    ? currentProgress.runtime_continuity.control
    : null;
  const runtimeInventory = isRecord(currentProgress?.runtime_continuity?.runtime_inventory)
    ? currentProgress.runtime_continuity.runtime_inventory
    : null;
  return {
    version: 'g2' as const,
    sessions: {
      surface_id: 'opl_sessions',
      summary: {
        requested_limit: productEntrySessions.product_entry.limit,
        source_filter: productEntrySessions.product_entry.source_filter,
        listed_sessions_count: productEntrySessions.product_entry.sessions.length,
        ledger_sessions_count: sessionLedger.session_ledger.sessions.length,
        ledger_entry_count: sessionLedger.session_ledger.summary.entry_count,
      },
      items: productEntrySessions.product_entry.sessions,
      raw_output: productEntrySessions.product_entry.raw_output,
      ledger: sessionLedger.session_ledger,
      endpoints: {
        create: api.actions.session_create,
        resume: api.actions.session_resume,
        logs: api.actions.session_logs,
        progress: api.resources.progress,
        artifacts: api.resources.artifacts,
      },
      current_runtime_continuity: continuitySession || continuityControl || runtimeInventory
        ? {
            project_id: currentProgress?.current_project?.project_id ?? null,
            domain_agent_id:
              typeof continuitySession?.domain_agent_id === 'string'
                ? continuitySession.domain_agent_id
                : typeof continuityControl?.domain_agent_id === 'string'
                  ? continuityControl.domain_agent_id
                  : null,
            session_id:
              typeof continuitySession?.session_id === 'string'
                ? continuitySession.session_id
                : typeof continuityControl?.session_id === 'string'
                  ? continuityControl.session_id
                  : null,
            runtime_owner:
              typeof continuitySession?.runtime_owner === 'string'
                ? continuitySession.runtime_owner
                : typeof continuityControl?.runtime_owner === 'string'
                  ? continuityControl.runtime_owner
                : typeof runtimeInventory?.runtime_owner === 'string'
                  ? runtimeInventory.runtime_owner
                  : null,
            domain_owner:
              typeof continuitySession?.domain_owner === 'string'
                ? continuitySession.domain_owner
                : typeof continuityControl?.domain_owner === 'string'
                  ? continuityControl.domain_owner
                : typeof runtimeInventory?.domain_owner === 'string'
                  ? runtimeInventory.domain_owner
                  : null,
            executor_owner:
              typeof continuitySession?.executor_owner === 'string'
                ? continuitySession.executor_owner
                : typeof continuityControl?.executor_owner === 'string'
                  ? continuityControl.executor_owner
                : typeof runtimeInventory?.executor_owner === 'string'
                  ? runtimeInventory.executor_owner
                  : null,
            progress_surface:
              continuitySession?.progress_surface
              ?? continuityControl?.control_surfaces?.progress
              ?? null,
            artifact_surface:
              continuitySession?.artifact_surface
              ?? continuityControl?.control_surfaces?.artifact_pickup
              ?? null,
            restore_surface:
              continuitySession?.restore_surface
              ?? continuityControl?.control_surfaces?.resume
              ?? null,
            runtime_control: continuityControl ?? null,
          }
        : null,
      notes: [
        'Session list is sourced from the active executor runtime.',
        'Session ledger is OPL-managed attribution for local workspace and resource context.',
      ],
    },
  };
}

async function readOplProgressBrief(
  context: WebFrontDeskContext,
  workspacePath?: string,
) {
  return (await buildProjectProgressBrief(context.contracts, {
    workspacePath: workspacePath ?? context.workspacePath,
    sessionsLimit: context.sessionsLimit,
    basePath: context.basePath,
  })).project_progress;
}

async function buildOplProgressPayload(
  context: WebFrontDeskContext,
  api: OplApiCatalog,
  options: {
    workspacePath?: string;
    sessionId?: string;
    taskId?: string;
    lines?: number;
  } = {},
) {
  const progress = await readOplProgressBrief(context, options.workspacePath);
  const taskPayload = options.taskId
    ? readFrontDeskTaskStatus(options.taskId, options.lines ?? 20).product_entry.task
    : null;
  const continuitySession = isRecord(progress.runtime_continuity?.session)
    ? progress.runtime_continuity.session
    : null;
  const continuityControl = isRecord(progress.runtime_continuity?.control)
    ? progress.runtime_continuity.control
    : null;
  const continuityProgress = isRecord(progress.runtime_continuity?.progress)
    ? progress.runtime_continuity.progress
    : null;
  const runtimeInventory = isRecord(progress.runtime_continuity?.runtime_inventory)
    ? progress.runtime_continuity.runtime_inventory
    : null;
  return {
    version: 'g2' as const,
    progress: {
      surface_id: 'opl_progress',
      session_id:
        options.sessionId
        ?? (isRecord(progress.recent_activity) && typeof progress.recent_activity.session_id === 'string'
          ? progress.recent_activity.session_id
          : null),
      workspace_path: progress.current_project.workspace_path,
      project_state: progress.project_state,
      current_project: progress.current_project,
      headline: progress.progress_feedback.headline,
      latest_update: progress.progress_feedback.latest_update,
      next_step: progress.progress_feedback.next_step,
      status_summary: progress.progress_feedback.status_summary,
      study: progress.current_study ?? null,
      task: taskPayload,
      task_cards: progress.workspace_inbox.sections,
      recent_activity: progress.recent_activity,
      inspect_paths: progress.inspect_paths,
      attention_items: progress.attention_items,
      configured_human_gates: progress.configured_human_gates,
      domain_agent_id:
        typeof continuitySession?.domain_agent_id === 'string' ? continuitySession.domain_agent_id : null,
      runtime_owner:
        typeof continuitySession?.runtime_owner === 'string'
          ? continuitySession.runtime_owner
          : typeof runtimeInventory?.runtime_owner === 'string'
            ? runtimeInventory.runtime_owner
            : null,
      domain_owner:
        typeof continuitySession?.domain_owner === 'string'
          ? continuitySession.domain_owner
          : typeof runtimeInventory?.domain_owner === 'string'
            ? runtimeInventory.domain_owner
            : null,
      executor_owner:
        typeof continuitySession?.executor_owner === 'string'
          ? continuitySession.executor_owner
          : typeof runtimeInventory?.executor_owner === 'string'
            ? runtimeInventory.executor_owner
            : null,
      repo_progress_projection: continuityProgress ?? null,
      repo_runtime_control: continuityControl ?? null,
      restore_surface:
        continuitySession?.restore_surface
        ?? progress.runtime_continuity?.task_lifecycle?.resume_surface
        ?? null,
      approval_surface: continuityControl?.control_surfaces?.approval ?? null,
      interrupt_surface: continuityControl?.control_surfaces?.interrupt ?? null,
      artifact_surface:
        continuityProgress?.artifact_surface
        ?? continuitySession?.artifact_surface
        ?? null,
      recommended_commands: progress.recommended_commands,
      endpoints: {
        sessions: api.resources.sessions,
        artifacts: api.resources.artifacts,
      },
      notes: [
        'Progress is the plain-language session and workspace narration surface for the GUI.',
        'Task cards are derived from workspace inbox sections so side panels can group running, waiting, ready, and delivered work.',
      ],
    },
  };
}

async function buildOplArtifactsPayload(
  context: WebFrontDeskContext,
  api: OplApiCatalog,
  options: {
    workspacePath?: string;
    sessionId?: string;
  } = {},
) {
  const progress = await readOplProgressBrief(context, options.workspacePath);
  const deliverableFiles = progress.workspace_files.deliverable_files;
  const supportingFiles = progress.workspace_files.supporting_files;
  const continuitySession = isRecord(progress.runtime_continuity?.session)
    ? progress.runtime_continuity.session
    : null;
  const continuityControl = isRecord(progress.runtime_continuity?.control)
    ? progress.runtime_continuity.control
    : null;
  const continuityArtifacts = isRecord(progress.runtime_continuity?.artifacts)
    ? progress.runtime_continuity.artifacts
    : null;
  const runtimeInventory = isRecord(progress.runtime_continuity?.runtime_inventory)
    ? progress.runtime_continuity.runtime_inventory
    : null;

  return {
    version: 'g2' as const,
    artifacts: {
      surface_id: 'opl_artifacts',
      session_id:
        options.sessionId
        ?? (isRecord(progress.recent_activity) && typeof progress.recent_activity.session_id === 'string'
          ? progress.recent_activity.session_id
          : null),
      workspace_path: progress.current_project.workspace_path,
      current_project: progress.current_project,
      summary: {
        deliverable_files_count: deliverableFiles.length,
        supporting_files_count: supportingFiles.length,
        total_files_count: deliverableFiles.length + supportingFiles.length,
      },
      deliverable_files: deliverableFiles,
      supporting_files: supportingFiles,
      inspect_paths: progress.inspect_paths,
      progress_headline: progress.progress_feedback.headline,
      domain_agent_id:
        typeof continuitySession?.domain_agent_id === 'string' ? continuitySession.domain_agent_id : null,
      runtime_owner:
        typeof continuitySession?.runtime_owner === 'string'
          ? continuitySession.runtime_owner
          : typeof runtimeInventory?.runtime_owner === 'string'
            ? runtimeInventory.runtime_owner
            : null,
      domain_owner:
        typeof continuitySession?.domain_owner === 'string'
          ? continuitySession.domain_owner
          : typeof runtimeInventory?.domain_owner === 'string'
            ? runtimeInventory.domain_owner
            : null,
      executor_owner:
        typeof continuitySession?.executor_owner === 'string'
          ? continuitySession.executor_owner
          : typeof runtimeInventory?.executor_owner === 'string'
            ? runtimeInventory.executor_owner
            : null,
      artifact_surface:
        continuityArtifacts?.artifact_surface
        ?? continuitySession?.artifact_surface
        ?? null,
      artifact_pickup_surface:
        continuityControl?.control_surfaces?.artifact_pickup
        ?? continuityArtifacts?.artifact_surface
        ?? continuitySession?.artifact_surface
        ?? null,
      repo_artifact_inventory: continuityArtifacts ?? null,
      repo_runtime_control: continuityControl ?? null,
      endpoints: {
        progress: api.resources.progress,
        sessions: api.resources.sessions,
      },
      notes: [
        'Artifacts are grouped into deliverable files and supporting files for the right-side file panel.',
        'This surface stays workspace-centric because final delivery is file-based across OPL product modes.',
      ],
    },
  };
}

function buildStartupPayload(context: WebFrontDeskContext): WebFrontDeskStartupPayload {
  const api = buildOplApiCatalog(context.basePath);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: context.contracts.contractsDir,
      contracts_root_source: context.contracts.contractsRootSource,
    },
    opl_api: {
      surface_id: 'opl_product_api_bootstrap',
      entry_surface: 'opl_product_api',
      runtime_substrate: 'external_hermes_kernel',
      mode: 'local_product_api_adapter',
      local_shell_command: 'opl web',
      local_only: true,
      listening: {
        host: context.host,
        port: context.port,
        base_url: context.baseUrl,
        entry_url: context.entryUrl,
        base_path: context.basePath,
      },
      resources: api.resources,
      actions: api.actions,
      debug: api.debug,
      runtime_modes: readFrontDeskRuntimeModes(),
      defaults: {
        workspace_path: context.workspacePath,
        sessions_limit: context.sessionsLimit,
      },
      recommended_gui_overlay: 'aionui_shell',
      notes: [
        'This bootstrap surface exposes the current OPL Product API for external GUI overlays.',
        'System, engines, modules, agents, workspaces, sessions, progress, and artifacts are available as first-class resources.',
        'OPL main repo stays headless while external overlays consume this product API.',
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
      'module action requires action=install|update|reinstall|remove.',
      {
        action: body.action ?? null,
      },
      2,
    );
  }

  if (!moduleId) {
    throw new GatewayContractError(
      'cli_usage_error',
      'module action requires module_id.',
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

function normalizeFrontDeskEngineActionInput(body: FrontDeskEngineActionRequestBody) {
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  const engineId =
    typeof body.engine_id === 'string' && body.engine_id.trim().length > 0
      ? body.engine_id.trim()
      : typeof body.engineId === 'string' && body.engineId.trim().length > 0
        ? body.engineId.trim()
        : '';

  if (!action || !['install', 'update', 'reinstall', 'remove'].includes(action)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'engine action requires action=install|update|reinstall|remove.',
      {
        action: body.action ?? null,
      },
      2,
    );
  }

  if (!engineId) {
    throw new GatewayContractError(
      'cli_usage_error',
      'engine action requires engine_id.',
      {
        engine_id: body.engine_id ?? body.engineId ?? null,
      },
      2,
    );
  }

  return {
    action: action as FrontDeskEngineAction,
    engineId,
  };
}

function normalizeFrontDeskSystemActionInput(body: FrontDeskSystemActionRequestBody) {
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  if (!action || !['repair', 'reinstall_support', 'update_channel'].includes(action)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'system action requires action=repair|reinstall_support|update_channel.',
      {
        action: body.action ?? null,
      },
      2,
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
        'system action requires port to be an integer between 0 and 65535.',
        {
          port: portValue,
        },
        2,
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
        'system action requires sessions_limit to be a positive integer.',
        {
          sessions_limit: sessionsLimitValue,
        },
        2,
      );
    }
    sessionsLimit = parsed;
  }

  const channel = normalizeOptionalString(body.channel);
  if (channel && channel !== 'stable' && channel !== 'preview') {
    throw new GatewayContractError(
      'cli_usage_error',
      'system action update_channel accepts stable or preview.',
      {
        channel,
      },
      2,
    );
  }

  return {
    action: action as FrontDeskSystemAction,
    channel: channel as 'stable' | 'preview' | undefined,
    host: normalizeOptionalString(body.host),
    port,
    workspacePath:
      normalizeOptionalString(body.workspacePath) ?? normalizeOptionalString(body.workspace_path),
    sessionsLimit,
    basePath: normalizeOptionalString(body.basePath) ?? normalizeOptionalString(body.base_path),
  };
}

function normalizeWorkspaceRootInput(body: WorkspaceRootRequestBody) {
  const selectedPath =
    normalizeOptionalString(body.path)
    ?? normalizeOptionalString(body.workspaceRoot)
    ?? normalizeOptionalString(body.workspace_root);

  if (!selectedPath) {
    throw new GatewayContractError(
      'cli_usage_error',
      'workspace root requests require a non-empty path.',
      {
        required: ['path'],
      },
      2,
    );
  }

  return {
    path: selectedPath,
  };
}

function buildWebFrontDeskRootPayload(context: WebFrontDeskContext) {
  const bootstrap = buildStartupPayload(context);

  return {
    version: 'g2',
    contracts_context: bootstrap.contracts_context,
    opl_api: {
      surface_id: 'opl_product_api_root',
      entry_surface: bootstrap.opl_api.entry_surface,
      runtime_substrate: bootstrap.opl_api.runtime_substrate,
      mode: 'api_only',
      local_shell_command: bootstrap.opl_api.local_shell_command,
      shell_integration_target: 'external_gui_overlay',
      summary: 'OPL serves headless product API resources for external GUI overlays and desktop shells.',
      listening: bootstrap.opl_api.listening,
      resources: bootstrap.opl_api.resources,
      actions: bootstrap.opl_api.actions,
      debug: bootstrap.opl_api.debug,
      defaults: bootstrap.opl_api.defaults,
      runtime_modes: bootstrap.opl_api.runtime_modes,
      recommended_gui_overlay: 'aionui_shell',
      notes: [
        'Use an external GUI overlay to consume these product API resources.',
        'OPL main repo now stays headless and contract-first.',
        'Debug and legacy routes remain internal implementation details while the public product API keeps stabilizing.',
      ],
    },
  };
}

function writeApiError(response: ServerResponse<IncomingMessage>, error: unknown) {
  if (error instanceof GatewayContractError) {
    writeJson(response, error.exitCode === 2 ? 400 : 500, error.toJSON());
    return;
  }

  const unexpected = new GatewayContractError(
    'hermes_command_failed',
    error instanceof Error ? error.message : 'Unexpected OPL web API failure.',
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
  const routedApi = buildOplApiCatalog();
  const advertisedApi = buildOplApiCatalog(context.basePath);

  try {
    if (routedPath === null) {
      writeJson(response, 404, {
        version: 'g2',
        error: {
          code: 'unknown_command',
          message: `Unknown OPL web route: ${method} ${url.pathname}`,
          exit_code: 2,
        },
      });
      return;
    }

    if (method === 'GET' && routedPath === '/') {
      writeJson(response, 200, buildWebFrontDeskRootPayload(context));
      return;
    }

    if (method === 'GET' && routedPath === routedApi.resources.system) {
      writeJson(response, 200, await buildOplSystemPayload(context, advertisedApi));
      return;
    }

    if (method === 'GET' && routedPath === routedApi.actions.system_initialize) {
      writeJson(response, 200, await buildOplSystemInitializePayload(context, advertisedApi));
      return;
    }

    if (method === 'GET' && routedPath === routedApi.actions.system_settings) {
      writeJson(response, 200, buildOplSystemSettingsPayload());
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.system_settings) {
      const body = (await readJsonBody(request)) as FrontDeskSettingsRequestBody;
      writeJson(
        response,
        200,
        buildOplSystemSettingsPayload(writeFrontDeskRuntimeModes(normalizeFrontDeskSettingsInput(body))),
      );
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.system) {
      const body = (await readJsonBody(request)) as FrontDeskSystemActionRequestBody;
      const normalized = normalizeFrontDeskSystemActionInput(body);
      writeJson(
        response,
        200,
        buildOplSystemActionPayload(
          await runFrontDeskSystemAction(context.contracts, normalized.action, normalized),
        ),
      );
      return;
    }

    if (method === 'GET' && routedPath === routedApi.resources.engines) {
      writeJson(response, 200, await buildOplEnginesPayload(context, advertisedApi));
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.engines) {
      const body = (await readJsonBody(request)) as FrontDeskEngineActionRequestBody;
      const normalized = normalizeFrontDeskEngineActionInput(body);
      writeJson(
        response,
        200,
        buildOplEngineActionPayload(
          await runFrontDeskEngineAction(context.contracts, normalized.action, normalized.engineId),
        ),
      );
      return;
    }

    if (method === 'GET' && routedPath === routedApi.resources.modules) {
      writeJson(response, 200, buildOplModulesPayload(buildFrontDeskModules(), advertisedApi));
      return;
    }

    if (method === 'GET' && routedPath === routedApi.resources.agents) {
      writeJson(response, 200, buildOplAgentsPayload(context, advertisedApi));
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.modules) {
      const body = (await readJsonBody(request)) as FrontDeskModuleActionRequestBody;
      const normalized = normalizeFrontDeskModuleActionInput(body);
      writeJson(response, 200, buildOplModuleActionPayload(runFrontDeskModuleAction(normalized.action, normalized.moduleId)));
      return;
    }

    if (method === 'GET' && routedPath === routedApi.resources.workspaces) {
      writeJson(response, 200, buildOplWorkspacesPayload(buildWorkspaceCatalog(context.contracts), advertisedApi));
      return;
    }

    if (method === 'GET' && routedPath === routedApi.actions.workspace_root) {
      writeJson(response, 200, buildOplWorkspaceRootPayload());
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.workspace_root) {
      writeJson(
        response,
        200,
        buildOplWorkspaceRootPayload(
          writeFrontDeskWorkspaceRootSurface(
            normalizeWorkspaceRootInput((await readJsonBody(request)) as WorkspaceRootRequestBody).path,
          ),
        ),
      );
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.workspace_bind) {
      writeJson(
        response,
        200,
        buildOplWorkspacesPayload(
          bindWorkspace(context.contracts, normalizeWorkspaceRegistryInput(await readJsonBody(request))),
          advertisedApi,
        ),
      );
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.workspace_activate) {
      writeJson(
        response,
        200,
        buildOplWorkspacesPayload(
          activateWorkspaceBinding(context.contracts, normalizeWorkspaceRegistryInput(await readJsonBody(request))),
          advertisedApi,
        ),
      );
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.workspace_archive) {
      writeJson(
        response,
        200,
        buildOplWorkspacesPayload(
          archiveWorkspaceBinding(context.contracts, normalizeWorkspaceRegistryInput(await readJsonBody(request))),
          advertisedApi,
        ),
      );
      return;
    }

    if (method === 'GET' && routedPath === routedApi.resources.sessions) {
      const sessionsPayload = runProductEntrySessions({
        limit: parsePositiveIntegerOptional(url.searchParams.get('limit')) ?? context.sessionsLimit,
        source: normalizeOptionalString(url.searchParams.get('source')),
      });
      const ledgerPayload = buildSessionLedger(
        parsePositiveIntegerOptional(url.searchParams.get('limit')) ?? context.sessionsLimit,
      );
      writeJson(
        response,
        200,
        buildOplSessionsPayload(
          sessionsPayload,
          ledgerPayload,
          advertisedApi,
          await readOplProgressBrief(context, context.workspacePath),
        ),
      );
      return;
    }

    if (method === 'GET' && routedPath === routedApi.resources.progress) {
      writeJson(
        response,
        200,
        await buildOplProgressPayload(context, advertisedApi, {
          workspacePath: normalizeOptionalString(url.searchParams.get('workspace_path')),
          sessionId: normalizeOptionalString(url.searchParams.get('session_id')),
          taskId: normalizeOptionalString(url.searchParams.get('task_id')),
          lines: parsePositiveIntegerOptional(url.searchParams.get('lines')),
        }),
      );
      return;
    }

    if (method === 'GET' && routedPath === routedApi.resources.artifacts) {
      writeJson(
        response,
        200,
        await buildOplArtifactsPayload(context, advertisedApi, {
          workspacePath: normalizeOptionalString(url.searchParams.get('workspace_path')),
          sessionId: normalizeOptionalString(url.searchParams.get('session_id')),
        }),
      );
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.session_create) {
      const body = (await readJsonBody(request)) as AskRequestBody;
      const normalizedInput = {
        ...normalizeAskInput(body),
        executor: readFrontDeskRuntimeModes().interaction_mode,
      };
      const payload = normalizedInput.dryRun
        ? runProductEntryAsk(normalizedInput, context.contracts)
        : submitFrontDeskAskTask(normalizedInput, context.contracts);
      writeJson(response, 200, {
        version: 'g2',
        session_create: {
          surface_id: 'opl_session_create',
          request_mode: normalizedInput.dryRun ? 'dry_run' : 'submitted',
          payload,
        },
      });
      return;
    }

    if (method === 'POST' && routedPath === routedApi.actions.session_resume) {
      const body = (await readJsonBody(request)) as ResumeRequestBody;
      const payload = runProductEntryResume(normalizeResumeSessionId(body));
      writeJson(response, 200, {
        version: 'g2',
        session_resume: {
          surface_id: 'opl_session_resume',
          ...payload.product_entry,
        },
      });
      return;
    }

    if (method === 'GET' && routedPath === routedApi.actions.session_logs) {
      const payload = runProductEntryLogs({
        logName: normalizeOptionalString(url.searchParams.get('log_name')),
        lines: parsePositiveIntegerOptional(url.searchParams.get('lines')),
        since: normalizeOptionalString(url.searchParams.get('since')),
        level: normalizeOptionalString(url.searchParams.get('level')),
        component: normalizeOptionalString(url.searchParams.get('component')),
        sessionId:
          normalizeOptionalString(url.searchParams.get('session_id'))
          ?? normalizeOptionalString(url.searchParams.get('session')),
      });
      writeJson(response, 200, {
        version: 'g2',
        session_logs: {
          surface_id: 'opl_session_logs',
          ...payload.product_entry,
        },
      });
      return;
    }

    if (method === 'GET' && routedPath === routedApi.actions.start) {
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

    if (method === 'POST' && routedPath === routedApi.actions.launch_domain) {
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

    if (method === 'POST' && routedPath === routedApi.actions.handoff_envelope) {
      const body = (await readJsonBody(request)) as AskRequestBody;
      writeJson(response, 200, buildProductEntryHandoffEnvelope(normalizeAskInput(body), context.contracts));
      return;
    }

    if (method === 'GET' && routedPath === routedApi.actions.web_bundle) {
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

    if (method === 'POST' && routedPath === routedApi.actions.web_package) {
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

    if (method === 'GET' && routedPath === '/api/health') {
      writeJson(response, 200, buildFrontDeskHealth(context.contracts, { basePath: context.basePath }));
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

    if (method === 'GET' && routedPath === '/api/domain/manifests') {
      writeJson(response, 200, buildDomainManifestCatalog(context.contracts));
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

    writeJson(response, 404, {
      version: 'g2',
      error: {
        code: 'unknown_command',
        message: `Unknown OPL web route: ${method} ${url.pathname}`,
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
