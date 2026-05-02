import { buildOplEndpoints } from '../opl-runtime-paths.ts';
import {
  readOplUpdateChannel,
  readOplWorkspaceRoot,
} from '../system-preferences.ts';
import { readOplRuntimeModes } from '../runtime-modes.ts';
import { buildOplGuiShellSurface, buildOplRecommendedSkills } from '../install-companions.ts';
import type { GatewayContracts } from '../types.ts';

import { buildOplEnvironment } from './environment.ts';
import { buildOplModules } from './modules.ts';
import type {
  OplInitializeActionDescriptor,
  OplInitializeChecklistItem,
  OplInitializePhase,
  OplInitializeSectionId,
} from './shared.ts';
import { resolveProjectRoot } from './shared.ts';
import {
  buildOplFirstRunLogSurface,
  buildOplGuiFirstRunAutomationContract,
} from './first-run-contract.ts';

function buildInitializeActionDescriptor(input: {
  action_id: string;
  label: string;
  description: string;
  section_id: OplInitializeSectionId;
  endpoint: string;
  method?: 'GET' | 'POST';
  request_fields?: string[];
  payload_template?: Record<string, string> | null;
}): OplInitializeActionDescriptor {
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

export async function buildOplInitialize(contracts: GatewayContracts) {
  const environmentPayload = await buildOplEnvironment(contracts);
  const modulesPayload = buildOplModules();
  const settings = readOplRuntimeModes();
  const workspaceRoot = readOplWorkspaceRoot();
  const updateChannel = readOplUpdateChannel();
  const endpoints = buildOplEndpoints();
  const environment = environmentPayload.system_environment;
  const moduleSummary = modulesPayload.modules.summary;
  const recommendedSkills = buildOplRecommendedSkills();
  const guiShell = buildOplGuiShellSurface(resolveProjectRoot());
  const codex = environment.core_engines.codex;
  const hermes = environment.core_engines.hermes;
  const codexCliReady = codex.health_status === 'ready';
  const codexConfigReady = codex.config_status === 'detected' && codex.api_key_present === true;
  const hermesReady = hermes.health_status === 'ready' && hermes.gateway_loaded === true;

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
    endpoint: endpoints.engine_action,
    method: 'POST',
    payload_template: {
      engine_id: 'codex',
      action: 'install',
    },
  });
  const configureCodexAction = buildInitializeActionDescriptor({
    action_id: 'configure_codex_api_key',
    label: 'Configure Codex API key',
    description: 'Write the local Codex provider config from the product default endpoint, current initial model profile, and the user-provided API key.',
    section_id: 'environment',
    endpoint: endpoints.system_action,
    method: 'POST',
    request_fields: ['api_key'],
    payload_template: {
      action: 'configure_codex',
      secret_input: 'api_key',
    },
  });
  const openEnvironmentAction = buildInitializeActionDescriptor({
    action_id: 'open_environment',
    label: 'Review environment',
    description: 'Inspect Codex, Hermes, and managed paths before continuing.',
    section_id: 'environment',
    endpoint: endpoints.system_environment,
  });
  const installHermesAction = buildInitializeActionDescriptor({
    action_id: 'install_or_configure_hermes',
    label: 'Install Hermes-Agent',
    description: 'Install Hermes-Agent so OPL can provision the long-running gateway.',
    section_id: 'environment',
    endpoint: endpoints.engine_action,
    method: 'POST',
    payload_template: {
      engine_id: 'hermes',
      action: 'install',
    },
  });
  const repairHermesGatewayAction = buildInitializeActionDescriptor({
    action_id: 'repair_hermes_gateway',
    label: 'Repair Hermes gateway',
    description: 'Install or reload the Hermes gateway service and verify that it is loaded.',
    section_id: 'environment',
    endpoint: endpoints.system_action,
    method: 'POST',
    payload_template: {
      action: 'repair',
    },
  });
  const repairNativeHelpersAction = buildInitializeActionDescriptor({
    action_id: 'repair_native_helpers',
    label: 'Repair native helpers',
    description: 'Build or refresh the OPL Rust helper binaries used for doctor, watch, and indexing checks.',
    section_id: 'environment',
    endpoint: endpoints.system_action,
    method: 'POST',
    payload_template: {
      action: 'repair_native_helpers',
    },
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
    label: 'Install domain modules',
    description: 'Install the OPL domain modules that should be available in this installation.',
    section_id: 'modules',
    endpoint: endpoints.modules,
  });
  const reviewInitializeAction = buildInitializeActionDescriptor({
    action_id: 'review_initialize',
    label: 'Review initialize state',
    description: 'Re-open the aggregated Initialize OPL surface and confirm the remaining setup choices.',
    section_id: 'system',
    endpoint: endpoints.system_initialize,
  });

  const checklist: OplInitializeChecklistItem[] = [
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
      status: codex.health_status,
      required: true,
      blocking: !codexCliReady,
      section_id: 'environment',
      detail_summary: codex.installed
        ? `Installed at ${codex.binary_path ?? 'unknown path'}`
        : 'Install Codex CLI and confirm the local Codex config that OPL should reuse.',
      endpoint: endpoints.system_environment,
      action_endpoint: endpoints.engine_action,
      action: codexCliReady
        ? openEnvironmentAction
        : installCodexAction,
    },
    {
      item_id: 'codex_config',
      label: 'Codex API Configuration',
      status: codexConfigReady ? 'ready' : codex.config_status,
      required: true,
      blocking: !codexConfigReady,
      section_id: 'environment',
      detail_summary: codexConfigReady
        ? `Codex provider is configured for ${codex.default_model ?? 'the local default model'}.`
        : 'Enter your Codex API key; OPL will use the product default provider endpoint and the current maintainer initial model profile.',
      endpoint: endpoints.system_environment,
      action_endpoint: endpoints.system_action,
      action: codexConfigReady ? openEnvironmentAction : configureCodexAction,
    },
    {
      item_id: 'hermes',
      label: 'Hermes-Agent',
      status: hermes.health_status,
      required: true,
      blocking: !hermesReady,
      section_id: 'environment',
      detail_summary: hermesReady
        ? `Gateway loaded from ${hermes.binary_path ?? 'unknown path'}`
        : hermes.installed
          ? `Installed at ${hermes.binary_path ?? 'unknown path'}; gateway service must be installed and loaded.`
          : 'Install Hermes-Agent and load its gateway service for long-running OPL automation.',
      endpoint: endpoints.system_environment,
      action_endpoint: hermes.installed ? endpoints.system_action : endpoints.engine_action,
      action: hermesReady
        ? openEnvironmentAction
        : hermes.installed
          ? repairHermesGatewayAction
          : installHermesAction,
    },
    {
      item_id: 'native_helpers',
      label: 'OPL Native Helpers',
      status: environment.native_helpers.health_status,
      required: false,
      blocking: false,
      section_id: 'environment',
      detail_summary: environment.native_helpers.health_status === 'ready'
        ? 'Rust helper binaries are available for native doctor, watch, and indexing checks.'
        : 'Run native helper repair to build or refresh Rust helper binaries for faster local checks.',
      endpoint: endpoints.system_environment,
      action_endpoint: endpoints.system_action,
      action: environment.native_helpers.health_status === 'ready' ? openEnvironmentAction : repairNativeHelpersAction,
    },
    {
      item_id: 'domain_modules',
      label: 'Domain Modules',
      status: buildInitializeOptionalStatus(moduleSummary.installed_modules_count),
      required: true,
      blocking: moduleSummary.installed_modules_count < moduleSummary.total_modules_count,
      section_id: 'modules',
      detail_summary: `${moduleSummary.installed_modules_count}/${moduleSummary.total_modules_count} modules installed.`,
      endpoint: endpoints.modules,
      action_endpoint: endpoints.module_action,
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
      endpoint: endpoints.system_initialize,
      action_endpoint: endpoints.system_initialize,
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
      endpoint: endpoints.system_initialize,
      action_endpoint: endpoints.system_initialize,
      action: reviewInitializeAction,
    },
  ];

  const requiredChecklist = checklist.filter((item) => item.required);
  const optionalChecklist = checklist.filter((item) => !item.required);
  const blockingItems = checklist
    .filter((item) => item.blocking)
    .map((item) => item.item_id);

  const overallState =
    codexCliReady
    && codexConfigReady
    && hermesReady
    && workspaceRoot.health_status === 'ready'
      && moduleSummary.installed_modules_count === moduleSummary.total_modules_count
      ? 'ready_to_finalize'
      : 'attention_needed';
  const setupPhase: OplInitializePhase =
    workspaceRoot.health_status !== 'ready'
      ? 'workspace_root'
      : (!codexCliReady || !codexConfigReady || !hermesReady)
        ? 'environment'
        : moduleSummary.installed_modules_count < moduleSummary.total_modules_count
          ? 'modules'
          : 'review';
  const recommendedNextAction =
    setupPhase === 'workspace_root'
      ? setWorkspaceRootAction
      : setupPhase === 'environment'
        ? (!codexCliReady
          ? installCodexAction
          : !codexConfigReady
            ? configureCodexAction
            : hermes.installed
              ? repairHermesGatewayAction
              : installHermesAction)
        : setupPhase === 'modules'
          ? reviewModulesAction
          : reviewInitializeAction;
  const requiredCompletedCount = requiredChecklist.filter((item) => !item.blocking).length;
  const optionalCompletedCount = optionalChecklist.filter((item) => item.status === 'ready').length;
  const isFirstRun = workspaceRoot.source === 'default_home' && overallState !== 'ready_to_finalize';

  return {
    version: 'g2',
    system_initialize: {
      surface_id: 'opl_system_initialize',
      overall_state: overallState,
      setup_flow: {
        is_first_run: isFirstRun,
        phase: setupPhase,
        ready_to_launch: requiredChecklist.every((item) => !item.blocking),
        progress: {
          required_completed_count: requiredCompletedCount,
          required_total_count: requiredChecklist.length,
          optional_completed_count: optionalCompletedCount,
          optional_total_count: optionalChecklist.length,
          ready_required_count: requiredCompletedCount,
          total_required_count: requiredChecklist.length,
          ready_optional_count: optionalCompletedCount,
          total_optional_count: optionalChecklist.length,
        },
        blocking_items: blockingItems,
      },
      checklist,
      core_engines: environment.core_engines,
      codex_default_profile: codex.default_profile,
      native_helpers: environment.native_helpers,
      module_summary: moduleSummary,
      domain_modules: modulesPayload.modules,
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
        endpoint: endpoints.system_settings,
        action_endpoint: endpoints.system_settings,
      },
      workspace_root: {
        ...workspaceRoot,
        endpoint: endpoints.workspace_root,
        action_endpoint: endpoints.workspace_root,
      },
      system: {
        update_channel: updateChannel.channel,
        gui_shell: environmentPayload.system_environment.gui_shell,
        actions: [
          {
            action_id: 'repair',
            endpoint: endpoints.system_action,
          },
          {
            action_id: 'reinstall_support',
            endpoint: endpoints.system_action,
          },
          {
            action_id: 'update_channel',
            endpoint: endpoints.system_action,
          },
          {
            action_id: 'repair_native_helpers',
            endpoint: endpoints.system_action,
          },
        ],
      },
      first_run_log: buildOplFirstRunLogSurface(),
      gui_first_run_automation: buildOplGuiFirstRunAutomationContract(),
      endpoints: {
        system_initialize: endpoints.system_initialize,
        system_environment: endpoints.system_environment,
        modules: endpoints.modules,
        system_settings: endpoints.system_settings,
        engine_action: endpoints.engine_action,
        workspace_root: endpoints.workspace_root,
        system_action: endpoints.system_action,
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
