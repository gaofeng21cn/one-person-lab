import {
  buildFrontDeskInitialize,
  buildFrontDeskEnvironment,
  buildFrontDeskModules,
  runFrontDeskEngineAction,
  runFrontDeskModuleAction,
  runFrontDeskSystemAction,
} from '../frontdesk-installation.ts';
import { buildOplApiCatalog, type OplApiCatalog } from '../opl-api-paths.ts';
import {
  buildProjectProgressBrief,
} from '../management.ts';
import { buildDomainManifestCatalog } from '../domain-manifest.ts';
import { readFrontDeskRuntimeModes } from '../frontdesk-runtime-modes.ts';
import { readFrontDeskUpdateChannel } from '../frontdesk-preferences.ts';
import {
  readFrontDeskTaskStatus,
  readLatestFrontDeskTaskProjection,
} from '../frontdesk-task-store.ts';
import { runProductEntrySessions } from '../product-entry.ts';
import { buildSessionLedger } from '../session-ledger.ts';
import {
  pickSkillActivationProjection,
} from '../family-domain-catalog.ts';
import {
  activateWorkspaceBinding,
  archiveWorkspaceBinding,
  bindWorkspace,
  buildWorkspaceCatalog,
} from '../workspace-registry.ts';

import { normalizeOptionalString } from './normalization.ts';
import { buildOplWorkspaceRootPayload } from './root-payloads.ts';
import type { WebFrontDeskContext } from './types.ts';

type RecommendedEntrySurface = Record<string, unknown>;

type DomainAgentBlueprint = {
  agent_id: 'mas' | 'mag' | 'rca';
  module_id: 'medautoscience' | 'medautogrant' | 'redcube';
  plugin_name: 'med-autoscience' | 'med-autogrant' | 'redcube-ai';
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
    plugin_name: 'med-autoscience',
    title: 'Med Auto Science',
    description: 'Medical research and paper production inside a MAS workspace.',
    artifact_conventions: 'paper_and_submission_package',
    progress_conventions: 'study_runtime_narration',
  },
  medautogrant: {
    agent_id: 'mag',
    module_id: 'medautogrant',
    plugin_name: 'med-autogrant',
    title: 'Med Auto Grant',
    description: 'Grant-writing and revision workflows inside a MAG workspace.',
    artifact_conventions: 'grant_proposal_package',
    progress_conventions: 'grant_workloop_narration',
  },
  redcube: {
    agent_id: 'rca',
    module_id: 'redcube',
    plugin_name: 'redcube-ai',
    title: 'RedCube AI',
    description: 'Presentation and visual-deliverable workflows inside a RedCube workspace.',
    artifact_conventions: 'deck_and_visual_delivery',
    progress_conventions: 'deliverable_build_narration',
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function pickPreferredLaunchStrategy(entry: RecommendedEntrySurface | null) {
  if (!entry) {
    return null;
  }

  const locator = getRecommendedEntryLocator(entry);
  if (locator.url) {
    return 'open_url' as const;
  }

  if (locator.command) {
    return 'spawn_command' as const;
  }

  return null;
}

export function buildOplSystemActionPayload(payload: Awaited<ReturnType<typeof runFrontDeskSystemAction>>) {
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

export function buildOplSystemSettingsPayload(payload = readFrontDeskRuntimeModes()) {
  return {
    version: 'g2' as const,
    system_settings: {
      surface_id: 'opl_system_settings',
      ...payload,
    },
  };
}

export function buildOplEngineActionPayload(payload: Awaited<ReturnType<typeof runFrontDeskEngineAction>>) {
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

export function buildOplModuleActionPayload(payload: ReturnType<typeof runFrontDeskModuleAction>) {
  return {
    version: 'g2' as const,
    module_action: {
      surface_id: 'opl_module_action',
      ...payload.frontdesk_module_action,
    },
  };
}

export function buildOplModulesPayload(payload: ReturnType<typeof buildFrontDeskModules>, api: OplApiCatalog) {
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

export function buildOplAgentsPayload(context: WebFrontDeskContext, api: OplApiCatalog) {
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
      const skillActivation = pickSkillActivationProjection(manifest ?? null);
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
      const entryCommand = skillActivation?.entry_command ?? exportedSpec?.entry_command ?? null;
      const activationKind =
        skillActivation?.activation_kind
        ?? (entry.active_binding?.direct_entry.url ? 'open_url' : entryCommand ? 'shell_command' : null);
      return [{
        agent_id: exportedSpec?.agent_id ?? blueprint?.agent_id,
        title: skillActivation?.title ?? exportedSpec?.title ?? blueprint?.title,
        description: skillActivation?.description ?? exportedSpec?.description ?? blueprint?.description,
        class: 'domain',
        module_id: moduleId,
        project_id: entry.project_id,
        skill_id: skillActivation?.skill_id ?? null,
        plugin_name: skillActivation?.plugin_name ?? blueprint?.plugin_name ?? null,
        skill_semantics: skillActivation?.skill_semantics ?? null,
        activation_kind: activationKind,
        target_surface_kind: skillActivation?.target_surface_kind ?? null,
        entry_shell_key: skillActivation?.entry_shell_key ?? null,
        entry_command: entryCommand,
        supporting_shell_keys: skillActivation?.supporting_shell_keys ?? [],
        shell_commands: skillActivation?.shell_commands ?? {},
        runtime_continuity: skillActivation?.runtime_continuity ?? null,
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
          codex_entry_strategy:
            skillActivation?.entry_command
              ? 'skill_activation_projection'
              : exportedSpec?.codex_entry_strategy ?? 'domain_agent_entry',
          artifact_conventions: exportedSpec?.artifact_conventions ?? blueprint?.artifact_conventions,
          progress_conventions: exportedSpec?.progress_conventions ?? blueprint?.progress_conventions,
          entry_command: entryCommand,
          manifest_command: exportedSpec?.manifest_command ?? null,
          command_template:
            entry.binding_contract.derived_entry_command_template ?? entryCommand,
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
        'Domain agents stay skill-backed and repo-owned while OPL only projects one shared activation registry.',
      ],
    },
  };
}

export function buildOplWorkspacesPayload(payload: ReturnType<typeof buildWorkspaceCatalog>, api: OplApiCatalog) {
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

export async function buildOplSystemPayload(context: WebFrontDeskContext, api: OplApiCatalog) {
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

export async function buildOplSystemInitializePayload(context: WebFrontDeskContext, api: OplApiCatalog) {
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
      recommended_skills: payload.frontdesk_initialize.recommended_skills,
      gui_shell: payload.frontdesk_initialize.gui_shell,
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

export async function buildOplEnginesPayload(context: WebFrontDeskContext, api: OplApiCatalog) {
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

type OplRuntimeContinuityProjection = {
  project_id: string | null;
  session_id: string | null;
  domain_agent_id: string | null;
  runtime_owner: string | null;
  domain_owner: string | null;
  executor_owner: string | null;
  runtime_control: Record<string, unknown> | null;
  session_continuity: Record<string, unknown> | null;
  progress_projection: Record<string, unknown> | null;
  artifact_inventory: Record<string, unknown> | null;
  runtime_inventory: Record<string, unknown> | null;
  task_lifecycle: Record<string, unknown> | null;
  progress_surface: Record<string, unknown> | null;
  artifact_surface: Record<string, unknown> | null;
  artifact_pickup_surface: Record<string, unknown> | null;
  restore_surface: Record<string, unknown> | null;
  approval_surface: Record<string, unknown> | null;
  interrupt_surface: Record<string, unknown> | null;
};

function buildRuntimeContinuityProjection(options: {
  projectId: string | null;
  sessionId?: string | null;
  runtimeControl?: unknown;
  sessionContinuity?: unknown;
  progressProjection?: unknown;
  artifactInventory?: unknown;
  runtimeInventory?: unknown;
  taskLifecycle?: unknown;
}) {
  const runtimeControl = isRecord(options.runtimeControl) ? options.runtimeControl : null;
  const sessionContinuity = isRecord(options.sessionContinuity) ? options.sessionContinuity : null;
  const progressProjection = isRecord(options.progressProjection) ? options.progressProjection : null;
  const artifactInventory = isRecord(options.artifactInventory) ? options.artifactInventory : null;
  const runtimeInventory = isRecord(options.runtimeInventory) ? options.runtimeInventory : null;
  const taskLifecycle = isRecord(options.taskLifecycle) ? options.taskLifecycle : null;
  const controlSurfaces = isRecord(runtimeControl?.control_surfaces) ? runtimeControl.control_surfaces : null;
  const progressSurface =
    (isRecord(sessionContinuity?.progress_surface) ? sessionContinuity.progress_surface : null)
    ?? (isRecord(controlSurfaces?.progress) ? controlSurfaces.progress : null)
    ?? (isRecord(progressProjection?.progress_surface) ? progressProjection.progress_surface : null);
  const artifactSurface =
    (isRecord(sessionContinuity?.artifact_surface) ? sessionContinuity.artifact_surface : null)
    ?? (isRecord(controlSurfaces?.artifact_pickup) ? controlSurfaces.artifact_pickup : null)
    ?? (isRecord(artifactInventory?.artifact_surface) ? artifactInventory.artifact_surface : null)
    ?? (isRecord(progressProjection?.artifact_surface) ? progressProjection.artifact_surface : null);
  const restoreSurface =
    (isRecord(sessionContinuity?.restore_surface) ? sessionContinuity.restore_surface : null)
    ?? (isRecord(controlSurfaces?.resume) ? controlSurfaces.resume : null)
    ?? (isRecord(taskLifecycle?.resume_surface) ? taskLifecycle.resume_surface : null);
  const approvalSurface = isRecord(controlSurfaces?.approval) ? controlSurfaces.approval : null;
  const interruptSurface = isRecord(controlSurfaces?.interrupt) ? controlSurfaces.interrupt : null;
  const artifactPickupSurface =
    (isRecord(controlSurfaces?.artifact_pickup) ? controlSurfaces.artifact_pickup : null)
    ?? (isRecord(artifactInventory?.artifact_surface) ? artifactInventory.artifact_surface : null)
    ?? (isRecord(sessionContinuity?.artifact_surface) ? sessionContinuity.artifact_surface : null);

  if (
    !runtimeControl
    && !sessionContinuity
    && !progressProjection
    && !artifactInventory
    && !runtimeInventory
    && !taskLifecycle
  ) {
    return null;
  }

  return {
    project_id: options.projectId,
    session_id:
      normalizeOptionalString(options.sessionId)
      ?? normalizeOptionalString(sessionContinuity?.session_id)
      ?? normalizeOptionalString(runtimeControl?.session_id)
      ?? null,
    domain_agent_id:
      normalizeOptionalString(sessionContinuity?.domain_agent_id)
      ?? normalizeOptionalString(runtimeControl?.domain_agent_id)
      ?? null,
    runtime_owner:
      normalizeOptionalString(sessionContinuity?.runtime_owner)
      ?? normalizeOptionalString(runtimeControl?.runtime_owner)
      ?? normalizeOptionalString(runtimeInventory?.runtime_owner)
      ?? null,
    domain_owner:
      normalizeOptionalString(sessionContinuity?.domain_owner)
      ?? normalizeOptionalString(runtimeControl?.domain_owner)
      ?? normalizeOptionalString(runtimeInventory?.domain_owner)
      ?? null,
    executor_owner:
      normalizeOptionalString(sessionContinuity?.executor_owner)
      ?? normalizeOptionalString(runtimeControl?.executor_owner)
      ?? normalizeOptionalString(runtimeInventory?.executor_owner)
      ?? null,
    runtime_control: runtimeControl,
    session_continuity: sessionContinuity,
    progress_projection: progressProjection,
    artifact_inventory: artifactInventory,
    runtime_inventory: runtimeInventory,
    task_lifecycle: taskLifecycle,
    progress_surface: progressSurface,
    artifact_surface: artifactSurface,
    artifact_pickup_surface: artifactPickupSurface,
    restore_surface: restoreSurface,
    approval_surface: approvalSurface,
    interrupt_surface: interruptSurface,
  } satisfies OplRuntimeContinuityProjection;
}

function pickLedgerSessionForRuntimeContinuity(
  sessionLedger: ReturnType<typeof buildSessionLedger>,
  workspacePath: string,
  sessionId?: string | null,
) {
  const sessions = sessionLedger.session_ledger.sessions;
  const workspaceMatched = sessions.filter(
    (entry) => entry.workspace_locator?.absolute_path === workspacePath && typeof entry.domain_id === 'string',
  );

  return (
    workspaceMatched.find((entry) => entry.session_id === sessionId)
    ?? workspaceMatched[0]
    ?? sessions.find((entry) => entry.session_id === sessionId && typeof entry.domain_id === 'string')
    ?? sessions.find((entry) => typeof entry.domain_id === 'string')
    ?? null
  );
}

function resolveRuntimeContinuityProjection(
  context: WebFrontDeskContext,
  currentProgress: Awaited<ReturnType<typeof readOplProgressBrief>> | null,
  sessionLedger: ReturnType<typeof buildSessionLedger>,
  workspacePath: string,
  sessionId?: string | null,
) {
  const currentProject = isRecord(currentProgress?.current_project) ? currentProgress.current_project : null;
  const currentProjection = buildRuntimeContinuityProjection({
    projectId: normalizeOptionalString(currentProject?.project_id) ?? null,
    sessionId,
    runtimeControl: currentProgress?.runtime_continuity?.control,
    sessionContinuity: currentProgress?.runtime_continuity?.session,
    progressProjection: currentProgress?.runtime_continuity?.progress,
    artifactInventory: currentProgress?.runtime_continuity?.artifacts,
    runtimeInventory: currentProgress?.runtime_continuity?.runtime_inventory,
    taskLifecycle: currentProgress?.runtime_continuity?.task_lifecycle,
  });
  const ledgerSession = pickLedgerSessionForRuntimeContinuity(sessionLedger, workspacePath, sessionId);
  if (!ledgerSession?.domain_id) {
    return currentProjection;
  }

  if (currentProjection?.project_id === ledgerSession.domain_id) {
    return currentProjection;
  }

  const domainManifests = buildDomainManifestCatalog(context.contracts).domain_manifests;
  const manifestEntry = domainManifests.projects.find(
    (entry) => entry.project_id === ledgerSession.domain_id && entry.status === 'resolved' && entry.manifest,
  );
  if (manifestEntry?.manifest) {
    return buildRuntimeContinuityProjection({
      projectId: manifestEntry.project_id,
      sessionId: ledgerSession.session_id,
      runtimeControl: manifestEntry.manifest.runtime_control,
      sessionContinuity: manifestEntry.manifest.session_continuity,
      progressProjection: manifestEntry.manifest.progress_projection,
      artifactInventory: manifestEntry.manifest.artifact_inventory,
      runtimeInventory: manifestEntry.manifest.runtime_inventory,
      taskLifecycle: manifestEntry.manifest.task_lifecycle,
    });
  }

  const taskProjection = readLatestFrontDeskTaskProjection(workspacePath);
  if (taskProjection) {
    const projectedTaskContinuity = buildRuntimeContinuityProjection({
      projectId: taskProjection.project_id,
      sessionId: sessionId ?? taskProjection.session_id,
      runtimeControl: taskProjection.runtime_control,
      sessionContinuity: taskProjection.session_continuity,
      progressProjection: taskProjection.progress_projection,
      artifactInventory: taskProjection.artifact_inventory,
      runtimeInventory: taskProjection.runtime_inventory,
      taskLifecycle: taskProjection.task_lifecycle,
    });
    if (projectedTaskContinuity) {
      return projectedTaskContinuity;
    }
  }

  return currentProjection;
}

export function buildOplSessionsPayload(
  context: WebFrontDeskContext,
  productEntrySessions: ReturnType<typeof runProductEntrySessions>,
  sessionLedger: ReturnType<typeof buildSessionLedger>,
  api: OplApiCatalog,
  currentProgress: Awaited<ReturnType<typeof readOplProgressBrief>> | null,
) {
  const continuity = resolveRuntimeContinuityProjection(
    context,
    currentProgress,
    sessionLedger,
    context.workspacePath,
  );
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
      current_runtime_continuity: continuity
        ? {
            project_id: continuity.project_id,
            domain_agent_id: continuity.domain_agent_id,
            session_id: continuity.session_id,
            runtime_owner: continuity.runtime_owner,
            domain_owner: continuity.domain_owner,
            executor_owner: continuity.executor_owner,
            progress_surface: continuity.progress_surface,
            artifact_surface: continuity.artifact_surface,
            restore_surface: continuity.restore_surface,
            runtime_control: continuity.runtime_control,
          }
        : null,
      notes: [
        'Session list is sourced from the active executor runtime.',
        'Session ledger is OPL-managed attribution for local workspace and resource context.',
      ],
    },
  };
}

export async function readOplProgressBrief(
  context: WebFrontDeskContext,
  workspacePath?: string,
) {
  return (await buildProjectProgressBrief(context.contracts, {
    workspacePath: workspacePath ?? context.workspacePath,
    sessionsLimit: context.sessionsLimit,
    basePath: context.basePath,
  })).project_progress;
}

export async function buildOplProgressPayload(
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
  const sessionLedger = buildSessionLedger(context.sessionsLimit);
  const continuity = resolveRuntimeContinuityProjection(
    context,
    progress,
    sessionLedger,
    progress.current_project.workspace_path,
    options.sessionId,
  );
  const taskPayload = options.taskId
    ? readFrontDeskTaskStatus(options.taskId, options.lines ?? 20).product_entry.task
    : null;
  return {
    version: 'g2' as const,
    progress: {
      surface_id: 'opl_progress',
      session_id:
        options.sessionId
        ?? continuity?.session_id
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
      domain_agent_id: continuity?.domain_agent_id ?? null,
      runtime_owner: continuity?.runtime_owner ?? null,
      domain_owner: continuity?.domain_owner ?? null,
      executor_owner: continuity?.executor_owner ?? null,
      repo_progress_projection: continuity?.progress_projection ?? null,
      repo_runtime_control: continuity?.runtime_control ?? null,
      restore_surface: continuity?.restore_surface ?? null,
      approval_surface: continuity?.approval_surface ?? null,
      interrupt_surface: continuity?.interrupt_surface ?? null,
      artifact_surface: continuity?.artifact_surface ?? null,
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

export async function buildOplArtifactsPayload(
  context: WebFrontDeskContext,
  api: OplApiCatalog,
  options: {
    workspacePath?: string;
    sessionId?: string;
  } = {},
) {
  const progress = await readOplProgressBrief(context, options.workspacePath);
  const sessionLedger = buildSessionLedger(context.sessionsLimit);
  const continuity = resolveRuntimeContinuityProjection(
    context,
    progress,
    sessionLedger,
    progress.current_project.workspace_path,
    options.sessionId,
  );
  const deliverableFiles = progress.workspace_files.deliverable_files;
  const supportingFiles = progress.workspace_files.supporting_files;

  return {
    version: 'g2' as const,
    artifacts: {
      surface_id: 'opl_artifacts',
      session_id:
        options.sessionId
        ?? continuity?.session_id
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
      domain_agent_id: continuity?.domain_agent_id ?? null,
      runtime_owner: continuity?.runtime_owner ?? null,
      domain_owner: continuity?.domain_owner ?? null,
      executor_owner: continuity?.executor_owner ?? null,
      artifact_surface: continuity?.artifact_surface ?? null,
      artifact_pickup_surface: continuity?.artifact_pickup_surface ?? null,
      repo_artifact_inventory: continuity?.artifact_inventory ?? null,
      repo_runtime_control: continuity?.runtime_control ?? null,
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

export {
  activateWorkspaceBinding,
  archiveWorkspaceBinding,
  bindWorkspace,
};
