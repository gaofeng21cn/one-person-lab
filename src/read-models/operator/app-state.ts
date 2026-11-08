import { ensureOplStateDir, resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { loadFrameworkContracts } from '../../authority/contracts/public/app-state.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import type { JsonRecord } from '../../kernel/json-record.ts';
import {
  readBundledCodexDefaultProfile,
  readLocalCodexAccessState,
  readLocalCodexDefaultsIfAvailable,
} from '../../kernel/local-codex-defaults.ts';
import {
  buildOplDeveloperModeSurface,
  buildManagedUpdateKernelProjection,
  buildOplModules,
  canonicalAgentPackageId,
  compactStorageOwnerProjection,
  createOplAgentPackageStatusReader,
  inspectManagedBrowserAutomation,
  listOplAgentPackages,
  inspectManagedComputerUse,
  readOplFlowDefaultUserInstructions,
  readStorageOwnerInventorySnapshot,
  resolveCodexVersion,
  resolveDefaultFamilyWorkspaceRoot,
  runOplAgentPackageStatus,
  type CordisConnectDescriptorDiscoveryService,
} from '../../adapters/integration/public/app-state.ts';
import { readInstalledStandardAgentDescriptorForDomain } from '../../adapters/integration/public/standard-agent-interface.ts';
import { listWorkspaceBindings } from '../../authority/workspace/public/app-state.ts';
import { buildOplEndpoints } from '../../kernel/opl-runtime-endpoints.ts';
import {
  familyRuntimePaths,
  inspectFamilyRuntimeProviderWithLifecycle,
  readManagedProviderProjectionSummary,
  resolveFamilyRuntimeProviderKind,
} from '../../adapters/execution/public/app-state.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import { buildDeveloperModeLiveCloseoutEvidenceSummary } from './app-state-developer-mode-closeout.ts';
import { buildReleaseState } from './app-state-release.ts';
import { readOplWorkspaceRoot } from '../../kernel/system-preferences.ts';
import { readAppPackagePreferences, type AppPackagePreferences } from '../../kernel/app-package-preferences.ts';
import path from 'node:path';
import { buildActionCatalog } from './app-state-action-catalog.ts';
import { buildSettingsControlCenter } from './app-state-settings-control-center.ts';
import type { AppStateProfile } from './app-state-profile.ts';
import { buildOplAppOperatorViewModel } from './app-state-view-model.ts';
import { buildAppRuntimeWorkItemProjection } from './app-runtime-work-item-projection.ts';
import { projectRuntimeActivityItems } from './work-item-projection/runtime-activity-projection.ts';
import { selectAppStateCurrentOwnerDeltaReadModel } from './app-state-current-owner-delta.ts';
import { buildFoundryOperatorProjection } from './foundry-operator-projection.ts';
import { readCodexUserInstructions } from './codex-personalization.ts';
import {
  projectAppAgentPackageStatus,
  unavailableAgentPackageCanonicalFields,
} from './app-state-agent-packages.ts';
import type { CordisOwnerDeltaObserverService } from '../../authority/evidence/public/app-state.ts';
import { buildAppUiContributionsProjection } from './app-state-ui-contributions.ts';
import {
  compactFastActionCatalog,
  compactFastLegacyAgentPackageDirectory,
  compactFastLegacyAgentPackageStatus,
  compactFastManagedUpdateProjection,
  compactFastOperatorRuntimeProjection,
  compactFastProviderState,
  compactFastSettingsControlCenter,
} from './app-state-fast-projection.ts';
export { compactFastProviderState };

type AutomationProviderHostInspector = Readonly<{
  inspect(input: Readonly<{
    provider_id?: string;
    automation_kind?: 'computer_use' | 'browser_automation';
    runExternalChecks?: boolean;
  }>): Promise<Readonly<Record<string, unknown>>>;
}>;

function nowIso() {
  return new Date().toISOString();
}

export { parseAppStateArgs } from './app-state-profile.ts';

function publicRuntimeSourceCarriers(profile: AppStateProfile) {
  return buildOplModules({ profile })
    .modules
    .modules
    .filter((module) => module.default_install)
    .map((module) => ({
      package_id: canonicalAgentPackageId(module.module_id),
      carrier_id: module.module_id,
      label: module.label,
      scope: module.scope,
      description: module.description,
      default_carrier: module.default_install,
      source_present: module.installed,
      source_origin: module.install_origin,
      source_path: module.checkout_path,
      managed_source_path: module.managed_checkout_path,
      repo_url: module.repo_url,
      source_health_status: module.health_status,
      git: module.git,
      source_policy: module.source_policy,
      capabilities: module.capabilities,
    }));
}

function resolveModuleSource(items: ReturnType<typeof publicRuntimeSourceCarriers>) {
  const envOverride = items.find((entry) => entry.source_origin === 'env_override');
  if (envOverride) {
    return {
      mode: 'env_override',
      reason: 'module_path_env_override',
      repo_path: envOverride.source_path,
      runtime_sources_root: pathRootFromManagedCheckout(envOverride.managed_source_path),
    };
  }

  const sibling = items.find((entry) => entry.source_origin === 'sibling_workspace');
  if (sibling) {
    return {
      mode: 'developer_workspace',
      reason: 'developer_mode_prefers_local_sibling_checkouts',
      repo_path: sibling.source_path,
      runtime_sources_root: pathRootFromManagedCheckout(sibling.managed_source_path),
    };
  }

  const first = items[0];
  return {
    mode: 'managed_runtime',
    reason: 'opl_managed_runtime_sources_root',
    repo_path: null,
    runtime_sources_root: first ? pathRootFromManagedCheckout(first.managed_source_path) : null,
  };
}

function pathRootFromManagedCheckout(checkoutPath: string) {
  return path.dirname(checkoutPath);
}

function buildAssistants(items: ReturnType<typeof publicRuntimeSourceCarriers>) {
  return items.map((carrier) => ({
    assistant_id: carrier.package_id,
    label: carrier.label,
    description: carrier.description,
    launch_hint: 'direct_click',
    prompt_prefix_required: false,
    package_id: carrier.package_id,
  }));
}

type AgentPackageStatusReader = typeof runOplAgentPackageStatus;

function requestCachedAgentPackageStatusReader(readStatus: AgentPackageStatusReader): AgentPackageStatusReader {
  const cache = new Map<string,
    | { ok: true; value: ReturnType<AgentPackageStatusReader> }
    | { ok: false; error: unknown }>();
  return (input = {}) => {
    const key = JSON.stringify([
      input.packageId ?? null,
      input.detail ?? null,
    ]);
    const cached = cache.get(key);
    if (cached) {
      if (cached.ok) return cached.value;
      throw cached.error;
    }
    try {
      const status = readStatus(input);
      cache.set(key, { ok: true, value: status });
      return status;
    } catch (error) {
      cache.set(key, { ok: false, error });
      throw error;
    }
  };
}

function unavailableAgentPackageStatus(
  packageId: string,
  error: unknown,
): JsonRecord {
  const contractError = error instanceof FrameworkContractError ? error : null;
  return {
    ...unavailableAgentPackageCanonicalFields(packageId),
    surface_kind: 'opl_agent_package_status_unavailable',
    status: 'unavailable',
    installed_package_count: null,
    codex_visible: false,
    package_dependency_readiness: null,
    operational_ready: false,
    operational_ready_scope: 'installed_native_carrier_status',
    launch_allowed: false,
    launch_blocked_reason: 'package_status_read_failed',
    allowed_when_blocked: ['status', 'doctor', 'repair'],
    status_read_error: {
      code: contractError?.code ?? 'unexpected_error',
      message: error instanceof Error ? error.message : 'Unknown package status read failure.',
      details: contractError?.details ?? null,
    },
    detail_surface: `opl packages status --package-id ${packageId} --json`,
  };
}

export function buildAppAgentPackageStatuses(input: {
  packageIds: readonly string[];
  profile: AppStateProfile;
  readStatus?: AgentPackageStatusReader;
  appPreferences?: AppPackagePreferences;
}) {
  const readStatus = input.readStatus ?? runOplAgentPackageStatus;
  const statuses: Record<string, JsonRecord> = {};
  for (const packageId of input.packageIds) {
    try {
      const status = readStatus({
        packageId,
        detail: input.profile,
      }).opl_agent_package_status;
      statuses[packageId] = projectAppAgentPackageStatus({
        status,
        profile: input.profile,
      }) as unknown as JsonRecord;
    } catch (error) {
      statuses[packageId] = unavailableAgentPackageStatus(packageId, error);
    }
    statuses[packageId].app_enabled = input.appPreferences?.[packageId] !== false;
  }
  return statuses;
}

async function buildProviderState(profile: AppStateProfile) {
  const providerKind = resolveFamilyRuntimeProviderKind();
  const provider = await inspectFamilyRuntimeProviderWithLifecycle(
    providerKind,
    familyRuntimePaths(),
    {
      detail: profile,
      includeScheduler: true,
      managedProviderProjection: profile === 'fast'
        ? readManagedProviderProjectionSummary({ includeManifest: false })
        : readManagedProviderProjectionSummary(),
    },
  );
  return {
    selected_provider: providerKind,
    temporal: {
      required_for: 'full_opl_family_runtime_readiness',
      health_status: providerKind === 'temporal'
        ? provider.ready ? 'ready' : 'attention_needed'
        : 'not_selected',
      status: providerKind === 'temporal' ? provider.status : 'not_selected',
      ready: providerKind === 'temporal' ? provider.ready : false,
      degraded_reason: providerKind === 'temporal' ? provider.degraded_reason : 'temporal_not_selected',
      capabilities: providerKind === 'temporal' ? provider.capabilities : [],
      details: providerKind === 'temporal' ? provider.details : null,
      management: {
        owner_surface: 'opl app action execute',
        actions: [
          'provider_service_status',
          'provider_service_start',
          'provider_service_restart',
          'provider_service_stop',
          'provider_scheduler_status',
          'provider_scheduler_install',
          'provider_scheduler_trigger',
          'provider_worker_status',
          'provider_worker_start',
          'provider_worker_restart',
          'provider_worker_stop',
        ],
      },
    },
  };
}

function buildCoreState(profile: AppStateProfile) {
  const defaultProfile = readBundledCodexDefaultProfile();
  const localDefaults = readLocalCodexDefaultsIfAvailable();
  const codexAccess = readLocalCodexAccessState();
  const codex = resolveCodexVersion({ skipLatestLookup: profile === 'fast' });
  return {
    executor: {
      default_executor_id: 'codex_cli',
      default_executor_label: 'Codex CLI',
      visible_executors: [
        {
          executor_id: 'codex_cli',
          label: 'Codex CLI',
          default: true,
          permissions: 'full_auto',
        },
      ],
      selector_visible: false,
      permission_mode: 'full_auto',
    },
    codex: {
      ...codex,
      default_model: localDefaults?.model ?? defaultProfile.model,
      default_reasoning_effort: localDefaults?.reasoning_effort ?? defaultProfile.model_reasoning_effort,
      default_profile: defaultProfile,
      model_provider: localDefaults?.model_provider ?? defaultProfile.model_provider,
      provider_name: localDefaults?.provider_name ?? defaultProfile.provider_name,
      provider_base_url: localDefaults?.provider_base_url ?? defaultProfile.base_url,
      config_path: localDefaults?.config_path ?? null,
      api_key_present: Boolean(localDefaults?.provider_api_key),
      opl_gateway_configured: codexAccess.opl_gateway_configured,
      model_access_ready: codexAccess.model_access_ready,
      model_access_status: codexAccess.model_access_ready ? 'ready' : 'missing',
      model_access_source: codexAccess.model_access_source,
      codex_login_present: codexAccess.codex_login_present,
      env_api_key_present: codexAccess.env_api_key_present,
    },
  };
}

function buildUiDefaults() {
  const defaultProfile = readBundledCodexDefaultProfile();
  return {
    home_prompt:
      '把研究、基金和汇报交给 One Person Lab 自动推进',
    codex_model_label:
      `${defaultProfile.model}${defaultProfile.model_reasoning_effort ? ` ${defaultProfile.model_reasoning_effort}` : ''}`,
    theme_id: 'opl_codex',
    visible_theme_choices: ['opl_codex', 'default'],
  };
}

function fullRuntimeWorkbenchSummary(
  fullDrilldown: JsonRecord | null,
  operator: JsonRecord,
) {
  if (!fullDrilldown) {
    return {
      surface_kind: 'opl_app_state_runtime_workbench_summary',
      availability: 'lazy',
      source_surface: 'opl runtime app-operator-drilldown --detail full --json',
      authority_boundary: {
        opl: 'app_state_summary_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    };
  }
  const runtimeWorkbench = isRecord(operator.workbench) ? operator.workbench : null;
  const stageProgressSummary = isRecord(fullDrilldown.stage_progress_log)
    ? fullDrilldown.stage_progress_log
    : null;
  const effectiveCurrentContext = isRecord(fullDrilldown.effective_current_context)
    ? fullDrilldown.effective_current_context
    : {};
  const effectiveCurrentContextSummary = isRecord(effectiveCurrentContext.summary)
    ? effectiveCurrentContext.summary
    : {};
  const familyStallLineage = isRecord(fullDrilldown.family_stall_lineage)
    ? fullDrilldown.family_stall_lineage
    : {};
  const familyStallLineageSummary = isRecord(familyStallLineage.summary)
    ? familyStallLineage.summary
    : {};
  return {
    surface_kind: 'opl_app_state_runtime_workbench_summary',
    availability: runtimeWorkbench ? 'available' : 'unavailable',
    source_surface: 'opl runtime app-operator-drilldown --detail full --json',
    runtime_workbench: runtimeWorkbench
      ? {
          view_model_schema: runtimeWorkbench.view_model_schema,
          summary_cards: Array.isArray(runtimeWorkbench.summary_cards)
            ? runtimeWorkbench.summary_cards
            : [],
          action_queue_item_count:
            Array.isArray(isRecord(runtimeWorkbench.action_queue)
              ? runtimeWorkbench.action_queue.items
              : null)
            ? ((runtimeWorkbench.action_queue as JsonRecord).items as unknown[]).length
            : 0,
          domain_lane_count:
            Array.isArray(isRecord(runtimeWorkbench.domain_lane_map)
              ? runtimeWorkbench.domain_lane_map.lanes
              : null)
            ? ((runtimeWorkbench.domain_lane_map as JsonRecord).lanes as unknown[]).length
            : 0,
        }
      : null,
    stage_progress_log: {
      summary: stageProgressSummary,
      attempt_count: Number(stageProgressSummary?.attempt_count ?? 0),
      temporal_webui_ref_count: Number(stageProgressSummary?.temporal_webui_ref_count ?? 0),
      temporal_webui_refs: Array.isArray(stageProgressSummary?.temporal_webui_refs)
        ? stageProgressSummary.temporal_webui_refs
        : [],
      visual_ref_count: Array.isArray(stageProgressSummary?.attempt_refs)
        ? stageProgressSummary.attempt_refs.length
        : 0,
      temporal_stage_progress_ref_count: Number(stageProgressSummary?.temporal_webui_ref_count ?? 0),
      stage_progress_event_count: Number(stageProgressSummary?.activity_event_count ?? 0),
    },
    effective_current_context: {
      surface_kind: effectiveCurrentContext.surface_kind ?? 'opl_effective_current_context_packet',
      packet_version: effectiveCurrentContext.packet_version ?? 'effective_current_context.v1',
      context_count: Number(effectiveCurrentContextSummary.context_count ?? 0),
      running_attempt_count: Number(effectiveCurrentContextSummary.running_attempt_count ?? 0),
      latest_closeout_count: Number(effectiveCurrentContextSummary.latest_closeout_count ?? 0),
    },
    family_stall_lineage: {
      surface_kind: familyStallLineage.surface_kind ?? 'opl_family_stall_lineage',
      packet_version: familyStallLineage.packet_version ?? 'family-stall-lineage.v1',
      lineage_count: Number(familyStallLineageSummary.lineage_count ?? 0),
      repeated_lineage_count: Number(familyStallLineageSummary.repeated_lineage_count ?? 0),
      terminal_lineage_count: Number(familyStallLineageSummary.terminal_lineage_count ?? 0),
    },
    authority_boundary: {
      opl: 'app_state_summary_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

export async function buildOplAppState(input: {
  profile?: AppStateProfile;
  readAgentPackageStatus?: AgentPackageStatusReader;
  descriptorDiscovery?: Pick<CordisConnectDescriptorDiscoveryService, 'discover'>;
  automationProviderHost?: AutomationProviderHostInspector;
  ownerDeltaObserver: CordisOwnerDeltaObserverService;
}) {
  const startedAt = Date.now();
  const profile = input.profile ?? 'fast';
  const contracts = loadFrameworkContracts() as FrameworkContracts;
  const statePaths = ensureOplStateDir(resolveOplStatePaths());
  const storageOwnerInventory = readStorageOwnerInventorySnapshot();
  const runtimeSourceCarriers = publicRuntimeSourceCarriers(profile);
  const moduleSource = resolveModuleSource(runtimeSourceCarriers);
  const developerMode = {
    ...buildOplDeveloperModeSurface(buildOplEndpoints(), { detail: profile }),
    live_closeout_evidence: buildDeveloperModeLiveCloseoutEvidenceSummary(),
  };
  const developerProfile = {
    ...developerMode.developer_profile,
    capabilities: developerMode.capabilities,
  };
  const rawProvider = await buildProviderState(profile);
  const provider = profile === 'fast'
    ? compactFastProviderState(rawProvider as unknown as JsonRecord)
    : rawProvider;
  const release = buildReleaseState();
  const workspaceRoot = readOplWorkspaceRoot();
  const core = buildCoreState(profile);
  const managedUpdate = await buildManagedUpdateKernelProjection(
    contracts,
    { operation: 'status' },
    { allowExternalProbes: profile !== 'fast' },
  );
  const managedComputerUse = input.automationProviderHost
    ? await input.automationProviderHost.inspect({
      automation_kind: 'computer_use',
      runExternalChecks: profile === 'full',
    })
    : inspectManagedComputerUse({ runExternalChecks: profile === 'full' });
  const managedBrowserAutomation = input.automationProviderHost
    ? await input.automationProviderHost.inspect({
      automation_kind: 'browser_automation',
      runExternalChecks: profile === 'full',
    })
    : inspectManagedBrowserAutomation({ runExternalChecks: profile === 'full' });
  const rawActions = buildActionCatalog(contracts, {
    inspectExternalOwners: profile === 'full',
    descriptorDiscovery: input.descriptorDiscovery,
  });
  const actions = profile === 'fast'
    ? compactFastActionCatalog(rawActions as unknown as JsonRecord[])
    : rawActions;
  const readAgentPackageStatus = requestCachedAgentPackageStatusReader(
    input.readAgentPackageStatus ?? createOplAgentPackageStatusReader(),
  );
  const agentPackagesReadback = listOplAgentPackages({
    detail: profile,
  }).opl_agent_packages;
  const workspaceBindings = listWorkspaceBindings();
  const packageIds = [...new Set(
    agentPackagesReadback.directory.entries.map((entry) => entry.package_id),
  )];
  const appPreferences = readAppPackagePreferences();
  const agentPackageStatuses = buildAppAgentPackageStatuses({
    appPreferences,
    packageIds,
    profile,
    readStatus: readAgentPackageStatus,
  });
  const packageStatusFailures = Object.entries(agentPackageStatuses)
    .filter(([, status]) => status.status === 'unavailable')
    .map(([packageId, status]) => ({
      package_id: packageId,
      reason: 'package_status_read_failed',
      error: status.status_read_error,
      detail_surface: status.detail_surface,
    }));
  const agentPackagesProjection = {
    surface_kind: 'opl_app_agent_packages_projection',
    source: {
      list_surface: 'opl packages list --json',
      status_surface: 'opl packages status --package-id <package_id> --json',
    },
    directory: {
      ...agentPackagesReadback.directory,
      entries: agentPackagesReadback.directory.entries.map((entry) => ({
        ...entry,
        app_enabled: appPreferences[entry.package_id] !== false,
      })),
    },
    storage_inventory: compactStorageOwnerProjection(
      storageOwnerInventory.agent_package_store,
      'agent_package_store',
    ),
    status_index: {
      surface_kind: 'opl_agent_package_status_index',
      status: packageStatusFailures.length > 0 ? 'attention_required' : 'available',
      installed_package_count: agentPackagesReadback.installed_package_count,
      status_read_failure_count: packageStatusFailures.length,
      diagnostics: packageStatusFailures,
      packages: agentPackageStatuses,
      home_shortcut_preferences: agentPackagesReadback.home_shortcut_preferences.map((shortcut) => ({
        ...shortcut,
        visible: shortcut.visible && appPreferences[shortcut.package_id] !== false,
      })),
      files: {
        home_shortcut_preferences_file: agentPackagesReadback.files.home_shortcut_preferences_file,
        app_package_preferences_file: statePaths.app_package_preferences_file,
      },
      authority_boundary: agentPackagesReadback.authority_boundary,
    },
  };
  const uiContributions = buildAppUiContributionsProjection(agentPackageStatuses);
  const uiDefaults = buildUiDefaults();
  const workItemProjectionV2 = buildAppRuntimeWorkItemProjection({
    profile,
    packageProjectionItems: runtimeSourceCarriers,
    packageStatusById: agentPackageStatuses,
    bindings: workspaceBindings,
    resolveDescriptor: (agentId) => readInstalledStandardAgentDescriptorForDomain(
      agentId,
      (statusInput = {}) => readAgentPackageStatus({ ...statusInput, detail: profile }),
    ),
  });
  const runtimeActivityItems = profile === 'full'
    ? projectRuntimeActivityItems(workItemProjectionV2)
    : [];
  const fullRuntimeDrilldown = profile === 'full'
    ? (await (await import('./runtime-tray-snapshot.ts')).buildRuntimeTraySnapshot(contracts, {
        appOperatorDrilldownDetailLevel: 'full',
        ownerDeltaObserver: input.ownerDeltaObserver,
      })).runtime_tray_snapshot.app_operator_drilldown as JsonRecord
    : null;
  const currentOwnerDeltaReadModel = selectAppStateCurrentOwnerDeltaReadModel({
    fullRuntimeDrilldown,
    runtimeActivityItems,
    statePaths,
  });
  const foundry = await buildFoundryOperatorProjection({ profile });
  const paths = {
    home_dir: statePaths.home_dir,
    state_dir: statePaths.state_dir,
    runtime_sources_root: moduleSource.runtime_sources_root,
    family_workspace_root: {
      selected_path: resolveDefaultFamilyWorkspaceRoot(),
      source: process.env.OPL_FAMILY_WORKSPACE_ROOT?.trim()
        ? 'env'
        : profile === 'fast'
          ? 'repo_sibling_discovery_fast'
          : 'repo_sibling_discovery',
      role: 'developer_mode_module_checkout_discovery_root',
    },
    workspace_root: workspaceRoot,
    workspace_root_path: workspaceRoot.selected_path,
    update_channel_file: statePaths.update_channel_file,
    developer_supervisor_config_file: statePaths.developer_supervisor_config_file,
    logs_dir: `${statePaths.state_dir}/logs`,
  };
  const runtimeSourceCarriersState = {
    surface_kind: 'opl_runtime_source_carriers_projection',
    source: moduleSource,
    summary: {
      default_carriers_count: runtimeSourceCarriers.length,
      present_default_carriers_count: runtimeSourceCarriers.filter((entry) => entry.source_present).length,
      healthy_default_carriers_count: runtimeSourceCarriers.filter((entry) => entry.source_health_status === 'ready').length,
    },
    items: runtimeSourceCarriers,
    authority_boundary: {
      package_installation_truth: 'app_state.agent_packages.status_index',
      source_carrier_presence_is_package_installed: false,
      lifecycle_owner: 'opl_packages',
    },
  };
  const rawSettingsControlCenter = buildSettingsControlCenter({
    profile,
    core,
    developerMode,
    modules: runtimeSourceCarriersState,
    agentPackages: agentPackagesProjection,
    provider,
    release,
    paths,
    storageOwnerInventory: storageOwnerInventory as unknown as JsonRecord,
  });
  const settingsControlCenter = profile === 'fast'
    ? compactFastSettingsControlCenter(rawSettingsControlCenter)
    : rawSettingsControlCenter;
  const rawOperator = buildOplAppOperatorViewModel({
    profile,
    core,
    developerMode,
    modules: runtimeSourceCarriersState,
    provider,
    release,
    paths,
    actions,
    settingsControlCenter,
    uiDefaults,
    runtimeActivityItems,
    workItemProjectionV2,
    brandSystemProfile: contracts.brandSystemProfile as unknown as JsonRecord,
    targetOperatingArchitecture: contracts.targetOperatingArchitecture as unknown as JsonRecord,
    currentOwnerDeltaReadModel,
    ownerDeltaObserver: input.ownerDeltaObserver,
    foundry,
  });
  const operator = profile === 'fast'
    ? compactFastOperatorRuntimeProjection(rawOperator)
    : rawOperator;

  return {
    version: 'g2',
    app_state: {
      schema_version: 'opl_app_state.v1',
      surface_kind: 'opl_app_state.v1',
      meta: {
        profile,
        generated_at: nowIso(),
        elapsed_ms: Date.now() - startedAt,
        read_policy: profile === 'fast'
          ? 'bounded_local_read_no_network_no_repair'
          : 'bounded_local_read_full_detail_no_mutation',
      },
      runtime_source: {
        owner: 'one-person-lab',
        cli_surface: 'opl app state',
        action_surface: 'opl app action execute',
        app_repo_truth_owner: 'one-person-lab-app',
        producer_role: 'gui_ready_state_action_producer_only',
        normal_gui_state_surface: 'opl app state --profile fast --json',
        full_gui_state_surface: 'opl app state --profile full --json',
        action_boundary_surface: 'opl app action execute --json',
        full_drilldown_exception_surface: 'opl runtime app-operator-drilldown --detail full --json',
        shell_must_not_use_full_drilldown_as_normal_state: true,
      },
      core,
      codex_personalization: {
        surface_kind: 'opl_codex_personalization.v1',
        user_agents: readCodexUserInstructions(),
        opl_flow_default_user_agents: readOplFlowDefaultUserInstructions(),
        authority_boundary: {
          user_agents_owner: 'user_codex_home',
          app_edit_action: 'codex_user_instructions_set',
          app_restore_action: 'codex_user_instructions_restore_opl_flow_default',
          opl_flow_role: 'install_and_semantically_merge_user_profile_only',
          opl_app_session_context_owner: 'one-person-lab-app',
        },
      },
      developer_profile: developerProfile,
      developer_mode: developerMode,
      runtime_source_carriers: runtimeSourceCarriersState,
      managed_update: profile === 'fast'
        ? compactFastManagedUpdateProjection(managedUpdate)
        : managedUpdate.managed_update,
      agent_packages: agentPackagesProjection,
      ui_contributions: uiContributions,
      managed_companions: [managedBrowserAutomation, managedComputerUse],
      opl_agent_packages: profile === 'fast'
        ? compactFastLegacyAgentPackageDirectory(agentPackagesReadback)
        : agentPackagesReadback,
      opl_agent_package_status: profile === 'fast'
        ? compactFastLegacyAgentPackageStatus(agentPackagesProjection.status_index)
        : agentPackagesProjection.status_index,
      provider,
      assistants: {
        default_launch: 'direct_click',
        prompt_prefix_required: false,
        items: buildAssistants(runtimeSourceCarriers),
      },
      release,
      settings_control_center: settingsControlCenter,
      operator,
      foundry,
      runtime_workbench: fullRuntimeWorkbenchSummary(fullRuntimeDrilldown, operator),
      paths,
      actions,
      ui_defaults: uiDefaults,
      opl_agent_codex_context: {
        source: 'one-person-lab-app/product_profile',
        contract_ref: 'one-person-lab-app/contracts/app-gui-product-contract.json#pages.settings_system',
        policy: 'app_repo_owns_gui_context_text',
      },
    },
  };
}
