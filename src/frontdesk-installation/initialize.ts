import { buildFrontDeskEndpoints } from '../frontdesk-paths.ts';
import {
  readFrontDeskUpdateChannel,
  readFrontDeskWorkspaceRoot,
} from '../frontdesk-preferences.ts';
import { readFrontDeskRuntimeModes } from '../frontdesk-runtime-modes.ts';
import { buildOplGuiShellSurface, buildOplRecommendedSkills } from '../install-companions.ts';
import type { GatewayContracts } from '../types.ts';

import { buildFrontDeskEnvironment } from './environment.ts';
import { buildFrontDeskModules } from './modules.ts';
import type {
  FrontDeskInitializeActionDescriptor,
  FrontDeskInitializeChecklistItem,
  FrontDeskInitializePhase,
  FrontDeskInitializeSectionId,
} from './shared.ts';
import { resolveProjectRoot } from './shared.ts';

function buildInitializeActionDescriptor(input: {
  action_id: string;
  label: string;
  description: string;
  section_id: FrontDeskInitializeSectionId;
  endpoint: string;
  method?: 'GET' | 'POST';
  request_fields?: string[];
  payload_template?: Record<string, string> | null;
}): FrontDeskInitializeActionDescriptor {
  return {
    action_id: input.action_id,
    label: input.label,
    description: input.description,
    section_id: input.section_id,
    endpoint: input.endpoint,
    method: input.method ?? 'GET',
    request_fields: input.request_fields ?? [],
    payload_template: input.payload_template ?? null,
  };
}

function buildInitializeOptionalStatus(installedCount: number) {
  return installedCount > 0 ? 'ready' : 'attention_needed';
}

function buildRecommendedSkillsStatus() {
  return buildOplRecommendedSkills().some((skill) => skill.status === 'ready') ? 'ready' : 'attention_needed';
}

export async function buildFrontDeskInitialize(contracts: GatewayContracts) {
  const environmentPayload = await buildFrontDeskEnvironment(contracts);
  const modulesPayload = buildFrontDeskModules();
  const settings = readFrontDeskRuntimeModes();
  const workspaceRoot = readFrontDeskWorkspaceRoot();
  const updateChannel = readFrontDeskUpdateChannel();
  const endpoints = buildFrontDeskEndpoints();
  const environment = environmentPayload.frontdesk_environment;
  const moduleSummary = modulesPayload.frontdesk_modules.summary;
  const recommendedSkills = buildOplRecommendedSkills();
  const guiShell = buildOplGuiShellSurface(resolveProjectRoot());

  const setWorkspaceRootAction = buildInitializeActionDescriptor({
    action_id: 'set_workspace_root',
    label: 'Choose workspace root',
    description: 'Pick the writable root directory where OPL should store and discover workspaces.',
    section_id: 'workspace_root',
    endpoint: endpoints.workspace_root,
    method: 'POST',
    request_fields: ['path'],
  });
  const installCodexAction = buildInitializeActionDescriptor({
    action_id: 'install_or_configure_codex',
    label: 'Install or configure Codex',
    description: 'Install Codex CLI or confirm the local Codex config that OPL should reuse.',
    section_id: 'environment',
    endpoint: endpoints.frontdesk_engine_action,
    method: 'POST',
    payload_template: {
      engine_id: 'codex',
      action: 'install',
    },
  });
  const openEnvironmentAction = buildInitializeActionDescriptor({
    action_id: 'open_environment',
    label: 'Review environment',
    description: 'Inspect Codex, Hermes, and managed paths before continuing.',
    section_id: 'environment',
    endpoint: endpoints.frontdesk_environment,
  });
  const openWorkspaceRootAction = buildInitializeActionDescriptor({
    action_id: 'open_workspace_root',
    label: 'Review workspace root',
    description: 'Inspect the current workspace root selection and health checks.',
    section_id: 'workspace_root',
    endpoint: endpoints.workspace_root,
  });
  const reviewModulesAction = buildInitializeActionDescriptor({
    action_id: 'review_modules',
    label: 'Choose domain modules',
    description: 'Pick the OPL domain modules that should be available in this installation.',
    section_id: 'modules',
    endpoint: endpoints.frontdesk_modules,
  });  const reviewInitializeAction = buildInitializeActionDescriptor({
    action_id: 'review_initialize',
    label: 'Review initialize state',
    description: 'Re-open the aggregated Initialize OPL surface and confirm the remaining setup choices.',
    section_id: 'system',
    endpoint: endpoints.frontdesk_initialize,
  });

  const checklist: FrontDeskInitializeChecklistItem[] = [
    {
      item_id: 'workspace_root',
      label: 'Workspace Root',
      status: workspaceRoot.health_status,
      required: true,
      blocking: workspaceRoot.health_status !== 'ready',
      section_id: 'workspace_root',
      detail_summary: workspaceRoot.selected_path
        ? `Selected root: ${workspaceRoot.selected_path}`
        : 'Pick one writable directory where OPL can create and discover workspaces.',
      endpoint: endpoints.workspace_root,
      action_endpoint: endpoints.workspace_root,
      action: workspaceRoot.health_status === 'ready' ? openWorkspaceRootAction : setWorkspaceRootAction,
    },
    {
      item_id: 'codex',
      label: 'Codex CLI',
      status: environment.core_engines.codex.health_status,
      required: true,
      blocking: environment.core_engines.codex.health_status !== 'ready',
      section_id: 'environment',
      detail_summary: environment.core_engines.codex.installed
        ? `Installed at ${environment.core_engines.codex.binary_path ?? 'unknown path'}`
        : 'Install Codex CLI and confirm the local Codex config that OPL should reuse.',
      endpoint: endpoints.frontdesk_environment,
      action_endpoint: endpoints.frontdesk_engine_action,
      action: environment.core_engines.codex.health_status === 'ready'
        ? openEnvironmentAction
        : installCodexAction,
    },
    {
      item_id: 'hermes',
      label: 'Hermes-Agent',
      status: environment.core_engines.hermes.health_status,
      required: false,
      blocking: false,
      section_id: 'environment',
      detail_summary: environment.core_engines.hermes.installed
        ? `Installed at ${environment.core_engines.hermes.binary_path ?? 'unknown path'}`
        : 'Optional backup engine and long-running gateway.',
      endpoint: endpoints.frontdesk_environment,
      action_endpoint: endpoints.frontdesk_engine_action,
      action: openEnvironmentAction,
    },
    {
      item_id: 'domain_modules',
      label: 'Domain Modules',
      status: buildInitializeOptionalStatus(moduleSummary.installed_modules_count),
      required: false,
      blocking: false,
      section_id: 'modules',
      detail_summary: `${moduleSummary.installed_modules_count}/${moduleSummary.total_modules_count} modules installed.`,
      endpoint: endpoints.frontdesk_modules,
      action_endpoint: endpoints.frontdesk_module_action,
      action: reviewModulesAction,
    },
    {
      item_id: 'recommended_skills',
      label: 'Recommended Skills',
      status: buildRecommendedSkillsStatus(),
      required: false,
      blocking: false,
      section_id: 'modules',
      detail_summary: `${recommendedSkills.filter((skill) => skill.status === 'ready').length}/${recommendedSkills.length} companion skill groups detected for MAS/MAG/RCA workflows.`,
      endpoint: endpoints.frontdesk_initialize,
      action_endpoint: endpoints.frontdesk_initialize,
      action: reviewInitializeAction,
    },
    {
      item_id: 'gui_shell',
      label: 'OPL Desktop GUI',
      status: guiShell.sibling_checkout_found ? 'ready' : 'attention_needed',
      required: false,
      blocking: false,
      section_id: 'system',
      detail_summary: guiShell.sibling_checkout_found
        ? `OPL GUI shell checkout found at ${guiShell.sibling_checkout_path}`
        : 'Use a prebuilt OPL desktop GUI release package when available; source build remains the fallback.',
      endpoint: endpoints.frontdesk_initialize,
      action_endpoint: endpoints.frontdesk_initialize,
      action: reviewInitializeAction,
    },
  ];

  const requiredChecklist = checklist.filter((item) => item.required);
  const optionalChecklist = checklist.filter((item) => !item.required);
  const blockingItems = checklist
    .filter((item) => item.blocking)
    .map((item) => ({
      item_id: item.item_id,
      label: item.label,
      status: item.status,
      section_id: item.section_id,
      action: item.action,
    }));

  const overallState =
    environment.core_engines.codex.health_status === 'ready'
      && workspaceRoot.health_status === 'ready'
      ? 'ready_to_finalize'
      : 'attention_needed';
  const setupPhase: FrontDeskInitializePhase =
    workspaceRoot.health_status !== 'ready'
      ? 'workspace_root'
      : environment.core_engines.codex.health_status !== 'ready'
        ? 'environment'
        : 'review';
  const recommendedNextAction =
    setupPhase === 'workspace_root'
      ? setWorkspaceRootAction
      : setupPhase === 'environment'
        ? installCodexAction
        : moduleSummary.installed_modules_count === 0
          ? reviewModulesAction
          : reviewInitializeAction;

  return {
    version: 'g2',
    frontdesk_initialize: {
      surface_id: 'opl_frontdesk_initialize',
      overall_state: overallState,
      setup_flow: {
        is_first_run: workspaceRoot.source === 'unset',
        phase: setupPhase,
        ready_to_launch: requiredChecklist.every((item) => !item.blocking),
        progress: {
          required_completed_count: requiredChecklist.filter((item) => !item.blocking).length,
          required_total_count: requiredChecklist.length,
          optional_completed_count: optionalChecklist.filter((item) => item.status === 'ready').length,
          optional_total_count: optionalChecklist.length,
        },
        blocking_items: blockingItems,
      },
      checklist,
      core_engines: environment.core_engines,
      module_summary: moduleSummary,
      domain_modules: modulesPayload.frontdesk_modules,
      recommended_skills: {
        surface_id: 'opl_recommended_skill_bundle',
        skills: recommendedSkills,
        summary: {
          total: recommendedSkills.length,
          ready: recommendedSkills.filter((skill) => skill.status === 'ready').length,
          missing: recommendedSkills.filter((skill) => skill.status === 'missing').length,
        },
      },
      gui_shell: guiShell,
      settings: {
        interaction_mode: settings.interaction_mode,
        execution_mode: settings.execution_mode,
        endpoint: endpoints.frontdesk_settings,
        action_endpoint: endpoints.frontdesk_settings,
      },
      workspace_root: {
        ...workspaceRoot,
        endpoint: endpoints.workspace_root,
        action_endpoint: endpoints.workspace_root,
      },
      system: {
        update_channel: updateChannel.channel,
        gui_shell: environmentPayload.frontdesk_environment.gui_shell,
        actions: [
          {
            action_id: 'repair',
            endpoint: endpoints.frontdesk_system_action,
          },
          {
            action_id: 'reinstall_support',
            endpoint: endpoints.frontdesk_system_action,
          },
          {
            action_id: 'update_channel',
            endpoint: endpoints.frontdesk_system_action,
          },
        ],
      },
      endpoints: {
        frontdesk_initialize: endpoints.frontdesk_initialize,
        frontdesk_environment: endpoints.frontdesk_environment,
        frontdesk_modules: endpoints.frontdesk_modules,
        frontdesk_settings: endpoints.frontdesk_settings,
        frontdesk_engine_action: endpoints.frontdesk_engine_action,
        workspace_root: endpoints.workspace_root,
        frontdesk_system_action: endpoints.frontdesk_system_action,
      },
      recommended_next_action: recommendedNextAction,
      notes: [
        'Initialize OPL reuses the same truth surfaces as long-lived settings management.',
        'Workspace root and update channel are stored in OPL-managed state files.',
        'The OPL desktop GUI is an OPL-branded shell maintained in opl-aion-shell on top of the AionUI codebase; the upstream AionUI app is not itself the OPL GUI.',
      ],
    },
  };
}
