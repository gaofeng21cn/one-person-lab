import { buildOplEndpoints } from '../../runway/index.ts';
import {
  readOplUpdateChannel,
  readOplWorkspaceRoot,
} from '../../../kernel/system-preferences.ts';
import { readOplRuntimeModes } from '../../../kernel/runtime-modes.ts';
import { buildOplGuiShellSurface, buildOplRecommendedSkills } from '../install-companions.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';

import { buildOplEnvironment } from './environment.ts';
import { buildOplModules } from './modules.ts';
import type {
  OplInitializeActionDescriptor,
  OplInitializeChecklistItem,
  OplInitializePhase,
  OplInitializeSectionId,
  OplSystemInitializeEventHandler,
} from './shared.ts';
import {
  createOplSystemInitializeEventEmitter,
  resolveProjectRoot,
  withOplSystemInitializeEventPhase,
} from './shared.ts';
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

function buildRecommendedSkillsStatus(recommendedSkills: ReturnType<typeof buildOplRecommendedSkills>) {
  return recommendedSkills.some((skill) => skill.status === 'ready') ? 'ready' : 'attention_needed';
}

function buildInitializeChecklistItem(input: OplInitializeChecklistItem): OplInitializeChecklistItem {
  return input;
}

function actionCommandRef(action: OplInitializeActionDescriptor | null) {
  if (!action) return null;
  if (action.action_id === 'install_or_configure_codex') return 'opl engine install --engine codex';
  if (action.action_id === 'configure_codex_api_key') return 'opl system configure-codex --api-key-stdin';
  if (action.action_id === 'repair_native_helpers') return 'opl system repair-native-helpers';
  if (action.action_id === 'review_modules') return 'opl system startup-maintenance';
  if (action.action_id === 'review_family_runtime_provider') return 'opl family-runtime worker status --provider temporal';
  if (action.action_id === 'set_workspace_root') return 'opl system workspace-root --path <path>';
  if (action.action_id === 'developer_supervisor') return 'opl system developer-supervisor';
  return null;
}

function lastAttempt(status: string, detail: Record<string, unknown> = {}) {
  return {
    status,
    observed_at: new Date().toISOString(),
    ...detail,
  };
}

type OplInitializeBuildOptions = {
  onEvent?: OplSystemInitializeEventHandler;
};

export async function buildOplInitialize(
  contracts: FrameworkContracts,
  options: OplInitializeBuildOptions = {},
) {
  const events = createOplSystemInitializeEventEmitter(options.onEvent);
  const environmentPayload = await withOplSystemInitializeEventPhase(
    events,
    'environment',
    'Inspect local OPL environment',
    () => buildOplEnvironment(contracts, { onInitializeEvent: events.relay }),
    (payload) => ({ overall_status: payload.system_environment.overall_status }),
  );
  const modulesPayload = await withOplSystemInitializeEventPhase(
    events,
    'modules',
    'Build domain module readiness summary',
    () => buildOplModules(),
    (payload) => ({
      installed_modules_count: payload.modules.summary.installed_modules_count,
      total_modules_count: payload.modules.summary.total_modules_count,
    }),
  );
  const settings = await withOplSystemInitializeEventPhase(
    events,
    'settings',
    'Read local runtime settings',
    () => readOplRuntimeModes(),
    (payload) => ({
      interaction_mode: payload.interaction_mode,
      execution_mode: payload.execution_mode,
    }),
  );
  const workspaceRoot = await withOplSystemInitializeEventPhase(
    events,
    'workspace_root',
    'Read workspace root selection',
    () => readOplWorkspaceRoot(),
    (payload) => ({
      health_status: payload.health_status,
      selected_path: payload.selected_path,
    }),
  );
  const updateChannel = readOplUpdateChannel();
  const endpoints = buildOplEndpoints();
  const environment = environmentPayload.system_environment;
  const developerMode = environment.developer_mode;
  const moduleSummary = modulesPayload.modules.summary;
  const defaultModuleTotal = moduleSummary.default_modules_count ?? moduleSummary.total_modules_count;
  const defaultModuleInstalled = moduleSummary.installed_default_modules_count ?? moduleSummary.installed_modules_count;
  const defaultModuleReady = moduleSummary.healthy_default_modules_count ?? moduleSummary.healthy_modules_count;
  const recommendedSkills = await withOplSystemInitializeEventPhase(
    events,
    'recommended_skills',
    'Inspect recommended skill bundle',
    () => buildOplRecommendedSkills(),
    (skills) => ({
      total: skills.length,
      ready: skills.filter((skill) => skill.status === 'ready').length,
      missing: skills.filter((skill) => skill.status === 'missing').length,
    }),
  );
  const guiShell = await withOplSystemInitializeEventPhase(
    events,
    'gui_shell',
    'Inspect OPL App GUI shell surface',
    () => buildOplGuiShellSurface(resolveProjectRoot()),
    (surface) => ({
      sibling_checkout_found: surface.sibling_checkout_found,
    }),
  );
  const codex = environment.core_engines.codex;
  const familyRuntimeProvider = environment.core_engines.family_runtime_provider;
  const codexCliReady = codex.health_status === 'ready';
  const codexConfigReady = codex.model_access_ready === true;
  const providerReady = familyRuntimeProvider.health_status === 'ready';
  const recommendedSkillsStatus = buildRecommendedSkillsStatus(recommendedSkills);
  const coreReady =
    workspaceRoot.health_status === 'ready'
    && codexCliReady
    && codexConfigReady;
  const domainReady = defaultModuleReady === defaultModuleTotal;
  const familyRuntimeProviderStatus = providerReady
    ? 'ready'
    : familyRuntimeProvider.provider_kind === 'temporal'
      && familyRuntimeProvider.status === 'provider_code_landed_unconfigured'
      ? 'initializing'
      : 'attention_needed';
  const launchReady = coreReady;
  const fullReady = coreReady && domainReady && providerReady;

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
    label: 'Configure OPL Gateway',
    description: 'Write the local Codex provider config from the OPL Gateway endpoint, App-owned install fallback, and the user-provided access key.',
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
    description: 'Inspect Codex, family runtime provider, non-provider diagnostics, and managed paths before continuing.',
    section_id: 'environment',
    endpoint: endpoints.system_environment,
  });
  const reviewFamilyRuntimeProviderAction = buildInitializeActionDescriptor({
    action_id: 'review_family_runtime_provider',
    label: 'Review family runtime provider',
    description: 'Inspect the configured family runtime provider and report provider-specific setup requirements.',
    section_id: 'environment',
    endpoint: endpoints.system_environment,
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
    buildInitializeChecklistItem({
      item_id: 'workspace_root',
      label: 'Workspace Root',
      status: workspaceRoot.health_status,
      required: true,
      blocking: workspaceRoot.health_status !== 'ready',
      readiness_layer: 'core_launch',
      severity: workspaceRoot.health_status === 'ready' ? 'info' : 'blocking',
      user_action_required: workspaceRoot.health_status !== 'ready',
      auto_action_available: false,
      action_command_ref: actionCommandRef(workspaceRoot.health_status === 'ready' ? openWorkspaceRootAction : setWorkspaceRootAction),
      last_attempt: lastAttempt(workspaceRoot.health_status, { selected_path: workspaceRoot.selected_path }),
      next_visible_step: workspaceRoot.health_status === 'ready'
        ? 'Continue to Codex readiness.'
        : 'Choose a writable workspace root.',
      section_id: 'workspace_root',
      detail_summary: workspaceRoot.selected_path
        ? `Selected root: ${workspaceRoot.selected_path}`
        : 'Pick one writable directory where OPL can create and discover workspaces.',
      endpoint: endpoints.workspace_root,
      action_endpoint: endpoints.workspace_root,
      action: workspaceRoot.health_status === 'ready' ? openWorkspaceRootAction : setWorkspaceRootAction,
    }),
    buildInitializeChecklistItem({
      item_id: 'codex',
      label: 'Codex CLI',
      status: codex.health_status,
      required: true,
      blocking: !codexCliReady,
      readiness_layer: 'core_launch',
      severity: codexCliReady ? 'info' : 'blocking',
      user_action_required: !codexCliReady,
      auto_action_available: !codexCliReady,
      action_command_ref: actionCommandRef(codexCliReady ? openEnvironmentAction : installCodexAction),
      last_attempt: lastAttempt(codex.health_status, {
        version: codex.version ?? null,
        binary_path: codex.binary_path ?? null,
      }),
      next_visible_step: codexCliReady
        ? 'Continue to Codex API configuration.'
        : 'Install or update Codex CLI from the App-managed action.',
      section_id: 'environment',
      detail_summary: codex.installed
        ? `Installed at ${codex.binary_path ?? 'unknown path'}`
        : 'Install Codex CLI and confirm the local Codex config that OPL should reuse.',
      endpoint: endpoints.system_environment,
      action_endpoint: endpoints.engine_action,
      action: codexCliReady
        ? openEnvironmentAction
        : installCodexAction,
    }),
    buildInitializeChecklistItem({
      item_id: 'codex_config',
      label: 'Model Access',
      status: codexConfigReady ? 'ready' : codex.model_access_status ?? codex.config_status,
      required: true,
      blocking: !codexConfigReady,
      readiness_layer: 'core_launch',
      severity: codexConfigReady ? 'info' : 'blocking',
      user_action_required: !codexConfigReady,
      auto_action_available: false,
      action_command_ref: actionCommandRef(codexConfigReady ? openEnvironmentAction : configureCodexAction),
      last_attempt: lastAttempt(codexConfigReady ? 'ready' : codex.model_access_status ?? codex.config_status, {
        config_path: codex.config_path ?? null,
        api_key_present: codex.api_key_present,
        opl_gateway_configured: codex.opl_gateway_configured === true,
        model_access_source: codex.model_access_source ?? null,
        provider_base_url: codex.provider_base_url ?? null,
      }),
      next_visible_step: codexConfigReady
        ? codex.opl_gateway_configured === true
          ? 'Core readiness is available through OPL Gateway.'
          : 'Existing Codex model access is available; OPL Gateway can be configured later from Settings.'
        : 'Enter an OPL Gateway access key, or configure Codex model access before continuing.',
      section_id: 'environment',
      detail_summary: codexConfigReady
        ? codex.opl_gateway_configured === true
          ? `OPL Gateway is configured for ${codex.default_model ?? 'the local default model'}.`
          : 'Using existing Codex model access; this skips OPL Gateway setup for first launch only.'
        : 'Enter your OPL Gateway access key; OPL will use the product endpoint and App-owned install fallback.',
      endpoint: endpoints.system_environment,
      action_endpoint: endpoints.system_action,
      action: codexConfigReady ? openEnvironmentAction : configureCodexAction,
    }),
    buildInitializeChecklistItem({
      item_id: 'family_runtime_provider',
      label: 'Family Runtime Provider',
      status: familyRuntimeProviderStatus,
      required: true,
      blocking: false,
      readiness_layer: 'full_readiness',
      severity: providerReady ? 'info' : 'maintenance',
      user_action_required: !providerReady,
      auto_action_available: false,
      action_command_ref: actionCommandRef(providerReady ? openEnvironmentAction : reviewFamilyRuntimeProviderAction),
      last_attempt: lastAttempt(familyRuntimeProviderStatus, {
        provider_kind: familyRuntimeProvider.provider_kind,
        degraded_reason: familyRuntimeProvider.degraded_reason ?? null,
      }),
      next_visible_step: providerReady
        ? 'Full runtime provider readiness is available.'
        : 'Continue using Core readiness while provider setup remains visible in Settings.',
      section_id: 'environment',
      detail_summary: providerReady
        ? `Provider ${familyRuntimeProvider.provider_kind} is ready for family runtime attempts.`
        : familyRuntimeProvider.degraded_reason
          ? `Provider ${familyRuntimeProvider.provider_kind} needs attention: ${familyRuntimeProvider.degraded_reason}.`
          : `Provider ${familyRuntimeProvider.provider_kind} is not ready.`,
      endpoint: endpoints.system_environment,
      action_endpoint: endpoints.system_environment,
      action: providerReady
        ? openEnvironmentAction
        : reviewFamilyRuntimeProviderAction,
    }),
    buildInitializeChecklistItem({
      item_id: 'native_helpers',
      label: 'OPL Native Helpers',
      status: environment.native_helpers.health_status,
      required: false,
      blocking: false,
      readiness_layer: 'optional',
      severity: environment.native_helpers.health_status === 'ready' ? 'info' : 'maintenance',
      user_action_required: false,
      auto_action_available: environment.native_helpers.health_status !== 'ready',
      action_command_ref: actionCommandRef(environment.native_helpers.health_status === 'ready' ? openEnvironmentAction : repairNativeHelpersAction),
      last_attempt: lastAttempt(environment.native_helpers.health_status),
      next_visible_step: environment.native_helpers.health_status === 'ready'
        ? 'Native helper checks are available.'
        : 'Run native helper repair from Settings when faster local checks are needed.',
      section_id: 'environment',
      detail_summary: environment.native_helpers.health_status === 'ready'
        ? 'Rust helper binaries are available for native doctor, watch, and indexing checks.'
        : 'Run native helper repair to build or refresh Rust helper binaries for faster local checks.',
      endpoint: endpoints.system_environment,
      action_endpoint: endpoints.system_action,
      action: environment.native_helpers.health_status === 'ready' ? openEnvironmentAction : repairNativeHelpersAction,
    }),
    buildInitializeChecklistItem({
      item_id: 'domain_modules',
      label: 'Domain Modules',
      status: buildInitializeOptionalStatus(defaultModuleReady),
      required: true,
      blocking: false,
      readiness_layer: 'full_readiness',
      severity: defaultModuleReady < defaultModuleTotal ? 'maintenance' : 'info',
      user_action_required: false,
      auto_action_available: defaultModuleReady < defaultModuleTotal,
      action_command_ref: actionCommandRef(reviewModulesAction),
      last_attempt: lastAttempt(buildInitializeOptionalStatus(defaultModuleReady), {
        ready_default_modules_count: defaultModuleReady,
        total_default_modules_count: defaultModuleTotal,
      }),
      next_visible_step: defaultModuleReady < defaultModuleTotal
        ? 'Start Core workflows now; background maintenance can install or refresh default modules.'
        : 'Domain modules are available for full workflows.',
      section_id: 'modules',
      detail_summary: `${defaultModuleReady}/${defaultModuleTotal} default modules ready.`,
      endpoint: endpoints.modules,
      action_endpoint: endpoints.module_action,
      action: reviewModulesAction,
    }),
    buildInitializeChecklistItem({
      item_id: 'recommended_skills',
      label: 'Recommended Skills',
      status: recommendedSkillsStatus,
      required: false,
      blocking: false,
      readiness_layer: 'optional',
      severity: recommendedSkillsStatus === 'ready' ? 'info' : 'maintenance',
      user_action_required: false,
      auto_action_available: recommendedSkillsStatus !== 'ready',
      action_command_ref: 'opl system startup-maintenance',
      last_attempt: lastAttempt(recommendedSkillsStatus, {
        ready_skills_count: recommendedSkills.filter((skill) => skill.status === 'ready').length,
        total_skills_count: recommendedSkills.length,
      }),
      next_visible_step: recommendedSkillsStatus === 'ready'
        ? 'Recommended Codex skills are visible.'
        : 'Run startup maintenance to sync missing companion skills when their sources are available.',
      section_id: 'modules',
      detail_summary: `${recommendedSkills.filter((skill) => skill.status === 'ready').length}/${recommendedSkills.length} companion skill groups detected for MAS/MAG/RCA workflows.`,
      endpoint: endpoints.system_initialize,
      action_endpoint: endpoints.system_initialize,
      action: reviewInitializeAction,
    }),
    buildInitializeChecklistItem({
      item_id: 'gui_shell',
      label: 'OPL Desktop GUI',
      status: guiShell.sibling_checkout_found ? 'ready' : 'attention_needed',
      required: false,
      blocking: false,
      readiness_layer: 'optional',
      severity: guiShell.sibling_checkout_found ? 'info' : 'maintenance',
      user_action_required: false,
      auto_action_available: false,
      action_command_ref: null,
      last_attempt: lastAttempt(guiShell.sibling_checkout_found ? 'ready' : 'attention_needed', {
        sibling_checkout_path: guiShell.sibling_checkout_path ?? null,
      }),
      next_visible_step: guiShell.sibling_checkout_found
        ? 'Desktop shell is available.'
        : 'Use a prebuilt release package or source checkout for GUI work.',
      section_id: 'system',
      detail_summary: guiShell.sibling_checkout_found
        ? `OPL GUI shell checkout found at ${guiShell.sibling_checkout_path}`
        : 'Use a prebuilt OPL desktop GUI release package when available; source build remains the fallback.',
      endpoint: endpoints.system_initialize,
      action_endpoint: endpoints.system_initialize,
      action: reviewInitializeAction,
    }),
    buildInitializeChecklistItem({
      item_id: 'developer_mode',
      label: 'Developer Mode',
      status: developerMode.enabled === 'off' ? 'disabled' : developerMode.setting_status,
      required: false,
      blocking: false,
      readiness_layer: 'optional',
      severity: 'info',
      user_action_required: false,
      auto_action_available: false,
      action_command_ref: actionCommandRef(developerMode.action),
      last_attempt: lastAttempt(developerMode.enabled === 'off' ? 'disabled' : developerMode.setting_status, {
        enabled: developerMode.enabled,
        effective_state: developerMode.effective_state,
      }),
      next_visible_step: 'Developer Mode can be managed from Settings when repository repair routing is needed.',
      section_id: 'settings',
      detail_summary:
        'Expose the App settings switch for supervised developer inspection and repository repair routing.',
      endpoint: endpoints.system_settings,
      action_endpoint: endpoints.system_action,
      action: developerMode.action,
    }),
  ];

  const coreLaunchChecklist = checklist.filter((item) => item.readiness_layer === 'core_launch');
  const fullReadinessChecklist = checklist.filter((item) => item.readiness_layer === 'full_readiness');
  const optionalChecklist = checklist.filter((item) => !item.required);
  const blockingItems = checklist
    .filter((item) => item.blocking)
    .map((item) => item.item_id);

  const overallState =
    fullReady
      ? 'ready_to_finalize'
      : launchReady
        ? 'ready_with_background_maintenance'
        : 'attention_needed';
  const setupPhase: OplInitializePhase =
    workspaceRoot.health_status !== 'ready'
      ? 'workspace_root'
      : (!codexCliReady || !codexConfigReady)
        ? 'environment'
        : !domainReady
          ? 'modules'
          : !providerReady
            ? 'environment'
            : 'review';
  const recommendedNextAction =
    setupPhase === 'workspace_root'
      ? setWorkspaceRootAction
      : setupPhase === 'environment'
        ? (!codexCliReady
          ? installCodexAction
          : !codexConfigReady
            ? configureCodexAction
            : !providerReady
              ? reviewFamilyRuntimeProviderAction
              : openEnvironmentAction)
        : setupPhase === 'modules' && !domainReady
          ? reviewModulesAction
          : !providerReady
            ? reviewFamilyRuntimeProviderAction
            : reviewInitializeAction;
  const requiredCompletedCount = coreLaunchChecklist.filter((item) => !item.blocking).length;
  const fullCompletedCount = fullReadinessChecklist.filter((item) => item.status === 'ready').length;
  const optionalCompletedCount = optionalChecklist.filter((item) => item.status === 'ready').length;
  const isFirstRun = workspaceRoot.source === 'default_home' && overallState !== 'ready_to_finalize';

  const payload = {
    version: 'g2',
    system_initialize: {
      surface_id: 'opl_system_initialize',
      overall_state: overallState,
      setup_flow: {
        is_first_run: isFirstRun,
        phase: setupPhase,
        ready_to_launch: launchReady,
        progress: {
          required_completed_count: requiredCompletedCount,
          required_total_count: coreLaunchChecklist.length,
          optional_completed_count: optionalCompletedCount,
          optional_total_count: optionalChecklist.length,
          ready_required_count: requiredCompletedCount,
          total_required_count: coreLaunchChecklist.length,
          ready_full_readiness_count: fullCompletedCount,
          total_full_readiness_count: fullReadinessChecklist.length,
          ready_optional_count: optionalCompletedCount,
          total_optional_count: optionalChecklist.length,
        },
        blocking_items: blockingItems,
        maintenance_items: checklist
          .filter((item) => item.severity === 'maintenance')
          .map((item) => item.item_id),
      },
      checklist,
      readiness: {
        core_ready: coreReady,
        domain_ready: domainReady,
        launch_ready: launchReady,
        family_runtime_provider_ready: providerReady,
        full_ready: fullReady,
      },
      family_runtime_provider: {
        surface_id: 'opl_family_runtime_provider_readiness',
        status: familyRuntimeProviderStatus,
        provider_kind: familyRuntimeProvider.provider_kind,
        blocking: !providerReady,
        full_readiness_blocking: !providerReady,
        ready: providerReady,
        capability_summary: providerReady
          ? `Family runtime provider ${familyRuntimeProvider.provider_kind} is ready for provider-backed stage attempts.`
          : familyRuntimeProvider.degraded_reason
            ? `Family runtime provider ${familyRuntimeProvider.provider_kind} is not ready: ${familyRuntimeProvider.degraded_reason}.`
            : `Family runtime provider ${familyRuntimeProvider.provider_kind} is not ready.`,
        repair_action: providerReady
          ? openEnvironmentAction
          : reviewFamilyRuntimeProviderAction,
        service_status: {
          engine_id: familyRuntimeProvider.provider_kind,
          installed: providerReady,
          provider_ready: providerReady,
          binary_path: null,
          binary_source: null,
          health_status: familyRuntimeProvider.health_status,
          issues: familyRuntimeProvider.degraded_reason ? [familyRuntimeProvider.degraded_reason] : [],
          raw_status: null,
        },
        last_repair_result: null,
      },
      core_engines: environment.core_engines,
      codex_default_profile: codex.default_profile,
      native_helpers: environment.native_helpers,
      seed_install: environment.seed_install,
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
        developer_mode: developerMode,
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
            action_id: 'startup_maintenance',
            endpoint: endpoints.system_action,
            label: 'Run startup maintenance',
            description: 'Refresh clean OPL-managed modules, domain plugin/skill cache, and App reload guidance without touching domain truth.',
            section_id: 'system',
            method: 'POST',
            request_fields: [],
            payload_template: {
              action: 'startup_maintenance',
            },
          },
          {
            action_id: 'developer_supervisor',
            endpoint: endpoints.system_action,
            label: developerMode.action.label,
            description: developerMode.action.description,
            section_id: developerMode.action.section_id,
            method: developerMode.action.method,
            request_fields: developerMode.action.request_fields,
            payload_template: developerMode.action.payload_template,
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
        'Developer Mode settings are exposed through the same developer_supervisor system action used by CLI/system settings; GitHub identity, repository authority, and supervised repair routing are projected on the developer_mode surface.',
        'A configured family runtime provider is required for Full OPL readiness. Local CLI/status surfaces can still report degraded diagnostics when the online provider is missing or disabled.',
        'The OPL desktop GUI is an OPL-branded App maintained in one-person-lab-app, with the active AionUI adapter under shells/aionui; the upstream AionUI app is not itself the OPL GUI.',
      ],
    },
  };
  return payload;
}
